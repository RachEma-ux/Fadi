/**
 * Vue de la Planche 2D : passage monde (mètres, y vers le haut) ↔ écran (pixels, y vers le bas). La vue est dérivée :
 * elle ne modifie jamais le document. Pur.
 */
import type { studio2d } from "@parcours/domain-model";

type Point = studio2d.Point;
export interface Vue2D {
  /** Centre de la vue, en mètres. */
  cx: number;
  cy: number;
  /** Pixels par mètre. */
  echelle: number;
}
export const VUE_INITIALE: Vue2D = { cx: 0, cy: 0, echelle: 50 };
export const ECHELLE_MIN = 0.5;
export const ECHELLE_MAX = 5000;

export const versEcran = (v: Vue2D, l: number, h: number, p: Point) => ({ x: l / 2 + (p.x - v.cx) * v.echelle, y: h / 2 - (p.y - v.cy) * v.echelle });
export const versMonde = (v: Vue2D, l: number, h: number, s: { x: number; y: number }): Point => ({ x: v.cx + (s.x - l / 2) / v.echelle, y: v.cy - (s.y - h / 2) / v.echelle });

/** Zoom autour d'un point de l'écran : ce point reste sous le curseur. */
export function zoomer(v: Vue2D, l: number, h: number, s: { x: number; y: number }, facteur: number): Vue2D {
  const echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, v.echelle * facteur));
  const m = versMonde(v, l, h, s);
  return { echelle, cx: m.x - (s.x - l / 2) / echelle, cy: m.y + (s.y - h / 2) / echelle };
}

export const deplacerVue = (v: Vue2D, dx: number, dy: number): Vue2D => ({ ...v, cx: v.cx - dx / v.echelle, cy: v.cy + dy / v.echelle });

/** Cadre l'emprise avec une marge ; sans emprise, revient à la vue initiale. */
export function cadrer(e: { min: Point; max: Point } | null, l: number, h: number): Vue2D {
  if (!e) return VUE_INITIALE;
  const larg = Math.max(e.max.x - e.min.x, 1e-3);
  const haut = Math.max(e.max.y - e.min.y, 1e-3);
  const echelle = Math.min(ECHELLE_MAX, Math.max(ECHELLE_MIN, Math.min((l * 0.8) / larg, (h * 0.8) / haut)));
  return { cx: (e.min.x + e.max.x) / 2, cy: (e.min.y + e.max.y) / 2, echelle };
}

/** Coordonnée arrondie au millimètre : évite le bruit flottant de la souris, sans grille imposée. */
export const auMillimetre = (p: Point): Point => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 });

/** Décalage signé d'une cote : distance du curseur à la droite a–b, positive à gauche de a → b. */
export function decalageSigne(a: Point, b: Point, p: Point): number {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l === 0) return 0;
  return Math.round((((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l) * 1000) / 1000;
}
