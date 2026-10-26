import type { StudioPoint } from "../noyau/types.js";

/**
 * Objets architecturaux de Studio (A.4) : **mur** et **ouverture**, créés explicitement par l'utilisateur — jamais
 * déduits d'une ligne extrudée ni d'un recouvrement. Rangés à part dans `StudioDocument.architecture` (extension
 * additive, facultative) pour qu'un lecteur antérieur ne les interprète jamais à tort. Repère `local-2d`, mètres.
 * Toutes les dimensions sont **saisies** : aucune épaisseur, hauteur, largeur ou allège par défaut, aucune valeur
 * normative ; le type d'une ouverture (porte, fenêtre, baie) est une étiquette déclarée, absente par défaut.
 */

/**
 * Position du corps du mur par rapport à son axe, dans le sens de parcours de l'axe (premier point → dernier) :
 * `left` = tout le corps à gauche de l'axe, `center` = demi-épaisseur de chaque côté, `right` = tout à droite.
 */
export type StudioWallJustification = "left" | "center" | "right";
export const STUDIO_WALL_JUSTIFICATIONS: readonly StudioWallJustification[] = Object.freeze(["left", "center", "right"] as const);

/** Étiquette déclarée d'une ouverture ; elle seule décide d'un `IfcDoor` / `IfcWindow` à l'export. */
export type StudioOpeningKind = "porte" | "fenetre" | "baie";
export const STUDIO_OPENING_KINDS: readonly StudioOpeningKind[] = Object.freeze(["porte", "fenetre", "baie"] as const);

/** Mur : axe (ligne ou polyligne ouverte à segments droits), épaisseur, hauteur et cote de base saisies. */
export interface StudioWall {
  id: string;
  type: "wall";
  layerId?: string;
  /** Deux points au moins, consécutifs distincts ; tracé ouvert. */
  axis: StudioPoint[];
  /** Épaisseur strictement positive (m). */
  thickness: number;
  /** Hauteur strictement positive (m), au-dessus de `base`. */
  height: number;
  /** Cote du bas du mur (m), repère `local-3d` (z). */
  base: number;
  justification: StudioWallJustification;
}

/**
 * Ouverture hébergée par un mur (`hostId`) : elle traverse toute l'épaisseur du mur. `position` = distance le long de
 * l'axe du mur, depuis son premier point, jusqu'au bord de début de l'ouverture ; `sill` = allège, hauteur du bas de
 * l'ouverture au-dessus de la base du mur. Elle suit son mur (calque, transformations) et n'a pas de calque propre.
 */
export interface StudioOpening {
  id: string;
  type: "opening";
  hostId: string;
  position: number;
  width: number;
  height: number;
  sill: number;
  kind?: StudioOpeningKind;
}

/**
 * Échelle d'accès (EX-027, lot G2) : objet d'accès posé librement (sans hôte), deux montants verticaux de section carrée
 * et des échelons horizontaux de même section, régulièrement espacés. Toutes les valeurs sont **saisies** : aucune
 * largeur, hauteur, section ni nombre d'échelons par défaut, aucune valeur normative (pas d'échelons, garde-corps,
 * crinoline : non portés, jamais supposés).
 * - `position` : milieu de la ligne de pied (entre les axes des deux montants), repère `local-2d` ;
 * - `rotation` : direction de la largeur (du montant 1 au montant 2), radians dans [0 ; 2π[ ;
 * - `width` : entre-axe des montants ; `section` : côté de la section carrée des montants et des échelons ;
 * - `height` : hauteur des montants au-dessus de `base` (cote du pied, z) ;
 * - `rungs` : nombre d'échelons, au pas `height / (rungs + 1)` à partir du pied.
 */
export interface StudioLadder {
  id: string;
  type: "ladder";
  layerId?: string;
  position: StudioPoint;
  rotation: number;
  width: number;
  height: number;
  base: number;
  rungs: number;
  section: number;
}

export type StudioArchitectureItem = StudioWall | StudioOpening | StudioLadder;
