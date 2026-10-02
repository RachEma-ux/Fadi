/**
 * Module Programmation — répartition programmatique par type de bâtiment
 * (étapes 06 et 07 du prototype) : type, surface de référence, position
 * dans la fourchette, ratios forcés. Monté sous
 * `/projects/:projectId/programme`. Le référentiel des fourchettes vient de
 * `data/programme-repartition.json` ; les calculs (ratios, surfaces, solde)
 * sont ceux de `@parcours/domain-model` et sont renvoyés avec le réglage
 * pour que l'affichage ne recalcule rien de son côté.
 */
import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  PROGRAMME_MODES,
  buildingCase,
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
import { loadOwnedProject, type OwnedProject } from "../lib/owned-project.js";
import { applyProgrammeCase, editProgrammeCaseSpace, loadActiveProgrammeCase, loadProgrammeHistory, programmeStateOf } from "../lib/programme-case.js";

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
  const rows = a && caseSums
    ? PROGRAMME_REPARTITION.families.map((f) => {
        const range = PROGRAMME_REPARTITION.types[rep.type]?.ratios[f.key] ?? [0, 0, 0];
        const ratio = caseSums.total ? ((caseSums[f.key as keyof typeof caseSums] as number) / caseSums.total) * 100 : 0;
        return { key: f.key, label: f.label, range: [range[0], range[2]] as [number, number], ratio, area: (caseSums[f.key as keyof typeof caseSums] as number) ?? 0 };
      })
    : programmeRows(PROGRAMME_REPARTITION, rep);
  const totals = a && caseSums
    ? { baseArea: caseSums.total, supportPercent: caseSums.total ? (caseSums.support / caseSums.total) * 100 : 0, supportArea: caseSums.support, netPercent: caseSums.total ? (caseSums.principal / caseSums.total) * 100 : 0, netArea: caseSums.principal }
    : programmeTotals(PROGRAMME_REPARTITION, rep);
  const state = programmeStateOf(project);
  const libraryCase = a ? buildingCase(BUILDING_LIBRARY, a.caseId) : null;
  return {
    repartition: rep,
    // Un type hors du référentiel de répartition (ex. « mixte » d'un cas importé) garde le libellé de son profil Harmonie.
    typeLabel: typeInfo?.label ?? harmonieProfile(HARMONIE_PROFILES, rep.type, rep.components).label,
    rows,
    totals,
    /** Projet importé depuis un exemple résolu : présentation « Répartition renseignée et liée au modèle » du prototype. */
    resolvedExample: project.sourceExampleId !== null,
    reference: {
      subtitle: PROGRAMME_REPARTITION.subtitle,
      modes: PROGRAMME_REPARTITION.modes,
      types: Object.entries(PROGRAMME_REPARTITION.types).map(([key, v]) => ({ key, label: v.label })),
      adjacency: PROGRAMME_REPARTITION.adjacency,
      statusNote: PROGRAMME_REPARTITION.statusNote,
      transfer: PROGRAMME_REPARTITION.transfer,
    },
    programmeCase: a && caseSums
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
        ? { title: attachmentCase.title ?? null, scenarioLabel: attachmentCase.scenarioLabel ?? null, revision: attachmentCase.revision ?? null, users: attachmentCase.users ?? null, spaceCount: attachmentCase.spaces?.length ?? 0, sums: caseSums, readOnly: true }
        : null,
  };
}

const projectIdOf = (req: Request) => (req.params as Record<string, string>)["projectId"] ?? "";

programmeRouter.get("/", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
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
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
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
  const result = await db.transaction((tx) => applyProgrammeCase(tx, project, parsed.data, now));
  const refreshed = await loadOwnedProject(project.id, req.user!.id);
  res.status(201).json({ ...(await repartitionView(refreshed ?? project)), applied: { revision: result.programmeCase.revision, conflicts: result.conflicts.length } });
});

const spaceSchema = z.object({ quantity: z.union([z.number(), z.string()]).optional(), unitArea: z.union([z.number(), z.string()]).optional() });

/** Adaptation d'une ligne du programme appliqué (quantité ou surface unitaire) ; surfaces et répartition recalculées, revues à reprendre. */
programmeRouter.patch("/case/spaces/:spaceId", async (req, res) => {
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const parsed = spaceSchema.safeParse(req.body);
  const key = parsed.success ? (parsed.data.quantity !== undefined ? "quantity" : parsed.data.unitArea !== undefined ? "unitArea" : null) : null;
  if (!parsed.success || !key) {
    res.status(400).json({ error: "invalid_input", details: { body: "quantity ou unitArea attendu" } });
    return;
  }
  const value = key === "quantity" ? parsed.data.quantity : parsed.data.unitArea;
  try {
    await db.transaction((tx) => editProgrammeCaseSpace(tx, project, req.params["spaceId"] as string, key, value, new Date().toISOString()));
  } catch (err) {
    res.status(422).json({ error: "programme_rule", message: err instanceof Error ? err.message : "Modification refusée." });
    return;
  }
  const refreshed = await loadOwnedProject(project.id, req.user!.id);
  res.json(await repartitionView(refreshed ?? project));
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
  const project = await loadOwnedProject(projectIdOf(req), req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
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
  await db
    .insert(programmeRepartitions)
    .values(next)
    .onConflictDoUpdate({ target: programmeRepartitions.projectId, set: next });
  res.json(await repartitionView(project));
});
