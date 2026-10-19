import { SCHEMA_BOITE, SCHEMA_PRISME } from "../objets-3d/solides.js";
import { mutation } from "./communs.js";
import { ids } from "./schemas.js";
import { id, number } from "./schemas-base.js";

/**
 * Famille « Volume libre » du registre (A.3-02) : Boîte (B), Prisme sur profil (Maj+B), Déplacer le solide (Maj+W ; Maj+T est le Texte),
 * Supprimer le solide (Maj+Suppr). Créés directement dans la vue 3D, sans dessin 2D préalable.
 */
export const OUTILS_VOLUME_LIBRE = [
  { ...mutation, toolId: "studio.solide.boite", libelleFR: "Boîte", raccourci: "B", iconeSymbolique: "studio-solid-box", groupe: "volume-libre", inputSchema: SCHEMA_BOITE },
  { ...mutation, toolId: "studio.solide.prisme", libelleFR: "Prisme sur profil", raccourci: "Shift+B", iconeSymbolique: "studio-solid-prism", groupe: "volume-libre", inputSchema: SCHEMA_PRISME },
  { ...mutation, toolId: "studio.solide.deplacer", libelleFR: "Déplacer le solide", raccourci: "Shift+W", iconeSymbolique: "studio-solid-move", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy", "dz"], properties: { id, dx: number, dy: number, dz: number } } },
  { ...mutation, toolId: "studio.solide.supprimer", libelleFR: "Supprimer le solide", raccourci: "Shift+Delete", iconeSymbolique: "studio-solid-delete", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;
