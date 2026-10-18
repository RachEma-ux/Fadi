/**
 * Sélection multiple de la planche 2D : bascule (Maj + clic), tout sélectionner, sélection par rectangle à la manière
 * des logiciels de DAO (de gauche à droite : fenêtre, l'objet entièrement dedans ; de droite à gauche : capture, l'objet
 * touché suffit) et commandes de déplacement d'une sélection. Seuls les objets et les cotes affichés et déverrouillés
 * se sélectionnent. Pur : ni React ni DOM.
 */
import type { StudioCommand, StudioDimension, StudioDocument, StudioPoint, StudioShape } from "@parcours/atelier-model";
import { estSelectionnable } from "./calques";
import { traceCote } from "./geometrie-2d";

export type Element2D = StudioShape | StudioDimension;
export type ModeRectangle = "fenetre" | "capture";
export interface Rectangle2D { min: StudioPoint; max: StudioPoint }

/** Objets puis cotes du document, dans l'ordre d'affichage. */
export const elements = (doc: StudioDocument): Element2D[] => [...doc.objects, ...(doc.dimensions ?? [])];

/** Identifiants sélectionnables (affichés, déverrouillés), dans l'ordre du document. */
export const toutSelectionnable = (doc: StudioDocument): string[] =>
  elements(doc).filter((e) => estSelectionnable(doc, e.layerId)).map((e) => e.id);

/** Sélection nettoyée : objets encore présents et sélectionnables, sans doublon, ordre conservé. */
export function selectionValide(doc: StudioDocument, ids: readonly string[]): string[] {
  const ok = new Set(toutSelectionnable(doc));
  return [...new Set(ids)].filter((id) => ok.has(id));
}

/** Maj + clic : ajoute l'objet absent, retire l'objet présent. */
export const basculer = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** Sens du tracé du rectangle : vers la droite = fenêtre, vers la gauche = capture. */
export const modeRectangle = (debut: StudioPoint, fin: StudioPoint): ModeRectangle => (fin.x >= debut.x ? "fenetre" : "capture");

export const rectangleEntre = (a: StudioPoint, b: StudioPoint): Rectangle2D =>
  ({ min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } });

type Segment = readonly [StudioPoint, StudioPoint];

/** Segments dessinés d'un élément (traits de la ligne, côtés du rectangle, lignes d'une cote). */
export function segments(e: Element2D): Segment[] {
  if (e.type === "line") return [[e.start, e.end]];
  if (e.type === "rectangle") {
    const a = e.origin, b = { x: a.x + e.width, y: a.y }, c = { x: a.x + e.width, y: a.y + e.height }, d = { x: a.x, y: a.y + e.height };
    return [[a, b], [b, c], [c, d], [d, a]];
  }
  const g = traceCote(e);
  return [[e.start, g.a], [e.end, g.b], [g.a, g.b]];
}

const dedans = (r: Rectangle2D, p: StudioPoint) => p.x >= r.min.x && p.x <= r.max.x && p.y >= r.min.y && p.y <= r.max.y;

/** Le segment touche-t-il le rectangle (extrémité dedans ou intersection d'un bord) ? Découpage de Liang-Barsky. */
export function segmentTouche(r: Rectangle2D, [a, b]: Segment): boolean {
  if (dedans(r, a) || dedans(r, b)) return true;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - r.min.x], [dx, r.max.x - a.x], [-dy, a.y - r.min.y], [dy, r.max.y - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

/** L'élément est-il retenu par le rectangle selon le mode (fenêtre : entièrement dedans ; capture : touché) ? */
export function retenu(e: Element2D, r: Rectangle2D, mode: ModeRectangle): boolean {
  const s = segments(e);
  return mode === "fenetre" ? s.every(([a, b]) => dedans(r, a) && dedans(r, b)) : s.some((x) => segmentTouche(r, x));
}

/** Sélection par rectangle : éléments sélectionnables retenus, dans l'ordre du document. */
export function selectionParRectangle(doc: StudioDocument, a: StudioPoint, b: StudioPoint): string[] {
  const r = rectangleEntre(a, b), mode = modeRectangle(a, b);
  return elements(doc).filter((e) => estSelectionnable(doc, e.layerId) && retenu(e, r, mode)).map((e) => e.id);
}

/** Union ordonnée (Maj + rectangle : ajoute à la sélection). */
export const ajouter = (ids: readonly string[], autres: readonly string[]): string[] => [...new Set([...ids, ...autres])];

export interface Deplacement {
  /** Une commande `studio.dessin.deplacer` par objet déplacé, dans l'ordre de la sélection. */
  commandes: StudioCommand[];
  /** Cotes liées laissées de côté : elles suivent leurs objets, le modèle refuse de les déplacer seules. */
  cotesLiees: string[];
}

/**
 * Commandes de déplacement d'une sélection de `dx`, `dy` (mètres). Les éléments non sélectionnables (calque masqué
 * ou verrouillé) ne sont jamais déplacés ; un déplacement nul ne produit aucune commande.
 */
export function commandesDeplacement(doc: StudioDocument, ids: readonly string[], dx: number, dy: number): Deplacement {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return { commandes: [], cotesLiees: [] };
  const commandes: StudioCommand[] = [], cotesLiees: string[] = [];
  const parId = new Map(elements(doc).map((e) => [e.id, e]));
  for (const id of selectionValide(doc, ids)) {
    const e = parId.get(id)!;
    if (e.type === "dimension" && (e.links.start || e.links.end)) { cotesLiees.push(id); continue; }
    commandes.push({ toolId: "studio.dessin.deplacer", params: { id, dx, dy } });
  }
  return { commandes, cotesLiees };
}
