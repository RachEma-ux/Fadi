import { SCHEMA_DEFINITION_BLOC, SCHEMA_INSERTION_BLOC, STUDIO_LIMITES_BLOCS } from "../blocs/blocs.js";
import { SCHEMA_CONTRAINTE } from "../contraintes/contraintes.js";
import { mutation } from "./communs.js";
import { ids, shape } from "./schemas.js";
import { id, point } from "./schemas-base.js";

/**
 * Familles « Blocs » et « Contraintes » du registre (X.1-01) : Définir un bloc (Maj+F1 : définition saisie ou depuis la
 * sélection, redéfinition répercutée sur toutes les insertions), Insérer un bloc (Maj+F3 : position, rotation, échelle,
 * symétrie ; ou nouvelle pose d'une insertion), Éclater l'insertion (Ctrl+F12) et Contraindre (Ctrl+F1 : poser des
 * contraintes et résoudre le système, ou résoudre des contraintes « à résoudre »). Raccourcis de la réserve du lot W3-A
 * (Maj+F1, Maj+F3, Ctrl+F1) ; Maj+F2 de cette réserve étant déjà pris (« Modèles externes »), Éclater prend Ctrl+F12,
 * libre, hors des réserves des autres lots et non réservé par le navigateur (`regle-or.test.ts`).
 */

const definitionSaisie = {
  type: "object", additionalProperties: false, required: ["id", "nom", "base"],
  properties: {
    id, nom: SCHEMA_DEFINITION_BLOC.properties.nom, base: point,
    elements: { type: "array", minItems: 1, maxItems: STUDIO_LIMITES_BLOCS.elements, items: shape },
    objets: { ...ids, maxItems: STUDIO_LIMITES_BLOCS.elements },
    insertion: id,
    redefinir: { type: "boolean" },
  },
} as const;

export const OUTILS_BLOCS = [
  { ...mutation, toolId: "studio.bloc.definir", libelleFR: "Définir un bloc", raccourci: "Shift+F1", iconeSymbolique: "studio-block-define", groupe: "blocs", inputSchema: definitionSaisie },
  { ...mutation, toolId: "studio.bloc.inserer", libelleFR: "Insérer un bloc", raccourci: "Shift+F3", iconeSymbolique: "studio-block-insert", groupe: "blocs", inputSchema: { ...SCHEMA_INSERTION_BLOC, properties: { ...SCHEMA_INSERTION_BLOC.properties, modifier: { type: "boolean" } } } },
  { ...mutation, toolId: "studio.bloc.eclater", libelleFR: "Éclater l’insertion", raccourci: "Ctrl+F12", iconeSymbolique: "studio-block-explode", groupe: "blocs", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;

export const OUTILS_CONTRAINTES = [
  {
    ...mutation, toolId: "studio.contrainte.poser", libelleFR: "Contraindre", raccourci: "Ctrl+F1", iconeSymbolique: "studio-constraint", groupe: "contraintes",
    inputSchema: { type: "object", additionalProperties: false, minProperties: 1, properties: { contraintes: { type: "array", minItems: 1, items: SCHEMA_CONTRAINTE }, resoudre: ids } },
  },
] as const;
