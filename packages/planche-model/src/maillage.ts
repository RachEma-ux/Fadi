/**
 * Maillages triangulés (lot 6) — pur, sans dépendance : triangulation des faces planes polygonales (découpe en
 * oreilles, trous reliés par des ponts), conversion d'un solide (groupe / composant) en maillage monde, et retour
 * d'un maillage triangulé en faces planes polygonales (triangles coplanaires fusionnés, contours reconstitués).
 *
 * Le moteur booléen lui-même (manifold-3d, WASM) n'est pas ici : il est injecté par l'interface sous la forme
 * d'un `AdaptateurBooleens` (voir `outils/machine.ts`), le noyau reste testable sans WASM (cahier §8 lot 6).
 */
import { type Id, type Modele, baseDuPlan, contexte, estSolide, matriceMonde, appliquer, positionsFace, transformerNormale, newell } from "./geometrie-libre.js";
import { type Vec3, EPS, add, cross, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

/** Maillage triangulé : positions aplaties (x y z …), triangles (3 indices par triangle), face d'origine par triangle. */
export interface Maillage {
  readonly positions: readonly number[];
  readonly triangles: readonly number[];
  /** Identifiant de face plane par triangle (même valeur = même face polygonale) ; absent = à déduire des plans. */
  readonly facesParTriangle?: readonly number[];
  /** Matière recto de la face d'origine par identifiant de face (si connue). */
  readonly materiaux?: Readonly<Record<number, string>>;
}

type P2 = { x: number; y: number };

// ————————————————————————————————————————————————————————————— Triangulation

const aire2 = (a: P2, b: P2, c: P2): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function dansTriangle(p: P2, a: P2, b: P2, c: P2): boolean {
  const s1 = aire2(a, b, p);
  const s2 = aire2(b, c, p);
  const s3 = aire2(c, a, p);
  return s1 >= -1e-12 && s2 >= -1e-12 && s3 >= -1e-12;
}

/** Relie un trou au contour (Eberly) : du sommet le plus à droite du trou vers un sommet visible du contour. */
function relierTrou(contour: number[], trou: number[], pts: readonly P2[]): number[] {
  let iM = 0;
  for (let i = 1; i < trou.length; i++) if ((pts[trou[i] as number] as P2).x > (pts[trou[iM] as number] as P2).x) iM = i;
  const M = pts[trou[iM] as number] as P2;
  // Intersection la plus proche du rayon horizontal vers +x avec les arêtes du contour.
  let meilleur: { x: number; i: number } | null = null;
  for (let i = 0; i < contour.length; i++) {
    const a = pts[contour[i] as number] as P2;
    const b = pts[contour[(i + 1) % contour.length] as number] as P2;
    if (a.y > M.y === b.y > M.y) continue;
    const x = a.x + ((M.y - a.y) * (b.x - a.x)) / (b.y - a.y);
    if (x >= M.x - 1e-12 && (!meilleur || x < meilleur.x)) meilleur = { x, i };
  }
  let cible: number;
  if (!meilleur) {
    // Aucune arête à droite (contour dégénéré) : sommet du contour le plus proche.
    cible = 0;
    let d = Infinity;
    contour.forEach((ci, i) => {
      const q = pts[ci] as P2;
      const dd = Math.hypot(q.x - M.x, q.y - M.y);
      if (dd < d) (d = dd), (cible = i);
    });
  } else {
    const i1 = meilleur.i;
    const i2 = (meilleur.i + 1) % contour.length;
    const P = (pts[contour[i1] as number] as P2).x > (pts[contour[i2] as number] as P2).x ? i1 : i2;
    const I: P2 = { x: meilleur.x, y: M.y };
    cible = P;
    // Un sommet réflexe du contour dans le triangle M-I-P : prendre celui d'angle minimal avec l'horizontale.
    let meilleurAngle = Infinity;
    for (let i = 0; i < contour.length; i++) {
      if (i === P) continue;
      const q = pts[contour[i] as number] as P2;
      const prev = pts[contour[(i - 1 + contour.length) % contour.length] as number] as P2;
      const next = pts[contour[(i + 1) % contour.length] as number] as P2;
      const reflexe = aire2(prev, q, next) < 0;
      if (!reflexe) continue;
      if (dansTriangle(q, M, I, pts[contour[P] as number] as P2)) {
        const angle = Math.atan2(Math.abs(q.y - M.y), q.x - M.x);
        if (angle < meilleurAngle) (meilleurAngle = angle), (cible = i);
      }
    }
  }
  // Nouveau contour : contour[0..cible], trou (à partir de iM, bouclé), retour sur trou[iM] et contour[cible].
  const r: number[] = [];
  for (let i = 0; i <= cible; i++) r.push(contour[i] as number);
  for (let k = 0; k <= trou.length; k++) r.push(trou[(iM + k) % trou.length] as number);
  for (let i = cible; i < contour.length; i++) r.push(contour[i] as number);
  return r;
}

function signeContour(idx: readonly number[], pts: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < idx.length; i++) {
    const a = pts[idx[i] as number] as P2;
    const b = pts[idx[(i + 1) % idx.length] as number] as P2;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/**
 * Triangule un polygone plan (contour extérieur + trous, points 3D) : retourne des triplets d'indices dans la
 * liste concaténée `[...exterieur, ...trous[0], …]`. Découpe en oreilles après liaison des trous par des ponts.
 */
export function triangulerFace(exterieur: readonly Vec3[], trous: readonly (readonly Vec3[])[], normale?: Vec3): number[] {
  const n = normalize(normale ?? newell(exterieur));
  const { u, w } = baseDuPlan(n);
  const tous: Vec3[] = [...exterieur, ...trous.flat()];
  const pts: P2[] = tous.map((p) => ({ x: dot(p, u), y: dot(p, w) }));
  let contour = exterieur.map((_, i) => i);
  if (signeContour(contour, pts) < 0) contour.reverse();
  let base = exterieur.length;
  const trousIdx: number[][] = trous.map((t) => {
    const idx = t.map((_, i) => base + i);
    base += t.length;
    if (signeContour(idx, pts) > 0) idx.reverse();
    return idx;
  });
  trousIdx.sort((a, b) => Math.max(...b.map((i) => (pts[i] as P2).x)) - Math.max(...a.map((i) => (pts[i] as P2).x)));
  for (const t of trousIdx) contour = relierTrou(contour, t, pts);
  // Découpe en oreilles.
  const resultat: number[] = [];
  const reste = [...contour];
  let garde = 0;
  while (reste.length > 3 && garde < 100000) {
    garde++;
    let coupe = false;
    for (let i = 0; i < reste.length; i++) {
      const ia = reste[(i - 1 + reste.length) % reste.length] as number;
      const ib = reste[i] as number;
      const ic = reste[(i + 1) % reste.length] as number;
      const a = pts[ia] as P2;
      const b = pts[ib] as P2;
      const c = pts[ic] as P2;
      const s = aire2(a, b, c);
      if (s <= 1e-14) continue; // réflexe ou plat
      let libre = true;
      for (const j of reste) {
        if (j === ia || j === ib || j === ic) continue;
        const q = pts[j] as P2;
        if ((q.x === a.x && q.y === a.y) || (q.x === b.x && q.y === b.y) || (q.x === c.x && q.y === c.y)) continue;
        if (dansTriangle(q, a, b, c)) {
          libre = false;
          break;
        }
      }
      if (!libre) continue;
      resultat.push(ia, ib, ic);
      reste.splice(i, 1);
      coupe = true;
      break;
    }
    if (!coupe) {
      // Aucune oreille (contour dégénéré) : retirer un sommet plat, sinon éventail de secours.
      const plat = reste.findIndex((_, i) => Math.abs(aire2(pts[reste[(i - 1 + reste.length) % reste.length] as number] as P2, pts[reste[i] as number] as P2, pts[reste[(i + 1) % reste.length] as number] as P2)) <= 1e-14);
      if (plat >= 0) reste.splice(plat, 1);
      else {
        for (let i = 1; i + 1 < reste.length; i++) resultat.push(reste[0] as number, reste[i] as number, reste[i + 1] as number);
        reste.length = 0;
      }
    }
  }
  if (reste.length === 3) resultat.push(reste[0] as number, reste[1] as number, reste[2] as number);
  return resultat;
}

// ————————————————————————————————————————————————————————————— Solide → maillage

export class PasUnSolide extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasUnSolide";
  }
}

/** Motif pour lequel une occurrence n'est pas un solide (Solid Inspector minimal), ou null si elle l'est. */
export function motifNonSolide(m: Modele, occurrence: Id): string | null {
  const c = contexte(m, occurrence);
  if (Object.keys(c.faces).length === 0) return "l'objet ne contient aucune face";
  if (Object.keys(c.occurrences).length > 0) return "l'objet contient d'autres groupes ou composants";
  const usages = new Map<string, number>();
  const cle = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const f of Object.values(c.faces)) {
    for (const b of [f.exterieur, ...f.trous]) {
      for (let i = 0; i < b.length; i++) usages.set(cle(b[i] as Id, b[(i + 1) % b.length] as Id), (usages.get(cle(b[i] as Id, b[(i + 1) % b.length] as Id)) ?? 0) + 1);
    }
  }
  const mauvaises = Object.values(c.aretes).filter((a) => usages.get(cle(a.a, a.b)) !== 2);
  if (mauvaises.length) return `${mauvaises.length} arête(s) ne bordent pas exactement deux faces (${mauvaises.slice(0, 3).map((a) => a.id).join(", ")})`;
  return null;
}

/** Maillage monde (triangulé, orienté vers l'extérieur) d'un groupe ou composant solide. */
export function maillageDuSolide(m: Modele, occurrence: Id): Maillage {
  const motif = motifNonSolide(m, occurrence);
  if (motif || !estSolide(m, occurrence)) throw new PasUnSolide(`L'objet ${occurrence} n'est pas un solide : ${motif ?? "arêtes non bordées par deux faces"}.`);
  const c = contexte(m, occurrence);
  const M = matriceMonde(m, occurrence);
  const positions: number[] = [];
  const triangles: number[] = [];
  const facesParTriangle: number[] = [];
  const materiaux: Record<number, string> = {};
  // Orientation : le volume signé des faces (normale × aire × distance) doit être positif vers l'extérieur.
  let volumeSigne = 0;
  const faces = Object.values(c.faces);
  const positionsMonde = faces.map((f) => {
    const p = positionsFace(c, f);
    const T = (q: Vec3): Vec3 => (M ? appliquer(M, q) : q);
    return { f, exterieur: p.exterieur.map(T), trous: p.trous.map((b) => b.map(T)), normale: normalize(M ? transformerNormale(M, f.normale) : f.normale) };
  });
  for (const pf of positionsMonde) {
    const p0 = pf.exterieur[0] as Vec3;
    let a = 0;
    const n = pf.normale;
    const boucles = [pf.exterieur, ...pf.trous];
    boucles.forEach((b, k) => {
      let s = v3(0, 0, 0);
      for (let i = 0; i < b.length; i++) s = add(s, cross(b[i] as Vec3, b[(i + 1) % b.length] as Vec3));
      a += (k === 0 ? 1 : -1) * Math.abs(dot(s, n)) / 2;
    });
    volumeSigne += (dot(n, p0) * a) / 3;
  }
  const inverser = volumeSigne < 0;
  positionsMonde.forEach((pf, k) => {
    const tous = [...pf.exterieur, ...pf.trous.flat()];
    const base = positions.length / 3;
    for (const p of tous) positions.push(p.x, p.y, p.z);
    const tri = triangulerFace(pf.exterieur, pf.trous, pf.normale);
    // Orientation de chaque triangle selon la normale de la face (vers l'extérieur).
    for (let i = 0; i < tri.length; i += 3) {
      const [ia, ib, ic] = [tri[i] as number, tri[i + 1] as number, tri[i + 2] as number];
      const A = tous[ia] as Vec3;
      const B = tous[ib] as Vec3;
      const C = tous[ic] as Vec3;
      const nt = cross(sub(B, A), sub(C, A));
      const memeSens = dot(nt, pf.normale) >= 0;
      const sortant = inverser ? !memeSens : memeSens;
      if (sortant) triangles.push(base + ia, base + ib, base + ic);
      else triangles.push(base + ia, base + ic, base + ib);
      facesParTriangle.push(k);
    }
    if (pf.f.materiauRecto) materiaux[k] = pf.f.materiauRecto;
  });
  return { positions, triangles, facesParTriangle, materiaux };
}

// ————————————————————————————————————————————————————————————— Maillage → faces polygonales

type Tri = readonly [number, number, number];

const planCle = (n: Vec3, d: number, tol: number): string => {
  const q = (x: number): number => Math.round(x / tol);
  return `${q(n.x)}|${q(n.y)}|${q(n.z)}|${q(d)}`;
};

/**
 * Faces planes polygonales d'un maillage triangulé : les triangles sont regroupés par face d'origine (si fournie)
 * ou par plan, puis les arêtes intérieures (partagées deux fois dans le groupe) sont retirées et les contours
 * reconstitués ; le contour d'aire la plus grande est l'extérieur, les autres sont des trous.
 * Les groupes par plan sont encore scindés par connexité, pour ne pas fusionner deux faces coplanaires disjointes.
 */
export function facesDuMaillage(mesh: Maillage, tolerance = 1e-6): { faces: Vec3[][][]; materiaux: (string | undefined)[] } {
  const P = (i: number): Vec3 => v3(mesh.positions[3 * i] as number, mesh.positions[3 * i + 1] as number, mesh.positions[3 * i + 2] as number);
  const tris: Tri[] = [];
  for (let i = 0; i + 2 < mesh.triangles.length; i += 3) tris.push([mesh.triangles[i] as number, mesh.triangles[i + 1] as number, mesh.triangles[i + 2] as number]);
  // 1. Groupes de triangles : face d'origine, sinon plan.
  const groupes = new Map<string, number[]>();
  const normales = new Map<string, Vec3>();
  tris.forEach((t, i) => {
    const A = P(t[0]);
    const n0 = cross(sub(P(t[1]), A), sub(P(t[2]), A));
    if (len(n0) < EPS) return;
    const n = normalize(n0);
    const k = mesh.facesParTriangle ? `f${mesh.facesParTriangle[i]}` : planCle(n, dot(n, A), tolerance * 10);
    const g = groupes.get(k);
    if (g) g.push(i);
    else (groupes.set(k, [i]), normales.set(k, n));
  });
  // 2. Connexité par arêtes partagées à l'intérieur d'un groupe.
  const composantes: { tris: number[]; n: Vec3; cle: string }[] = [];
  for (const [k, idx] of groupes) {
    const parArete = new Map<string, number[]>();
    for (const i of idx) {
      const t = tris[i] as Tri;
      for (let e = 0; e < 3; e++) {
        const a = t[e] as number;
        const b = t[(e + 1) % 3] as number;
        const ck = a < b ? `${a}|${b}` : `${b}|${a}`;
        const l = parArete.get(ck);
        if (l) l.push(i);
        else parArete.set(ck, [i]);
      }
    }
    const vus = new Set<number>();
    for (const i0 of idx) {
      if (vus.has(i0)) continue;
      const comp: number[] = [];
      const pile = [i0];
      vus.add(i0);
      while (pile.length) {
        const i = pile.pop() as number;
        comp.push(i);
        const t = tris[i] as Tri;
        for (let e = 0; e < 3; e++) {
          const a = t[e] as number;
          const b = t[(e + 1) % 3] as number;
          const ck = a < b ? `${a}|${b}` : `${b}|${a}`;
          for (const j of parArete.get(ck) ?? []) if (!vus.has(j)) (vus.add(j), pile.push(j));
        }
      }
      composantes.push({ tris: comp, n: normales.get(k) as Vec3, cle: k });
    }
  }
  // 3. Contours de chaque composante : arêtes orientées utilisées une seule fois.
  const faces: Vec3[][][] = [];
  const materiaux: (string | undefined)[] = [];
  for (const comp of composantes) {
    const orientees = new Map<string, [number, number]>();
    const compte = new Map<string, number>();
    for (const i of comp.tris) {
      const t = tris[i] as Tri;
      for (let e = 0; e < 3; e++) {
        const a = t[e] as number;
        const b = t[(e + 1) % 3] as number;
        const ck = a < b ? `${a}|${b}` : `${b}|${a}`;
        compte.set(ck, (compte.get(ck) ?? 0) + 1);
        orientees.set(`${a}>${b}`, [a, b]);
      }
    }
    const suivant = new Map<number, number[]>();
    for (const [a, b] of orientees.values()) {
      const ck = a < b ? `${a}|${b}` : `${b}|${a}`;
      if ((compte.get(ck) ?? 0) !== 1) continue;
      const l = suivant.get(a);
      if (l) l.push(b);
      else suivant.set(a, [b]);
    }
    const boucles: number[][] = [];
    const restants = new Map(suivant);
    while (restants.size) {
      const [depart, cibles] = restants.entries().next().value as [number, number[]];
      const boucle = [depart];
      let courant = cibles.shift() as number;
      if (cibles.length === 0) restants.delete(depart);
      let garde = 0;
      while (courant !== depart && garde++ < 100000) {
        boucle.push(courant);
        const l = restants.get(courant);
        if (!l || l.length === 0) break;
        const prochain = l.shift() as number;
        if (l.length === 0) restants.delete(courant);
        courant = prochain;
      }
      if (boucle.length >= 3) boucles.push(boucle);
    }
    if (boucles.length === 0) continue;
    // Sommets alignés : retirés (les triangles laissent des points intermédiaires sur les arêtes droites).
    const nettoyer = (b: number[]): Vec3[] => {
      const pts = b.map(P);
      const r: Vec3[] = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[(i - 1 + pts.length) % pts.length] as Vec3;
        const cur = pts[i] as Vec3;
        const next = pts[(i + 1) % pts.length] as Vec3;
        if (len(cross(sub(cur, prev), sub(next, cur))) <= tolerance * Math.max(1, len(sub(next, prev)))) continue;
        r.push(cur);
      }
      return r.length >= 3 ? r : pts;
    };
    const aire = (b: Vec3[]): number => {
      let s = v3(0, 0, 0);
      for (let i = 0; i < b.length; i++) s = add(s, cross(b[i] as Vec3, b[(i + 1) % b.length] as Vec3));
      return Math.abs(dot(s, comp.n)) / 2;
    };
    const nettoyees = boucles.map(nettoyer).sort((a, b) => aire(b) - aire(a));
    faces.push(nettoyees);
    const idFace = comp.cle.startsWith("f") ? Number(comp.cle.slice(1)) : NaN;
    materiaux.push(Number.isFinite(idFace) ? mesh.materiaux?.[idFace] : undefined);
  }
  return { faces, materiaux };
}

/** Volume signé d'un maillage fermé (m³), positif si orienté vers l'extérieur. */
export function volumeDuMaillage(mesh: Maillage): number {
  let v = 0;
  for (let i = 0; i + 2 < mesh.triangles.length; i += 3) {
    const a = mesh.triangles[i] as number;
    const b = mesh.triangles[i + 1] as number;
    const c = mesh.triangles[i + 2] as number;
    const A = v3(mesh.positions[3 * a] as number, mesh.positions[3 * a + 1] as number, mesh.positions[3 * a + 2] as number);
    const B = v3(mesh.positions[3 * b] as number, mesh.positions[3 * b + 1] as number, mesh.positions[3 * b + 2] as number);
    const C = v3(mesh.positions[3 * c] as number, mesh.positions[3 * c + 1] as number, mesh.positions[3 * c + 2] as number);
    v += dot(A, cross(B, C)) / 6;
  }
  return v;
}

export const translaterMaillage = (mesh: Maillage, d: Vec3): Maillage => ({
  ...mesh,
  positions: mesh.positions.map((x, i) => x + (i % 3 === 0 ? d.x : i % 3 === 1 ? d.y : d.z)),
});

export const scaleVec = scale;
