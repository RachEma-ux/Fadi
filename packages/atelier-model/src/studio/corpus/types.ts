import type { StudioDocument } from "../document-2d.js";

/**
 * Corpus de qualification Studio (X.1-01 à X.1-07, REF-02 §18.2) : scènes représentatives S1 à S7, générées de façon
 * **déterministe** (graine fixe) et **entièrement synthétiques** — géométrie seulement, aucune donnée de projet réelle ni
 * inventée (aucun matériau, aucune valeur réglementaire ou structurelle ; les libellés disent « synthétique »).
 *
 * Tailles : 100, 10 000 et 100 000 primitives sont des **tailles illustratives de test** (X.1-10, PERF-04), jamais des
 * engagements de capacité ; les seuils relèvent de DEC-13.
 *
 * Primitive : un élément du document — une entrée de `objects`, `dimensions`, `annotations`, `architecture` ou
 * `solides`. Un document `studio-document/1` est borné à `STUDIO_LIMITS.objects` (20 000) éléments ; au-delà, le corpus
 * est un **lot de feuillets** (plusieurs documents valides, chacun sous la borne), jamais un document refusé ni tronqué.
 * Un feuillet ne coupe jamais un motif : une cote ou une ouverture reste dans le document de l'objet qu'elle vise.
 */

export type SceneCorpus = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
export const SCENES_CORPUS: readonly SceneCorpus[] = Object.freeze(["S1", "S2", "S3", "S4", "S5", "S6", "S7"] as const);

/** Tailles illustratives (X.1-10) : des tailles de jeux d'essai, pas des engagements de capacité. */
export const TAILLES_ILLUSTRATIVES = Object.freeze([100, 10_000, 100_000] as const);
export type TailleIllustrative = (typeof TAILLES_ILLUSTRATIVES)[number];

/** Graines fixes, une par scène (reproductibilité). */
export const GRAINES_CORPUS: Readonly<Record<SceneCorpus, number>> = Object.freeze({ S1: 101, S2: 202, S3: 303, S4: 404, S5: 505, S6: 606, S7: 707 });

/** Licence d'utilisation (REF-02 §18.2) : non tranchée ici — le corpus est généré dans le dépôt, sans source tierce. */
export const LICENCE_CORPUS = "Licence à valider par le maître d'ouvrage (corpus synthétique, généré par le dépôt Fadi : géométrie seule, aucune source tierce).";
export const AVERTISSEMENT_CORPUS = "Géométrie synthétique de test : aucune donnée de projet réelle ni inventée ; tailles illustratives (X.1-10), non des engagements de capacité.";

/** Ce que la scène de REF-02 §18.2 demande et que le document `studio-document/1` ne peut pas représenter. */
export interface ElementAbsent { element: string; raison: string }

export interface CouvertureCorpus {
  /** Éléments de la définition REF-02 §18.2 effectivement représentés. */
  representes: string[];
  /** Éléments de la définition absents du modèle Studio actuel : déclarés, jamais simulés. */
  absents: ElementAbsent[];
}

export interface CorpusStudio {
  scene: SceneCorpus;
  /** Définition exacte de la scène (REF-02 §18.2). */
  definition: string;
  taille: number;
  graine: number;
  synthetique: true;
  licence: string;
  avertissement: string;
  /** Primitives par motif répété (un feuillet ne coupe jamais un motif). */
  motif: number;
  /** Feuillets : un seul document jusqu'à 20 000 primitives. */
  documents: StudioDocument[];
  couverture: CouvertureCorpus;
}
