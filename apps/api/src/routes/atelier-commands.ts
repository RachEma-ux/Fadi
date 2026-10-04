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
 * - `POST /import-ifc` (lot 6) : fichier IFC brut lu par web-ifc, produits importés en représentations (classe et
 *   GlobalId d'origine), en lots de 500 commandes dans une seule transaction (tout ou rien) ; réponse : rapport.
 */
import { Router, json, raw, type Request, type Response } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import {
  appliquerLot,
  commandesImportIfc,
  CONTRAT_COMMANDES,
  ErreurCommande,
  referencesAReparer,
  type Commande,
  type Enveloppe,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { atelierCommands, type JournalKind } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { traiterEvenements } from "../lib/atelier-events.js";
import { chargerModele, creerModeleVide } from "../lib/atelier-modele.js";
import { loadDesignContext } from "../lib/design-context.js";
import { documentCatalogue } from "../lib/documents.js";
import { projectOr404, type AccessibleProject } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";
import { EchecLot, appliquerCommandesInternes, validerDansTransaction, type ResultatValidation } from "../lib/atelier-validation.js";
import { lireIfc } from "../lib/atelier-ifc.js";

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
    return validerDansTransaction(tx, project.id, auteurId, enveloppe, kind, inverseOf, label);
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

// ---------------------------------------------------------------------------
// Échanges (lot 6)
// ---------------------------------------------------------------------------

const LIMITE_IFC = 64 * 1024 * 1024;
const LOTS_IMPORT_MAX = 60;

atelierCommandsRouter.post("/import-ifc", raw({ type: () => true, limit: LIMITE_IFC }), async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const octets = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.alloc(0);
  const brut = req.get("X-File-Name") ?? "import.ifc";
  let source = "import.ifc";
  try {
    source = decodeURIComponent(brut).replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "import.ifc";
  } catch {
    source = "import.ifc";
  }
  if (!octets.length || !octets.subarray(0, 64).toString("latin1").startsWith("ISO-10303-21")) {
    invalide(res, "Fichier IFC attendu (STEP ISO-10303-21, texte).", "fichier");
    return;
  }
  let lecture;
  try {
    lecture = await lireIfc(new Uint8Array(octets.buffer, octets.byteOffset, octets.byteLength));
  } catch (err) {
    invalide(res, `Fichier IFC illisible : ${err instanceof Error ? err.message : String(err)}`, "fichier");
    return;
  }
  try {
    const sortie = await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const charge = (await chargerModele(tx, project.id)) ?? (await creerModeleVide(tx, project.id, `fadi-${project.id}`));
      const { lots, rapport } = commandesImportIfc(charge.etat, lecture, { source });
      if (lots.length > LOTS_IMPORT_MAX) throw new EchecLot({ status: 413, revision: project.modelRevision, reponse: { erreur: "trop-volumineux", message: `Import trop volumineux (${lots.length} lots de 500 commandes ; ${LOTS_IMPORT_MAX} au plus).` } });
      let derniere: ResultatValidation | null = null;
      for (const l of lots) derniere = await appliquerCommandesInternes(tx, project.id, req.user!.id, l.commands, l.label);
      return { rapport, lots: lots.length, revision: derniere?.revision ?? project.modelRevision };
    });
    if (sortie.lots) void traiterEvenements(project.id).catch(() => undefined);
    res.json({ source, revision: sortie.revision, lots: sortie.lots, rapport: sortie.rapport });
  } catch (err) {
    if (err instanceof EchecLot) {
      res.status(err.resultat.status).json(err.resultat.reponse);
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


