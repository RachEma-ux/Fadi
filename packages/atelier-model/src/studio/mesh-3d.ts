import { studioArcPoints, studioArcSweep, studioCirclePoints, studioPolylinePath, studioShapeOutline, studioTriangulate } from "./courbes.js";
import { studioLayerState, validateStudioDocument, type StudioDocument, type StudioLine, type StudioPoint, type StudioRectangle, type StudioShape } from "./document-2d.js";

/**
 * Vue 3D dérivée d'un document Studio (`studio-document/1`). Le document reste dans le repère `local-2d` (mètres) ; la
 * géométrie 3D est produite dans un repère déclaré `local-3d` (z vers le haut, mètres) par une conversion explicite
 * (`studioLocal2dVers3d` : (x, y) du plan → (x, y, z)), jamais stockée. Seuls les objets dont l'utilisateur a déclaré
 * l'extrusion deviennent des volumes ; les autres sont comptés « non extrudés » et rendus comme contours plats à z = 0.
 * Aucune hauteur ni épaisseur n'est supposée. Pur : ni React, ni DOM, ni moteur de rendu.
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
  type: StudioShape["type"];
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

/** Contour plat (z = 0) d'un objet non extrudé, discrétisé pour les courbes ; `closed` pour une forme fermée. */
export interface StudioOutline3d {
  id: string;
  type: StudioShape["type"];
  layerId?: string;
  points: StudioPoint3[];
  closed: boolean;
}

export interface StudioMesh3d {
  frame: typeof STUDIO_FRAME_3D;
  units: "m";
  /** Repère du document source et règle de conversion appliquée. */
  source: { frame: "local-2d"; conversion: "(x, y) → (x, y, z)" };
  solids: StudioSolid3d[];
  outlines: StudioOutline3d[];
  /** Objets visibles sans extrusion déclarée (rendus à plat). */
  nonExtruded: number;
  /** Objets des calques masqués, ni comptés ni rendus. */
  hidden: number;
  /** Emprise de tout ce qui est rendu ; null si rien n'est rendu. */
  bounds: { min: StudioPoint3; max: StudioPoint3 } | null;
}

function footprint(o: StudioLine | StudioRectangle, thickness: number | undefined): StudioPoint[] | null {
  if (o.type === "rectangle") {
    const { x, y } = o.origin;
    return [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }];
  }
  if (thickness === undefined) return null;
  const dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
  const l = Math.hypot(dx, dy);
  // Normale à gauche, demi-épaisseur de part et d'autre de la ligne.
  const nx = (-dy / l) * (thickness / 2), ny = (dx / l) * (thickness / 2);
  return [
    { x: o.start.x - nx, y: o.start.y - ny },
    { x: o.end.x - nx, y: o.end.y - ny },
    { x: o.end.x + nx, y: o.end.y + ny },
    { x: o.start.x + nx, y: o.start.y + ny },
  ];
}

const signedArea = (p: readonly StudioPoint[]) => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + a.x * b.y - b.x * a.y; }, 0) / 2;

/**
 * Prisme droit sur un anneau : faces du dessous et du dessus en éventail pour une emprise convexe (rectangle, mur droit,
 * cercle), par oreilles sinon (polyligne fermée, mur courbe), puis faces latérales.
 */
function prism(base: StudioPoint[], zMin: number, zMax: number, convexe = true): Pick<StudioSolid3d, "vertices" | "triangles" | "edges"> {
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

function wallSurface(a: StudioPoint, b: StudioPoint, zMin: number, zMax: number): Pick<StudioSolid3d, "vertices" | "triangles" | "edges"> {
  const vertices = [studioLocal2dVers3d(a, zMin), studioLocal2dVers3d(b, zMin), studioLocal2dVers3d(b, zMax), studioLocal2dVers3d(a, zMax)];
  return { vertices, triangles: [[0, 1, 2], [0, 2, 3]], edges: [[0, 1], [1, 2], [2, 3], [3, 0]] };
}

/** Surface verticale le long d'un tracé ouvert discrétisé (arc, polyligne ouverte sans épaisseur). */
function stripSurface(path: StudioPoint[], zMin: number, zMax: number): Pick<StudioSolid3d, "vertices" | "triangles" | "edges"> {
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

/** Géométrie d'un objet extrudé, ou null si l'extrusion n'y a pas de sens (jamais pour un document valide). */
function solid(o: StudioShape, zMin: number, zMax: number): { kind: StudioSolid3d["kind"]; geometry: Pick<StudioSolid3d, "vertices" | "triangles" | "edges"> } | null {
  switch (o.type) {
    case "line": {
      const ring = footprint(o, o.extrusion?.thickness);
      return ring ? { kind: "prism", geometry: prism(ring, zMin, zMax) } : { kind: "wall-surface", geometry: wallSurface(o.start, o.end, zMin, zMax) };
    }
    case "rectangle": return { kind: "prism", geometry: prism(footprint(o, undefined)!, zMin, zMax) };
    case "circle": return { kind: "prism", geometry: prism(studioCirclePoints(o.center, o.radius), zMin, zMax) };
    case "arc": {
      const sweep = studioArcSweep(o.startAngle, o.endAngle);
      const t = o.extrusion?.thickness;
      if (t === undefined) return { kind: "wall-surface", geometry: stripSurface(studioArcPoints(o.center, o.radius, o.startAngle, sweep), zMin, zMax) };
      // Mur courbe centré sur l'arc : bord extérieur puis bord intérieur parcouru en retour.
      const ring = [...studioArcPoints(o.center, o.radius + t / 2, o.startAngle, sweep), ...studioArcPoints(o.center, o.radius - t / 2, o.startAngle, sweep).reverse()];
      return { kind: "prism", geometry: prism(ring, zMin, zMax, false) };
    }
    case "polyline": {
      const path = studioPolylinePath(o);
      return o.closed ? { kind: "prism", geometry: prism(path, zMin, zMax, false) } : { kind: "wall-surface", geometry: stripSurface(path, zMin, zMax) };
    }
  }
}

function outline(o: StudioShape): StudioOutline3d {
  const { points, closed } = studioShapeOutline(o);
  return { id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), points: points.map((p) => studioLocal2dVers3d(p, 0)), closed };
}

/** Géométrie 3D dérivée du document (validé d'abord) ; les calques masqués ne sont pas rendus. */
export function studioMesh3d(document: StudioDocument): StudioMesh3d {
  const doc = validateStudioDocument(document);
  const solids: StudioSolid3d[] = [];
  const outlines: StudioOutline3d[] = [];
  let hidden = 0;
  for (const o of doc.objects) {
    if (!studioLayerState(doc, o.layerId)?.visible) { hidden++; continue; }
    const e = o.extrusion;
    if (!e) { outlines.push(outline(o)); continue; }
    const s = solid(o, e.base, e.base + e.height);
    if (!s) continue;
    solids.push({ id: o.id, type: o.type, ...(o.layerId !== undefined ? { layerId: o.layerId } : {}), kind: s.kind, ...s.geometry });
  }
  let bounds: StudioMesh3d["bounds"] = null;
  // Boucle plutôt qu'un étalement : 20 000 objets donnent trop de sommets pour Math.min(...).
  for (const p of [...solids.flatMap((s) => s.vertices), ...outlines.flatMap((l) => l.points)]) {
    if (!bounds) { bounds = { min: { ...p }, max: { ...p } }; continue; }
    bounds.min = { x: Math.min(bounds.min.x, p.x), y: Math.min(bounds.min.y, p.y), z: Math.min(bounds.min.z, p.z) };
    bounds.max = { x: Math.max(bounds.max.x, p.x), y: Math.max(bounds.max.y, p.y), z: Math.max(bounds.max.z, p.z) };
  }
  return { frame: STUDIO_FRAME_3D, units: "m", source: { frame: "local-2d", conversion: "(x, y) → (x, y, z)" }, solids, outlines, nonExtruded: outlines.length, hidden, bounds };
}
