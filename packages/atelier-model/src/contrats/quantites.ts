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
] as const;
export type NatureQuantite = (typeof NATURES_QUANTITE)[number];

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
}

/** Signature du calcul (pur) : `src/quantites/calculer.ts` (L1.3). */
export type CalculerQuantites = (etat: EtatModele, filtre?: { readonly niveauId?: IdObjet; readonly natures?: readonly NatureQuantite[] }) => readonly Quantite[];
