import { mutation } from "./communs.js";
import { ids } from "./schemas.js";
import { directionExtrusion, number, positive } from "./schemas-base.js";

/** Famille « Volume » du registre : Extruder (valeurs saisies seulement, direction +z / -z choisie), Aplatir. */
export const OUTILS_VOLUME = [
  { ...mutation, toolId: "studio.objet.extruder", libelleFR: "Extruder", raccourci: "Shift+E", iconeSymbolique: "studio-extrude", groupe: "volume", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "base", "height"], properties: { ids, base: number, height: positive, thickness: positive, direction: directionExtrusion } } },
  { ...mutation, toolId: "studio.objet.aplatir", libelleFR: "Aplatir", raccourci: "Shift+F", iconeSymbolique: "studio-flatten", groupe: "volume", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;
