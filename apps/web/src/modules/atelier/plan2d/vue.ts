/**
 * Cadre de vue du plan : conversions écran (px CSS, y vers le bas) ⇄ mètres du repère local (y vers le haut),
 * pan, zoom, ajustement à l'emprise. Paramètre d'affichage pur (R10) : jamais dans le modèle.
 */
import type { Rectangle, Vec } from "./geometrie";

export interface CadreVue {
  /** Pixels CSS par mètre. */
  readonly zoom: number;
  /** Coordonnées en mètres du point affiché au coin haut-gauche de la zone. */
  readonly origineX: number;
  readonly origineY: number;
  /** Taille de la zone en px CSS. */
  readonly largeur: number;
  readonly hauteur: number;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4000;

export const CADRE_INITIAL: CadreVue = { zoom: 40, origineX: -2, origineY: 12, largeur: 800, hauteur: 600 };

export function versMetres(c: CadreVue, ecran: Vec): Vec {
  return { x: c.origineX + ecran.x / c.zoom, y: c.origineY - ecran.y / c.zoom };
}

export function versEcran(c: CadreVue, m: Vec): Vec {
  return { x: (m.x - c.origineX) * c.zoom, y: (c.origineY - m.y) * c.zoom };
}

/** Tolérance en pixels convertie en mètres au zoom courant. */
export const pixelsEnMetres = (c: CadreVue, px: number): number => px / c.zoom;

export function deplacerVue(c: CadreVue, dxEcran: number, dyEcran: number): CadreVue {
  return { ...c, origineX: c.origineX - dxEcran / c.zoom, origineY: c.origineY + dyEcran / c.zoom };
}

/** Zoom par `facteur` en gardant fixe le point écran `pivot`. */
export function zoomerVue(c: CadreVue, facteur: number, pivot: Vec): CadreVue {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * facteur));
  const m = versMetres(c, pivot);
  return { ...c, zoom, origineX: m.x - pivot.x / zoom, origineY: m.y + pivot.y / zoom };
}

/** Facteur de zoom d'un cran de molette (`deltaY` en px). */
export const facteurMolette = (deltaY: number): number => Math.exp(-deltaY * 0.0015);

export function redimensionner(c: CadreVue, largeur: number, hauteur: number): CadreVue {
  return largeur === c.largeur && hauteur === c.hauteur ? c : { ...c, largeur, hauteur };
}

/** Cadre qui montre toute l'emprise avec une marge (px). Emprise vide ou nulle : cadre centré sur l'emprise. */
export function ajusterEmprise(c: CadreVue, r: Rectangle | null, marge = 24): CadreVue {
  if (!r) return c;
  const l = Math.max(r.maxX - r.minX, 1e-3);
  const h = Math.max(r.maxY - r.minY, 1e-3);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((c.largeur - 2 * marge) / l, (c.hauteur - 2 * marge) / h)));
  const cx = (r.minX + r.maxX) / 2;
  const cy = (r.minY + r.maxY) / 2;
  return { ...c, zoom, origineX: cx - c.largeur / (2 * zoom), origineY: cy + c.hauteur / (2 * zoom) };
}

/** Rectangle visible, en mètres. */
export function rectangleVisible(c: CadreVue): Rectangle {
  return { minX: c.origineX, maxX: c.origineX + c.largeur / c.zoom, minY: c.origineY - c.hauteur / c.zoom, maxY: c.origineY };
}

/**
 * Lignes de grille à dessiner (en px écran) : pas de base `pas` (0,50 m), multiplié par 10 tant que l'écart
 * à l'écran est inférieur à `ecartMinPx` (lisibilité). Rend le pas retenu.
 */
export function lignesGrille(c: CadreVue, pas: number, ecartMinPx = 8): { pas: number; verticales: number[]; horizontales: number[] } {
  let p = pas;
  while (p * c.zoom < ecartMinPx) p *= 10;
  const v = rectangleVisible(c);
  const verticales: number[] = [];
  const horizontales: number[] = [];
  for (let x = Math.ceil(v.minX / p) * p; x <= v.maxX; x += p) verticales.push((x - c.origineX) * c.zoom);
  for (let y = Math.ceil(v.minY / p) * p; y <= v.maxY; y += p) horizontales.push((c.origineY - y) * c.zoom);
  return { pas: p, verticales, horizontales };
}

/** Transformation SVG « mètres → écran » (y retourné). */
export const transformationSvg = (c: CadreVue): string => `matrix(${c.zoom} 0 0 ${-c.zoom} ${-c.origineX * c.zoom} ${c.origineY * c.zoom})`;
