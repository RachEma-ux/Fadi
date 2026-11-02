import type { Point2 } from "../../unites.js";

/**
 * Types du socle du document 2D natif de Studio (`studio-document/1`) : point, extrusion, calque, et la forme minimale
 * commune à tout objet 2D (`StudioShapeBase`). Le socle ne connaît aucun type d'objet : chaque type déclare son interface
 * dans son module (`objets/`) et l'union `StudioShape` les rassemble (`objets/formes.ts`) ; le document entier et les
 * commandes sont composés au-dessus (`composition/types.ts`). Toutes les coordonnées sont dans le repère explicite
 * `local-2d`, en mètres.
 */

/** Coordinates inherit the document's explicit local-2d frame and metre unit. */
export type StudioPoint = Pick<Point2, "x" | "y">;

/**
 * Déclaration d'extrusion d'un objet (extension additive, facultative), en mètres : `base` = cote du bas, `height` =
 * hauteur strictement positive, `thickness` = largeur de mur centrée sur la ligne (lignes seulement ; strictement
 * positive). Seules les valeurs saisies par l'utilisateur sont stockées : aucune valeur par défaut n'est inventée, un
 * objet sans extrusion est « non extrudé ». La géométrie 3D est dérivée (`studioMesh3d`), jamais stockée.
 */
export interface StudioExtrusion {
  base: number;
  height: number;
  thickness?: number;
  /**
   * Direction d'extrusion (lot F1, TEST-005 / A.4-07), choisie explicitement : `+z` (vers le haut : de `base` à
   * `base + height`) ou `-z` (vers le bas : de `base - height` à `base`). `base` reste la cote du plan du profil. Absente :
   * `+z`, seul sens des documents et commandes antérieurs au lot F1 (comportement historique, aucune valeur nouvelle).
   */
  direction?: StudioDirectionExtrusion;
}

/** Directions d'extrusion d'un objet 2D : normale au plan du profil, vers le haut ou vers le bas. */
export const STUDIO_DIRECTIONS_EXTRUSION = Object.freeze(["+z", "-z"] as const);
export type StudioDirectionExtrusion = (typeof STUDIO_DIRECTIONS_EXTRUSION)[number];

/** Cotes inférieure et supérieure d'une extrusion déclarée, selon sa direction (absente : +z). */
export function studioCotesExtrusion(e: Pick<StudioExtrusion, "base" | "height" | "direction">): { zMin: number; zMax: number } {
  return e.direction === "-z" ? { zMin: e.base - e.height, zMax: e.base } : { zMin: e.base, zMax: e.base + e.height };
}

/**
 * Discriminants des formes 2D (`StudioShape["type"]`), nommés au socle pour que les primitives d'écriture (`exporteurs/`)
 * les désignent sans connaître les objets. L'égalité avec l'union des objets est contrôlée à la compilation
 * (`objets/formes.ts`).
 */
export type StudioShapeType = "line" | "rectangle" | "circle" | "arc" | "polyline";

/** Forme minimale commune à tout objet 2D (identité, discriminant, calque) : chaque membre de `StudioShape` l'étend. */
export interface StudioShapeBase {
  id: string;
  type: StudioShapeType;
  layerId?: string;
}

export interface StudioLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}
