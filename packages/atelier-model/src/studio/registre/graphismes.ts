import { SCHEMA_GRAPHISME } from "../graphismes/graphismes.js";
import { SCHEMA_SOURCE } from "../sources/sources.js";
import { mutation } from "./communs.js";
import { ids } from "./schemas.js";

/**
 * Familles « Graphismes » (EX-055) et « Repères » (EX-023) du registre : Créer un graphisme — spline, hachure ou symbole,
 * avec sa transparence (Maj+F6) —, Retirer les graphismes (Maj+F7) et Définir le système de projet (Ctrl+Maj+F2 : une
 * version nouvelle, jamais réécrite). Lettres seules et Maj+lettre sont toutes prises ; ces touches sont libres et non
 * réservées par le navigateur (`regle-or.test.ts`).
 */
export const OUTILS_GRAPHISMES = [
  { ...mutation, toolId: "studio.graphisme.creer", libelleFR: "Créer un graphisme", raccourci: "Shift+F6", iconeSymbolique: "studio-graphic-add", groupe: "graphismes", inputSchema: SCHEMA_GRAPHISME },
  { ...mutation, toolId: "studio.graphisme.retirer", libelleFR: "Retirer les graphismes", raccourci: "Shift+F7", iconeSymbolique: "studio-graphic-remove", groupe: "graphismes", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;

const nombre = { type: "number" } as const;
export const SCHEMA_VERSION_SYSTEME_PROJET = {
  type: "object", additionalProperties: false, required: ["version", "origine", "rotation"],
  properties: {
    version: { type: "integer", minimum: 1 },
    origine: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: nombre, y: nombre } },
    rotation: { type: "number", minimum: -2 * Math.PI, maximum: 2 * Math.PI },
  },
} as const;

export const OUTILS_REPERES = [
  { ...mutation, toolId: "studio.repere.projet", libelleFR: "Définir le système de projet", raccourci: "Ctrl+Shift+F2", iconeSymbolique: "studio-project-frame", groupe: "reperes", inputSchema: SCHEMA_VERSION_SYSTEME_PROJET },
] as const;

/**
 * Famille « Sources » (EX-014) : Déclarer une source importée (Ctrl+Maj+F3) — la provenance d'un fichier DXF importé ;
 * elle accompagne l'import (le raccourci ouvre « Importer DXF »).
 */
export const OUTILS_SOURCES = [
  { ...mutation, toolId: "studio.source.declarer", libelleFR: "Déclarer une source importée", raccourci: "Ctrl+Shift+F3", iconeSymbolique: "studio-source-declare", groupe: "sources", inputSchema: SCHEMA_SOURCE },
] as const;
