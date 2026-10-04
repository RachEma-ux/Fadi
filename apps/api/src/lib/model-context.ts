/**
 * Lecture du modèle d'un projet pour les étapes de conception (10, 11), le bilan, le site et les documents :
 * le modèle typé de l'Atelier (`atelier_*`, cahier §5.5) projeté vers l'entrée d'analyse
 * (`projeterPourAnalyse` de `@parcours/atelier-model`, même forme que les domaines du moteur V14 consommés
 * jusqu'au lot 4), avec les cibles du cas de programme appliqué (liens de locaux). Le résultat (`analyseModel`)
 * alimente les propositions localisées de Harmonie et la proposition de départ de l'étape 10 ; les domaines
 * entrent dans les empreintes de péremption des étapes de conception (`dependencies.ts`).
 */
import { analyseModel, type ModelAnalysis, type ProgrammeCase } from "@parcours/domain-model";
import { projeterPourAnalyse } from "@parcours/atelier-model";
import { chargerModele, type Querier } from "./atelier-modele.js";
import { loadActiveProgrammeCase } from "./programme-case.js";

/** Les domaines d'analyse du modèle typé (niveaux, plan par niveau, parcelle, emprise). */
export interface ModelDomains {
  nativeId: string;
  levels: unknown;
  floor: unknown;
  parcel: unknown;
  footprint: { vertices: [number, number][] } | null;
}

/** `null` sans modèle typé (projet dont l'Atelier n'a jamais été ouvert ni importé). */
export async function loadModelDomains(q: Querier, projectId: string): Promise<ModelDomains | null> {
  const charge = await chargerModele(q, projectId);
  if (!charge) return null;
  const e = projeterPourAnalyse(charge.etat, charge.nativeId);
  return { nativeId: e.nativeId, levels: e.levels, floor: e.floor, parcel: e.parcel, footprint: e.footprint.length ? { vertices: e.footprint } : null };
}

/** L'analyse du modèle (`F.analyse`) ; `null` sans niveau — rien n'est inventé. */
export function analyseModelDomains(d: ModelDomains | null, programme: ProgrammeCase | null): ModelAnalysis | null {
  if (!d || !Array.isArray(d.levels) || d.levels.length === 0) return null;
  return analyseModel({
    nativeId: d.nativeId,
    levels: d.levels as unknown as Parameters<typeof analyseModel>[0]["levels"],
    floor: d.floor as unknown as Parameters<typeof analyseModel>[0]["floor"],
    parcel: d.parcel ?? null,
    footprint: d.footprint?.vertices ?? [],
    programme: programme ? { spaces: programme.spaces.map((s) => ({ id: s.id, quantity: s.quantity, unitArea: s.unitArea })), roomLinks: programme.roomLinks ?? {} } : null,
  });
}

/** `null` sans modèle : aucune proposition localisée n'est inventée. */
export async function loadModelAnalysis(q: Querier, projectId: string): Promise<ModelAnalysis | null> {
  const domains = await loadModelDomains(q, projectId);
  if (!domains) return null;
  return analyseModelDomains(domains, await loadActiveProgrammeCase(q, projectId));
}
