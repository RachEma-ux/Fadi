/** Sommets nommés des objets, cibles des liens de cote (`StudioDimensionLink`). */

export type StudioLineAnchor = "start" | "end";
/** Sommets du rectangle nommés par construction (origine, origine + largeur, origine + hauteur, opposé). */
export type StudioRectangleAnchor = "corner-origin" | "corner-width" | "corner-height" | "corner-opposite";
/**
 * Sommets des courbes et milieux : `mid` (milieu d'une ligne ou d'un arc), `center` (cercle, arc), quadrants d'un cercle
 * (angle en degrés), `vertex-i` (sommet i d'une polyligne) et `mid-i` (milieu de son segment i).
 */
export type StudioCurveAnchor = "mid" | "center" | "quadrant-0" | "quadrant-90" | "quadrant-180" | "quadrant-270" | `vertex-${number}` | `mid-${number}`;
export type StudioAnchor = StudioLineAnchor | StudioRectangleAnchor | StudioCurveAnchor;
export const STUDIO_FIXED_ANCHORS: readonly StudioAnchor[] = Object.freeze(["start", "end", "corner-origin", "corner-width", "corner-height", "corner-opposite", "mid", "center", "quadrant-0", "quadrant-90", "quadrant-180", "quadrant-270"] as const);
/** Sommet ou milieu indexé d'une polyligne (index canonique, sans zéro de tête). */
export const STUDIO_INDEXED_ANCHOR = /^(vertex|mid)-(0|[1-9][0-9]{0,4})$/;
export const STUDIO_LINE_ANCHORS: readonly StudioLineAnchor[] = Object.freeze(["start", "end"] as const);
export const STUDIO_RECTANGLE_ANCHORS: readonly StudioRectangleAnchor[] = Object.freeze(["corner-origin", "corner-width", "corner-height", "corner-opposite"] as const);
