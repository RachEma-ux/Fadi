import { STUDIO_TWO_PI } from "../courbes.js";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS } from "./limites.js";
import type { StudioExtrusion, StudioPoint } from "./types.js";

/**
 * Primitives de validation du document Studio, partagées par les types d'objets (`objets/`) et les commandes : objets et
 * tableaux JSON stricts (champ inconnu refusé), identifiants, nombres finis, points, calque, extrusion. Internes au
 * paquet : seul `StudioValidationError` est public.
 */

export class StudioValidationError extends Error {
  readonly code = "studio-invalid";
  constructor(readonly path: string, message: string) {
    super(`${path} : ${message}`);
    this.name = "StudioValidationError";
  }
}

export function fail(path: string, message: string): never {
  throw new StudioValidationError(path, message);
}

/** Reject unknown fields rather than silently discarding future or foreign data; optional keys may be absent. */
export function record(value: unknown, keys: readonly string[], path: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "objet attendu");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(path, "objet JSON attendu");
  const names = Reflect.ownKeys(value);
  if (names.some((key) => typeof key !== "string" || (!keys.includes(key) && !optional.includes(key))) || keys.some((key) => !names.includes(key))) {
    fail(path, "champs absents ou inconnus");
  }
  for (const key of names as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(`${path}.${key}`, "valeur JSON attendue");
  }
  return value as Record<string, unknown>;
}

export function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(path, "identifiant non vide attendu");
  if (value.length > 128) fail(path, "identifiant de 128 caractères au plus");
  return value;
}

export function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "nombre fini attendu");
  return value;
}

export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "booléen attendu");
  return value;
}

export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "tableau attendu");
  if (Object.getPrototypeOf(value) !== Array.prototype) fail(path, "tableau JSON attendu");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) fail(path, "tableau dense sans propriétés supplémentaires attendu");
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(path, "élément JSON attendu");
  }
  return value;
}

export function point(value: unknown, path: string): StudioPoint {
  const p = record(value, ["x", "y"], path);
  return { x: finite(p.x, `${path}.x`), y: finite(p.y, `${path}.y`) };
}

export const same = (p: StudioPoint, q: StudioPoint): boolean => p.x === q.x && p.y === q.y;

/** `layerId` absent = calque implicite ; le nommer explicitement est refusé pour garder une seule forme canonique. */
export function layerRef(o: Record<string, unknown>, path: string): { layerId?: string } {
  if (!Object.hasOwn(o, "layerId")) return {};
  const layerId = identifier(o.layerId, `${path}.layerId`);
  if (layerId === STUDIO_DEFAULT_LAYER_ID) fail(`${path}.layerId`, "calque implicite : omettre layerId");
  return { layerId };
}

/** Inspect the discriminator without invoking a getter on untrusted input. */
export function discriminator(value: unknown, path: string): unknown {
  if (!value || typeof value !== "object") fail(path, "objet attendu");
  return Object.getOwnPropertyDescriptor(value, "type")?.value;
}

/** Valeurs d'extrusion saisies : base finie, hauteur et épaisseur strictement positives, sommet fini. */
export function extrusionValues(o: Record<string, unknown>, path: string, thicknessAllowed: boolean, refus = "l’épaisseur ne s’applique qu’aux lignes (un rectangle s’extrude sur son emprise)"): StudioExtrusion {
  const base = finite(o.base, `${path}.base`);
  const height = finite(o.height, `${path}.height`);
  if (height <= 0) fail(`${path}.height`, "hauteur strictement positive attendue");
  finite(base + height, `${path}.top`);
  if (!Object.hasOwn(o, "thickness")) return { base, height };
  if (!thicknessAllowed) fail(`${path}.thickness`, refus);
  const thickness = finite(o.thickness, `${path}.thickness`);
  if (thickness <= 0) fail(`${path}.thickness`, "épaisseur strictement positive attendue");
  // Borne technique (pas une valeur métier) : l’emprise du mur reste finie, loin de tout débordement flottant.
  if (thickness > 1e6) fail(`${path}.thickness`, "épaisseur de 1 000 000 m au plus");
  return { base, height, thickness };
}

export function extrusionRef(o: Record<string, unknown>, path: string, thicknessAllowed: boolean, refus?: string): { extrusion?: StudioExtrusion } {
  if (!Object.hasOwn(o, "extrusion")) return {};
  const e = record(o.extrusion, ["base", "height"], `${path}.extrusion`, ["thickness"]);
  return { extrusion: extrusionValues(e, `${path}.extrusion`, thicknessAllowed, refus) };
}

export const REFUS_EPAISSEUR_COURBE = "l’épaisseur ne s’applique qu’aux lignes et aux arcs (un cercle ou une polyligne s’extrude sans épaisseur)";

/** Centre et rayon : rayon fini strictement positif, emprise finie. */
export function centerRadius(o: Record<string, unknown>, path: string): { center: StudioPoint; radius: number } {
  const center = point(o.center, `${path}.center`);
  const radius = finite(o.radius, `${path}.radius`);
  if (radius <= 0) fail(`${path}.radius`, "rayon strictement positif attendu");
  for (const v of [center.x - radius, center.x + radius, center.y - radius, center.y + radius]) finite(v, `${path}.radius`);
  return { center, radius };
}

export function angle(value: unknown, path: string): number {
  const a = finite(value, path);
  if (a < 0 || a >= STUDIO_TWO_PI) fail(path, "angle en radians dans [0 ; 2π[ attendu");
  return Object.is(a, -0) ? 0 : a;
}

/** Liste d'identifiants d'une commande : non vide, bornée, sans répétition. */
export function idList(value: unknown, path: string): string[] {
  const raw = array(value, path);
  if (raw.length === 0) fail(path, "au moins un identifiant attendu");
  if (raw.length > STUDIO_LIMITS.objects) fail(path, `${STUDIO_LIMITS.objects} identifiants au plus`);
  const ids = raw.map((id, i) => identifier(id, `${path}[${i}]`));
  if (new Set(ids).size !== ids.length) fail(path, "identifiant répété");
  return ids;
}
