/**
 * Géométrie plane pure de l'éditeur de plan (repère local, mètres). Ni React ni DOM.
 *
 * `@parcours/core-geometry` ne fournit pas encore ces calculs (accrochage, projection, intersection de segments)
 * et ceux de `atelier-model/src/commandes/geometrie.ts` ne sont pas exportés : ils sont écrits ici sous forme
 * pure et signalés au chef de projet pour un futur `core-geometry/src/accrochage.ts` (DA-02-15).
 */
import { pointLocal, type PointLocal } from "@parcours/atelier-model";

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface SegmentPlan {
  readonly a: Vec;
  readonly b: Vec;
}

export const RAD = Math.PI / 180;

export const pt = (x: number, y: number): PointLocal => pointLocal(x, y);
export const sous = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const plus = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const fois = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const scalaire = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const vectoriel = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const norme = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const milieu = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const versPoint = (v: Vec): PointLocal => pt(v.x, v.y);

/**
 * Cosinus et sinus en degrés, **exacts** pour les multiples de 90° (DA-02-16 : pas de résidu du type 1,8·10⁻¹⁶).
 */
export function cosSinDeg(deg: number): readonly [number, number] {
  const r = ((deg % 360) + 360) % 360;
  if (r === 0) return [1, 0];
  if (r === 90) return [0, 1];
  if (r === 180) return [-1, 0];
  if (r === 270) return [0, -1];
  return [Math.cos(deg * RAD), Math.sin(deg * RAD)];
}

/** Point polaire depuis `origine` : longueur en m, angle en degrés (sens trigonométrique, 0 = +x). */
export function polaire(origine: Vec, longueur: number, angleDeg: number): PointLocal {
  const [c, s] = cosSinDeg(angleDeg);
  return pt(origine.x + longueur * c, origine.y + longueur * s);
}

/** Angle de a→b en degrés, dans [0 ; 360[. */
export function angleDeg(a: Vec, b: Vec): number {
  const d = Math.atan2(b.y - a.y, b.x - a.x) / RAD;
  return d < 0 ? d + 360 : d;
}

/** Normalise un angle dans [0 ; 360[. */
export const normaliserAngle = (deg: number): number => ((deg % 360) + 360) % 360;

/** Paramètre de la projection de `p` sur la droite (a, b) : 0 en a, 1 en b. */
export function parametreProjection(s: SegmentPlan, p: Vec): number {
  const d = sous(s.b, s.a);
  const l2 = scalaire(d, d);
  return l2 === 0 ? 0 : scalaire(sous(p, s.a), d) / l2;
}

/** Point le plus proche de `p` sur le segment. */
export function projeterSurSegment(s: SegmentPlan, p: Vec): Vec {
  const t = Math.max(0, Math.min(1, parametreProjection(s, p)));
  return plus(s.a, fois(sous(s.b, s.a), t));
}

export const distanceSegment = (s: SegmentPlan, p: Vec): number => distance(projeterSurSegment(s, p), p);

/** Pied de la perpendiculaire abaissée de `p` sur la droite du segment, s'il tombe dans le segment. */
export function piedPerpendiculaire(s: SegmentPlan, p: Vec): Vec | null {
  const t = parametreProjection(s, p);
  if (t < 0 || t > 1 || distance(s.a, s.b) === 0) return null;
  return plus(s.a, fois(sous(s.b, s.a), t));
}

/** Intersection de deux segments (bornes comprises) ; `null` si parallèles ou disjoints. */
export function intersectionSegments(s1: SegmentPlan, s2: SegmentPlan): Vec | null {
  const r = sous(s1.b, s1.a);
  const w = sous(s2.b, s2.a);
  const den = vectoriel(r, w);
  if (Math.abs(den) <= 1e-12 * (norme(r) * norme(w) || 1)) return null;
  const q = sous(s2.a, s1.a);
  const t = vectoriel(q, w) / den;
  const u = vectoriel(q, r) / den;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return plus(s1.a, fois(r, t));
}

/** Point dans un polygone (règle pair-impair). */
export function pointDansPolygone(p: Vec, poly: readonly Vec[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec;
    const b = poly[j] as Vec;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Aire signée (positive en sens trigonométrique). */
export function aireSignee(poly: readonly Vec[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Vec;
    const b = poly[(i + 1) % poly.length] as Vec;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export interface Rectangle {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function rectangleDe(a: Vec, b: Vec): Rectangle {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

export const dansRectangle = (r: Rectangle, p: Vec): boolean => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

export function coinsRectangle(r: Rectangle): Vec[] {
  return [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
}

/** Le segment touche-t-il le rectangle (extrémité dedans ou intersection avec un bord) ? */
export function segmentToucheRectangle(r: Rectangle, s: SegmentPlan): boolean {
  if (dansRectangle(r, s.a) || dansRectangle(r, s.b)) return true;
  const c = coinsRectangle(r);
  return c.some((a, i) => intersectionSegments(s, { a, b: c[(i + 1) % 4] as Vec }) !== null);
}

/** Emprise d'un ensemble de points ; `null` s'il est vide. */
export function emprise(points: Iterable<Vec>): Rectangle | null {
  let r: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const p of points) {
    if (!r) r = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    else {
      r.minX = Math.min(r.minX, p.x);
      r.minY = Math.min(r.minY, p.y);
      r.maxX = Math.max(r.maxX, p.x);
      r.maxY = Math.max(r.maxY, p.y);
    }
  }
  return r;
}

/** Cercle passant par trois points ; `null` s'ils sont alignés. */
export function cercleTroisPoints(a: Vec, b: Vec, c: Vec): { centre: Vec; rayon: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const centre = { x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d, y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d };
  return { centre, rayon: distance(centre, a) };
}

/**
 * Points d'un arc (facettisation d'affichage, jamais stockée) : de `debut` à `fin` en degrés, sens donné,
 * flèche ≤ `tolCorde`.
 */
export function facettesArc(centre: Vec, rayon: number, debut: number, fin: number, sens: "trigo" | "horaire", tolCorde = 0.001): Vec[] {
  let balayage = sens === "trigo" ? normaliserAngle(fin - debut) : -normaliserAngle(debut - fin);
  if (balayage === 0) balayage = sens === "trigo" ? 360 : -360;
  const pasMax = rayon > tolCorde ? 2 * Math.acos(1 - tolCorde / rayon) / RAD : 45;
  const n = Math.min(512, Math.max(2, Math.ceil(Math.abs(balayage) / Math.max(pasMax, 0.5))));
  return Array.from({ length: n + 1 }, (_, i) => {
    const [c, s] = cosSinDeg(debut + (balayage * i) / n);
    return { x: centre.x + rayon * c, y: centre.y + rayon * s };
  });
}

/** Sommets d'un rectangle d'esquisse (origine, largeur selon l'angle, profondeur à gauche). */
export function sommetsRectangle(origine: Vec, largeur: number, profondeur: number, angle: number): Vec[] {
  const [c, s] = cosSinDeg(angle);
  const u = { x: c, y: s };
  const v = { x: -s, y: c };
  const A = plus(origine, fois(u, largeur));
  return [origine, A, plus(A, fois(v, profondeur)), plus(origine, fois(v, profondeur))];
}

/** Sommets d'un polygone régulier (`inscrit` : sommets sur le cercle ; `circonscrit` : côtés tangents). */
export function sommetsPolygone(centre: Vec, n: number, rayon: number, mode: "inscrit" | "circonscrit", angle: number): Vec[] {
  const R = mode === "inscrit" ? rayon : rayon / Math.cos(Math.PI / n);
  return Array.from({ length: n }, (_, i) => {
    const [c, s] = cosSinDeg(angle + (360 * i) / n);
    return { x: centre.x + R * c, y: centre.y + R * s };
  });
}

/** Segments d'une suite de points (fermée ou non). */
export function segmentsDe(points: readonly Vec[], ferme: boolean): SegmentPlan[] {
  const r: SegmentPlan[] = [];
  for (let i = 0; i + 1 < points.length; i++) r.push({ a: points[i] as Vec, b: points[i + 1] as Vec });
  if (ferme && points.length > 2) r.push({ a: points[points.length - 1] as Vec, b: points[0] as Vec });
  return r;
}

/**
 * Simplification de Ramer–Douglas–Peucker (main levée, DA-01-06) : garde les sommets qui s'écartent de plus de
 * `tolerance` (m) de la corde. Premier et dernier points conservés.
 */
export function simplifier(points: readonly Vec[], tolerance: number): Vec[] {
  if (points.length <= 2) return [...points];
  const garder = new Array<boolean>(points.length).fill(false);
  garder[0] = true;
  garder[points.length - 1] = true;
  const pile: [number, number][] = [[0, points.length - 1]];
  while (pile.length > 0) {
    const [i, j] = pile.pop() as [number, number];
    const s = { a: points[i] as Vec, b: points[j] as Vec };
    let max = -1;
    let k = -1;
    for (let m = i + 1; m < j; m++) {
      const d = distance(s.a, s.b) === 0 ? distance(points[m] as Vec, s.a) : distanceSegment(s, points[m] as Vec);
      if (d > max) {
        max = d;
        k = m;
      }
    }
    if (k > 0 && max > tolerance) {
      garder[k] = true;
      pile.push([i, k], [k, j]);
    }
  }
  return points.filter((_, i) => garder[i]);
}

/**
 * Courbe de passage d'une spline (Catmull-Rom centripète, hypothèse DA-01-05) ou approximation d'une B-spline
 * uniforme de contrôle (degré quelconque, algorithme de de Boor) — affichage seulement, jamais canonique.
 */
export function courbeSpline(points: readonly Vec[], mode: "controle" | "passage", degre: number, ferme: boolean, pasParSegment = 16): Vec[] {
  if (points.length < 2) return [...points];
  if (mode === "passage") {
    const pts = ferme ? [...points, points[0] as Vec] : [...points];
    const ext = (i: number): Vec => {
      if (i < 0) return ferme ? (points[points.length - 1] as Vec) : plus(pts[0] as Vec, sous(pts[0] as Vec, pts[1] as Vec));
      if (i >= pts.length) return ferme ? (points[1 % points.length] as Vec) : plus(pts[pts.length - 1] as Vec, sous(pts[pts.length - 1] as Vec, pts[pts.length - 2] as Vec));
      return pts[i] as Vec;
    };
    const r: Vec[] = [pts[0] as Vec];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p0 = ext(i - 1);
      const p1 = ext(i);
      const p2 = ext(i + 1);
      const p3 = ext(i + 2);
      const t01 = Math.sqrt(distance(p0, p1)) || 1e-9;
      const t12 = Math.sqrt(distance(p1, p2)) || 1e-9;
      const t23 = Math.sqrt(distance(p2, p3)) || 1e-9;
      const m1 = plus(sous(p2, p1), fois(sous(fois(sous(p1, p0), 1 / t01), fois(sous(p2, p0), 1 / (t01 + t12))), t12));
      const m2 = plus(sous(p2, p1), fois(sous(fois(sous(p3, p2), 1 / t23), fois(sous(p3, p1), 1 / (t12 + t23))), t12));
      for (let k = 1; k <= pasParSegment; k++) {
        const t = k / pasParSegment;
        const t2 = t * t;
        const t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1;
        const h10 = t3 - 2 * t2 + t;
        const h01 = -2 * t3 + 3 * t2;
        const h11 = t3 - t2;
        r.push(plus(plus(fois(p1, h00), fois(m1, h10)), plus(fois(p2, h01), fois(m2, h11))));
      }
    }
    return r;
  }
  // B-spline uniforme « ouverte » (extrémités interpolées), de Boor.
  const ctrl = ferme ? [...points, ...points.slice(0, degre)] : [...points];
  const p = Math.max(1, Math.min(degre, ctrl.length - 1));
  const n = ctrl.length - 1;
  const noeuds: number[] = [];
  for (let i = 0; i <= n + p + 1; i++) noeuds.push(ferme ? i : i <= p ? 0 : i > n ? n - p + 1 : i - p);
  const tMin = noeuds[p] as number;
  const tMax = noeuds[n + 1] as number;
  const total = Math.max(2, (n - p + 1) * pasParSegment);
  const r: Vec[] = [];
  for (let k = 0; k <= total; k++) {
    const t = tMin + ((tMax - tMin) * k) / total - (k === total ? 1e-9 : 0);
    let s = p;
    while (s < n && t >= (noeuds[s + 1] as number)) s++;
    const d: Vec[] = Array.from({ length: p + 1 }, (_, j) => ctrl[j + s - p] as Vec);
    for (let rr = 1; rr <= p; rr++) {
      for (let j = p; j >= rr; j--) {
        const i = j + s - p;
        const den = (noeuds[i + p - rr + 1] as number) - (noeuds[i] as number);
        const alpha = den === 0 ? 0 : (t - (noeuds[i] as number)) / den;
        d[j] = plus(fois(d[j - 1] as Vec, 1 - alpha), fois(d[j] as Vec, alpha));
      }
    }
    r.push(d[p] as Vec);
  }
  return r;
}
