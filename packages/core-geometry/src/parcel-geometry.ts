/**
 * Géométrie de parcelle — extrait du module `designer` (Atelier), comme `geometry.ts`.
 *
 * Provenance : fonctions trouvées dans le même fichier décodé que `V14Geometry`
 * (`EMB.designer` de `Parcours_V8_19_Escalier_B_Mezzanine.html`), utilisées par
 * la façade de stockage du prototype (`inset` = `inwardOffset`) et par le calcul du centre local
 * (`localCenter`) et de l'emprise bâtie (`buildingFootprint`).
 *
 * Contrairement aux fonctions de `geometry.ts`, celles-ci lisaient à l'origine
 * leurs entrées via des fermetures sur l'état global de l'app (`parcel()`,
 * `domainGet(...)`). Portage fidèle de la LOGIQUE, mais signature modifiée pour
 * recevoir ces données en paramètre plutôt que de les lire d'un état caché —
 * c'est précisément ce qui les rend pures et testables. Côté application, ces
 * données viennent du modèle typé de l'Atelier (`@parcours/atelier-model`).
 *
 * Repères (relecture L1.5) : les fonctions de calcul (aire, convexité, intersection, décalage) sont valables dans
 * tout repère plan métrique et rendent leurs points dans le repère de l'entrée (type générique `P`) ; elles
 * n'ont aucun sens en degrés (`geographic`). Tolérances D-012 reçues en paramètre facultatif (`tolerances.ts`).
 */

import type { Point2 } from "./geometry.js";
import type { Point2Local } from "./reperes.js";
import {
  produitVectorielNegligeable,
  resoudreTolerance,
  TOLERANCES_HISTORIQUES,
  type TolerancesGeometrie,
} from "./tolerances.js";

/**
 * Aire signée (positive si le polygone est orienté anti-horaire) — identique à `signedArea`.
 * Formule du lacet : contour fermé implicite (ne pas répéter le premier sommet — le répéter ne change rien).
 * Moins de 3 sommets → 0. Contour auto-intersecté → somme algébrique des lobes (pas une surface).
 */
export function signedArea(poly: readonly Point2[]): number {
  return (
    poly.reduce((s, p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}

/** Aire non signée — identique à `polyArea`. */
export function polygonArea(poly: readonly Point2[]): number {
  return Math.abs(signedArea(poly));
}

/**
 * Convexité (tous les virages non négligeables dans le même sens) — identique à `isConvex`.
 * Les sommets alignés sont ignorés : produit vectoriel < 1e-8 m² (historique) ou, si `tol.tolAngle` est fourni,
 * |sin θ| < tolAngle. Cas dégénérés conservés : moins de 3 sommets → `false` ; tous les sommets alignés → `true`
 * (aucun virage) ; un contour en étoile qui tourne toujours dans le même sens (auto-intersecté) → `true`.
 */
export function isConvexPolygon(poly: readonly Point2[], tol?: TolerancesGeometrie): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const r = poly[(i + 2) % poly.length]!;
    const z = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    const aligne = produitVectorielNegligeable(
      z,
      Math.hypot(q[0] - p[0], q[1] - p[1]),
      Math.hypot(r[0] - q[0], r[1] - q[1]),
      tol,
      TOLERANCES_HISTORIQUES.produitVectorielConvexite,
    );
    if (aligne) continue;
    const s = Math.sign(z);
    if (!sign) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/**
 * Intersection de deux droites (portées par ab et cd), ou `null` si parallèles — identique à `intersectLines`.
 * Parallélisme : déterminant < 1e-9 m² (historique) ou, si `tol.tolAngle` est fourni, |sin θ| < tolAngle.
 * Cas dégénéré : `a` = `b` ou `c` = `d` (droite indéterminée) → déterminant nul → `null`.
 * Le point rendu est dans le repère des entrées (les quatre points doivent partager le même repère).
 */
export function intersectLines<P extends Point2>(a: P, b: P, c: P, d: P, tol?: TolerancesGeometrie): P | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  const parallele = produitVectorielNegligeable(
    den,
    Math.hypot(a[0] - b[0], a[1] - b[1]),
    Math.hypot(c[0] - d[0], c[1] - d[1]),
    tol,
    TOLERANCES_HISTORIQUES.determinantParallele,
  );
  if (parallele || den === 0) return null;
  const x: Point2 = [
    ((a[0] * b[1] - a[1] * b[0]) * (c[0] - d[0]) - (a[0] - b[0]) * (c[0] * d[1] - c[1] * d[0])) / den,
    ((a[0] * b[1] - a[1] * b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] * d[1] - c[1] * d[0])) / den,
  ];
  return x as P;
}

/**
 * Décale un polygone CONVEXE de `d` vers l'intérieur (recul/retrait de parcelle) —
 * identique à `inwardOffset`. Retourne `null` si le polygone n'est pas convexe,
 * si deux côtés consécutifs sont parallèles au décalage demandé, ou si le
 * résultat est dégénéré (aire quasi nulle).
 *
 * Repère : celui de l'entrée (générique `P`), en mètres. Tolérances : `tol.longueurMin` (côté nul, historique 0),
 * `tol.aireMin` (aire du résultat, historique 1e-6 m²), `tol.tolAngle` (convexité et parallélisme, voir ci-dessus).
 * Cas dégénérés conservés : distance nulle, négative ou NaN → copie du polygone (pas de décalage vers l'extérieur) ;
 * distance supérieure à la demi-largeur → polygone INVERSÉ (orientation opposée), pas `null` — voir le test qui le
 * documente et `offsetInverts` pour le détecter.
 */
export function inwardOffset<P extends Point2>(poly: readonly P[], distance: number, tol?: TolerancesGeometrie): P[] | null {
  if (!distance || distance <= 0) return poly.map((p) => [p[0], p[1]] as Point2 as P);
  if (!isConvexPolygon(poly, tol)) return null;
  const coteMin = resoudreTolerance(tol, "longueurMin", TOLERANCES_HISTORIQUES.longueurNulle);
  const aireMin = resoudreTolerance(tol, "aireMin", TOLERANCES_HISTORIQUES.aireDecalageMin);

  const ccw = signedArea(poly) > 0;
  const offsetLines: Array<[P, P]> = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (!L || L < coteMin) return null;
    const n: Point2 = ccw ? [-dy / L, dx / L] : [dy / L, -dx / L];
    offsetLines.push([
      [p[0] + n[0] * distance, p[1] + n[1] * distance] as Point2 as P,
      [q[0] + n[0] * distance, q[1] + n[1] * distance] as Point2 as P,
    ]);
  }

  const out: P[] = [];
  for (let i = 0; i < offsetLines.length; i++) {
    const prev = offsetLines[(i - 1 + offsetLines.length) % offsetLines.length]!;
    const curr = offsetLines[i]!;
    const x = intersectLines(prev[0], prev[1], curr[0], curr[1], tol);
    if (!x) return null;
    out.push(x);
  }
  return polygonArea(out) > aireMin ? out : null;
}

/**
 * Vrai si `offset` (résultat de `inwardOffset(poly, …)`) est replié : au moins un de ses côtés est de sens opposé au
 * côté d'origine correspondant (le côté i de `offset`, de `offset[i]` à `offset[i+1]`, porte le côté i de `poly`
 * décalé). C'est le cas quand le recul dépasse la demi-largeur : le résultat n'est alors pas une enveloppe
 * intérieure (pour un carré il est retourné de 180°, avec la même aire). Ajout de la relecture L1.5 :
 * `inwardOffset` n'est pas modifié (comportement documenté par ses tests), l'appelant décide.
 * `offset` nul ou de taille différente de `poly` → `false` (rien à comparer).
 */
export function offsetInverts(poly: readonly Point2[], offset: readonly Point2[] | null): boolean {
  if (!offset || offset.length < 3 || offset.length !== poly.length) return false;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const r = offset[i]!;
    const t = offset[(i + 1) % offset.length]!;
    if ((q[0] - p[0]) * (t[0] - r[0]) + (q[1] - p[1]) * (t[1] - r[1]) < 0) return true;
  }
  return false;
}

/**
 * Centre local d'une parcelle (son centroïde) — identique à `localCenter`, mais la parcelle est un paramètre explicite.
 * Cas conservé : parcelle ou centroïde absent → [0, 0] (valeur du prototype, pas un centroïde calculé).
 */
export function parcelCenter(parcel: { centroid?: Point2 } | null | undefined): Point2 {
  return parcel?.centroid ?? [0, 0];
}

export interface ParcelLike {
  centroid?: Point2;
  building?: { vertices?: Point2[] };
}

export interface FloorDesignLevel {
  /** Tracés d'un niveau ; points dans le repère local du projet (relatifs au centre de la parcelle). */
  paths?: Array<{ closed?: boolean; role?: string; points?: Point2Local[] }>;
}

/**
 * Emprise bâtie : priorité au contour saisi sur la parcelle active, puis à un
 * contour mémorisé indépendamment, puis au tracé marqué `role: 'buildingFootprint'`
 * dans l'un des niveaux (ses points sont relatifs au centre de la parcelle) —
 * identique à `buildingFootprint`, avec les sources de données en paramètres
 * explicites plutôt que lues via `domainGet`.
 *
 * Repères : le résultat est dans le repère de la parcelle (celui de `parcel.building.vertices` et de
 * `parcel.centroid`) ; le dernier repli convertit un tracé du repère local en ajoutant le centre, et retombe sur
 * [0, 0] sans centroïde (alors le résultat reste en coordonnées locales). Voir RELECTURE.md (question ouverte).
 */
export function buildingFootprint(
  parcel: ParcelLike | null | undefined,
  storedFootprint: { vertices?: Point2[] } | null | undefined,
  floorDesignLevels: Record<string, FloorDesignLevel> | undefined,
): Point2[] | null {
  if (parcel?.building?.vertices && parcel.building.vertices.length >= 3) {
    return parcel.building.vertices;
  }
  if (storedFootprint?.vertices && storedFootprint.vertices.length >= 3) {
    return storedFootprint.vertices;
  }
  const center = parcelCenter(parcel);
  for (const model of Object.values(floorDesignLevels ?? {})) {
    for (const p of model.paths ?? []) {
      if (p.closed && p.role === "buildingFootprint" && p.points && p.points.length >= 3) {
        return p.points.map((q) => [q[0] + center[0], q[1] + center[1]] as Point2);
      }
    }
  }
  return null;
}

/**
 * Code projet affiché dans l'UI : `P.<numéro de parcelle>` si connu, sinon le nom
 * du projet, sinon `'Projet'` — identique à `projectCode`, avec le projet et la
 * parcelle en paramètres explicites (le source lisait `activeProject()`/`parcel()`).
 */
export function projectCode(
  project: { name?: string; parcel?: string } | null | undefined,
  parcel: { parcelNumber?: string } | null | undefined,
): string {
  if (!project) return "V14";
  const n = parcel?.parcelNumber || project.parcel;
  if (n) return `P.${n}`;
  return project.name || "Projet";
}
