import type { StudioPoint3 } from "../exporteurs/maillage.js";
import { array, fail, finite, identifier, layerRef, record } from "../noyau/validation.js";
import { subdiviserLoop } from "../../subdivision-loop.js";

/**
 * Surfaces de subdivision de Studio (X.1-05, scène S5 : « surfaces complexes ») : **maillage de contrôle** triangulaire
 * (sommets et faces orientées) et **niveau** de subdivision saisi (0 à 4), rangés dans le tableau facultatif
 * `subdivisions` du document (repère `local-3d`, mètres). Extension additive de `studio-document/1`.
 *
 * - Schéma de **Loop** (triangles) : la géométrie pure est celle de la surface libre de l'Atelier (P2-6), déplacée dans
 *   le module neutre `subdivision-loop.ts` (aucun import ; Studio n'importe pas l'Atelier). Une face non triangulaire
 *   est refusée (pas de Catmull-Clark) : un quadrilatère se saisit en deux triangles.
 * - Maillage de contrôle **variété orientée** : indices valides, trois sommets distincts et non alignés par face, chaque
 *   arête portée par une ou deux faces de sens opposés (orientation cohérente), chaque sommet utilisé.
 * - Le maillage subdivisé au niveau n est **dérivé** (jamais stocké) ; il sert à l'affichage, au métré (aire, et volume
 *   s'il est fermé) et à la conversion en solide. La surface limite (n → ∞) n'est jamais présentée comme calculée.
 * - Conversion explicite en solide (`studio.subdivision.solidifier`) : seulement pour un maillage **fermé** (chaque
 *   arête portée par deux faces) — le maillage subdivisé au niveau n devient un solide exact **polyédrique** du noyau
 *   OCCT (faces planes cousues, opération `polyedre`), ni lissé ni présenté comme la surface limite. Un maillage ouvert est
 *   refusé avec sa raison (aucune épaisseur n'est inventée ; l'épaississement d'une coque polyédrique ouverte par le
 *   noyau rend un solide invalide — constat du lot).
 *
 * Pur : ni React, ni DOM, ni WebAssembly.
 */

export interface StudioSurfaceSubdivision {
  id: string;
  type: "surface-subdivision";
  layerId?: string;
  /** Sommets du maillage de contrôle (m, repère `local-3d`). */
  sommets: StudioPoint3[];
  /** Faces triangulaires orientées (indices de sommets, sens direct vers l'extérieur). */
  faces: [number, number, number][];
  /** Niveau de subdivision de Loop (0 : le maillage de contrôle lui-même). */
  niveau: number;
}

/**
 * Bornes techniques (pas des valeurs métier) : 2 000 sommets, 4 000 faces de contrôle, niveau 4 au plus, 16 384
 * triangles subdivisés au plus (affichage et noyau), coordonnées de ±1e9 m.
 */
export const STUDIO_LIMITES_SUBDIVISION = Object.freeze({ sommets: 2000, faces: 4000, niveau: 4, trianglesSubdivises: 16384, coordonneeMax: 1e9 } as const);

const cle = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function point3(v: unknown, path: string): StudioPoint3 {
  const p = record(v, ["x", "y", "z"], path);
  const c = (k: "x" | "y" | "z") => {
    const n = finite(p[k], `${path}.${k}`);
    if (Math.abs(n) > STUDIO_LIMITES_SUBDIVISION.coordonneeMax) fail(`${path}.${k}`, `coordonnée de ±${STUDIO_LIMITES_SUBDIVISION.coordonneeMax} m au plus`);
    return n;
  };
  return { x: c("x"), y: c("y"), z: c("z") };
}

/** Surface de subdivision validée (copie canonique privée) ; un champ inconnu est refusé, jamais ignoré. */
export function validerSurfaceSubdivision(value: unknown, path: string): StudioSurfaceSubdivision {
  const o = record(value, ["id", "type", "sommets", "faces", "niveau"], path, ["layerId"]);
  if (o.type !== "surface-subdivision") fail(`${path}.type`, "type « surface-subdivision » attendu");
  const L = STUDIO_LIMITES_SUBDIVISION;
  const brutS = array(o.sommets, `${path}.sommets`), brutF = array(o.faces, `${path}.faces`);
  if (brutS.length < 3 || brutS.length > L.sommets) fail(`${path}.sommets`, `3 à ${L.sommets} sommets attendus`);
  if (brutF.length < 1 || brutF.length > L.faces) fail(`${path}.faces`, `1 à ${L.faces} faces attendues`);
  const sommets = brutS.map((p, i) => point3(p, `${path}.sommets[${i}]`));
  const faces = brutF.map((f, i): [number, number, number] => {
    const t = array(f, `${path}.faces[${i}]`);
    if (t.length !== 3) fail(`${path}.faces[${i}]`, "face triangulaire attendue (schéma de Loop : saisissez un quadrilatère en deux triangles)");
    const ids = t.map((x, k) => { if (typeof x !== "number" || !Number.isInteger(x) || x < 0 || x >= sommets.length) fail(`${path}.faces[${i}][${k}]`, "indice de sommet attendu"); return x; }) as [number, number, number];
    if (new Set(ids).size !== 3) fail(`${path}.faces[${i}]`, "trois sommets distincts attendus");
    const [a, b, c] = ids.map((k) => sommets[k]!) as [StudioPoint3, StudioPoint3, StudioPoint3];
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    if (Math.hypot(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x) < 1e-12) fail(`${path}.faces[${i}]`, "face dégénérée (sommets alignés)");
    return ids;
  });
  // Variété orientée : une arête orientée au plus une fois, une arête non orientée sur une ou deux faces.
  const orientees = new Set<string>(), portees = new Map<string, number>();
  faces.forEach((f, i) => {
    for (const [u, v] of [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]] as [number, number][]) {
      const k = `${u}>${v}`;
      if (orientees.has(k)) fail(`${path}.faces[${i}]`, "orientation incohérente ou arête répétée (deux faces parcourent la même arête dans le même sens)");
      orientees.add(k);
      const n = (portees.get(cle(u, v)) ?? 0) + 1;
      if (n > 2) fail(`${path}.faces[${i}]`, "arête portée par plus de deux faces (maillage non manifold)");
      portees.set(cle(u, v), n);
    }
  });
  const utilises = new Set(faces.flat());
  const inutile = sommets.findIndex((_, i) => !utilises.has(i));
  if (inutile >= 0) fail(`${path}.sommets[${inutile}]`, "sommet utilisé par aucune face");
  const niveau = finite(o.niveau, `${path}.niveau`);
  if (!Number.isInteger(niveau) || niveau < 0 || niveau > L.niveau) fail(`${path}.niveau`, `entier de 0 à ${L.niveau} attendu`);
  if (faces.length * 4 ** niveau > L.trianglesSubdivises) fail(`${path}.niveau`, `${L.trianglesSubdivises} triangles subdivisés au plus (faces × 4^niveau)`);
  return { id: identifier(o.id, `${path}.id`), type: "surface-subdivision", ...layerRef(o, path), sommets, faces, niveau };
}

/** Le maillage de contrôle est-il fermé (chaque arête portée par exactement deux faces) ? */
export function studioSubdivisionFermee(s: StudioSurfaceSubdivision): boolean {
  const n = new Map<string, number>();
  for (const f of s.faces) for (const [u, v] of [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]] as [number, number][]) n.set(cle(u, v), (n.get(cle(u, v)) ?? 0) + 1);
  return [...n.values()].every((x) => x === 2);
}

/** Maillage subdivisé au niveau de la surface (Loop) : positions (x, y, z à la suite) et triangles. Dérivé. */
export function studioMaillageSubdivise(s: StudioSurfaceSubdivision): { positions: number[]; indices: number[] } {
  return subdiviserLoop(s.sommets.flatMap((p) => [p.x, p.y, p.z]), s.faces, s.niveau);
}

/** Maillage d'affichage d'une surface de subdivision : maillage subdivisé, bords libres et maillage de contrôle. */
export interface StudioSubdivision3d {
  id: string;
  type: "surface-subdivision";
  layerId?: string;
  kind: "subdivision";
  vertices: StudioPoint3[];
  triangles: [number, number, number][];
  /** Arêtes dessinées : les bords libres du maillage subdivisé (aucune pour un maillage fermé). */
  edges: [number, number][];
  /** Maillage de contrôle (sommets et arêtes), pour l'édition. */
  controle: { points: StudioPoint3[]; segments: [number, number][] };
  fermee: boolean;
}

export function studioMaillageSubdivision(s: StudioSurfaceSubdivision): StudioSubdivision3d {
  const m = studioMaillageSubdivise(s);
  const vertices: StudioPoint3[] = [];
  for (let i = 0; i < m.positions.length; i += 3) vertices.push({ x: m.positions[i]!, y: m.positions[i + 1]!, z: m.positions[i + 2]! });
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < m.indices.length; i += 3) triangles.push([m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!]);
  const n = new Map<string, [number, number, number]>();
  for (const t of triangles) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as [number, number][]) { const e = n.get(cle(u, v)); if (e) e[2]++; else n.set(cle(u, v), [u, v, 1]); }
  const edges = [...n.values()].filter((e) => e[2] === 1).map(([u, v]) => [u, v] as [number, number]);
  const segments = new Map<string, [number, number]>();
  for (const f of s.faces) for (const [u, v] of [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]] as [number, number][]) segments.set(cle(u, v), u < v ? [u, v] : [v, u]);
  return {
    id: s.id, type: "surface-subdivision", ...(s.layerId !== undefined ? { layerId: s.layerId } : {}), kind: "subdivision", vertices, triangles, edges,
    controle: { points: s.sommets.map((p) => ({ ...p })), segments: [...segments.values()] }, fermee: studioSubdivisionFermee(s),
  };
}

/** Aire du maillage subdivisé au niveau de la surface (m²) — pas l'aire de la surface limite. */
export function studioAireSubdivision(s: StudioSurfaceSubdivision): number {
  const m = studioMaillageSubdivise(s), P = (i: number) => [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!] as const;
  let aire = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = P(m.indices[t]!), b = P(m.indices[t + 1]!), c = P(m.indices[t + 2]!);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    aire += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  }
  return aire;
}

/** Volume enfermé par le maillage subdivisé (m³, faces orientées vers l'extérieur) ; null pour un maillage ouvert (non évalué). */
export function studioVolumeSubdivision(s: StudioSurfaceSubdivision): number | null {
  if (!studioSubdivisionFermee(s)) return null;
  const m = studioMaillageSubdivise(s), P = (i: number) => [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!] as const;
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = P(m.indices[t]!), b = P(m.indices[t + 1]!), c = P(m.indices[t + 2]!);
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

/** Entrée du noyau exact (opération `polyedre` de `@parcours/geometry-exact`, décrite structurellement). */
export interface StudioOperationPolyedre { type: "polyedre"; sommets: StudioPoint3[]; triangles: [number, number, number][] }

/** Polyèdre du maillage subdivisé ; message de refus pour un maillage ouvert (jamais solidifié). */
export function studioOperationPolyedre(s: StudioSurfaceSubdivision): StudioOperationPolyedre | string {
  if (!studioSubdivisionFermee(s)) return "surface de subdivision ouverte : seul un maillage de contrôle fermé (chaque arête portée par deux faces) devient un solide";
  if ((studioVolumeSubdivision(s) ?? 0) <= 0) return "faces orientées vers l’intérieur (volume négatif) : retournez l’orientation des faces avant de solidifier";
  const m = studioMaillageSubdivise(s);
  const sommets: StudioPoint3[] = [];
  for (let i = 0; i < m.positions.length; i += 3) sommets.push({ x: m.positions[i]!, y: m.positions[i + 1]!, z: m.positions[i + 2]! });
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < m.indices.length; i += 3) triangles.push([m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!]);
  return { type: "polyedre", sommets, triangles };
}

const point3Schema = { type: "object", additionalProperties: false, required: ["x", "y", "z"], properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } } as const;
export const SCHEMA_SURFACE_SUBDIVISION: Readonly<Record<string, unknown>> = {
  type: "object", additionalProperties: false, required: ["id", "type", "sommets", "faces", "niveau"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 128 }, type: { const: "surface-subdivision" }, layerId: { type: "string", minLength: 1, maxLength: 128 },
    sommets: { type: "array", minItems: 3, maxItems: STUDIO_LIMITES_SUBDIVISION.sommets, items: point3Schema },
    faces: { type: "array", minItems: 1, maxItems: STUDIO_LIMITES_SUBDIVISION.faces, items: { type: "array", minItems: 3, maxItems: 3, items: { type: "integer", minimum: 0 } }, description: "faces triangulaires orientées (Loop)" },
    niveau: { type: "integer", minimum: 0, maximum: STUDIO_LIMITES_SUBDIVISION.niveau },
  },
} as const;
