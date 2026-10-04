/**
 * Lecture du modèle d'un projet pour les étapes de conception (10, 11) et les autres consommateurs (cahier §5.6) :
 * le modèle typé de l'Atelier (`atelier_*`) projeté dans la forme des domaines natifs (`projeterDomainesNatifs` de
 * `@parcours/atelier-model`, sans perte pour P.118) — niveaux, `floorDesign`, parcelle et emprise —, et les cibles
 * du cas de programme appliqué (liens de locaux). Le résultat (`analyseModel`) alimente les propositions localisées
 * de Harmonie et la proposition de départ de l'étape 10 ; les domaines bruts entrent dans les empreintes de
 * péremption des étapes de conception (`dependencies.ts`).
 */
import { analyseModel, type ModelAnalysis, type ProgrammeCase } from "@parcours/domain-model";
import { projeterDomainesNatifs, type EtatModele } from "@parcours/atelier-model";
import type { db } from "../db/client.js";
import { chargerEtat } from "./atelier-rows.js";
import { loadActiveProgrammeCase } from "./programme-case.js";

type Querier = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Les domaines projetés du modèle typé, dans la forme que lisent l'analyse et les empreintes. */
export interface NativeDomains {
  nativeId: string;
  levels: unknown;
  floor: unknown;
  parcel: unknown;
  footprint: unknown;
}

/**
 * Domaines d'un état typé ; `null` sans niveau ni site (modèle vide). Sans niveau, seuls la parcelle et l'emprise
 * transmises sont lues (niveaux et plan à `null`) : aucun bâtiment n'est analysé ni inventé.
 */
export function domainsOf(etat: EtatModele | null): NativeDomains | null {
  if (!etat) return null;
  const objets = Object.values(etat.objets);
  const batiment = objets.some((o) => o.classe === "niveau");
  if (!batiment && !objets.some((o) => o.classe === "parcelle" || o.classe === "emprise")) return null;
  const d = projeterDomainesNatifs(etat);
  return {
    nativeId: d.nativeId,
    levels: batiment ? d.domains.levels : null,
    floor: batiment ? d.domains.floorDesign : null,
    parcel: d.domains.nativeParcel ?? null,
    footprint: d.domains.buildingFootprint ?? null,
  };
}

/** `null` sans modèle typé ou sans niveau (projet sans Atelier ouvert). */
export async function loadNativeDomains(q: Querier, projectId: string): Promise<NativeDomains | null> {
  return domainsOf(await chargerEtat(q, projectId));
}

/** L'analyse du modèle (`F.analyse`) à partir des domaines ; `null` sans domaines — rien n'est inventé. */
export function analyseNativeDomains(d: NativeDomains | null, programme: ProgrammeCase | null): ModelAnalysis | null {
  if (!d || !Array.isArray(d.levels)) return null;
  return analyseModel({
    nativeId: d.nativeId,
    levels: d.levels as Parameters<typeof analyseModel>[0]["levels"],
    floor: d.floor as Parameters<typeof analyseModel>[0]["floor"],
    parcel: d.parcel ?? null,
    footprint: (d.footprint as { vertices?: unknown } | null)?.vertices ?? [],
    programme: programme ? { spaces: programme.spaces.map((s) => ({ id: s.id, quantity: s.quantity, unitArea: s.unitArea })), roomLinks: programme.roomLinks ?? {} } : null,
  });
}

/** `null` sans modèle : aucune proposition localisée n'est inventée. */
export async function loadModelAnalysis(q: Querier, projectId: string): Promise<ModelAnalysis | null> {
  const domains = await loadNativeDomains(q, projectId);
  if (!domains) return null;
  return analyseNativeDomains(domains, await loadActiveProgrammeCase(q, projectId));
}
