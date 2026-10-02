/**
 * Lecture du modèle natif d'un projet pour les étapes de conception (10, 11) :
 * niveaux et `floorDesign` du projet natif actif du magasin de l'Atelier,
 * parcelle et emprise pour l'empreinte, cibles du cas de programme appliqué
 * (liens de locaux). Le résultat (`analyseModel`) alimente les propositions
 * localisées de Harmonie et la proposition de départ de l'étape 10 ; les
 * domaines bruts entrent dans les empreintes de péremption des étapes de
 * conception (`dependencies.ts`).
 */
import { eq } from "drizzle-orm";
import { analyseModel, type ModelAnalysis, type ProgrammeCase } from "@parcours/domain-model";
import type { db } from "../db/client.js";
import { atelierStore } from "../db/schema.js";
import { isNativeFloorDesign, isNativeLevelArray } from "./native-projection.js";
import { loadActiveProgrammeCase } from "./programme-case.js";

type Querier = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Les domaines du projet natif actif, tels que le magasin les conserve (`readDomain` du prototype). */
export interface NativeDomains {
  nativeId: string;
  levels: unknown;
  floor: unknown;
  parcel: unknown;
  footprint: unknown;
}

/** `null` sans projet natif actif (projet sans Atelier ouvert). */
export async function loadNativeDomains(q: Querier, projectId: string): Promise<NativeDomains | null> {
  const rows = await q.select().from(atelierStore).where(eq(atelierStore.projectId, projectId));
  const active = rows.find((r) => r.key === "design.v13.activeProject")?.value;
  if (typeof active !== "string") return null;
  const entry = (domain: string) => rows.find((r) => r.key === `design.v13.project.${active}.${domain}`)?.value;
  return { nativeId: active, levels: entry("levels") ?? null, floor: entry("floorDesign") ?? null, parcel: entry("nativeParcel") ?? null, footprint: entry("buildingFootprint") ?? null };
}

/** L'analyse du modèle (`F.analyse`) à partir des domaines ; `null` quand niveaux ou `floorDesign` ne sont pas exploitables — rien n'est inventé. */
export function analyseNativeDomains(d: NativeDomains | null, programme: ProgrammeCase | null): ModelAnalysis | null {
  if (!d || !isNativeLevelArray(d.levels) || !isNativeFloorDesign(d.floor)) return null;
  return analyseModel({
    nativeId: d.nativeId,
    levels: d.levels as unknown as Parameters<typeof analyseModel>[0]["levels"],
    floor: d.floor as unknown as Parameters<typeof analyseModel>[0]["floor"],
    parcel: d.parcel ?? null,
    footprint: (d.footprint as { vertices?: unknown } | null)?.vertices ?? [],
    programme: programme ? { spaces: programme.spaces.map((s) => ({ id: s.id, quantity: s.quantity, unitArea: s.unitArea })), roomLinks: programme.roomLinks ?? {} } : null,
  });
}

/** `null` sans modèle natif : aucune proposition localisée n'est inventée. */
export async function loadModelAnalysis(q: Querier, projectId: string): Promise<ModelAnalysis | null> {
  const domains = await loadNativeDomains(q, projectId);
  if (!domains) return null;
  return analyseNativeDomains(domains, await loadActiveProgrammeCase(q, projectId));
}
