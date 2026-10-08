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

// ---------------------------------------------------------------------------
// P2-6 : triangulation de Delaunay (terrain), subdivision de Loop (surfaces libres), propriétés de masse (inerties)
// ---------------------------------------------------------------------------

/** Triangulation de Delaunay (Bowyer–Watson) d'un semis de points 2D : triangles en indices, orientés en sens direct. */
export function delaunay(points: readonly { x: number; y: number }[]): [number, number, number][] {
  const n = points.length;
  if (n < 3) return [];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const d = Math.max(maxX - minX, maxY - minY, 1e-9) * 20;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const pts = [...points.map((p) => ({ x: p.x, y: p.y })), { x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx, y: cy + d }];
  type Tri = { a: number; b: number; c: number; ccx: number; ccy: number; r2: number };
  const faire = (a: number, b: number, c: number): Tri | null => {
    const A = pts[a]!, B = pts[b]!, C = pts[c]!;
    const D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
    if (Math.abs(D) < 1e-18) return null;
    const ux = ((A.x * A.x + A.y * A.y) * (B.y - C.y) + (B.x * B.x + B.y * B.y) * (C.y - A.y) + (C.x * C.x + C.y * C.y) * (A.y - B.y)) / D;
    const uy = ((A.x * A.x + A.y * A.y) * (C.x - B.x) + (B.x * B.x + B.y * B.y) * (A.x - C.x) + (C.x * C.x + C.y * C.y) * (B.x - A.x)) / D;
    return { a, b, c, ccx: ux, ccy: uy, r2: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
  };
  let tris: Tri[] = [faire(n, n + 1, n + 2)!];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const mauvais = tris.filter((t) => (p.x - t.ccx) ** 2 + (p.y - t.ccy) ** 2 <= t.r2 * (1 + 1e-12));
    const aretes = new Map<string, [number, number]>();
    for (const t of mauvais) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
      const k = u < v ? `${u}|${v}` : `${v}|${u}`;
      if (aretes.has(k)) aretes.delete(k); else aretes.set(k, [u, v]);
    }
    tris = tris.filter((t) => !mauvais.includes(t));
    for (const [u, v] of aretes.values()) { const t = faire(u, v, i); if (t) tris.push(t); }
  }
  const out: [number, number, number][] = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const A = pts[t.a]!, B = pts[t.b]!, C = pts[t.c]!;
    const aire = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    if (Math.abs(aire) < 1e-14) continue;
    out.push(aire > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]);
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
}

/** Faces triangulaires ou quadrangulaires → triangles (un quad = deux triangles sur sa diagonale 0–2). */
export function triangulerFaces(faces: readonly (readonly number[])[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const f of faces) {
    if (f.length < 3) continue;
    for (let k = 1; k + 1 < f.length; k++) out.push([f[0]!, f[k]!, f[k + 1]!]);
  }
  return out;
}

/**
 * Subdivision de Loop d'un maillage triangulaire (DA-03-05) : chaque triangle devient quatre ; sommets lissés (poids de
 * Loop, bord fixé par la règle 1/8–3/4–1/8 sur les arêtes de bord). Pure et déterministe.
 */
export function subdiviserLoop(positions: readonly number[], triangles: readonly (readonly [number, number, number])[], niveaux: number): MaillageBrut {
  let P: V3[] = []; for (let i = 0; i < positions.length; i += 3) P.push([positions[i]!, positions[i + 1]!, positions[i + 2]!]);
  let T: [number, number, number][] = triangles.map((t) => [t[0], t[1], t[2]]);
  for (let it = 0; it < niveaux; it++) {
    const cle = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const opposes = new Map<string, number[]>();
    const voisins = new Map<number, Set<number>>();
    for (const [a, b, c] of T) {
      for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]] as [number, number, number][]) {
        const k = cle(u, v);
        opposes.set(k, [...(opposes.get(k) ?? []), w]);
        if (!voisins.has(u)) voisins.set(u, new Set()); voisins.get(u)!.add(v);
        if (!voisins.has(v)) voisins.set(v, new Set()); voisins.get(v)!.add(u);
      }
    }
    const bord = new Set<number>();
    for (const [k, op] of opposes) if (op.length === 1) { const [u, v] = k.split("|").map(Number) as [number, number]; bord.add(u); bord.add(v); }
    // Sommets existants déplacés.
    const Q: V3[] = P.map((p, i) => {
      const vs = [...(voisins.get(i) ?? [])];
      if (!vs.length) return p;
      if (bord.has(i)) {
        const vb = vs.filter((v) => bord.has(v) && opposes.get(cle(i, v))!.length === 1);
        if (vb.length !== 2) return p;
        const [a, b] = [P[vb[0]!]!, P[vb[1]!]!];
        return [0.75 * p[0] + 0.125 * (a[0] + b[0]), 0.75 * p[1] + 0.125 * (a[1] + b[1]), 0.75 * p[2] + 0.125 * (a[2] + b[2])];
      }
      const k = vs.length;
      const beta = k === 3 ? 3 / 16 : (1 / k) * (5 / 8 - (3 / 8 + 0.25 * Math.cos((2 * Math.PI) / k)) ** 2);
      const s = vs.reduce<V3>((acc, v) => [acc[0] + P[v]![0], acc[1] + P[v]![1], acc[2] + P[v]![2]], [0, 0, 0]);
      return [(1 - k * beta) * p[0] + beta * s[0], (1 - k * beta) * p[1] + beta * s[1], (1 - k * beta) * p[2] + beta * s[2]];
    });
    // Points d'arête.
    const milieu = new Map<string, number>();
    const pointArete = (u: number, v: number): number => {
      const k = cle(u, v);
      const deja = milieu.get(k);
      if (deja !== undefined) return deja;
      const op = opposes.get(k) ?? [];
      const a = P[u]!, b = P[v]!;
      let q: V3;
      if (op.length === 2) { const c = P[op[0]!]!, d = P[op[1]!]!; q = [0.375 * (a[0] + b[0]) + 0.125 * (c[0] + d[0]), 0.375 * (a[1] + b[1]) + 0.125 * (c[1] + d[1]), 0.375 * (a[2] + b[2]) + 0.125 * (c[2] + d[2])]; }
      else q = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      Q.push(q);
      milieu.set(k, Q.length - 1);
      return Q.length - 1;
    };
    const T2: [number, number, number][] = [];
    for (const [a, b, c] of T) {
      const ab = pointArete(a, b), bc = pointArete(b, c), ca = pointArete(c, a);
      T2.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    P = Q; T = T2;
  }
  return { positions: P.flat(), indices: T.flat() };
}

/** Propriétés de masse d'un maillage fermé pour une densité unitaire : volume, centre, tenseur d'inertie au centre (3 × 3, ligne par ligne). */
export function proprietesMasse(m: { positions: readonly number[]; indices: readonly number[] }): { volume: number; centre: V3; inertie: number[] } {
  let V = 0; const C: V3 = [0, 0, 0];
  let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
  const P = (i: number): V3 => [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!];
  for (let k = 0; k < m.indices.length; k += 3) {
    const a = P(m.indices[k]!), b = P(m.indices[k + 1]!), c = P(m.indices[k + 2]!);
    const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    const v = det / 6;
    V += v;
    C[0] += (v * (a[0] + b[0] + c[0])) / 4; C[1] += (v * (a[1] + b[1] + c[1])) / 4; C[2] += (v * (a[2] + b[2] + c[2])) / 4;
    // Intégrales du tétraèdre (origine, a, b, c) pour x², y², z², xy, xz, yz (formules de Tonon / Mirtich).
    const f = (i: number, j: number) => (det / 120) * (a[i]! * (2 * a[j]! + b[j]! + c[j]!) + b[i]! * (a[j]! + 2 * b[j]! + c[j]!) + c[i]! * (a[j]! + b[j]! + 2 * c[j]!));
    const xx = f(0, 0), yy = f(1, 1), zz = f(2, 2), xy = f(0, 1), xz = f(0, 2), yz = f(1, 2);
    Ixx += yy + zz; Iyy += xx + zz; Izz += xx + yy; Ixy -= xy; Ixz -= xz; Iyz -= yz;
  }
  if (Math.abs(V) < 1e-15) return { volume: 0, centre: [0, 0, 0], inertie: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
  const c: V3 = [C[0] / V, C[1] / V, C[2] / V];
  // Transport au centre de masse (densité 1 : masse = volume).
  Ixx -= V * (c[1] * c[1] + c[2] * c[2]); Iyy -= V * (c[0] * c[0] + c[2] * c[2]); Izz -= V * (c[0] * c[0] + c[1] * c[1]);
  Ixy += V * c[0] * c[1]; Ixz += V * c[0] * c[2]; Iyz += V * c[1] * c[2];
  return { volume: V, centre: c, inertie: [Ixx, Ixy, Ixz, Ixy, Iyy, Iyz, Ixz, Iyz, Izz] };
}
