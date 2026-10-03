/**
 * Contrat des quantités (L1.3, `src/quantites/**`, règle `quantites/1`). Types seulement.
 *
 * Une quantité est reproductible : même état (révision, empreinte) + même règle → même valeur, bit à bit.
 * Elle porte la révision et l'empreinte dont elle est issue (R11) ; une valeur non calculable est
 * « non évaluée », jamais estimée.
 */
import type { IdObjet } from "../ontologie/classes.js";
import type { NonEvaluee } from "../ontologie/provenance.js";
import type { Unite } from "../ontologie/unites.js";
import type { EtatModele } from "./etat.js";

export const REGLE_QUANTITES = "quantites/1";
export type RegleQuantites = typeof REGLE_QUANTITES;

/**
 * Natures de la règle `quantites/1`. Les neuf premières sont celles du contrat initial ; les suivantes
 * (volumes, dalles, poteaux, escaliers, solides, aire déclarée et écart des pièces) y sont intégrées par D-026.
 */
export const NATURES_QUANTITE = [
  "aire-piece",
  "aire-pieces-niveau",
  "aire-espace",
  "aire-zone",
  "longueur-mur",
  "aire-mur",
  "effectif-portes",
  "effectif-fenetres",
  "effectif-ouvertures",
  // D-026
  "aire-mur-brute",
  "aire-baies-mur",
  "volume-mur",
  "aire-baie",
  "aire-dalle",
  "volume-dalle",
  "effectif-poteaux",
  "volume-poteau",
  "effectif-escaliers",
  "effectif-escaliers-reference-plan",
  "volume-solide",
  "aire-piece-declaree",
  "ecart-aire-piece",
] as const;
export type NatureQuantite = (typeof NATURES_QUANTITE)[number];

/**
 * Statut d'une quantité (D-026) : `calculee` ; `a-verifier` = une entrée porte le statut « à vérifier » (ex.
 * épaisseur 0,25 m des dalles P.118) — la valeur est rendue, jamais masquée (parité DA-16-10), mais n'est pas
 * présentée comme sûre ; `non-evaluee` = valeur non calculable (`valeur` est alors `NonEvaluee`).
 */
export const STATUTS_QUANTITE = ["calculee", "a-verifier", "non-evaluee"] as const;
export type StatutQuantite = (typeof STATUTS_QUANTITE)[number];

/** Agrégat partiel (D-026) : somme des entrées évaluées et entrées non évaluées (la valeur est non évaluée). */
export interface QuantitePartielle {
  readonly somme: number;
  readonly nonEvalues: readonly IdObjet[];
}

/** Unité d'une quantité : grandeur SI, ou `unite` pour un effectif (compte d'objets). */
export type UniteQuantite = Unite | "unite";

export interface Quantite {
  readonly nature: NatureQuantite;
  /** Valeur ; `NonEvaluee` si non calculable (ex. pièce sans tracé courant). */
  readonly valeur: number | NonEvaluee;
  readonly unite: UniteQuantite;
  readonly regle: RegleQuantites;
  readonly revision: number;
  readonly empreinte: string;
  /** Objet mesuré (pièce, mur) ou niveau agrégé. */
  readonly objetId?: IdObjet;
  readonly niveauId?: IdObjet;
  /** Objets entrant dans le calcul (traçabilité). */
  readonly entrees: readonly IdObjet[];
  readonly statut: StatutQuantite;
  /** Présent seulement pour un agrégat dont une entrée est non évaluée. */
  readonly partiel?: QuantitePartielle;
}

/** Signature du calcul (pur) : `src/quantites/calculer.ts` (L1.3). */
export type CalculerQuantites = (etat: EtatModele, filtre?: { readonly niveauId?: IdObjet; readonly natures?: readonly NatureQuantite[] }) => readonly Quantite[];
