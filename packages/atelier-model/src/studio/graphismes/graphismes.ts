import type { DxfWriter } from "../exporteurs/dxf.js";
import { nb, svgY, xml } from "../exporteurs/texte.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import type { StudioPoint } from "../noyau/types.js";
import { array, fail, finite, identifier, layerRef, point, record } from "../noyau/validation.js";
import { id, layerId, point as pointSchema, positive } from "../registre/schemas-base.js";
import { studioAppliquerTransformation, studioTransformationPose } from "../reperes.js";

/**
 * Graphismes du dessin 2D de Studio (EX-055, TR-EX-055) : **splines**, **hachures**, **symboles** et leur
 * **transparence**, rangés dans l'extension additive et facultative `StudioDocument.graphismes` (un lecteur antérieur
 * ne les interprète jamais à tort ; absente ou vide : aucun graphisme, forme canonique). Repère `local-2d`, mètres.
 *
 * - **Spline** : courbe de Bézier cubique par morceaux, donnée par ses points explicites `p0, c1, c2, p1, c1, c2, p2…`
 *   (3n + 1 points, n ≥ 1) : la forme que SVG (`C`) et Canvas (`bezierCurveTo`) tracent exactement ; rien n'est
 *   interpolé ni deviné. Les échanges sans courbe de Bézier (DXF R12, moteur GPU) la découpent en
 *   `STUDIO_SEGMENTS_PAR_BEZIER` segments par morceau (découpe déclarée).
 * - **Hachure** : contour polygonal fermé (3 sommets au moins, aire non nulle) rempli de traits parallèles d'angle et
 *   d'espacement **saisis** (aucun motif normalisé n'est fourni) ; les traits sont dérivés (`studioTraitsHachure`) :
 *   droites `n·p = k × espacement` (k entier, ancrées sur l'origine du document : le motif ne glisse pas quand le
 *   contour change), coupées par le contour selon la règle pair-impair. Un espacement qui produirait plus de
 *   `STUDIO_LIMITES_GRAPHISMES.traitsHachure` droites est refusé (borne technique).
 * - **Symbole** : un symbole d'une bibliothèque fermée (`STUDIO_SYMBOLES` : nord, croix de repère, repère de niveau),
 *   défini dans son repère `local-objet` (unité 1 m) et posé par une position, une rotation et une échelle :
 *   transformation `local-objet → local-2d` explicite et vérifiée (`reperes.ts`). Ce sont des signes graphiques, pas
 *   des données réglementaires.
 * - **Transparence** : `opacite` dans ]0 ; 1[ ; absente, le graphisme est opaque (1 n'est pas stocké : forme canonique).
 *
 * Rendu : chaque graphisme se réduit en primitives (`studioPrimitivesGraphisme` : chemin de Bézier, segment, cercle,
 * polygone), écrites en SVG (`graphismeSvg`) et lues par l'interface et par la comparaison des moteurs
 * (`planche2d/rendus/comparaison-moteurs.ts`) ; DXF R12 (`graphismeDxf`) : polylignes et lignes, la transparence non
 * représentable y est **déclarée** par un commentaire 999. Les graphismes ne s'extrudent pas, ne se métrent pas et ne
 * vont pas à l'IFC (dessin 2D seulement). Pur : ni React, ni DOM.
 */

export const STUDIO_SYMBOLES = Object.freeze(["nord", "croix", "niveau"] as const);
export type StudioNomSymbole = (typeof STUDIO_SYMBOLES)[number];

/** Bornes techniques (pas des valeurs métier). */
export const STUDIO_LIMITES_GRAPHISMES = Object.freeze({ graphismes: STUDIO_LIMITS.objects, pointsSpline: 3 * 1000 + 1, sommetsContour: STUDIO_LIMITS.polylinePoints, traitsHachure: 5000 } as const);
/** Découpe d'un morceau de Bézier pour les échanges sans courbe (DXF R12, GPU) : choix d'écriture déclaré. */
export const STUDIO_SEGMENTS_PAR_BEZIER = 16;

interface BaseGraphisme { id: string; layerId?: string; /** ]0 ; 1[ ; absente : opaque. */ opacite?: number }
export interface StudioSpline extends BaseGraphisme { type: "spline"; points: StudioPoint[] }
export interface StudioHachure extends BaseGraphisme { type: "hachure"; contour: StudioPoint[]; /** Radians, dans [0 ; π[. */ angle: number; /** Mètres, > 0. */ espacement: number }
export interface StudioSymbole extends BaseGraphisme { type: "symbole"; symbole: StudioNomSymbole; position: StudioPoint; /** Radians. */ rotation: number; /** > 0, sans unité. */ echelle: number }
export type StudioGraphisme = StudioSpline | StudioHachure | StudioSymbole;
export const STUDIO_TYPES_GRAPHISMES = Object.freeze(["spline", "hachure", "symbole"] as const);

/** Primitive de rendu d'un graphisme, dans le repère `local-2d` (m). */
export type StudioPrimitiveGraphisme =
  | { genre: "bezier"; depart: StudioPoint; morceaux: [StudioPoint, StudioPoint, StudioPoint][] }
  | { genre: "segment"; a: StudioPoint; b: StudioPoint }
  | { genre: "cercle"; centre: StudioPoint; rayon: number }
  | { genre: "polygone"; points: StudioPoint[] };

/** Bibliothèque des symboles, repère `local-objet`, unité 1 m (signes graphiques). */
const SYMBOLES: Readonly<Record<StudioNomSymbole, readonly StudioPrimitiveGraphisme[]>> = Object.freeze({
  // Flèche du nord : cercle et pointe vers +y.
  nord: [{ genre: "cercle", centre: { x: 0, y: 0 }, rayon: 0.5 }, { genre: "polygone", points: [{ x: 0, y: 0.5 }, { x: 0.15, y: -0.3 }, { x: 0, y: -0.15 }, { x: -0.15, y: -0.3 }] }],
  // Croix de repère : deux traits perpendiculaires et un cercle.
  croix: [{ genre: "segment", a: { x: -0.5, y: 0 }, b: { x: 0.5, y: 0 } }, { genre: "segment", a: { x: 0, y: -0.5 }, b: { x: 0, y: 0.5 } }, { genre: "cercle", centre: { x: 0, y: 0 }, rayon: 0.25 }],
  // Repère de niveau : triangle pointe en bas sur un trait.
  niveau: [{ genre: "polygone", points: [{ x: 0, y: 0 }, { x: 0.3, y: 0.5 }, { x: -0.3, y: 0.5 }] }, { genre: "segment", a: { x: -0.5, y: 0 }, b: { x: 0.5, y: 0 } }],
});
export const studioDefinitionSymbole = (nom: StudioNomSymbole): readonly StudioPrimitiveGraphisme[] => SYMBOLES[nom];

// ——— Validation ———

function opaciteRef(o: Record<string, unknown>, path: string): { opacite?: number } {
  if (!Object.hasOwn(o, "opacite")) return {};
  const v = finite(o.opacite, `${path}.opacite`);
  if (!(v > 0) || v > 1) fail(`${path}.opacite`, "opacité dans ]0 ; 1] attendue (absente : opaque)");
  return v === 1 ? {} : { opacite: v };
}

/** Aire signée d'un contour (formule du lacet). */
export function studioAireContour(c: readonly StudioPoint[]): number {
  let s = 0;
  for (let i = 0; i < c.length; i++) { const a = c[i]!, b = c[(i + 1) % c.length]!; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

/** Nombre de droites de hachure qu'un contour, un angle et un espacement produiraient. */
export function studioNombreDroitesHachure(contour: readonly StudioPoint[], angle: number, espacement: number): number {
  const nx = -Math.sin(angle), ny = Math.cos(angle);
  let smin = Infinity, smax = -Infinity;
  for (const p of contour) { const s = p.x * nx + p.y * ny; if (s < smin) smin = s; if (s > smax) smax = s; }
  const k0 = Math.ceil(smin / espacement), k1 = Math.floor(smax / espacement);
  return Math.max(0, k1 - k0 + 1);
}

export function validerGraphisme(value: unknown, path: string): StudioGraphisme {
  const brut = record(value, ["type"], path, ["id", "layerId", "opacite", "points", "contour", "angle", "espacement", "symbole", "position", "rotation", "echelle"]);
  const type = brut.type;
  if (type === "spline") {
    const o = record(value, ["id", "type", "points"], path, ["layerId", "opacite"]);
    const pts = array(o.points, `${path}.points`);
    if (pts.length < 4 || (pts.length - 1) % 3 !== 0 || pts.length > STUDIO_LIMITES_GRAPHISMES.pointsSpline) fail(`${path}.points`, `3n + 1 points attendus (4, 7, 10…), ${STUDIO_LIMITES_GRAPHISMES.pointsSpline} au plus`);
    const points = pts.map((p, i) => point(p, `${path}.points[${i}]`));
    for (let i = 0; i + 3 < points.length; i += 3) {
      const [a, , , b] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
      if (a.x === b.x && a.y === b.y && points.slice(i, i + 4).every((q) => q.x === a.x && q.y === a.y)) fail(`${path}.points`, `morceau ${i / 3 + 1} réduit à un point`);
    }
    return { id: identifier(o.id, `${path}.id`), type: "spline", ...layerRef(o, path), ...opaciteRef(o, path), points };
  }
  if (type === "hachure") {
    const o = record(value, ["id", "type", "contour", "angle", "espacement"], path, ["layerId", "opacite"]);
    const pts = array(o.contour, `${path}.contour`);
    if (pts.length < 3 || pts.length > STUDIO_LIMITES_GRAPHISMES.sommetsContour) fail(`${path}.contour`, `de 3 à ${STUDIO_LIMITES_GRAPHISMES.sommetsContour} sommets`);
    const contour = pts.map((p, i) => point(p, `${path}.contour[${i}]`));
    if (Math.abs(studioAireContour(contour)) <= 0) fail(`${path}.contour`, "contour d’aire nulle");
    const angle = finite(o.angle, `${path}.angle`);
    if (angle < 0 || angle >= Math.PI) fail(`${path}.angle`, "angle dans [0 ; π[ attendu (radians)");
    const espacement = finite(o.espacement, `${path}.espacement`);
    if (!(espacement > 0)) fail(`${path}.espacement`, "espacement strictement positif attendu (m)");
    if (studioNombreDroitesHachure(contour, angle, espacement) > STUDIO_LIMITES_GRAPHISMES.traitsHachure) fail(`${path}.espacement`, `espacement trop fin pour ce contour (plus de ${STUDIO_LIMITES_GRAPHISMES.traitsHachure} traits)`);
    return { id: identifier(o.id, `${path}.id`), type: "hachure", ...layerRef(o, path), ...opaciteRef(o, path), contour, angle, espacement };
  }
  if (type === "symbole") {
    const o = record(value, ["id", "type", "symbole", "position", "rotation", "echelle"], path, ["layerId", "opacite"]);
    if (!(STUDIO_SYMBOLES as readonly unknown[]).includes(o.symbole)) fail(`${path}.symbole`, "symbole inconnu (nord, croix ou niveau)");
    const rotation = finite(o.rotation, `${path}.rotation`);
    if (Math.abs(rotation) > 2 * Math.PI) fail(`${path}.rotation`, "rotation dans [−2π ; 2π] attendue (radians)");
    const echelle = finite(o.echelle, `${path}.echelle`);
    if (!(echelle > 0)) fail(`${path}.echelle`, "échelle strictement positive attendue");
    return { id: identifier(o.id, `${path}.id`), type: "symbole", ...layerRef(o, path), ...opaciteRef(o, path), symbole: o.symbole as StudioNomSymbole, position: point(o.position, `${path}.position`), rotation, echelle };
  }
  return fail(`${path}.type`, "type de graphisme inconnu (spline, hachure ou symbole)");
}

// ——— Géométrie ———

/** Point d'un morceau de Bézier cubique au paramètre t. */
export function studioPointBezier(p0: StudioPoint, c1: StudioPoint, c2: StudioPoint, p1: StudioPoint, t: number): StudioPoint {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

/** Points de la spline découpée (`segments` par morceau, extrémités exactes). */
export function studioPointsSpline(s: Pick<StudioSpline, "points">, segments = STUDIO_SEGMENTS_PAR_BEZIER): StudioPoint[] {
  const out: StudioPoint[] = [s.points[0]!];
  for (let i = 0; i + 3 < s.points.length; i += 3) {
    const [p0, c1, c2, p1] = [s.points[i]!, s.points[i + 1]!, s.points[i + 2]!, s.points[i + 3]!];
    for (let k = 1; k < segments; k++) out.push(studioPointBezier(p0, c1, c2, p1, k / segments));
    out.push(p1);
  }
  return out;
}

/** Traits dérivés d'une hachure (segments coupés par le contour, règle pair-impair), dans un ordre déterministe. */
export function studioTraitsHachure(h: Pick<StudioHachure, "contour" | "angle" | "espacement">): [StudioPoint, StudioPoint][] {
  const dx = Math.cos(h.angle), dy = Math.sin(h.angle), nx = -dy, ny = dx;
  const s = h.contour.map((p) => p.x * nx + p.y * ny), u = h.contour.map((p) => p.x * dx + p.y * dy);
  let smin = Infinity, smax = -Infinity;
  for (const v of s) { if (v < smin) smin = v; if (v > smax) smax = v; }
  const out: [StudioPoint, StudioPoint][] = [];
  const n = h.contour.length;
  for (let k = Math.ceil(smin / h.espacement); k <= Math.floor(smax / h.espacement); k++) {
    const c = k * h.espacement;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, si = s[i]!, sj = s[j]!;
      // Demi-ouvert : un sommet posé sur la droite n'est compté qu'une fois.
      if ((si <= c && c < sj) || (sj <= c && c < si)) xs.push(u[i]! + ((c - si) / (sj - si)) * (u[j]! - u[i]!));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1]! - xs[i]! <= 0) continue;
      const pa = { x: c * nx + xs[i]! * dx, y: c * ny + xs[i]! * dy }, pb = { x: c * nx + xs[i + 1]! * dx, y: c * ny + xs[i + 1]! * dy };
      out.push([pa, pb]);
    }
  }
  return out;
}

/** Primitives d'un symbole dans le document : sa définition `local-objet` transformée par sa pose (vérifiée). */
export function studioPrimitivesSymbole(s: Pick<StudioSymbole, "symbole" | "position" | "rotation" | "echelle">): StudioPrimitiveGraphisme[] {
  const t = studioTransformationPose(s.position, s.rotation, s.echelle);
  const P = (p: StudioPoint) => studioAppliquerTransformation(t, p);
  return SYMBOLES[s.symbole].map((g): StudioPrimitiveGraphisme => {
    switch (g.genre) {
      case "segment": return { genre: "segment", a: P(g.a), b: P(g.b) };
      case "cercle": return { genre: "cercle", centre: P(g.centre), rayon: g.rayon * s.echelle };
      case "polygone": return { genre: "polygone", points: g.points.map(P) };
      case "bezier": return { genre: "bezier", depart: P(g.depart), morceaux: g.morceaux.map((m) => [P(m[0]), P(m[1]), P(m[2])]) };
    }
  });
}

/** Primitives de rendu d'un graphisme (repère `local-2d`). */
export function studioPrimitivesGraphisme(g: StudioGraphisme): StudioPrimitiveGraphisme[] {
  if (g.type === "spline") {
    const morceaux: [StudioPoint, StudioPoint, StudioPoint][] = [];
    for (let i = 1; i + 2 < g.points.length; i += 3) morceaux.push([g.points[i]!, g.points[i + 1]!, g.points[i + 2]!]);
    return [{ genre: "bezier", depart: g.points[0]!, morceaux }];
  }
  if (g.type === "hachure") return [{ genre: "polygone", points: g.contour }, ...studioTraitsHachure(g).map(([a, b]): StudioPrimitiveGraphisme => ({ genre: "segment", a, b }))];
  return studioPrimitivesSymbole(g);
}

/** Points d'encombrement d'un graphisme (bornes de l'export, emprise de sélection). */
export function studioPointsGraphisme(g: StudioGraphisme): StudioPoint[] {
  const out: StudioPoint[] = [];
  for (const p of studioPrimitivesGraphisme(g)) {
    if (p.genre === "segment") out.push(p.a, p.b);
    else if (p.genre === "polygone") out.push(...p.points);
    else if (p.genre === "cercle") out.push({ x: p.centre.x - p.rayon, y: p.centre.y - p.rayon }, { x: p.centre.x + p.rayon, y: p.centre.y + p.rayon });
    else out.push(p.depart, ...p.morceaux.flat()); // l'enveloppe convexe des points de contrôle contient la courbe
  }
  return out;
}

// ——— Écritures ———

const svgPoint = (p: StudioPoint) => `${nb(p.x)} ${svgY(p.y)}`;

/** Élément SVG d'une primitive (repère retourné : y SVG = −y local). */
export function primitiveSvg(p: StudioPrimitiveGraphisme): string {
  switch (p.genre) {
    case "bezier": return `<path d="M ${svgPoint(p.depart)}${p.morceaux.map((m) => ` C ${m.map(svgPoint).join(" ")}`).join("")}" vector-effect="non-scaling-stroke"/>`;
    case "segment": return `<line x1="${nb(p.a.x)}" y1="${svgY(p.a.y)}" x2="${nb(p.b.x)}" y2="${svgY(p.b.y)}" vector-effect="non-scaling-stroke"/>`;
    case "cercle": return `<circle cx="${nb(p.centre.x)}" cy="${svgY(p.centre.y)}" r="${nb(p.rayon)}" vector-effect="non-scaling-stroke"/>`;
    case "polygone": return `<polygon points="${p.points.map((q) => `${nb(q.x)},${svgY(q.y)}`).join(" ")}" vector-effect="non-scaling-stroke"/>`;
  }
}

/** Groupe SVG d'un graphisme : `data-graphisme`, `data-type`, `data-symbole`, `opacity` s'il est transparent. */
export function graphismeSvg(g: StudioGraphisme): string[] {
  const attrs = `data-graphisme="${xml(g.id)}" data-type="${g.type}"${g.type === "symbole" ? ` data-symbole="${g.symbole}"` : ""}${g.opacite === undefined ? "" : ` opacity="${nb(g.opacite)}"`}`;
  return [`<g ${attrs}>`, ...studioPrimitivesGraphisme(g).map(primitiveSvg), "</g>"];
}

/** Entités DXF R12 d'un graphisme (polylignes, lignes, cercles) ; transparence déclarée en commentaire 999. */
export function graphismeDxf(g: StudioGraphisme, layer: string, w: DxfWriter): void {
  if (g.opacite !== undefined) w.pair(999, `graphisme ${g.id} : opacite ${nb(g.opacite)} non representable en DXF R12`);
  if (g.type === "spline") { w.polyline(layer, studioPointsSpline(g), false); return; }
  for (const p of studioPrimitivesGraphisme(g)) {
    if (p.genre === "segment") w.line(layer, p.a, p.b);
    else if (p.genre === "cercle") w.circle(layer, p.centre, p.rayon);
    else if (p.genre === "polygone") w.closedPolyline(layer, p.points);
    else w.polyline(layer, studioPointsSpline({ points: [p.depart, ...p.morceaux.flat()] }), false);
  }
}

// ——— Schéma ———

const opacite = { type: "number", exclusiveMinimum: 0, maximum: 1 } as const;
export const SCHEMA_GRAPHISME = {
  oneOf: [
    { type: "object", additionalProperties: false, required: ["id", "type", "points"], properties: { id, type: { const: "spline" }, layerId, opacite, points: { type: "array", minItems: 4, maxItems: STUDIO_LIMITES_GRAPHISMES.pointsSpline, items: pointSchema } } },
    { type: "object", additionalProperties: false, required: ["id", "type", "contour", "angle", "espacement"], properties: { id, type: { const: "hachure" }, layerId, opacite, contour: { type: "array", minItems: 3, maxItems: STUDIO_LIMITES_GRAPHISMES.sommetsContour, items: pointSchema }, angle: { type: "number", minimum: 0, exclusiveMaximum: Math.PI }, espacement: positive } },
    { type: "object", additionalProperties: false, required: ["id", "type", "symbole", "position", "rotation", "echelle"], properties: { id, type: { const: "symbole" }, layerId, opacite, symbole: { enum: [...STUDIO_SYMBOLES] }, position: pointSchema, rotation: { type: "number", minimum: -2 * Math.PI, maximum: 2 * Math.PI }, echelle: positive } },
  ],
} as const;
