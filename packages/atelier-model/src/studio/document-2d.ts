import type { Point2 } from "../unites.js";
import { studioArcEnds, studioOffset, studioPolylinePath, studioPolylineSegmentCount, studioPolylineSegments, studioRingSimple, studioSegmentMid, STUDIO_TWO_PI } from "./courbes.js";

/**
 * Document 2D natif de Studio (`studio-document/1`). Extension additive et rétrocompatible : calques (`layers`) et cotes
 * associatives (`dimensions`) sont des champs facultatifs ; un document V1 (lignes et rectangles, sans calque) reste
 * valide et s'applique à l'identique. Les courbes (cercle, arc, polyligne à renflements) sont des types d'objets ajoutés de
 * la même façon, avec l'outil de décalage (`studio.dessin.decaler`) ; un document sans courbe ne change pas.
 * Toutes les coordonnées sont dans le repère explicite `local-2d`, en mètres.
 * Pur : ni React, ni DOM, ni stockage.
 */

/** Coordinates inherit the document's explicit local-2d frame and metre unit. */
export type StudioPoint = Pick<Point2, "x" | "y">;

/** Calque implicite des objets sans `layerId` ; il peut être matérialisé dans `layers` pour être réglé. */
export const STUDIO_DEFAULT_LAYER_ID = "default" as const;
/** Limites reprises de la Planche 2D de la pile (calques, objets) ; un document au-delà est refusé, jamais tronqué. */
export const STUDIO_LIMITS = Object.freeze({ layers: 200, objects: 20_000, layerName: 80, polylinePoints: 5000, extrudedRing: 1024, extrudedRingsTotal: 200_000 } as const);
/**
 * Bornes techniques des courbes (pas des valeurs métier) : `polylinePoints` sommets par polyligne ; `extrudedRing` sommets
 * du contour discrétisé d'une polyligne fermée extrudée (contrôle de simplicité et triangulation bornés) ;
 * `extrudedRingsTotal` sommets discrétisés pour toutes les polylignes fermées extrudées d'un document (budget des
 * écritures ; une révision enregistrée reste lisible) ; renflement
 * (`bulge`) de valeur absolue 10⁶ au plus.
 */
export const STUDIO_BULGE_MAX = 1e6;

/**
 * Déclaration d'extrusion d'un objet (extension additive, facultative), en mètres : `base` = cote du bas, `height` =
 * hauteur strictement positive, `thickness` = largeur de mur centrée sur la ligne (lignes seulement ; strictement
 * positive). Seules les valeurs saisies par l'utilisateur sont stockées : aucune valeur par défaut n'est inventée, un
 * objet sans extrusion est « non extrudé ». La géométrie 3D est dérivée (`studioMesh3d`), jamais stockée.
 */
export interface StudioExtrusion {
  base: number;
  height: number;
  thickness?: number;
}
export interface StudioLine {
  id: string;
  type: "line";
  layerId?: string;
  start: StudioPoint;
  end: StudioPoint;
  extrusion?: StudioExtrusion;
}
export interface StudioRectangle {
  id: string;
  type: "rectangle";
  layerId?: string;
  origin: StudioPoint;
  width: number;
  height: number;
  /** Un rectangle s'extrude en prisme sur son emprise : `thickness` y est refusée. */
  extrusion?: Omit<StudioExtrusion, "thickness">;
}
/** Cercle : centre et rayon strictement positif ; s'extrude en prisme (cylindre) sur son emprise, sans épaisseur. */
export interface StudioCircle {
  id: string;
  type: "circle";
  layerId?: string;
  center: StudioPoint;
  radius: number;
  extrusion?: Omit<StudioExtrusion, "thickness">;
}
/**
 * Arc de cercle parcouru dans le sens trigonométrique de `startAngle` à `endAngle` (radians, chacun dans [0 ; 2π[,
 * distincts ; repère local-2d, angle 0 sur +x). S'extrude comme une ligne : avec épaisseur (mur courbe centré sur
 * l'arc, épaisseur inférieure au diamètre) ou sans (surface verticale).
 */
export interface StudioArc {
  id: string;
  type: "arc";
  layerId?: string;
  center: StudioPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  extrusion?: StudioExtrusion;
}
/**
 * Polyligne : deux sommets au moins, consécutifs distincts (fermeture comprise), `closed` explicite ; `bulges`
 * facultatif, un renflement par segment (`tan(θ/4)`, 0 = droit, comme le DXF), omis quand tous sont nuls (forme
 * canonique). Extrusion sans épaisseur seulement : fermée, prisme sur son emprise (contour simple exigé) ; ouverte,
 * surface verticale. Une épaisseur (mur) n'y est pas définie aux jonctions : elle est refusée.
 */
export interface StudioPolyline {
  id: string;
  type: "polyline";
  layerId?: string;
  points: StudioPoint[];
  closed: boolean;
  bulges?: number[];
  extrusion?: Omit<StudioExtrusion, "thickness">;
}
export type StudioShape = StudioLine | StudioRectangle | StudioCircle | StudioArc | StudioPolyline;

export type StudioLineAnchor = "start" | "end";
/** Sommets du rectangle nommés par construction (origine, origine + largeur, origine + hauteur, opposé). */
export type StudioRectangleAnchor = "corner-origin" | "corner-width" | "corner-height" | "corner-opposite";
/**
 * Sommets des courbes et milieux : `mid` (milieu d'une ligne ou d'un arc), `center` (cercle, arc), quadrants d'un cercle
 * (angle en degrés), `vertex-i` (sommet i d'une polyligne) et `mid-i` (milieu de son segment i).
 */
export type StudioCurveAnchor = "mid" | "center" | "quadrant-0" | "quadrant-90" | "quadrant-180" | "quadrant-270" | `vertex-${number}` | `mid-${number}`;
export type StudioAnchor = StudioLineAnchor | StudioRectangleAnchor | StudioCurveAnchor;
export const STUDIO_FIXED_ANCHORS: readonly StudioAnchor[] = Object.freeze(["start", "end", "corner-origin", "corner-width", "corner-height", "corner-opposite", "mid", "center", "quadrant-0", "quadrant-90", "quadrant-180", "quadrant-270"] as const);
/** Sommet ou milieu indexé d'une polyligne (index canonique, sans zéro de tête). */
export const STUDIO_INDEXED_ANCHOR = /^(vertex|mid)-(0|[1-9][0-9]{0,4})$/;
export const STUDIO_LINE_ANCHORS: readonly StudioLineAnchor[] = Object.freeze(["start", "end"] as const);
export const STUDIO_RECTANGLE_ANCHORS: readonly StudioRectangleAnchor[] = Object.freeze(["corner-origin", "corner-width", "corner-height", "corner-opposite"] as const);

/** Référence d'une extrémité de cote vers un sommet d'objet : la cote suit l'objet. */
export interface StudioDimensionLink {
  objectId: string;
  anchor: StudioAnchor;
}
/**
 * Cote linéaire alignée. La valeur mesurée est dérivée (`measureStudioDimension`), jamais stockée ; `offset` est signé,
 * en mètres. Les extrémités liées sont recopiées depuis l'objet lié et contrôlées à l'égalité exacte. Quand un objet lié
 * disparaît, le lien devient `null` et la cote passe `toResolve` : elle n'est ni supprimée ni rattachée ailleurs.
 */
export interface StudioDimension {
  id: string;
  type: "dimension";
  layerId?: string;
  start: StudioPoint;
  end: StudioPoint;
  offset: number;
  links: { start: StudioDimensionLink | null; end: StudioDimensionLink | null };
  toResolve: boolean;
}
export type StudioItem = StudioShape | StudioDimension;

export interface StudioLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface StudioDocument {
  id: string;
  schemaVersion: "studio-document/1";
  units: "m";
  frame: "local-2d";
  objects: StudioShape[];
  /** Absent ou vide : seul le calque implicite existe. */
  layers?: StudioLayer[];
  /** Cotes, séparées de `objects` pour qu'un lecteur V1 (lignes et rectangles) ne les interprète jamais à tort. */
  dimensions?: StudioDimension[];
}
export const STUDIO_CONTRACT = "studio-commands/1" as const;
export type StudioCommand =
  | { toolId: "studio.dessin.ligne"; params: StudioLine }
  | { toolId: "studio.dessin.rectangle"; params: StudioRectangle }
  | { toolId: "studio.dessin.cercle"; params: StudioCircle }
  | { toolId: "studio.dessin.arc"; params: StudioArc }
  | { toolId: "studio.dessin.polyligne"; params: StudioPolyline }
  | { toolId: "studio.dessin.decaler"; params: { id: string; newId: string; distance: number } }
  | { toolId: "studio.dessin.deplacer"; params: { id: string; dx: number; dy: number } }
  | { toolId: "studio.dessin.modifier"; params: StudioItem }
  | { toolId: "studio.dessin.cote"; params: StudioDimension }
  | { toolId: "studio.dessin.supprimer"; params: { ids: string[] } }
  | { toolId: "studio.calque.creer"; params: StudioLayer }
  | { toolId: "studio.calque.modifier"; params: StudioLayer }
  | { toolId: "studio.objet.calque"; params: { ids: string[]; layerId: string } }
  | { toolId: "studio.objet.extruder"; params: { ids: string[]; base: number; height: number; thickness?: number } }
  | { toolId: "studio.objet.aplatir"; params: { ids: string[] } };
export type StudioCommandToolId = StudioCommand["toolId"];
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

/** Reject unknown fields rather than silently discarding future or foreign data; optional keys may be absent. */
function record(value: unknown, keys: readonly string[], path: string, optional: readonly string[] = []): Record<string, unknown> {
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

function identifier(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) fail(path, "identifiant non vide attendu");
  if (value.length > 128) fail(path, "identifiant de 128 caractères au plus");
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "nombre fini attendu");
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "booléen attendu");
  return value;
}

function array(value: unknown, path: string): unknown[] {
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

function point(value: unknown, path: string): StudioPoint {
  const p = record(value, ["x", "y"], path);
  return { x: finite(p.x, `${path}.x`), y: finite(p.y, `${path}.y`) };
}

const same = (p: StudioPoint, q: StudioPoint): boolean => p.x === q.x && p.y === q.y;

/** `layerId` absent = calque implicite ; le nommer explicitement est refusé pour garder une seule forme canonique. */
function layerRef(o: Record<string, unknown>, path: string): { layerId?: string } {
  if (!Object.hasOwn(o, "layerId")) return {};
  const layerId = identifier(o.layerId, `${path}.layerId`);
  if (layerId === STUDIO_DEFAULT_LAYER_ID) fail(`${path}.layerId`, "calque implicite : omettre layerId");
  return { layerId };
}

/** Inspect the discriminator without invoking a getter on untrusted input. */
function discriminator(value: unknown, path: string): unknown {
  if (!value || typeof value !== "object") fail(path, "objet attendu");
  return Object.getOwnPropertyDescriptor(value, "type")?.value;
}

/** Valeurs d'extrusion saisies : base finie, hauteur et épaisseur strictement positives, sommet fini. */
function extrusionValues(o: Record<string, unknown>, path: string, thicknessAllowed: boolean, refus = "l’épaisseur ne s’applique qu’aux lignes (un rectangle s’extrude sur son emprise)"): StudioExtrusion {
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

function extrusionRef(o: Record<string, unknown>, path: string, thicknessAllowed: boolean, refus?: string): { extrusion?: StudioExtrusion } {
  if (!Object.hasOwn(o, "extrusion")) return {};
  const e = record(o.extrusion, ["base", "height"], `${path}.extrusion`, ["thickness"]);
  return { extrusion: extrusionValues(e, `${path}.extrusion`, thicknessAllowed, refus) };
}

const REFUS_EPAISSEUR_COURBE = "l’épaisseur ne s’applique qu’aux lignes et aux arcs (un cercle ou une polyligne s’extrude sans épaisseur)";

/** Centre et rayon : rayon fini strictement positif, emprise finie. */
function centerRadius(o: Record<string, unknown>, path: string): { center: StudioPoint; radius: number } {
  const center = point(o.center, `${path}.center`);
  const radius = finite(o.radius, `${path}.radius`);
  if (radius <= 0) fail(`${path}.radius`, "rayon strictement positif attendu");
  for (const v of [center.x - radius, center.x + radius, center.y - radius, center.y + radius]) finite(v, `${path}.radius`);
  return { center, radius };
}

function angle(value: unknown, path: string): number {
  const a = finite(value, path);
  if (a < 0 || a >= STUDIO_TWO_PI) fail(path, "angle en radians dans [0 ; 2π[ attendu");
  return Object.is(a, -0) ? 0 : a;
}

/**
 * Contrôle de simplicité (O(n²)) mémorisé par contour : un document relu (chaque lecture, chaque lot) ne repaie pas le
 * contrôle de ses contours déjà vus. Mémoire bornée (les plus anciens contours sont oubliés). Le résultat ne dépend que
 * des coordonnées : la mémoire ne change jamais une décision.
 */
const MEMO_ANNEAUX = new Map<string, boolean>();
const MEMO_ANNEAUX_MAX = 4096;
function anneauSimpleMemo(ring: readonly StudioPoint[]): boolean {
  const cle = ring.map((p) => `${p.x},${p.y}`).join(";");
  const vu = MEMO_ANNEAUX.get(cle);
  if (vu !== undefined) return vu;
  const simple = studioRingSimple(ring);
  if (MEMO_ANNEAUX.size >= MEMO_ANNEAUX_MAX) MEMO_ANNEAUX.delete(MEMO_ANNEAUX.keys().next().value!);
  MEMO_ANNEAUX.set(cle, simple);
  return simple;
}

/** Sommets discrétisés des polylignes fermées extrudées d'un document (charge des contrôles de simplicité). */
export function studioExtrudedRingVertices(objects: readonly StudioShape[]): number {
  let n = 0;
  for (const o of objects) if (o.type === "polyline" && o.closed && o.extrusion) n += studioPolylinePath(o).length;
  return n;
}

function polyline(value: unknown, path: string): StudioPolyline {
  const o = record(value, ["id", "type", "points", "closed"], path, ["layerId", "bulges", "extrusion"]);
  const raw = array(o.points, `${path}.points`);
  if (raw.length < 2) fail(`${path}.points`, "deux sommets au moins attendus");
  if (raw.length > STUDIO_LIMITS.polylinePoints) fail(`${path}.points`, `${STUDIO_LIMITS.polylinePoints} sommets au plus`);
  const points = raw.map((p, i) => point(p, `${path}.points[${i}]`));
  const closed = boolean(o.closed, `${path}.closed`);
  const segments = closed ? points.length : points.length - 1;
  for (let i = 0; i < segments; i++) if (same(points[i]!, points[(i + 1) % points.length]!)) fail(`${path}.points[${(i + 1) % points.length}]`, "sommets consécutifs confondus");
  let bulges: number[] | undefined;
  if (Object.hasOwn(o, "bulges")) {
    const b = array(o.bulges, `${path}.bulges`);
    if (b.length !== segments) fail(`${path}.bulges`, `un renflement par segment attendu (${segments})`);
    bulges = b.map((v, i) => {
      const x = finite(v, `${path}.bulges[${i}]`);
      if (Math.abs(x) > STUDIO_BULGE_MAX) fail(`${path}.bulges[${i}]`, "renflement de valeur absolue 1 000 000 au plus");
      return Object.is(x, -0) ? 0 : x;
    });
    // Forme canonique : des renflements tous nuls s'omettent.
    if (bulges.every((x) => x === 0)) bulges = undefined;
  }
  if (closed && points.length < 3 && !bulges) fail(`${path}.points`, "une polyligne fermée sans segment courbe a trois sommets au moins");
  const extrusion = extrusionRef(o, path, false, REFUS_EPAISSEUR_COURBE);
  const out: StudioPolyline = { id: identifier(o.id, `${path}.id`), type: "polyline", ...layerRef(o, path), points, closed, ...(bulges ? { bulges } : {}), ...extrusion };
  if (extrusion.extrusion && closed) {
    const ring = studioPolylinePath(out);
    if (ring.length > STUDIO_LIMITS.extrudedRing) fail(`${path}.extrusion`, `contour de ${STUDIO_LIMITS.extrudedRing} sommets discrétisés au plus pour une extrusion`);
    if (!anneauSimpleMemo(ring)) fail(`${path}.extrusion`, "une polyligne fermée extrudée doit avoir un contour simple (sans croisement)");
  }
  return out;
}

function shape(value: unknown, path: string): StudioShape {
  const type = discriminator(value, path);
  if (type === "line") {
    const o = record(value, ["id", "type", "start", "end"], path, ["layerId", "extrusion"]);
    const start = point(o.start, `${path}.start`);
    const end = point(o.end, `${path}.end`);
    if (same(start, end)) fail(path, "la ligne doit avoir deux points distincts");
    return { id: identifier(o.id, `${path}.id`), type, ...layerRef(o, path), start, end, ...extrusionRef(o, path, true) };
  }
  if (type === "rectangle") {
    const o = record(value, ["id", "type", "origin", "width", "height"], path, ["layerId", "extrusion"]);
    const origin = point(o.origin, `${path}.origin`);
    const width = finite(o.width, `${path}.width`);
    const height = finite(o.height, `${path}.height`);
    if (width <= 0 || height <= 0) fail(path, "dimensions strictement positives attendues");
    finite(origin.x + width, `${path}.right`);
    finite(origin.y + height, `${path}.top`);
    return { id: identifier(o.id, `${path}.id`), type, ...layerRef(o, path), origin, width, height, ...extrusionRef(o, path, false) };
  }
  if (type === "circle") {
    const o = record(value, ["id", "type", "center", "radius"], path, ["layerId", "extrusion"]);
    return { id: identifier(o.id, `${path}.id`), type, ...layerRef(o, path), ...centerRadius(o, path), ...extrusionRef(o, path, false, REFUS_EPAISSEUR_COURBE) };
  }
  if (type === "arc") {
    const o = record(value, ["id", "type", "center", "radius", "startAngle", "endAngle"], path, ["layerId", "extrusion"]);
    const cr = centerRadius(o, path);
    const startAngle = angle(o.startAngle, `${path}.startAngle`);
    const endAngle = angle(o.endAngle, `${path}.endAngle`);
    if (startAngle === endAngle) fail(path, "angles de début et de fin distincts attendus");
    const extrusion = extrusionRef(o, path, true);
    if (extrusion.extrusion?.thickness !== undefined && extrusion.extrusion.thickness >= 2 * cr.radius) fail(`${path}.extrusion.thickness`, "l’épaisseur d’un arc doit rester inférieure à son diamètre");
    return { id: identifier(o.id, `${path}.id`), type, ...layerRef(o, path), ...cr, startAngle, endAngle, ...extrusion };
  }
  if (type === "polyline") return polyline(value, path);
  return fail(`${path}.type`, "type de géométrie non pris en charge");
}

function link(value: unknown, path: string): StudioDimensionLink | null {
  if (value === null) return null;
  const l = record(value, ["objectId", "anchor"], path);
  const anchor = l.anchor;
  if (typeof anchor !== "string" || (!(STUDIO_FIXED_ANCHORS as readonly string[]).includes(anchor) && !STUDIO_INDEXED_ANCHOR.test(anchor))) fail(`${path}.anchor`, "sommet inconnu");
  return { objectId: identifier(l.objectId, `${path}.objectId`), anchor: anchor as StudioAnchor };
}

function dimension(value: unknown, path: string): StudioDimension {
  if (discriminator(value, path) !== "dimension") fail(`${path}.type`, "cote attendue");
  const o = record(value, ["id", "type", "start", "end", "offset", "links", "toResolve"], path, ["layerId"]);
  const start = point(o.start, `${path}.start`);
  const end = point(o.end, `${path}.end`);
  if (same(start, end)) fail(path, "la cote doit avoir deux points distincts");
  const offset = finite(o.offset, `${path}.offset`);
  const l = record(o.links, ["start", "end"], `${path}.links`);
  const links = { start: link(l.start, `${path}.links.start`), end: link(l.end, `${path}.links.end`) };
  const toResolve = boolean(o.toResolve, `${path}.toResolve`);
  // « À résoudre » ne naît que d'un lien rompu (mis à null) : une cote entièrement liée ne peut pas l'être.
  if (toResolve && links.start && links.end) fail(`${path}.toResolve`, "une cote à résoudre a au moins un lien rompu");
  return { id: identifier(o.id, `${path}.id`), type: "dimension", ...layerRef(o, path), start, end, offset, links, toResolve };
}

function item(value: unknown, path: string): StudioItem {
  return discriminator(value, path) === "dimension" ? dimension(value, path) : shape(value, path);
}

function layer(value: unknown, path: string): StudioLayer {
  const o = record(value, ["id", "name", "visible", "locked"], path);
  const name = o.name;
  if (typeof name !== "string" || !name.trim() || name.includes("\0") || name.length > STUDIO_LIMITS.layerName) fail(`${path}.name`, `nom non vide de ${STUDIO_LIMITS.layerName} caractères au plus attendu`);
  return { id: identifier(o.id, `${path}.id`), name, visible: boolean(o.visible, `${path}.visible`), locked: boolean(o.locked, `${path}.locked`) };
}

/** Sommet d'un objet nommé par un lien de cote, ou null si le sommet n'existe pas pour ce type. */
export function studioAnchorPoint(target: StudioShape, anchor: StudioAnchor): StudioPoint | null {
  switch (target.type) {
    case "line":
      return anchor === "start" ? { ...target.start } : anchor === "end" ? { ...target.end }
        : anchor === "mid" ? { x: (target.start.x + target.end.x) / 2, y: (target.start.y + target.end.y) / 2 } : null;
    case "rectangle": {
      const { x, y } = target.origin;
      switch (anchor) {
        case "corner-origin": return { x, y };
        case "corner-width": return { x: x + target.width, y };
        case "corner-height": return { x, y: y + target.height };
        case "corner-opposite": return { x: x + target.width, y: y + target.height };
        default: return null;
      }
    }
    case "circle": {
      const { center: c, radius: r } = target;
      switch (anchor) {
        case "center": return { ...c };
        case "quadrant-0": return { x: c.x + r, y: c.y };
        case "quadrant-90": return { x: c.x, y: c.y + r };
        case "quadrant-180": return { x: c.x - r, y: c.y };
        case "quadrant-270": return { x: c.x, y: c.y - r };
        default: return null;
      }
    }
    case "arc": {
      if (anchor === "center") return { ...target.center };
      if (anchor !== "start" && anchor !== "end" && anchor !== "mid") return null;
      return studioArcEnds(target)[anchor];
    }
    case "polyline": {
      const m = STUDIO_INDEXED_ANCHOR.exec(anchor);
      if (!m) return null;
      const i = Number(m[2]);
      if (m[1] === "vertex") return i < target.points.length ? { ...target.points[i]! } : null;
      return i < studioPolylineSegmentCount(target) ? studioSegmentMid(studioPolylineSegments(target)[i]!) : null;
    }
  }
}

function checkLinks(d: StudioDimension, shapes: ReadonlyMap<string, StudioShape>, path: string): void {
  for (const end of ["start", "end"] as const) {
    const l = d.links[end];
    if (!l) continue;
    const target = shapes.get(l.objectId);
    if (!target) fail(`${path}.links.${end}`, "objet lié introuvable");
    const anchor = studioAnchorPoint(target, l.anchor);
    if (!anchor) fail(`${path}.links.${end}.anchor`, "sommet incompatible avec l’objet lié");
    if (!same(anchor, d[end])) fail(`${path}.${end}`, "extrémité différente du sommet lié");
  }
}

function output(id: string, objects: StudioShape[], layers: StudioLayer[], dimensions: StudioDimension[]): StudioDocument {
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
  const layers = rawLayers.map((l, i) => layer(l, `studioDocument.layers[${i}]`));
  const objects = rawObjects.map((o, i) => shape(o, `studioDocument.objects[${i}]`));
  const dimensions = rawDimensions.map((o, i) => dimension(o, `studioDocument.dimensions[${i}]`));
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
    checkLinks(o, shapes, `studioDocument.dimensions[${i}]`);
  });
  for (const o of [...objects, ...dimensions]) {
    if (o.layerId !== undefined && !layerIds.has(o.layerId)) fail(`studioDocument.${o.type === "dimension" ? "dimensions" : "objects"}`, "calque inconnu");
  }
  return output(identifier(d.id, "studioDocument.id"), objects, layers, dimensions);
}

export function newStudioDocument(id: string): StudioDocument {
  return { id: identifier(id, "studioDocument.id"), schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] };
}

/** État d'affichage et d'édition d'un calque ; le calque implicite non matérialisé est visible et déverrouillé. */
export interface StudioLayerState {
  id: string;
  visible: boolean;
  locked: boolean;
  implicit: boolean;
}
export function studioLayerState(doc: StudioDocument, layerId: string | undefined): StudioLayerState | null {
  const id = layerId ?? STUDIO_DEFAULT_LAYER_ID;
  const found = doc.layers?.find((l) => l.id === id);
  if (found) return { id, visible: found.visible, locked: found.locked, implicit: false };
  return id === STUDIO_DEFAULT_LAYER_ID ? { id, visible: true, locked: false, implicit: true } : null;
}

// ——— Application des commandes : clone privé, tout ou rien ———

interface State {
  id: string;
  objects: StudioShape[];
  layers: StudioLayer[];
  dimensions: StudioDimension[];
  /** Identifiants d'objets et de cotes présents : contrôle d'unicité en temps constant (un import peut compter 20 000 créations). */
  ids: Set<string>;
}
type Handler = (state: State, params: unknown, path: string) => void;

function stateLayer(state: State, layerId: string | undefined, path: string): StudioLayerState {
  const found = studioLayerState(output(state.id, [], state.layers, []), layerId);
  if (!found) fail(path, "calque inconnu");
  return found;
}
function editable(state: State, target: { layerId?: string }, path: string): void {
  if (stateLayer(state, target.layerId, path).locked) fail(path, "calque verrouillé");
}
function freeId(state: State, id: string, path: string): void {
  if (state.ids.has(id)) fail(path, "identifiant déjà utilisé");
}
function shapeMap(state: State): Map<string, StudioShape> {
  return new Map(state.objects.map((o) => [o.id, o]));
}
function idList(value: unknown, path: string): string[] {
  const raw = array(value, path);
  if (raw.length === 0) fail(path, "au moins un identifiant attendu");
  if (raw.length > STUDIO_LIMITS.objects) fail(path, `${STUDIO_LIMITS.objects} identifiants au plus`);
  const ids = raw.map((id, i) => identifier(id, `${path}[${i}]`));
  if (new Set(ids).size !== ids.length) fail(path, "identifiant répété");
  return ids;
}

/** Les cotes liées à un objet suivent sa nouvelle géométrie (même identité). */
function followLinks(state: State, shapeId: string, path: string): void {
  const target = state.objects.find((o) => o.id === shapeId);
  if (!target) return;
  state.dimensions = state.dimensions.map((d) => {
    if (d.links.start?.objectId !== shapeId && d.links.end?.objectId !== shapeId) return d;
    const start = d.links.start?.objectId === shapeId ? studioAnchorPoint(target, d.links.start.anchor) : d.start;
    const end = d.links.end?.objectId === shapeId ? studioAnchorPoint(target, d.links.end.anchor) : d.end;
    if (!start || !end) fail(path, "sommet de cote liée introuvable");
    if (same(start, d.start) && same(end, d.end)) return d;
    editable(state, d, `${path} (cote liée ${d.id})`);
    if (same(start, end)) fail(path, `la cote liée ${d.id} deviendrait de longueur nulle`);
    return { ...d, start, end };
  });
}

/** Translation de tous les points d'une forme (rayons, angles, renflements inchangés). */
function translateShape(o: StudioShape, t: (p: StudioPoint) => StudioPoint): StudioShape {
  switch (o.type) {
    case "line": return { ...o, start: t(o.start), end: t(o.end) };
    case "rectangle": return { ...o, origin: t(o.origin) };
    case "circle": case "arc": return { ...o, center: t(o.center) };
    case "polyline": return { ...o, points: o.points.map(t) };
  }
}

function createShape(type: StudioShape["type"]): Handler {
  return (state, params, path) => {
    const o = shape(params, `${path}.params`);
    if (o.type !== type) fail(path, "outil incompatible avec la géométrie");
    freeId(state, o.id, path);
    editable(state, o, path);
    state.objects.push(o);
    state.ids.add(o.id);
  };
}

function enteredDimension(state: State, params: unknown, path: string): StudioDimension {
  const d = dimension(params, `${path}.params`);
  if (d.toResolve) fail(`${path}.params.toResolve`, "l’état à résoudre naît d’une suppression, il n’est jamais saisi");
  editable(state, d, path);
  checkLinks(d, shapeMap(state), `${path}.params`);
  return d;
}

const HANDLERS: Record<StudioCommandToolId, Handler> = {
  "studio.dessin.ligne": createShape("line"),
  "studio.dessin.rectangle": createShape("rectangle"),
  "studio.dessin.cercle": createShape("circle"),
  "studio.dessin.arc": createShape("arc"),
  "studio.dessin.polyligne": createShape("polyline"),
  "studio.dessin.deplacer": (state, params, path) => {
    const p = record(params, ["id", "dx", "dy"], `${path}.params`);
    const id = identifier(p.id, `${path}.params.id`);
    const dx = finite(p.dx, `${path}.params.dx`);
    const dy = finite(p.dy, `${path}.params.dy`);
    const translate = (q: StudioPoint): StudioPoint => ({ x: finite(q.x + dx, path), y: finite(q.y + dy, path) });
    const index = state.objects.findIndex((o) => o.id === id);
    const o = state.objects[index];
    if (o) {
      editable(state, o, path);
      state.objects[index] = shape(translateShape(o, translate), path);
      followLinks(state, id, path);
      return;
    }
    const dIndex = state.dimensions.findIndex((x) => x.id === id);
    const d = state.dimensions[dIndex];
    if (!d) fail(path, "objet introuvable");
    editable(state, d, path);
    if (d.links.start || d.links.end) fail(path, "une cote liée suit ses objets et ne se déplace pas seule");
    state.dimensions[dIndex] = dimension({ ...d, start: translate(d.start), end: translate(d.end) }, path);
  },
  "studio.dessin.modifier": (state, params, path) => {
    const o = item(params, `${path}.params`);
    const index = state.objects.findIndex((current) => current.id === o.id);
    const dIndex = state.dimensions.findIndex((current) => current.id === o.id);
    const previous = state.objects[index] ?? state.dimensions[dIndex];
    if (!previous) fail(path, "objet introuvable");
    if (previous.type !== o.type) fail(path, "le type de l’objet ne peut pas changer");
    if (previous.layerId !== o.layerId) fail(path, "le calque se change par studio.objet.calque");
    editable(state, previous, path);
    if (o.type === "dimension") {
      state.dimensions[dIndex] = enteredDimension(state, o, path);
    } else {
      state.objects[index] = o;
      followLinks(state, o.id, path);
    }
  },
  "studio.dessin.decaler": (state, params, path) => {
    const p = record(params, ["id", "newId", "distance"], `${path}.params`);
    const id = identifier(p.id, `${path}.params.id`);
    const newId = identifier(p.newId, `${path}.params.newId`);
    const distance = finite(p.distance, `${path}.params.distance`);
    if (distance === 0) fail(`${path}.params.distance`, "distance non nulle attendue");
    const source = state.objects.find((o) => o.id === id);
    if (!source) fail(path, state.dimensions.some((d) => d.id === id) ? `une cote ne se décale pas : ${id}` : `objet introuvable : ${id}`);
    editable(state, source, path);
    freeId(state, newId, path);
    const r = studioOffset(source, distance, newId);
    if (!r.ok) fail(path, `décalage impossible : ${r.raison}`);
    state.objects.push(shape(r.shape, path));
    state.ids.add(newId);
  },
  "studio.dessin.cote": (state, params, path) => {
    const d = enteredDimension(state, params, path);
    freeId(state, d.id, path);
    state.dimensions.push(d);
    state.ids.add(d.id);
  },
  "studio.dessin.supprimer": (state, params, path) => {
    const p = record(params, ["ids"], `${path}.params`);
    const ids = new Set(idList(p.ids, `${path}.params.ids`));
    const items = new Map<string, StudioItem>([...state.objects, ...state.dimensions].map((o) => [o.id, o]));
    for (const id of ids) {
      const target = items.get(id);
      if (!target) fail(path, `objet introuvable : ${id}`);
      editable(state, target, path);
    }
    state.objects = state.objects.filter((o) => !ids.has(o.id));
    for (const id of ids) state.ids.delete(id);
    state.dimensions = state.dimensions.filter((d) => !ids.has(d.id)).map((d) => {
      const breakStart = !!d.links.start && ids.has(d.links.start.objectId);
      const breakEnd = !!d.links.end && ids.has(d.links.end.objectId);
      if (!breakStart && !breakEnd) return d;
      editable(state, d, `${path} (cote liée ${d.id})`);
      return { ...d, links: { start: breakStart ? null : d.links.start, end: breakEnd ? null : d.links.end }, toResolve: true };
    });
  },
  "studio.calque.creer": (state, params, path) => {
    const l = layer(params, `${path}.params`);
    if (state.layers.some((x) => x.id === l.id)) fail(path, "calque déjà existant");
    if (state.layers.length >= STUDIO_LIMITS.layers) fail(path, `${STUDIO_LIMITS.layers} calques au plus`);
    state.layers.push(l);
  },
  "studio.calque.modifier": (state, params, path) => {
    const l = layer(params, `${path}.params`);
    const index = state.layers.findIndex((x) => x.id === l.id);
    if (index < 0) fail(path, "calque inconnu");
    state.layers[index] = l;
  },
  "studio.objet.calque": (state, params, path) => {
    const p = record(params, ["ids", "layerId"], `${path}.params`);
    const ids = idList(p.ids, `${path}.params.ids`);
    const layerId = identifier(p.layerId, `${path}.params.layerId`);
    const target = layerId === STUDIO_DEFAULT_LAYER_ID ? undefined : layerId;
    if (stateLayer(state, target, path).locked) fail(path, "calque cible verrouillé");
    const move = <T extends StudioItem>(o: T): T => {
      const { layerId: _previous, ...rest } = o;
      return (target === undefined ? rest : { ...rest, layerId: target }) as T;
    };
    const objectIndex = new Map(state.objects.map((o, i) => [o.id, i]));
    const dimensionIndex = new Map(state.dimensions.map((o, i) => [o.id, i]));
    for (const id of ids) {
      const index = objectIndex.get(id) ?? -1;
      const dIndex = dimensionIndex.get(id) ?? -1;
      const o = state.objects[index] ?? state.dimensions[dIndex];
      if (!o) fail(path, `objet introuvable : ${id}`);
      editable(state, o, path);
      if (o.type === "dimension") state.dimensions[dIndex] = move(o);
      else state.objects[index] = move(o);
    }
  },
  "studio.objet.extruder": (state, params, path) => {
    const p = record(params, ["ids", "base", "height"], `${path}.params`, ["thickness"]);
    const ids = idList(p.ids, `${path}.params.ids`);
    const values = extrusionValues(p, `${path}.params`, true);
    const index = new Map(state.objects.map((o, i) => [o.id, i]));
    for (const id of ids) {
      const i = index.get(id);
      if (i === undefined) fail(path, state.dimensions.some((d) => d.id === id) ? `une cote ne s’extrude pas : ${id}` : `objet introuvable : ${id}`);
      const o = state.objects[i]!;
      editable(state, o, path);
      if (values.thickness !== undefined && o.type !== "line" && o.type !== "arc") fail(`${path}.params.thickness`, `l’épaisseur ne s’applique qu’aux lignes et aux arcs : ${id}`);
      // Contrôle complet de la forme extrudée (contour simple d'une polyligne fermée, épaisseur d'un arc).
      state.objects[i] = shape({ ...o, extrusion: { ...values } }, `${path} (${id})`);
    }
  },
  "studio.objet.aplatir": (state, params, path) => {
    const p = record(params, ["ids"], `${path}.params`);
    const ids = idList(p.ids, `${path}.params.ids`);
    const index = new Map(state.objects.map((o, i) => [o.id, i]));
    for (const id of ids) {
      const i = index.get(id);
      if (i === undefined) fail(path, `objet introuvable : ${id}`);
      const o = state.objects[i]!;
      editable(state, o, path);
      if (!o.extrusion) fail(path, `objet non extrudé : ${id}`);
      const { extrusion: _removed, ...flat } = o;
      state.objects[i] = flat as StudioShape;
    }
  },
};

/** Identifiants réellement acceptés par `applyStudioCommands` (contrôlés contre le registre par test). */
export const STUDIO_APPLIED_TOOL_IDS: readonly StudioCommandToolId[] = Object.freeze(Object.keys(HANDLERS) as StudioCommandToolId[]);

/** Apply to a private clone; a rejected lot never mutates document or caller inputs. */
export function applyStudioCommands(document: StudioDocument, commands: readonly StudioCommand[]): StudioDocument {
  const current = validateStudioDocument(document);
  // Charge avant le lot, relevée avant toute mutation (l'état partage les tableaux de `current`).
  const avant = studioExtrudedRingVertices(current.objects);
  const state: State = {
    id: current.id, objects: current.objects, layers: current.layers ?? [], dimensions: current.dimensions ?? [],
    ids: new Set([...current.objects.map((o) => o.id), ...(current.dimensions ?? []).map((d) => d.id)]),
  };
  const batch = array(commands, "commands");
  if (batch.length === 0) fail("commands", "au moins une commande attendue");
  for (let i = 0; i < batch.length; i++) {
    const path = `commands[${i}]`;
    const c = record(batch[i], ["toolId", "params"], path);
    const toolId = c.toolId;
    if (typeof toolId !== "string" || !Object.hasOwn(HANDLERS, toolId)) fail(`${path}.toolId`, "outil de mutation non pris en charge");
    HANDLERS[toolId as StudioCommandToolId](state, c.params, path);
  }
  // Contrôle final : limites, unicité et liens sur le document entier, avant de rendre la copie.
  const result = validateStudioDocument(output(state.id, state.objects, state.layers, state.dimensions));
  // Budget d'écriture des extrusions de polylignes fermées : un lot ne peut pas le dépasser ni l'aggraver une fois
  // dépassé ; une révision enregistrée reste toujours lisible (le budget ne s'applique qu'aux écritures).
  const apres = studioExtrudedRingVertices(result.objects);
  if (apres > STUDIO_LIMITS.extrudedRingsTotal && apres > avant) {
    fail("studioDocument.objects", `${STUDIO_LIMITS.extrudedRingsTotal} sommets discrétisés au plus pour l’ensemble des polylignes fermées extrudées du document`);
  }
  return result;
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
