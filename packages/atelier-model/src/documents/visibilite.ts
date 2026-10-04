/**
 * Projection 2D avec gestion de la visibilité (fiche DA-01-12 : équivalent borné de « Make2D », pas un moteur de
 * lignes cachées général). Entrée : les maillages purs de `projection/maillage.ts`. Sortie : la matière coupée
 * (contours fermés et pochés) et les arêtes vues au-delà, découpées exactement là où une face plus proche les
 * recouvre — calcul analytique par intervalles le long de chaque arête, sans tampon de profondeur ni
 * échantillonnage : mêmes entrées, mêmes segments.
 *
 * Caméra orthographique : `regard` (vers où l'on regarde), `droite` et `haut` (axes de la feuille). La
 * profondeur d'un point est sa distance le long de `regard` depuis `origine` ; un plan de coupe éventuel est à la
 * profondeur 0 et l'on ne garde que ce qui est au-delà (jusqu'à `profondeurMax`).
 */
import type { Vec } from "../geometrie.js";
import { pointDansPolygone } from "../geometrie.js";
import type { Maillage } from "../projection/maillage.js";

export type V3 = [number, number, number];

export interface Camera {
  origine: V3;
  regard: V3;
  droite: V3;
  haut: V3;
}

export interface OptionsProjection {
  /** Plan de coupe à la profondeur 0 : la matière qu'il traverse est « coupée », seul l'au-delà est vu. */
  coupe: boolean;
  /** Profondeur maximale vue (m) ; `null` = sans limite. */
  profondeurMax: number | null;
  /** Garder aussi les parties cachées des arêtes (trait « caché »). */
  lignesCachees: boolean;
  /** Angle (°) au-delà duquel deux faces voisines dessinent une arête. */
  angleArete?: number;
}

export interface SegmentVu {
  a: Vec;
  b: Vec;
  objetId: string;
}

export interface ContourCoupe {
  points: Vec[];
  ferme: boolean;
  objetId: string;
}

export interface ResultatProjection {
  /** Contours de la matière coupée (fermés quand le maillage l'est). */
  coupes: ContourCoupe[];
  /** Arêtes vues (parties visibles). */
  vues: SegmentVu[];
  /** Parties cachées des arêtes (seulement si `lignesCachees`). */
  cachees: SegmentVu[];
  /** Nombre de triangles occultants pris en compte (mesure). */
  triangles: number;
}

const EPS_PROFONDEUR = 1e-4;
const EPS_T = 1e-7;
const EPS_BORD = 1e-9;

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Point projeté : abscisse, ordonnée sur la feuille, profondeur. */
type P3 = [number, number, number];

function projeter(p: V3, c: Camera): P3 {
  const d = sub3(p, c.origine);
  return [dot3(d, c.droite), dot3(d, c.haut), dot3(d, c.regard)];
}

/** Coupe d'un polygone 3D projeté par le demi-espace profondeur ≥ z (ou ≤ z). */
function couperProfondeur(poly: P3[], z: number, garderAuDela: boolean): P3[] {
  const out: P3[] = [];
  const dedans = (p: P3) => (garderAuDela ? p[2] >= z : p[2] <= z);
  for (let k = 0; k < poly.length; k++) {
    const cur = poly[k]!;
    const prec = poly[(k + poly.length - 1) % poly.length]!;
    const ci = dedans(cur);
    const pi = dedans(prec);
    if (ci !== pi) {
      const t = (z - prec[2]) / (cur[2] - prec[2]);
      out.push([prec[0] + (cur[0] - prec[0]) * t, prec[1] + (cur[1] - prec[1]) * t, z]);
    }
    if (ci) out.push(cur);
  }
  return out;
}

function couperSegmentProfondeur(a: P3, b: P3, zmin: number, zmax: number | null): [P3, P3] | null {
  let t0 = 0;
  let t1 = 1;
  const dz = b[2] - a[2];
  const borne = (z: number, sens: 1 | -1) => {
    // sens 1 : garder profondeur ≥ z ; −1 : garder ≤ z.
    const f0 = sens * (a[2] - z);
    const df = sens * dz;
    if (Math.abs(df) < 1e-12) {
      if (f0 < 0) t1 = -1;
      return;
    }
    const t = -f0 / df;
    if (df > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  };
  borne(zmin, 1);
  if (zmax !== null) borne(zmax, -1);
  if (t1 - t0 <= EPS_T) return null;
  const p = (t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + dz * t];
  return [p(t0), p(t1)];
}

interface Occultant {
  // Sommets projetés.
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  // Plan de profondeur : z = pz0 + pzx * x + pzy * y.
  pz0: number;
  pzx: number;
  pzy: number;
  sens: number;
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
  zmin: number;
}

function occultant(a: P3, b: P3, c: P3): Occultant | null {
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(det) < 1e-12) return null; // vu par la tranche
  // Plan de profondeur par les trois sommets.
  const pzx = ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / det;
  const pzy = ((c[2] - a[2]) * (b[0] - a[0]) - (b[2] - a[2]) * (c[0] - a[0])) / det;
  const pz0 = a[2] - pzx * a[0] - pzy * a[1];
  return {
    ax: a[0],
    ay: a[1],
    bx: b[0],
    by: b[1],
    cx: c[0],
    cy: c[1],
    pz0,
    pzx,
    pzy,
    sens: det > 0 ? 1 : -1,
    minx: Math.min(a[0], b[0], c[0]),
    miny: Math.min(a[1], b[1], c[1]),
    maxx: Math.max(a[0], b[0], c[0]),
    maxy: Math.max(a[1], b[1], c[1]),
    zmin: Math.min(a[2], b[2], c[2]),
  };
}

/** Intervalle [t0, t1] du segment p→q caché par le triangle, ou null. */
function intervalleCache(p: P3, q: P3, o: Occultant): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const demi = (x1: number, y1: number, x2: number, y2: number) => {
    // f(pt) = sens * cross(e, pt - v1) ≥ 0 à l'intérieur.
    const ex = x2 - x1;
    const ey = y2 - y1;
    // Bord du triangle compris (tolérance) : une arête posée exactement sur le contour d'une face plus proche est cachée.
    const f0 = o.sens * (ex * (p[1] - y1) - ey * (p[0] - x1)) + EPS_BORD;
    const f1 = o.sens * (ex * (q[1] - y1) - ey * (q[0] - x1)) + EPS_BORD;
    const df = f1 - f0;
    if (Math.abs(df) < 1e-14) {
      if (f0 < 0) t1 = -1;
      return;
    }
    const t = -f0 / df;
    if (df > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  };
  demi(o.ax, o.ay, o.bx, o.by);
  if (t1 - t0 <= EPS_T) return null;
  demi(o.bx, o.by, o.cx, o.cy);
  if (t1 - t0 <= EPS_T) return null;
  demi(o.cx, o.cy, o.ax, o.ay);
  if (t1 - t0 <= EPS_T) return null;
  // Profondeur : caché là où le segment est derrière le plan du triangle (g > 0).
  const g0 = p[2] - (o.pz0 + o.pzx * p[0] + o.pzy * p[1]) - EPS_PROFONDEUR;
  const g1 = q[2] - (o.pz0 + o.pzx * q[0] + o.pzy * q[1]) - EPS_PROFONDEUR;
  const dg = g1 - g0;
  if (Math.abs(dg) < 1e-14) {
    if (g0 <= 0) return null;
  } else {
    const t = -g0 / dg;
    if (dg > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t1 - t0 > EPS_T ? [t0, t1] : null;
}

function soustraireIntervalles(caches: [number, number][]): { visibles: [number, number][]; caches: [number, number][] } {
  caches.sort((a, b) => a[0] - b[0]);
  const fusion: [number, number][] = [];
  for (const c of caches) {
    const der = fusion[fusion.length - 1];
    if (der && c[0] <= der[1] + EPS_T) der[1] = Math.max(der[1], c[1]);
    else fusion.push([c[0], c[1]]);
  }
  const visibles: [number, number][] = [];
  let t = 0;
  for (const [a, b] of fusion) {
    if (a > t + EPS_T) visibles.push([t, a]);
    t = Math.max(t, b);
  }
  if (t < 1 - EPS_T) visibles.push([t, 1]);
  return { visibles, caches: fusion };
}

interface Arete {
  a: V3;
  b: V3;
  normales: V3[];
}

/**
 * Arêtes d'un maillage : bords des régions planes. Les triangles sont regroupés par plan (sens ignoré) ; dans chaque
 * plan, les côtés de triangles sont rangés par droite porteuse et leur recouvrement compté le long de la droite :
 * une portion couverte un nombre impair de fois est un bord de la région plane. Ce comptage ignore les diagonales
 * de triangulation, les sommets en T (un côté découpé d'un seul côté) et les ponts vers les trous.
 */
function aretesVives(m: Maillage, _cosSeuil: number): Arete[] {
  const pos = (i: number): V3 => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
  const R = (v: number, k = 1e4) => Math.round(v * k);
  const plans = new Map<string, Map<string, { dir: V3; base: V3; intervalles: [number, number][] }>>();
  for (let k = 0; k < m.indices.length; k += 3) {
    const t = [pos(m.indices[k]!), pos(m.indices[k + 1]!), pos(m.indices[k + 2]!)] as [V3, V3, V3];
    const nr = cross3(sub3(t[1], t[0]), sub3(t[2], t[0]));
    const l = Math.hypot(nr[0], nr[1], nr[2]);
    if (l < 1e-12) continue;
    let n: V3 = [nr[0] / l, nr[1] / l, nr[2] / l];
    const premier = Math.abs(n[0]) > 1e-9 ? n[0] : Math.abs(n[1]) > 1e-9 ? n[1] : n[2];
    if (premier < 0) n = [-n[0], -n[1], -n[2]];
    const clePlan = `${R(n[0])},${R(n[1])},${R(n[2])},${R(dot3(n, t[0]), 1e3)}`;
    let droites = plans.get(clePlan);
    if (!droites) plans.set(clePlan, (droites = new Map()));
    for (let e = 0; e < 3; e++) {
      const a = t[e]!;
      const b = t[(e + 1) % 3]!;
      const d = sub3(b, a);
      const L = Math.hypot(d[0], d[1], d[2]);
      if (L < 1e-9) continue;
      let u: V3 = [d[0] / L, d[1] / L, d[2] / L];
      const p0 = Math.abs(u[0]) > 1e-9 ? u[0] : Math.abs(u[1]) > 1e-9 ? u[1] : u[2];
      if (p0 < 0) u = [-u[0], -u[1], -u[2]];
      // Point de la droite le plus proche de l'origine : identifie la droite avec sa direction.
      const ta = dot3(a, u);
      const base: V3 = [a[0] - u[0] * ta, a[1] - u[1] * ta, a[2] - u[2] * ta];
      const cle = `${R(u[0], 1e5)},${R(u[1], 1e5)},${R(u[2], 1e5)}|${R(base[0])},${R(base[1])},${R(base[2])}`;
      const tb = dot3(b, u);
      let dr = droites.get(cle);
      if (!dr) droites.set(cle, (dr = { dir: u, base, intervalles: [] }));
      dr.intervalles.push(ta < tb ? [ta, tb] : [tb, ta]);
    }
  }
  const out: Arete[] = [];
  for (const droites of plans.values()) {
    for (const dr of droites.values()) {
      const evts: [number, number][] = [];
      for (const [x, y] of dr.intervalles) evts.push([x, 1], [y, -1]);
      evts.sort((p, q) => p[0] - q[0] || q[1] - p[1]);
      let compte = 0;
      let debut: number | null = null;
      for (let i = 0; i < evts.length; i++) {
        const [t, s] = evts[i]!;
        const avant = compte;
        compte += s;
        // On ne tranche qu'après avoir appliqué tous les événements d'un même point.
        const suivant = evts[i + 1];
        if (suivant && Math.abs(suivant[0] - t) < 1e-7) continue;
        const impairAvant = debut !== null;
        const impair = compte % 2 !== 0;
        void avant;
        if (impair && !impairAvant) debut = t;
        else if (!impair && impairAvant) {
          if (t - debut! > 1e-6) out.push({ a: [dr.base[0] + dr.dir[0] * debut!, dr.base[1] + dr.dir[1] * debut!, dr.base[2] + dr.dir[2] * debut!], b: [dr.base[0] + dr.dir[0] * t, dr.base[1] + dr.dir[1] * t, dr.base[2] + dr.dir[2] * t], normales: [] });
          debut = null;
        }
      }
    }
  }
  // Une arête entre deux plans est trouvée deux fois : dédoublonnée.
  const vus = new Set<string>();
  return out.filter((a) => {
    const k1 = `${R(a.a[0])},${R(a.a[1])},${R(a.a[2])}`;
    const k2 = `${R(a.b[0])},${R(a.b[1])},${R(a.b[2])}`;
    const k = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}

/** Chaîne les segments de coupe en contours (fermés quand les extrémités se rejoignent). */
function chainer(segments: [Vec, Vec][]): { points: Vec[]; ferme: boolean }[] {
  const cle = (p: Vec) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`;
  const parSommet = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = cle(p);
      const l = parSommet.get(k);
      if (l) l.push(i);
      else parSommet.set(k, [i]);
    }
  });
  const utilise = new Array<boolean>(segments.length).fill(false);
  const out: { points: Vec[]; ferme: boolean }[] = [];
  for (let s = 0; s < segments.length; s++) {
    if (utilise[s]) continue;
    utilise[s] = true;
    const chaine: Vec[] = [segments[s]![0], segments[s]![1]];
    const prolonger = (versFin: boolean) => {
      for (;;) {
        const bout = versFin ? chaine[chaine.length - 1]! : chaine[0]!;
        const suivants = parSommet.get(cle(bout)) ?? [];
        const n = suivants.find((i) => !utilise[i]);
        if (n === undefined) return;
        utilise[n] = true;
        const [a, b] = segments[n]!;
        const autre = cle(a) === cle(bout) ? b : a;
        if (versFin) chaine.push(autre);
        else chaine.unshift(autre);
      }
    };
    prolonger(true);
    prolonger(false);
    const ferme = chaine.length > 3 && cle(chaine[0]!) === cle(chaine[chaine.length - 1]!);
    if (ferme) chaine.pop();
    out.push({ points: chaine, ferme });
  }
  return out;
}

/**
 * Projette des maillages vers la feuille avec la visibilité par faces. Les arêtes de même objet comme les faces
 * coplanaires ne se cachent pas entre elles (tolérance de profondeur de 0,1 mm).
 */
export function projeterMaillages(maillages: readonly Maillage[], camera: Camera, options: OptionsProjection): ResultatProjection {
  const cosSeuil = Math.cos(((options.angleArete ?? 20) * Math.PI) / 180);
  const zmin = options.coupe ? 0 : -Infinity;
  const zmax = options.profondeurMax;
  const coupes: ContourCoupe[] = [];
  const occultants: Occultant[] = [];
  const aretesProjetees: { p: P3; q: P3; objetId: string }[] = [];

  for (const m of maillages) {
    const pts: P3[] = [];
    for (let i = 0; i < m.positions.length; i += 3) pts.push(projeter([m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!], camera));
    // Coupe : segments du maillage dans le plan de profondeur 0.
    if (options.coupe) {
      const segs: [Vec, Vec][] = [];
      for (let k = 0; k < m.indices.length; k += 3) {
        const tri = [pts[m.indices[k]!]!, pts[m.indices[k + 1]!]!, pts[m.indices[k + 2]!]!];
        const inter: Vec[] = [];
        for (let e = 0; e < 3; e++) {
          const a = tri[e]!;
          const b = tri[(e + 1) % 3]!;
          if ((a[2] > 0 && b[2] < 0) || (a[2] < 0 && b[2] > 0)) {
            const t = a[2] / (a[2] - b[2]);
            inter.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
          } else if (a[2] === 0 && b[2] !== 0) inter.push({ x: a[0], y: a[1] });
        }
        if (inter.length >= 2 && Math.hypot(inter[0]!.x - inter[1]!.x, inter[0]!.y - inter[1]!.y) > 1e-9) segs.push([inter[0]!, inter[1]!]);
      }
      for (const c of chainer(segs)) coupes.push({ points: c.points, ferme: c.ferme, objetId: m.objetId });
    }
    // Occultants : triangles (découpés au plan de coupe et à la profondeur maximale).
    for (let k = 0; k < m.indices.length; k += 3) {
      let poly: P3[] = [pts[m.indices[k]!]!, pts[m.indices[k + 1]!]!, pts[m.indices[k + 2]!]!];
      if (options.coupe) poly = couperProfondeur(poly, 0, true);
      if (zmax !== null && poly.length) poly = couperProfondeur(poly, zmax, false);
      for (let f = 1; f + 1 < poly.length; f++) {
        const o = occultant(poly[0]!, poly[f]!, poly[f + 1]!);
        if (o) occultants.push(o);
      }
    }
    // Arêtes vives, découpées à la tranche de profondeur vue.
    for (const ar of aretesVives(m, cosSeuil)) {
      const s = couperSegmentProfondeur(projeter(ar.a, camera), projeter(ar.b, camera), zmin, zmax);
      if (s) aretesProjetees.push({ p: s[0], q: s[1], objetId: m.objetId });
    }
  }

  // Grille d'accélération sur la feuille.
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const o of occultants) {
    minx = Math.min(minx, o.minx);
    miny = Math.min(miny, o.miny);
    maxx = Math.max(maxx, o.maxx);
    maxy = Math.max(maxy, o.maxy);
  }
  const vues: SegmentVu[] = [];
  const cachees: SegmentVu[] = [];
  const n = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(occultants.length / 4))));
  const lx = Math.max((maxx - minx) / n, 1e-9);
  const ly = Math.max((maxy - miny) / n, 1e-9);
  const cellules: number[][] = Array.from({ length: n * n }, () => []);
  const ix = (x: number) => Math.min(n - 1, Math.max(0, Math.floor((x - minx) / lx)));
  const iy = (y: number) => Math.min(n - 1, Math.max(0, Math.floor((y - miny) / ly)));
  occultants.forEach((o, i) => {
    for (let gx = ix(o.minx); gx <= ix(o.maxx); gx++) for (let gy = iy(o.miny); gy <= iy(o.maxy); gy++) cellules[gy * n + gx]!.push(i);
  });
  const vu = new Uint32Array(occultants.length);
  const dejaTraces = new Set<string>();
  let marque = 0;
  for (const ar of aretesProjetees) {
    marque++;
    const sx0 = Math.min(ar.p[0], ar.q[0]);
    const sx1 = Math.max(ar.p[0], ar.q[0]);
    const sy0 = Math.min(ar.p[1], ar.q[1]);
    const sy1 = Math.max(ar.p[1], ar.q[1]);
    const zArete = Math.max(ar.p[2], ar.q[2]);
    const intervalles: [number, number][] = [];
    if (occultants.length && sx1 >= minx && sx0 <= maxx && sy1 >= miny && sy0 <= maxy) {
      boucle: for (let gx = ix(sx0); gx <= ix(sx1); gx++) {
        for (let gy = iy(sy0); gy <= iy(sy1); gy++) {
          for (const i of cellules[gy * n + gx]!) {
            if (vu[i] === marque) continue;
            vu[i] = marque;
            const o = occultants[i]!;
            if (o.zmin > zArete || o.maxx < sx0 || o.minx > sx1 || o.maxy < sy0 || o.miny > sy1) continue;
            const c = intervalleCache(ar.p, ar.q, o);
            if (c) {
              intervalles.push(c);
              if (c[0] <= EPS_T && c[1] >= 1 - EPS_T) break boucle;
            }
          }
        }
      }
    }
    const { visibles, caches } = soustraireIntervalles(intervalles);
    // Extrémités arrondies au dixième de micromètre : la tolérance de bord ne laisse pas de résidu numérique.
    const r7 = (v: number) => Math.round(v * 1e7) / 1e7;
    const pt = (t: number): Vec => ({ x: r7(ar.p[0] + (ar.q[0] - ar.p[0]) * t), y: r7(ar.p[1] + (ar.q[1] - ar.p[1]) * t) });
    const longueur = Math.hypot(ar.q[0] - ar.p[0], ar.q[1] - ar.p[1]);
    for (const [a, b] of visibles) {
      if ((b - a) * longueur < 1e-6) continue;
      // Arêtes confondues en projection (avant et arrière d'une même boîte, objets accolés) : tracées une fois.
      const pa = pt(a);
      const pb = pt(b);
      const k1 = `${Math.round(pa.x * 1e6)},${Math.round(pa.y * 1e6)}`;
      const k2 = `${Math.round(pb.x * 1e6)},${Math.round(pb.y * 1e6)}`;
      const cle = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      if (dejaTraces.has(cle)) continue;
      dejaTraces.add(cle);
      vues.push({ a: pa, b: pb, objetId: ar.objetId });
    }
    if (options.lignesCachees)
      for (const [a, b] of caches) {
        const a2 = Math.max(0, a);
        const b2 = Math.min(1, b);
        if ((b2 - a2) * longueur < 1e-6) continue;
        const pa = pt(a2);
        const pb = pt(b2);
        const cle = `c${Math.round(pa.x * 1e6)},${Math.round(pa.y * 1e6)}|${Math.round(pb.x * 1e6)},${Math.round(pb.y * 1e6)}`;
        if (dejaTraces.has(cle)) continue;
        dejaTraces.add(cle);
        cachees.push({ a: pa, b: pb, objetId: ar.objetId });
      }
  }
  return { coupes, vues, cachees, triangles: occultants.length };
}

/**
 * Contours de l'union de polygones (matière coupée de murs qui se rejoignent) : chaque côté est découpé aux
 * intersections avec les autres polygones et seules les parties hors de tous les autres sont gardées. Les côtés
 * superposés exactement sont gardés une fois.
 */
export function contoursUnion(polygones: readonly { points: Vec[]; objetId: string }[]): SegmentVu[] {
  const bb = polygones.map((p) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const q of p.points) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    return { x0, y0, x1, y1 };
  });
  const out: SegmentVu[] = [];
  const dejaVus = new Set<string>();
  const cleSeg = (a: Vec, b: Vec) => {
    const k1 = `${Math.round(a.x * 1e4)},${Math.round(a.y * 1e4)}`;
    const k2 = `${Math.round(b.x * 1e4)},${Math.round(b.y * 1e4)}`;
    return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  };
  polygones.forEach((poly, i) => {
    const n = poly.points.length;
    for (let k = 0; k < n; k++) {
      const a = poly.points[k]!;
      const b = poly.points[(k + 1) % n]!;
      const ts = [0, 1];
      const voisins: number[] = [];
      const sx0 = Math.min(a.x, b.x);
      const sx1 = Math.max(a.x, b.x);
      const sy0 = Math.min(a.y, b.y);
      const sy1 = Math.max(a.y, b.y);
      polygones.forEach((_, j) => {
        if (j === i) return;
        const r = bb[j]!;
        if (r.x1 < sx0 - 1e-9 || r.x0 > sx1 + 1e-9 || r.y1 < sy0 - 1e-9 || r.y0 > sy1 + 1e-9) return;
        voisins.push(j);
        const q = polygones[j]!.points;
        for (let l = 0; l < q.length; l++) {
          const c = q[l]!;
          const d = q[(l + 1) % q.length]!;
          const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
          if (Math.abs(den) < 1e-14) continue;
          const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
          const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
          if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
        }
      });
      ts.sort((x, y) => x - y);
      for (let s = 0; s + 1 < ts.length; s++) {
        const t0 = ts[s]!;
        const t1 = ts[s + 1]!;
        if (t1 - t0 < 1e-9) continue;
        const m = { x: a.x + (b.x - a.x) * ((t0 + t1) / 2), y: a.y + (b.y - a.y) * ((t0 + t1) / 2) };
        // Point milieu légèrement décalé vers l'extérieur du polygone courant : un côté partagé reste tracé une fois.
        if (voisins.some((j) => strictementDedans(m, polygones[j]!.points))) continue;
        const p0 = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
        const p1 = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
        const cle = cleSeg(p0, p1);
        if (dejaVus.has(cle)) continue;
        dejaVus.add(cle);
        out.push({ a: p0, b: p1, objetId: poly.objetId });
      }
    }
  });
  return out;
}

/** Point à l'intérieur d'un polygone, hors de son bord (tolérance 0,1 mm). */
function strictementDedans(p: Vec, poly: readonly Vec[]): boolean {
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-12) continue;
    const d = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (L * L);
    if (d < 1e-4 && t >= -1e-6 && t <= 1 + 1e-6) return false;
  }
  return pointDansPolygone(p, poly);
}

export const lerpV3 = lerp3;
