/**
 * AC-005 / MES-03 — « Les opérations sélection, orbite, zoom, poussé/tiré et changement de matériau passent les tests de
 * fidélité géométrique avant et après toute optimisation. Les profils GPU sont évalués séparément de mesures faites sous
 * SwiftShader. » ; MES-03 : « Mesurer séparément transfert, activation, calcul, rendu CPU/GPU, invalidation et mémoire
 * résiduelle. »
 *
 * Pur : verdict d'un rapport de comparaison « avant optimisation » (chemin de référence : maillage complet, un objet
 * three.js par objet Studio, ni cache, ni lots, ni instanciation) / « après » (chemin servi : invalidation, maillage des
 * seuls objets invalidés, scène incrémentale en lots et instances). Chaque opération doit être présente, fidèle
 * (mêmes désignations et mêmes distances sur la grille de rayons, mêmes triangles, mêmes aspects) et mesurée poste par
 * poste. Le rendu GPU n'est jamais rempli sous rendu logiciel : un temps GPU dans un rapport SwiftShader est refusé.
 */

export const STUDIO_RAPPORT_OPTIMISATION_SCHEMA = "studio-rapport-optimisation-3d/1" as const;
export const STUDIO_OPERATIONS_FIDELITE = Object.freeze(["selection", "orbite", "zoom", "pousser-tirer", "materiau"] as const);
export type StudioOperationFidelite = (typeof STUDIO_OPERATIONS_FIDELITE)[number];

/** Postes mesurés séparément (MES-03) ; `renduGpuMs` reste `null` (« non évalué ») sans GPU physique. */
export interface StudioMesuresSeparees {
  /** Copie vers / depuis le Worker de maillage (clonage structuré) : durée et taille sérialisée. */
  transfertMs: number | null;
  transfertOctets: number | null;
  /** Mise en route du moteur de rendu (scène, groupes, rendu) : mesurée une fois, rapportée à chaque opération. */
  activationMs: number | null;
  /** Invalidation, maillage, fusion des morceaux et assemblage. */
  calculMs: number | null;
  /** Durée JavaScript de `renderer.render()` : temps CPU, jamais un coût GPU (EX-097). */
  renduCpuMs: number | null;
  renduGpuMs: number | null;
  /** Objets désignés à remailler, reconstruction complète, objets three.js reconstruits. */
  invalidation: { objets: number; complet: boolean; reconstruits: number; ms: number } | null;
  /** Tas JavaScript après ramasse-miettes, après l'opération, moins celui d'avant (octets). */
  memoireResiduelleOctets: number | null;
}

export interface StudioFideliteOperation {
  rayons: number;
  /** Rayons dont l'objet désigné diffère entre les deux chemins. */
  divergences: number;
  /** Plus grand écart de distance d'impact entre les deux chemins (m). */
  ecartDistanceMax: number;
  /** Rayons dont la couleur (aspect) de l'objet touché diffère. */
  aspectsDivergents: number;
  trianglesReference: number;
  trianglesOptimise: number;
}

export interface StudioComparaisonOperation {
  operation: StudioOperationFidelite;
  reference: StudioMesuresSeparees;
  optimise: StudioMesuresSeparees;
  fidelite: StudioFideliteOperation;
}

export interface StudioRapportOptimisation {
  schema: typeof STUDIO_RAPPORT_OPTIMISATION_SCHEMA;
  environnement: { etiquette: string; renduLogiciel: boolean };
  operations: StudioComparaisonOperation[];
}

/** Tolérance de distance : les deux chemins lisent les mêmes tableaux Float32 ; seul l'arrondi du lancer de rayon joue. */
export const STUDIO_TOLERANCE_FIDELITE_M = 1e-6;

export interface StudioVerdictOptimisation {
  verdict: "fidele" | "infidele" | "incomplet" | "refuse";
  operationsManquantes: StudioOperationFidelite[];
  infideles: { operation: StudioOperationFidelite; motif: string }[];
  postesManquants: { operation: StudioOperationFidelite; chemin: "reference" | "optimise"; poste: string }[];
  refus: string[];
  gpu: "non évalué" | "mesuré";
}

const POSTES = ["transfertMs", "transfertOctets", "activationMs", "calculMs", "renduCpuMs", "invalidation", "memoireResiduelleOctets"] as const;

export function studioJugerOptimisation(r: StudioRapportOptimisation | null | undefined): StudioVerdictOptimisation {
  const v: StudioVerdictOptimisation = { verdict: "fidele", operationsManquantes: [], infideles: [], postesManquants: [], refus: [], gpu: "non évalué" };
  if (!r || r.schema !== STUDIO_RAPPORT_OPTIMISATION_SCHEMA) return { ...v, verdict: "incomplet", refus: ["rapport absent ou d'un autre schéma"], operationsManquantes: [...STUDIO_OPERATIONS_FIDELITE] };
  for (const op of STUDIO_OPERATIONS_FIDELITE) if (!r.operations.some((o) => o.operation === op)) v.operationsManquantes.push(op);
  for (const o of r.operations) {
    const f = o.fidelite;
    if (!(f.rayons > 0)) v.infideles.push({ operation: o.operation, motif: "aucun rayon lancé" });
    if (f.divergences > 0) v.infideles.push({ operation: o.operation, motif: `${f.divergences} rayon(s) désignant un autre objet` });
    if (!(f.ecartDistanceMax <= STUDIO_TOLERANCE_FIDELITE_M)) v.infideles.push({ operation: o.operation, motif: `écart de distance ${f.ecartDistanceMax} m > ${STUDIO_TOLERANCE_FIDELITE_M} m` });
    if (f.aspectsDivergents > 0) v.infideles.push({ operation: o.operation, motif: `${f.aspectsDivergents} rayon(s) d'aspect différent` });
    if (f.trianglesReference !== f.trianglesOptimise) v.infideles.push({ operation: o.operation, motif: `triangles ${f.trianglesOptimise} au lieu de ${f.trianglesReference}` });
    for (const chemin of ["reference", "optimise"] as const) {
      const m = o[chemin];
      for (const p of POSTES) if (m[p] === null || m[p] === undefined) v.postesManquants.push({ operation: o.operation, chemin, poste: p });
      if (m.renduGpuMs !== null && m.renduGpuMs !== undefined) {
        if (r.environnement.renduLogiciel) v.refus.push(`${o.operation} (${chemin}) : temps GPU présenté sous rendu logiciel (${r.environnement.etiquette})`);
        else v.gpu = "mesuré";
      }
    }
  }
  v.verdict = v.refus.length ? "refuse" : v.infideles.length ? "infidele" : v.operationsManquantes.length || v.postesManquants.length ? "incomplet" : "fidele";
  return v;
}
