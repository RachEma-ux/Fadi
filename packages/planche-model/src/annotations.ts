/**
 * Annotations et attributs de la Planche (lots 4 à 6) — types purs, rangés dans `Modele.annotations` :
 * guides du Mètre et du Rapporteur, cotes, textes, plans de coupe, matières d'apparence (C15), balises (P-9 : une
 * balise correspond à un calque de l'Atelier ; la correspondance est faite à la persistance, lot 7) et repère de
 * saisie des Axes (R5 : jamais le repère des coordonnées stockées). Les identifiants sortent du même compteur que la
 * géométrie (`prochainId`), préfixés : `g` guide, `c` cote, `t` texte, `p` plan de coupe, `m` matière, `b` balise.
 *
 * Les opérations sont dans `geometrie-libre.ts` (`modifierAnnotations`, `peindreFaces`, `peindreOccurrences`,
 * `baliserOccurrences`, `redimensionner`) : elles passent par le chantier `Travail`, donc par un pas d'annulation.
 */
import type { Id } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

export type Guide =
  /** Ligne de guide infinie (depuis une arête) : point et direction unitaire. */
  | { readonly id: Id; readonly genre: "ligne"; readonly origine: Vec3; readonly direction: Vec3 }
  /** Guide fini (depuis un point) : segment. */
  | { readonly id: Id; readonly genre: "segment"; readonly origine: Vec3; readonly fin: Vec3 }
  /** Point de guide. */
  | { readonly id: Id; readonly genre: "point"; readonly origine: Vec3 };

export type Cote =
  /** Cote linéaire entre deux points ; `sommets` = association aux sommets (la valeur suit leur déplacement). */
  | {
      readonly id: Id;
      readonly genre: "lineaire";
      readonly a: Vec3;
      readonly b: Vec3;
      readonly sommets?: readonly [Id, Id];
      /** Point par lequel passe la ligne de cote (décalage par rapport au segment mesuré). */
      readonly position: Vec3;
    }
  /** Cote de diamètre d'une courbe fermée (cercle, polygone). */
  | {
      readonly id: Id;
      readonly genre: "diametre";
      readonly courbe: Id;
      readonly centre: Vec3;
      readonly rayon: number;
      readonly normale: Vec3;
      readonly position: Vec3;
    };

export type TexteAnnotation =
  /** Texte avec repère : ancre sur une entité (ou un point), position du texte, ligne de rappel entre les deux. */
  | { readonly id: Id; readonly genre: "repere"; readonly ancre: Vec3; readonly entite?: Id; readonly position: Vec3; readonly texte: string }
  /** Texte écran : fixé en pixels, ne suit pas la caméra. */
  | { readonly id: Id; readonly genre: "ecran"; readonly ecran: { readonly x: number; readonly y: number }; readonly texte: string };

export interface PlanDeCoupe {
  readonly id: Id;
  readonly origine: Vec3;
  /** Normale unitaire : la partie du modèle du côté de la normale est coupée (cachée) quand la coupe est active. */
  readonly normale: Vec3;
  /** Axes unitaires du rectangle dessiné et ses demi-tailles (épouse la face d'origine). */
  readonly u: Vec3;
  readonly w: Vec3;
  readonly demiU: number;
  readonly demiW: number;
  readonly actif: boolean;
  readonly inverse: boolean;
  readonly nom: string;
}

/** Matière d'apparence : nom et couleur unie (`#rrggbb`), jamais une donnée de projet (C15, P-8). */
export interface Materiau {
  readonly id: Id;
  readonly nom: string;
  readonly couleur: string;
}

export interface Balise {
  readonly id: Id;
  readonly nom: string;
  readonly couleur: string;
  readonly visible: boolean;
}

/** Repère de saisie (outil Axes) : origine et axes unitaires rouge / vert / bleu dans le repère stocké. */
export interface Repere {
  readonly origine: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

export interface Annotations {
  readonly guides: Readonly<Record<Id, Guide>>;
  readonly cotes: Readonly<Record<Id, Cote>>;
  readonly textes: Readonly<Record<Id, TexteAnnotation>>;
  readonly plansDeCoupe: Readonly<Record<Id, PlanDeCoupe>>;
  readonly materiaux: Readonly<Record<Id, Materiau>>;
  readonly balises: Readonly<Record<Id, Balise>>;
  /** Absent : repère du modèle (origine, axes canoniques). */
  readonly repere?: Repere;
}

export const ANNOTATIONS_VIDES: Annotations = Object.freeze({
  guides: {},
  cotes: {},
  textes: {},
  plansDeCoupe: {},
  materiaux: {},
  balises: {},
});

/** Version mutable, utilisée par le chantier. */
export interface AnnotationsMutables {
  guides: Record<Id, Guide>;
  cotes: Record<Id, Cote>;
  textes: Record<Id, TexteAnnotation>;
  plansDeCoupe: Record<Id, PlanDeCoupe>;
  materiaux: Record<Id, Materiau>;
  balises: Record<Id, Balise>;
  repere?: Repere;
}

export const annotationsDe = (a: Annotations | undefined): Annotations => a ?? ANNOTATIONS_VIDES;

/** Genre d'annotation d'après le préfixe de l'identifiant (ou null pour une entité géométrique). */
export function genreAnnotation(id: Id): "guide" | "cote" | "texte" | "plan" | "materiau" | "balise" | null {
  switch (id.charAt(0)) {
    case "g":
      return "guide";
    case "c":
      return "cote";
    case "t":
      return "texte";
    case "p":
      return "plan";
    case "m":
      return "materiau";
    case "b":
      return "balise";
    default:
      return null;
  }
}

export const COULEUR_MATERIAU_DEFAUT = "#ffffff";
export const NOM_MATERIAU_DEFAUT = "Matière par défaut";
