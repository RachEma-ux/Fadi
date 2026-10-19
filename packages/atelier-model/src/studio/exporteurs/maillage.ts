import { studioTriangulate } from "../courbes.js";
import type { StudioPoint, StudioShapeType } from "../noyau/types.js";

/**
 * Primitives de la vue 3D dérivée (`studioMesh3d`) : repère `local-3d`, conversion explicite depuis le `local-2d`,
 * prisme droit, surface verticale. Utilisées par les volumes par type d'objet (`objets/`). Pur : ni React, ni DOM.
 */

export const STUDIO_FRAME_3D = "local-3d" as const;

/** Point du repère `local-3d` (z vers le haut, mètres). */
export interface StudioPoint3 {
  x: number;
  y: number;
  z: number;
}

/** Conversion explicite `local-2d` → `local-3d` : les axes x et y du plan sont conservés, z est fourni. */
export function studioLocal2dVers3d(p: StudioPoint, z: number): StudioPoint3 {
  return { x: p.x, y: p.y, z };
}

/** Volume d'un objet extrudé : sommets, triangles (indices, faces extérieures en sens direct) et arêtes. */
export interface StudioSolid3d {
  id: string;
  type: StudioShapeType;
  layerId?: string;
  /**
   * `prism` : emprise fermée (rectangle, cercle, polyligne fermée, ligne ou arc avec épaisseur) ; `wall-surface` : ligne,
   * arc ou polyligne ouverte sans épaisseur (surface verticale le long du tracé discrétisé).
   */
  kind: "prism" | "wall-surface";
  vertices: StudioPoint3[];
  /** Triplets d'indices dans `vertices`. */
  triangles: [number, number, number][];
  /** Paires d'indices dans `vertices`. */
  edges: [number, number][];
}

export type Geometrie3d = Pick<StudioSolid3d, "vertices" | "triangles" | "edges">;
/** Volume dérivé d'un objet extrudé, ou null si l'extrusion n'y a pas de sens (jamais pour un document valide). */
export type Volume3d = { kind: StudioSolid3d["kind"]; geometry: Geometrie3d } | null;

const signedArea = (p: readonly StudioPoint[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a.x * b.y - b.x * a.y; }, 0) / 2;

/**
 * Prisme droit sur un anneau : faces du dessous et du dessus en éventail pour une emprise convexe (rectangle, mur droit,
 * cercle), par oreilles sinon (polyligne fermée, mur courbe), puis faces latérales.
 */
export function prism(base: StudioPoint[], zMin: number, zMax: number, convexe = true): Geometrie3d {
  const ring = signedArea(base) < 0 ? [...base].reverse() : base;
  const n = ring.length;
  const vertices = [...ring.map((p) => studioLocal2dVers3d(p, zMin)), ...ring.map((p) => studioLocal2dVers3d(p, zMax))];
  const triangles: [number, number, number][] = [];
  const edges: [number, number][] = [];
  const caps: [number, number, number][] = [];
  if (convexe) for (let i = 1; i < n - 1; i++) caps.push([0, i, i + 1]);
  else caps.push(...studioTriangulate(ring));
  for (const [a, b, c] of caps) {
    triangles.push([a, c, b]); // dessous, normale vers -z
    triangles.push([n + a, n + b, n + c]); // dessus, normale vers +z
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangles.push([i, j, n + j], [i, n + j, n + i]);
    edges.push([i, j], [n + i, n + j], [i, n + i]);
  }
  return { vertices, triangles, edges };
}

export function wallSurface(a: StudioPoint, b: StudioPoint, zMin: number, zMax: number): Geometrie3d {
  const vertices = [studioLocal2dVers3d(a, zMin), studioLocal2dVers3d(b, zMin), studioLocal2dVers3d(b, zMax), studioLocal2dVers3d(a, zMax)];
  return { vertices, triangles: [[0, 1, 2], [0, 2, 3]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] };
}

/** Surface verticale le long d'un tracé ouvert discrétisé (arc, polyligne ouverte sans épaisseur). */
export function stripSurface(path: StudioPoint[], zMin: number, zMax: number): Geometrie3d {
  const n = path.length;
  const vertices = [...path.map((p) => studioLocal2dVers3d(p, zMin)), ...path.map((p) => studioLocal2dVers3d(p, zMax))];
  const triangles: [number, number, number][] = [];
  const edges: [number, number][] = [[0, n], [n - 1, 2 * n - 1]];
  for (let i = 0; i < n - 1; i++) {
    triangles.push([i, i + 1, n + i + 1], [i, n + i + 1, n + i]);
    edges.push([i, i + 1], [n + i, n + i + 1]);
  }
  return { vertices, triangles, edges };
}
