import { SCHEMA_COTE_FACE } from "../objets-3d/cotes-faces.js";
import { SCHEMA_BOITE, SCHEMA_PRISME } from "../objets-3d/solides.js";
import { SCHEMA_RESULTAT_EXACT, STUDIO_OPERATIONS_BOOLEENNES } from "../objets-3d/exacts.js";
import { SCHEMA_SURFACE_LIBRE, STUDIO_SENS_EPAISSEUR } from "../objets-3d/surfaces-libres.js";
import { SCHEMA_SURFACE_SUBDIVISION } from "../objets-3d/subdivisions.js";
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
 * Lot F2 (noyau exact, IF-003) : Booléen exact (Ctrl+Maj+Y) — union, différence ou intersection de deux solides, calculée
 * par le noyau exact chargé à la demande, puis engagée explicitement.
 * X.1-05 (surfaces libres) : Surface NURBS (Ctrl+F8), Modifier la surface (Ctrl+F9 : points de contrôle, poids, degrés),
 * Épaissir la surface (Maj+F11 : conversion explicite en solide exact par le noyau OCCT, surface conservée). Maj+F9,
 * prévu d'abord dans la réserve du lot W3-C, est déjà l'import IFC : la coordination a attribué Maj+F11 à la place.
 * Surfaces de subdivision (X.1-05) : Surface de subdivision (Ctrl+F12) et Solidifier la subdivision (Ctrl+Maj+Fin) ;
 * leurs sommets de contrôle se modifient par « Modifier la surface ». Ctrl+Maj+F4 et Ctrl+Maj+F9, proposés par la
 * coordination, sont déjà « Illustration depuis la vue » et « Agents (MCP) » : Ctrl+F12 (libéré par ce lot) et
 * Ctrl+Maj+Fin, libres et non réservés par le navigateur, les remplacent.
 */
export const OUTILS_VOLUME_LIBRE = [
  { ...mutation, toolId: "studio.solide.boite", libelleFR: "Boîte", raccourci: "B", iconeSymbolique: "studio-solid-box", groupe: "volume-libre", inputSchema: SCHEMA_BOITE },
  { ...mutation, toolId: "studio.solide.prisme", libelleFR: "Prisme sur profil", raccourci: "Shift+B", iconeSymbolique: "studio-solid-prism", groupe: "volume-libre", inputSchema: SCHEMA_PRISME },
  { ...mutation, toolId: "studio.solide.deplacer", libelleFR: "Déplacer le solide", raccourci: "Shift+W", iconeSymbolique: "studio-solid-move", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "dx", "dy", "dz"], properties: { id, dx: number, dy: number, dz: number } } },
  { ...mutation, toolId: "studio.solide.supprimer", libelleFR: "Supprimer le solide", raccourci: "Shift+Delete", iconeSymbolique: "studio-solid-delete", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["ids"], properties: { ids } } },
  { ...mutation, toolId: "studio.solide.face-decaler", libelleFR: "Pousser / tirer la face", raccourci: "Ctrl+Shift+U", iconeSymbolique: "studio-solid-push-pull", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "face", "distance"], properties: { id, face, distance: nonNul } } },
  { ...mutation, toolId: "studio.solide.face-diviser", libelleFR: "Diviser la face", raccourci: "Ctrl+Shift+V", iconeSymbolique: "studio-solid-split-face", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "face", "distance"], properties: { id, face, distance: { type: "number", exclusiveMinimum: 0 } } } },
  { ...mutation, toolId: "studio.solide.pivoter", libelleFR: "Pivoter le solide", raccourci: "Ctrl+Shift+H", iconeSymbolique: "studio-solid-rotate", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "angle"], properties: { id, angle: nonNul, axe: { enum: ["z", "x", "y"] } } } },
  { ...mutation, toolId: "studio.solide.resoudre", libelleFR: "Résoudre le lien du solide", raccourci: "Ctrl+Shift+G", iconeSymbolique: "studio-solid-link", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "action"], properties: { id, action: { enum: ["mettre-a-jour", "detacher"] } } } },
  { ...mutation, toolId: "studio.solide.booleen", libelleFR: "Booléen exact", raccourci: "Ctrl+Shift+Y", iconeSymbolique: "studio-solid-boolean", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "operation", "operandes", "resultat"], properties: { id, operation: { enum: [...STUDIO_OPERATIONS_BOOLEENNES] }, operandes: { type: "array", minItems: 2, maxItems: 2, items: id }, resultat: SCHEMA_RESULTAT_EXACT } } },
  // Lot G2 (INV-013) : Cote de face 3D (Maj+F12) — distance entre deux faces parallèles d'un solide libre, qui suit
  // la face modifiée ou passe « à résoudre » ; la même commande, sur une cote existante, la rattache explicitement.
  { ...mutation, toolId: "studio.solide.cote-face", libelleFR: "Cote de face 3D", raccourci: "Shift+F12", iconeSymbolique: "studio-solid-face-dimension", groupe: "volume-libre", inputSchema: SCHEMA_COTE_FACE },
  { ...mutation, toolId: "studio.surface.nurbs", libelleFR: "Surface NURBS", raccourci: "Ctrl+F8", iconeSymbolique: "studio-surface-nurbs", groupe: "volume-libre", inputSchema: SCHEMA_SURFACE_LIBRE },
  { ...mutation, toolId: "studio.surface.modifier", libelleFR: "Modifier la surface", raccourci: "Ctrl+F9", iconeSymbolique: "studio-surface-edit", groupe: "volume-libre", inputSchema: { oneOf: [SCHEMA_SURFACE_LIBRE, SCHEMA_SURFACE_SUBDIVISION] } },
  { ...mutation, toolId: "studio.surface.epaissir", libelleFR: "Épaissir la surface", raccourci: "Shift+F11", iconeSymbolique: "studio-surface-thicken", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "surface", "epaisseur", "sens", "resultat"], properties: { id, surface: id, epaisseur: { type: "number", minimum: 1e-6, maximum: 1e6 }, sens: { enum: [...STUDIO_SENS_EPAISSEUR] }, resultat: SCHEMA_RESULTAT_EXACT } } },
  { ...mutation, toolId: "studio.subdivision.creer", libelleFR: "Surface de subdivision", raccourci: "Ctrl+F12", iconeSymbolique: "studio-surface-subdivision", groupe: "volume-libre", inputSchema: SCHEMA_SURFACE_SUBDIVISION },
  { ...mutation, toolId: "studio.subdivision.solidifier", libelleFR: "Solidifier la subdivision", raccourci: "Ctrl+Shift+End", iconeSymbolique: "studio-surface-solidify", groupe: "volume-libre", inputSchema: { type: "object", additionalProperties: false, required: ["id", "subdivision", "resultat"], properties: { id, subdivision: id, resultat: SCHEMA_RESULTAT_EXACT } } },
] as const;
