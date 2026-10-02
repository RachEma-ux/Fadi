/**
 * Péremption des propositions Harmonie (« À réexaminer ») — `fingerprint`,
 * `incoming` et `isStageStale` de h7-app (Parcours V7.1).
 *
 * Chaque étape a une empreinte des seules données pertinentes à sa décision
 * (`fingerprintInner` du prototype) : le site pour les premières étapes, le
 * type et les besoins déclarés pour la programmation, le programme et le
 * modèle dessiné pour la conception, la décision pour l'engagement — plus
 * les intentions reçues des étapes amont, avec leur version d'arbitrage et
 * l'état de péremption de leur origine. Quand l'empreinte change :
 *
 * - l'étape dont les propositions ont été générées sur une autre empreinte
 *   (`generatedHash`) est « à réexaminer » : ses choix sont conservés mais
 *   aucune vérification ne peut y être consignée avant « Actualiser les
 *   propositions » ;
 * - un choix retenu sur une autre empreinte (`acceptedHash`) est affiché
 *   « À réexaminer · choix conservé » jusqu'à sa confirmation.
 *
 * Aucune donnée n'est effacée par la péremption : elle se calcule à la lecture,
 * en ordre d'étapes (une étape ne dépend que de ses amont).
 */
import { buildHarmonieProposals, incomingIntentions, isStageStale, type HarmonieProfile, type HarmonieProfilesData, type HarmonieProposalComputation, type IncomingIntention } from "./harmonie.js";
import { fnv1a, semantic } from "./model-analysis.js";
import type { HarmonieStepState, ParcoursFieldValue, ParcoursStepDefinition } from "./parcours.js";
import type { SiteContext } from "./site.js";

/** Les données du projet qui entrent dans les empreintes (`p.data…` du prototype), déjà chargées par l'appelant. */
export interface StepFingerprintSources {
  /** `siteContext(p).hash` : parcelle, géolocalisation, observations déclarées et type. */
  siteHash: string;
  /** `profile(p).key`. */
  profileKey: string;
  /** Réponses du formulaire métier par étape (`p.data.business[n]`). */
  business: ReadonlyMap<number, Record<string, ParcoursFieldValue>>;
  /** Le cas de programme appliqué (`p.data.programmeCase`) ; `null` sans cas. */
  programmeCase: unknown;
  /** La répartition programmatique (`p.data.programmeRepartition`), repli de l'étape 07 sans cas appliqué. */
  programmeRepartition: unknown;
  /** `nativeParcel.setback` (règles d'implantation lues avec la parcelle), étape 02. */
  parcelSetback: unknown;
  /** `floorDesign`, `levels` et `buildingFootprint` du projet natif actif ; `null` sans modèle. */
  model: { floor: unknown; levels: unknown; footprint: unknown } | null;
  /** Références directionnelles du bâtiment (`harmony.compass`) ; `null` tant que l'outil n'est pas porté. */
  compass: unknown;
}

/** `siteContext(p).hash` : ce que l'étape 01 et les étapes qui lisent le site considèrent comme « leurs données ». */
export function siteContextHash(c: SiteContext): string {
  return fnv1a({
    parcel: {
      vertices: c.parcel.vertices,
      vertexIds: c.parcel.vertexIds,
      crs: c.parcel.crs,
      units: c.parcel.units,
      officialArea: c.parcel.officialArea,
      sourceFile: c.parcel.sourceFile,
      parcelNumber: c.parcel.parcelNumber,
      commune: c.parcel.commune,
    },
    geo: c.geo,
    obs: c.observations,
    type: { key: c.profile.key, label: c.profile.label, site: c.profile.site },
  });
}

/** `fingerprintInner` sans les intentions reçues : les données propres à chaque étape. */
export function stepFingerprintBase(stepNumber: number, src: StepFingerprintSources): Record<string, unknown> {
  const n = stepNumber;
  const b = (k: number): Record<string, ParcoursFieldValue> => src.business.get(k) ?? {};
  const site = src.siteHash;
  const type = src.profileKey;
  const programme = semantic(src.programmeCase ?? {});
  if (n === 1) return { site };
  if (n <= 3) return { site, fields: b(n), rules: n === 2 ? (src.parcelSetback ?? null) : null };
  if (n <= 6) return { site, type, fields: b(n), needs: [b(3), b(4), b(5)] };
  if (n === 7) return { type, programme: semantic(src.programmeCase ?? src.programmeRepartition ?? {}), pmo: b(6) };
  if (n === 8) return { programme, requirements: b(8), site };
  if (n === 9) return { site, programme, rules: b(2), compatibility: b(9) };
  if (n === 10 || n === 11 || n === 13 || n === 16) {
    return {
      site,
      programme,
      floor: semantic(src.model?.floor ?? {}),
      levels: src.model?.levels ?? [],
      footprint: src.model?.footprint ?? {},
      compass: src.compass ?? null,
      fields: b(n),
    };
  }
  return { type, fields: b(n), programme, decision: n >= 19 ? b(19) : null };
}

export interface StepDependency {
  /** Empreinte courante de l'étape (données propres + intentions reçues). */
  fingerprint: string;
  /** `isStageStale` : générée sur d'autres données → « à réexaminer ». */
  stale: boolean;
  incoming: IncomingIntention[];
}

export interface StepDependencyInput {
  def: ParcoursStepDefinition;
  state: HarmonieStepState;
  computed?: HarmonieProposalComputation | null;
}

/**
 * Les empreintes, états de péremption et intentions reçues des 21 étapes, en
 * une passe ordonnée (`dependencyScope` du prototype) : l'origine d'une
 * intention est déjà évaluée quand l'étape cible l'est.
 */
export function computeStepDependencies(data: HarmonieProfilesData, steps: readonly StepDependencyInput[], profile: HarmonieProfile, src: StepFingerprintSources): Map<number, StepDependency> {
  const out = new Map<number, StepDependency>();
  const sorted = [...steps].sort((a, b) => a.def.number - b.def.number);
  const staleOf = (n: number) => out.get(n)?.stale ?? false;
  for (const { def, state } of sorted) {
    const incoming = incomingIntentions(data, sorted, def.number, profile, staleOf);
    const fingerprint = fnv1a({
      ...stepFingerprintBase(def.number, src),
      incoming: incoming.map((q) => ({ id: q.id, text: q.text, status: q.status, version: q.decisionVersion, sourceStale: q.originStale })),
    });
    out.set(def.number, { fingerprint, stale: isStageStale(state, fingerprint), incoming });
  }
  return out;
}

/** Nombre de choix conservés mais à réexaminer dans une étape (chips « À réexaminer · choix conservé »). */
export function staleRetainedCount(data: HarmonieProfilesData, def: ParcoursStepDefinition, profile: HarmonieProfile, state: HarmonieStepState, computed: HarmonieProposalComputation | null, fingerprint: string | null): number {
  return buildHarmonieProposals(data, def, profile, state, computed, fingerprint).filter((q) => q.retained && q.stale).length;
}
