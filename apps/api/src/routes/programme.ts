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
  defaultProgrammeRepartition,
  harmonieProfile,
  programmeCaseSums,
  programmeRows,
  programmeTotals,
  type ProgrammeRepartition,
  type ProgrammeSpace,
} from "@parcours/domain-model";
import { db } from "../db/client.js";
import { programmeRepartitions } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { HARMONIE_PROFILES, PROGRAMME_REPARTITION } from "../data/parcours.js";
import { loadOwnedProject } from "../lib/owned-project.js";

export const programmeRouter = Router({ mergeParams: true });
programmeRouter.use(requireAuth);

export interface StoredRepartition extends ProgrammeRepartition {
  components: string[];
  stored: boolean;
}

/** Le réglage du projet, ou les valeurs par défaut du référentiel tant qu'il n'a jamais été modifié (`programmeStore()` du prototype). */
export async function loadProgrammeRepartition(projectId: string): Promise<StoredRepartition> {
  const rows = await db.select().from(programmeRepartitions).where(eq(programmeRepartitions.projectId, projectId)).limit(1);
  const row = rows[0];
  if (!row) return { ...defaultProgrammeRepartition(PROGRAMME_REPARTITION), components: [], stored: false };
  const mode = (PROGRAMME_MODES as readonly string[]).includes(row.mode) ? (row.mode as ProgrammeRepartition["mode"]) : "cible";
  return { type: row.type, baseArea: row.baseArea, mode, custom: { ...row.custom }, components: [...row.components], stored: true };
}

function repartitionView(rep: StoredRepartition, attachment: Record<string, unknown> | null) {
  const typeInfo = PROGRAMME_REPARTITION.types[rep.type];
  // Cas de programme importé (exemple P.118) : sommes par famille calculées
  // depuis les fiches d'espaces, jamais recopiées.
  const programmeCase = attachment?.["programmeCase"] as { title?: string; scenarioLabel?: string; revision?: number; spaces?: ProgrammeSpace[]; users?: string } | undefined;
  const caseSums = programmeCase?.spaces ? programmeCaseSums(programmeCase.spaces) : null;
  return {
    repartition: rep,
    // Un type hors du référentiel de répartition (ex. « mixte » d'un cas importé) garde le libellé de son profil Harmonie.
    typeLabel: typeInfo?.label ?? harmonieProfile(HARMONIE_PROFILES, rep.type, rep.components).label,
    rows: programmeRows(PROGRAMME_REPARTITION, rep),
    totals: programmeTotals(PROGRAMME_REPARTITION, rep),
    reference: {
      subtitle: PROGRAMME_REPARTITION.subtitle,
      modes: PROGRAMME_REPARTITION.modes,
      types: Object.entries(PROGRAMME_REPARTITION.types).map(([key, v]) => ({ key, label: v.label })),
      adjacency: PROGRAMME_REPARTITION.adjacency,
      statusNote: PROGRAMME_REPARTITION.statusNote,
      transfer: PROGRAMME_REPARTITION.transfer,
    },
    programmeCase: programmeCase && caseSums
      ? { title: programmeCase.title ?? null, scenarioLabel: programmeCase.scenarioLabel ?? null, revision: programmeCase.revision ?? null, users: programmeCase.users ?? null, spaceCount: programmeCase.spaces?.length ?? 0, sums: caseSums }
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
  res.json(repartitionView(await loadProgrammeRepartition(project.id), project.sourceAttachment));
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
  res.json(repartitionView(await loadProgrammeRepartition(project.id), project.sourceAttachment));
});
