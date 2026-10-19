/**
 * Entités d'accrochage : chaque forme du document décomposée en segments, cercles et arcs (repère `local-2d`, mètres),
 * avec ses boîtes englobantes, et l'index qui borne la recherche des candidats à la zone utile (vue + tolérance autour
 * du pointeur). L'index est linéaire aujourd'hui ; l'interface `IndexAccrochage` est celle qu'un index spatial (grille,
 * arbre R) implémentera plus tard sans toucher au moteur. Dérivé, jamais une donnée du document. Pur : ni React ni DOM.
 */
import {
  studioAnchorPoint, studioArcSweep, studioBulgeArc, studioPolylineSegments, studioShapeAnchors, studioShapeBoundPoints,
  type StudioAnchor, type StudioPoint, type StudioShape,
} from "@parcours/atelier-model";

export const DEUX_PI = 2 * Math.PI;

/** Arc parcouru dans le sens trigonométrique de `debut` (radians) sur `balayage` (radians, strictement positif). */
export type Entite =
  | { type: "segment"; objectId: string; a: StudioPoint; b: StudioPoint }
  | { type: "cercle"; objectId: string; c: StudioPoint; r: number }
  | { type: "arc"; objectId: string; c: StudioPoint; r: number; debut: number; balayage: number; /** Arc d'une polyligne (renflement) : son centre n'est pas un sommet nommé. */ renflement: boolean };

export interface Boite { min: StudioPoint; max: StudioPoint }

export const boiteAutour = (p: StudioPoint, d: number): Boite => ({ min: { x: p.x - d, y: p.y - d }, max: { x: p.x + d, y: p.y + d } });
export const seRecouvrent = (a: Boite, b: Boite): boolean => a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y;
export function intersectionBoites(a: Boite, b: Boite): Boite | null {
  const r = { min: { x: Math.max(a.min.x, b.min.x), y: Math.max(a.min.y, b.min.y) }, max: { x: Math.min(a.max.x, b.max.x), y: Math.min(a.max.y, b.max.y) } };
  return r.min.x <= r.max.x && r.min.y <= r.max.y ? r : null;
}

function boiteDe(points: readonly StudioPoint[]): Boite {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { min: { x: x0, y: y0 }, max: { x: x1, y: y1 } };
}

/** Boîte englobante d'une entité (cercle complet pour un arc : prudente, jamais trop petite). */
export function boiteEntite(e: Entite): Boite {
  if (e.type === "segment") return boiteDe([e.a, e.b]);
  return { min: { x: e.c.x - e.r, y: e.c.y - e.r }, max: { x: e.c.x + e.r, y: e.c.y + e.r } };
}

/** Angle ramené dans [0 ; 2π[. */
export const angleNormal = (a: number): number => { const r = a % DEUX_PI; return r < 0 ? r + DEUX_PI : r; };

/** Le point d'angle `angle` (radians) du cercle porteur appartient-il à l'arc (bornes comprises, à 1e-9 près) ? */
export function surArc(e: Extract<Entite, { type: "arc" }>, angle: number): boolean {
  const d = angleNormal(angle - e.debut);
  return d <= e.balayage + 1e-9 || d >= DEUX_PI - 1e-9;
}

/** Arc de renflement normalisé (balayage positif, sens trigonométrique). */
function arcRenflement(objectId: string, a: StudioPoint, b: StudioPoint, bulge: number): Entite | null {
  const arc = studioBulgeArc(a, b, bulge);
  if (!arc) return null;
  const debut = arc.sweep >= 0 ? arc.startAngle : arc.startAngle + arc.sweep;
  return { type: "arc", objectId, c: arc.center, r: arc.radius, debut: angleNormal(debut), balayage: Math.abs(arc.sweep), renflement: true };
}

/** Décomposition d'une forme : ligne → segment, rectangle → 4 côtés, cercle, arc, polyligne → segments et arcs de renflement. */
export function entitesDe(o: StudioShape): Entite[] {
  switch (o.type) {
    case "line": return [{ type: "segment", objectId: o.id, a: o.start, b: o.end }];
    case "rectangle": {
      const { x, y } = o.origin;
      const p = [{ x, y }, { x: x + o.width, y }, { x: x + o.width, y: y + o.height }, { x, y: y + o.height }];
      return p.map((a, i) => ({ type: "segment", objectId: o.id, a, b: p[(i + 1) % 4]! }));
    }
    case "circle": return [{ type: "cercle", objectId: o.id, c: o.center, r: o.radius }];
    case "arc": return [{ type: "arc", objectId: o.id, c: o.center, r: o.radius, debut: angleNormal(o.startAngle), balayage: studioArcSweep(o.startAngle, o.endAngle), renflement: false }];
    case "polyline": return studioPolylineSegments(o).map((s) => (s.bulge ? arcRenflement(o.id, s.a, s.b, s.bulge) : null) ?? { type: "segment", objectId: o.id, a: s.a, b: s.b });
  }
}

/** Forme indexée : ses entités, ses sommets nommés (registre du modèle) et sa boîte. */
export interface FormeIndexee {
  forme: StudioShape;
  /** Rang dans le document : départage déterministe des candidats. */
  rang: number;
  boite: Boite;
  entites: readonly Entite[];
  ancres: readonly { anchor: StudioAnchor; point: StudioPoint }[];
}

/**
 * Index des formes accrochables. `formes(zone)` rend, dans l'ordre du document, les formes dont la boîte (élargie de
 * rien : la zone porte déjà la tolérance) recoupe la zone. Contrat d'un futur index spatial : même résultat, plus vite.
 */
export interface IndexAccrochage {
  readonly taille: number;
  formes(zone: Boite): readonly FormeIndexee[];
}

export function indexerForme(o: StudioShape, rang: number): FormeIndexee {
  const ancres: { anchor: StudioAnchor; point: StudioPoint }[] = [];
  for (const anchor of studioShapeAnchors(o)) {
    const point = studioAnchorPoint(o, anchor);
    if (point) ancres.push({ anchor, point });
  }
  return { forme: o, rang, boite: boiteDe(studioShapeBoundPoints(o)), entites: entitesDe(o), ancres };
}

/** Index linéaire (parcours de toutes les formes, filtré par boîte). */
export function indexLineaire(objects: readonly StudioShape[]): IndexAccrochage {
  const formes = objects.map(indexerForme);
  return { taille: formes.length, formes: (zone) => formes.filter((f) => seRecouvrent(f.boite, zone)) };
}
