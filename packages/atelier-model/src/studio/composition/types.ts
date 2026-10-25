import type { StudioArc } from "../objets/arc.js";
import type { StudioCircle } from "../objets/cercle.js";
import type { StudioDimension } from "../objets/cote.js";
import type { StudioAngularDimension } from "../objets/cote-angulaire.js";
import type { StudioAnnotation, StudioItem, StudioShape } from "../objets/formes.js";
import type { StudioLine } from "../objets/ligne.js";
import type { StudioPolyline } from "../objets/polyligne.js";
import type { StudioRectangle } from "../objets/rectangle.js";
import type { StudioBox, StudioFaceSolide, StudioProfilePrism, StudioSolid } from "../objets-3d/solides.js";
import type { StudioText } from "../objets/texte.js";
import type { STUDIO_CONTRACT } from "../noyau/limites.js";
import type { StudioLayer, StudioPoint } from "../noyau/types.js";
import type { StudioArchitectureItem, StudioOpening, StudioWall } from "../architecture/types.js";
import type { StudioPropriete } from "../exigences/proprietes.js";
import type { StudioApparence, StudioElementVisualisation, StudioScene } from "../scenes/scenes.js";

/**
 * Types composés du document Studio (`studio-document/1`) : le document entier et le contrat de commandes rassemblent
 * le socle (`noyau/`), les objets 2D (`objets/`), les solides (`objets-3d/`), l'architecture, les propriétés déclarées
 * (`exigences/`) et la visualisation (`scenes/`). Couche de composition : aucune de ces couches ne l'importe.
 */

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
  /** Solides libres (`objets-3d/`, repère `local-3d`), séparés de `objects` : un lecteur 2D ne les lit jamais à tort. */
  solides?: StudioSolid[];
  /**
   * Annotations (extension additive, facultative) : cotes angulaires et textes, séparés de `objects` et `dimensions` pour
   * qu'un lecteur antérieur ne les interprète jamais à tort ; absent ou vide : aucune annotation (forme canonique).
   */
  annotations?: StudioAnnotation[];
  /**
   * Objets architecturaux (extension additive, facultative, A.4) : murs et ouvertures créés explicitement par
   * l’utilisateur (`architecture/`) ; absent ou vide : aucun (forme canonique).
   */
  architecture?: StudioArchitectureItem[];
  /**
   * Propriétés BIM déclarées (extension additive, facultative, E.1-01) sur les murs, ouvertures et objets extrudés
   * (`exigences/proprietes.ts`) ; absent ou vide : aucune (forme canonique). Une valeur absente est « non évaluée ».
   */
  proprietes?: StudioPropriete[];
  /**
   * Visualisation (extension additive, facultative, lot E.5) : scènes enregistrées (repère `local-3d`) et apparences
   * d’affichage (`scenes/`) ; réglages de vue seulement, jamais lus par la géométrie, les quantités ni les exports.
   */
  scenes?: StudioElementVisualisation[];
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
  | { toolId: "studio.dessin.copier"; params: { ids: string[]; dx: number; dy: number; copies: number; prefix: string } }
  | { toolId: "studio.dessin.rotation"; params: { ids: string[]; center: StudioPoint; angle: number } }
  | { toolId: "studio.dessin.symetrie"; params: { ids: string[]; axisStart: StudioPoint; axisEnd: StudioPoint; keepSource: boolean; prefix?: string } }
  | { toolId: "studio.dessin.echelle"; params: { ids: string[]; center: StudioPoint; factor: number; includeVolumes: boolean } }
  | { toolId: "studio.calque.creer"; params: StudioLayer }
  | { toolId: "studio.calque.modifier"; params: StudioLayer }
  | { toolId: "studio.objet.calque"; params: { ids: string[]; layerId: string } }
  | { toolId: "studio.objet.extruder"; params: { ids: string[]; base: number; height: number; thickness?: number; direction?: "+z" | "-z" } }
  | { toolId: "studio.objet.aplatir"; params: { ids: string[] } }
  | { toolId: "studio.solide.boite"; params: StudioBox }
  | { toolId: "studio.solide.prisme"; params: StudioProfilePrism }
  | { toolId: "studio.solide.deplacer"; params: { id: string; dx: number; dy: number; dz: number } }
  | { toolId: "studio.solide.supprimer"; params: { ids: string[] } }
  | { toolId: "studio.solide.face-decaler"; params: { id: string; face: StudioFaceSolide; distance: number } }
  | { toolId: "studio.solide.face-diviser"; params: { id: string; face: `lateral-${number}`; distance: number } }
  | { toolId: "studio.solide.pivoter"; params: { id: string; angle: number } }
  | { toolId: "studio.solide.resoudre"; params: { id: string; action: "mettre-a-jour" | "detacher" } }
  | { toolId: "studio.architecture.mur"; params: StudioWall }
  | { toolId: "studio.architecture.ouverture"; params: StudioOpening }
  | { toolId: "studio.architecture.modifier"; params: StudioArchitectureItem }
  | { toolId: "studio.architecture.supprimer"; params: { ids: string[]; cascade: boolean } }
  | { toolId: "studio.propriete.definir"; params: StudioPropriete }
  | { toolId: "studio.propriete.retirer"; params: { cibleId: string; nom: string } }
  | { toolId: "studio.scene.creer"; params: StudioScene }
  | { toolId: "studio.scene.modifier"; params: StudioScene }
  | { toolId: "studio.scene.supprimer"; params: { ids: string[] } }
  | { toolId: "studio.apparence.definir"; params: StudioApparence }
  | { toolId: "studio.apparence.retirer"; params: { ids: string[] } };
export type StudioCommandToolId = StudioCommand["toolId"];
export interface StudioEnvelope {
  contractVersion: typeof STUDIO_CONTRACT;
  requestId: string;
  baseRevisionId: string;
  commands: StudioCommand[];
}
