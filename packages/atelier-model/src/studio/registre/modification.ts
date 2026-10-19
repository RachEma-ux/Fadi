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
import { id, number } from "./schemas-base.js";

/** Famille « Modification » du registre : Déplacer, Modifier, Décaler, Supprimer. */
export const OUTILS_MODIFICATION = [
  { ...mutation, toolId: "studio.dessin.deplacer", libelleFR: "Déplacer", raccourci: "M", iconeSymbolique: "studio-move", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy"], properties: { id, dx: number, dy: number } } },
  { ...mutation, toolId: "studio.dessin.modifier", libelleFR: "Modifier", raccourci: "E", iconeSymbolique: "studio-edit", groupe: "modification", inputSchema: { oneOf: [SCHEMA_LIGNE, SCHEMA_RECTANGLE, SCHEMA_CERCLE, SCHEMA_ARC, SCHEMA_POLYLIGNE, SCHEMA_COTE_SAISIE, SCHEMA_COTE_ANGULAIRE_SAISIE, SCHEMA_TEXTE] } },
  /** Décalage d'une forme d'une distance signée en une nouvelle forme `newId` (O, comme « offset » en DAO). */
  { ...mutation, toolId: "studio.dessin.decaler", libelleFR: "Décaler", raccourci: "O", iconeSymbolique: "studio-offset", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["id", "newId", "distance"], properties: { id, newId: id, distance: { type: "number", not: { const: 0 } } } } },
  { ...mutation, toolId: "studio.dessin.supprimer", libelleFR: "Supprimer", raccourci: "Delete", iconeSymbolique: "studio-delete", groupe: "modification", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;
