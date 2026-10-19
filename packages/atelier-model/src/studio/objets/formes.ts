import type { StudioArc } from "./arc.js";
import type { StudioCircle } from "./cercle.js";
import type { StudioDimension } from "./cote.js";
import type { StudioAngularDimension } from "./cote-angulaire.js";
import type { StudioLine } from "./ligne.js";
import type { StudioPolyline } from "./polyligne.js";
import type { StudioRectangle } from "./rectangle.js";
import type { StudioText } from "./texte.js";

/**
 * Unions des objets 2D du document : chaque type d'objet déclare son interface dans son module (`objets/`) ; ces unions
 * les rassemblent. Le socle (`noyau/types.ts`) n'en connaît que la forme minimale (`StudioShapeBase`) et les
 * discriminants (`StudioShapeType`), dont l'accord est contrôlé à la compilation (`formes.test.ts`).
 */

export type StudioShape = StudioLine | StudioRectangle | StudioCircle | StudioArc | StudioPolyline;
/** Annotations (cotes angulaires, textes), rangées à part dans `StudioDocument.annotations`. */
export type StudioAnnotation = StudioAngularDimension | StudioText;
export type StudioItem = StudioShape | StudioDimension | StudioAnnotation;
