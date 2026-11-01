/**
 * Mesures **indicatives** de la barre d'outils (distance, surface) sur une sphère de rayon moyen. Elles ne dépendent pas
 * de la projection d'affichage (D-GD-06) mais restent indicatives : les analyses enregistrées du serveur mesurent sur
 * l'ellipsoïde WGS 84 (PostGIS `geography`) et déclarent leur propre méthode.
 */
import type { PointGeographique } from "./coordonnees.js";

/** Rayon moyen de la Terre (UGGI, R1 = (2a + b) / 3 pour WGS 84), en mètres. */
export const RAYON_MOYEN_M = 6_371_008.8;

export const METHODE_MESURE_INDICATIVE = "Sphère de rayon moyen 6 371 008,8 m (UGGI) — mesure indicative, indépendante de la projection d'affichage";

const rad = (d: number) => (d * Math.PI) / 180;

/** Distance du grand cercle (haversine), en mètres. */
export function distanceM(a: PointGeographique, b: PointGeographique): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_MOYEN_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur d'une ligne brisée, en mètres. */
export function longueurM(points: readonly PointGeographique[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += distanceM(points[i - 1]!, points[i]!);
  return s;
}

/** Aire d'un anneau (signée, sens trigonométrique positif) sur la sphère, en m², par la formule de l'excès sphérique. */
function aireAnneau(anneau: readonly (readonly [number, number])[]): number {
  let s = 0;
  const n = anneau.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const [l1, p1] = anneau[i]!;
    const [l2, p2] = anneau[(i + 1) % n]!;
    s += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return (s * RAYON_MOYEN_M * RAYON_MOYEN_M) / 2;
}

/**
 * Aire d'un polygone (anneau extérieur puis trous, positions `[lon, lat]`), en m², toujours positive.
 * Les trous sont retranchés quel que soit leur sens.
 */
export function aireM2(anneaux: readonly (readonly (readonly [number, number])[])[]): number {
  if (anneaux.length === 0) return 0;
  const exterieur = Math.abs(aireAnneau(anneaux[0]!));
  const trous = anneaux.slice(1).reduce((s, a) => s + Math.abs(aireAnneau(a)), 0);
  return Math.max(0, exterieur - trous);
}

/** Libellé d'une distance : mètres sous 1 km, kilomètres au-delà. */
export function libelleDistance(m: number): string {
  return m < 1000 ? `${formatNombre(m, 0)} m` : `${formatNombre(m / 1000, m < 10_000 ? 2 : 1)} km`;
}

/** Libellé d'une surface : m² sous 1 ha, hectares sous 1 km², km² au-delà. */
export function libelleSurface(m2: number): string {
  if (m2 < 10_000) return `${formatNombre(m2, 0)} m²`;
  if (m2 < 1_000_000) return `${formatNombre(m2 / 10_000, 2)} ha`;
  return `${formatNombre(m2 / 1_000_000, 2)} km²`;
}

/** Nombre au format français (espace fine insécable des milliers, virgule décimale), sans dépendre d'Intl. */
export function formatNombre(x: number, decimales: number): string {
  const [entier, frac] = Math.abs(x).toFixed(decimales).split(".");
  const groupe = entier!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${x < 0 && Number(x.toFixed(decimales)) !== 0 ? "-" : ""}${groupe}${frac ? `,${frac}` : ""}`;
}
