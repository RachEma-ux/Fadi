/**
 * Noyau géométrique de Parcours — extrait du module `designer` (Atelier).
 *
 * Provenance : fonctions décodées depuis le payload base64 `EMB.designer` de
 * `Parcours_V8_19_Escalier_B_Mezzanine.html`, assignées globalement à
 * `window.V14Geometry` dans le fichier source (recherche exacte :
 * `window.V14Geometry={model:modelGeometry,faces:prismFaces,draw:drawFaces,
 * cut:cutPrism,intervals:polyIntervals,subtract:subtractIntervals,
 * shape:c=>shapeData(deep(c)),columnPoly:fd3dColumnWorldPoly,wallPoly,stairFoot}`).
 *
 * Ce module porte fidèlement la logique vérifiée dans le code source — pas une
 * réécriture ni une amélioration. Les noms de fonctions et la logique interne
 * sont conservés ; seuls le typage, le formatage et les commentaires sont ajoutés.
 *
 * LIMITE CONNUE ET ASSUMÉE (à ne pas combler par supposition) :
 * `shapeData` dans le source dépend de `originalShapeData`, `columnShapeMeta`
 * et `ensureColumnProps` — le catalogue des profils de poteaux (SHS, L, creux,
 * composite rempli, etc.). Ce catalogue n'a pas été localisé ni extrait dans
 * cette passe : plutôt que d'inventer sa logique, l'extrusion des poteaux est
 * ici rendue optionnelle via un `ColumnShapeResolver` injectable. Sans résolveur
 * fourni, les poteaux sont omis du résultat (voir `buildModelGeometry`) et un
 * avertissement explicite est renvoyé dans `ModelGeometryResult.warnings`.
 */

export type Point2 = readonly [number, number];
export type Point3 = readonly [number, number, number];

export interface Level {
  id: string;
  elevation: number;
  height?: number;
}

export interface Wall {
  id: string;
  a: Point2;
  b: Point2;
  thickness?: number;
  /** `'extérieur-droite'` inverse le sens du décalage perpendiculaire. */
  orientation?: string;
  /** `'face-intérieure' | 'face-extérieure'` décale l'axe du mur sur une face plutôt que son centre. */
  lineRef?: string;
  baseLevel?: string;
  baseOffset?: number;
  topLevel?: string;
  topOffset?: number;
  height?: number;
}

export interface Opening {
  id: string;
  hostWallId: string;
  kind: "door" | "window";
  /** Position normalisée (0–1) le long du mur hôte. */
  t: number;
  width: number;
  /** Hauteur d'allège (fenêtres) ; ignorée pour les portes. */
  sill?: number;
  height?: number;
}

export interface ColumnElement {
  id: string;
  p: Point2;
  angle?: number;
  baseLevel?: string;
  baseOffset?: number;
  topLevel?: string;
  topOffset?: number;
  height?: number;
  shapeId?: string;
  width?: number;
  depth?: number;
  thickness?: number;
  customProfile?: Point2[];
}

export interface Stair {
  id: string;
  a: Point2;
  b: Point2;
  width?: number;
  steps?: number;
  height?: number;
}

export interface PathElement {
  id: string;
  points: Point2[];
}

export interface BuildingModel {
  walls?: Wall[];
  doors?: Opening[];
  windows?: Opening[];
  columns?: ColumnElement[];
  stairs?: Stair[];
  paths?: PathElement[];
}

export interface Prism {
  poly: Point2[];
  holes: Point2[][];
  z0: number;
  z1: number;
  kind: "wall" | "column" | "stairs";
  id: string;
  fill: string;
}

export interface OpeningSurface {
  points: Point3[];
  kind: string;
  id: string;
  fill: string;
  stroke: string;
}

export interface PathGeometry extends PathElement {
  z: number;
}

export interface ModelGeometryResult {
  prisms: Prism[];
  surfaces: OpeningSurface[];
  paths: PathGeometry[];
  /** Avertissements explicites sur ce qui n'a pas pu être calculé (ex. poteaux sans résolveur). */
  warnings: string[];
}

export interface Face {
  points: Point3[];
  holes?: Point3[][];
  fill: string;
  stroke: string;
  kind: string;
  id: string;
  selected?: boolean;
}

/** Résout le profil local (2D, avant rotation/translation) d'un poteau. Non fourni ici — voir limite en tête de fichier. */
export type ColumnShapeResolver = (column: ColumnElement) => {
  solids: Point2[][];
  holes: Point2[][];
  inserts: Point2[][];
};

// ---------------------------------------------------------------------------
// Primitives (vérifiées, sans dépendance externe)
// ---------------------------------------------------------------------------

/** Clone profond par sérialisation JSON — identique au `deep` du source (pas de Map/Set/Date dans ce modèle). */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Distance euclidienne 2D entre deux points — identique à `len(a,b)` du source. */
export function segmentLength(a: Point2, b: Point2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Rotation 2D d'un point autour de l'origine, angle en radians — identique à `rotateLocal`. */
export function rotateLocal(p: Point2, angleRad: number): Point2 {
  const co = Math.cos(angleRad);
  const si = Math.sin(angleRad);
  return [p[0] * co - p[1] * si, p[0] * si + p[1] * co];
}

/** Altitude d'un niveau par son id — identique à `elevationOf`. */
export function elevationOf(levelId: string, levels: readonly Level[]): number {
  return Number(levels.find((level) => level.id === levelId)?.elevation) || 0;
}

export interface VerticalExtentInput {
  baseLevel?: string;
  baseOffset?: number;
  topLevel?: string;
  topOffset?: number;
  height?: number;
}

/** Plage verticale [z0, z1] d'un élément porté par un niveau de base / niveau sommet — identique à `vertical`. */
export function verticalExtent(
  element: VerticalExtentInput,
  level: Level,
  levels: readonly Level[],
): [number, number] {
  const z0 = elevationOf(element.baseLevel || level.id, levels) + (Number(element.baseOffset) || 0);
  const z1 = element.topLevel
    ? elevationOf(element.topLevel, levels) + (Number(element.topOffset) || 0)
    : z0 + (Number(element.height) || Number(level.height) || 0);
  return [z0, Math.max(z0, z1)];
}

/** Contour rectangulaire d'un mur entre deux abscisses `a`/`b` le long de son axe — identique à `wallPoly`. */
export function wallPolygon(wall: Wall, a: Point2 = wall.a, b: Point2 = wall.b): Point2[] {
  const L = segmentLength(a, b) || 1;
  const n: Point2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  const t = Number(wall.thickness) || 0.2;
  const side = wall.orientation === "extérieur-droite" ? -1 : 1;
  const offset =
    wall.lineRef === "face-intérieure" ? (side * t) / 2 : wall.lineRef === "face-extérieure" ? (-side * t) / 2 : 0;
  return ([
    [a, offset + t / 2],
    [b, offset + t / 2],
    [b, offset - t / 2],
    [a, offset - t / 2],
  ] as const).map(([p, d]) => [p[0] + n[0] * d, p[1] + n[1] * d] as Point2);
}

/** Emprise au sol d'un escalier (rectangle centré sur son axe) — identique à `stairFoot`. */
export function stairFootprint(stair: Stair): Point2[] {
  const L = segmentLength(stair.a, stair.b) || 1;
  const u: Point2 = [(stair.b[0] - stair.a[0]) / L, (stair.b[1] - stair.a[1]) / L];
  const n: Point2 = [-u[1], u[0]];
  const half = (Number(stair.width) || 1.2) / 2;
  return ([
    [stair.a, -half],
    [stair.b, -half],
    [stair.b, half],
    [stair.a, half],
  ] as const).map(([p, d]) => [p[0] + n[0] * d, p[1] + n[1] * d] as Point2);
}

/** Place le profil local 2D d'un poteau dans le repère du bâtiment — identique à `fd3dColumnWorldPoly`. */
export function columnWorldPolygon(column: ColumnElement, localPoly: Point2[]): Point2[] {
  const angleRad = ((column.angle || 0) * Math.PI) / 180;
  return localPoly.map((pt) => {
    const q = rotateLocal(pt, angleRad);
    return [column.p[0] + q[0], column.p[1] + q[1]] as Point2;
  });
}

/**
 * Intersections d'un polygone avec une droite perpendiculaire à `axis` (0 = x, 1 = y) à `value`,
 * regroupées par paires en intervalles pleins — identique à `polyIntervals`.
 */
export function polygonIntervalsAtAxis(poly: readonly Point2[], axis: 0 | 1, value: number): Array<[number, number]> {
  const vals: number[] = [];
  const other = (1 - axis) as 0 | 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a[axis] <= value && b[axis] > value) || (b[axis] <= value && a[axis] > value)) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      vals.push(a[other] + t * (b[other] - a[other]));
    }
  }
  vals.sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let i = 1; i < vals.length; i += 2) {
    if (vals[i]! - vals[i - 1]! > 1e-8) out.push([vals[i - 1]!, vals[i]!]);
  }
  return out;
}

/** Soustrait une liste de trous (intervalles) d'une liste d'intervalles source — identique à `subtractIntervals`. */
export function subtractIntervals(
  source: ReadonlyArray<[number, number]>,
  holes: ReadonlyArray<[number, number]>,
): Array<[number, number]> {
  let result: Array<[number, number]> = [...source];
  for (const [a, b] of holes) {
    const out: Array<[number, number]> = [];
    for (const [x, y] of result) {
      if (b <= x || a >= y) {
        out.push([x, y]);
      } else {
        if (a > x) out.push([x, a]);
        if (b < y) out.push([b, y]);
      }
    }
    result = out;
  }
  return result;
}

export interface CutSegment {
  a: number;
  b: number;
  z0: number;
  z1: number;
  kind: Prism["kind"];
  id: string;
}

/** Découpe un prisme (poly + trous) selon un plan perpendiculaire à `axis` — identique à `cutPrism`. */
export function cutPrism(
  prism: Pick<Prism, "poly" | "holes" | "z0" | "z1" | "kind" | "id">,
  axis: 0 | 1,
  value: number,
): CutSegment[] {
  const outer = polygonIntervalsAtAxis(prism.poly, axis, value);
  const holeIntervals = prism.holes.flatMap((h) => polygonIntervalsAtAxis(h, axis, value));
  return subtractIntervals(outer, holeIntervals).map(([a, b]) => ({
    a,
    b,
    z0: prism.z0,
    z1: prism.z1,
    kind: prism.kind,
    id: prism.id,
  }));
}

/** Génère les faces (dessus, dessous, latérales) d'un prisme pour le rendu — identique à `prismFaces`. */
export function prismFaces(prism: Prism): Face[] {
  const faces: Face[] = [];
  for (const z of [prism.z0, prism.z1]) {
    faces.push({
      points: prism.poly.map((p) => [p[0], p[1], z] as Point3),
      holes: prism.holes.map((h) => h.map((p) => [p[0], p[1], z] as Point3)),
      fill: prism.fill,
      stroke: "#294a3b",
      kind: prism.kind,
      id: prism.id,
    });
  }
  for (const loop of [prism.poly, ...prism.holes]) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      faces.push({
        points: [
          [a[0], a[1], prism.z0],
          [b[0], b[1], prism.z0],
          [b[0], b[1], prism.z1],
          [a[0], a[1], prism.z1],
        ],
        fill: prism.fill,
        stroke: "#294a3b",
        kind: prism.kind,
        id: prism.id,
      });
    }
  }
  return faces;
}

/**
 * Le sous-ensemble d'un contexte 2D que `drawFaces` utilise — structurel, pour
 * que ce paquet reste utilisable (et vérifiable) hors navigateur : un
 * `CanvasRenderingContext2D` le satisfait, un contexte de test aussi.
 */
export interface FaceCanvas {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(rule?: "nonzero" | "evenodd"): void;
  stroke(): void;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
}

/**
 * Peint les faces triées par profondeur moyenne projetée (peintre naïf) — identique à `drawFaces`.
 * Reste côté rendu, pas un calcul pur, mais sans dépendance DOM globale (voir `FaceCanvas`).
 */
export function drawFaces(
  ctx: FaceCanvas,
  faces: Face[],
  project: (p: Point3) => Point3,
): void {
  faces.sort(
    (a, b) =>
      a.points.reduce((s, p) => s + project(p)[2], 0) / a.points.length -
      b.points.reduce((s, p) => s + project(p)[2], 0) / b.points.length,
  );
  for (const f of faces) {
    ctx.beginPath();
    for (const loop of [f.points, ...(f.holes ?? [])]) {
      loop.forEach((p, i) => {
        const q = project(p);
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      });
      ctx.closePath();
    }
    ctx.fillStyle = f.fill;
    ctx.fill("evenodd");
    ctx.strokeStyle = f.stroke || "#294a3b";
    ctx.lineWidth = f.selected ? 2 : 1;
    ctx.stroke();
  }
}

const PRISM_FILL_BY_KIND: Record<string, string> = {
  wall: "#607c69",
  column: "#8da27f",
  stairs: "#b8b68a",
};
const DEFAULT_PRISM_FILL = "#849880";

/**
 * Construit la géométrie 3D (prismes, surfaces d'ouverture, chemins) d'un niveau — identique à `modelGeometry`.
 *
 * Portage fidèle des boucles murs / portes-fenêtres / escaliers / chemins.
 * Boucle poteaux : fonctionnelle seulement si `columnShapeResolver` est fourni
 * (voir la limite documentée en tête de fichier) ; sinon les poteaux sont
 * omis et signalés dans `warnings`, jamais silencieusement inventés.
 */
export function buildModelGeometry(
  model: BuildingModel,
  level: Level,
  levels: readonly Level[],
  columnShapeResolver?: ColumnShapeResolver,
): ModelGeometryResult {
  const prisms: Prism[] = [];
  const surfaces: OpeningSurface[] = [];
  const paths: PathGeometry[] = [];
  const warnings: string[] = [];

  const put = (
    poly: Point2[],
    z0: number,
    z1: number,
    kind: Prism["kind"],
    id: string,
    holes: Point2[][] = [],
    fill: string | null = null,
  ) => {
    if (poly.length >= 3 && z1 > z0) {
      prisms.push({ poly, holes, z0, z1, kind, id, fill: fill || PRISM_FILL_BY_KIND[kind] || DEFAULT_PRISM_FILL });
    }
  };

  for (const w0 of model.walls ?? []) {
    const w = deepClone(w0);
    const L = segmentLength(w.a, w.b);
    if (L < 1e-7) continue;
    const [z0, z1] = verticalExtent(w, level, levels);
    const ops = [...(model.doors ?? []), ...(model.windows ?? [])]
      .filter((o) => o.hostWallId === w.id)
      .map((o) => {
        const center = Math.max(0, Math.min(L, (Number(o.t) || 0) * L));
        const a = Math.max(0, center - o.width / 2);
        const b = Math.min(L, center + o.width / 2);
        const bottom = z0 + (o.kind === "door" ? 0 : Number(o.sill ?? 0.9));
        const top = Math.min(z1, bottom + Number(o.height || 2.1));
        return { ...o, a, b, bottom, top };
      });
    const xs = [0, L, ...ops.flatMap((o) => [o.a, o.b])]
      .sort((a, b) => a - b)
      .filter((n, i, arr) => !i || n - arr[i - 1]! > 1e-8);
    const at = (d: number): Point2 => [w.a[0] + (w.b[0] - w.a[0]) * (d / L), w.a[1] + (w.b[1] - w.a[1]) * (d / L)];

    for (let i = 1; i < xs.length; i++) {
      const x = (xs[i - 1]! + xs[i]!) / 2;
      const voids = ops
        .filter((o) => x > o.a - 1e-8 && x < o.b + 1e-8)
        .map((o): [number, number] => [o.bottom, o.top]);
      const zs = [z0, z1, ...voids.flat()].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
      for (let j = 1; j < zs.length; j++) {
        const z = (zs[j]! + zs[j - 1]!) / 2;
        if (voids.some(([a, b]) => z > a && z < b)) continue;
        put(wallPolygon(w, at(xs[i - 1]!), at(xs[i]!)), zs[j - 1]!, zs[j]!, "wall", w.id);
      }
    }

    for (const o of ops) {
      const a = at(o.a);
      const b = at(o.b);
      surfaces.push({
        points: [
          [a[0], a[1], o.bottom],
          [b[0], b[1], o.bottom],
          [b[0], b[1], o.top],
          [a[0], a[1], o.top],
        ],
        kind: o.kind,
        id: o.id,
        fill: o.kind === "window" ? "rgba(158,202,208,.38)" : "rgba(210,195,151,.6)",
        stroke: o.kind === "window" ? "#3f7a78" : "#8a7139",
      });
    }
  }

  if ((model.columns ?? []).length > 0 && !columnShapeResolver) {
    warnings.push(
      `${model.columns!.length} poteau(x) non extrudé(s) : le catalogue de profils (shapeData/originalShapeData) ` +
        "n'a pas été porté dans cette phase — fournir un columnShapeResolver pour les inclure.",
    );
  }
  if (columnShapeResolver) {
    for (const c0 of model.columns ?? []) {
      const col = deepClone({ ...c0, baseLevel: c0.baseLevel || level.id });
      const shape = columnShapeResolver(col);
      const [z0, z1] = verticalExtent(col, level, levels);
      for (const poly of shape.solids) {
        put(
          columnWorldPolygon(col, poly),
          z0,
          z1,
          "column",
          col.id,
          shape.holes.map((h) => columnWorldPolygon(col, h)),
        );
      }
      for (const poly of shape.inserts) {
        put(columnWorldPolygon(col, poly), z0, z1, "column", col.id, [], "#3f5f55");
      }
    }
  }

  for (const st of model.stairs ?? []) {
    const L = segmentLength(st.a, st.b);
    if (!L) continue;
    const z0 = Number(level.elevation) || 0;
    const H = Number(st.height) || Number(level.height) || 0;
    const n = Math.max(2, Math.min(200, Math.round(st.steps || 12)));
    const foot = stairFootprint(st);
    for (let i = 0; i < n; i++) {
      const at = (a: Point2, b: Point2, t: number): Point2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const a = at(foot[0]!, foot[1]!, i / n);
      const b = at(foot[0]!, foot[1]!, (i + 1) / n);
      const c = at(foot[3]!, foot[2]!, (i + 1) / n);
      const d = at(foot[3]!, foot[2]!, i / n);
      put([a, b, c, d], z0, z0 + (H * (i + 1)) / n, "stairs", st.id);
    }
  }

  for (const p of model.paths ?? []) {
    if (p.points?.length > 1) paths.push({ ...p, z: Number(level.elevation) || 0 });
  }

  return { prisms, surfaces, paths, warnings };
}
