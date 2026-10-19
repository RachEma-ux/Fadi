import { SCHEMA_ARC } from "../objets/arc.js";
import { SCHEMA_CERCLE } from "../objets/cercle.js";
import { SCHEMA_COTE_SAISIE } from "../objets/cote.js";
import { SCHEMA_COTE_ANGULAIRE_SAISIE } from "../objets/cote-angulaire.js";
import { SCHEMA_TEXTE } from "../objets/texte.js";
import { SCHEMA_LIGNE } from "../objets/ligne.js";
import { SCHEMA_POLYLIGNE } from "../objets/polyligne.js";
import { SCHEMA_RECTANGLE } from "../objets/rectangle.js";
import { common, mutation } from "./communs.js";
import { shape } from "./schemas.js";
import { id } from "./schemas-base.js";

/** Famille « Dessin » du registre : Sélection (lecture) et une création par type d'objet, la Cote, puis les annotations. */
export const OUTILS_DESSIN = [
  { ...common, toolId: "studio.dessin.selection", libelleFR: "Sélection", raccourci: "Space", iconeSymbolique: "studio-pointer", groupe: "dessin", nature: "lecture", inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id } }, outputSchema: { anyOf: [shape, { type: "null" }] } },
  { ...mutation, toolId: "studio.dessin.ligne", libelleFR: "Ligne", raccourci: "L", iconeSymbolique: "studio-line", groupe: "dessin", inputSchema: SCHEMA_LIGNE },
  { ...mutation, toolId: "studio.dessin.rectangle", libelleFR: "Rectangle", raccourci: "R", iconeSymbolique: "studio-rectangle", groupe: "dessin", inputSchema: SCHEMA_RECTANGLE },
  { ...mutation, toolId: "studio.dessin.cercle", libelleFR: "Cercle", raccourci: "C", iconeSymbolique: "studio-circle", groupe: "dessin", inputSchema: SCHEMA_CERCLE },
  { ...mutation, toolId: "studio.dessin.arc", libelleFR: "Arc", raccourci: "A", iconeSymbolique: "studio-arc", groupe: "dessin", inputSchema: SCHEMA_ARC },
  { ...mutation, toolId: "studio.dessin.polyligne", libelleFR: "Polyligne", raccourci: "P", iconeSymbolique: "studio-polyline", groupe: "dessin", inputSchema: SCHEMA_POLYLIGNE },
  { ...mutation, toolId: "studio.dessin.cote", libelleFR: "Cote", raccourci: "Shift+C", iconeSymbolique: "studio-dimension", groupe: "dessin", inputSchema: SCHEMA_COTE_SAISIE },
  // Annotations : Cote angulaire (Maj+A, A comme « angle » ; A seul est l'Arc) et Texte (Maj+T ; Ctrl+Maj+T reste au
  // navigateur), libres et non réservés.
  { ...mutation, toolId: "studio.dessin.cote-angulaire", libelleFR: "Cote angulaire", raccourci: "Shift+A", iconeSymbolique: "studio-angular-dimension", groupe: "dessin", inputSchema: SCHEMA_COTE_ANGULAIRE_SAISIE },
  { ...mutation, toolId: "studio.dessin.texte", libelleFR: "Texte", raccourci: "Shift+T", iconeSymbolique: "studio-text", groupe: "dessin", inputSchema: SCHEMA_TEXTE },
] as const;
