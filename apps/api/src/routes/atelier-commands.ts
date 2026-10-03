/**
 * Service de commandes de l'Atelier (cahier des charges §5.4 ; Architecture V4 §6). Monté sous
 * `/projects/:projectId/atelier` :
 *
 * - `GET /model`, `GET /model/niveaux/:niveauId` : instantané du modèle typé ;
 * - `POST /commands` : lot de commandes (enveloppe `atelier-commands/1`) — droits relus, verrou de ligne,
 *   `baseRevision` = révision courante sinon 409 détaillé, mêmes réducteurs que le navigateur, transaction
 *   (différentiel + journal + boîte de sortie + `projects.model_revision + 1`), idempotence par `requestId` ;
 * - `POST /commands/essai` : exécution à blanc (validation sans transaction) ;
 * - `POST /commands/annuler`, `POST /commands/retablir` : inverse d'une entrée du journal, nouvelle microversion ;
 * - `GET /journal?apres=n` : entrées depuis une révision ; `GET /problemes` : références à réparer, problèmes,
 *   documents périmés, état du bilan ;
 * - `POST /model/importer-natif` : import à sens unique du magasin du moteur extrait (transition, D-002).
 */
import { Router, json, type Request, type Response } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  appliquerLot,
  CONTRAT_COMMANDES,
  ErreurCommande,
  identifiantsCibles,
  importerModeleNatif,
  referencesAReparer,
  TYPE_RESTAURER,
  type Commande,
  type Effets,
  type Enveloppe,
  type ModeleAtelier,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { atelierCommands, atelierStore, projects, type JournalKind } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { EVENEMENT_COMMANDE_VALIDEE, enregistrerEvenement, traiterEvenements } from "../lib/atelier-events.js";
import { chargerModele, creerModeleVide, persisterDifferentiel, remplacerModele } from "../lib/atelier-modele.js";
import { loadDesignContext } from "../lib/design-context.js";
import { documentCatalogue } from "../lib/documents.js";
import { projectOr404, type AccessibleProject } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";

export const atelierCommandsRouter = Router({ mergeParams: true });
atelierCommandsRouter.use(requireAuth);
// Analyse JSON limitée à ce routeur et à ses routes d'écriture (le magasin du moteur extrait, monté au même préfixe, a sa propre limite).
const corps = json({ limit: "1mb" });

const commandeSchema = z.object({
  type: z.string().min(1).max(80),
  params: z.record(z.string(), z.unknown()).default({}),
  cibles: z.array(z.string().max(200)).max(5000).optional(),
});

const enveloppeSchema = z.object({
  requestId: z.string().min(1).max(64),
  baseRevision: z.number().int().min(0),
  contract: z.literal(CONTRAT_COMMANDES),
  label: z.string().max(200).default(""),
  commands: z.array(commandeSchema).min(1).max(500),
});

const inverseSchema = z.object({
  requestId: z.string().min(1).max(64),
  baseRevision: z.number().int().min(0),
  journalId: z.string().max(64).optional(),
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function invalide(res: Response, details: unknown, chemin = "body"): void {
  res.status(400).json({ erreur: "invalide", details: Array.isArray(details) ? details : [{ chemin, message: typeof details === "string" ? details : JSON.stringify(details) }] });
}

function erreurCommande(res: Response, err: ErreurCommande, revisionCourante: number): void {
  if (err.code === "precondition") {
    res.status(409).json({ erreur: "conflit", motif: "precondition", baseRevision: revisionCourante, revisionCourante, conflits: [{ chemin: err.chemin, motif: err.message }] });
    return;
  }
  res.status(400).json({ erreur: "invalide", details: [{ chemin: err.chemin, message: err.message }] });
}

/** Objets touchés par les entrées du journal postérieures à `baseRevision` qui recoupent les cibles du lot. */
async function conflitsDepuis(tx: Tx, projectId: string, baseRevision: number, cibles: string[], etat: ModeleAtelier) {
  const entrees = await tx.select({ effets: atelierCommands.effets, label: atelierCommands.label, resultRevision: atelierCommands.resultRevision, authorId: atelierCommands.authorId }).from(atelierCommands).where(and(eq(atelierCommands.projectId, projectId), gt(atelierCommands.resultRevision, baseRevision)));
  const conflits: { objetId: string; motif: string; revision: number; etatServeur: unknown }[] = [];
  for (const e of entrees) {
    const ef = e.effets as Partial<Effets>;
    const touches = new Set([...(ef.crees ?? []), ...(ef.modifies ?? []), ...(ef.supprimes ?? [])]);
    for (const id of cibles) if (touches.has(id)) conflits.push({ objetId: id, motif: `modifié par « ${e.label || "lot"} » (révision ${e.resultRevision})`, revision: e.resultRevision, etatServeur: etat.objets[id] ?? null });
  }
  return conflits;
}

interface ResultatValidation {
  reponse: Record<string, unknown>;
  status: number;
  revision: number;
  journalId?: string;
}

/**
 * Cœur transactionnel : rejoue une requête déjà validée (idempotence), vérifie la révision de base, applique
 * les commandes, persiste le différentiel, journalise, enregistre l'événement, avance la révision.
 */
class EchecLot extends Error {
  constructor(public readonly resultat: ResultatValidation) {
    super("lot refusé");
  }
}

async function validerLot(project: AccessibleProject, auteurId: string, enveloppe: Enveloppe, kind: JournalKind, inverseOf: string | null, label: string): Promise<ResultatValidation> {
  try {
    return await validerLotTx(project, auteurId, enveloppe, kind, inverseOf, label);
  } catch (err) {
    if (err instanceof EchecLot) return err.resultat; // transaction annulée : rien n'a été écrit
    throw err;
  }
}

async function validerLotTx(project: AccessibleProject, auteurId: string, enveloppe: Enveloppe, kind: JournalKind, inverseOf: string | null, label: string): Promise<ResultatValidation> {
  return db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const deja = (await tx.select().from(atelierCommands).where(and(eq(atelierCommands.projectId, project.id), eq(atelierCommands.requestId, enveloppe.requestId))).limit(1))[0];
    if (deja) return { reponse: { ...deja.reponse, rejouee: true }, status: 200, revision: deja.resultRevision, journalId: deja.id };
    const courant = (await tx.select({ modelRevision: projects.modelRevision }).from(projects).where(eq(projects.id, project.id)).limit(1))[0]!;
    const charge = (await chargerModele(tx, project.id)) ?? (await creerModeleVide(tx, project.id, `fadi-${project.id}`));
    if (enveloppe.baseRevision !== courant.modelRevision) {
      const conflits = await conflitsDepuis(tx, project.id, enveloppe.baseRevision, identifiantsCibles(enveloppe), charge.etat);
      throw new EchecLot({ reponse: { erreur: "conflit", motif: "revision", baseRevision: enveloppe.baseRevision, revisionCourante: courant.modelRevision, conflits }, status: 409, revision: courant.modelRevision });
    }
    let resultat;
    try {
      resultat = appliquerLot(charge.etat, enveloppe);
    } catch (err) {
      if (err instanceof ErreurCommande) {
        throw new EchecLot({
          status: err.code === "precondition" ? 409 : 400,
          revision: courant.modelRevision,
          reponse: err.code === "precondition" ? { erreur: "conflit", motif: "precondition", baseRevision: enveloppe.baseRevision, revisionCourante: courant.modelRevision, conflits: [{ chemin: err.chemin, motif: err.message }] } : { erreur: "invalide", details: [{ chemin: err.chemin, message: err.message }] },
        });
      }
      throw err;
    }
    const revision = courant.modelRevision + 1;
    await persisterDifferentiel(tx, project.id, charge.etat, resultat.etat, revision);
    await tx.update(projects).set({ modelRevision: revision, updatedAt: new Date() }).where(eq(projects.id, project.id));
    const journalId = randomUUID();
    const reponse = {
      revision,
      journalId,
      applique: enveloppe.commands.map((c, i) => ({ type: c.type, objetIds: [...(resultat.parCommande[i]?.crees ?? []), ...(resultat.parCommande[i]?.modifies ?? []), ...(resultat.parCommande[i]?.supprimes ?? [])] })),
      effets: resultat.effets,
      problemes: resultat.effets.problemes,
      referencesAReparer: resultat.effets.referencesAReparer,
    };
    await tx.insert(atelierCommands).values({
      id: journalId,
      projectId: project.id,
      requestId: enveloppe.requestId,
      kind,
      contract: enveloppe.contract,
      label: label || enveloppe.label,
      baseRevision: enveloppe.baseRevision,
      resultRevision: revision,
      commands: enveloppe.commands,
      inverse: resultat.inverse as unknown as Record<string, unknown>,
      effets: resultat.effets as unknown as Record<string, unknown>,
      reponse,
      inverseOf,
      authorId: auteurId,
      createdAt: new Date(),
    });
    await enregistrerEvenement(tx, project.id, EVENEMENT_COMMANDE_VALIDEE, {
      projectId: project.id,
      revision,
      journalId,
      kind,
      objetIds: [...resultat.effets.crees, ...resultat.effets.modifies, ...resultat.effets.supprimes],
      types: enveloppe.commands.map((c) => c.type),
      auteurId,
    });
    return { reponse, status: 200, revision, journalId };
  });
}

async function repondre(res: Response, projectId: string, r: ResultatValidation): Promise<void> {
  if (r.status === 200) void traiterEvenements(projectId).catch(() => undefined);
  res.status(r.status).json(r.reponse);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

atelierCommandsRouter.get("/model", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const charge = await chargerModele(db, project.id);
  if (!charge) {
    res.status(404).json({ erreur: "aucun-modele", revision: project.modelRevision, message: "Ce projet n'a pas encore de modèle typé." });
    return;
  }
  res.json({ revision: project.modelRevision, nativeId: charge.nativeId, modele: charge.etat });
});

atelierCommandsRouter.get("/model/niveaux/:niveauId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const charge = await chargerModele(db, project.id);
  const niveauId = req.params["niveauId"] as string;
  const niveau = charge?.etat.niveaux[niveauId];
  if (!charge || !niveau) {
    res.status(404).json({ erreur: "niveau-inconnu" });
    return;
  }
  const objets = Object.values(charge.etat.objets).filter((o) => o.niveauId === niveauId);
  const ids = new Set(objets.map((o) => o.id));
  const relations = Object.values(charge.etat.relations).filter((r) => ids.has(r.sourceId) || ids.has(r.targetId));
  const references = Object.values(charge.etat.references).filter((r) => ids.has(r.proprietaireId) || (r.objetId !== null && ids.has(r.objetId)));
  res.json({ revision: project.modelRevision, niveau, objets, relations, references });
});

atelierCommandsRouter.get("/journal", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const apres = Number(req.query["apres"] ?? 0);
  const limite = Math.min(500, Math.max(1, Number(req.query["limite"] ?? 200)));
  const rows = await db
    .select({ id: atelierCommands.id, kind: atelierCommands.kind, requestId: atelierCommands.requestId, label: atelierCommands.label, baseRevision: atelierCommands.baseRevision, resultRevision: atelierCommands.resultRevision, commands: atelierCommands.commands, effets: atelierCommands.effets, inverse: atelierCommands.inverse, inverseOf: atelierCommands.inverseOf, authorId: atelierCommands.authorId, createdAt: atelierCommands.createdAt })
    .from(atelierCommands)
    .where(and(eq(atelierCommands.projectId, project.id), gt(atelierCommands.resultRevision, Number.isFinite(apres) ? apres : 0)))
    .orderBy(atelierCommands.resultRevision)
    .limit(limite);
  res.json({ revision: project.modelRevision, entrees: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

atelierCommandsRouter.get("/problemes", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const charge = await chargerModele(db, project.id);
  const now = new Date().toISOString();
  const dctx = await loadDesignContext(db, project, now);
  const documents = (await documentCatalogue(db, project, dctx)).filter((d) => d.freshness === "perime").map((d) => ({ kind: d.kind, label: d.label }));
  res.json({
    revision: project.modelRevision,
    references: charge ? referencesAReparer(charge.etat) : [],
    problemes: charge ? Object.values(charge.etat.problemes) : [],
    documentsPerimes: documents,
    bilan: {
      reviewStale: dctx.harmony.designReviewV62 ? dctx.analysis.stale : false,
      reserves: dctx.analysis.issues.length,
      reservesPrioritaires: dctx.analysis.issues.filter((x) => x.priority === "prioritaire").length,
      ecartsAudit: dctx.audit.filter((a) => a.status === "Écart").length,
    },
  });
});

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

atelierCommandsRouter.post("/commands", corps, async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = enveloppeSchema.safeParse(req.body);
  if (!parsed.success) {
    invalide(res, parsed.error.issues.map((i) => ({ chemin: i.path.join("."), message: i.message })));
    return;
  }
  const enveloppe = parsed.data as Enveloppe;
  await repondre(res, project.id, await validerLot(project, req.user!.id, enveloppe, "commande", null, enveloppe.label));
});

atelierCommandsRouter.post("/commands/essai", corps, async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = enveloppeSchema.safeParse(req.body);
  if (!parsed.success) {
    invalide(res, parsed.error.issues.map((i) => ({ chemin: i.path.join("."), message: i.message })));
    return;
  }
  const enveloppe = parsed.data as Enveloppe;
  const charge = await chargerModele(db, project.id);
  const etat = charge?.etat ?? (await db.transaction((tx) => creerModeleVide(tx, project.id, `fadi-${project.id}`))).etat;
  if (enveloppe.baseRevision !== project.modelRevision) {
    res.status(409).json({ erreur: "conflit", motif: "revision", baseRevision: enveloppe.baseRevision, revisionCourante: project.modelRevision, conflits: [] });
    return;
  }
  try {
    const r = appliquerLot(etat, enveloppe);
    res.json({ ok: true, revision: project.modelRevision, effets: r.effets, parCommande: r.parCommande, problemes: r.effets.problemes, referencesAReparer: r.effets.referencesAReparer });
  } catch (err) {
    if (err instanceof ErreurCommande) {
      erreurCommande(res, err, project.modelRevision);
      return;
    }
    throw err;
  }
});

/** Dernière entrée annulable : la plus récente parmi les commandes et rétablissements non encore annulés. */
async function cibleAnnulation(projectId: string, journalId?: string) {
  const entrees = await db.select().from(atelierCommands).where(eq(atelierCommands.projectId, projectId)).orderBy(desc(atelierCommands.resultRevision)).limit(200);
  const annulees = new Set(entrees.filter((e) => e.kind === "annulation").map((e) => e.inverseOf));
  if (journalId) return entrees.find((e) => e.id === journalId && e.kind !== "annulation" && !annulees.has(e.id)) ?? null;
  return entrees.find((e) => e.kind !== "annulation" && !annulees.has(e.id)) ?? null;
}

/** Dernière annulation rétablissable : postérieure à la dernière commande, et pas encore rétablie. */
async function cibleRetablissement(projectId: string, journalId?: string) {
  const entrees = await db.select().from(atelierCommands).where(eq(atelierCommands.projectId, projectId)).orderBy(desc(atelierCommands.resultRevision)).limit(200);
  const retablies = new Set(entrees.filter((e) => e.kind === "retablissement").map((e) => e.inverseOf));
  const derniereCommande = entrees.find((e) => e.kind === "commande");
  const candidates = entrees.filter((e) => e.kind === "annulation" && !retablies.has(e.id) && (!derniereCommande || e.resultRevision > derniereCommande.resultRevision));
  if (journalId) return candidates.find((e) => e.id === journalId) ?? null;
  return candidates[0] ?? null;
}

async function inverser(req: Request, res: Response, mode: "annuler" | "retablir"): Promise<void> {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = inverseSchema.safeParse(req.body);
  if (!parsed.success) {
    invalide(res, parsed.error.issues.map((i) => ({ chemin: i.path.join("."), message: i.message })));
    return;
  }
  const cible = mode === "annuler" ? await cibleAnnulation(project.id, parsed.data.journalId) : await cibleRetablissement(project.id, parsed.data.journalId);
  if (!cible) {
    res.status(409).json({ erreur: "conflit", motif: mode === "annuler" ? "rien-a-annuler" : "rien-a-retablir", baseRevision: parsed.data.baseRevision, revisionCourante: project.modelRevision, conflits: [] });
    return;
  }
  const enveloppe: Enveloppe = { requestId: parsed.data.requestId, baseRevision: parsed.data.baseRevision, contract: CONTRAT_COMMANDES, label: `${mode === "annuler" ? "Annuler" : "Rétablir"} : ${cible.label}`, commands: [cible.inverse as unknown as Commande] };
  await repondre(res, project.id, await validerLot(project, req.user!.id, enveloppe, mode === "annuler" ? "annulation" : "retablissement", cible.id, enveloppe.label));
}

atelierCommandsRouter.post("/commands/annuler", corps, (req, res) => inverser(req, res, "annuler"));
atelierCommandsRouter.post("/commands/retablir", corps, (req, res) => inverser(req, res, "retablir"));

// ---------------------------------------------------------------------------
// Transition : import à sens unique du magasin du moteur extrait (D-002)
// ---------------------------------------------------------------------------

atelierCommandsRouter.post("/model/importer-natif", corps, async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const remplacer = req.body?.remplacer === true;
  const r = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const existant = await chargerModele(tx, project.id);
    if (existant && Object.keys(existant.etat.objets).length > 0 && !remplacer) return { status: 409 as const, body: { erreur: "conflit", motif: "modele-existant", message: "Un modèle typé existe déjà : indiquer remplacer = true pour le remplacer par l'import." } };
    const rows = await tx.select().from(atelierStore).where(eq(atelierStore.projectId, project.id));
    const active = rows.find((x) => x.key === "design.v13.activeProject")?.value;
    if (typeof active !== "string") return { status: 404 as const, body: { erreur: "aucun-modele-natif" } };
    const domaine = (d: string) => rows.find((x) => x.key === `design.v13.project.${active}.${d}`)?.value;
    const registry = (rows.find((x) => x.key === "design.v13.registry")?.value as { id: string }[] | undefined)?.find((p) => p.id === active);
    const { modele, rapport } = importerModeleNatif({ nativeId: active, registry: registry as never, domains: { levels: domaine("levels"), floorDesign: domaine("floorDesign"), nativeParcel: domaine("nativeParcel"), buildingFootprint: domaine("buildingFootprint"), ui: domaine("ui") } });
    const courant = (await tx.select({ modelRevision: projects.modelRevision }).from(projects).where(eq(projects.id, project.id)).limit(1))[0]!;
    const revision = courant.modelRevision + 1;
    await remplacerModele(tx, project.id, modele, active, revision);
    await tx.update(projects).set({ modelRevision: revision, updatedAt: new Date() }).where(eq(projects.id, project.id));
    const journalId = randomUUID();
    const reponse = { revision, journalId, rapport };
    await tx.insert(atelierCommands).values({ id: journalId, projectId: project.id, requestId: `import-natif-${journalId}`, kind: "commande", contract: CONTRAT_COMMANDES, label: "Import du modèle natif", baseRevision: courant.modelRevision, resultRevision: revision, commands: [{ type: "interne.import-natif", params: { nativeId: active } }], inverse: { type: TYPE_RESTAURER, params: { diff: { avant: {}, crees: {} } } }, effets: { crees: Object.keys(modele.objets), modifies: [], supprimes: [], problemes: rapport.problemes, referencesAReparer: [], niveauxTouches: Object.keys(modele.niveaux) }, reponse, inverseOf: null, authorId: req.user!.id, createdAt: new Date() });
    await enregistrerEvenement(tx, project.id, EVENEMENT_COMMANDE_VALIDEE, { projectId: project.id, revision, journalId, kind: "import", objetIds: [], types: ["interne.import-natif"], auteurId: req.user!.id });
    return { status: 200 as const, body: reponse };
  });
  if (r.status === 200) void traiterEvenements(project.id).catch(() => undefined);
  res.status(r.status).json(r.body);
});

