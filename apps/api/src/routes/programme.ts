/**
 * Module Programmation — répartition programmatique par type de bâtiment
 * (étapes 06 et 07 du prototype) : type, surface de référence, position
 * dans la fourchette, ratios forcés. Monté sous
 * `/projects/:projectId/programme`. Le référentiel des fourchettes vient de
 * `data/programme-repartition.json` ; les calculs (ratios, surfaces, solde)
 * sont ceux de `@parcours/domain-model` et sont renvoyés avec le réglage
 * pour que l'affichage ne recalcule rien de son côté.
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  HYPOTHESIS_STATUSES,
  PROGRAMME_MODES,
  buildingCase,
  fnv1a,
  previewSurfaceTransfer,
  programmeModelLinks,
  defaultProgrammeRepartition,
  harmonieProfile,
  programmeCaseSums,
  programmeRows,
  programmeTotals,
  type ProgrammeCase,
  type ProgrammeRepartition,
  type ProgrammeSpace,
} from "@parcours/domain-model";
import { db } from "../db/client.js";
import { programmeRepartitions } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { BUILDING_LIBRARY, HARMONIE_PROFILES, PROGRAMME_REPARTITION } from "../data/parcours.js";
import { loadOwnedProject, projectOr404, type OwnedProject } from "../lib/owned-project.js";
import {
  adoptProgrammeConflict,
  applyProgrammeCase,
  applyProgrammeTransfer,
  editProgrammeCaseHypothesis,
  editProgrammeCaseSpace,
  linkProgrammeCaseRoom,
  loadActiveProgrammeCase,
  loadProgrammeHistory,
  programmeStateOf,
} from "../lib/programme-case.js";
import { loadModelAnalysis } from "../lib/model-context.js";
import { lockProject } from "../lib/step-rows.js";

export const programmeRouter = Router({ mergeParams: true });
programmeRouter.use(requireAuth);

export interface StoredRepartition extends ProgrammeRepartition {
  components: string[];
  stored: boolean;
  /** Vrai quand la répartition est chargée depuis un cas de programme appliqué (mode « cas » du prototype). */
  fromCase: boolean;
}

type Querier = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Le réglage du projet, ou les valeurs par défaut du référentiel tant qu'il n'a jamais été modifié (`programmeStore()` du prototype). */
export async function loadProgrammeRepartition(projectId: string, q: Querier = db): Promise<StoredRepartition> {
  const rows = await q.select().from(programmeRepartitions).where(eq(programmeRepartitions.projectId, projectId)).limit(1);
  const row = rows[0];
  if (!row) return { ...defaultProgrammeRepartition(PROGRAMME_REPARTITION), components: [], stored: false, fromCase: false };
  const mode = (PROGRAMME_MODES as readonly string[]).includes(row.mode) ? (row.mode as ProgrammeRepartition["mode"]) : "cible";
  return { type: row.type, baseArea: row.baseArea, mode, custom: { ...row.custom }, components: [...row.components], stored: true, fromCase: row.mode === "cas" };
}

/**
 * La vue du module : réglage, lignes et totaux — calculés depuis les fiches
 * espaces du cas de programme appliqué quand il y en a un (`programmeRatio`
 * / `programmeTotal` de building-library), sinon depuis le référentiel.
 */
async function repartitionView(project: OwnedProject) {
  const rep = await loadProgrammeRepartition(project.id);
  const typeInfo = PROGRAMME_REPARTITION.types[rep.type];
  const active = await loadActiveProgrammeCase(db, project.id);
  // Cas de programme de l'exemple importé, conservé en pièce jointe (lecture).
  const attachmentCase = project.sourceAttachment?.["programmeCase"] as { title?: string; scenarioLabel?: string; revision?: number; spaces?: ProgrammeSpace[]; users?: string } | undefined;
  const a: ProgrammeCase | null = active ?? null;
  const caseSums = a ? programmeCaseSums(a.spaces) : attachmentCase?.spaces ? programmeCaseSums(attachmentCase.spaces) : null;
  const rows =
    a && caseSums
      ? PROGRAMME_REPARTITION.families.map((f) => {
          const range = PROGRAMME_REPARTITION.types[rep.type]?.ratios[f.key] ?? [0, 0, 0];
          const ratio = caseSums.total ? ((caseSums[f.key as keyof typeof caseSums] as number) / caseSums.total) * 100 : 0;
          return { key: f.key, label: f.label, range: [range[0], range[2]] as [number, number], ratio, area: (caseSums[f.key as keyof typeof caseSums] as number) ?? 0 };
        })
      : programmeRows(PROGRAMME_REPARTITION, rep);
  const totals =
    a && caseSums
      ? {
          baseArea: caseSums.total,
          supportPercent: caseSums.total ? (caseSums.support / caseSums.total) * 100 : 0,
          supportArea: caseSums.support,
          netPercent: caseSums.total ? (caseSums.principal / caseSums.total) * 100 : 0,
          netArea: caseSums.principal,
        }
      : programmeTotals(PROGRAMME_REPARTITION, rep);
  const state = programmeStateOf(project);
  const libraryCase = a ? buildingCase(BUILDING_LIBRARY, a.caseId) : null;
  return {
    repartition: rep,
    // Un type hors du référentiel de répartition (ex. « mixte » d'un cas importé) garde le libellé de son profil Harmonie.
    typeLabel: typeInfo?.label ?? harmonieProfile(HARMONIE_PROFILES, rep.type, rep.components).label,
    rows,
    totals,
    /** Référence protégée d'un exemple résolu : présentation « Répartition renseignée et liée au modèle » du prototype (`projectProgramme`), modifiable dans une copie. */
    resolvedExample: project.exampleMode === "reference",
    reference: {
      subtitle: PROGRAMME_REPARTITION.subtitle,
      modes: PROGRAMME_REPARTITION.modes,
      types: Object.entries(PROGRAMME_REPARTITION.types).map(([key, v]) => ({ key, label: v.label })),
      adjacency: PROGRAMME_REPARTITION.adjacency,
      statusNote: PROGRAMME_REPARTITION.statusNote,
      transfer: PROGRAMME_REPARTITION.transfer,
    },
    programmeCase:
      a && caseSums
        ? {
            ...a,
            profileLabel: libraryCase?.profile.label ?? harmonieProfile(HARMONIE_PROFILES, a.type, rep.components).label,
            libraryCaseExists: !!libraryCase,
            spaceCount: a.spaces.length,
            sums: caseSums,
            conflicts: state.conflicts,
            decisionReview: state.decisionReview,
            decisionHistoryCount: state.decisionHistory.length,
            history: await loadProgrammeHistory(db, project.id),
          }
        : attachmentCase && caseSums
          ? {
              title: attachmentCase.title ?? null,
              scenarioLabel: attachmentCase.scenarioLabel ?? null,
              revision: attachmentCase.revision ?? null,
              users: attachmentCase.users ?? null,
              spaceCount: attachmentCase.spaces?.length ?? 0,
              sums: caseSums,
              readOnly: true,
            }
          : null,
  };
}

programmeRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  res.json(await repartitionView(project));
});

// --- Cas de programme (bibliothèque des bâtiments) --------------------------

const applySchema = z.object({
  caseId: z.string().max(60),
  scenarioId: z.string().max(60),
  jurisdiction: z.enum(["Maroc", "France", "Suisse", "Autre / à préciser"]).default("Maroc"),
  replaceText: z.boolean().default(false),
});

/** « Appliquer le scénario » : la variante devient le programme du projet (répartition, textes, Harmony) ; parcelle et Atelier inchangés. */
programmeRouter.post("/case", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const c = buildingCase(BUILDING_LIBRARY, parsed.data.caseId);
  if (!c || !c.scenarios.some((s) => s.id === parsed.data.scenarioId)) {
    res.status(400).json({ error: "invalid_input", details: { caseId: c ? "Variante inconnue" : "Cas inconnu" } });
    return;
  }
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => (await lockProject(tx, project.id), applyProgrammeCase(tx, project, parsed.data, now)));
  const refreshed = await loadOwnedProject(project.id, req.user!.id, "write");
  res.status(201).json({ ...(await repartitionView(refreshed ?? project)), applied: { revision: result.programmeCase.revision, conflicts: result.conflicts.length } });
});

/** « Adopter cette proposition » : l'écart n° `index` de la liste courante ; le champ conservé prend le texte proposé, l'ancien est archivé. */
programmeRouter.post("/conflicts/:index/adopt", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const index = Number(req.params["index"]);
  if (!Number.isInteger(index) || index < 0) {
    res.status(400).json({ error: "invalid_input", details: { index: "entier attendu" } });
    return;
  }
  const adopted = await db.transaction(async (tx) => (await lockProject(tx, project.id), adoptProgrammeConflict(tx, project, index, new Date().toISOString())));
  if (!adopted) {
    res.status(404).json({ error: "not_found", message: "Cet écart n’existe plus : la liste a été arbitrée entre-temps." });
    return;
  }
  const refreshed = await loadOwnedProject(project.id, req.user!.id, "write");
  res.json({ ...(await repartitionView(refreshed ?? project)), adopted });
});

const spaceSchema = z.object({ quantity: z.union([z.number(), z.string()]).optional(), unitArea: z.union([z.number(), z.string()]).optional() });

/** Adaptation d'une ligne du programme appliqué (quantité ou surface unitaire) ; surfaces et répartition recalculées, revues à reprendre. */
programmeRouter.patch("/case/spaces/:spaceId", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = spaceSchema.safeParse(req.body);
  const key = parsed.success ? (parsed.data.quantity !== undefined ? "quantity" : parsed.data.unitArea !== undefined ? "unitArea" : null) : null;
  if (!parsed.success || !key) {
    res.status(400).json({ error: "invalid_input", details: { body: "quantity ou unitArea attendu" } });
    return;
  }
  const value = key === "quantity" ? parsed.data.quantity : parsed.data.unitArea;
  try {
    await db.transaction(async (tx) => (await lockProject(tx, project.id), editProgrammeCaseSpace(tx, project, req.params["spaceId"] as string, key, value, new Date().toISOString())));
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Modification refusée." });
    return;
  }
  const refreshed = await loadOwnedProject(project.id, req.user!.id, "write");
  res.json(await repartitionView(refreshed ?? project));
});

// --- Programme ↔ modèle dessiné (`modelView` / `linkRoom`) -------------------

/** Les lignes du programme appliqué avec leurs zones liées, la surface dessinée, l'écart et les zones encore libres. */
programmeRouter.get("/model-links", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const a = await loadActiveProgrammeCase(db, project.id);
  if (!a) {
    res.json({ applied: false, rows: [], roomCount: 0, hasModel: false, revision: null });
    return;
  }
  const model = await loadModelAnalysis(db, project.id);
  const rooms = (model?.rooms ?? []).map((r) => ({ id: r.id, levelName: r.levelName, name: r.name, area: r.area }));
  res.json({ applied: true, revision: a.revision, title: a.title, scenarioLabel: a.scenarioLabel, rows: programmeModelLinks(a, rooms), roomCount: rooms.length, hasModel: !!model });
});

const linkSchema = z.object({ spaceId: z.string().min(1).max(120), roomId: z.string().min(1).max(200) });

programmeRouter.post("/case/links", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const model = await loadModelAnalysis(tx, project.id);
      await linkProgrammeCaseRoom(tx, project, parsed.data.spaceId, parsed.data.roomId, false, model?.rooms ?? [], new Date().toISOString());
    });
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Liaison refusée." });
    return;
  }
  res.status(201).json({ ok: true });
});

programmeRouter.delete("/case/links/:spaceId/:roomId", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  try {
    await db.transaction(async (tx) => {
      await lockProject(tx, project.id);
      const model = await loadModelAnalysis(tx, project.id);
      await linkProgrammeCaseRoom(tx, project, req.params["spaceId"] as string, req.params["roomId"] as string, true, model?.rooms ?? [], new Date().toISOString());
    });
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Liaison refusée." });
    return;
  }
  res.status(204).end();
});

// --- Registre des hypothèses (`hypothesisView`) ------------------------------

const hypothesisSchema = z.object({ status: z.enum(HYPOTHESIS_STATUSES).optional(), owner: z.string().max(250).optional(), proof: z.string().max(3000).optional() });

programmeRouter.patch("/case/hypotheses/:hypothesisId", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = hypothesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    const next = await db.transaction(
      async (tx) => (await lockProject(tx, project.id), editProgrammeCaseHypothesis(tx, project.id, req.params["hypothesisId"] as string, parsed.data, new Date().toISOString())),
    );
    res.json({ hypotheses: next.hypotheses, revision: next.revision });
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Modification refusée." });
  }
});

// --- Transfert surfacique à total constant (étape 07) -----------------------

const transferPreviewSchema = z.object({ from: z.string().min(1).max(120), to: z.string().min(1).max(120), amount: z.union([z.number(), z.string()]), reason: z.string().max(700) });

programmeRouter.post("/case/transfer/preview", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = transferPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const a = await loadActiveProgrammeCase(db, project.id);
  if (!a) {
    res.status(422).json({ error: "programme_rule", message: "Appliquez un cas de la bibliothèque pour proposer un transfert chiffré entre ses fiches d’espaces." });
    return;
  }
  try {
    res.json(previewSurfaceTransfer(a, project.id, parsed.data.from, parsed.data.to, parsed.data.amount, parsed.data.reason, fnv1a));
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Transfert refusé." });
  }
});

const transferSchema = z.object({
  projectId: z.string(),
  revision: z.number().int(),
  hash: z.string().max(16),
  from: z.string().max(120),
  to: z.string().max(120),
  amount: z.number().finite().positive(),
  reason: z.string().max(700),
  before: z.object({ from: z.number(), to: z.number(), total: z.number() }),
  after: z.object({ from: z.number(), to: z.number(), total: z.number() }),
});

programmeRouter.post("/case/transfer", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => (await lockProject(tx, project.id), applyProgrammeTransfer(tx, project, parsed.data, new Date().toISOString())));
    const refreshed = await loadOwnedProject(project.id, req.user!.id, "write");
    res.json({ ...(await repartitionView(refreshed ?? project)), transfer: { total: result.total, revision: result.programmeCase.revision } });
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Transfert refusé." });
  }
});

const putSchema = z.object({
  type: z.string().refine((t) => t in PROGRAMME_REPARTITION.types, "Type de bâtiment inconnu"),
  baseArea: z.number().finite().min(0).max(1_000_000),
  mode: z.enum(["min", "cible", "max"]),
  custom: z.record(
    z.string().refine((k) => PROGRAMME_REPARTITION.families.some((f) => f.key === k), "Famille inconnue"),
    z.number().finite().min(0).max(100),
  ),
  components: z.array(z.string().max(40)).max(10).optional(),
});

programmeRouter.put("/", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project) return;
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const current = await loadProgrammeRepartition(project.id);
  const next = {
    projectId: project.id,
    type: parsed.data.type,
    baseArea: parsed.data.baseArea,
    mode: parsed.data.mode,
    custom: parsed.data.custom,
    components: parsed.data.components ?? current.components,
    updatedAt: new Date(),
  };
  await db.insert(programmeRepartitions).values(next).onConflictDoUpdate({ target: programmeRepartitions.projectId, set: next });
  res.json(await repartitionView(project));
});
