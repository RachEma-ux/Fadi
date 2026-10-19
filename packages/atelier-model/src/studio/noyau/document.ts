import { controlerLiens, validerCote, type StudioDimension } from "../objets/cote.js";
import { validerForme } from "../objets/index.js";
import { validerCalque } from "./calques.js";
import { STUDIO_LIMITS } from "./limites.js";
import type { StudioDocument, StudioLayer, StudioShape } from "./types.js";
import { array, fail, identifier, record } from "./validation.js";

/** Document Studio : forme canonique, validation complète, création, lectures (sélection, mesure d'une cote). */

/** Forme canonique : `layers` et `dimensions` vides sont omis. */
export function sortie(id: string, objects: StudioShape[], layers: StudioLayer[], dimensions: StudioDimension[]): StudioDocument {
  return {
    id, schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects,
    ...(layers.length ? { layers } : {}),
    ...(dimensions.length ? { dimensions } : {}),
  };
}

/** Returns a private, canonical copy (empty `layers` / `dimensions` omitted) or throws `StudioValidationError`. */
export function validateStudioDocument(value: unknown): StudioDocument {
  const d = record(value, ["id", "schemaVersion", "units", "frame", "objects"], "document", ["layers", "dimensions"]);
  if (d.schemaVersion !== "studio-document/1") fail("studioDocument.schemaVersion", "version non prise en charge");
  if (d.units !== "m") fail("studioDocument.units", "unité m attendue");
  if (d.frame !== "local-2d") fail("studioDocument.frame", "repère local-2d attendu");
  const rawObjects = array(d.objects, "studioDocument.objects");
  const rawLayers = Object.hasOwn(d, "layers") ? array(d.layers, "studioDocument.layers") : [];
  const rawDimensions = Object.hasOwn(d, "dimensions") ? array(d.dimensions, "studioDocument.dimensions") : [];
  if (rawLayers.length > STUDIO_LIMITS.layers) fail("studioDocument.layers", `${STUDIO_LIMITS.layers} calques au plus`);
  if (rawObjects.length + rawDimensions.length > STUDIO_LIMITS.objects) fail("studioDocument.objects", `${STUDIO_LIMITS.objects} objets au plus`);
  const layers = rawLayers.map((l, i) => validerCalque(l, `studioDocument.layers[${i}]`));
  const objects = rawObjects.map((o, i) => validerForme(o, `studioDocument.objects[${i}]`));
  const dimensions = rawDimensions.map((o, i) => validerCote(o, `studioDocument.dimensions[${i}]`));
  const layerIds = new Set<string>();
  for (const l of layers) {
    if (layerIds.has(l.id)) fail("studioDocument.layers", "identifiant de calque dupliqué");
    layerIds.add(l.id);
  }
  const shapes = new Map<string, StudioShape>();
  for (const o of objects) {
    if (shapes.has(o.id)) fail("studioDocument.objects", "identifiant dupliqué");
    shapes.set(o.id, o);
  }
  const dimensionIds = new Set<string>();
  dimensions.forEach((o, i) => {
    if (shapes.has(o.id) || dimensionIds.has(o.id)) fail("studioDocument.dimensions", "identifiant dupliqué");
    dimensionIds.add(o.id);
    controlerLiens(o, shapes, `studioDocument.dimensions[${i}]`);
  });
  for (const o of [...objects, ...dimensions]) {
    if (o.layerId !== undefined && !layerIds.has(o.layerId)) fail(`studioDocument.${o.type === "dimension" ? "dimensions" : "objects"}`, "calque inconnu");
  }
  return sortie(identifier(d.id, "studioDocument.id"), objects, layers, dimensions);
}

export function newStudioDocument(id: string): StudioDocument {
  return { id: identifier(id, "studioDocument.id"), schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] };
}

/** Selection is a read, never a persisted command or revision. */
export function selectStudioShape(document: StudioDocument, id: string): StudioShape | null {
  const d = validateStudioDocument(document);
  identifier(id, "selection.id");
  return d.objects.find((o) => o.id === id) ?? null;
}

/** Valeur mesurée d'une cote, dérivée de ses extrémités ; « non évaluée » (null) tant qu'elle est à résoudre. */
export interface StudioDimensionMeasure {
  id: string;
  status: "resolved" | "to-resolve";
  value: number | null;
  unit: "m";
  frame: "local-2d";
}
export function measureStudioDimension(document: StudioDocument, id: string): StudioDimensionMeasure | null {
  const d = validateStudioDocument(document);
  identifier(id, "measure.id");
  const found = d.dimensions?.find((o) => o.id === id);
  if (!found) return null;
  return found.toResolve
    ? { id, status: "to-resolve", value: null, unit: "m", frame: "local-2d" }
    : { id, status: "resolved", value: Math.hypot(found.end.x - found.start.x, found.end.y - found.start.y), unit: "m", frame: "local-2d" };
}
