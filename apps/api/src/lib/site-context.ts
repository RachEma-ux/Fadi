/**
 * Contexte de site de l'étape 01 pour un projet : la parcelle du modèle natif
 * (domaine `nativeParcel` du projet natif actif, repère cadastral), les
 * données du site déclarées (`projects.site_observations`) et la conversion
 * explicite vers WGS84 pour l'affichage de la géolocalisation.
 *
 * Les définitions de CRS sont celles du prototype (`SITE_CRS_DEFINITIONS` de
 * h7-app) : Merchich / Nord Maroc (EPSG:26191) et Lambert 93 (EPSG:2154).
 * Un CRS absent de cette liste ne donne aucune géolocalisation — rien n'est
 * approximé.
 */
import proj4 from "proj4";
import {
  DEFAULT_SITE_OBSERVATIONS,
  siteContext,
  type DesignGeoreference,
  type GeographicConverter,
  type HarmonieProfile,
  type SiteContext,
  type SiteObservations,
  type SiteParcel,
} from "@parcours/domain-model";
import { vertexCentroid, type Point2 } from "@parcours/core-geometry";
import { db } from "../db/client.js";
import { loadNativeDomains } from "./model-context.js";
import type { NativeParcelDomain } from "./parcel-transmission.js";

export const SITE_CRS_DEFINITIONS: Record<string, string> = {
  "EPSG:26191": "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +ellps=clrk80ign +towgs84=31,146,47,0,0,0,0 +units=m +no_defs",
  "EPSG:2154": "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};
for (const [code, def] of Object.entries(SITE_CRS_DEFINITIONS)) proj4.defs(code, def);

/** Conversion explicite CRS déclaré → WGS84 `[longitude, latitude]` ; `null` quand le CRS n'est pas défini. */
export const toWgs84: GeographicConverter = (crs, point) => {
  if (!SITE_CRS_DEFINITIONS[crs]) return null;
  try {
    const [lon, lat] = proj4(crs, "EPSG:4326", [point[0], point[1]]);
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon!, lat!] : null;
  } catch {
    return null;
  }
};

type Querier = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** La parcelle du modèle typé (projetée dans la forme `nativeParcel`), ou `null` : aucune parcelle n'est inventée. */
export async function loadSiteParcel(q: Querier, projectId: string): Promise<SiteParcel | null> {
  const np = (await loadNativeDomains(q, projectId))?.parcel as NativeParcelDomain | null | undefined;
  if (!np || !Array.isArray(np.vertices)) return null;
  const vertices = np.vertices.filter((v): v is Point2 => Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])).map((v): Point2 => [v[0], v[1]]);
  return {
    vertices,
    vertexIds: Array.isArray(np.vertexIds) ? np.vertexIds.map(String) : [],
    crs: String(np.crs ?? ""),
    units: String(np.units ?? "m"),
    officialArea: typeof np.officialArea === "number" ? np.officialArea : null,
    parcelNumber: String(np.parcelNumber ?? ""),
    commune: String(np.commune ?? ""),
    sourceFile: String(np.sourceFile ?? ""),
  };
}

export function siteObservationsOf(project: { siteObservations: Record<string, unknown> | null }): SiteObservations {
  return { ...DEFAULT_SITE_OBSERVATIONS, ...((project.siteObservations ?? {}) as Partial<SiteObservations>) };
}

export async function loadSiteContext(q: Querier, project: { id: string; siteObservations: Record<string, unknown> | null }, profile: HarmonieProfile): Promise<SiteContext> {
  const parcel = await loadSiteParcel(q, project.id);
  return siteContext(parcel, siteObservationsOf(project), profile, toWgs84);
}

/**
 * Géoréférencement d'une parcelle (`D.georeference` du prototype, méthode
 * décrite dans ses données) : centroïde converti en WGS84 et azimut
 * géodésique du segment +Y de 100 m au centroïde — le nord géographique par
 * rapport au +Y de la grille du modèle (`projectNorth`). `null` quand le CRS
 * n'est pas défini : rien n'est approximé.
 */
export function georeferenceFromParcel(parcel: { vertices: readonly Point2[]; crs: string; centroid?: Point2 | null }): DesignGeoreference | null {
  if (!parcel.vertices.length || !SITE_CRS_DEFINITIONS[parcel.crs]) return null;
  const c = parcel.centroid ?? vertexCentroid(parcel.vertices);
  const center = toWgs84(parcel.crs, c);
  const north = toWgs84(parcel.crs, [c[0], c[1] + 100]);
  if (!center || !north) return null;
  // Azimut géodésique sur l'ellipsoïde WGS84, par le plan tangent au centroïde (segment de 100 m : l'écart avec une géodésique complète est négligeable).
  const rad = Math.PI / 180;
  const a = 6378137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const lat = center[1] * rad;
  const sinLat = Math.sin(lat);
  const nRadius = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const mRadius = (a * (1 - e2)) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const dx = (north[0] - center[0]) * rad * nRadius * Math.cos(lat);
  const dy = (north[1] - center[1]) * rad * mRadius;
  const projectNorth = ((Math.atan2(dx, dy) / rad) % 360 + 360) % 360;
  return {
    latitude: center[1],
    longitude: center[0],
    projectNorth,
    crs: parcel.crs,
    method: `Conversion PROJ / ${parcel.crs} → WGS84 ; azimut géodésique du segment +Y de 100 m au centroïde. Le système source reste une hypothèse, non un relevé de boussole.`,
    status: "hypothese de georeferencement",
    source: `Bornes de la parcelle du modèle ; conversion calculée pour préparer MapTiler, sans observation satellite en direct.`,
    hypothesis: true,
  };
}
