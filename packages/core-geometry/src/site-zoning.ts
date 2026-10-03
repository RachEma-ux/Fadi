/**
 * Zonage d'organisation du terrain — porté tel quel de `h7-app` (Parcours
 * V7, Harmonie par étape) du prototype : `triangulate`, `clip`, `cutArea`,
 * `sumArea` et `zoning`. Les propositions de site A/B/C de l'étape 01
 * découpent le contour de la parcelle, exprimé dans un repère local
 * (origine au centroïde, mètres), en quatre zones d'intention dont les
 * surfaces suivent des taux fixés par variante.
 *
 * Ces surfaces décrivent des zones d'intention : le « secteur d'implantation
 * à étudier » n'est ni une emprise autorisée, ni une dalle, ni une surface
 * intérieure. Aucune parcelle rectangulaire de remplacement n'est créée
 * quand le contour est absent ou dégénéré : la fonction renvoie `null`.
 *
 * Repère : coordonnées LOCALES (voir `LocalCoordinate` du domaine) ; le
 * centrage est fait par l'appelant (`siteContext`). Rien n'est converti ici.
 * Relecture L1.5 : le repère local est marqué au niveau du type (`Point2Local`) ; les primitives (`triangulate`,
 * `clipHalfPlane`, `cutArea`, `vertexCentroid`) rendent leurs points dans le repère de l'entrée ; tolérances D-012
 * reçues en paramètre facultatif (seuils historiques par défaut).
 */
import type { Point2 } from "./geometry.js";
import { polygonArea, signedArea } from "./parcel-geometry.js";
import type { Point2Local } from "./reperes.js";
import { resoudreTolerance, TOLERANCES_HISTORIQUES, type TolerancesGeometrie } from "./tolerances.js";

const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/**
 * Triangulation par « oreilles » du contour (orienté anti-horaire au besoin). Lève sur un contour dégénéré ou
 * auto-intersecté. Triangles dans le repère de l'entrée, toujours anti-horaires.
 * Cas dégénérés : moins de 3 sommets → `[]` ; plus de 2000 sommets → erreur explicite ; exactement 3 sommets → le
 * triangle tel quel, même d'aire nulle. Seuil des tests d'oreille : 1e-9 m² (historique, non paramétrable).
 * Le garde-fou `n²` de la boucle ne peut pas être atteint (chaque tour retire un sommet ou lève).
 */
export function triangulate<P extends Point2>(poly: readonly P[]): P[][] {
  const eps = TOLERANCES_HISTORIQUES.produitVectorielTriangulation;
  let q: P[] = poly.map((p) => [p[0], p[1]] as Point2 as P);
  if (q.length < 3) return [];
  if (q.length > 2000) throw new Error("Contour trop détaillé pour ce schéma : simplification contrôlée requise.");
  if (signedArea(q) < 0) q.reverse();
  const result: P[][] = [];
  let guard = 0;
  while (q.length > 3 && guard++ < poly.length * poly.length) {
    let found = false;
    for (let i = 0; i < q.length; i++) {
      const a = q[(i - 1 + q.length) % q.length]!;
      const b = q[i]!;
      const c = q[(i + 1) % q.length]!;
      if (cross(a, b, c) < eps) continue;
      const inside = q.some((p, j) => j !== i && j !== (i - 1 + q.length) % q.length && j !== (i + 1) % q.length && cross(a, b, p) >= -eps && cross(b, c, p) >= -eps && cross(c, a, p) >= -eps);
      if (inside) continue;
      result.push([a, b, c]);
      q.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error("Contour dégénéré ou auto-intersecté : schéma non calculé.");
  }
  if (q.length === 3) result.push(q);
  return result;
}

/**
 * Partie du polygone du côté `axis·p ≤ t` (`low`) ou `≥ t` ; vide si l'aire restante est négligeable.
 * `axis` est une direction (unitaire chez les appelants), sans repère. Tolérances : `tol.tolCoincidence` (marge du
 * test de côté, historique 1e-9 m), `tol.aireMin` (aire minimale du morceau, historique 1e-8 m²).
 * Exact pour un polygone convexe ; un polygone concave peut donner un contour à arêtes doubles (non simple).
 */
export function clipHalfPlane<P extends Point2>(
  poly: readonly P[],
  axis: Point2,
  t: number,
  low = true,
  tol?: TolerancesGeometrie,
): P[] {
  const marge = resoudreTolerance(tol, "tolCoincidence", TOLERANCES_HISTORIQUES.coteDemiPlan);
  const aireMin = resoudreTolerance(tol, "aireMin", TOLERANCES_HISTORIQUES.aireDecoupeMin);
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const va = a[0] * axis[0] + a[1] * axis[1] - t;
    const vb = b[0] * axis[0] + b[1] * axis[1] - t;
    const ia = low ? va <= marge : va >= -marge;
    const ib = low ? vb <= marge : vb >= -marge;
    if (ia) out.push(a);
    if (ia !== ib) {
      const u = va / (va - vb);
      out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])] as Point2 as P);
    }
  }
  return out.length >= 3 && polygonArea(out) > aireMin ? out : [];
}

export const sumArea = (polys: readonly (readonly Point2[])[]): number => polys.reduce((s, p) => s + polygonArea(p), 0);

/**
 * Coupe un ensemble de polygones par une droite perpendiculaire à `axis`
 * de sorte que la partie « basse » ait l'aire `wanted` (dichotomie, 48
 * itérations comme dans le prototype). Renvoie [basse, haute].
 * Cas dégénérés : aucun sommet → [[], []] ; `wanted` ≤ 0 → tout en haute ; `wanted` ≥ aire totale → tout en basse
 * (la dichotomie converge vers une borne). Pas de garantie d'aire exacte au-delà de la précision de la dichotomie.
 */
export function cutArea<P extends Point2>(
  polys: readonly (readonly P[])[],
  axis: Point2,
  wanted: number,
  tol?: TolerancesGeometrie,
): [P[][], P[][]] {
  const vals = polys.flatMap((p) => p.map((q) => q[0] * axis[0] + q[1] * axis[1]));
  if (!vals.length) return [[], []];
  let a = Math.min(...vals);
  let b = Math.max(...vals);
  for (let i = 0; i < 48; i++) {
    const t = (a + b) / 2;
    const v = sumArea(polys.map((p) => clipHalfPlane(p, axis, t, true, tol)).filter((p) => p.length));
    if (v < wanted) a = t;
    else b = t;
  }
  const t = (a + b) / 2;
  return [
    polys.map((p) => clipHalfPlane(p, axis, t, true, tol)).filter((p) => p.length),
    polys.map((p) => clipHalfPlane(p, axis, t, false, tol)).filter((p) => p.length),
  ];
}

export type SiteVariant = "A" | "B" | "C";

export interface SiteZone {
  id: "arrival" | "study" | "garden" | "service";
  name: string;
  /** Morceaux de la zone, repère local (mètres, origine au centroïde). */
  polys: Point2Local[][];
  color: string;
  area: number;
}

export interface SiteZoning {
  variant: SiteVariant;
  /** Indice du côté d'approche (sommet i → i+1). */
  edge: number;
  /** Vrai quand le côté n'a pas été choisi : le premier côté sert de repère graphique seulement. */
  edgeAssumed: boolean;
  zones: SiteZone[];
}

/** Taux de surface [accueil, implantation, espace ouvert, desserte] par variante (prototype). */
export const SITE_ZONING_RATES: Record<SiteVariant, [number, number, number, number]> = {
  A: [0.15, 0.5, 0.25, 0.1],
  B: [0.1, 0.45, 0.35, 0.1],
  C: [0.12, 0.43, 0.2, 0.25],
};

export interface SiteZoningInput {
  /** Contour dans le repère local (mètres, origine au centroïde). */
  local: readonly Point2Local[];
  /** Aire du contour (m²), telle que l'appelant l'a calculée. */
  area: number;
  /** Unités déclarées du contour ; seules « m », « metres », « mètres » permettent un schéma. */
  units: string;
  /** CRS déclaré ; un contour en EPSG:4326 (degrés) n'est jamais zoné. */
  crs: string;
  /** Côté d'approche choisi, ou `null` (repère provisoire : premier côté). */
  frontage: number | null;
}

/**
 * `zoning(c, variant)` du prototype : `null` quand aucun schéma honnête n'est possible (moins de 3 sommets, aire
 * non positive, unités non métriques, EPSG:4326, côté d'approche hors du contour, côté de longueur nulle ou sous
 * `tol.longueurMin`). Peut lever si le contour est auto-intersecté (voir `triangulate`).
 * L'aire `c.area` est celle de l'appelant et n'est pas recalculée : les taux s'appliquent à elle.
 * Variante inconnue (appelant non typé) → taux de la variante A, comme le prototype.
 */
export function siteZoning(c: SiteZoningInput, variant: SiteVariant = "A", tol?: TolerancesGeometrie): SiteZoning | null {
  if (c.local.length < 3 || !(c.area > 0) || !/^(m|metres|mètres)$/i.test(c.units) || c.crs === "EPSG:4326") return null;
  const i = c.frontage ?? 0;
  const a = c.local[i];
  const b = c.local[(i + 1) % c.local.length];
  if (!a || !b) return null;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len || len < resoudreTolerance(tol, "longueurMin", TOLERANCES_HISTORIQUES.longueurNulle)) return null;
  const u: Point2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let v: Point2 = [-u[1], u[0]];
  if (v[0] * -a[0] + v[1] * -a[1] < 0) v = [-v[0], -v[1]];
  const rates = SITE_ZONING_RATES[variant] ?? SITE_ZONING_RATES.A;
  const [front, rest] = cutArea(triangulate(c.local), v, c.area * rates[0], tol);
  const [mid, back] = cutArea(rest, v, c.area * (rates[1] + rates[3]), tol);
  const [build, service] = cutArea(mid, u, c.area * rates[1], tol);
  const zones: SiteZone[] = (
    [
      { id: "arrival", name: "Accueil extérieur / parvis", polys: front, color: "#e9c56e" },
      { id: "study", name: "Secteur d’implantation à étudier", polys: build, color: "#8dabb0" },
      { id: "garden", name: "Espace ouvert / jardin", polys: back, color: "#9ac094" },
      { id: "service", name: "Desserte / transition latérale", polys: service, color: "#cdb3a1" },
    ] as const
  ).map((z) => ({ ...z, polys: z.polys, area: sumArea(z.polys) }));
  return { variant, edge: i, edgeAssumed: c.frontage === null, zones };
}

/**
 * Centroïde arithmétique des sommets (`centroid` du prototype) — pas le barycentre de surface. Repère de l'entrée.
 * Cas conservé : liste vide → [0, 0]. Un premier sommet répété en fin de liste fausse la moyenne (contour implicite).
 */
export function vertexCentroid<P extends Point2>(poly: readonly P[]): P {
  if (!poly.length) return [0, 0] as Point2 as P;
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length] as Point2 as P;
}
