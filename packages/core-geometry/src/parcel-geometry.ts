/**
 * Géométrie de parcelle — extrait du module `designer` (Atelier), comme `geometry.ts`.
 *
 * Provenance : fonctions trouvées dans le même fichier décodé que `V14Geometry`
 * (`EMB.designer` de `Parcours_V8_19_Escalier_B_Mezzanine.html`), utilisées par
 * `window.V14Bridge.inset` (= `inwardOffset`) et par le calcul du centre local
 * (`localCenter`) et de l'emprise bâtie (`buildingFootprint`).
 *
 * Contrairement aux fonctions de `geometry.ts`, celles-ci lisaient à l'origine
 * leurs entrées via des fermetures sur l'état global de l'app (`parcel()`,
 * `domainGet(...)`). Portage fidèle de la LOGIQUE, mais signature modifiée pour
 * recevoir ces données en paramètre plutôt que de les lire d'un état caché —
 * c'est précisément ce qui les rend pures et testables. Voir `project-repository.ts`
 * pour le contrat qui, côté app, doit fournir ces données.
 */

import type { Point2 } from "./geometry";

/** Aire signée (positive si le polygone est orienté anti-horaire) — identique à `signedArea`. */
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

/** Convexité stricte (tous les virages dans le même sens) — identique à `isConvex`. */
export function isConvexPolygon(poly: readonly Point2[]): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const r = poly[(i + 2) % poly.length]!;
    const z = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    if (Math.abs(z) < 1e-8) continue;
    const s = Math.sign(z);
    if (!sign) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/** Intersection de deux droites (portées par ab et cd), ou `null` si parallèles — identique à `intersectLines`. */
export function intersectLines(a: Point2, b: Point2, c: Point2, d: Point2): Point2 | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-9) return null;
  return [
    ((a[0] * b[1] - a[1] * b[0]) * (c[0] - d[0]) - (a[0] - b[0]) * (c[0] * d[1] - c[1] * d[0])) / den,
    ((a[0] * b[1] - a[1] * b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] * d[1] - c[1] * d[0])) / den,
  ];
}

/**
 * Décale un polygone CONVEXE de `d` vers l'intérieur (recul/retrait de parcelle) —
 * identique à `inwardOffset`. Retourne `null` si le polygone n'est pas convexe,
 * si deux côtés consécutifs sont parallèles au décalage demandé, ou si le
 * résultat est dégénéré (aire quasi nulle).
 */
export function inwardOffset(poly: readonly Point2[], distance: number): Point2[] | null {
  if (!distance || distance <= 0) return poly.map((p) => [p[0], p[1]] as Point2);
  if (!isConvexPolygon(poly)) return null;

  const ccw = signedArea(poly) > 0;
  const offsetLines: Array<[Point2, Point2]> = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const L = Math.hypot(dx, dy);
    if (!L) return null;
    const n: Point2 = ccw ? [-dy / L, dx / L] : [dy / L, -dx / L];
    offsetLines.push([
      [p[0] + n[0] * distance, p[1] + n[1] * distance],
      [q[0] + n[0] * distance, q[1] + n[1] * distance],
    ]);
  }

  const out: Point2[] = [];
  for (let i = 0; i < offsetLines.length; i++) {
    const prev = offsetLines[(i - 1 + offsetLines.length) % offsetLines.length]!;
    const curr = offsetLines[i]!;
    const x = intersectLines(prev[0], prev[1], curr[0], curr[1]);
    if (!x) return null;
    out.push(x);
  }
  return polygonArea(out) > 1e-6 ? out : null;
}

/** Centre local d'un parcelle (son centroïde) — identique à `localCenter`, mais le parcelle est un paramètre explicite. */
export function parcelCenter(parcel: { centroid?: Point2 } | null | undefined): Point2 {
  return parcel?.centroid ?? [0, 0];
}

export interface ParcelLike {
  centroid?: Point2;
  building?: { vertices?: Point2[] };
}

export interface FloorDesignLevel {
  paths?: Array<{ closed?: boolean; role?: string; points?: Point2[] }>;
}

/**
 * Emprise bâtie : priorité au contour saisi sur la parcelle active, puis à un
 * contour mémorisé indépendamment, puis au tracé marqué `role: 'buildingFootprint'`
 * dans l'un des niveaux (ses points sont relatifs au centre de la parcelle) —
 * identique à `buildingFootprint`, avec les sources de données en paramètres
 * explicites plutôt que lues via `domainGet`.
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
