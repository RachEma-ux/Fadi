import { SCHEMA_ARC } from "../objets/arc.js";
import { SCHEMA_CERCLE } from "../objets/cercle.js";
import { SCHEMA_COTE_SAISIE } from "../objets/cote.js";
import { SCHEMA_COTE_ANGULAIRE_SAISIE } from "../objets/cote-angulaire.js";
import { SCHEMA_TEXTE } from "../objets/texte.js";
import { SCHEMA_LIGNE } from "../objets/ligne.js";
import { SCHEMA_POLYLIGNE } from "../objets/polyligne.js";
import { SCHEMA_RECTANGLE } from "../objets/rectangle.js";
import { mutation } from "./communs.js";
import { ids } from "./schemas.js";
import { id, number, point, positive } from "./schemas-base.js";

/** Nombre de copies d'une commande Copier (`STUDIO_COPIES_MAX`, `commandes/modification.ts`). */
const copies = { type: "integer", minimum: 1, maximum: 1000 } as const;

/** Famille « Modification » du registre : Déplacer, Modifier, Décaler, Supprimer, Copier, Rotation, Symétrie, Échelle. */
export const OUTILS_MODIFICATION = [
  { ...mutation, toolId: "studio.dessin.deplacer", libelleFR: "Déplacer", raccourci: "M", iconeSymbolique: "studio-move", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy"], properties: { id, dx: number, dy: number } } },
  { ...mutation, toolId: "studio.dessin.modifier", libelleFR: "Modifier", raccourci: "E", iconeSymbolique: "studio-edit", groupe: "modification", inputSchema: { oneOf: [SCHEMA_LIGNE, SCHEMA_RECTANGLE, SCHEMA_CERCLE, SCHEMA_ARC, SCHEMA_POLYLIGNE, SCHEMA_COTE_SAISIE, SCHEMA_COTE_ANGULAIRE_SAISIE, SCHEMA_TEXTE] } },
  /** Décalage d'une forme d'une distance signée en une nouvelle forme `newId` (O, comme « offset » en DAO). */
  { ...mutation, toolId: "studio.dessin.decaler", libelleFR: "Décaler", raccourci: "O", iconeSymbolique: "studio-offset", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["id", "newId", "distance"], properties: { id, newId: id, distance: { type: "number", not: { const: 0 } } } } },
  { ...mutation, toolId: "studio.dessin.supprimer", libelleFR: "Supprimer", raccourci: "Delete", iconeSymbolique: "studio-delete", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
  /**
   * Transformations de la sélection (`transformations.ts`). Raccourcis : S = Échelle (SketchUp) ; Copier D
   * (« dupliquer » : Ctrl+C reste la copie du navigateur) ; Rotation Maj+R (Q, SketchUp, reste libre pour un outil
   * Rapporteur) ; Symétrie I (« mIrror », MI en DAO). Copies : identifiants `studioIdCopie(prefix, rang, indice)`.
   */
  { ...mutation, toolId: "studio.dessin.copier", libelleFR: "Copier", raccourci: "D", iconeSymbolique: "studio-copy", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "dx", "dy", "copies", "prefix"], properties: { ids, dx: number, dy: number, copies: copies, prefix: id } } },
  /** Angle en radians, sens trigonométrique (l'interface saisit des degrés). */
  { ...mutation, toolId: "studio.dessin.rotation", libelleFR: "Rotation", raccourci: "Shift+R", iconeSymbolique: "studio-rotate", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "center", "angle"], properties: { ids, center: point, angle: { type: "number", not: { const: 0 } } } } },
  { ...mutation, toolId: "studio.dessin.symetrie", libelleFR: "Symétrie", raccourci: "I", iconeSymbolique: "studio-mirror", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "axisStart", "axisEnd", "keepSource"], properties: { ids, axisStart: point, axisEnd: point, keepSource: { type: "boolean" }, prefix: id } } },
  { ...mutation, toolId: "studio.dessin.echelle", libelleFR: "Échelle", raccourci: "S", iconeSymbolique: "studio-scale", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "center", "factor", "includeVolumes"], properties: { ids, center: point, factor: positive, includeVolumes: { type: "boolean" } } } },
] as const;
