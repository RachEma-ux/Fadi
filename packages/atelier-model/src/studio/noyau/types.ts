import type { Point2 } from "../../unites.js";
import type { StudioArc } from "../objets/arc.js";
import type { StudioCircle } from "../objets/cercle.js";
import type { StudioDimension } from "../objets/cote.js";
import type { StudioAngularDimension } from "../objets/cote-angulaire.js";
import type { StudioLine } from "../objets/ligne.js";
import type { StudioPolyline } from "../objets/polyligne.js";
import type { StudioRectangle } from "../objets/rectangle.js";
import type { StudioText } from "../objets/texte.js";
import type { STUDIO_CONTRACT } from "./limites.js";

/**
 * Types communs du document 2D natif de Studio (`studio-document/1`). Chaque type d'objet déclare son interface dans son
 * module (`objets/`) ; l'union `StudioShape` les rassemble. Toutes les coordonnées sont dans le repère explicite
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
}

export type StudioShape = StudioLine | StudioRectangle | StudioCircle | StudioArc | StudioPolyline;
/** Annotations (cotes angulaires, textes), rangées à part dans `StudioDocument.annotations`. */
export type StudioAnnotation = StudioAngularDimension | StudioText;
export type StudioItem = StudioShape | StudioDimension | StudioAnnotation;

export interface StudioLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface StudioDocument {
  id: string;
  schemaVersion: "studio-document/1";
  units: "m";
  frame: "local-2d";
  objects: StudioShape[];
  /** Absent ou vide : seul le calque implicite existe. */
  layers?: StudioLayer[];
  /** Cotes, séparées de `objects` pour qu'un lecteur V1 (lignes et rectangles) ne les interprète jamais à tort. */
  dimensions?: StudioDimension[];
  /**
   * Annotations (extension additive, facultative) : cotes angulaires et textes, séparés de `objects` et `dimensions` pour
   * qu'un lecteur antérieur ne les interprète jamais à tort ; absent ou vide : aucune annotation (forme canonique).
   */
  annotations?: StudioAnnotation[];
}
export type StudioCommand =
  | { toolId: "studio.dessin.ligne"; params: StudioLine }
  | { toolId: "studio.dessin.rectangle"; params: StudioRectangle }
  | { toolId: "studio.dessin.cercle"; params: StudioCircle }
  | { toolId: "studio.dessin.arc"; params: StudioArc }
  | { toolId: "studio.dessin.polyligne"; params: StudioPolyline }
  | { toolId: "studio.dessin.decaler"; params: { id: string; newId: string; distance: number } }
  | { toolId: "studio.dessin.deplacer"; params: { id: string; dx: number; dy: number } }
  | { toolId: "studio.dessin.modifier"; params: StudioItem }
  | { toolId: "studio.dessin.cote"; params: StudioDimension }
  | { toolId: "studio.dessin.cote-angulaire"; params: StudioAngularDimension }
  | { toolId: "studio.dessin.texte"; params: StudioText }
  | { toolId: "studio.dessin.supprimer"; params: { ids: string[] } }
  | { toolId: "studio.calque.creer"; params: StudioLayer }
  | { toolId: "studio.calque.modifier"; params: StudioLayer }
  | { toolId: "studio.objet.calque"; params: { ids: string[]; layerId: string } }
  | { toolId: "studio.objet.extruder"; params: { ids: string[]; base: number; height: number; thickness?: number } }
  | { toolId: "studio.objet.aplatir"; params: { ids: string[] } };
export type StudioCommandToolId = StudioCommand["toolId"];
export interface StudioEnvelope {
  contractVersion: typeof STUDIO_CONTRACT;
  requestId: string;
  baseRevisionId: string;
  commands: StudioCommand[];
}
