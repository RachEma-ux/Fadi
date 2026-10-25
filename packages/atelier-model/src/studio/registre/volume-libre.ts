import { SCHEMA_BOITE, SCHEMA_PRISME } from "../objets-3d/solides.js";
import { mutation } from "./communs.js";
import { ids } from "./schemas.js";
import { id, number } from "./schemas-base.js";

const face = { anyOf: [{ enum: ["base", "sommet"] }, { type: "string", pattern: "^lateral-(0|[1-9][0-9]{0,4})$" }] } as const;
const nonNul = { type: "number", not: { const: 0 } } as const;

/**
 * Famille « Volume libre » du registre (A.3-02) : Boîte (B), Prisme sur profil (Maj+B), Déplacer le solide (Maj+W ; Maj+T est le Texte),
 * Supprimer le solide (Maj+Suppr). Créés directement dans la vue 3D, sans dessin 2D préalable.
 * Lot F1 (édition des faces, liens) : Pousser / tirer la face (Ctrl+Maj+U), Diviser la face (Ctrl+Maj+V), Pivoter le
 * solide (Ctrl+Maj+H), Résoudre le lien du solide (Ctrl+Maj+G) — toutes les lettres seules et Maj+lettre sont prises ;
 * ces combinaisons Ctrl+Maj ne sont pas réservées par le navigateur (`RACCOURCIS_RESERVES`).
 */
export const OUTILS_VOLUME_LIBRE = [
  { ...mutation, toolId: "studio.solide.boite", libelleFR: "Boîte", raccourci: "B", iconeSymbolique: "studio-solid-box", groupe: "volume-libre", inputSchema: SCHEMA_BOITE },
  { ...mutation, toolId: "studio.solide.prisme", libelleFR: "Prisme sur profil", raccourci: "Shift+B", iconeSymbolique: "studio-solid-prism", groupe: "volume-libre", inputSchema: SCHEMA_PRISME },
  { ...mutation, toolId: "studio.solide.deplacer", libelleFR: "Déplacer le solide", raccourci: "Shift+W", iconeSymbolique: "studio-solid-move", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy", "dz"], properties: { id, dx: number, dy: number, dz: number } } },
  { ...mutation, toolId: "studio.solide.supprimer", libelleFR: "Supprimer le solide", raccourci: "Shift+Delete", iconeSymbolique: "studio-solid-delete", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
  { ...mutation, toolId: "studio.solide.face-decaler", libelleFR: "Pousser / tirer la face", raccourci: "Ctrl+Shift+U", iconeSymbolique: "studio-solid-push-pull", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "face", "distance"], properties: { id, face, distance: nonNul } } },
  { ...mutation, toolId: "studio.solide.face-diviser", libelleFR: "Diviser la face", raccourci: "Ctrl+Shift+V", iconeSymbolique: "studio-solid-split-face", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "face", "distance"], properties: { id, face, distance: { type: "number", exclusiveMinimum: 0 } } } },
  { ...mutation, toolId: "studio.solide.pivoter", libelleFR: "Pivoter le solide", raccourci: "Ctrl+Shift+H", iconeSymbolique: "studio-solid-rotate", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "angle"], properties: { id, angle: nonNul } } },
  { ...mutation, toolId: "studio.solide.resoudre", libelleFR: "Résoudre le lien du solide", raccourci: "Ctrl+Shift+G", iconeSymbolique: "studio-solid-link", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "action"], properties: { id, action: { enum: ["mettre-a-jour", "detacher"] } } } },
] as const;
