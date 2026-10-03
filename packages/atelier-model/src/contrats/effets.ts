/**
 * Effets d'une commande ou d'un lot (cahier §5.3) : objets créés / modifiés / supprimés, relations et
 * références touchées, vues et documents à recalculer (R11, T07), problèmes. Types seulement.
 */
import type { IdObjet } from "../ontologie/classes.js";
import type { Relation } from "../ontologie/relations.js";
import type { Probleme } from "./probleme.js";
import type { ReferenceTopologique } from "./references.js";

/** Vue dérivée touchée (plan de niveau, 3D, coupe, nomenclature…). */
export interface EffetVue {
  readonly nature: "plan-niveau" | "vue-3d" | "coupe" | "facade" | "nomenclature" | "metre";
  /** Absent = toutes les vues de cette nature. */
  readonly niveauId?: IdObjet;
  readonly etat: "a-recalculer";
}

/** Document dérivé périmé par la commande (R11) : reste consultable, n'est plus présenté comme actuel. */
export interface EffetDocument {
  /** Nature (aperçu conceptuel, bilan Harmonie, feuille, export…). */
  readonly nature: string;
  readonly documentId?: string;
  readonly etat: "perime";
}

export interface Effets {
  readonly objetsCrees: readonly IdObjet[];
  readonly objetsModifies: readonly IdObjet[];
  readonly objetsSupprimes: readonly IdObjet[];
  readonly relationsAjoutees: readonly Relation[];
  readonly relationsRetirees: readonly Relation[];
  /** Références dont l'état de résolution a changé (devenues « à réparer », réparées, détachées). */
  readonly referencesTouchees: readonly { readonly porteurId: IdObjet; readonly reference: ReferenceTopologique }[];
  readonly vues: readonly EffetVue[];
  readonly documents: readonly EffetDocument[];
  readonly problemes: readonly Probleme[];
}

/** Effets vides (constante de contrat, utile aux réducteurs qui n'ont rien à signaler). */
export const EFFETS_VIDES: Effets = {
  objetsCrees: [],
  objetsModifies: [],
  objetsSupprimes: [],
  relationsAjoutees: [],
  relationsRetirees: [],
  referencesTouchees: [],
  vues: [],
  documents: [],
  problemes: [],
};
