/**
 * Constructions géométriques de l'accrochage, en repère `local-2d` (mètres) : intersections (segment / segment,
 * segment / cercle ou arc, cercle ou arc / cercle ou arc), pied de la perpendiculaire, points de tangence, point le
 * plus proche. Les arcs (objets Arc et arcs de renflement des polylignes) ne gardent que les points de leur étendue.
 * Formules fermées, sans itération ; le résultat est nettoyé du bruit flottant au nanomètre (`net`). Pur : ni React ni DOM.
 */
import type { StudioPoint } from "@parcours/atelier-model";
import { surArc, type Entite } from "./entites";

/** Nettoyage du bruit flottant au nanomètre : 4,999999999999 m redevient 5 m ; aucune valeur saisie n'est déplacée. */
export const net = (v: number): number => { const r = Math.round(v * 1e9) / 1e9; return Object.is(r, -0) ? 0 : r; };
export const netPoint = (p: StudioPoint): StudioPoint => ({ x: net(p.x), y: net(p.y) });
export const distance = (a: StudioPoint, b: StudioPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

const EPS_PARAM = 1e-12;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

type Rond = Extract<Entite, { type: "cercle" | "arc" }>;
/** Le point du cercle porteur appartient-il à l'entité (toujours pour un cercle, étendue pour un arc) ? */
function surRond(e: Rond, p: StudioPoint): boolean {
  return e.type === "cercle" || surArc(e, Math.atan2(p.y - e.c.y, p.x - e.c.x));
}

/** Intersection de deux segments (bornes comprises) ; parallèles ou confondus : aucune (pas de point isolé). */
export function segmentSegment(a: StudioPoint, b: StudioPoint, c: StudioPoint, d: StudioPoint): StudioPoint | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = cross(rx, ry, sx, sy);
  if (Math.abs(den) <= 1e-12 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = cross(qx, qy, sx, sy) / den, u = cross(qx, qy, rx, ry) / den;
  if (t < -EPS_PARAM || t > 1 + EPS_PARAM || u < -EPS_PARAM || u > 1 + EPS_PARAM) return null;
  return netPoint({ x: a.x + t * rx, y: a.y + t * ry });
}

/** Intersections d'un segment et d'un cercle (0, 1 en tangence, ou 2 points), bornes du segment comprises. */
export function segmentCercle(a: StudioPoint, b: StudioPoint, c: StudioPoint, r: number): StudioPoint[] {
  const vx = b.x - a.x, vy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y;
  const A = vx * vx + vy * vy;
  if (A === 0) return [];
  const B = 2 * (fx * vx + fy * vy), C = fx * fx + fy * fy - r * r;
  let disc = B * B - 4 * A * C;
  // Tangence à l'arrondi près : un seul point. Tolérance relative : au terme B², et au bruit δ des coordonnées
  // (∝ leur grandeur, ~1e5 m) porté par C (≈ 2rδ), donc jamais nulle quand B ≈ 0 (segment partant du point de tangence).
  const delta = 1e-12 * Math.max(1, r, Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y));
  const tolDisc = Math.max(1e-12 * B * B, 4 * A * (2 * r * delta + delta * delta));
  if (Math.abs(disc) <= tolDisc) disc = 0;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  const ts = s === 0 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  return ts.filter((t) => t >= -EPS_PARAM && t <= 1 + EPS_PARAM).map((t) => netPoint({ x: a.x + t * vx, y: a.y + t * vy }));
}

/** Intersections de deux cercles (0, 1 en tangence, ou 2 points) ; concentriques : aucune. */
export function cercleCercle(c1: StudioPoint, r1: number, c2: StudioPoint, r2: number): StudioPoint[] {
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  // Tolérance relative à l'échelle (centres à 1e5 m : le bruit de d dépasse largement 1e-12 m).
  const tol = 1e-12 * Math.max(1, d, r1 + r2, Math.abs(c1.x), Math.abs(c1.y), Math.abs(c2.x), Math.abs(c2.y));
  if (d === 0 || d > r1 + r2 + tol || d < Math.abs(r1 - r2) - tol) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  // Tangence à l'arrondi près (extérieure ou intérieure) : un seul point.
  const tangence = Math.abs(d - (r1 + r2)) <= tol || Math.abs(d - Math.abs(r1 - r2)) <= tol;
  const h = !tangence && h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = c1.x + (a * dx) / d, my = c1.y + (a * dy) / d;
  if (h === 0) return [netPoint({ x: mx, y: my })];
  return [netPoint({ x: mx + (h * -dy) / d, y: my + (h * dx) / d }), netPoint({ x: mx - (h * -dy) / d, y: my - (h * dx) / d })];
}

/** Intersections de deux entités (arcs limités à leur étendue). */
export function intersectionsEntites(e: Entite, f: Entite): StudioPoint[] {
  if (e.type === "segment" && f.type === "segment") { const p = segmentSegment(e.a, e.b, f.a, f.b); return p ? [p] : []; }
  if (e.type === "segment") return segmentCercle(e.a, e.b, (f as Rond).c, (f as Rond).r).filter((p) => surRond(f as Rond, p));
  if (f.type === "segment") return segmentCercle(f.a, f.b, e.c, e.r).filter((p) => surRond(e, p));
  return cercleCercle(e.c, e.r, f.c, f.r).filter((p) => surRond(e, p) && surRond(f as Rond, p));
}

/** Pieds des perpendiculaires menées de `p` à l'entité (sur le segment ; sur le cercle : les deux points du diamètre par p). */
export function piedsPerpendiculaires(e: Entite, p: StudioPoint): StudioPoint[] {
  if (e.type === "segment") {
    const vx = e.b.x - e.a.x, vy = e.b.y - e.a.y;
    const L2 = vx * vx + vy * vy;
    if (L2 === 0) return [];
    const t = ((p.x - e.a.x) * vx + (p.y - e.a.y) * vy) / L2;
    if (t < -EPS_PARAM || t > 1 + EPS_PARAM) return [];
    return [netPoint({ x: e.a.x + t * vx, y: e.a.y + t * vy })];
  }
  const dx = p.x - e.c.x, dy = p.y - e.c.y, d = Math.hypot(dx, dy);
  if (d === 0) return [];
  const ux = dx / d, uy = dy / d;
  return [{ x: e.c.x + e.r * ux, y: e.c.y + e.r * uy }, { x: e.c.x - e.r * ux, y: e.c.y - e.r * uy }].map(netPoint).filter((q) => surRond(e, q));
}

/** Points de tangence des droites menées de `p` à un cercle ou un arc (p extérieur au cercle) ; segment : aucun. */
export function pointsTangence(e: Entite, p: StudioPoint): StudioPoint[] {
  if (e.type === "segment") return [];
  const dx = p.x - e.c.x, dy = p.y - e.c.y, d = Math.hypot(dx, dy);
  if (d <= e.r) return [];
  const t = Math.atan2(dy, dx), a = Math.acos(e.r / d);
  return [t + a, t - a].map((u) => netPoint({ x: e.c.x + e.r * Math.cos(u), y: e.c.y + e.r * Math.sin(u) })).filter((q) => surRond(e, q));
}

/** Point de l'entité le plus proche de `p` (arc : projection sur le cercle si elle est dans l'étendue, sinon l'extrémité la plus proche). */
export function plusProche(e: Entite, p: StudioPoint): StudioPoint | null {
  if (e.type === "segment") {
    const vx = e.b.x - e.a.x, vy = e.b.y - e.a.y;
    const L2 = vx * vx + vy * vy;
    const t = L2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - e.a.x) * vx + (p.y - e.a.y) * vy) / L2));
    return netPoint({ x: e.a.x + t * vx, y: e.a.y + t * vy });
  }
  const dx = p.x - e.c.x, dy = p.y - e.c.y, d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const q = { x: e.c.x + (e.r * dx) / d, y: e.c.y + (e.r * dy) / d };
  if (surRond(e, q)) return netPoint(q);
  const arc = e as Extract<Entite, { type: "arc" }>;
  const ends = [arc.debut, arc.debut + arc.balayage].map((u) => ({ x: e.c.x + e.r * Math.cos(u), y: e.c.y + e.r * Math.sin(u) }));
  return netPoint(distance(ends[0]!, p) <= distance(ends[1]!, p) ? ends[0]! : ends[1]!);
}
