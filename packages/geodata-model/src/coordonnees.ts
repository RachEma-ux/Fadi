/**
 * Coordonnées saisies dans la recherche de GeoData (D-GD-06). Les échanges de GeoData sont en WGS 84, longitude puis
 * latitude (CRS84). Une saisie n'est acceptée que si chaque nombre est **étiqueté** (`lon -7.6 lat 33.5`,
 * `lat=33.5; lon=-7.6`, `longitude … latitude …`) : une paire nue (« 33.5, -7.6 ») est ambiguë — lat/lon ou lon/lat selon
 * l'outil d'origine — et elle est refusée plutôt qu'inversée silencieusement.
 */

/** Point géographique WGS 84, repère tagué (jamais confondu avec un repère cadastral ou local). */
export interface PointGeographique {
  readonly repere: "geographic";
  readonly lon: number;
  readonly lat: number;
}

export type RefusCoordonnees = "pas-de-coordonnees" | "non-etiquetees" | "incompletes" | "hors-plage";

export type LectureCoordonnees =
  | { readonly ok: true; readonly point: PointGeographique }
  | { readonly ok: false; readonly refus: RefusCoordonnees; readonly message: string };

const NOMBRE = "([+-]?\\d+(?:[.,]\\d+)?)";
const LON = new RegExp(`\\b(?:lon(?:gitude)?|lng)\\s*[:=]?\\s*${NOMBRE}`, "i");
const LAT = new RegExp(`\\b(?:lat(?:itude)?)\\s*[:=]?\\s*${NOMBRE}`, "i");
const NOMBRES = /[+-]?\d+(?:[.,]\d+)?/g;

const nombre = (s: string) => Number(s.replace(",", "."));

export function pointGeographique(lon: number, lat: number): PointGeographique | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return { repere: "geographic", lon, lat };
}

export function lireCoordonnees(texte: string): LectureCoordonnees {
  const t = texte.trim();
  const lon = LON.exec(t);
  const lat = LAT.exec(t);
  if (lon && lat) {
    const p = pointGeographique(nombre(lon[1]!), nombre(lat[1]!));
    return p ? { ok: true, point: p } : { ok: false, refus: "hors-plage", message: "Longitude entre -180 et 180, latitude entre -90 et 90." };
  }
  if (lon || lat) return { ok: false, refus: "incompletes", message: "Indiquez la longitude et la latitude, par exemple « lon -7.6 lat 33.5 »." };
  const nus = t.match(NOMBRES) ?? [];
  if (nus.length >= 2 && /^[\s\d.,;+-]+$/.test(t)) {
    return { ok: false, refus: "non-etiquetees", message: "Coordonnées ambiguës : précisez « lon … lat … » (aucun ordre n'est deviné)." };
  }
  return { ok: false, refus: "pas-de-coordonnees", message: "Aucune coordonnée reconnue." };
}
