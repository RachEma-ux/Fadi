import type { DxfWriter } from "../exporteurs/dxf.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import { STUDIO_FIXED_ANCHORS, STUDIO_INDEXED_ANCHOR, type StudioAnchor } from "../noyau/ancres.js";
import { boolean, discriminator, fail, finite, identifier, layerRef, point, record, same } from "../noyau/validation.js";
import type { StudioPoint, StudioShape } from "../noyau/types.js";
import { id, layerId, number, point as pointSchema } from "../registre/schemas-base.js";
import { studioAnchorPoint } from "./index.js";

/**
 * Cote linéaire alignée (`dimension`) : rangée à part des formes (`StudioDocument.dimensions`), liée ou non aux sommets
 * des objets. Validation, contrôle des liens, schéma, et écrivains SVG / DXF (valeur mesurée formatée, « à résoudre »).
 */

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

// ——— Schéma ———

const anchor = { anyOf: [{ enum: [...STUDIO_FIXED_ANCHORS] }, { type: "string", pattern: STUDIO_INDEXED_ANCHOR.source }] } as const;
const link = { oneOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["objectId", "anchor"], properties: { objectId: id, anchor } }] } as const;
export const SCHEMA_COTE = {
  type: "object", additionalProperties: false,
  required: ["id", "type", "start", "end", "offset", "links", "toResolve"],
  properties: {
    id, type: { const: "dimension" }, layerId, start: pointSchema, end: pointSchema, offset: number,
    links: { type: "object", additionalProperties: false, required: ["start", "end"], properties: { start: link, end: link } },
    toResolve: { type: "boolean" },
  },
} as const;
/** Une cote saisie (création ou modification) n'est jamais « à résoudre ». */
export const SCHEMA_COTE_SAISIE = { ...SCHEMA_COTE, properties: { ...SCHEMA_COTE.properties, toResolve: { const: false } } } as const;

// ——— Validation ———

function validerLien(value: unknown, path: string): StudioDimensionLink | null {
  if (value === null) return null;
  const l = record(value, ["objectId", "anchor"], path);
  const anchor = l.anchor;
  if (typeof anchor !== "string" || (!(STUDIO_FIXED_ANCHORS as readonly string[]).includes(anchor) && !STUDIO_INDEXED_ANCHOR.test(anchor))) fail(`${path}.anchor`, "sommet inconnu");
  return { objectId: identifier(l.objectId, `${path}.objectId`), anchor: anchor as StudioAnchor };
}

export function validerCote(value: unknown, path: string): StudioDimension {
  if (discriminator(value, path) !== "dimension") fail(`${path}.type`, "cote attendue");
  const o = record(value, ["id", "type", "start", "end", "offset", "links", "toResolve"], path, ["layerId"]);
  const start = point(o.start, `${path}.start`);
  const end = point(o.end, `${path}.end`);
  if (same(start, end)) fail(path, "la cote doit avoir deux points distincts");
  const offset = finite(o.offset, `${path}.offset`);
  const l = record(o.links, ["start", "end"], `${path}.links`);
  const links = { start: validerLien(l.start, `${path}.links.start`), end: validerLien(l.end, `${path}.links.end`) };
  const toResolve = boolean(o.toResolve, `${path}.toResolve`);
  // « À résoudre » ne naît que d'un lien rompu (mis à null) : une cote entièrement liée ne peut pas l'être.
  if (toResolve && links.start && links.end) fail(`${path}.toResolve`, "une cote à résoudre a au moins un lien rompu");
  return { id: identifier(o.id, `${path}.id`), type: "dimension", ...layerRef(o, path), start, end, offset, links, toResolve };
}

/** Chaque extrémité liée existe et coïncide exactement avec le sommet de l'objet lié. */
export function controlerLiens(d: StudioDimension, shapes: ReadonlyMap<string, StudioShape>, path: string): void {
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

// ——— Exports de fichier ———

/** Mention des cotes dont un lien est rompu : leur valeur n'est pas évaluée. */
export const STUDIO_EXPORT_TO_RESOLVE = "à résoudre" as const;

/** Longueur formatée (mètres, 2 à 3 décimales, sans séparateur de milliers pour rester lisible dans tout lecteur). */
export function formatStudioLength(value: number, locale = "fr-FR"): string {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: false }).format(value)} m`;
}

/** Géométrie dérivée d'une cote pour l'export (ligne de cote décalée, attaches, position et angle du texte). */
export interface DessinCote {
  dimension: StudioDimension;
  value: number | null;
  label: string;
  a: StudioPoint;
  b: StudioPoint;
  extensions: [StudioPoint, StudioPoint][];
  text: StudioPoint;
  /** Angle du texte en degrés, sens trigonométrique, ramené dans ]-90 ; 90] pour rester lisible. */
  angle: number;
}

export function dessinerCote(d: StudioDimension, locale: string, textHeight: number): DessinCote {
  const dx = d.end.x - d.start.x, dy = d.end.y - d.start.y;
  // Même formule que `measureStudioDimension` (contrôlé par test), sans revalider le document à chaque cote.
  const length = Math.hypot(dx, dy);
  const value = d.toResolve ? null : length;
  const n = { x: -dy / length, y: dx / length };
  const a = { x: d.start.x + n.x * d.offset, y: d.start.y + n.y * d.offset };
  const b = { x: d.end.x + n.x * d.offset, y: d.end.y + n.y * d.offset };
  const extensions: [StudioPoint, StudioPoint][] = d.offset === 0 ? [] : [[{ ...d.start }, a], [{ ...d.end }, b]];
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let side = 1;
  if (angle > 90 || angle <= -90) {
    angle += angle > 90 ? -180 : 180;
    side = -1;
  }
  const lift = textHeight * 0.3 * side;
  const text = { x: (a.x + b.x) / 2 + n.x * lift, y: (a.y + b.y) / 2 + n.y * lift };
  const label = value === null ? STUDIO_EXPORT_TO_RESOLVE : formatStudioLength(value, locale);
  return { dimension: d, value, label, a, b, extensions, text, angle };
}

/** `<g data-dimension>` : ligne, lignes d'attache, texte de la valeur mesurée (ou « à résoudre », `data-status`). */
export function coteSvg(g: DessinCote, textHeight: number): string[] {
  const lines: string[] = [];
  const status = g.value === null ? "to-resolve" : "resolved";
  lines.push(`<g data-dimension="${xml(g.dimension.id)}" data-status="${status}"${g.value === null ? "" : ` data-value="${nb(g.value)}"`}>`);
  lines.push(`<line x1="${nb(g.a.x)}" y1="${svgY(g.a.y)}" x2="${nb(g.b.x)}" y2="${svgY(g.b.y)}" vector-effect="non-scaling-stroke"/>`);
  for (const [p, q] of g.extensions) lines.push(`<line x1="${nb(p.x)}" y1="${svgY(p.y)}" x2="${nb(q.x)}" y2="${svgY(q.y)}" vector-effect="non-scaling-stroke"/>`);
  const rotate = g.angle === 0 ? "" : ` transform="rotate(${nb(-g.angle)} ${nb(g.text.x)} ${svgY(g.text.y)})"`;
  lines.push(`<text x="${nb(g.text.x)}" y="${svgY(g.text.y)}" font-size="${nb(textHeight)}" font-family="sans-serif" text-anchor="middle" fill="#000" stroke="none"${rotate}>${xml(g.label)}</text>`);
  lines.push("</g>");
  return lines;
}

/** LINE (cote et attaches) + TEXT de la valeur mesurée ou « à résoudre ». */
export function coteDxf(g: DessinCote, layer: string, textHeight: number, w: DxfWriter): void {
  w.line(layer, g.a, g.b);
  for (const [p, q] of g.extensions) w.line(layer, p, q);
  w.text(layer, g.text, textHeight, g.label, g.angle);
}
