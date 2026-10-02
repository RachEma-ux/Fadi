/**
 * Lecture du modèle natif d'un projet pour les étapes de conception (10, 11) :
 * niveaux et `floorDesign` du projet natif actif du magasin de l'Atelier,
 * parcelle et emprise pour l'empreinte, cibles du cas de programme appliqué
 * (liens de locaux). Le résultat (`analyseModel`) alimente les propositions
 * localisées de Harmonie et la proposition de départ de l'étape 10.
 */
import { eq } from "drizzle-orm";
import { analyseModel, type ModelAnalysis, type ProgrammeCase } from "@parcours/domain-model";
import type { db } from "../db/client.js";
import { atelierStore } from "../db/schema.js";
import { isNativeFloorDesign, isNativeLevelArray } from "./native-projection.js";
import { loadActiveProgrammeCase } from "./programme-case.js";

type Querier = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `null` sans modèle natif (projet sans Atelier ouvert) : aucune proposition localisée n'est inventée. */
export async function loadModelAnalysis(q: Querier, projectId: string): Promise<ModelAnalysis | null> {
  const rows = await q.select().from(atelierStore).where(eq(atelierStore.projectId, projectId));
  const active = rows.find((r) => r.key === "design.v13.activeProject")?.value;
  if (typeof active !== "string") return null;
  const entry = (domain: string) => rows.find((r) => r.key === `design.v13.project.${active}.${domain}`)?.value;
  const levels = entry("levels");
  const floor = entry("floorDesign");
  if (!isNativeLevelArray(levels) || !isNativeFloorDesign(floor)) return null;
  const programme: ProgrammeCase | null = await loadActiveProgrammeCase(q, projectId);
  return analyseModel({
    nativeId: active,
    levels: levels as unknown as Parameters<typeof analyseModel>[0]["levels"],
    floor: floor as unknown as Parameters<typeof analyseModel>[0]["floor"],
    parcel: entry("nativeParcel") ?? null,
    footprint: (entry("buildingFootprint") as { vertices?: unknown } | undefined)?.vertices ?? [],
    programme: programme ? { spaces: programme.spaces.map((s) => ({ id: s.id, quantity: s.quantity, unitArea: s.unitArea })), roomLinks: programme.roomLinks ?? {} } : null,
  });
}
