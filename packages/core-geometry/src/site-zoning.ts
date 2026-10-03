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
 */
import type { Point2 } from "./geometry.js";
import { polygonArea, signedArea } from "./parcel-geometry.js";

type MutablePoint = [number, number];

const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Triangulation par « oreilles » du contour (orienté anti-horaire au besoin). Lève sur un contour dégénéré ou auto-intersecté. */
export function triangulate(poly: readonly Point2[]): Point2[][] {
  let q: MutablePoint[] = poly.map((p) => [p[0], p[1]]);
  if (q.length < 3) return [];
  if (q.length > 2000) throw new Error("Contour trop détaillé pour ce schéma : simplification contrôlée requise.");
  if (signedArea(q) < 0) q.reverse();
  const result: Point2[][] = [];
  let guard = 0;
  while (q.length > 3 && guard++ < poly.length * poly.length) {
    let found = false;
    for (let i = 0; i < q.length; i++) {
      const a = q[(i - 1 + q.length) % q.length]!;
      const b = q[i]!;
      const c = q[(i + 1) % q.length]!;
      if (cross(a, b, c) < 1e-9) continue;
      const inside = q.some((p, j) => j !== i && j !== (i - 1 + q.length) % q.length && j !== (i + 1) % q.length && cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9);
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

/** Partie du polygone du côté `axis·p ≤ t` (`low`) ou `≥ t` ; vide si l'aire restante est négligeable. */
export function clipHalfPlane(poly: readonly Point2[], axis: Point2, t: number, low = true): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const va = a[0] * axis[0] + a[1] * axis[1] - t;
    const vb = b[0] * axis[0] + b[1] * axis[1] - t;
    const ia = low ? va <= 1e-9 : va >= -1e-9;
    const ib = low ? vb <= 1e-9 : vb >= -1e-9;
    if (ia) out.push(a);
    if (ia !== ib) {
      const u = va / (va - vb);
      out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]);
    }
  }
  return out.length >= 3 && polygonArea(out) > 1e-8 ? out : [];
}

export const sumArea = (polys: readonly (readonly Point2[])[]): number => polys.reduce((s, p) => s + polygonArea(p), 0);

/**
 * Coupe un ensemble de polygones par une droite perpendiculaire à `axis`
 * de sorte que la partie « basse » ait l'aire `wanted` (dichotomie, 48
 * itérations comme dans le prototype). Renvoie [basse, haute].
 */
export function cutArea(polys: readonly (readonly Point2[])[], axis: Point2, wanted: number): [Point2[][], Point2[][]] {
  const vals = polys.flatMap((p) => p.map((q) => q[0] * axis[0] + q[1] * axis[1]));
  if (!vals.length) return [[], []];
  let a = Math.min(...vals);
  let b = Math.max(...vals);
  for (let i = 0; i < 48; i++) {
    const t = (a + b) / 2;
    const v = sumArea(polys.map((p) => clipHalfPlane(p, axis, t)).filter((p) => p.length));
    if (v < wanted) a = t;
    else b = t;
  }
  const t = (a + b) / 2;
  return [polys.map((p) => clipHalfPlane(p, axis, t)).filter((p) => p.length), polys.map((p) => clipHalfPlane(p, axis, t, false)).filter((p) => p.length)];
}

export type SiteVariant = "A" | "B" | "C";

export interface SiteZone {
  id: "arrival" | "study" | "garden" | "service";
  name: string;
  polys: Point2[][];
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
  local: readonly Point2[];
  /** Aire du contour (m²), telle que l'appelant l'a calculée. */
  area: number;
  /** Unités déclarées du contour ; seules « m », « metres », « mètres » permettent un schéma. */
  units: string;
  /** CRS déclaré ; un contour en EPSG:4326 (degrés) n'est jamais zoné. */
  crs: string;
  /** Côté d'approche choisi, ou `null` (repère provisoire : premier côté). */
  frontage: number | null;
}

/** `zoning(c, variant)` du prototype : `null` quand aucun schéma honnête n'est possible. */
export function siteZoning(c: SiteZoningInput, variant: SiteVariant = "A"): SiteZoning | null {
  if (c.local.length < 3 || !(c.area > 0) || !/^(m|metres|mètres)$/i.test(c.units) || c.crs === "EPSG:4326") return null;
  const i = c.frontage ?? 0;
  const a = c.local[i];
  const b = c.local[(i + 1) % c.local.length];
  if (!a || !b) return null;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!len) return null;
  const u: Point2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  let v: Point2 = [-u[1], u[0]];
  if (v[0] * -a[0] + v[1] * -a[1] < 0) v = [-v[0], -v[1]];
  const rates = SITE_ZONING_RATES[variant] ?? SITE_ZONING_RATES.A;
  const [front, rest] = cutArea(triangulate(c.local), v, c.area * rates[0]);
  const [mid, back] = cutArea(rest, v, c.area * (rates[1] + rates[3]));
  const [build, service] = cutArea(mid, u, c.area * rates[1]);
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

/** Centroïde arithmétique des sommets (`centroid` du prototype) — pas le barycentre de surface. */
export function vertexCentroid(poly: readonly Point2[]): Point2 {
  if (!poly.length) return [0, 0];
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}
