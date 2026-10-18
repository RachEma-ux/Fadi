/**
 * Géométrie d'affichage de la planche 2D : cadrage (viewBox), accrochage aux sommets, tracé et valeur des cotes.
 * Repère `local-2d`, mètres, coordonnées SVG = coordonnées du document (aucune conversion cachée). Dérivé : rien ici
 * ne modifie le document. Pur : ni React ni DOM.
 */
import {
  STUDIO_LINE_ANCHORS, STUDIO_RECTANGLE_ANCHORS, studioAnchorPoint, type StudioAnchor, type StudioDimension, type StudioDimensionLink,
  type StudioDocument, type StudioPoint, type StudioShape,
} from "@parcours/atelier-model";

export interface Cadre { x: number; y: number; w: number; h: number }
export const CADRE_INITIAL: Cadre = Object.freeze({ x: -2, y: -2, w: 24, h: 18 });
const RAPPORT = CADRE_INITIAL.w / CADRE_INITIAL.h;

export const viewBox = (c: Cadre): string => `${c.x} ${c.y} ${c.w} ${c.h}`;

/** Point arrondi au centimètre : supprime le bruit du pointeur sans imposer de grille. */
export const auCentimetre = (p: StudioPoint): StudioPoint => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });

export interface Emprise { min: StudioPoint; max: StudioPoint }

/** Emprise des objets et des cotes affichés (`visible` filtre par calque) ; null si rien n'est affiché. */
export function emprise(doc: StudioDocument, visible: (layerId: string | undefined) => boolean): Emprise | null {
  const points: StudioPoint[] = [];
  for (const o of doc.objects) {
    if (!visible(o.layerId)) continue;
    if (o.type === "line") points.push(o.start, o.end);
    else points.push(o.origin, { x: o.origin.x + o.width, y: o.origin.y + o.height });
  }
  for (const d of doc.dimensions ?? []) {
    if (!visible(d.layerId)) continue;
    const g = traceCote(d);
    points.push(d.start, d.end, g.a, g.b);
  }
  if (!points.length) return null;
  return {
    min: { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) },
    max: { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)) },
  };
}

/** Cadre l'emprise avec une marge, au rapport de la planche ; sans emprise, revient au cadre initial. */
export function cadrer(e: Emprise | null, marge = 0.1): Cadre {
  if (!e) return CADRE_INITIAL;
  let w = Math.max(e.max.x - e.min.x, 1);
  let h = Math.max(e.max.y - e.min.y, 1);
  w *= 1 + 2 * marge;
  h *= 1 + 2 * marge;
  if (w / h > RAPPORT) h = w / RAPPORT;
  else w = h * RAPPORT;
  const cx = (e.min.x + e.max.x) / 2, cy = (e.min.y + e.max.y) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// ——— Accrochage ———

export interface PointAccroche { point: StudioPoint; objectId: string; anchor: StudioAnchor }

/** Sommets nommés des objets affichés : extrémités de ligne, coins de rectangle. */
export function pointsAccroche(objects: readonly StudioShape[], visible: (layerId: string | undefined) => boolean): PointAccroche[] {
  const out: PointAccroche[] = [];
  for (const o of objects) {
    if (!visible(o.layerId)) continue;
    for (const anchor of o.type === "line" ? STUDIO_LINE_ANCHORS : STUDIO_RECTANGLE_ANCHORS) {
      const point = studioAnchorPoint(o, anchor);
      if (point) out.push({ point, objectId: o.id, anchor });
    }
  }
  return out;
}

/** Sommet le plus proche à `tolerance` (mètres) au plus ; à égalité, le premier rencontré. */
export function accrocher(points: readonly PointAccroche[], p: StudioPoint, tolerance: number): PointAccroche | null {
  let best: PointAccroche | null = null, dist = Infinity;
  for (const c of points) {
    const d = Math.hypot(c.point.x - p.x, c.point.y - p.y);
    if (d <= tolerance && d < dist) { best = c; dist = d; }
  }
  return best;
}

/** Sommet exactement confondu avec `p` (saisie numérique) : une cote saisie sur un sommet lui est liée. */
export const sommetExact = (points: readonly PointAccroche[], p: StudioPoint): PointAccroche | null =>
  points.find((c) => c.point.x === p.x && c.point.y === p.y) ?? null;

// ——— Cotes ———

const lien = (a: PointAccroche | null): StudioDimensionLink | null => (a ? { objectId: a.objectId, anchor: a.anchor } : null);

/** Cote saisie : une extrémité accrochée reprend exactement le sommet et lui est liée. */
export function nouvelleCote(id: string, debut: { point: StudioPoint; accroche: PointAccroche | null }, fin: { point: StudioPoint; accroche: PointAccroche | null }, offset: number, layerId?: string): StudioDimension {
  return {
    id, type: "dimension", ...(layerId ? { layerId } : {}),
    start: { ...(debut.accroche?.point ?? debut.point) }, end: { ...(fin.accroche?.point ?? fin.point) },
    offset, links: { start: lien(debut.accroche), end: lien(fin.accroche) }, toResolve: false,
  };
}

export interface TraceCote {
  /** Extrémités de la ligne de cote, décalées de `offset` (normale à gauche de début → fin). */
  a: StudioPoint;
  b: StudioPoint;
  /** Position et orientation (degrés, lisible : entre −90 et 90) du texte. */
  texte: StudioPoint;
  angle: number;
}

export function traceCote(d: Pick<StudioDimension, "start" | "end" | "offset">): TraceCote {
  const dx = d.end.x - d.start.x, dy = d.end.y - d.start.y;
  const l = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / l, y: dx / l };
  const a = { x: d.start.x + n.x * d.offset, y: d.start.y + n.y * d.offset };
  const b = { x: d.end.x + n.x * d.offset, y: d.end.y + n.y * d.offset };
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const recul = d.offset >= 0 ? 0.18 : -0.18;
  return { a, b, texte: { x: (a.x + b.x) / 2 + n.x * recul, y: (a.y + b.y) / 2 + n.y * recul }, angle };
}

/**
 * Valeur mesurée d'une cote, même règle que `measureStudioDimension` (contrôlé par test) mais sans revalider tout le
 * document à chaque cote affichée : null (« non évaluée ») tant qu'elle est à résoudre.
 */
export const valeurCote = (d: Pick<StudioDimension, "start" | "end" | "toResolve">): number | null =>
  d.toResolve ? null : Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);

/** Valeur en mètres au format de la langue (fr-FR : « 4,00 m »), deux à trois décimales. */
export function formaterMetres(v: number, locale: string): string {
  return `${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} m`;
}
