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

export const SCHEMA_ARCHITECTURE = { oneOf: [SCHEMA_MUR, SCHEMA_OUVERTURE] } as const;
