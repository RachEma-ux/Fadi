import { common, mutation } from "../registre/communs.js";
import { ids } from "../registre/schemas.js";
import { id } from "../registre/schemas-base.js";
import { SCHEMA_APPARENCE, SCHEMA_SCENE } from "./scenes.js";

/**
 * Famille « Visualisation » du registre (lot E.5) : scènes enregistrées et apparences d'affichage. Raccourcis libres et
 * non réservés (`regle-or.test.ts`) : V (« vue » enregistrée), F2 (mettre à jour, comme renommer / éditer), Z
 * (rappeler : J est « Modifier l'élément architectural », K, F et G sont aux propriétés et exigences E.1, Q reste
 * libre pour un Rapporteur ; Maj+Z est Cadrer), Ctrl+Maj+X (supprimer la scène ; X seul est l'accrochage aux intersections), T (« teinte » :
 * apparence d'affichage), Ctrl+Maj+L (retirer l'apparence). Rappeler est une lecture : elle ne modifie jamais le document.
 */
export const OUTILS_SCENES = [
  { ...mutation, toolId: "studio.scene.creer", libelleFR: "Nouvelle scène", raccourci: "V", iconeSymbolique: "studio-scene-add", groupe: "visualisation", inputSchema: SCHEMA_SCENE },
  { ...mutation, toolId: "studio.scene.modifier", libelleFR: "Mettre à jour la scène", raccourci: "F2", iconeSymbolique: "studio-scene-update", groupe: "visualisation", inputSchema: SCHEMA_SCENE },
  { ...common, toolId: "studio.scene.rappeler", libelleFR: "Rappeler la scène", raccourci: "Z", iconeSymbolique: "studio-scene-recall", groupe: "visualisation", nature: "lecture", inputSchema: { type: "object", additionalProperties: false, required: ["id"], properties: { id } }, outputSchema: { anyOf: [SCHEMA_SCENE, { type: "null" }] } },
  { ...mutation, toolId: "studio.scene.supprimer", libelleFR: "Supprimer la scène", raccourci: "Ctrl+Shift+X", iconeSymbolique: "studio-scene-delete", groupe: "visualisation", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
  { ...mutation, toolId: "studio.apparence.definir", libelleFR: "Apparence d’affichage", raccourci: "T", iconeSymbolique: "studio-appearance", groupe: "visualisation", inputSchema: SCHEMA_APPARENCE },
  { ...mutation, toolId: "studio.apparence.retirer", libelleFR: "Retirer l’apparence", raccourci: "Ctrl+Shift+L", iconeSymbolique: "studio-appearance-remove", groupe: "visualisation", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
] as const;
