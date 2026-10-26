import { prism, type Geometrie3d } from "../exporteurs/maillage.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioLadder } from "./types.js";

/**
 * Géométrie dérivée d'une échelle d'accès (EX-027, lot G2), jamais stockée. Repère `local-2d` en plan, `local-3d` en
 * volume (z = cote). Notations : `u` = direction de la largeur (`rotation`), `n` = normale à gauche de `u` ; le montant
 * k (k = 1, 2) a pour axe `position ∓ (width / 2) u` ; l'échelon j (j = 1…rungs) a son axe à la cote
 * `base + j · pas`, `pas = height / (rungs + 1)`, entre les faces intérieures des montants.
 *
 * Plan : les deux sections carrées des montants et le contour commun des échelons (tous superposés en plan) ; emprise :
 * le rectangle qui les contient. Volume : un prisme par montant et par échelon. Métré : seulement des valeurs dérivées
 * des saisies (longueurs, volume de matière), aucune masse (aucune masse volumique n'est portée). Pur.
 */
export interface GeometrieEchelle {
  u: StudioPoint;
  n: StudioPoint;
  /** Sections des deux montants (carrés, sens trigonométrique). */
  montants: [StudioPoint[], StudioPoint[]];
  /** Contour des échelons en plan (entre les faces intérieures des montants). */
  echelons: StudioPoint[];
  /** Rectangle d'emprise (montants compris). */
  emprise: StudioPoint[];
  /** Pas des échelons (m) et cote de l'axe de chaque échelon. */
  pas: number;
  cotesEchelons: number[];
}

const net = (v: number) => (Object.is(v, -0) ? 0 : Math.abs(v) < 1e-15 ? 0 : v);
const pt = (x: number, y: number): StudioPoint => ({ x: net(x), y: net(y) });

/** Rectangle centré en `c`, de demi-côtés `a` (selon u) et `b` (selon n), sens trigonométrique. */
function rectangle(c: StudioPoint, u: StudioPoint, n: StudioPoint, a: number, b: number): StudioPoint[] {
  return [
    pt(c.x - a * u.x - b * n.x, c.y - a * u.y - b * n.y), pt(c.x + a * u.x - b * n.x, c.y + a * u.y - b * n.y),
    pt(c.x + a * u.x + b * n.x, c.y + a * u.y + b * n.y), pt(c.x - a * u.x + b * n.x, c.y - a * u.y + b * n.y),
  ];
}

export function geometrieEchelle(e: StudioLadder): GeometrieEchelle {
  const u = { x: Math.cos(e.rotation), y: Math.sin(e.rotation) };
  const n = { x: -u.y, y: u.x };
  const h = e.section / 2, demi = e.width / 2;
  const axe = (k: -1 | 1) => ({ x: e.position.x + k * demi * u.x, y: e.position.y + k * demi * u.y });
  const pas = e.height / (e.rungs + 1);
  return {
    u: pt(u.x, u.y), n: pt(n.x, n.y),
    montants: [rectangle(axe(-1), u, n, h, h), rectangle(axe(1), u, n, h, h)],
    echelons: rectangle(e.position, u, n, demi - h, h),
    emprise: rectangle(e.position, u, n, demi + h, h),
    pas,
    cotesEchelons: Array.from({ length: e.rungs }, (_, j) => e.base + (j + 1) * pas),
  };
}

/** Prismes de l'échelle (montants puis échelons), repère `local-3d`. */
export function volumesEchelle(e: StudioLadder): Geometrie3d[] {
  const g = geometrieEchelle(e), h = e.section / 2;
  return [
    ...g.montants.map((m) => prism(m, e.base, e.base + e.height)),
    ...g.cotesEchelons.map((z) => prism(g.echelons, z - h, z + h)),
  ];
}

/** Métré dérivé d'une échelle (valeurs saisies seulement, sans arrondi). */
export interface MetreEchelle {
  hauteur: number;
  echelons: number;
  pas: number;
  /** Longueur cumulée des deux montants (m). */
  longueurMontants: number;
  /** Longueur cumulée des échelons entre les faces intérieures des montants (m). */
  longueurEchelons: number;
  /** Volume de matière (m³) : montants et échelons, sections carrées saisies. */
  volume: number;
}

export function metreEchelle(e: StudioLadder): MetreEchelle {
  const s2 = e.section * e.section, entre = e.width - e.section;
  const longueurMontants = 2 * e.height, longueurEchelons = e.rungs * entre;
  return { hauteur: e.height, echelons: e.rungs, pas: e.height / (e.rungs + 1), longueurMontants, longueurEchelons, volume: s2 * (longueurMontants + longueurEchelons) };
}
