/**
 * Document 2D natif de Studio (`studio-document/1`). Extension additive et rétrocompatible : calques (`layers`) et cotes
 * associatives (`dimensions`) sont des champs facultatifs ; un document V1 (lignes et rectangles, sans calque) reste
 * valide et s'applique à l'identique. Les courbes (cercle, arc, polyligne à renflements) sont des types d'objets ajoutés de
 * la même façon, avec l'outil de décalage (`studio.dessin.decaler`) ; un document sans courbe ne change pas.
 * Toutes les coordonnées sont dans le repère explicite `local-2d`, en mètres.
 * Pur : ni React, ni DOM, ni stockage.
 *
 * Façade publique (API inchangée) du découpage :
 * - `noyau/` (socle) : limites et contrat (`limites.ts`), types du socle (`types.ts` : point, extrusion, calque, forme
 *   minimale), sommets nommés (`ancres.ts`), primitives de validation (`validation.ts`), calques (`calques.ts`) ;
 * - `objets/` : un module par type (ligne, rectangle, cercle, arc, polyligne, cote), table `STUDIO_TYPES_OBJETS`, unions
 *   `StudioShape` / `StudioAnnotation` / `StudioItem` (`formes.ts`) ;
 * - `commandes/` : état d'un lot (`etat.ts`) et familles de commandes (dessin, modification, calques, volume) ;
 * - `composition/` : document et contrat composés (`types.ts`), validation du document et lectures (`document.ts`),
 *   aiguillage des commandes (`commandes.ts`), coupe et quantités des solides (`coupe.ts`, `quantites-solides.ts`).
 */

export { STUDIO_BULGE_MAX, STUDIO_CONTRACT, STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS, STUDIO_TOLERANCES_GESTES, studioDansToleranceGeste, type StudioGesteTolere, type StudioOrigineValeur } from "./noyau/limites.js";
export type { StudioCommand, StudioCommandToolId, StudioDocument, StudioEnvelope } from "./composition/types.js";
export type { StudioDirectionExtrusion, StudioExtrusion, StudioLayer, StudioPoint } from "./noyau/types.js";
export { STUDIO_DIRECTIONS_EXTRUSION, studioCotesExtrusion } from "./noyau/types.js";
export type { StudioItem, StudioShape } from "./objets/formes.js";
export {
  STUDIO_FIXED_ANCHORS, STUDIO_INDEXED_ANCHOR, STUDIO_LINE_ANCHORS, STUDIO_RECTANGLE_ANCHORS,
  type StudioAnchor, type StudioCurveAnchor, type StudioLineAnchor, type StudioRectangleAnchor,
} from "./noyau/ancres.js";
export { StudioValidationError } from "./noyau/validation.js";
export type { StudioLayerState } from "./noyau/calques.js";
export { studioLayerState } from "./composition/document.js";
export { measureStudioDimension, newStudioDocument, selectStudioShape, validateStudioDocument, type StudioDimensionMeasure } from "./composition/document.js";
export { applyStudioCommands, STUDIO_APPLIED_TOOL_IDS } from "./composition/commandes.js";
export { studioAnchorPoint } from "./objets/index.js";
export type { StudioLine } from "./objets/ligne.js";
export type { StudioRectangle } from "./objets/rectangle.js";
export type { StudioCircle } from "./objets/cercle.js";
export type { StudioArc } from "./objets/arc.js";
export { studioExtrudedRingVertices, type StudioPolyline } from "./objets/polyligne.js";
export type { StudioDimension, StudioDimensionLink } from "./objets/cote.js";
// Annotations (extension additive `annotations`) : cote angulaire et texte.
export type { StudioAnnotation } from "./objets/formes.js";
export { measureStudioAngularDimension, type StudioAngularMeasure } from "./composition/document.js";
export {
  dessinerCoteAngulaire, formatStudioAngle, studioAngularFromSegments, studioAngularValue, studioStraightSegment,
  type DessinCoteAngulaire, type StudioAngularDimension, type StudioAngularLink,
} from "./objets/cote-angulaire.js";
export { STUDIO_TEXT_JUSTIFICATIONS, STUDIO_TEXT_MAX, studioTextBox, studioTextRotationDegrees, type StudioText, type StudioTextJustification } from "./objets/texte.js";
