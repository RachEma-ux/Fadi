/**
 * Document 2D natif de Studio (`studio-document/1`). Extension additive et rétrocompatible : calques (`layers`) et cotes
 * associatives (`dimensions`) sont des champs facultatifs ; un document V1 (lignes et rectangles, sans calque) reste
 * valide et s'applique à l'identique. Les courbes (cercle, arc, polyligne à renflements) sont des types d'objets ajoutés de
 * la même façon, avec l'outil de décalage (`studio.dessin.decaler`) ; un document sans courbe ne change pas.
 * Toutes les coordonnées sont dans le repère explicite `local-2d`, en mètres.
 * Pur : ni React, ni DOM, ni stockage.
 *
 * Façade publique (API inchangée) du découpage :
 * - `noyau/` : limites et contrat (`limites.ts`), types communs (`types.ts`), sommets nommés (`ancres.ts`), primitives de
 *   validation (`validation.ts`), calques (`calques.ts`), document et lectures (`document.ts`), état d'un lot
 *   (`etat.ts`), aiguillage des commandes (`commandes.ts`) ;
 * - `objets/` : un module par type (ligne, rectangle, cercle, arc, polyligne, cote), table `STUDIO_TYPES_OBJETS` ;
 * - `commandes/` : familles de commandes (dessin, modification, calques, volume).
 */

export { STUDIO_BULGE_MAX, STUDIO_CONTRACT, STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS } from "./noyau/limites.js";
export type { StudioCommand, StudioCommandToolId, StudioDocument, StudioEnvelope, StudioExtrusion, StudioItem, StudioLayer, StudioPoint, StudioShape } from "./noyau/types.js";
export {
  STUDIO_FIXED_ANCHORS, STUDIO_INDEXED_ANCHOR, STUDIO_LINE_ANCHORS, STUDIO_RECTANGLE_ANCHORS,
  type StudioAnchor, type StudioCurveAnchor, type StudioLineAnchor, type StudioRectangleAnchor,
} from "./noyau/ancres.js";
export { StudioValidationError } from "./noyau/validation.js";
export { studioLayerState, type StudioLayerState } from "./noyau/calques.js";
export { measureStudioDimension, newStudioDocument, selectStudioShape, validateStudioDocument, type StudioDimensionMeasure } from "./noyau/document.js";
export { applyStudioCommands, STUDIO_APPLIED_TOOL_IDS } from "./noyau/commandes.js";
export { studioAnchorPoint } from "./objets/index.js";
export type { StudioLine } from "./objets/ligne.js";
export type { StudioRectangle } from "./objets/rectangle.js";
export type { StudioCircle } from "./objets/cercle.js";
export type { StudioArc } from "./objets/arc.js";
export { studioExtrudedRingVertices, type StudioPolyline } from "./objets/polyligne.js";
export type { StudioDimension, StudioDimensionLink } from "./objets/cote.js";
// Annotations (extension additive `annotations`) : cote angulaire et texte.
export type { StudioAnnotation } from "./noyau/types.js";
export { measureStudioAngularDimension, type StudioAngularMeasure } from "./noyau/document.js";
export {
  dessinerCoteAngulaire, formatStudioAngle, studioAngularFromSegments, studioAngularValue, studioStraightSegment,
  type DessinCoteAngulaire, type StudioAngularDimension, type StudioAngularLink,
} from "./objets/cote-angulaire.js";
export { STUDIO_TEXT_JUSTIFICATIONS, STUDIO_TEXT_MAX, studioTextBox, studioTextRotationDegrees, type StudioText, type StudioTextJustification } from "./objets/texte.js";
