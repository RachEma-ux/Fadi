/**
 * Contrat des références topologiques (L1.3, `src/references/**`). Types seulement.
 *
 * Une référence vise une caractéristique nommée d'un objet (`mur:face-gauche`, `dalle:contour[2]`…).
 * Résolution : `resolue` (géométrie retrouvée), `a-reparer` (objet scindé, supprimé, caractéristique
 * disparue : propositions, jamais de rattachement silencieux, R12), `libre` (pas de référence : cote du
 * prototype, D-019), `detachee` (l'utilisateur a choisi de détacher).
 */
import type { CaracteristiqueNommee } from "../ontologie/caracteristiques.js";
import type { IdObjet } from "../ontologie/classes.js";
import type { PointLocal, Segment } from "../ontologie/reperes.js";
import type { EtatModele } from "./etat.js";

export interface ReferenceTopologique {
  readonly objetId: IdObjet;
  readonly caracteristique: CaracteristiqueNommee;
}

export const ETATS_RESOLUTION = ["resolue", "a-reparer", "libre", "detachee"] as const;
export type EtatResolution = (typeof ETATS_RESOLUTION)[number];

/** Géométrie d'une caractéristique résolue : un point (centre, départ…) ou un segment (face, arête, axe). */
export type GeometrieCaracteristique = { readonly nature: "point"; readonly point: PointLocal } | { readonly nature: "segment"; readonly segment: Segment<PointLocal> };

export type MotifAReparer = "objet-supprime" | "objet-scinde" | "caracteristique-absente" | "classe-incompatible" | "geometrie-degeneree";

export interface PropositionReparation {
  /** Nouvelle cible proposée ; `null` = détacher (la cote devient libre). */
  readonly cible: ReferenceTopologique | null;
  readonly libelle: string;
  /** Distance entre l'ancienne géométrie et la proposée (m), pour classer les propositions. */
  readonly ecart?: number;
}

export type ResolutionReference =
  | { readonly etat: "resolue"; readonly reference: ReferenceTopologique; readonly geometrie: GeometrieCaracteristique }
  | { readonly etat: "a-reparer"; readonly reference: ReferenceTopologique; readonly motif: MotifAReparer; readonly propositions: readonly PropositionReparation[] }
  | { readonly etat: "libre" }
  | { readonly etat: "detachee"; readonly ancienne: ReferenceTopologique };

/** Signature du résolveur (pur) : `src/references/resoudre.ts` (L1.3). */
export type ResoudreReference = (etat: EtatModele, reference: ReferenceTopologique) => ResolutionReference;
