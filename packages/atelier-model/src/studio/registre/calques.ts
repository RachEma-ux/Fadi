import { mutation } from "./communs.js";
import { ids, layer } from "./schemas.js";
import { id } from "./schemas-base.js";

/** Famille « Calques » du registre : Nouveau calque, Régler le calque, Placer sur un calque. */
export const OUTILS_CALQUES = [
  { ...mutation, toolId: "studio.calque.creer", libelleFR: "Nouveau calque", raccourci: "Shift+N", iconeSymbolique: "studio-layer-add", groupe: "calques", inputSchema: layer },
  { ...mutation, toolId: "studio.calque.modifier", libelleFR: "Régler le calque", raccourci: "Shift+L", iconeSymbolique: "studio-layer-edit", groupe: "calques", inputSchema: layer },
  { ...mutation, toolId: "studio.objet.calque", libelleFR: "Placer sur un calque", raccourci: "Shift+M", iconeSymbolique: "studio-layer-assign", groupe: "calques", inputSchema: { type: "object", additionalProperties: false, required: ["ids", "layerId"], properties: { ids, layerId: id } } },
] as const;
