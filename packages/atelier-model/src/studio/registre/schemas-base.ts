import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";

/** Fragments de schéma JSON partagés par les types d'objets (`objets/`) et les familles d'outils du registre. */
export const id = { type: "string", minLength: 1, pattern: "^(?![\\s\\S]*\\u0000)[\\s\\S]*\\S[\\s\\S]*$" } as const;
export const number = { type: "number" } as const;
export const point = { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: number, y: number } } as const;
/** `layerId` absent = calque implicite ; son identifiant réservé ne s'écrit jamais explicitement. */
export const layerId = { ...id, not: { const: STUDIO_DEFAULT_LAYER_ID } } as const;
export const positive = { type: "number", exclusiveMinimum: 0 } as const;
/** Extrusion déclarée (facultative, mètres) : épaisseur pour les lignes seulement ; aucune valeur par défaut. */
export const lineExtrusion = { type: "object", additionalProperties: false, required: ["base", "height"], properties: { base: number, height: positive, thickness: positive } } as const;
export const rectangleExtrusion = { type: "object", additionalProperties: false, required: ["base", "height"], properties: { base: number, height: positive } } as const;
/** Angle en radians dans [0 ; 2π[ (sens trigonométrique, 0 sur +x). */
export const angle = { type: "number", minimum: 0, exclusiveMaximum: 2 * Math.PI } as const;
