import { SCHEMA_ARCHITECTURE, SCHEMA_MUR, SCHEMA_OUVERTURE } from "../architecture/schemas.js";
import { mutation } from "./communs.js";
import { ids } from "./schemas.js";

/**
 * Famille « Architecture » du registre (A.4) : Mur (W, « wall »), Ouverture (H, « hole » : baie dans un mur), Modifier
 * l'élément architectural (Ctrl+Maj+E, Modifier étant E) et Supprimer le mur et ses ouvertures (Ctrl+Suppr, Supprimer
 * étant Suppr ; Ctrl+Maj+Suppr reste au navigateur). Raccourcis libres et non réservés (`regle-or.test.ts`).
 */
export const OUTILS_ARCHITECTURE = [
  { ...mutation, toolId: "studio.architecture.mur", libelleFR: "Mur", raccourci: "W", iconeSymbolique: "studio-wall", groupe: "architecture", inputSchema: SCHEMA_MUR },
  { ...mutation, toolId: "studio.architecture.ouverture", libelleFR: "Ouverture", raccourci: "H", iconeSymbolique: "studio-opening", groupe: "architecture", inputSchema: SCHEMA_OUVERTURE },
  { ...mutation, toolId: "studio.architecture.modifier", libelleFR: "Modifier l’élément architectural", raccourci: "Ctrl+Shift+E", iconeSymbolique: "studio-architecture-edit", groupe: "architecture", inputSchema: SCHEMA_ARCHITECTURE },
  { ...mutation, toolId: "studio.architecture.supprimer", libelleFR: "Supprimer le mur et ses ouvertures", raccourci: "Ctrl+Delete", iconeSymbolique: "studio-architecture-delete", groupe: "architecture", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "cascade"], properties: { ids, cascade: { type: "boolean" } } } },
] as const;
