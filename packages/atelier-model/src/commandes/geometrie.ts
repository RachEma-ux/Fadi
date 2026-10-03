/**
 * Géométrie plane des réducteurs (repère local du projet, mètres). Fonctions pures, sans arrondi : les valeurs
 * calculées sont conservées telles quelles (R7) ; les comparaisons utilisent les tolérances D-012.
 */
import { TOLERANCES } from "../contrats/tolerances.js";
import type { PointLocal, Polygone, Segment } from "../ontologie/reperes.js";

export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** Point local du projet (sans repère nommé). */
export function pt(x: number, y: number): PointLocal {
  return { x, y, frame: "local", unit: "m" };
}

/** Recopie un point en conservant son repère local nommé éventuel. */
export function avecCoordonnees(p: PointLocal, x: number, y: number): PointLocal {
  return p.repereLocal === undefined ? { x, y, frame: "local", unit: "m" } : { x, y, frame: "local", unit: "m", repereLocal: p.repereLocal };
}

export const sous = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const plus = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const fois = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const scalaire = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const vectoriel = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const norme = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export const RAD = Math.PI / 180;

export function longueurSegment(s: Segment<PointLocal>): number {
  return distance(s.a, s.b);
}

/** Point du segment au paramètre `t` ∈ [0, 1]. */
export function pointA(s: Segment<PointLocal>, t: number): Vec {
  return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
}

/** Paramètre de la projection de `p` sur la droite du segment (non borné). */
export function parametreProjection(s: Segment<PointLocal>, p: Vec): number {
  const d = sous(s.b, s.a);
  const l2 = scalaire(d, d);
  return l2 === 0 ? 0 : scalaire(sous(p, s.a), d) / l2;
}

/** Distance d'un point à la droite d'un segment. */
export function distanceDroite(s: Segment<PointLocal>, p: Vec): number {
  const d = sous(s.b, s.a);
  const l = norme(d);
  return l === 0 ? distance(s.a, p) : Math.abs(vectoriel(d, sous(p, s.a))) / l;
}

/** Aire signée (formule du lacet), positive pour un contour dans le sens trigonométrique. */
export function aireSignee(poly: readonly Vec[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a && b) s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Point dans un polygone (bord compris, à `tolCoincidence` près). */
export function pointDansPolygone(p: Vec, poly: readonly Vec[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (!a || !b) continue;
    const ab = sous(b, a);
    const l = norme(ab);
    if (l > 0) {
      const t = scalaire(sous(p, a), ab) / (l * l);
      if (t >= -TOLERANCES.tolCoincidence && t <= 1 + TOLERANCES.tolCoincidence && Math.abs(vectoriel(ab, sous(p, a))) / l <= TOLERANCES.tolCoincidence) return true;
    } else if (distance(a, p) <= TOLERANCES.tolCoincidence) return true;
  }
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/**
 * Intersection de deux droites `p + s·r` et `q + u·w` ; `null` si parallèles (à `tolAngle` près).
 * Retourne les paramètres `s` (sur la première) et `u` (sur la seconde).
 */
export function intersectionDroites(p: Vec, r: Vec, q: Vec, w: Vec): { readonly s: number; readonly u: number } | null {
  const den = vectoriel(r, w);
  const nr = norme(r);
  const nw = norme(w);
  if (nr === 0 || nw === 0 || Math.abs(den) / (nr * nw) <= TOLERANCES.tolAngle) return null;
  const qp = sous(q, p);
  return { s: vectoriel(qp, w) / den, u: vectoriel(qp, r) / den };
}

/** Transformation affine plane : image d'un point, rotation ajoutée aux angles (°), retournement, facteur. */
export interface Transfo {
  readonly point: (p: Vec) => Vec;
  /** Image d'une direction (angle en degrés). */
  readonly direction: (angleDeg: number) => number;
  /** Vrai si la transformation retourne l'orientation (miroir). */
  readonly retourne: boolean;
  /** Facteur d'échelle appliqué aux longueurs géométriques (1 hors mise à l'échelle). */
  readonly facteur: number;
}

export function translation(dx: number, dy: number): Transfo {
  return { point: (p) => ({ x: p.x + dx, y: p.y + dy }), direction: (a) => a, retourne: false, facteur: 1 };
}

export function rotation(centre: Vec, angleDeg: number): Transfo {
  const c = Math.cos(angleDeg * RAD);
  const s = Math.sin(angleDeg * RAD);
  return {
    point: (p) => {
      const dx = p.x - centre.x;
      const dy = p.y - centre.y;
      return { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c };
    },
    direction: (a) => a + angleDeg,
    retourne: false,
    facteur: 1,
  };
}

/** Symétrie par rapport à la droite (a, b). */
export function symetrie(a: Vec, b: Vec): Transfo {
  const d = sous(b, a);
  const l = norme(d);
  const ux = d.x / l;
  const uy = d.y / l;
  const theta = Math.atan2(d.y, d.x) / RAD;
  return {
    point: (p) => {
      const vx = p.x - a.x;
      const vy = p.y - a.y;
      const k = vx * ux + vy * uy;
      return { x: a.x + 2 * k * ux - vx, y: a.y + 2 * k * uy - vy };
    },
    direction: (ang) => 2 * theta - ang,
    retourne: true,
    facteur: 1,
  };
}

export function homothetie(centre: Vec, facteur: number): Transfo {
  return {
    point: (p) => ({ x: centre.x + (p.x - centre.x) * facteur, y: centre.y + (p.y - centre.y) * facteur }),
    direction: (a) => a,
    retourne: false,
    facteur,
  };
}

/** Image d'un point local (repère conservé). */
export function transformerPoint(t: Transfo, p: PointLocal): PointLocal {
  const q = t.point(p);
  return avecCoordonnees(p, q.x, q.y);
}

export function transformerPolygone(t: Transfo, poly: Polygone<PointLocal>): PointLocal[] {
  return poly.map((p) => transformerPoint(t, p));
}

/** Sommets consécutifs confondus (à `tolCoincidence`) dans une liste de points, éventuellement fermée. */
export function sommetsConfondus(points: readonly Vec[], ferme: boolean): number | null {
  const n = points.length;
  for (let i = 0; i < (ferme ? n : n - 1); i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a && b && distance(a, b) < TOLERANCES.tolCoincidence) return i;
  }
  return null;
}
