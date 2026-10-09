/**
 * Automatisation et assistant à boucle contrôlée de l'Atelier (lot 8, D4, T19). Monté sous
 * `/projects/:projectId/atelier` :
 *
 * - `GET /scripts`, `POST /scripts`, `GET /scripts/:id/versions` : bibliothèque (scripts intégrés + scripts du projet,
 *   versionnés, immuables) ;
 * - `POST /scripts/:id/essai`, `POST /scripts/:id/executer` : le script est développé en commandes ordinaires, puis
 *   essayé à blanc ou validé par le même cœur transactionnel que `POST /commands` (mêmes droits, mêmes refus) ;
 * - `POST /assistant/propositions` (boucle contrôlée : proposer → essai → corriger ≤ 3 fois ; rien n'est écrit dans
 *   le modèle), `GET /assistant/propositions`, `POST …/:id/accepter` (accord explicite → exécution validée),
 *   `POST …/:id/refuser` ;
 * - `GET /graphes` (graphes de génération intégrés + définitions `graphe` du modèle, P2-8), `POST /graphes/:id/proposer` :
 *   le graphe est compilé en script, ses règles contrôlées, puis la **même boucle contrôlée** produit une proposition
 *   (essai à blanc, journal, aperçu) acceptée ou refusée par les routes de l'assistant ; rien n'est écrit ici.
 * Les scripts et l'assistant héritent des droits de l'utilisateur ; aucun accès direct aux tables du modèle.
 */
import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  CONTRAT_COMMANDES,
  ErreurCommande,
  ErreurScript,
  GRAPHES_INTEGRES,
  graphesDuProjet,
  grapheDe,
  proposerGraphe,
  SCRIPTS_INTEGRES,
  VERSION_REGLES,
  appliquerLot,
  boucleControlee,
  cleCache,
  developperScript,
  generateurRegles,
  validerScript,
  type Commande,
  type Enveloppe,
  type HypotheseProposition,
  type ScriptAtelier,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { atelierPropositions, atelierScripts, projects } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { traiterEvenements } from "../lib/atelier-events.js";
import { chargerModele, creerModeleVide } from "../lib/atelier-modele.js";
import { EchecLot, validerDansTransaction } from "../lib/atelier-validation.js";
import { loadDesignContext } from "../lib/design-context.js";
import { documentCatalogue } from "../lib/documents.js";
import { projectOr404, type AccessibleProject } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";

export const atelierAutomatisationRouter = Router({ mergeParams: true });
atelierAutomatisationRouter.use(requireAuth);

const invalide = (res: Response, chemin: string, message: string) => res.status(400).json({ erreur: "invalide", details: [{ chemin, message }] });
const refusCommande = (res: Response, err: ErreurCommande, revision: number) =>
  err.code === "precondition"
    ? res.status(409).json({ erreur: "conflit", motif: "precondition", revisionCourante: revision, conflits: [{ chemin: err.chemin, motif: err.message }] })
    : res.status(400).json({ erreur: "invalide", details: [{ chemin: err.chemin, message: err.message }] });

/** Documents produits aujourd'hui à jour, qui deviendraient périmés après l'exécution (aperçu de la boucle). */
async function documentsARecalculer(project: AccessibleProject): Promise<{ kind: string; label: string }[]> {
  const dctx = await loadDesignContext(db, project, new Date().toISOString());
  return (await documentCatalogue(db, project, dctx)).filter((d) => d.freshness === "a-jour").map((d) => ({ kind: d.kind, label: d.label }));
}

// ---------------------------------------------------------------------------
// Bibliothèque de scripts
// ---------------------------------------------------------------------------

async function scriptsDuProjet(projectId: string): Promise<Map<string, { courant: ScriptAtelier; versions: number }>> {
  const rows = await db.select().from(atelierScripts).where(eq(atelierScripts.projectId, projectId)).orderBy(atelierScripts.scriptId, atelierScripts.version);
  const out = new Map<string, { courant: ScriptAtelier; versions: number }>();
  for (const r of rows) out.set(r.scriptId, { courant: r.contenu as unknown as ScriptAtelier, versions: r.version });
  return out;
}

async function scriptDe(projectId: string, id: string, version?: number): Promise<ScriptAtelier | null> {
  const integre = SCRIPTS_INTEGRES.find((s) => s.id === id);
  if (integre) return version === undefined || version === integre.version ? integre : null;
  const rows = await db.select().from(atelierScripts).where(and(eq(atelierScripts.projectId, projectId), eq(atelierScripts.scriptId, id))).orderBy(desc(atelierScripts.version));
  const r = version === undefined ? rows[0] : rows.find((x) => x.version === version);
  return r ? (r.contenu as unknown as ScriptAtelier) : null;
}

atelierAutomatisationRouter.get("/scripts", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const projet = await scriptsDuProjet(project.id);
  res.json({
    integres: SCRIPTS_INTEGRES.map((s) => ({ ...s, origine: "integre" })),
    projet: [...projet.values()].map((v) => ({ ...v.courant, origine: "projet", versions: v.versions })),
  });
});

atelierAutomatisationRouter.post("/scripts", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  let script: ScriptAtelier;
  try {
    script = validerScript((req.body as { script?: unknown } | undefined)?.script);
  } catch (err) {
    if (err instanceof ErreurScript) return void invalide(res, err.chemin, err.message);
    throw err;
  }
  if (SCRIPTS_INTEGRES.some((s) => s.id === script.id)) return void res.status(409).json({ erreur: "conflit", details: [{ chemin: "id", message: "identifiant réservé à un script intégré" }] });
  const cree = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const dernier = (await tx.select({ v: atelierScripts.version }).from(atelierScripts).where(and(eq(atelierScripts.projectId, project.id), eq(atelierScripts.scriptId, script.id))).orderBy(desc(atelierScripts.version)).limit(1))[0];
    const version = (dernier?.v ?? 0) + 1;
    const contenu = { ...script, version };
    await tx.insert(atelierScripts).values({ projectId: project.id, scriptId: script.id, version, contenu: contenu as unknown as Record<string, unknown>, authorId: req.user!.id, createdAt: new Date() });
    return contenu;
  });
  res.status(201).json(cree);
});

atelierAutomatisationRouter.get("/scripts/:scriptId/versions", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db.select({ version: atelierScripts.version, createdAt: atelierScripts.createdAt, contenu: atelierScripts.contenu }).from(atelierScripts).where(and(eq(atelierScripts.projectId, project.id), eq(atelierScripts.scriptId, req.params["scriptId"] as string))).orderBy(desc(atelierScripts.version));
  if (!rows.length) return void res.status(404).json({ erreur: "script-inconnu" });
  res.json({ versions: rows.map((r) => ({ version: r.version, createdAt: r.createdAt.toISOString(), script: r.contenu })) });
});

const executionSchema = z.object({ parametres: z.record(z.string(), z.unknown()).default({}), version: z.number().int().min(1).optional() });

async function developper(project: AccessibleProject, req: { params: Record<string, string>; body: unknown }, res: Response): Promise<{ script: ScriptAtelier; commandes: Commande[] } | null> {
  const p = executionSchema.safeParse(req.body ?? {});
  if (!p.success) return (invalide(res, "body", "parametres (objet) et version (entier) attendus"), null);
  const script = await scriptDe(project.id, req.params["scriptId"]!, p.data.version);
  if (!script) return (res.status(404).json({ erreur: "script-inconnu" }), null);
  const etat = (await chargerModele(db, project.id))?.etat;
  if (!etat) return (res.status(404).json({ erreur: "aucun-modele" }), null);
  try {
    return { script, commandes: developperScript(script, etat, p.data.parametres) };
  } catch (err) {
    if (err instanceof ErreurScript) return (invalide(res, err.chemin, err.message), null);
    throw err;
  }
}

atelierAutomatisationRouter.post("/scripts/:scriptId/essai", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const d = await developper(project, req as never, res);
  if (!d) return;
  const etat = (await chargerModele(db, project.id))!.etat;
  try {
    const r = appliquerLot(etat, { requestId: "script-essai", baseRevision: project.modelRevision, contract: CONTRAT_COMMANDES, label: d.script.nom, commands: d.commandes });
    res.json({ script: { id: d.script.id, nom: d.script.nom, version: d.script.version }, revision: project.modelRevision, commandes: d.commandes, effets: r.effets, documentsARecalculer: await documentsARecalculer(project) });
  } catch (err) {
    if (err instanceof ErreurCommande) return void refusCommande(res, err, project.modelRevision);
    throw err;
  }
});

const executerSchema = z.object({ requestId: z.string().min(1).max(64), baseRevision: z.number().int().min(0) });

atelierAutomatisationRouter.post("/scripts/:scriptId/executer", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const e = executerSchema.safeParse(req.body ?? {});
  if (!e.success) return void invalide(res, "body", "requestId et baseRevision requis");
  const d = await developper(project, req as never, res);
  if (!d) return;
  const label = `Script « ${d.script.nom} » v${d.script.version}`.slice(0, 200);
  const enveloppe: Enveloppe = { requestId: e.data.requestId, baseRevision: e.data.baseRevision, contract: CONTRAT_COMMANDES, label, commands: d.commandes };
  try {
    const r = await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      return validerDansTransaction(tx, project.id, req.user!.id, enveloppe, "commande", null, label);
    });
    if (r.status === 200) void traiterEvenements(project.id).catch(() => undefined);
    res.status(r.status).json({ ...r.reponse, script: { id: d.script.id, nom: d.script.nom, version: d.script.version } });
  } catch (err) {
    if (err instanceof EchecLot) return void res.status(err.resultat.status).json(err.resultat.reponse);
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Assistant à boucle contrôlée
// ---------------------------------------------------------------------------

const propositionSchema = z.object({ intention: z.string().trim().min(2).max(300), niveauId: z.string().max(200).nullable().optional() });

const versJson = (r: typeof atelierPropositions.$inferSelect) => ({
  id: r.id,
  intention: r.intention,
  generateur: r.generateur,
  regle: r.regle,
  explication: r.explication,
  commandes: r.commandes,
  hypotheses: r.hypotheses,
  iterations: r.iterations,
  effets: r.effets,
  statut: r.statut,
  depuisCache: r.depuisCache,
  revisionBase: r.revisionBase,
  revisionResultat: r.revisionResultat,
  createdAt: r.createdAt.toISOString(),
  decidedAt: r.decidedAt?.toISOString() ?? null,
});

atelierAutomatisationRouter.post("/assistant/propositions", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = propositionSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "intention", "intention de 2 à 300 caractères");
  const charge = (await chargerModele(db, project.id)) ?? (await db.transaction((tx) => creerModeleVide(tx, project.id, `fadi-${project.id}`)));
  // Réserves du bilan Harmonie du bâtiment conçu (calculées ici, à la révision courante) : données de la règle « réserves ».
  const dctx = await loadDesignContext(db, project, new Date().toISOString());
  const contexte = { niveauId: p.data.niveauId ?? null, reserves: dctx.analysis.issues.map((i) => ({ id: i.id, priority: i.priority, title: i.title, refs: i.refs, step: i.step })) };
  const cle = cleCache(p.data.intention, contexte);
  // Cache : dernière séquence acceptée pour la même clé (intention normalisée + version des règles), réessayée telle quelle.
  const enCache = (await db.select().from(atelierPropositions).where(and(eq(atelierPropositions.projectId, project.id), eq(atelierPropositions.cle, cle), eq(atelierPropositions.statut, "acceptee"))).orderBy(desc(atelierPropositions.createdAt)).limit(1))[0];
  const proposition = boucleControlee(charge.etat, p.data.intention, generateurRegles, contexte, enCache ? { commandes: enCache.commandes as Commande[], hypotheses: enCache.hypotheses as HypotheseProposition[], regle: enCache.regle ?? "", explication: enCache.explication } : null);
  const row = {
    id: randomUUID(),
    projectId: project.id,
    intention: p.data.intention,
    cle,
    generateur: proposition.generateur,
    regle: proposition.regle,
    explication: proposition.explication,
    commandes: proposition.commandes as unknown[],
    hypotheses: proposition.hypotheses as unknown[],
    iterations: proposition.iterations as unknown[],
    effets: proposition.effets as unknown as Record<string, unknown> | null,
    statut: proposition.statut,
    depuisCache: proposition.depuisCache,
    revisionBase: project.modelRevision,
    revisionResultat: null,
    authorId: req.user!.id,
    createdAt: new Date(),
    decidedAt: null,
  };
  await db.insert(atelierPropositions).values(row);
  const docs = proposition.statut === "proposee" && proposition.commandes.length ? await documentsARecalculer(project) : [];
  res.status(201).json({ ...versJson(row), documentsARecalculer: docs, fournisseur: null, regles: VERSION_REGLES });
});

// ---------------------------------------------------------------------------
// Graphes de génération contrôlée (P2-8, DA-19-03 à 05)
// ---------------------------------------------------------------------------

atelierAutomatisationRouter.get("/graphes", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const etat = (await chargerModele(db, project.id))?.etat;
  res.json({
    integres: GRAPHES_INTEGRES.map((g) => ({ ...g, origine: "integre" })),
    projet: etat ? graphesDuProjet(etat).map((g) => ({ ...g, origine: "projet" })) : [],
    regles: VERSION_REGLES,
  });
});

const propositionGrapheSchema = z.object({ parametres: z.record(z.string(), z.unknown()).default({}), niveauId: z.string().max(200).nullable().optional() });

atelierAutomatisationRouter.post("/graphes/:grapheId/proposer", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = propositionGrapheSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "body", "parametres (objet) et niveauId attendus");
  const charge = (await chargerModele(db, project.id)) ?? (await db.transaction((tx) => creerModeleVide(tx, project.id, `fadi-${project.id}`)));
  const graphe = grapheDe(charge.etat, req.params["grapheId"] as string);
  if (!graphe) return void res.status(404).json({ erreur: "graphe-inconnu" });
  const proposition = proposerGraphe(graphe, charge.etat, p.data.parametres, p.data.niveauId ?? null);
  const row = {
    id: randomUUID(),
    projectId: project.id,
    intention: proposition.intention,
    cle: proposition.cle,
    generateur: proposition.generateur,
    regle: proposition.regle,
    explication: proposition.explication,
    commandes: proposition.commandes as unknown[],
    hypotheses: proposition.hypotheses as unknown[],
    iterations: proposition.iterations as unknown[],
    effets: proposition.effets as unknown as Record<string, unknown> | null,
    statut: proposition.statut,
    depuisCache: proposition.depuisCache,
    revisionBase: project.modelRevision,
    revisionResultat: null,
    authorId: req.user!.id,
    createdAt: new Date(),
    decidedAt: null,
  };
  await db.insert(atelierPropositions).values(row);
  const docs = proposition.statut === "proposee" && proposition.commandes.length ? await documentsARecalculer(project) : [];
  res.status(201).json({ ...versJson(row), documentsARecalculer: docs, graphe: { id: graphe.id, nom: graphe.nom, version: graphe.version } });
});

atelierAutomatisationRouter.get("/assistant/propositions", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db.select().from(atelierPropositions).where(eq(atelierPropositions.projectId, project.id)).orderBy(desc(atelierPropositions.createdAt)).limit(30);
  res.json({ propositions: rows.map(versJson), fournisseur: null, regles: VERSION_REGLES });
});

async function propositionDe(projectId: string, id: string) {
  return (await db.select().from(atelierPropositions).where(and(eq(atelierPropositions.projectId, projectId), eq(atelierPropositions.id, id))).limit(1))[0];
}

atelierAutomatisationRouter.post("/assistant/propositions/:propositionId/accepter", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const e = executerSchema.safeParse(req.body ?? {});
  if (!e.success) return void invalide(res, "body", "requestId et baseRevision requis");
  const prop = await propositionDe(project.id, req.params["propositionId"] as string);
  if (!prop) return void res.status(404).json({ erreur: "proposition-inconnue" });
  if (prop.statut !== "proposee") return void res.status(409).json({ erreur: "conflit", motif: "statut", message: `Proposition ${prop.statut === "acceptee" ? "déjà acceptée" : prop.statut === "refusee" ? "refusée" : "non exécutable"}.` });
  if (!(prop.commandes as unknown[]).length) return void res.status(409).json({ erreur: "conflit", motif: "vide", message: "Rien à exécuter." });
  const label = `Assistant : ${prop.intention}`.slice(0, 200);
  const enveloppe: Enveloppe = { requestId: e.data.requestId, baseRevision: e.data.baseRevision, contract: CONTRAT_COMMANDES, label, commands: prop.commandes as Commande[] };
  try {
    const r = await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const v = await validerDansTransaction(tx, project.id, req.user!.id, enveloppe, "commande", null, label);
      if (v.status === 200) await tx.update(atelierPropositions).set({ statut: "acceptee", revisionResultat: v.revision, decidedAt: new Date() }).where(eq(atelierPropositions.id, prop.id));
      return v;
    });
    if (r.status === 200) void traiterEvenements(project.id).catch(() => undefined);
    res.status(r.status).json({ ...r.reponse, proposition: prop.id });
  } catch (err) {
    if (err instanceof EchecLot) return void res.status(err.resultat.status).json(err.resultat.reponse);
    throw err;
  }
});

atelierAutomatisationRouter.post("/assistant/propositions/:propositionId/refuser", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const prop = await propositionDe(project.id, req.params["propositionId"] as string);
  if (!prop) return void res.status(404).json({ erreur: "proposition-inconnue" });
  if (prop.statut !== "proposee") return void res.status(409).json({ erreur: "conflit", motif: "statut" });
  await db.update(atelierPropositions).set({ statut: "refusee", decidedAt: new Date() }).where(eq(atelierPropositions.id, prop.id));
  const revision = (await db.select({ r: projects.modelRevision }).from(projects).where(eq(projects.id, project.id)))[0]!.r;
  res.json({ statut: "refusee", revision });
});
