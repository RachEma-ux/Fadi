/**
 * Temps réel — routes HTTP des sessions en direct (RTC-1, Issue #283, RT-D5). Monté sous
 * `/projects/:projectId/temps-reel`. Tout ce qui est durable passe ici (le canal n'annonce que des faits enregistrés) :
 *
 *   GET  /sessions[?variantId=…][&toutes=1]  sessions (ouvertes par défaut) et personnes connectées
 *   POST /sessions                           ouvrir une session sur une révision Studio (idempotent par requestId)
 *   GET  /sessions/:sessionId                détail, journal et personnes connectées
 *   POST /sessions/:sessionId/presentateur   désigner le présentateur (hôte)
 *   POST /sessions/:sessionId/hote           transmettre l'animation (hôte)
 *   POST /sessions/:sessionId/reprendre      reprendre l'animation, hôte absent (propriétaire, responsables)
 *   POST /sessions/:sessionId/revision       changer la révision affichée (hôte, session de travail)
 *   POST /sessions/:sessionId/clore          clore (hôte, propriétaire, responsables)
 *
 * Chaque route exige le droit `comment` sur le projet (propriétaire, éditeurs, lecteurs ; jamais l'accès support) et
 * répond 404 tant que le drapeau `FADI_TEMPS_REEL` n'est pas posé (sauf la liste des sessions : 200 `{ actif: false }`). L'hôte n'obtient aucun droit sur le projet (RT-R2).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";
import { projectOr404 } from "../lib/owned-project.js";
import { dependancesServeur, hubTempsReel } from "../lib/temps-reel-canal.js";
import type { EvenementDurable } from "../lib/temps-reel-protocole.js";
import {
  changerRevision, clore, designerPresentateur, journalSession, lireSession, listerSessions, nomsDe, ouvrirSession, reprendreAnimation,
  sessionPublique, tempsReelActif, TempsReelErreur, transmettreHote, type SessionRow,
} from "../lib/temps-reel-sessions.js";

export const tempsReelRouter = Router({ mergeParams: true });

tempsReelRouter.use(requireAuth);
tempsReelRouter.use((req, res, next) => {
  if (tempsReelActif()) { next(); return; }
  // Drapeau absent : la liste des sessions, que l'espace de travail Studio lit à l'ouverture, répond « inactif » (200, sans
  // aucune donnée, identique pour tout projet) plutôt qu'une 404 que le navigateur consigne comme erreur ; tout le reste 404.
  if (req.method === "GET" && req.path === "/sessions") { res.json({ actif: false, sessions: [] }); return; }
  res.status(404).json({ error: "temps_reel_desactive" });
});

const identifiant = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
const ouverture = z.object({ studyId: identifiant, variantId: identifiant, revisionId: identifiant.optional(), titre: z.string().max(120).optional(), requestId: identifiant }).strict();
const personne = z.object({ userId: identifiant }).strict();
const presentateur = z.object({ userId: identifiant.nullable() }).strict();
const revision = z.object({ revisionId: identifiant }).strict();

type Gestionnaire = (req: Request, res: Response, projectId: string, userId: string) => Promise<void>;
/** Droit `comment` relu, drapeau actif, erreurs métier rendues avec leur motif ; jamais de trace interne. */
function route(g: Gestionnaire) {
  return async (req: Request, res: Response) => {
    const access = await projectOr404(req, res, "comment");
    if (!access) return;
    try {
      await g(req, res, access.id, req.user!.id);
    } catch (e) {
      if (e instanceof TempsReelErreur) { res.status(e.status).json({ error: e.code, message: e.message }); return; }
      throw e;
    }
  };
}

async function vueSession(s: SessionRow) {
  const etat = hubTempsReel()?.etat(s.id) ?? { connectes: [], hoteAbsentDepuisMs: null };
  const noms = await nomsDe([s.hostId, ...(s.presenterId ? [s.presenterId] : []), ...etat.connectes]);
  return {
    ...sessionPublique(s),
    hote: { userId: s.hostId, nom: noms.get(s.hostId) ?? "" },
    presentateur: s.presenterId ? { userId: s.presenterId, nom: noms.get(s.presenterId) ?? "" } : null,
    connectes: etat.connectes.map((userId) => ({ userId, nom: noms.get(userId) ?? "" })),
    hoteAbsent: s.status === "ouverte" && etat.hoteAbsentDepuisMs !== null,
  };
}

const peutRejoindre = (projectId: string) => async (userId: string) => (await dependancesServeur.verifierAcces(projectId, userId)) !== null;
const annoncer = async (s: SessionRow, e: EvenementDurable) => { await hubTempsReel()?.sessionModifiee(s.id, e); };
const parametre = (req: Request, nom: string) => (req.params as Record<string, string>)[nom] ?? "";

tempsReelRouter.get("/sessions", route(async (req, res, projectId) => {
  const variantId = typeof req.query["variantId"] === "string" ? req.query["variantId"] : undefined;
  const sessions = await listerSessions(projectId, { variantId, ouvertes: req.query["toutes"] !== "1" });
  res.json({ sessions: await Promise.all(sessions.map(vueSession)) });
}));

tempsReelRouter.post("/sessions", route(async (req, res, projectId, userId) => {
  const corps = ouverture.safeParse(req.body);
  if (!corps.success) { res.status(422).json({ error: "invalid_body", message: "Étude, variante et identifiant de requête attendus." }); return; }
  const { session, rejoue } = await ouvrirSession(projectId, userId, corps.data);
  res.status(rejoue ? 200 : 201).json({ session: await vueSession(session), rejoue });
}));

tempsReelRouter.get("/sessions/:sessionId", route(async (req, res, projectId) => {
  const s = await lireSession(db, projectId, parametre(req, "sessionId"));
  if (!s) { res.status(404).json({ error: "not_found" }); return; }
  const journal = await journalSession(s.id);
  const noms = await nomsDe(journal.flatMap((e) => [e.actorId, e.targetId].filter((x): x is string => !!x)));
  res.json({
    session: await vueSession(s),
    journal: journal.map((e) => ({ ...e, createdAt: e.createdAt.toISOString(), acteur: e.actorId ? noms.get(e.actorId) ?? "" : null, cible: e.targetId ? noms.get(e.targetId) ?? "" : null })),
  });
}));

tempsReelRouter.post("/sessions/:sessionId/presentateur", route(async (req, res, projectId, userId) => {
  const corps = presentateur.safeParse(req.body);
  if (!corps.success) { res.status(422).json({ error: "invalid_body", message: "Personne attendue (ou null)." }); return; }
  const s = await designerPresentateur(projectId, parametre(req, "sessionId"), userId, corps.data.userId, peutRejoindre(projectId));
  await annoncer(s, { nature: "presentateur", presentateurId: s.presenterId, par: userId });
  res.json({ session: await vueSession(s) });
}));

tempsReelRouter.post("/sessions/:sessionId/hote", route(async (req, res, projectId, userId) => {
  const corps = personne.safeParse(req.body);
  if (!corps.success) { res.status(422).json({ error: "invalid_body", message: "Personne attendue." }); return; }
  const s = await transmettreHote(projectId, parametre(req, "sessionId"), userId, corps.data.userId, peutRejoindre(projectId));
  await annoncer(s, { nature: "hote", hoteId: s.hostId, par: userId, reprise: false });
  res.json({ session: await vueSession(s) });
}));

tempsReelRouter.post("/sessions/:sessionId/reprendre", route(async (req, res, projectId, userId) => {
  const sessionId = parametre(req, "sessionId");
  const absence = hubTempsReel()?.etat(sessionId).hoteAbsentDepuisMs ?? null;
  const s = await reprendreAnimation(projectId, sessionId, userId, absence);
  await annoncer(s, { nature: "hote", hoteId: s.hostId, par: userId, reprise: true });
  res.json({ session: await vueSession(s) });
}));

tempsReelRouter.post("/sessions/:sessionId/revision", route(async (req, res, projectId, userId) => {
  const corps = revision.safeParse(req.body);
  if (!corps.success) { res.status(422).json({ error: "invalid_body", message: "Révision attendue." }); return; }
  const s = await changerRevision(projectId, parametre(req, "sessionId"), userId, corps.data.revisionId);
  await annoncer(s, { nature: "revision-session", revisionId: s.revisionId, par: userId });
  res.json({ session: await vueSession(s) });
}));

tempsReelRouter.post("/sessions/:sessionId/clore", route(async (req, res, projectId, userId) => {
  const s = await clore(projectId, parametre(req, "sessionId"), userId);
  await annoncer(s, { nature: "session-close", statut: "close", par: userId });
  res.json({ session: await vueSession(s) });
}));

