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
import { eq } from "drizzle-orm";
import {
  DEFAULT_SITE_OBSERVATIONS,
  siteContext,
  type GeographicConverter,
  type HarmonieProfile,
  type SiteContext,
  type SiteObservations,
  type SiteParcel,
} from "@parcours/domain-model";
import type { Point2 } from "@parcours/core-geometry";
import { db } from "../db/client.js";
import { atelierStore } from "../db/schema.js";
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

/** La parcelle du projet natif actif, ou `null` : aucune parcelle n'est inventée. */
export async function loadSiteParcel(q: Querier, projectId: string): Promise<SiteParcel | null> {
  const rows = await q.select().from(atelierStore).where(eq(atelierStore.projectId, projectId));
  const active = rows.find((r) => r.key === "design.v13.activeProject")?.value;
  if (typeof active !== "string") return null;
  const np = rows.find((r) => r.key === `design.v13.project.${active}.nativeParcel`)?.value as NativeParcelDomain | undefined;
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
