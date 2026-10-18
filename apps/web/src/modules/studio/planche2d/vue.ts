/**
 * Vue de la planche 2D : zoom centré sur un point, panoramique, pincement à deux doigts, passage écran → planche,
 * pas de la grille affichée et accrochage à la grille. La vue n'est jamais une donnée du document : rien ici ne
 * produit de commande. Repère `local-2d`, mètres. Pur : ni React ni DOM.
 */
import type { StudioPoint } from "@parcours/atelier-model";
import type { Cadre } from "./geometrie-2d";

/** Largeur de vue admise, en mètres : de 0,5 m à 100 km. */
export const LARGEUR_VUE = Object.freeze({ min: 0.5, max: 100_000 });
/** Rapport d'un cran de zoom par bouton ou par touche. */
export const PAS_ZOOM = 1.25;

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** Facteur appliqué à la largeur, borné pour que la vue reste dans `LARGEUR_VUE`. */
const facteurBorne = (c: Cadre, k: number) => borner(k, LARGEUR_VUE.min / c.w, LARGEUR_VUE.max / c.w);

/**
 * Zoom de facteur `k` sur la largeur (k < 1 rapproche) autour de `centre` : le point de la planche sous `centre`
 * reste au même endroit de l'écran. Le rapport largeur / hauteur est conservé.
 */
export function zoomer(c: Cadre, centre: StudioPoint, k: number): Cadre {
  if (!Number.isFinite(k) || k <= 0) return c;
  const f = facteurBorne(c, k);
  return { x: centre.x - (centre.x - c.x) * f, y: centre.y - (centre.y - c.y) * f, w: c.w * f, h: c.h * f };
}

/** Zoom par bouton ou par touche, centré sur le milieu de la vue. */
export const zoomerAuCentre = (c: Cadre, avant: boolean): Cadre =>
  zoomer(c, { x: c.x + c.w / 2, y: c.y + c.h / 2 }, avant ? 1 / PAS_ZOOM : PAS_ZOOM);

/** Facteur de zoom d'un cran de molette (`deltaY` en pixels ; positif = éloigner), borné à ×2 par événement. */
export function facteurMolette(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  if (!Number.isFinite(px)) return 1;
  return borner(Math.exp(px * 0.0015), 0.5, 2);
}

export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Point de la planche sous un point de l'écran, pour un `<svg>` occupant `r` à l'écran avec le cadre `c` en viewBox
 * (`preserveAspectRatio` par défaut : xMidYMid meet).
 */
export function ecranVersPlanche(c: Cadre, r: Rect, ecran: { x: number; y: number }): StudioPoint {
  const s = Math.min(r.width / c.w, r.height / c.h) || 1;
  const ox = (r.width - c.w * s) / 2, oy = (r.height - c.h * s) / 2;
  return { x: c.x + (ecran.x - r.left - ox) / s, y: c.y + (ecran.y - r.top - oy) / s };
}

/**
 * Panoramique : `depart` est le point saisi (planche, cadre de départ `c`), `courant` le point sous le pointeur
 * lu avec ce même cadre de départ. Le cadre rendu ramène `depart` sous le pointeur.
 */
export const glisserVue = (c: Cadre, depart: StudioPoint, courant: StudioPoint): Cadre =>
  ({ x: c.x + depart.x - courant.x, y: c.y + depart.y - courant.y, w: c.w, h: c.h });

/**
 * Pincement à deux doigts : `depart` = points saisis (planche, cadre de départ `c`), `courant` = points actuels lus
 * avec le cadre de départ. Le cadre rendu garde chaque point saisi sous son doigt (zoom et panoramique ensemble).
 */
export function pincer(c: Cadre, depart: readonly [StudioPoint, StudioPoint], courant: readonly [StudioPoint, StudioPoint]): Cadre {
  const d0 = Math.hypot(depart[1].x - depart[0].x, depart[1].y - depart[0].y);
  const d1 = Math.hypot(courant[1].x - courant[0].x, courant[1].y - courant[0].y);
  const k = d0 > 1e-9 && d1 > 1e-9 ? facteurBorne(c, d0 / d1) : 1;
  const p = { x: (depart[0].x + depart[1].x) / 2, y: (depart[0].y + depart[1].y) / 2 };
  const q = { x: (courant[0].x + courant[1].x) / 2, y: (courant[0].y + courant[1].y) / 2 };
  return { x: p.x - (q.x - c.x) * k, y: p.y - (q.y - c.y) * k, w: c.w * k, h: c.h * k };
}

/** Pas de la grille affichée : une puissance de dix, de 5 à 50 mailles sur la largeur (1 m au cadre initial). */
export function pasGrille(c: Cadre): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(c.w, 1e-9) / 5));
  return Number(p.toPrecision(1));
}

/** Point ramené au nœud le plus proche d'une grille de pas `pas`, sans bruit flottant (micromètre). */
export function surGrille(p: StudioPoint, pas: number): StudioPoint {
  const n = (v: number) => Math.round(Math.round(v / pas) * pas * 1e6) / 1e6 + 0;
  return { x: n(p.x), y: n(p.y) };
}
