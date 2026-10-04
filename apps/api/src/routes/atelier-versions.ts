/**
 * Versions, variantes, publications, verrous fins et collisions de l'Atelier (lot 7). Monté sous
 * `/projects/:projectId/atelier` :
 *
 * - `GET /versions`, `POST /versions`, `GET /versions/:id`, `POST /versions/:id/restaurer` : versions nommées
 *   (instantanés immuables) ; restaurer = un lot `interne.restaurer` vers l'instantané, nouvelle révision ;
 * - `GET /comparer?de=&a=` : différences entre deux états (`courante`, `r:<révision>`, `v:<version>`) ;
 * - `GET /variantes`, `POST /variantes` (bifurcation : copie intégrale reliée au tronc), `GET /variantes/:id/fusion`
 *   (essai : objets affectés, conflits, rejeu à blanc), `POST /variantes/:id/fusion` (rejeu validé, lot par lot,
 *   dans une transaction, conflits refusés sauf stratégie « variante prioritaire ») ;
 * - `GET /publications`, `POST /publications`, `GET /publications/:id`, `GET /publications/:id/fichiers/:volume`,
 *   `POST /publications/:id/restaurer` : publications figées (version, catalogues, documents en volumes) ;
 * - `GET /verrous`, `POST /verrous`, `DELETE /verrous/:cle` : verrous logiques fins (objet ou `niveau:<id>`) ;
 * - `GET /collisions` : contrôles d'architecture du modèle courant ;
 * - `GET /objets/:id/historique` : historique d'un objet (journal) ;
 * - `POST /reprise/apercu`, `POST /reprise` : réutilisation d'une partie d'un autre modèle (DA-21-09) ;
 * - `GET /references-externes`, `GET /references-externes/:id/mise-a-jour` : références externes (DA-05-11).
 */
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  CONTRAT_COMMANDES,
  ErreurCommande,
  analyserFusion,
  appliquerLot,
  collisions,
  commandeRestaurerVers,
  comparerModeles,
  empreinteDe,
  modeleVide,
  planifierReprise,
  REFERENCE_EXTERNE,
  representationReferenceExterne,
  type Enveloppe,
  type ParamsReferenceExterne,
  type ModeleAtelier,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { atelierCommands, atelierLocks, atelierPublications, atelierVariants, atelierVersions, projects, users, volumes } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { traiterEvenements } from "../lib/atelier-events.js";
import { chargerModele, creerModeleVide } from "../lib/atelier-modele.js";
import { EchecLot, validerDansTransaction, type ResultatValidation } from "../lib/atelier-validation.js";
import { cataloguesActuels, creerVersion, effetsJournal, journalDepuis, modeleARevision, produireDocumentsPublies } from "../lib/atelier-versions.js";
import { loadProjectAccess, projectOr404, roleAllows, type AccessibleProject } from "../lib/owned-project.js";
import { exportProjectArchive, importProjectArchive } from "../lib/project-archive.js";
import { lockProject } from "../lib/step-rows.js";
import { etatReferences, modelesPourMiseAJour } from "../lib/atelier-refexterne.js";

export const atelierVersionsRouter = Router({ mergeParams: true });
atelierVersionsRouter.use(requireAuth);

const invalide = (res: Response, message: string, chemin = "body") => res.status(400).json({ erreur: "invalide", details: [{ chemin, message }] });
const auteurs = async (ids: string[]) => {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.email]));
};

async function repondreLot(res: Response, projectId: string, travail: () => Promise<ResultatValidation | { status: number; reponse: Record<string, unknown> }>): Promise<void> {
  try {
    const r = await travail();
    if (r.status === 200) void traiterEvenements(projectId).catch(() => undefined);
    res.status(r.status).json(r.reponse);
  } catch (err) {
    if (err instanceof EchecLot) {
      res.status(err.resultat.status).json(err.resultat.reponse);
      return;
    }
    if (err instanceof ErreurCommande) {
      res.status(err.code === "precondition" ? 409 : 400).json({ erreur: err.code === "precondition" ? "conflit" : "invalide", details: [{ chemin: err.chemin, message: err.message }] });
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Versions nommées
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/versions", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db
    .select({ id: atelierVersions.id, nom: atelierVersions.nom, description: atelierVersions.description, revision: atelierVersions.revision, empreinte: atelierVersions.empreinte, authorId: atelierVersions.authorId, createdAt: atelierVersions.createdAt })
    .from(atelierVersions)
    .where(eq(atelierVersions.projectId, project.id))
    .orderBy(desc(atelierVersions.createdAt));
  const noms = await auteurs(rows.map((r) => r.authorId));
  res.json({ revision: project.modelRevision, versions: rows.map((r) => ({ ...r, auteur: noms.get(r.authorId) ?? null, createdAt: r.createdAt.toISOString() })) });
});

const versionSchema = z.object({ nom: z.string().trim().min(1).max(120), description: z.string().max(2000).default(""), revision: z.number().int().min(0).optional() });

atelierVersionsRouter.post("/versions", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = versionSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, p.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "));
  try {
    const cree = await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const courant = (await tx.select({ r: projects.modelRevision }).from(projects).where(eq(projects.id, project.id)))[0]!.r;
      const revision = p.data.revision ?? courant;
      const etat = await modeleARevision(tx, project.id, courant, revision);
      if (!etat) return null;
      const doublon = (await tx.select({ id: atelierVersions.id }).from(atelierVersions).where(and(eq(atelierVersions.projectId, project.id), sql`lower(${atelierVersions.nom}) = lower(${p.data.nom})`)))[0];
      if (doublon) throw new ErreurCommande("precondition", "nom", `une version « ${p.data.nom} » existe déjà`);
      return creerVersion(tx, project.id, req.user!.id, p.data.nom, p.data.description, revision, etat);
    });
    if (!cree) return void res.status(404).json({ erreur: "aucun-modele" });
    res.status(201).json({ id: cree.id, nom: cree.nom, description: cree.description, revision: cree.revision, empreinte: cree.empreinte, createdAt: cree.createdAt.toISOString() });
  } catch (err) {
    if (err instanceof ErreurCommande) return void res.status(err.code === "precondition" ? 409 : 400).json({ erreur: err.code === "precondition" ? "conflit" : "invalide", details: [{ chemin: err.chemin, message: err.message }] });
    throw err;
  }
});

async function versionDe(projectId: string, id: string) {
  return (await db.select().from(atelierVersions).where(and(eq(atelierVersions.projectId, projectId), eq(atelierVersions.id, id))).limit(1))[0];
}

atelierVersionsRouter.get("/versions/:versionId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const v = await versionDe(project.id, req.params["versionId"] as string);
  if (!v) return void res.status(404).json({ erreur: "version-inconnue" });
  res.json({ id: v.id, nom: v.nom, description: v.description, revision: v.revision, empreinte: v.empreinte, createdAt: v.createdAt.toISOString(), modele: v.modele });
});

const restaurerSchema = z.object({ requestId: z.string().min(1).max(64), baseRevision: z.number().int().min(0) });

/** Ramène le modèle à un instantané : un lot `interne.restaurer` (nouvelle révision), refus détaillés habituels. */
async function restaurer(req: Request, res: Response, project: AccessibleProject, etatCible: ModeleAtelier, libelle: string, extra: Record<string, unknown> = {}) {
  const p = restaurerSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "requestId et baseRevision requis");
  await repondreLot(res, project.id, () =>
    db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const charge = await chargerModele(tx, project.id);
      if (!charge) return { status: 404, reponse: { erreur: "aucun-modele" } };
      const commande = commandeRestaurerVers(charge.etat, etatCible);
      const courant = (await tx.select({ r: projects.modelRevision }).from(projects).where(eq(projects.id, project.id)))[0]!.r;
      if (!commande) return { status: 200, reponse: { revision: courant, inchange: true, ...extra } };
      const enveloppe: Enveloppe = { requestId: p.data.requestId, baseRevision: p.data.baseRevision, contract: CONTRAT_COMMANDES, label: libelle, commands: [commande] };
      const r = await validerDansTransaction(tx, project.id, req.user!.id, enveloppe, "commande", null, libelle);
      return { ...r, reponse: { ...r.reponse, ...extra } };
    }),
  );
}

atelierVersionsRouter.post("/versions/:versionId/restaurer", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const v = await versionDe(project.id, req.params["versionId"] as string);
  if (!v) return void res.status(404).json({ erreur: "version-inconnue" });
  await restaurer(req, res, project, v.modele as unknown as ModeleAtelier, `Restauration de la version « ${v.nom} » (révision ${v.revision})`);
});

// ---------------------------------------------------------------------------
// Comparer
// ---------------------------------------------------------------------------

async function etatDesigne(project: AccessibleProject, designation: string): Promise<{ etat: ModeleAtelier; libelle: string; revision: number } | { erreur: string }> {
  if (designation === "courante") {
    const etat = await modeleARevision(db, project.id, project.modelRevision, null);
    return etat ? { etat, libelle: `révision courante (${project.modelRevision})`, revision: project.modelRevision } : { erreur: "aucun modèle" };
  }
  const r = /^r:(\d+)$/.exec(designation);
  if (r) {
    const revision = Number(r[1]);
    const etat = await modeleARevision(db, project.id, project.modelRevision, revision);
    return etat ? { etat, libelle: `révision ${revision}`, revision } : { erreur: "aucun modèle" };
  }
  const v = /^v:(.+)$/.exec(designation);
  if (v) {
    const row = await versionDe(project.id, v[1]!);
    return row ? { etat: row.modele as unknown as ModeleAtelier, libelle: `version « ${row.nom} » (révision ${row.revision})`, revision: row.revision } : { erreur: "version inconnue" };
  }
  return { erreur: "désignation attendue : courante, r:<révision> ou v:<version>" };
}

atelierVersionsRouter.get("/comparer", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  try {
    const de = await etatDesigne(project, String(req.query["de"] ?? ""));
    const a = await etatDesigne(project, String(req.query["a"] ?? "courante"));
    if ("erreur" in de) return void res.status(404).json({ erreur: "introuvable", message: `de : ${de.erreur}` });
    if ("erreur" in a) return void res.status(404).json({ erreur: "introuvable", message: `a : ${a.erreur}` });
    res.json({ de: { libelle: de.libelle, revision: de.revision }, a: { libelle: a.libelle, revision: a.revision }, difference: comparerModeles(de.etat, a.etat) });
  } catch (err) {
    if (err instanceof ErreurCommande) return void res.status(err.code === "precondition" ? 404 : 400).json({ erreur: "introuvable", message: err.message });
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/variantes", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const parent = (await db.select().from(atelierVariants).where(eq(atelierVariants.projectId, project.id)).limit(1))[0];
  const enfants = await db
    .select({ id: atelierVariants.projectId, nom: atelierVariants.nom, forkRevision: atelierVariants.forkRevision, baseRevision: atelierVariants.baseRevision, statut: atelierVariants.statut, fusionRevision: atelierVariants.fusionRevision, createdAt: atelierVariants.createdAt, name: projects.name, revision: projects.modelRevision })
    .from(atelierVariants)
    .innerJoin(projects, eq(projects.id, atelierVariants.projectId))
    .where(eq(atelierVariants.parentId, project.id))
    .orderBy(asc(atelierVariants.createdAt));
  // Seules les variantes que l'utilisateur peut lire sont listées.
  const lisibles = [];
  for (const e of enfants) if (await loadProjectAccess(e.id, req.user!.id)) lisibles.push({ ...e, createdAt: e.createdAt.toISOString(), modifications: e.revision - e.baseRevision });
  const tronc = parent ? await loadProjectAccess(parent.parentId, req.user!.id) : null;
  res.json({
    revision: project.modelRevision,
    tronc: parent ? { id: parent.parentId, name: tronc?.name ?? null, accessible: !!tronc, nom: parent.nom, forkRevision: parent.forkRevision, baseRevision: parent.baseRevision, statut: parent.statut, fusionRevision: parent.fusionRevision } : null,
    variantes: lisibles,
  });
});

const varianteSchema = z.object({ nom: z.string().trim().min(1).max(80) });

atelierVersionsRouter.post("/variantes", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = varianteSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "nom requis (80 caractères au plus)", "nom");
  const now = new Date().toISOString();
  const created = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const charge = await chargerModele(tx, project.id);
    if (!charge) return null;
    const source = (await tx.select().from(projects).where(eq(projects.id, project.id)))[0]!;
    const archive = await exportProjectArchive(tx, source, now);
    const copie = await importProjectArchive(tx, req.user!.id, { ...archive, project: { ...archive.project, name: `${source.name} · variante ${p.data.nom}`, exampleMode: source.exampleMode ? "editable" : null } }, now);
    await tx.insert(atelierVariants).values({ projectId: copie.project.id, parentId: project.id, nom: p.data.nom, forkRevision: source.modelRevision, baseRevision: copie.project.modelRevision, forkEmpreinte: empreinteDe(charge.etat), statut: "ouverte", authorId: req.user!.id, createdAt: new Date() });
    return copie.project;
  });
  if (!created) return void res.status(404).json({ erreur: "aucun-modele", message: "Ce projet n'a pas encore de modèle typé." });
  res.status(201).json({ id: created.id, name: created.name, nom: p.data.nom, forkRevision: project.modelRevision });
});

async function contexteFusion(req: Request, res: Response, need: "read" | "write") {
  const tronc = await projectOr404(req, res, need);
  if (!tronc) return null;
  const varianteId = req.params["varianteId"] as string;
  const lien = (await db.select().from(atelierVariants).where(and(eq(atelierVariants.projectId, varianteId), eq(atelierVariants.parentId, tronc.id))).limit(1))[0];
  const acces = lien ? await loadProjectAccess(varianteId, req.user!.id) : null;
  if (!lien || !acces || !roleAllows(acces.role, "read")) {
    res.status(404).json({ erreur: "variante-inconnue" });
    return null;
  }
  return { tronc, lien, variante: acces };
}

/**
 * Fusions successives (D-023) : un lot de la variante est « déjà fusionné » quand son `requestId` figure au journal
 * du tronc (le rejeu le conserve) ; seuls les autres sont rejoués. Les conflits se cherchent dans les lots propres au
 * tronc depuis la dernière fusion (ou la bifurcation), hors lots venus de la variante.
 */
async function analyser(troncId: string, troncRevision: number, lien: typeof atelierVariants.$inferSelect, varianteRevision: number) {
  const toutesVariante = (await journalDepuis(db, lien.projectId, lien.baseRevision)).filter((e) => e.resultRevision <= varianteRevision);
  const ids = toutesVariante.map((e) => e.requestId);
  const dejaFusionnes = new Set(
    ids.length ? (await db.select({ r: atelierCommands.requestId }).from(atelierCommands).where(and(eq(atelierCommands.projectId, troncId), inArray(atelierCommands.requestId, ids)))).map((x) => x.r) : [],
  );
  const entreesVariante = toutesVariante.filter((e) => !dejaFusionnes.has(e.requestId));
  const venusDeLaVariante = new Set(ids);
  const entreesTronc = (await journalDepuis(db, troncId, lien.fusionRevision ?? lien.forkRevision)).filter((e) => !venusDeLaVariante.has(e.requestId));
  const analyse = analyserFusion(entreesTronc.map(effetsJournal), entreesVariante.map(effetsJournal));
  return { entreesTronc, entreesVariante, analyse, troncRevision, dejaFusionnes: dejaFusionnes.size };
}

atelierVersionsRouter.get("/variantes/:varianteId/fusion", async (req, res) => {
  const ctx = await contexteFusion(req, res, "read");
  if (!ctx) return;
  const { entreesTronc, entreesVariante, analyse, dejaFusionnes } = await analyser(ctx.tronc.id, ctx.tronc.modelRevision, ctx.lien, ctx.variante.modelRevision);
  // Rejeu à blanc sur l'état courant du tronc : mêmes réducteurs, mêmes refus.
  const charge = await chargerModele(db, ctx.tronc.id);
  let rejeu: { ok: true } | { ok: false; lot: string; message: string } = { ok: true };
  if (charge) {
    let etat = charge.etat;
    for (const e of entreesVariante) {
      try {
        etat = appliquerLot(etat, { requestId: e.requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: e.label, commands: e.commands }).etat;
      } catch (err) {
        if (!(err instanceof ErreurCommande)) throw err;
        rejeu = { ok: false, lot: e.label, message: err.message };
        break;
      }
    }
  }
  res.json({
    variante: { id: ctx.lien.projectId, nom: ctx.lien.nom, statut: ctx.lien.statut, forkRevision: ctx.lien.forkRevision, revision: ctx.variante.modelRevision },
    tronc: { id: ctx.tronc.id, revision: ctx.tronc.modelRevision, lotsDepuisBifurcation: entreesTronc.length, depuis: ctx.lien.fusionRevision ? "derniere-fusion" : "bifurcation" },
    dejaFusionnes,
    lots: entreesVariante.map((e) => ({ label: e.label, revision: e.resultRevision })),
    affectes: analyse.affectes,
    conflits: analyse.conflits,
    rejeu,
  });
});

const fusionSchema = z.object({ baseRevision: z.number().int().min(0), strategie: z.enum(["refuser-conflits", "variante-prioritaire"]).default("refuser-conflits") });

atelierVersionsRouter.post("/variantes/:varianteId/fusion", async (req, res) => {
  const ctx = await contexteFusion(req, res, "write");
  if (!ctx) return;
  const p = fusionSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "baseRevision requise ; stratégie : refuser-conflits ou variante-prioritaire");
  await repondreLot(res, ctx.tronc.id, () =>
    db.transaction(async (tx) => {
      await lockProject(tx, ctx.tronc.id);
      const courant = (await tx.select({ r: projects.modelRevision }).from(projects).where(eq(projects.id, ctx.tronc.id)))[0]!.r;
      if (p.data.baseRevision !== courant) return { status: 409, reponse: { erreur: "conflit", motif: "revision", baseRevision: p.data.baseRevision, revisionCourante: courant, conflits: [] } };
      const { entreesVariante, analyse } = await analyser(ctx.tronc.id, courant, ctx.lien, ctx.variante.modelRevision);
      if (!entreesVariante.length) return { status: 409, reponse: { erreur: "conflit", motif: "rien-a-fusionner", message: ctx.lien.fusionRevision ? "La variante n'a aucune modification depuis la dernière fusion." : "La variante n'a aucune modification depuis la bifurcation." } };
      if (analyse.conflits.length && p.data.strategie === "refuser-conflits") return { status: 409, reponse: { erreur: "conflit", motif: "fusion", message: `${analyse.conflits.length} objet(s) modifié(s) dans le tronc et dans la variante depuis la bifurcation.`, conflits: analyse.conflits } };
      let derniere: ResultatValidation | null = null;
      for (const e of entreesVariante) {
        const base = (await tx.select({ r: projects.modelRevision }).from(projects).where(eq(projects.id, ctx.tronc.id)))[0]!.r;
        const label = `Fusion « ${ctx.lien.nom} » : ${e.label}`.slice(0, 200);
        // Même `requestId` que dans la variante : les identifiants engendrés sont les mêmes, les lots suivants s'y retrouvent.
        derniere = await validerDansTransaction(tx, ctx.tronc.id, req.user!.id, { requestId: e.requestId, baseRevision: base, contract: CONTRAT_COMMANDES, label, commands: e.commands }, "commande", null, label);
        if (derniere.status !== 200) throw new EchecLot(derniere);
      }
      await tx.update(atelierVariants).set({ statut: "fusionnee", fusionRevision: derniere!.revision, fusionAt: new Date() }).where(eq(atelierVariants.projectId, ctx.lien.projectId));
      return { status: 200, reponse: { revision: derniere!.revision, lots: entreesVariante.length, affectes: analyse.affectes, conflits: analyse.conflits, strategie: p.data.strategie } };
    }),
  );
});

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/publications", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db.select().from(atelierPublications).where(eq(atelierPublications.projectId, project.id)).orderBy(desc(atelierPublications.createdAt));
  const noms = await auteurs(rows.map((r) => r.authorId));
  res.json({ publications: rows.map((r) => ({ id: r.id, nom: r.nom, versionId: r.versionId, revision: r.revision, empreinte: r.empreinte, documents: r.documents.length, auteur: noms.get(r.authorId) ?? null, createdAt: r.createdAt.toISOString() })) });
});

const publicationSchema = z.object({ nom: z.string().trim().min(1).max(120), versionId: z.string().max(64).optional() });

atelierVersionsRouter.post("/publications", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = publicationSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "nom requis (120 caractères au plus)", "nom");
  try {
    const pub = await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const courant = (await tx.select({ r: projects.modelRevision }).from(projects).where(eq(projects.id, project.id)))[0]!.r;
      let version = p.data.versionId ? (await tx.select().from(atelierVersions).where(and(eq(atelierVersions.projectId, project.id), eq(atelierVersions.id, p.data.versionId))).limit(1))[0] : undefined;
      if (p.data.versionId && !version) throw new ErreurCommande("precondition", "versionId", "version inconnue");
      if (!version) {
        const etat = await modeleARevision(tx, project.id, courant, null);
        if (!etat) return null;
        const nomVersion = `Publication « ${p.data.nom} »`.slice(0, 120);
        const doublon = (await tx.select({ id: atelierVersions.id }).from(atelierVersions).where(and(eq(atelierVersions.projectId, project.id), sql`lower(${atelierVersions.nom}) = lower(${nomVersion})`)))[0];
        if (doublon) throw new ErreurCommande("precondition", "nom", `une publication « ${p.data.nom} » existe déjà`);
        version = await creerVersion(tx, project.id, req.user!.id, nomVersion, `Version figée par la publication « ${p.data.nom} »`, courant, etat);
      }
      const etat = version.modele as unknown as ModeleAtelier;
      const documents = await produireDocumentsPublies(tx, project, etat, version.revision, version.createdAt.toISOString().replace(/\.\d{3}Z$/, ""));
      const row = { id: randomUUID(), projectId: project.id, versionId: version.id, nom: p.data.nom, revision: version.revision, empreinte: version.empreinte, catalogues: cataloguesActuels(etat), documents, authorId: req.user!.id, createdAt: new Date() };
      await tx.insert(atelierPublications).values(row);
      return row;
    });
    if (!pub) return void res.status(404).json({ erreur: "aucun-modele" });
    res.status(201).json({ ...pub, createdAt: pub.createdAt.toISOString() });
  } catch (err) {
    if (err instanceof ErreurCommande) return void res.status(409).json({ erreur: "conflit", details: [{ chemin: err.chemin, message: err.message }] });
    throw err;
  }
});

async function publicationDe(projectId: string, id: string) {
  return (await db.select().from(atelierPublications).where(and(eq(atelierPublications.projectId, projectId), eq(atelierPublications.id, id))).limit(1))[0];
}

atelierVersionsRouter.get("/publications/:publicationId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const pub = await publicationDe(project.id, req.params["publicationId"] as string);
  if (!pub) return void res.status(404).json({ erreur: "publication-inconnue" });
  const version = (await db.select({ nom: atelierVersions.nom, revision: atelierVersions.revision, empreinte: atelierVersions.empreinte }).from(atelierVersions).where(eq(atelierVersions.id, pub.versionId)))[0];
  const actuels = cataloguesActuels(null);
  const ecarts = Object.keys(pub.catalogues).filter((k) => k !== "modeleAtelier" && actuels[k] !== undefined && actuels[k] !== pub.catalogues[k]).map((k) => ({ catalogue: k, publie: pub.catalogues[k], actuel: actuels[k] }));
  const instantane = (await db.select({ modele: atelierVersions.modele }).from(atelierVersions).where(eq(atelierVersions.id, pub.versionId)))[0]?.modele as unknown as ModeleAtelier | undefined;
  const niveaux = Object.values(instantane?.niveaux ?? {}).sort((a, b) => a.elevation - b.elevation).map((n) => ({ id: n.id, nom: n.nom }));
  res.json({ ...pub, createdAt: pub.createdAt.toISOString(), version, niveaux, cataloguesActuels: actuels, ecarts, base: `/projects/${project.id}/atelier/publications/${pub.id}/fichiers` });
});

atelierVersionsRouter.get("/publications/:publicationId/fichiers/:volumeId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const pub = await publicationDe(project.id, req.params["publicationId"] as string);
  const doc = pub?.documents.find((d) => d.volumeId === req.params["volumeId"]);
  if (!pub || !doc) return void res.status(404).json({ erreur: "fichier-inconnu" });
  const v = (await db.select().from(volumes).where(eq(volumes.id, doc.volumeId)).limit(1))[0];
  if (!v) return void res.status(404).json({ erreur: "volume-absent" });
  res.setHeader("Content-Type", v.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Model-Revision", String(pub.revision));
  res.setHeader("X-Volume-Sha256", v.id);
  res.send(v.content);
});

atelierVersionsRouter.post("/publications/:publicationId/restaurer", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const pub = await publicationDe(project.id, req.params["publicationId"] as string);
  if (!pub) return void res.status(404).json({ erreur: "publication-inconnue" });
  const v = (await db.select().from(atelierVersions).where(eq(atelierVersions.id, pub.versionId)).limit(1))[0]!;
  const actuels = cataloguesActuels(null);
  const ecarts = Object.keys(pub.catalogues).filter((k) => k !== "modeleAtelier" && actuels[k] !== pub.catalogues[k]).map((k) => ({ catalogue: k, publie: pub.catalogues[k], actuel: actuels[k] ?? null }));
  await restaurer(req, res, project, v.modele as unknown as ModeleAtelier, `Restauration de la publication « ${pub.nom} » (révision ${pub.revision})`, { publication: pub.id, cataloguesPublies: pub.catalogues, ecartsCatalogues: ecarts });
});

// ---------------------------------------------------------------------------
// Verrous logiques fins
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/verrous", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db
    .select({ cle: atelierLocks.cle, motif: atelierLocks.motif, authorId: atelierLocks.authorId, expiresAt: atelierLocks.expiresAt, email: users.email })
    .from(atelierLocks)
    .innerJoin(users, eq(users.id, atelierLocks.authorId))
    .where(and(eq(atelierLocks.projectId, project.id), gt(atelierLocks.expiresAt, new Date())))
    .orderBy(asc(atelierLocks.cle));
  res.json({ verrous: rows.map((r) => ({ cle: r.cle, motif: r.motif, auteur: r.email, moi: r.authorId === req.user!.id, expiresAt: r.expiresAt.toISOString() })) });
});

const verrouSchema = z.object({ cles: z.array(z.string().min(1).max(200)).min(1).max(200), motif: z.string().max(200).default(""), minutes: z.number().int().min(1).max(480).default(30) });

atelierVersionsRouter.post("/verrous", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = verrouSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "cles (1 à 200), motif, minutes (1 à 480)");
  const charge = await chargerModele(db, project.id);
  const inconnues = p.data.cles.filter((c) => (c.startsWith("niveau:") ? !charge?.etat.niveaux[c.slice(7)] : !charge?.etat.objets[c]));
  if (inconnues.length) return void res.status(404).json({ erreur: "inconnu", message: `Objet ou niveau inconnu : ${inconnues.slice(0, 5).join(", ")}` });
  const resultat = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const maintenant = new Date();
    const tenus = await tx
      .select({ cle: atelierLocks.cle, motif: atelierLocks.motif, expiresAt: atelierLocks.expiresAt, authorId: atelierLocks.authorId, email: users.email })
      .from(atelierLocks)
      .innerJoin(users, eq(users.id, atelierLocks.authorId))
      .where(and(eq(atelierLocks.projectId, project.id), gt(atelierLocks.expiresAt, maintenant)));
    const autrui = tenus.filter((t) => t.authorId !== req.user!.id && p.data.cles.includes(t.cle));
    if (autrui.length) return { status: 423, corps: { erreur: "verrou", message: `Déjà verrouillé par ${autrui[0]!.email}.`, verrous: autrui.map((t) => ({ cle: t.cle, motif: t.motif, auteur: t.email, expiresAt: t.expiresAt.toISOString() })) } };
    const expiresAt = new Date(maintenant.getTime() + p.data.minutes * 60_000);
    for (const cle of p.data.cles) {
      await tx
        .insert(atelierLocks)
        .values({ projectId: project.id, cle, motif: p.data.motif, authorId: req.user!.id, expiresAt, createdAt: maintenant })
        .onConflictDoUpdate({ target: [atelierLocks.projectId, atelierLocks.cle], set: { motif: p.data.motif, authorId: req.user!.id, expiresAt, createdAt: maintenant } });
    }
    return { status: 201, corps: { cles: p.data.cles, expiresAt: expiresAt.toISOString() } };
  });
  res.status(resultat.status).json(resultat.corps);
});

atelierVersionsRouter.delete("/verrous/:cle", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const cle = req.params["cle"] as string;
  const row = (await db.select().from(atelierLocks).where(and(eq(atelierLocks.projectId, project.id), eq(atelierLocks.cle, cle))).limit(1))[0];
  if (!row) return void res.status(404).json({ erreur: "verrou-inconnu" });
  const expire = row.expiresAt.getTime() <= Date.now();
  if (row.authorId !== req.user!.id && project.role !== "proprietaire" && !expire) return void res.status(403).json({ erreur: "interdit", message: "Seul l'auteur du verrou ou le propriétaire du projet peut le lever." });
  await db.delete(atelierLocks).where(and(eq(atelierLocks.projectId, project.id), eq(atelierLocks.cle, cle)));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Collisions
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/collisions", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const charge = await chargerModele(db, project.id);
  res.json({ revision: project.modelRevision, collisions: charge ? collisions(charge.etat) : [] });
});

// ---------------------------------------------------------------------------
// Historique d'un objet (DA-21-06 -d)
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/objets/:objetId/historique", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const id = req.params["objetId"] as string;
  const motif = JSON.stringify([id]);
  const rows = await db
    .select({ id: atelierCommands.id, kind: atelierCommands.kind, label: atelierCommands.label, resultRevision: atelierCommands.resultRevision, effets: atelierCommands.effets, authorId: atelierCommands.authorId, createdAt: atelierCommands.createdAt, inverseOf: atelierCommands.inverseOf })
    .from(atelierCommands)
    .where(and(eq(atelierCommands.projectId, project.id), sql`(${atelierCommands.effets}->'crees' @> ${motif}::jsonb OR ${atelierCommands.effets}->'modifies' @> ${motif}::jsonb OR ${atelierCommands.effets}->'supprimes' @> ${motif}::jsonb)`))
    .orderBy(asc(atelierCommands.resultRevision));
  const noms = await auteurs(rows.map((r) => r.authorId));
  const charge = await chargerModele(db, project.id);
  const entrees = rows.map((r) => {
    const ef = r.effets as { crees?: string[]; modifies?: string[]; supprimes?: string[] };
    const action = ef.crees?.includes(id) ? "cree" : ef.supprimes?.includes(id) ? "supprime" : "modifie";
    // Une suppression qui crée d'autres objets dans le même lot (scission, décomposition) relie l'objet à ses successeurs.
    const successeurs = action === "supprime" ? (ef.crees ?? []).slice(0, 50) : [];
    return { journalId: r.id, revision: r.resultRevision, kind: r.kind, label: r.label, action, auteur: noms.get(r.authorId) ?? null, date: r.createdAt.toISOString(), successeurs };
  });
  res.json({ objetId: id, existe: !!charge?.etat.objets[id], classe: charge?.etat.objets[id]?.classe ?? null, entrees });
});

// ---------------------------------------------------------------------------
// Réutilisation de modèle (DA-21-09)
// ---------------------------------------------------------------------------

const repriseSchema = z.object({
  source: z.object({ projectId: z.string().min(1).max(64), versionId: z.string().max(64).optional() }),
  options: z.object({
    familles: z.array(z.enum(["architecture", "espaces", "dessin", "documents"])).max(4),
    niveaux: z.array(z.string().max(200)).max(200).optional(),
    site: z.boolean().optional(),
    hypotheses: z.boolean().optional(),
    sources: z.boolean().optional(),
    structure: z.boolean().optional(),
    homonymes: z.enum(["reutiliser", "renommer"]).optional(),
  }),
  empreinteSource: z.string().max(64).optional(),
  requestId: z.string().min(1).max(64).optional(),
  baseRevision: z.number().int().min(0).optional(),
});

type Refus = { status: number; reponse: Record<string, unknown> };

async function planDeReprise(req: Request, cible: AccessibleProject, corps: z.infer<typeof repriseSchema>, etatCible: ModeleAtelier): Promise<ReturnType<typeof planifierReprise> | Refus> {
  // Lire suffit sur la source (R13) ; un projet inaccessible est inconnu (404).
  const source = await loadProjectAccess(corps.source.projectId, req.user!.id);
  if (!source || source.id === cible.id) return { status: 404, reponse: { erreur: "source-inconnue", message: source ? "La source doit être un autre projet." : "Projet source inconnu." } };
  let etat: ModeleAtelier | null = null;
  let revision = source.modelRevision;
  let nom = source.name;
  if (corps.source.versionId) {
    const v = await versionDe(source.id, corps.source.versionId);
    if (!v) return { status: 404, reponse: { erreur: "version-inconnue" } };
    etat = v.modele as unknown as ModeleAtelier;
    revision = v.revision;
    nom = `${source.name} · version « ${v.nom} »`;
  } else etat = (await chargerModele(db, source.id))?.etat ?? null;
  if (!etat || (!Object.keys(etat.objets).length && !etat.site.parcelle)) return { status: 409, reponse: { erreur: "conflit", motif: "source-vide", message: "Le modèle source est vide." } };
  return planifierReprise(etat, etatCible, { ...corps.options, origine: { projet: source.id, nom, revision } });
}

atelierVersionsRouter.post("/reprise/apercu", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = repriseSchema.safeParse(req.body ?? {});
  if (!p.success) return void invalide(res, "source, options (familles, niveaux, site…) attendus");
  const charge = (await chargerModele(db, project.id)) ?? null;
  const plan = await planDeReprise(req, project, p.data, charge?.etat ?? modeleVide());
  if ("status" in plan) return void res.status(plan.status).json(plan.reponse);
  const ajouts = (plan.commande?.params["ajouts"] ?? {}) as Record<string, Record<string, unknown>>;
  res.json({ rapport: plan.rapport, vide: !plan.commande, ajouts: Object.fromEntries(Object.entries(ajouts).map(([k, t]) => [k, Object.keys(t).length])) });
});

atelierVersionsRouter.post("/reprise", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const p = repriseSchema.safeParse(req.body ?? {});
  if (!p.success || !p.data.requestId || p.data.baseRevision === undefined || !p.data.empreinteSource) return void invalide(res, "source, options, empreinteSource, requestId et baseRevision requis");
  await repondreLot(res, project.id, () =>
    db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const charge = (await chargerModele(tx, project.id)) ?? (await creerModeleVide(tx, project.id, `fadi-${project.id}`));
      const plan = await planDeReprise(req, project, p.data, charge.etat);
      if ("status" in plan) return plan;
      if (plan.rapport.source.empreinte !== p.data.empreinteSource) return { status: 409, reponse: { erreur: "conflit", motif: "source-modifiee", message: "Le modèle source a changé depuis l'aperçu : refaites l'aperçu." } };
      if (!plan.commande) return { status: 409, reponse: { erreur: "conflit", motif: "rien-a-reprendre", message: "Rien à reprendre avec ces choix." } };
      const label = `Reprise depuis « ${plan.rapport.source.nom} » (révision ${plan.rapport.source.revision})`.slice(0, 200);
      const r = await validerDansTransaction(tx, project.id, req.user!.id, { requestId: p.data.requestId!, baseRevision: p.data.baseRevision!, contract: CONTRAT_COMMANDES, label, commands: [plan.commande] }, "commande", null, label);
      return { ...r, reponse: { ...r.reponse, rapport: plan.rapport } };
    }),
  );
});

// ---------------------------------------------------------------------------
// Références externes (DA-05-11)
// ---------------------------------------------------------------------------

atelierVersionsRouter.get("/references-externes", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const charge = await chargerModele(db, project.id);
  const traits = req.query["traits"] !== "non";
  res.json({ revision: project.modelRevision, references: charge ? await etatReferences(req.user!.id, charge.etat, traits) : [] });
});

/** Ce que changerait l'épinglage de la dernière publication de la source : différences de modèle et de représentation. */
atelierVersionsRouter.get("/references-externes/:refId/mise-a-jour", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const charge = await chargerModele(db, project.id);
  const def = charge?.etat.definitions[req.params["refId"] as string];
  if (!def || def.classe !== REFERENCE_EXTERNE) return void res.status(404).json({ erreur: "reference-inconnue" });
  const p = def.params as unknown as ParamsReferenceExterne;
  const m = await modelesPourMiseAJour(req.user!.id, p);
  if (!m) return void res.status(404).json({ erreur: "source-inaccessible", message: "Source ou publication inaccessible." });
  const diff = comparerModeles(m.epinglee.modele, m.neuve.modele);
  const avant = representationReferenceExterne(m.epinglee.modele, p);
  const apres = representationReferenceExterne(m.neuve.modele, p);
  res.json({
    epinglee: { id: m.epinglee.pub.id, nom: m.epinglee.pub.nom, revision: m.epinglee.pub.revision, empreinte: m.epinglee.pub.empreinte },
    derniere: { id: m.neuve.pub.id, nom: m.neuve.pub.nom, revision: m.neuve.pub.revision, empreinte: m.neuve.pub.empreinte },
    niveauSourcePresent: !!m.neuve.modele.niveaux[p.niveauSourceId],
    identique: m.epinglee.pub.id === m.neuve.pub.id,
    differences: { ajoutes: diff.ajoutes.length, supprimes: diff.supprimes.length, modifies: diff.modifies.length, niveaux: diff.niveaux, site: diff.site, objets: [...diff.ajoutes.map((o) => ({ ...o, action: "ajoute" })), ...diff.supprimes.map((o) => ({ ...o, action: "supprime" })), ...diff.modifies.map((o) => ({ id: o.id, classe: o.classe, niveauId: o.niveauId, action: "modifie", champs: o.champs }))].slice(0, 200) },
    representation: { avant: avant.empreinte, apres: apres.empreinte, change: avant.empreinte !== apres.empreinte, traitsAvant: avant.traits.length, traitsApres: apres.traits.length },
  });
});
