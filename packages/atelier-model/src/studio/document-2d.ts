import type { Point2 } from "../unites.js";

/** Coordinates inherit the document's explicit local-2d frame and metre unit. */
export type StudioPoint = Pick<Point2, "x" | "y">;
export interface StudioLine {
  id: string;
  type: "line";
  start: StudioPoint;
  end: StudioPoint;
}
export interface StudioRectangle {
  id: string;
  type: "rectangle";
  origin: StudioPoint;
  width: number;
  height: number;
}
export type StudioShape = StudioLine | StudioRectangle;
export interface StudioDocument {
  id: string;
  schemaVersion: "studio-document/1";
  units: "m";
  frame: "local-2d";
  objects: StudioShape[];
}
export const STUDIO_CONTRACT = "studio-commands/1" as const;
export type StudioCommand =
  | { toolId: "studio.dessin.ligne"; params: StudioLine }
  | { toolId: "studio.dessin.rectangle"; params: StudioRectangle }
  | { toolId: "studio.dessin.deplacer"; params: { id: string; dx: number; dy: number } }
  | { toolId: "studio.dessin.modifier"; params: StudioShape };
export interface StudioEnvelope {
  contractVersion: typeof STUDIO_CONTRACT;
  requestId: string;
  baseRevisionId: string;
  commands: StudioCommand[];
}

export class StudioValidationError extends Error {
  readonly code = "studio-invalid";
  constructor(readonly path: string, message: string) {
    super(`${path} : ${message}`);
    this.name = "StudioValidationError";
  }
}

function fail(path: string, message: string): never {
  throw new StudioValidationError(path, message);
}

/** Reject unknown fields rather than silently discarding future or foreign data. */
function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "objet attendu");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(path, "objet JSON attendu");
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some((key) => typeof key !== "string" || !keys.includes(key))) {
    fail(path, "champs absents ou inconnus");
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(`${path}.${key}`, "valeur JSON attendue");
  }
  return value as Record<string, unknown>;
}

function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(path, "identifiant non vide attendu");
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "nombre fini attendu");
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "tableau attendu");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) fail(path, "tableau dense sans propriétés supplémentaires attendu");
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(path, "élément JSON attendu");
  }
  return value;
}

function point(value: unknown, path: string): StudioPoint {
  const p = record(value, ["x", "y"], path);
  return { x: finite(p.x, `${path}.x`), y: finite(p.y, `${path}.y`) };
}

function shape(value: unknown, path: string): StudioShape {
  // Inspect the discriminator without invoking a getter on untrusted input.
  if (!value || typeof value !== "object") fail(path, "objet attendu");
  const type = Object.getOwnPropertyDescriptor(value, "type")?.value;
  if (type === "line") {
    const o = record(value, ["id", "type", "start", "end"], path);
    const start = point(o.start, `${path}.start`);
    const end = point(o.end, `${path}.end`);
    if (start.x === end.x && start.y === end.y) fail(path, "la ligne doit avoir deux points distincts");
    return { id: identifier(o.id, `${path}.id`), type, start, end };
  }
  if (type === "rectangle") {
    const o = record(value, ["id", "type", "origin", "width", "height"], path);
    const origin = point(o.origin, `${path}.origin`);
    const width = finite(o.width, `${path}.width`);
    const height = finite(o.height, `${path}.height`);
    if (width <= 0 || height <= 0) fail(path, "dimensions strictement positives attendues");
    finite(origin.x + width, `${path}.right`);
    finite(origin.y + height, `${path}.top`);
    return { id: identifier(o.id, `${path}.id`), type, origin, width, height };
  }
  return fail(`${path}.type`, "type de géométrie non pris en charge");
}

export function validateStudioDocument(value: unknown): StudioDocument {
  const d = record(value, ["id", "schemaVersion", "units", "frame", "objects"], "document");
  if (d.schemaVersion !== "studio-document/1") fail("studioDocument.schemaVersion", "version non prise en charge");
  if (d.units !== "m") fail("studioDocument.units", "unité m attendue");
  if (d.frame !== "local-2d") fail("studioDocument.frame", "repère local-2d attendu");
  const objects = array(d.objects, "studioDocument.objects").map((o, i) => shape(o, `studioDocument.objects[${i}]`));
  const ids = new Set<string>();
  for (const o of objects) {
    if (ids.has(o.id)) fail("studioDocument.objects", "identifiant dupliqué");
    ids.add(o.id);
  }
  return { id: identifier(d.id, "studioDocument.id"), schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects };
}

export function newStudioDocument(id: string): StudioDocument {
  return { id: identifier(id, "studioDocument.id"), schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] };
}

/** Apply to a private clone; a rejected lot never mutates document or caller inputs. */
export function applyStudioCommands(document: StudioDocument, commands: readonly StudioCommand[]): StudioDocument {
  const next = validateStudioDocument(document);
  const batch = array(commands, "commands");
  if (batch.length === 0) fail("commands", "au moins une commande attendue");
  for (let i = 0; i < batch.length; i++) {
    const path = `commands[${i}]`;
    const c = record(batch[i], ["toolId", "params"], path);
    if (c.toolId === "studio.dessin.ligne" || c.toolId === "studio.dessin.rectangle") {
      const o = shape(c.params, `${path}.params`);
      if ((c.toolId === "studio.dessin.ligne" && o.type !== "line") || (c.toolId === "studio.dessin.rectangle" && o.type !== "rectangle")) fail(path, "outil incompatible avec la géométrie");
      if (next.objects.some((current) => current.id === o.id)) fail(path, "identifiant déjà utilisé");
      next.objects.push(o);
    } else if (c.toolId === "studio.dessin.deplacer") {
      const p = record(c.params, ["id", "dx", "dy"], `${path}.params`);
      const id = identifier(p.id, `${path}.params.id`);
      const dx = finite(p.dx, `${path}.params.dx`);
      const dy = finite(p.dy, `${path}.params.dy`);
      const index = next.objects.findIndex((o) => o.id === id);
      const o = next.objects[index];
      if (!o) fail(path, "objet introuvable");
      const translate = (p: StudioPoint): StudioPoint => ({ x: finite(p.x + dx, path), y: finite(p.y + dy, path) });
      next.objects[index] = shape(o.type === "line" ? { ...o, start: translate(o.start), end: translate(o.end) } : { ...o, origin: translate(o.origin) }, path);
    } else if (c.toolId === "studio.dessin.modifier") {
      const o = shape(c.params, `${path}.params`);
      const index = next.objects.findIndex((current) => current.id === o.id);
      const previous = next.objects[index];
      if (!previous) fail(path, "objet introuvable");
      if (previous.type !== o.type) fail(path, "le type de l’objet ne peut pas changer");
      next.objects[index] = o;
    } else {
      fail(`${path}.toolId`, "outil de mutation non pris en charge");
    }
  }
  return next;
}

/** Selection is a read, never a persisted command or revision. */
export function selectStudioShape(document: StudioDocument, id: string): StudioShape | null {
  const d = validateStudioDocument(document);
  identifier(id, "selection.id");
  return d.objects.find((o) => o.id === id) ?? null;
}
