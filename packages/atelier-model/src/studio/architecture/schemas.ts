import { STUDIO_LIMITS } from "../noyau/limites.js";
import { id, layerId, number, point, positive } from "../registre/schemas-base.js";

/** Schémas JSON des objets architecturaux (A.4) ; la compatibilité ouverture / mur hôte est contrôlée par le modèle. */
const nonNegative = { type: "number", minimum: 0 } as const;

export const SCHEMA_MUR = {
  type: "object", additionalProperties: false, required: ["id", "type", "axis", "thickness", "height", "base", "justification"],
  properties: {
    id, type: { const: "wall" }, layerId,
    axis: { type: "array", minItems: 2, maxItems: STUDIO_LIMITS.polylinePoints, items: point },
    thickness: positive, height: positive, base: number,
    justification: { enum: ["left", "center", "right"] },
  },
} as const;

export const SCHEMA_OUVERTURE = {
  type: "object", additionalProperties: false, required: ["id", "type", "hostId", "position", "width", "height", "sill"],
  properties: {
    id, type: { const: "opening" }, hostId: id, position: nonNegative, width: positive, height: positive, sill: nonNegative,
    kind: { enum: ["porte", "fenetre", "baie"] },
  },
} as const;

/** Échelle d'accès (EX-027, lot G2) : valeurs saisies ; section < entre-axe et pas > section contrôlés par le modèle. */
export const SCHEMA_ECHELLE = {
  type: "object", additionalProperties: false, required: ["id", "type", "position", "rotation", "width", "height", "base", "rungs", "section"],
  properties: {
    id, type: { const: "ladder" }, layerId, position: point,
    rotation: { type: "number", minimum: 0, exclusiveMaximum: 2 * Math.PI },
    width: positive, height: positive, base: number,
    rungs: { type: "integer", minimum: 1, maximum: 1000 },
    section: positive,
  },
} as const;

export const SCHEMA_ARCHITECTURE = { oneOf: [SCHEMA_MUR, SCHEMA_OUVERTURE, SCHEMA_ECHELLE] } as const;
