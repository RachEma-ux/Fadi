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
import { SCHEMA_COTE_FACE } from "../objets-3d/cotes-faces.js";
import { SCHEMA_ARCHITECTURE } from "../architecture/schemas.js";
import { SCHEMA_PROPRIETE } from "../exigences/schemas.js";
import { SCHEMA_ELEMENT_VISUALISATION, STUDIO_LIMITES_SCENES } from "../scenes/scenes.js";
import { SCHEMA_NON_NATIF } from "../non-natifs/non-natifs.js";
import { SCHEMA_GRAPHISME, STUDIO_LIMITES_GRAPHISMES } from "../graphismes/graphismes.js";
import { STUDIO_LIMITE_VERSIONS_PROJET } from "../reperes.js";
import { SCHEMA_SOURCE, STUDIO_LIMITES_SOURCES } from "../sources/sources.js";
import { SCHEMA_DEFINITION_BLOC, SCHEMA_INSERTION_BLOC, STUDIO_LIMITES_BLOCS } from "../blocs/blocs.js";
import { SCHEMA_CONTRAINTE, STUDIO_LIMITES_CONTRAINTES } from "../contraintes/contraintes.js";
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
    cotesFaces: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_COTE_FACE },
    annotations: { type: "array", maxItems: STUDIO_LIMITS.objects, items: { oneOf: [SCHEMA_COTE_ANGULAIRE, SCHEMA_TEXTE] } },
    architecture: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_ARCHITECTURE },
    proprietes: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_PROPRIETE },
    scenes: { type: "array", maxItems: STUDIO_LIMITES_SCENES.scenes + STUDIO_LIMITES_SCENES.apparences, items: SCHEMA_ELEMENT_VISUALISATION },
    nonNatifs: { type: "array", maxItems: STUDIO_LIMITS.objects, items: SCHEMA_NON_NATIF },
    graphismes: { type: "array", maxItems: STUDIO_LIMITES_GRAPHISMES.graphismes, items: SCHEMA_GRAPHISME },
    sources: { type: "array", maxItems: STUDIO_LIMITES_SOURCES.sources, items: SCHEMA_SOURCE },
    blocs: { type: "array", maxItems: STUDIO_LIMITES_BLOCS.definitions, items: SCHEMA_DEFINITION_BLOC },
    insertions: { type: "array", maxItems: STUDIO_LIMITES_BLOCS.insertions, items: SCHEMA_INSERTION_BLOC },
    contraintes: { type: "array", maxItems: STUDIO_LIMITES_CONTRAINTES.contraintes, items: SCHEMA_CONTRAINTE },
    systemeProjet: {
      type: "object", additionalProperties: false, required: ["versions"],
      properties: {
        versions: {
          type: "array", minItems: 1, maxItems: STUDIO_LIMITE_VERSIONS_PROJET,
          items: { type: "object", additionalProperties: false, required: ["version", "origine", "rotation"], properties: { version: { type: "integer", minimum: 1 }, origine: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } }, rotation: { type: "number", minimum: -2 * Math.PI, maximum: 2 * Math.PI } } },
        },
      },
    },
  },
} as const;
