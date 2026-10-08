/**
 * Géométrie 3D partagée du modèle typé (P2-3 / P2-4) — pure, indépendante du DOM et des ontologies : balayage d'une
 * section le long d'un segment 3D, boîtes et cylindres orientés, fusion, volume d'un maillage fermé, emprise en plan.
 * Les ontologies (structure, timber, sheetmetal) l'utilisent ; aucune ne l'étend pour une autre.
 */
import type { Point2 } from "./unites.js";
import { trianguler } from "./projection/maillage.js";

export interface MaillageBrut { positions: number[]; indices: number[] }
export type V3 = [number, number, number];
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norme3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const unit3 = (a: V3): V3 => { const n = norme3(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

/** Repère local d'un élément : u le long de l'axe, n horizontal perpendiculaire, w « vers le haut » de la section (tourné de `rotationDeg`). */
export function repereElement(a: V3, b: V3, rotationDeg = 0): { u: V3; n: V3; w: V3; L: number } {
  const d = sub3(b, a);
  const L = norme3(d);
  const u = unit3(d);
  // n : horizontal perpendiculaire à u ; pour un élément vertical, n = x.
  let n: V3 = Math.hypot(u[0], u[1]) < 1e-9 ? [1, 0, 0] : unit3([-u[1], u[0], 0]);
  let w = unit3(cross3(u, n));
  if (w[2] < 0) { w = [-w[0], -w[1], -w[2]]; n = [-n[0], -n[1], -n[2]]; }
  if (rotationDeg) {
    const r = (rotationDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    const n2: V3 = [n[0] * c + w[0] * s, n[1] * c + w[1] * s, n[2] * c + w[2] * s];
    const w2: V3 = [-n[0] * s + w[0] * c, -n[1] * s + w[1] * c, -n[2] * s + w[2] * c];
    n = n2; w = w2;
  }
  return { u, n, w, L };
}

/** Balayage d'un contour (avec trous) exprimé en [y, z] locaux le long de a → b. */
export function balayer(contour: readonly [number, number][], trous: readonly (readonly [number, number][])[], a: V3, b: V3, rotationDeg = 0): MaillageBrut {
  const { u, n, w, L } = repereElement(a, b, rotationDeg);
  const positions: number[] = [];
  const indices: number[] = [];
  if (L < 1e-9 || contour.length < 3) return { positions, indices };
  const point = (s: number, y: number, z: number): V3 => [a[0] + u[0] * s + n[0] * y + w[0] * z, a[1] + u[1] * s + n[1] * y + w[1] * z, a[2] + u[2] * s + n[2] * y + w[2] * z];
  // Contour en sens direct, trous en sens indirect : les faces latérales tournent alors vers l'extérieur de la matière.
  const aire2 = (an: readonly [number, number][]) => an.reduce((acc, [x, y], i) => { const [p, q] = an[(i + 1) % an.length]!; return acc + x * q - p * y; }, 0);
  const anneaux = [aire2(contour) < 0 ? [...contour].reverse() : contour, ...trous.map((t) => (aire2(t) > 0 ? [...t].reverse() : t))];
  const base: number[] = [];
  for (const an of anneaux) {
    base.push(positions.length / 3);
    for (const [y, z] of an) positions.push(...point(0, y, z));
    for (const [y, z] of an) positions.push(...point(L, y, z));
  }
  // Faces latérales (un quad par arête, pour chaque anneau).
  anneaux.forEach((an, k) => {
    const b0 = base[k]!, m = an.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const p0 = b0 + i, p1 = b0 + j, q0 = b0 + m + i, q1 = b0 + m + j;
      void k;
      indices.push(p0, q1, q0, p0, p1, q1);
    }
  });
  // Faces d'extrémité : triangulation du contour avec trous (indices dans l'ordre contour puis trous).
  const vecs = anneaux.map((an) => an.map(([x, y]) => ({ x, y })));
  const tri = trianguler(vecs[0]!, vecs.slice(1));
  const offsets: number[] = [];
  let acc = 0;
  for (const an of anneaux) { offsets.push(acc); acc += an.length; }
  const global = (i: number, bout: 0 | 1): number => {
    let k = anneaux.length - 1;
    while (k > 0 && i < offsets[k]!) k--;
    return base[k]! + (i - offsets[k]!) + (bout ? anneaux[k]!.length : 0);
  };
  for (let t = 0; t < tri.length; t += 3) {
    const [i0, i1, i2] = [tri[t]!, tri[t + 1]!, tri[t + 2]!];
    indices.push(global(i0, 0), global(i2, 0), global(i1, 0));
    indices.push(global(i0, 1), global(i1, 1), global(i2, 1));
  }
  return { positions, indices };
}

/** Boîte orientée : centre, repère (u, n, w), demi-dimensions. */
export function boiteOrientee(centre: V3, u: V3, n: V3, w: V3, du: number, dn: number, dw: number): MaillageBrut {
  const contour: [number, number][] = [[-dn, -dw], [dn, -dw], [dn, dw], [-dn, dw]];
  const a: V3 = [centre[0] - u[0] * du, centre[1] - u[1] * du, centre[2] - u[2] * du];
  const b: V3 = [centre[0] + u[0] * du, centre[1] + u[1] * du, centre[2] + u[2] * du];
  return balayerRepere(contour, a, b, n, w);
}

/** Balayage avec repère de section imposé (n, w) — pour les boîtes dont l'orientation n'est pas « horizontale ». */
function balayerRepere(contour: readonly [number, number][], a: V3, b: V3, n: V3, w: V3): MaillageBrut {
  const u = unit3(sub3(b, a));
  const L = norme3(sub3(b, a));
  const positions: number[] = [];
  const indices: number[] = [];
  const m = contour.length;
  const point = (s: number, y: number, z: number): V3 => [a[0] + u[0] * s + n[0] * y + w[0] * z, a[1] + u[1] * s + n[1] * y + w[1] * z, a[2] + u[2] * s + n[2] * y + w[2] * z];
  for (const [y, z] of contour) positions.push(...point(0, y, z));
  for (const [y, z] of contour) positions.push(...point(L, y, z));
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; indices.push(i, m + j, m + i, i, j, m + j); }
  for (let i = 1; i + 1 < m; i++) { indices.push(0, i + 1, i); indices.push(m, m + i, m + i + 1); }
  return { positions, indices };
}

/** Cylindre d'axe a → b, rayon r (16 facettes). */
export function cylindre(a: V3, b: V3, r: number, facettes = 16): MaillageBrut {
  const contour: [number, number][] = Array.from({ length: facettes }, (_, k) => [r * Math.cos((2 * Math.PI * k) / facettes), r * Math.sin((2 * Math.PI * k) / facettes)]);
  return balayer(contour, [], a, b);
}

export function fusionner(...ms: MaillageBrut[]): MaillageBrut {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const m of ms) {
    const base = positions.length / 3;
    positions.push(...m.positions);
    for (const i of m.indices) indices.push(base + i);
  }
  return { positions, indices };
}

/** Volume d'un maillage fermé (théorème de la divergence), m³. */
export function volumeMaillage(m: { positions: readonly number[]; indices: readonly number[] }): number {
  let v = 0;
  const P = m.positions;
  for (let k = 0; k < m.indices.length; k += 3) {
    const i = m.indices[k]! * 3, j = m.indices[k + 1]! * 3, l = m.indices[k + 2]! * 3;
    const ax = P[i]!, ay = P[i + 1]!, az = P[i + 2]!;
    const bx = P[j]!, by = P[j + 1]!, bz = P[j + 2]!;
    const cx = P[l]!, cy = P[l + 1]!, cz = P[l + 2]!;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v) / 6;
}

/** Emprise en plan d'un maillage (enveloppe convexe). */
export function empriseXY(m: MaillageBrut): Point2[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < m.positions.length; i += 3) pts.push({ x: m.positions[i]!, y: m.positions[i + 1]! });
  if (pts.length < 3) return pts.map((q) => ({ ...q, frame: "local", unit: "m" }));
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const bas: typeof pts = [];
  for (const q of pts) { while (bas.length >= 2 && cr(bas[bas.length - 2]!, bas[bas.length - 1]!, q) <= 0) bas.pop(); bas.push(q); }
  const haut: typeof pts = [];
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]!; while (haut.length >= 2 && cr(haut[haut.length - 2]!, haut[haut.length - 1]!, q) <= 0) haut.pop(); haut.push(q); }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)].map((q) => ({ x: Math.round(q.x * 1e6) / 1e6, y: Math.round(q.y * 1e6) / 1e6, frame: "local" as const, unit: "m" as const }));
}
