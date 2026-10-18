import type { StudioAnchor, StudioArc, StudioCircle, StudioPoint, StudioPolyline, StudioShape } from "./document-2d.js";

/**
 * Géométrie pure des courbes de Studio (`studio-document/1`) : cercles, arcs (centre, rayon, angles de début et de fin
 * en radians, sens trigonométrique) et polylignes (sommets, fermeture, renflement `bulge` facultatif par segment, à la
 * manière du DXF : `bulge = tan(θ / 4)`, θ angle signé de l'arc, positif dans le sens trigonométrique). Repère
 * `local-2d`, mètres. Tout est dérivé et déterministe : la discrétisation des arcs (`STUDIO_SEGMENTS_PAR_TOUR` segments
 * par tour, jamais moins d'un par arc) sert aux contours, aux volumes, à la sélection et aux échanges qui n'ont pas
 * d'arc exact ; le document garde la courbe exacte. Ni React, ni DOM.
 */

export const STUDIO_TWO_PI = 2 * Math.PI;
/** Segments d'une discrétisation par tour complet (64 : les quatre quadrants tombent sur un sommet exact). */
export const STUDIO_SEGMENTS_PAR_TOUR = 64;
const PAS = STUDIO_TWO_PI / STUDIO_SEGMENTS_PAR_TOUR;

/** Angle ramené dans [0 ; 2π). */
export function studioAngleNormal(a: number): number {
  const r = a % STUDIO_TWO_PI;
  const n = r < 0 ? r + STUDIO_TWO_PI : r;
  return n >= STUDIO_TWO_PI ? 0 : n;
}

/** Balayage d'un arc (sens trigonométrique) de `start` à `end`, dans ]0 ; 2π[ pour deux angles distincts de [0 ; 2π). */
export const studioArcSweep = (start: number, end: number): number => (end > start ? end - start : end - start + STUDIO_TWO_PI);

const surCercle = (c: StudioPoint, r: number, a: number): StudioPoint => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });

/** Points d'un arc de `start` sur un balayage signé `sweep` : extrémités comprises, au moins un segment. */
export function studioArcPoints(c: StudioPoint, r: number, start: number, sweep: number): StudioPoint[] {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / PAS - 1e-9));
  const out: StudioPoint[] = [];
  for (let i = 0; i <= n; i++) out.push(surCercle(c, r, start + (sweep * i) / n));
  return out;
}

/** Sommets d'un cercle discrétisé (sans répétition du premier) ; les quatre quadrants sont exacts. */
export function studioCirclePoints(c: StudioPoint, r: number): StudioPoint[] {
  const out: StudioPoint[] = [];
  const quart = STUDIO_SEGMENTS_PAR_TOUR / 4;
  for (let i = 0; i < STUDIO_SEGMENTS_PAR_TOUR; i++) {
    if (i % quart === 0) {
      const q = i / quart;
      out.push(q === 0 ? { x: c.x + r, y: c.y } : q === 1 ? { x: c.x, y: c.y + r } : q === 2 ? { x: c.x - r, y: c.y } : { x: c.x, y: c.y - r });
    } else out.push(surCercle(c, r, i * PAS));
  }
  return out;
}

/** Arc porté par un segment de polyligne de renflement non nul : centre, rayon, angle de départ, balayage signé. */
export interface StudioBulgeArc {
  center: StudioPoint;
  radius: number;
  startAngle: number;
  sweep: number;
}
export function studioBulgeArc(p: StudioPoint, q: StudioPoint, bulge: number): StudioBulgeArc | null {
  if (bulge === 0) return null;
  const dx = q.x - p.x, dy = q.y - p.y;
  const c = Math.hypot(dx, dy);
  const nx = -dy / c, ny = dx / c;
  // Distance signée du milieu de la corde au centre, le long de la normale à gauche.
  const d = ((c / 2) * (1 - bulge * bulge)) / (2 * bulge);
  const center = { x: (p.x + q.x) / 2 + nx * d, y: (p.y + q.y) / 2 + ny * d };
  return { center, radius: (c * (1 + bulge * bulge)) / (4 * Math.abs(bulge)), startAngle: Math.atan2(p.y - center.y, p.x - center.x), sweep: 4 * Math.atan(bulge) };
}

/** Segments d'une polyligne : extrémités et renflement (0 = droit). */
export interface StudioPolylineSegment {
  a: StudioPoint;
  b: StudioPoint;
  bulge: number;
}
export function studioPolylineSegments(o: Pick<StudioPolyline, "points" | "closed" | "bulges">): StudioPolylineSegment[] {
  const n = o.points.length;
  const out: StudioPolylineSegment[] = [];
  for (let i = 0; i < (o.closed ? n : n - 1); i++) out.push({ a: o.points[i]!, b: o.points[(i + 1) % n]!, bulge: o.bulges?.[i] ?? 0 });
  return out;
}
export const studioPolylineSegmentCount = (o: Pick<StudioPolyline, "points" | "closed">): number => (o.closed ? o.points.length : o.points.length - 1);

/** Trajet discrétisé d'une polyligne (fermée : sans répétition du premier sommet) ; les sommets saisis sont exacts. */
export function studioPolylinePath(o: Pick<StudioPolyline, "points" | "closed" | "bulges">): StudioPoint[] {
  const out: StudioPoint[] = [];
  for (const s of studioPolylineSegments(o)) {
    out.push(s.a);
    const arc = studioBulgeArc(s.a, s.b, s.bulge);
    if (arc) out.push(...studioArcPoints(arc.center, arc.radius, arc.startAngle, arc.sweep).slice(1, -1));
  }
  if (!o.closed) out.push(o.points[o.points.length - 1]!);
  return out;
}

/** Contour discrétisé d'une forme : points dans l'ordre du tracé, fermé ou non. */
export function studioShapeOutline(o: StudioShape): { points: StudioPoint[]; closed: boolean } {
  switch (o.type) {
    case "line": return { points: [o.start, o.end], closed: false };
    case "rectangle": {
      const { x, y } = o.origin;
      return { points: [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }], closed: true };
    }
    case "circle": return { points: studioCirclePoints(o.center, o.radius), closed: true };
    case "arc": {
      const pts = studioArcPoints(o.center, o.radius, o.startAngle, studioArcSweep(o.startAngle, o.endAngle));
      return { points: pts, closed: false };
    }
    case "polyline": return { points: studioPolylinePath(o), closed: o.closed };
  }
}

/** Segments droits du contour discrétisé (sélection, découpe). */
export function studioShapeSegments(o: StudioShape): [StudioPoint, StudioPoint][] {
  const { points, closed } = studioShapeOutline(o);
  const out: [StudioPoint, StudioPoint][] = [];
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++) out.push([points[i]!, points[(i + 1) % points.length]!]);
  return out;
}

/** Points extrêmes (axes) d'un arc de balayage signé, en plus de ses extrémités. */
function extremes(c: StudioPoint, r: number, start: number, sweep: number): StudioPoint[] {
  const a0 = sweep < 0 ? start + sweep : start, s = Math.abs(sweep);
  const out: StudioPoint[] = [];
  for (let k = 0; k < 4; k++) {
    const t = studioAngleNormal((k * Math.PI) / 2 - a0);
    if (t <= s) out.push(k === 0 ? { x: c.x + r, y: c.y } : k === 1 ? { x: c.x, y: c.y + r } : k === 2 ? { x: c.x - r, y: c.y } : { x: c.x, y: c.y - r });
  }
  return out;
}

/** Points qui bornent exactement une forme (sommets, extrémités, points extrêmes des arcs). */
export function studioShapeBoundPoints(o: StudioShape): StudioPoint[] {
  switch (o.type) {
    case "line": return [o.start, o.end];
    case "rectangle": return [o.origin, { x: o.origin.x + o.width, y: o.origin.y + o.height }];
    case "circle": return [{ x: o.center.x - o.radius, y: o.center.y - o.radius }, { x: o.center.x + o.radius, y: o.center.y + o.radius }];
    case "arc": {
      const sweep = studioArcSweep(o.startAngle, o.endAngle);
      return [surCercle(o.center, o.radius, o.startAngle), surCercle(o.center, o.radius, o.endAngle), ...extremes(o.center, o.radius, o.startAngle, sweep)];
    }
    case "polyline": {
      const out = [...o.points];
      for (const s of studioPolylineSegments(o)) {
        const arc = studioBulgeArc(s.a, s.b, s.bulge);
        if (arc) out.push(...extremes(arc.center, arc.radius, arc.startAngle, arc.sweep));
      }
      return out;
    }
  }
}

/** Point de début, de fin et milieu d'un arc (ses sommets nommés). */
export function studioArcEnds(o: Pick<StudioArc, "center" | "radius" | "startAngle" | "endAngle">): { start: StudioPoint; end: StudioPoint; mid: StudioPoint } {
  const sweep = studioArcSweep(o.startAngle, o.endAngle);
  return { start: surCercle(o.center, o.radius, o.startAngle), end: surCercle(o.center, o.radius, o.endAngle), mid: surCercle(o.center, o.radius, o.startAngle + sweep / 2) };
}

/** Milieu d'un segment de polyligne (sur l'arc pour un segment courbe). */
export function studioSegmentMid(s: StudioPolylineSegment): StudioPoint {
  const arc = studioBulgeArc(s.a, s.b, s.bulge);
  return arc ? surCercle(arc.center, arc.radius, arc.startAngle + arc.sweep / 2) : { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
}

/** Sommets nommés (accrochage, liens de cote) d'une forme, dans un ordre fixe par type. */
export function studioShapeAnchors(o: StudioShape): StudioAnchor[] {
  switch (o.type) {
    case "line": return ["start", "end", "mid"];
    case "rectangle": return ["corner-origin", "corner-width", "corner-height", "corner-opposite"];
    case "circle": return ["center", "quadrant-0", "quadrant-90", "quadrant-180", "quadrant-270"];
    case "arc": return ["start", "end", "mid", "center"];
    case "polyline": {
      const out: StudioAnchor[] = o.points.map((_, i) => `vertex-${i}` as const);
      for (let i = 0; i < studioPolylineSegmentCount(o); i++) out.push(`mid-${i}`);
      return out;
    }
  }
}

// ——— SVG ———

/**
 * Données de chemin SVG (`d`) d'un cercle, d'un arc ou d'une polyligne, arcs exacts (commande `A`). `flipY` retourne
 * l'axe y (export SVG : y écran = −y local) et inverse donc le sens de balayage. `fmt` formate chaque nombre.
 */
export function studioSvgPath(o: StudioCircle | StudioArc | StudioPolyline, flipY: boolean, fmt: (v: number) => string = String): string {
  const P = (p: StudioPoint) => `${fmt(p.x)} ${fmt(flipY ? -p.y : p.y)}`;
  const flag = (ccw: boolean) => (ccw !== flipY ? 1 : 0);
  if (o.type === "circle") {
    const r = fmt(o.radius);
    const a = { x: o.center.x + o.radius, y: o.center.y }, b = { x: o.center.x - o.radius, y: o.center.y };
    return `M ${P(a)} A ${r} ${r} 0 1 ${flag(true)} ${P(b)} A ${r} ${r} 0 1 ${flag(true)} ${P(a)} Z`;
  }
  if (o.type === "arc") {
    const { start, end } = studioArcEnds(o);
    const sweep = studioArcSweep(o.startAngle, o.endAngle);
    return `M ${P(start)} A ${fmt(o.radius)} ${fmt(o.radius)} 0 ${sweep > Math.PI ? 1 : 0} ${flag(true)} ${P(end)}`;
  }
  const parts = [`M ${P(o.points[0]!)}`];
  for (const s of studioPolylineSegments(o)) {
    const arc = studioBulgeArc(s.a, s.b, s.bulge);
    parts.push(arc ? `A ${fmt(arc.radius)} ${fmt(arc.radius)} 0 ${Math.abs(arc.sweep) > Math.PI ? 1 : 0} ${flag(arc.sweep > 0)} ${P(s.b)}` : `L ${P(s.b)}`);
  }
  if (o.closed) parts.push("Z");
  return parts.join(" ");
}

// ——— Anneaux : aire, simplicité, triangulation ———

export const studioSignedArea = (p: readonly StudioPoint[]): number => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

const cross = (o: StudioPoint, a: StudioPoint, b: StudioPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const onSegment = (a: StudioPoint, b: StudioPoint, p: StudioPoint) =>
  Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);

/** Deux segments se touchent-ils (croisement, contact ou recouvrement) ? */
export function studioSegmentsTouch(a: StudioPoint, b: StudioPoint, c: StudioPoint, d: StudioPoint): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
}

/** Anneau simple : au moins trois sommets, aire non nulle, aucun côté ne touche un côté non voisin, aucun repli. */
export function studioRingSimple(ring: readonly StudioPoint[]): boolean {
  const n = ring.length;
  if (n < 3 || studioSignedArea(ring) === 0) return false;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!, b = ring[(i + 1) % n]!, c = ring[(i + 2) % n]!;
    // Repli sur le côté voisin (aller-retour colinéaire).
    if (cross(a, b, c) === 0 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (studioSegmentsTouch(a, b, ring[j]!, ring[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

/**
 * Triangulation par oreilles d'un anneau simple orienté dans le sens trigonométrique (indices dans `ring`). Les sommets
 * alignés sont retirés sans triangle (aire nulle).
 */
export function studioTriangulate(ring: readonly StudioPoint[]): [number, number, number][] {
  const idx = ring.map((_, i) => i);
  const out: [number, number, number][] = [];
  while (idx.length > 3) {
    let coupe = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]!, i1 = idx[k]!, i2 = idx[(k + 1) % idx.length]!;
      const a = ring[i0]!, b = ring[i1]!, c = ring[i2]!;
      const cr = cross(a, b, c);
      if (cr === 0) { idx.splice(k, 1); coupe = true; break; }
      if (cr < 0) continue;
      let vide = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = ring[j]!;
        if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y) || (p.x === c.x && p.y === c.y)) continue;
        if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) { vide = false; break; }
      }
      if (!vide) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      coupe = true;
      break;
    }
    // Anneau dégénéré (ne devrait pas arriver pour un anneau simple) : éventail sur le reste, sans boucle infinie.
    if (!coupe) {
      for (let k = 1; k < idx.length - 1; k++) out.push([idx[0]!, idx[k]!, idx[k + 1]!]);
      return out;
    }
  }
  if (idx.length === 3 && cross(ring[idx[0]!]!, ring[idx[1]!]!, ring[idx[2]!]!) !== 0) out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}

// ——— Construction par points (outils de la planche) ———

export interface StudioArcGeometry {
  center: StudioPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
}

/**
 * Arc passant par trois points (début, point de passage, fin) ; rangé dans le sens trigonométrique (début et fin
 * échangés si le passage tourne dans l'autre sens). `null` si les points sont alignés ou confondus.
 */
export function studioArcFromThreePoints(p1: StudioPoint, p2: StudioPoint, p3: StudioPoint): StudioArcGeometry | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (d === 0 || !Number.isFinite(d)) return null;
  const s1 = p1.x * p1.x + p1.y * p1.y, s2 = p2.x * p2.x + p2.y * p2.y, s3 = p3.x * p3.x + p3.y * p3.y;
  const center = { x: (s1 * (p2.y - p3.y) + s2 * (p3.y - p1.y) + s3 * (p1.y - p2.y)) / d, y: (s1 * (p3.x - p2.x) + s2 * (p1.x - p3.x) + s3 * (p2.x - p1.x)) / d };
  const radius = Math.hypot(p1.x - center.x, p1.y - center.y);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const a = (p: StudioPoint) => studioAngleNormal(Math.atan2(p.y - center.y, p.x - center.x));
  const a1 = a(p1), a2 = a(p2), a3 = a(p3);
  if (a1 === a3) return null;
  // Le passage est-il sur le trajet trigonométrique de p1 à p3 ?
  const ccw = studioAngleNormal(a2 - a1) < studioAngleNormal(a3 - a1);
  return ccw ? { center, radius, startAngle: a1, endAngle: a3 } : { center, radius, startAngle: a3, endAngle: a1 };
}

/** Arc par centre, point de début (rayon et angle de début) et direction de fin (sens trigonométrique). */
export function studioArcFromCenter(c: StudioPoint, start: StudioPoint, end: StudioPoint): StudioArcGeometry | null {
  const radius = Math.hypot(start.x - c.x, start.y - c.y);
  if (!(radius > 0) || (end.x === c.x && end.y === c.y)) return null;
  const startAngle = studioAngleNormal(Math.atan2(start.y - c.y, start.x - c.x));
  const endAngle = studioAngleNormal(Math.atan2(end.y - c.y, end.x - c.x));
  return startAngle === endAngle ? null : { center: { ...c }, radius, startAngle, endAngle };
}

// ——— Décalage ———

export type StudioOffsetResult = { ok: true; shape: StudioShape } | { ok: false; raison: string };

const nano = (v: number): number => {
  const r = Math.round(v * 1e9) / 1e9;
  return Object.is(r, -0) ? 0 : r;
};
const pt = (p: StudioPoint): StudioPoint => ({ x: nano(p.x), y: nano(p.y) });

/**
 * Décalage d'une forme d'une distance signée, en une nouvelle forme d'identifiant `id` (même calque, non extrudée).
 * Sens : lignes et polylignes ouvertes, à gauche du sens de tracé pour une distance positive ; cercles, arcs,
 * rectangles et polylignes fermées, vers l'extérieur (le rayon grandit). Polyligne : jonctions en onglet entre segments
 * droits ; un segment courbe garde son renflement (même angle) et exige des jonctions tangentes. Refus motivé quand le
 * résultat n'existe pas (rayon ou côté annulé, jonction non tangente, segment retourné). Coordonnées au nanomètre.
 */
export function studioOffset(o: StudioShape, distance: number, id: string): StudioOffsetResult {
  if (!Number.isFinite(distance) || distance === 0) return { ok: false, raison: "distance non nulle attendue" };
  const calque = o.layerId !== undefined ? { layerId: o.layerId } : {};
  switch (o.type) {
    case "line": {
      const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y, l = Math.hypot(dx, dy);
      const n = { x: (-dy / l) * distance, y: (dx / l) * distance };
      return { ok: true, shape: { id, type: "line", ...calque, start: pt({ x: o.start.x + n.x, y: o.start.y + n.y }), end: pt({ x: o.end.x + n.x, y: o.end.y + n.y }) } };
    }
    case "rectangle": {
      const width = nano(o.width + 2 * distance), height = nano(o.height + 2 * distance);
      if (width <= 0 || height <= 0) return { ok: false, raison: "le rectangle décalé n’aurait plus d’aire" };
      return { ok: true, shape: { id, type: "rectangle", ...calque, origin: pt({ x: o.origin.x - distance, y: o.origin.y - distance }), width, height } };
    }
    case "circle": {
      const radius = nano(o.radius + distance);
      if (radius <= 0) return { ok: false, raison: "le rayon décalé serait nul ou négatif" };
      return { ok: true, shape: { id, type: "circle", ...calque, center: { ...o.center }, radius } };
    }
    case "arc": {
      const radius = nano(o.radius + distance);
      if (radius <= 0) return { ok: false, raison: "le rayon décalé serait nul ou négatif" };
      return { ok: true, shape: { id, type: "arc", ...calque, center: { ...o.center }, radius, startAngle: o.startAngle, endAngle: o.endAngle } };
    }
    case "polyline": return offsetPolyline(o, distance, id, calque);
  }
}

interface SegmentDecale { a: StudioPoint; b: StudioPoint; bulge: number; dir: StudioPoint | null }

function offsetPolyline(o: StudioPolyline, distance: number, id: string, calque: { layerId?: string }): StudioOffsetResult {
  // Décalage à gauche du tracé ; une polyligne fermée trigonométrique a l'extérieur à droite.
  const gauche = o.closed && studioSignedArea(studioPolylinePath(o)) > 0 ? -distance : distance;
  const segs: SegmentDecale[] = [];
  let echelle = Math.abs(distance);
  for (const p of o.points) echelle = Math.max(echelle, Math.abs(p.x), Math.abs(p.y));
  for (const s of studioPolylineSegments(o)) {
    const arc = studioBulgeArc(s.a, s.b, s.bulge);
    if (!arc) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l = Math.hypot(dx, dy);
      const n = { x: (-dy / l) * gauche, y: (dx / l) * gauche };
      segs.push({ a: { x: s.a.x + n.x, y: s.a.y + n.y }, b: { x: s.b.x + n.x, y: s.b.y + n.y }, bulge: 0, dir: { x: dx / l, y: dy / l } });
      continue;
    }
    // Arc trigonométrique : la gauche du tracé est vers le centre.
    const r = arc.radius - Math.sign(arc.sweep) * gauche;
    if (!(r > 0)) return { ok: false, raison: "un segment courbe décalé aurait un rayon nul ou négatif" };
    const k = r / arc.radius, c = arc.center;
    segs.push({ a: { x: c.x + (s.a.x - c.x) * k, y: c.y + (s.a.y - c.y) * k }, b: { x: c.x + (s.b.x - c.x) * k, y: c.y + (s.b.y - c.y) * k }, bulge: s.bulge, dir: null });
  }
  const tol = 1e-8 * Math.max(1, echelle);
  const jonction = (e: SegmentDecale, s: SegmentDecale): StudioPoint | string => {
    if (Math.hypot(e.b.x - s.a.x, e.b.y - s.a.y) <= tol) return e.dir ? s.a : e.b;
    if (!e.dir || !s.dir) return "jonction non tangente entre un segment courbe et un autre segment";
    const den = e.dir.x * s.dir.y - e.dir.y * s.dir.x;
    if (Math.abs(den) <= 1e-12) return "segments consécutifs en aller-retour";
    const t = ((s.a.x - e.b.x) * s.dir.y - (s.a.y - e.b.y) * s.dir.x) / den;
    return { x: e.b.x + e.dir.x * t, y: e.b.y + e.dir.y * t };
  };
  const n = o.points.length;
  const points: StudioPoint[] = [];
  for (let i = 0; i < n; i++) {
    const avant = i > 0 ? segs[i - 1] : o.closed ? segs[segs.length - 1] : undefined;
    const apres = i < segs.length ? segs[i] : undefined;
    const p = avant && apres ? jonction(avant, apres) : apres ? apres.a : avant!.b;
    if (typeof p === "string") return { ok: false, raison: p };
    points.push(pt(p));
  }
  // Un segment droit retourné (décalage intérieur plus grand que lui) ou annulé : le résultat n'existe pas.
  for (let i = 0; i < segs.length; i++) {
    const a = points[i]!, b = points[(i + 1) % n]!, d = segs[i]!.dir;
    if (a.x === b.x && a.y === b.y) return { ok: false, raison: "un segment décalé serait de longueur nulle" };
    if (d && (b.x - a.x) * d.x + (b.y - a.y) * d.y <= 0) return { ok: false, raison: "décalage plus grand qu’un segment : le segment serait retourné" };
  }
  return { ok: true, shape: { id, type: "polyline", ...calque, points, closed: o.closed, ...(o.bulges ? { bulges: [...o.bulges] } : {}) } };
}
