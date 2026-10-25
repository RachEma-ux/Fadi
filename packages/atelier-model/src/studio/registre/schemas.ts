import { STUDIO_LIMITS } from "../noyau/limites.js";
import { SCHEMA_ARC } from "../objets/arc.js";
import { SCHEMA_CERCLE } from "../objets/cercle.js";
import { SCHEMA_COTE } from "../objets/cote.js";
import { SCHEMA_COTE_ANGULAIRE } from "../objets/cote-angulaire.js";
import { SCHEMA_TEXTE } from "../objets/texte.js";
import { SCHEMA_LIGNE } from "../objets/ligne.js";
import { SCHEMA_POLYLIGNE } from "../objets/polyligne.js";
import { SCHEMA_RECTANGLE } from "../objets/rectangle.js";
import { SCHEMA_SOLIDE } from "../objets-3d/solides.js";
import { SCHEMA_SOLIDE_EXACT } from "../objets-3d/exacts.js";
import { SCHEMA_ARCHITECTURE } from "../architecture/schemas.js";
import { SCHEMA_PROPRIETE } from "../exigences/schemas.js";
import { SCHEMA_ELEMENT_VISUALISATION, STUDIO_LIMITES_SCENES } from "../scenes/scenes.js";
import { SCHEMA_NON_NATIF } from "../non-natifs/non-natifs.js";
import { id } from "./schemas-base.js";

/** Schémas JSON du document entier et des listes, composés des schémas déclarés par chaque type d'objet (`objets/`). */
export const shape = { oneOf: [SCHEMA_LIGNE, SCHEMA_RECTANGLE, SCHEMA_CERCLE, SCHEMA_ARC, SCHEMA_POLYLIGNE] } as const;
export const layer = {
  type: "object", additionalProperties: false, required: ["id", "name", "visible", "locked"],
  properties: { id, name: { type: "string", minLength: 1, maxLength: STUDIO_LIMITS.layerName, pattern: "\\S" }, visible: { type: "boolean" }, locked: { type: "boolean" } },
} as const;
export const ids = { type: "array", minItems: 1, maxItems: STUDIO_LIMITS.objects, uniqueItems: true, items: id } as const;
export const STUDIO_DOCUMENT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["id", "schemaVersion", "units", "frame", "objects"],
  properties: {
    id, schemaVersion: { const: "studio-document/1" }, units: { const: "m" }, frame: { const: "local-2d" },
    objects: { type: "array", maxItems: STUDIO_LIMITS.objects, items: shape },
    layers: { type: "array", maxItems: STUDIO_LIMITS.layers, items: layer },
    dimensions: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_COTE },
    solides: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_SOLIDE },
    exacts: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_SOLIDE_EXACT },
    annotations: { type: "array", maxItems: STUDIO_LIMITS.objects, items: { oneOf: [SCHEMA_COTE_ANGULAIRE, SCHEMA_TEXTE] } },
    architecture: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_ARCHITECTURE },
    proprietes: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_PROPRIETE },
    scenes: { type: "array", maxItems: STUDIO_LIMITES_SCENES.scenes + STUDIO_LIMITES_SCENES.apparences, items: SCHEMA_ELEMENT_VISUALISATION },
    nonNatifs: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_NON_NATIF },
  },
} as const;
