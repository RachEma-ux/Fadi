/**
 * Solveur de contraintes d'assemblage 3D (P2-2, D-178) — code produit issu du banc P2-0 (`scripts/bench/solveur-bench.mjs`) :
 * Gauss-Newton amorti (Levenberg-Marquardt) sur les équations de contrainte, jacobienne par différences finies, rang
 * de la jacobienne (élimination de Gauss à pivot partiel) pour diagnostiquer sous-contraint / redondant / incompatible.
 * Pose rigide d'une pièce = translation (3) + rotation vectorielle (3, Rodrigues) ; une pièce fixe n'a pas d'inconnue.
 * Borné : 100 itérations, tolérance 5 µm (comme le solveur 2D, D-051), petites matrices (< 120 inconnues attendues).
 * Leçon du banc : un angle de 0° ou 180° écrit en produit scalaire a un gradient nul à la solution ; une liaison
 * « parallèle » est donc toujours écrite en produit vectoriel (`parallele`), jamais en `angle` 0°.
 */
export type V3 = [number, number, number];
export interface PoseRigide { t: V3; w: V3 }

export interface PieceSolveur { id: string; fixe: boolean; pose: PoseRigide }

export type ContrainteSolveur =
  | { type: "coincidence"; a: string; b: string; pa: V3; pb: V3 }
  | { type: "distance"; a: string; b: string; pa: V3; pb: V3; d: number }
  | { type: "parallele"; a: string; b: string; da: V3; db: V3 }
  | { type: "angle"; a: string; b: string; da: V3; db: V3; deg: number }
  | { type: "concentrique"; a: string; b: string; pa: V3; da: V3; pb: V3; db: V3 }
  | { type: "plan"; a: string; b: string; pa: V3; da: V3; pb: V3 }
  /** Décalage signé : (pb − pa) · da = d (point de B à la distance d du plan (pa, da) de A, dans le sens de da). */
  | { type: "decalage"; a: string; b: string; pa: V3; da: V3; pb: V3; d: number };

export type Diagnostic = "bien contraint" | "résolu, sous-contraint" | "résolu, redondant (compatible)" | "résolu, sous-contraint et redondant" | "sur-contraint incompatible" | "non convergé";

export interface ResultatSolveur {
  poses: Record<string, PoseRigide>;
  diagnostic: Diagnostic;
  inconnues: number;
  equations: number;
  rang: number;
  ddlRestants: number;
  redondantes: number;
  iterations: number;
  residu: number;
}

export const TOLERANCE_SOLVEUR = 5e-6;
export const ITERATIONS_MAX = 100;

export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const norme = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const normalise3 = (a: V3): V3 => { const n = norme(a); return n < 1e-15 ? [0, 0, 0] : scl(a, 1 / n); };

/** Rotation de Rodrigues : angle |w| autour de w / |w|. */
export function rotation(w: V3, p: V3): V3 {
  const th = norme(w);
  if (th < 1e-12) return p;
  const k = scl(w, 1 / th), c = Math.cos(th), s = Math.sin(th);
  return add(add(scl(p, c), scl(cross(k, p), s)), scl(k, dot(k, p) * (1 - c)));
}
export const versMonde = (pose: PoseRigide, p: V3): V3 => add(rotation(pose.w, p), pose.t);
export const directionMonde = (pose: PoseRigide, d: V3): V3 => rotation(pose.w, d);

function residus(x: number[], pieces: Map<string, { fixe: boolean; i: number; pose: PoseRigide }>, contraintes: readonly ContrainteSolveur[]): number[] {
  const r: number[] = [];
  const poseDe = (id: string): PoseRigide => {
    const p = pieces.get(id)!;
    return p.fixe ? p.pose : { t: [x[p.i]!, x[p.i + 1]!, x[p.i + 2]!], w: [x[p.i + 3]!, x[p.i + 4]!, x[p.i + 5]!] };
  };
  for (const c of contraintes) {
    const A = poseDe(c.a), B = poseDe(c.b);
    switch (c.type) {
      case "coincidence": { const d = sub(versMonde(A, c.pa), versMonde(B, c.pb)); r.push(d[0], d[1], d[2]); break; }
      case "distance": r.push(norme(sub(versMonde(A, c.pa), versMonde(B, c.pb))) - c.d); break;
      case "parallele": { const w = cross(directionMonde(A, c.da), directionMonde(B, c.db)); r.push(w[0], w[1], w[2]); break; }
      case "angle": r.push(dot(directionMonde(A, c.da), directionMonde(B, c.db)) - Math.cos((c.deg * Math.PI) / 180)); break;
      case "concentrique": {
        const u = directionMonde(A, c.da), v = directionMonde(B, c.db);
        const w = cross(u, v); r.push(w[0], w[1], w[2]);
        const e = cross(sub(versMonde(B, c.pb), versMonde(A, c.pa)), u); r.push(e[0], e[1], e[2]);
        break;
      }
      case "plan": r.push(dot(sub(versMonde(B, c.pb), versMonde(A, c.pa)), directionMonde(A, c.da))); break;
      case "decalage": r.push(dot(sub(versMonde(B, c.pb), versMonde(A, c.pa)), directionMonde(A, c.da)) - c.d); break;
    }
  }
  return r;
}

function jacobienne(x: number[], r0: number[], f: (x: number[]) => number[]): Float64Array[] {
  const h = 1e-7;
  const J = r0.map(() => new Float64Array(x.length));
  for (let j = 0; j < x.length; j++) {
    const xp = x.slice(); xp[j]! += h;
    const r = f(xp);
    for (let i = 0; i < r.length; i++) J[i]![j] = (r[i]! - r0[i]!) / h;
  }
  return J;
}

/** Rang numérique (élimination de Gauss, pivot partiel). */
export function rang(M: readonly Float64Array[], tol = 1e-6): number {
  const A = M.map((row) => Array.from(row));
  const m = A.length, n = m ? A[0]!.length : 0;
  let rk = 0;
  for (let c = 0, r = 0; c < n && r < m; c++) {
    let p = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(A[i]![c]!) > Math.abs(A[p]![c]!)) p = i;
    if (Math.abs(A[p]![c]!) < tol) continue;
    [A[r], A[p]] = [A[p]!, A[r]!];
    for (let i = 0; i < m; i++) if (i !== r) { const f = A[i]![c]! / A[r]![c]!; for (let k = c; k < n; k++) A[i]![k]! -= f * A[r]![k]!; }
    r++; rk++;
  }
  return rk;
}

/** (JᵀJ + λI) δ = −Jᵀr par Cholesky ; null si la matrice n'est pas définie positive. */
function resoudreNormal(J: readonly Float64Array[], r: readonly number[], lambda: number): Float64Array | null {
  const n = J[0] ? J[0].length : 0, m = J.length;
  if (!n) return null;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (let i = 0; i < m; i++) for (let a = 0; a < n; a++) { const ji = J[i]![a]!; if (!ji) continue; b[a]! -= ji * r[i]!; for (let c = 0; c < n; c++) A[a]![c]! += ji * J[i]![c]!; }
  for (let a = 0; a < n; a++) A[a]![a]! += lambda;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i]![j]!;
    for (let k = 0; k < j; k++) s -= L[i]![k]! * L[j]![k]!;
    if (i === j) { if (s <= 0) return null; L[i]![i] = Math.sqrt(s); } else L[i]![j] = s / L[j]![j]!;
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]!; for (let k = 0; k < i; k++) s -= L[i]![k]! * y[k]!; y[i] = s / L[i]![i]!; }
  const d = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]!; for (let k = i + 1; k < n; k++) s -= L[k]![i]! * d[k]!; d[i] = s / L[i]![i]!; }
  return d;
}

const nrm = (v: readonly number[]) => Math.sqrt(v.reduce((s, a) => s + a * a, 0));

/** Résout les poses des pièces libres depuis leur pose courante (point de départ) ; les pièces fixes sont le bâti. */
/** Équations indépendantes qu'une contrainte apporte en position générale (un parallélisme en produit vectoriel en écrit 3, de rang 2). */
export const RANG_INTRINSEQUE: Record<ContrainteSolveur["type"], number> = { coincidence: 3, distance: 1, parallele: 2, angle: 1, concentrique: 4, plan: 1, decalage: 1 };

/**
 * Résout ; `equationsIndependantes` : nombre d'équations indépendantes attendu en position générale (somme des rangs des
 * liaisons), pour ne pas compter comme redondance la structure des équations (parallélismes en produit vectoriel) ;
 * absent : somme des rangs intrinsèques des contraintes élémentaires.
 */
export function resoudre(pieces: readonly PieceSolveur[], contraintes: readonly ContrainteSolveur[], equationsIndependantes?: number): ResultatSolveur {
  const table = new Map<string, { fixe: boolean; i: number; pose: PoseRigide }>();
  // Une pièce qu'aucune contrainte ne touche garde sa pose (elle n'entre pas dans les inconnues : rien ne la déplace).
  const touchees = new Set(contraintes.flatMap((c) => [c.a, c.b]));
  let n = 0;
  for (const p of pieces) { const fixe = p.fixe || !touchees.has(p.id); table.set(p.id, { fixe, i: fixe ? -1 : n, pose: p.pose }); if (!fixe) n += 6; }
  for (const c of contraintes) for (const id of [c.a, c.b]) if (!table.has(id)) throw new Error(`solveur : pièce inconnue ${id}`);
  let x: number[] = new Array<number>(n).fill(0);
  for (const p of pieces) { const e = table.get(p.id)!; if (e.fixe) continue; x[e.i] = p.pose.t[0]; x[e.i + 1] = p.pose.t[1]; x[e.i + 2] = p.pose.t[2]; x[e.i + 3] = p.pose.w[0]; x[e.i + 4] = p.pose.w[1]; x[e.i + 5] = p.pose.w[2]; }
  const f = (v: number[]) => residus(v, table, contraintes);
  let r = f(x), lambda = 1e-3, iters = 0;
  let J: Float64Array[] | null = null;
  while (iters < ITERATIONS_MAX && nrm(r) > TOLERANCE_SOLVEUR && r.length && n) {
    J = jacobienne(x, r, f);
    const d = resoudreNormal(J, r, lambda);
    if (!d) { lambda *= 10; iters++; continue; }
    const xn = x.map((v, k) => v + d[k]!);
    const rn = f(xn);
    if (nrm(rn) < nrm(r)) { x = xn; r = rn; lambda = Math.max(lambda / 3, 1e-12); } else lambda *= 10;
    iters++;
  }
  J = J ?? jacobienne(x, r, f);
  const rk = r.length && n ? rang(J) : 0;
  const residu = nrm(r);
  // Équations comptées à leur rang intrinsèque : la redondance structurelle d'un parallélisme (3 équations de rang 2)
  // n'est pas un défaut de l'assemblage ; seules les équations indépendantes en trop sont « redondantes ».
  const m = equationsIndependantes ?? contraintes.reduce((t, c) => t + RANG_INTRINSEQUE[c.type], 0);
  const ddl = n - rk, redondantes = Math.max(0, m - rk);
  let diagnostic: Diagnostic;
  if (residu > TOLERANCE_SOLVEUR && redondantes > 0) diagnostic = "sur-contraint incompatible";
  else if (residu > TOLERANCE_SOLVEUR) diagnostic = "non convergé";
  else if (ddl > 0 && redondantes > 0) diagnostic = "résolu, sous-contraint et redondant";
  else if (ddl > 0) diagnostic = "résolu, sous-contraint";
  else if (redondantes > 0) diagnostic = "résolu, redondant (compatible)";
  else diagnostic = "bien contraint";
  const poses: Record<string, PoseRigide> = {};
  const arr = (v: number) => Math.round(v * 1e9) / 1e9;
  for (const p of pieces) {
    const e = table.get(p.id)!;
    poses[p.id] = e.fixe ? p.pose : { t: [arr(x[e.i]!), arr(x[e.i + 1]!), arr(x[e.i + 2]!)], w: [arr(x[e.i + 3]!), arr(x[e.i + 4]!), arr(x[e.i + 5]!)] };
  }
  return { poses, diagnostic, inconnues: n, equations: m, rang: rk, ddlRestants: ddl, redondantes, iterations: iters, residu };
}
