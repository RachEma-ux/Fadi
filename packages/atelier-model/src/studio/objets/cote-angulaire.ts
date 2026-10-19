import { studioAngleNormal, studioArcPoints, studioPolylineSegmentCount, studioPolylineSegments, studioSvgPath } from "../courbes.js";
import type { DxfWriter } from "../exporteurs/dxf.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import { boolean, discriminator, fail, finite, identifier, layerRef, point, record, same } from "../noyau/validation.js";
import type { StudioPoint, StudioShape } from "../noyau/types.js";
import { id, layerId, point as pointSchema } from "../registre/schemas-base.js";
import type { StudioArc } from "./arc.js";
import { STUDIO_EXPORT_TO_RESOLVE } from "./cote.js";

/**
 * Cote angulaire (`angular-dimension`) : annotation rangée dans `StudioDocument.annotations`. Deux rayons issus d'un
 * sommet (`vertex` → `first`, `vertex` → `second`) ; l'angle mesuré va du premier au second dans le sens trigonométrique,
 * dans ]0° ; 360°[. Il est dérivé (`studioAngularValue`), jamais stocké. `radius` place l'arc de cote et son libellé.
 *
 * Cote liée : chaque rayon suit un segment droit d'une ligne (segment 0) ou d'une polyligne (segment i, sans renflement) ;
 * le sommet est l'intersection des deux droites, chaque point de rayon l'extrémité du segment la plus éloignée du sommet
 * (`studioAngularFromSegments`). Les points recopiés sont contrôlés à l'égalité exacte. Quand un objet lié disparaît, son
 * lien devient `null` et la cote passe « à résoudre » : elle garde sa dernière géométrie, n'est ni supprimée ni
 * rattachée ailleurs, et sa valeur n'est plus évaluée.
 */

/** Rayon lié au segment `segment` de l'objet `objectId`. */
export interface StudioAngularLink {
  objectId: string;
  segment: number;
}
export interface StudioAngularDimension {
  id: string;
  type: "angular-dimension";
  layerId?: string;
  vertex: StudioPoint;
  first: StudioPoint;
  second: StudioPoint;
  radius: number;
  links: { first: StudioAngularLink | null; second: StudioAngularLink | null };
  toResolve: boolean;
}

/** Borne technique du rayon d'arc et de l'index de segment (pas des valeurs métier). */
const RAYON_MAX = 1e6;
const SEGMENT_MAX = 99_999;

// ——— Schéma ———

const lien = { oneOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["objectId", "segment"], properties: { objectId: id, segment: { type: "integer", minimum: 0, maximum: SEGMENT_MAX } } }] } as const;
export const SCHEMA_COTE_ANGULAIRE = {
  type: "object", additionalProperties: false,
  required: ["id", "type", "vertex", "first", "second", "radius", "links", "toResolve"],
  properties: {
    id, type: { const: "angular-dimension" }, layerId, vertex: pointSchema, first: pointSchema, second: pointSchema,
    radius: { type: "number", exclusiveMinimum: 0, maximum: RAYON_MAX },
    links: { type: "object", additionalProperties: false, required: ["first", "second"], properties: { first: lien, second: lien } },
    toResolve: { type: "boolean" },
  },
} as const;
/** Une cote angulaire saisie (création ou modification) n'est jamais « à résoudre ». */
export const SCHEMA_COTE_ANGULAIRE_SAISIE = { ...SCHEMA_COTE_ANGULAIRE, properties: { ...SCHEMA_COTE_ANGULAIRE.properties, toResolve: { const: false } } } as const;

// ——— Géométrie (pure) ———

/** Angle orienté du rayon `first` au rayon `second`, en radians dans [0 ; 2π[ (0 : rayons confondus). */
function balayage(v: StudioPoint, a: StudioPoint, b: StudioPoint): number {
  const ux = a.x - v.x, uy = a.y - v.y, wx = b.x - v.x, wy = b.y - v.y;
  return studioAngleNormal(Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy));
}

/** Segment droit `index` d'une forme (ligne : 0 ; polyligne : segment sans renflement), sinon null. */
export function studioStraightSegment(o: StudioShape, index: number): { a: StudioPoint; b: StudioPoint } | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (o.type === "line") return index === 0 ? { a: { ...o.start }, b: { ...o.end } } : null;
  if (o.type !== "polyline" || index >= studioPolylineSegmentCount(o)) return null;
  const s = studioPolylineSegments(o)[index]!;
  return s.bulge === 0 ? { a: { ...s.a }, b: { ...s.b } } : null;
}

/**
 * Sommet et points de rayon d'une cote angulaire liée à deux segments : intersection des deux droites, extrémité la plus
 * éloignée du sommet sur chaque segment (la seconde à égalité). Null si les segments sont parallèles ou si l'angle est nul.
 */
export function studioAngularFromSegments(s1: { a: StudioPoint; b: StudioPoint }, s2: { a: StudioPoint; b: StudioPoint }): { vertex: StudioPoint; first: StudioPoint; second: StudioPoint } | null {
  const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y }, d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y };
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (cross === 0) return null;
  const t = ((s2.a.x - s1.a.x) * d2.y - (s2.a.y - s1.a.y) * d2.x) / cross;
  const vertex = { x: s1.a.x + t * d1.x, y: s1.a.y + t * d1.y };
  if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) return null;
  const loin = (s: { a: StudioPoint; b: StudioPoint }) => (Math.hypot(s.a.x - vertex.x, s.a.y - vertex.y) > Math.hypot(s.b.x - vertex.x, s.b.y - vertex.y) ? { ...s.a } : { ...s.b });
  const first = loin(s1), second = loin(s2);
  if (same(first, vertex) || same(second, vertex) || balayage(vertex, first, second) === 0) return null;
  return { vertex, first, second };
}

/** Valeur mesurée en degrés, dans ]0 ; 360[ ; null (« non évaluée ») tant que la cote est à résoudre. */
export const studioAngularValue = (d: Pick<StudioAngularDimension, "vertex" | "first" | "second" | "toResolve">): number | null =>
  d.toResolve ? null : (balayage(d.vertex, d.first, d.second) * 180) / Math.PI;

/** Angle formaté (degrés, deux décimales, sans séparateur de milliers) : « 90,00° » en français. */
export function formatStudioAngle(value: number, locale = "fr-FR"): string {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(value)}°`;
}

// ——— Validation ———

function validerLien(value: unknown, path: string): StudioAngularLink | null {
  if (value === null) return null;
  const l = record(value, ["objectId", "segment"], path);
  const segment = l.segment;
  if (typeof segment !== "number" || !Number.isInteger(segment) || segment < 0 || segment > SEGMENT_MAX) fail(`${path}.segment`, "index de segment entier positif attendu");
  return { objectId: identifier(l.objectId, `${path}.objectId`), segment: Object.is(segment, -0) ? 0 : segment };
}

export function validerCoteAngulaire(value: unknown, path: string): StudioAngularDimension {
  if (discriminator(value, path) !== "angular-dimension") fail(`${path}.type`, "cote angulaire attendue");
  const o = record(value, ["id", "type", "vertex", "first", "second", "radius", "links", "toResolve"], path, ["layerId"]);
  const vertex = point(o.vertex, `${path}.vertex`);
  const first = point(o.first, `${path}.first`);
  const second = point(o.second, `${path}.second`);
  if (same(vertex, first) || same(vertex, second)) fail(path, "chaque rayon doit partir du sommet vers un point distinct");
  if (balayage(vertex, first, second) === 0) fail(path, "les deux rayons sont confondus : angle nul");
  const radius = finite(o.radius, `${path}.radius`);
  if (radius <= 0) fail(`${path}.radius`, "rayon strictement positif attendu");
  if (radius > RAYON_MAX) fail(`${path}.radius`, "rayon de 1 000 000 m au plus");
  const l = record(o.links, ["first", "second"], `${path}.links`);
  const links = { first: validerLien(l.first, `${path}.links.first`), second: validerLien(l.second, `${path}.links.second`) };
  const toResolve = boolean(o.toResolve, `${path}.toResolve`);
  if (toResolve && links.first && links.second) fail(`${path}.toResolve`, "une cote à résoudre a au moins un lien rompu");
  if (!toResolve && !links.first !== !links.second) fail(`${path}.links`, "une cote angulaire liée l’est à deux segments");
  return { id: identifier(o.id, `${path}.id`), type: "angular-dimension", ...layerRef(o, path), vertex, first, second, radius, links, toResolve };
}

/**
 * Liens d'une cote angulaire : chaque objet lié existe ; une cote non « à résoudre » et liée coïncide exactement avec la
 * géométrie dérivée de ses deux segments (droits, non parallèles). Une cote à résoudre garde sa géométrie figée.
 */
export function controlerLiensAngulaires(d: StudioAngularDimension, shapes: ReadonlyMap<string, StudioShape>, path: string): void {
  const segments: { a: StudioPoint; b: StudioPoint }[] = [];
  for (const end of ["first", "second"] as const) {
    const l = d.links[end];
    if (!l) continue;
    const target = shapes.get(l.objectId);
    if (!target) fail(`${path}.links.${end}`, "objet lié introuvable");
    if (d.toResolve) continue;
    const s = studioStraightSegment(target, l.segment);
    if (!s) fail(`${path}.links.${end}.segment`, "segment droit introuvable sur l’objet lié");
    segments.push(s);
  }
  if (segments.length !== 2) return;
  const g = studioAngularFromSegments(segments[0]!, segments[1]!);
  if (!g) fail(`${path}.links`, "segments liés parallèles : angle indéterminé");
  if (!same(g.vertex, d.vertex) || !same(g.first, d.first) || !same(g.second, d.second)) fail(path, "géométrie différente des segments liés");
}

export const translaterCoteAngulaire = (d: StudioAngularDimension, t: (p: StudioPoint) => StudioPoint): StudioAngularDimension =>
  ({ ...d, vertex: t(d.vertex), first: t(d.first), second: t(d.second) });

// ——— Dessin dérivé (planche, exports, feuille) ———

/** Géométrie dérivée d'une cote angulaire : arc de cote, attaches, position et angle du libellé. */
export interface DessinCoteAngulaire {
  dimension: StudioAngularDimension;
  /** Degrés ; null tant que la cote est à résoudre. */
  value: number | null;
  label: string;
  /** Arc de cote (centre = sommet, sens trigonométrique, du premier rayon au second). */
  arc: StudioArc;
  sweep: number;
  /** Extrémités de l'arc sur chaque rayon. */
  ends: [StudioPoint, StudioPoint];
  /** Attaches : du point de rayon à l'extrémité de l'arc quand l'arc passe au-delà du point. */
  extensions: [StudioPoint, StudioPoint][];
  text: StudioPoint;
  /** Angle du libellé en degrés (tangent à l'arc), ramené dans ]-90 ; 90] pour rester lisible. */
  angle: number;
}

export function dessinerCoteAngulaire(d: StudioAngularDimension, locale: string, textHeight: number): DessinCoteAngulaire {
  const start = studioAngleNormal(Math.atan2(d.first.y - d.vertex.y, d.first.x - d.vertex.x));
  const sweep = balayage(d.vertex, d.first, d.second);
  const end = studioAngleNormal(start + sweep);
  const at = (a: number, r: number): StudioPoint => ({ x: d.vertex.x + r * Math.cos(a), y: d.vertex.y + r * Math.sin(a) });
  const ends: [StudioPoint, StudioPoint] = [at(start, d.radius), at(start + sweep, d.radius)];
  const extensions: [StudioPoint, StudioPoint][] = [];
  for (const [p, e] of [[d.first, ends[0]], [d.second, ends[1]]] as const) {
    if (Math.hypot(p.x - d.vertex.x, p.y - d.vertex.y) < d.radius) extensions.push([{ ...p }, e]);
  }
  const mid = start + sweep / 2;
  const text = at(mid, d.radius + textHeight * 0.8);
  let angle = ((mid * 180) / Math.PI) - 90;
  angle = ((angle % 360) + 360) % 360;
  if (angle > 180) angle -= 360;
  if (angle > 90) angle -= 180;
  else if (angle <= -90) angle += 180;
  const value = d.toResolve ? null : (sweep * 180) / Math.PI;
  const label = value === null ? STUDIO_EXPORT_TO_RESOLVE : formatStudioAngle(value, locale);
  return { dimension: d, value, label, arc: { id: d.id, type: "arc", center: { ...d.vertex }, radius: d.radius, startAngle: start, endAngle: end }, sweep, ends, extensions, text, angle };
}

/** Points de l'arc discrétisé (feuille, bornes). */
export const coteAngulairePoints = (g: DessinCoteAngulaire): StudioPoint[] => studioArcPoints(g.arc.center, g.arc.radius, g.arc.startAngle, g.sweep);

/** `<g data-angular-dimension>` : arc, attaches, libellé (valeur en degrés ou « à résoudre », `data-status`). */
export function coteAngulaireSvg(g: DessinCoteAngulaire, textHeight: number): string[] {
  const status = g.value === null ? "to-resolve" : "resolved";
  const lines = [`<g data-angular-dimension="${xml(g.dimension.id)}" data-status="${status}"${g.value === null ? "" : ` data-value="${nb(g.value)}"`}>`];
  lines.push(`<path d="${studioSvgPath(g.arc, true, nb)}" vector-effect="non-scaling-stroke"/>`);
  for (const [p, q] of g.extensions) lines.push(`<line x1="${nb(p.x)}" y1="${svgY(p.y)}" x2="${nb(q.x)}" y2="${svgY(q.y)}" vector-effect="non-scaling-stroke"/>`);
  const rotate = g.angle === 0 ? "" : ` transform="rotate(${nb(-g.angle)} ${nb(g.text.x)} ${svgY(g.text.y)})"`;
  lines.push(`<text x="${nb(g.text.x)}" y="${svgY(g.text.y)}" font-size="${nb(textHeight)}" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="none"${rotate}>${xml(g.label)}</text>`);
  lines.push("</g>");
  return lines;
}

/** ARC (arc de cote) + LINE (attaches) + TEXT (valeur en degrés ou « à résoudre »). */
export function coteAngulaireDxf(g: DessinCoteAngulaire, layer: string, textHeight: number, w: DxfWriter): void {
  w.arc(layer, g.arc.center, g.arc.radius, g.arc.startAngle, g.arc.endAngle);
  for (const [p, q] of g.extensions) w.line(layer, p, q);
  w.text(layer, g.text, textHeight, g.label, g.angle);
}
