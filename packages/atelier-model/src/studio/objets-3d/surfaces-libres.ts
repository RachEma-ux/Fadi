import type { StudioPoint3 } from "../exporteurs/maillage.js";
import { array, fail, finite, identifier, layerRef, record } from "../noyau/validation.js";

/**
 * Surfaces libres de Studio (X.1-05, scène S5 : « surfaces complexes ») : **surface NURBS** donnée par sa grille de
 * pôles (points de contrôle), ses degrés et ses poids, rangée dans le tableau facultatif `surfaces` du document (repère
 * `local-3d`, z vers le haut, mètres). Extension additive de `studio-document/1` : un document sans surface est relu à
 * l'identique.
 *
 * - **Pôles** : `lignes × colonnes` points rangés ligne par ligne (`controle[i * colonnes + j]`, i le long de u, j le
 *   long de v). Ce sont des pôles, jamais des points de passage : la nappe passe par ses quatre coins seulement.
 * - **Degrés** `degreU` ≤ lignes − 1 et `degreV` ≤ colonnes − 1 (1 à 9) ; **poids** facultatifs (> 0) : absents, la
 *   surface est une B-spline non rationnelle ; présents, une NURBS rationnelle (arc de cercle exact, etc.).
 * - **Nœuds** : vecteurs uniformes bornés (clamped) sur [0, 1], dérivés des degrés et des nombres de pôles — jamais
 *   saisis ni stockés (choix de Studio, consigné : le noyau exact reçoit les mêmes).
 *
 * La géométrie canonique est la définition NURBS ; le maillage d'affichage et l'aire approchée en sont **dérivés**
 * (évaluation rationnelle de Cox–de Boor, ici, sans noyau). La conversion en solide exact (épaississement) est une
 * commande explicite (`studio.surface.epaissir`), calculée par le noyau OCCT (`@parcours/geometry-exact`, opération
 * `nurbs`, décrite structurellement ci-dessous) et recalculée par le serveur. Pur : ni React, ni DOM, ni WebAssembly.
 */

export interface StudioSurfaceLibre {
  id: string;
  type: "surface-libre";
  layerId?: string;
  degreU: number;
  degreV: number;
  lignes: number;
  colonnes: number;
  /** Pôles (m, repère `local-3d`), ligne par ligne. */
  controle: StudioPoint3[];
  /** Poids rationnels (> 0), un par pôle ; absent : tous égaux à 1. */
  poids?: number[];
}

/**
 * Bornes techniques (pas des valeurs métier) : 2 à 64 pôles par sens et degré 1 à 9 (bornes de l'opération `nurbs` du
 * noyau), coordonnées de ±1e9 m au plus (celles des solides), 16 échantillons par travée et 64 au plus par sens pour
 * le maillage d'affichage.
 */
export const STUDIO_LIMITES_SURFACES = Object.freeze({ cotes: 64, degre: 9, coordonneeMax: 1e9, echantillonsTravee: 16, echantillonsMax: 64 } as const);

const entier = (v: unknown, path: string, min: number, max: number): number => {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n < min || n > max) fail(path, `entier de ${min} à ${max} attendu`);
  return n;
};

function point3(v: unknown, path: string): StudioPoint3 {
  const p = record(v, ["x", "y", "z"], path);
  const c = (k: "x" | "y" | "z") => {
    const n = finite(p[k], `${path}.${k}`);
    if (Math.abs(n) > STUDIO_LIMITES_SURFACES.coordonneeMax) fail(`${path}.${k}`, `coordonnée de ±${STUDIO_LIMITES_SURFACES.coordonneeMax} m au plus`);
    return n;
  };
  return { x: c("x"), y: c("y"), z: c("z") };
}

const distance = (a: StudioPoint3, b: StudioPoint3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Surface libre validée (copie canonique privée) ; un champ inconnu est refusé, jamais ignoré. */
export function validerSurfaceLibre(value: unknown, path: string): StudioSurfaceLibre {
  const o = record(value, ["id", "type", "degreU", "degreV", "lignes", "colonnes", "controle"], path, ["layerId", "poids"]);
  if (o.type !== "surface-libre") fail(`${path}.type`, "type « surface-libre » attendu");
  const L = STUDIO_LIMITES_SURFACES;
  const lignes = entier(o.lignes, `${path}.lignes`, 2, L.cotes), colonnes = entier(o.colonnes, `${path}.colonnes`, 2, L.cotes);
  const degreU = entier(o.degreU, `${path}.degreU`, 1, Math.min(L.degre, lignes - 1));
  const degreV = entier(o.degreV, `${path}.degreV`, 1, Math.min(L.degre, colonnes - 1));
  const brut = array(o.controle, `${path}.controle`);
  if (brut.length !== lignes * colonnes) fail(`${path}.controle`, `${lignes * colonnes} pôles attendus (lignes × colonnes)`);
  const controle = brut.map((p, i) => point3(p, `${path}.controle[${i}]`));
  let poids: number[] | undefined;
  if (Object.hasOwn(o, "poids")) {
    const w = array(o.poids, `${path}.poids`);
    if (w.length !== lignes * colonnes) fail(`${path}.poids`, `${lignes * colonnes} poids attendus (un par pôle)`);
    poids = w.map((x, i) => { const n = finite(x, `${path}.poids[${i}]`); if (n <= 0) fail(`${path}.poids[${i}]`, "poids strictement positif attendu"); return n; });
  }
  // Bords et coins : le noyau exact ne prend pas de bord réduit à un point (surface dégénérée) ; refusé ici aussi.
  const P = (i: number, j: number) => controle[i * colonnes + j]!;
  const bords: [string, StudioPoint3[]][] = [
    ["u = 0", Array.from({ length: colonnes }, (_, j) => P(0, j))], ["u = 1", Array.from({ length: colonnes }, (_, j) => P(lignes - 1, j))],
    ["v = 0", Array.from({ length: lignes }, (_, i) => P(i, 0))], ["v = 1", Array.from({ length: lignes }, (_, i) => P(i, colonnes - 1))],
  ];
  for (const [nom, pts] of bords) if (pts.every((p) => distance(p, pts[0]!) < 1e-9)) fail(`${path}.controle`, `bord ${nom} réduit à un point (surface dégénérée non prise en charge)`);
  const coins = [P(0, 0), P(0, colonnes - 1), P(lignes - 1, 0), P(lignes - 1, colonnes - 1)];
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (distance(coins[a]!, coins[b]!) < 1e-9) fail(`${path}.controle`, "deux coins de la surface confondus");
  return {
    id: identifier(o.id, `${path}.id`), type: "surface-libre", ...layerRef(o, path), degreU, degreV, lignes, colonnes, controle,
    ...(poids ? { poids } : {}),
  };
}

// ——— Évaluation (Cox–de Boor rationnel), dérivée ———

/** Vecteur de nœuds uniforme borné sur [0, 1] (n pôles, degré p), nœuds répétés compris (n + p + 1 valeurs). */
export function studioNoeudsUniformes(n: number, p: number): number[] {
  const travees = n - p, out: number[] = [];
  for (let i = 0; i <= p; i++) out.push(0);
  for (let i = 1; i < travees; i++) out.push(i / travees);
  for (let i = 0; i <= p; i++) out.push(1);
  return out;
}

/** Fonctions de base non nulles N(i−p..i, p) en t (algorithme A2.2 de Piegl et Tiller) et l'indice i de la travée. */
function bases(t: number, p: number, U: readonly number[], n: number): { travee: number; N: number[] } {
  let travee = n - 1;
  if (t < U[n]!) { travee = p; while (travee < n - 1 && t >= U[travee + 1]!) travee++; }
  const N = [1], gauche = [0], droite = [0];
  for (let j = 1; j <= p; j++) {
    gauche[j] = t - U[travee + 1 - j]!; droite[j] = U[travee + j]! - t;
    let reste = 0;
    for (let r = 0; r < j; r++) {
      const tmp = N[r]! / (droite[r + 1]! + gauche[j - r]!);
      N[r] = reste + droite[r + 1]! * tmp;
      reste = gauche[j - r]! * tmp;
    }
    N[j] = reste;
  }
  return { travee, N };
}

/** Point S(u, v) de la surface (u, v ∈ [0, 1]), évaluation rationnelle exacte en arithmétique flottante. */
export function studioPointSurface(s: StudioSurfaceLibre, u: number, v: number): StudioPoint3 {
  const Uk = studioNoeudsUniformes(s.lignes, s.degreU), Vk = studioNoeudsUniformes(s.colonnes, s.degreV);
  const bu = bases(u, s.degreU, Uk, s.lignes), bv = bases(v, s.degreV, Vk, s.colonnes);
  let x = 0, y = 0, z = 0, w = 0;
  for (let a = 0; a <= s.degreU; a++) {
    const i = bu.travee - s.degreU + a;
    for (let b = 0; b <= s.degreV; b++) {
      const j = bv.travee - s.degreV + b, k = i * s.colonnes + j;
      const c = bu.N[a]! * bv.N[b]! * (s.poids?.[k] ?? 1), P = s.controle[k]!;
      x += c * P.x; y += c * P.y; z += c * P.z; w += c;
    }
  }
  return { x: x / w, y: y / w, z: z / w };
}

/** Échantillons d'un sens : `echantillonsTravee` par travée (≥ 1 par degré), 64 au plus. */
function echantillons(n: number, p: number): number {
  const L = STUDIO_LIMITES_SURFACES;
  return Math.min(L.echantillonsMax, Math.max(1, n - p) * L.echantillonsTravee * Math.max(1, Math.ceil(p / 2)));
}

/** Maillage d'affichage d'une surface libre (ouverte : bords libres), dérivé, jamais stocké. */
export interface StudioSurface3d {
  id: string;
  type: "surface-libre";
  layerId?: string;
  kind: "surface";
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  /** Arêtes dessinées : les quatre bords de la nappe. */
  edges: [number, number][];
  /** Polygone de contrôle (pôles et segments entre pôles voisins), pour l'édition. */
  controle: { points: StudioPoint3[]; segments: [number, number][] };
}

export function studioMaillageSurface(s: StudioSurfaceLibre): StudioSurface3d {
  const nu = echantillons(s.lignes, s.degreU), nv = echantillons(s.colonnes, s.degreV);
  const vertices: StudioPoint3[] = [];
  for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) vertices.push(studioPointSurface(s, a / nu, b / nv));
  const k = (a: number, b: number) => a * (nv + 1) + b;
  const triangles: [number, number, number][] = [];
  for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) triangles.push([k(a, b), k(a + 1, b), k(a + 1, b + 1)], [k(a, b), k(a + 1, b + 1), k(a, b + 1)]);
  const edges: [number, number][] = [];
  for (let a = 0; a < nu; a++) edges.push([k(a, 0), k(a + 1, 0)], [k(a, nv), k(a + 1, nv)]);
  for (let b = 0; b < nv; b++) edges.push([k(0, b), k(0, b + 1)], [k(nu, b), k(nu, b + 1)]);
  const segments: [number, number][] = [];
  for (let i = 0; i < s.lignes; i++) for (let j = 0; j < s.colonnes; j++) {
    if (j + 1 < s.colonnes) segments.push([i * s.colonnes + j, i * s.colonnes + j + 1]);
    if (i + 1 < s.lignes) segments.push([i * s.colonnes + j, (i + 1) * s.colonnes + j]);
  }
  return {
    id: s.id, type: "surface-libre", ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), kind: "surface", vertices, triangles, edges,
    controle: { points: s.controle.map((p) => ({ ...p })), segments },
  };
}

/**
 * Aire **approchée** de la surface (m²) : somme des triangles de son maillage d'affichage — une valeur dérivée,
 * jamais présentée comme exacte (l'aire exacte d'un solide épaissi est celle du noyau).
 */
export function studioAireApprocheeSurface(s: StudioSurfaceLibre): number {
  const m = studioMaillageSurface(s);
  let aire = 0;
  for (const [a, b, c] of m.triangles) {
    const A = m.vertices[a]!, B = m.vertices[b]!, C = m.vertices[c]!;
    const u = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z }, v = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
    aire += Math.hypot(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x) / 2;
  }
  return aire;
}

// ——— Épaississement par le noyau exact (opération `nurbs` de `@parcours/geometry-exact`, décrite structurellement) ———

/** Côté de l'épaisseur : le long de la normale ∂S/∂u × ∂S/∂v (`normale`) ou à l'opposé (`inverse`). */
export const STUDIO_SENS_EPAISSEUR = Object.freeze(["normale", "inverse"] as const);
export type StudioSensEpaisseur = (typeof STUDIO_SENS_EPAISSEUR)[number];

export interface StudioOperationNurbs {
  type: "nurbs";
  nurbs: { degreU: number; degreV: number; lignes: number; colonnes: number; controle: StudioPoint3[]; poids?: number[] };
  /** Épaisseur signée (m) : positive le long de la normale. */
  epaisseur: number;
}

/** Entrée du noyau exact pour épaissir la surface `s` de `epaisseur` (> 0) du côté `sens`. */
export function studioOperationNurbs(s: StudioSurfaceLibre, epaisseur: number, sens: StudioSensEpaisseur): StudioOperationNurbs {
  return {
    type: "nurbs",
    nurbs: { degreU: s.degreU, degreV: s.degreV, lignes: s.lignes, colonnes: s.colonnes, controle: s.controle.map((p) => ({ x: p.x, y: p.y, z: p.z })), ...(s.poids ? { poids: [...s.poids] } : {}) },
    epaisseur: sens === "normale" ? epaisseur : -epaisseur,
  };
}

/** Épaisseur de l'épaississement : > 0, ≤ 1e6 m (borne des dimensions des solides). */
export function validerEpaisseur(v: unknown, path: string): number {
  const e = finite(v, path);
  if (e < 1e-6 || e > 1e6) fail(path, "épaisseur de 1e-6 à 1e6 m attendue");
  return e;
}

export function validerSens(v: unknown, path: string): StudioSensEpaisseur {
  if (typeof v !== "string" || !(STUDIO_SENS_EPAISSEUR as readonly string[]).includes(v)) fail(path, "sens « normale » ou « inverse » attendu");
  return v as StudioSensEpaisseur;
}

// ——— Schémas JSON (registre, document) ———

const point3Schema = { type: "object", additionalProperties: false, required: ["x", "y", "z"], properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } } as const;
const L = STUDIO_LIMITES_SURFACES;
export const SCHEMA_SURFACE_LIBRE: Readonly<Record<string, unknown>> = {
  type: "object", additionalProperties: false, required: ["id", "type", "degreU", "degreV", "lignes", "colonnes", "controle"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 128 }, type: { const: "surface-libre" }, layerId: { type: "string", minLength: 1, maxLength: 128 },
    degreU: { type: "integer", minimum: 1, maximum: L.degre }, degreV: { type: "integer", minimum: 1, maximum: L.degre },
    lignes: { type: "integer", minimum: 2, maximum: L.cotes }, colonnes: { type: "integer", minimum: 2, maximum: L.cotes },
    controle: { type: "array", minItems: 4, maxItems: L.cotes * L.cotes, items: point3Schema, description: "pôles ligne par ligne (lignes × colonnes)" },
    poids: { type: "array", minItems: 4, maxItems: L.cotes * L.cotes, items: { type: "number", exclusiveMinimum: 0 } },
  },
} as const;
