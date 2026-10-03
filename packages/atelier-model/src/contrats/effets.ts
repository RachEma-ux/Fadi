/**
 * Effets d'une commande ou d'un lot (cahier §5.3) : objets créés / modifiés / supprimés, relations et
 * références touchées, vues et documents à recalculer (R11, T07), problèmes. Types seulement.
 */
import type { IdObjet } from "../ontologie/classes.js";
import type { Tracabilite } from "../ontologie/provenance.js";
import type { PointLocal, Polygone } from "../ontologie/reperes.js";
import type { Aire } from "../ontologie/unites.js";
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

/**
 * Contour de pièce proposé par `piece.detecter` (D-024) : jamais appliqué d'office ; la création passe par
 * `piece.creer`. Provenance `calcul`, statut `a-verifier` (proposition à vérifier par l'utilisateur).
 */
export interface PropositionContourPiece extends Tracabilite {
  readonly nature: "contour-piece";
  readonly niveauId: IdObjet;
  /** Contour fermé (repère local du projet), sans répétition du premier sommet. */
  readonly contour: Polygone<PointLocal>;
  /** Aire calculée du contour. */
  readonly aire: Aire;
}

/** Proposition rendue par une commande, jamais appliquée d'office (D-024). */
export type Proposition = PropositionContourPiece;

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
  /** Propositions (contours de pièces détectés…) ; rien n'est créé tant qu'une commande ne l'applique pas. */
  readonly propositions: readonly Proposition[];
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
  propositions: [],
};
