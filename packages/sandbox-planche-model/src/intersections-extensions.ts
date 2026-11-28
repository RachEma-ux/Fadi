/**
 * Protocole 1.7 (cas 3, lot 5, géométrie placée et contrôles) : intersection face contre face, pour les contrôles de
 * collision et de traversée (réseaux, structure, baies). Logique pure, sans React ni DOM.
 *
 * Deux faces planes se traversent quand chacune a des sommets strictement des deux côtés du plan de l'autre (au-delà de
 * `TOL_TRAVERSEE`) : deux faces qui se touchent (posées l'une sur l'autre, bord contre face) ou coplanaires ne sont pas
 * une traversée. Le segment rendu est la partie de la droite commune aux deux plans qui est à l'intérieur des deux faces
 * (trous compris, règle pair-impair).
 */
import type { Id } from "./geometrie-libre.js";
import { type Vec3, add, cross, dot, len, scale, sub } from "./vecteur.js";

/** Distance au plan en deçà de laquelle un sommet est « sur » le plan (m). */
export const TOL_TRAVERSEE = 1e-6;

export interface FacePlacee {
  readonly id: Id;
  readonly chemin: readonly Id[];
  readonly exterieur: readonly Vec3[];
  readonly trous: readonly (readonly Vec3[])[];
  readonly normale: Vec3;
}

export type Segment3 = readonly [Vec3, Vec3];

interface Preparee {
  readonly f: FacePlacee;
  readonly n: Vec3;
  readonly d: number;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly contours: readonly (readonly Vec3[])[];
}

const preparer = (f: FacePlacee): Preparee | null => {
  const l = len(f.normale);
  const p0 = f.exterieur[0];
  if (l < 1e-12 || !p0 || f.exterieur.length < 3) return null;
  const n = scale(f.normale, 1 / l);
  const tous = [f.exterieur, ...f.trous].flat();
  const min = { x: Math.min(...tous.map((p) => p.x)), y: Math.min(...tous.map((p) => p.y)), z: Math.min(...tous.map((p) => p.z)) };
  const max = { x: Math.max(...tous.map((p) => p.x)), y: Math.max(...tous.map((p) => p.y)), z: Math.max(...tous.map((p) => p.z)) };
  return { f, n, d: dot(n, p0), min, max, contours: [f.exterieur, ...f.trous] };
};

const recouvrent = (a: Preparee, b: Preparee): boolean =>
  a.min.x <= b.max.x + TOL_TRAVERSEE && b.min.x <= a.max.x + TOL_TRAVERSEE && a.min.y <= b.max.y + TOL_TRAVERSEE && b.min.y <= a.max.y + TOL_TRAVERSEE && a.min.z <= b.max.z + TOL_TRAVERSEE && b.min.z <= a.max.z + TOL_TRAVERSEE;

/** Les sommets de `a` sont-ils strictement des deux côtés du plan de `b` ? */
const traverse = (a: Preparee, b: Preparee): boolean => {
  let dessus = false;
  let dessous = false;
  for (const p of a.f.exterieur) {
    const s = dot(b.n, p) - b.d;
    if (s > TOL_TRAVERSEE) dessus = true;
    else if (s < -TOL_TRAVERSEE) dessous = true;
    if (dessus && dessous) return true;
  }
  return false;
};

/**
 * Intervalles (paramètres le long de la droite `X0 + t·u`) où la face `a` est coupée par le plan de `b` : chaque arête
 * de `a` (contour et trous) qui franchit ce plan donne un paramètre ; pris deux à deux après tri (pair-impair).
 */
const intervalles = (a: Preparee, b: Preparee, X0: Vec3, u: Vec3): [number, number][] => {
  const ts: number[] = [];
  for (const c of a.contours) {
    for (let i = 0; i < c.length; i++) {
      const p = c[i] as Vec3;
      const q = c[(i + 1) % c.length] as Vec3;
      const sp = dot(b.n, p) - b.d;
      const sq = dot(b.n, q) - b.d;
      // Règle demi-ouverte : un sommet exactement sur le plan compte du côté positif (pas de double comptage).
      if (sp >= 0 === sq >= 0) continue;
      const X = add(p, scale(sub(q, p), sp / (sp - sq)));
      ts.push(dot(sub(X, X0), u));
    }
  }
  ts.sort((x, y) => x - y);
  const r: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) r.push([ts[i] as number, ts[i + 1] as number]);
  return r;
};

/** Segments où deux faces se traversent ; vide quand elles se touchent seulement, sont parallèles ou disjointes. */
export function traverseeFaces(fa: FacePlacee, fb: FacePlacee): Segment3[] {
  const a = preparer(fa);
  const b = preparer(fb);
  if (!a || !b) return [];
  return traverseePreparees(a, b);
}

function traverseePreparees(a: Preparee, b: Preparee): Segment3[] {
  if (!recouvrent(a, b)) return [];
  const dir = cross(a.n, b.n);
  const l2 = dot(dir, dir);
  if (l2 < 1e-18) return [];
  if (!traverse(a, b) || !traverse(b, a)) return [];
  // Point de la droite commune : X0 = (d1 (n2 × dir) + d2 (dir × n1)) / |dir|².
  const X0 = scale(add(scale(cross(b.n, dir), a.d), scale(cross(dir, a.n), b.d)), 1 / l2);
  const u = scale(dir, 1 / Math.sqrt(l2));
  const ia = intervalles(a, b, X0, u);
  const ib = intervalles(b, a, X0, u);
  const r: Segment3[] = [];
  for (const [a0, a1] of ia)
    for (const [b0, b1] of ib) {
      const t0 = Math.max(a0, b0);
      const t1 = Math.min(a1, b1);
      if (t1 - t0 > TOL_TRAVERSEE) r.push([add(X0, scale(u, t0)), add(X0, scale(u, t1))]);
    }
  return r;
}

export interface Collision {
  readonly a: Id;
  readonly b: Id;
  /** Longueur totale des segments de traversée (m). */
  readonly longueur: number;
  /** Segments, bornés à `MAX_SEGMENTS_COLLISION` par paire d'objets. */
  readonly segments: readonly Segment3[];
  /** Paires de faces qui se traversent (bornées comme les segments). */
  readonly faces: readonly (readonly [Id, Id])[];
}

export const MAX_SEGMENTS_COLLISION = 200;
/** Paires de faces examinées au plus (après le tri par boîtes englobantes) : au-delà, le résultat est dit tronqué. */
export const MAX_PAIRES_FACES = 2_000_000;

/**
 * Collisions entre objets : `groupeA(face)` / `groupeB(face)` rendent l'objet listé dont la face fait partie (ou `null`).
 * Sans liste B (`groupeB` absent), les objets de A sont confrontés entre eux, chaque paire une seule fois. Une face
 * n'est jamais confrontée à une face du même objet.
 */
export function collisionsEntreObjets(
  faces: readonly FacePlacee[],
  groupeA: (f: FacePlacee) => Id | null,
  groupeB?: (f: FacePlacee) => Id | null,
): { collisions: Collision[]; tronque: boolean } {
  const A: { p: Preparee; o: Id }[] = [];
  const B: { p: Preparee; o: Id }[] = [];
  for (const f of faces) {
    const p = preparer(f);
    if (!p) continue;
    const oa = groupeA(f);
    if (oa !== null) A.push({ p, o: oa });
    const ob = groupeB ? groupeB(f) : oa;
    if (ob !== null) B.push({ p, o: ob });
  }
  const parPaire = new Map<string, { a: Id; b: Id; longueur: number; segments: Segment3[]; faces: [Id, Id][] }>();
  let paires = 0;
  let tronque = false;
  // Tri par x minimal : seules les faces dont les intervalles en x se recouvrent sont confrontées.
  B.sort((x, y) => x.p.min.x - y.p.min.x);
  const minsB = B.map((x) => x.p.min.x);
  for (const fa of A) {
    // Première face de B dont min.x peut recouvrir fa (recherche dichotomique sur min.x ≤ fa.max.x).
    let fin = minsB.length;
    let lo = 0;
    let hi = minsB.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((minsB[mid] as number) <= fa.p.max.x + TOL_TRAVERSEE) lo = mid + 1;
      else hi = mid;
    }
    fin = lo;
    for (let j = 0; j < fin; j++) {
      const fb = B[j] as { p: Preparee; o: Id };
      if (fb.o === fa.o) continue;
      if (fb.p.max.x < fa.p.min.x - TOL_TRAVERSEE) continue;
      if (!groupeB && fa.o > fb.o) continue;
      if (++paires > MAX_PAIRES_FACES) {
        tronque = true;
        break;
      }
      const segs = traverseePreparees(fa.p, fb.p);
      if (segs.length === 0) continue;
      const cle = `${fa.o}\u0000${fb.o}`;
      const c = parPaire.get(cle) ?? { a: fa.o, b: fb.o, longueur: 0, segments: [], faces: [] };
      parPaire.set(cle, c);
      for (const s of segs) {
        c.longueur += len(sub(s[1], s[0]));
        if (c.segments.length < MAX_SEGMENTS_COLLISION) c.segments.push(s);
        else tronque = true;
      }
      if (c.faces.length < MAX_SEGMENTS_COLLISION) c.faces.push([fa.p.f.id, fb.p.f.id]);
    }
    if (tronque && paires > MAX_PAIRES_FACES) break;
  }
  return { collisions: [...parPaire.values()].sort((x, y) => y.longueur - x.longueur || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1)), tronque };
}

/** Normale d'un contour plan par la méthode de Newell (unitaire ; nulle si le contour est dégénéré). */
export function normaleNewell(pts: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as Vec3;
    const q = pts[(i + 1) % pts.length] as Vec3;
    x += (p.y - q.y) * (p.z + q.z);
    y += (p.z - q.z) * (p.x + q.x);
    z += (p.x - q.x) * (p.y + q.y);
  }
  const l = Math.hypot(x, y, z);
  return l < 1e-12 ? { x: 0, y: 0, z: 0 } : { x: x / l, y: y / l, z: z / l };
}
