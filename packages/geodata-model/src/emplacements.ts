/**
 * Emplacements enregistrés dans GeoData (bouton « Emplacements Projets » de la carte, 27 novembre 2026) : une position
 * **saisie** ou lue au centre de la carte — lieu, latitude, longitude, altitude, nord vrai — au même format que
 * l'Emplacement de la Planche, pour qu'elle puisse l'ouvrir telle quelle. Pur : aucune donnée fournie ni devinée, une
 * altitude absente reste absente (jamais zéro), aucune notion de dossier n'y est rattachée.
 */

export interface EmplacementGeoData {
  /** Nom du lieu, libre (1 à 120 caractères). */
  readonly lieu: string;
  /** Degrés décimaux WGS 84, nord positif (−90 à 90). */
  readonly latitude: number;
  /** Degrés décimaux WGS 84, est positif (−180 à 180). */
  readonly longitude: number;
  /** Altitude déclarée (m) ; absente = non renseignée. */
  readonly altitude: number | null;
  /** Nord vrai : angle en degrés depuis l'axe vert de la Planche, sens horaire (0 à 360 exclu). */
  readonly nord: number;
}

export type ChampEmplacementGeoData = keyof EmplacementGeoData;

export const LIEU_MAX = 120;

/** Angle ramené dans [0, 360). */
export const normaliserNordGeoData = (angle: number): number => ((angle % 360) + 360) % 360;

const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Valide un emplacement reçu (API) : le premier champ refusé est nommé ; rien n'est corrigé en silence sauf le nord ramené dans [0, 360). */
export function validerEmplacementGeoData(v: unknown): { readonly ok: true; readonly emplacement: EmplacementGeoData } | { readonly ok: false; readonly champ: ChampEmplacementGeoData } {
  const e = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const lieu = typeof e["lieu"] === "string" ? e["lieu"].trim() : "";
  if (lieu.length < 1 || lieu.length > LIEU_MAX) return { ok: false, champ: "lieu" };
  if (!fini(e["latitude"]) || Math.abs(e["latitude"]) > 90) return { ok: false, champ: "latitude" };
  if (!fini(e["longitude"]) || Math.abs(e["longitude"]) > 180) return { ok: false, champ: "longitude" };
  const altitude = e["altitude"] === undefined || e["altitude"] === null ? null : e["altitude"];
  if (altitude !== null && (!fini(altitude) || Math.abs(altitude) > 10_000)) return { ok: false, champ: "altitude" };
  const nord = e["nord"] === undefined || e["nord"] === null ? 0 : e["nord"];
  if (!fini(nord)) return { ok: false, champ: "nord" };
  return { ok: true, emplacement: { lieu, latitude: e["latitude"], longitude: e["longitude"], altitude, nord: Number(normaliserNordGeoData(nord).toFixed(6)) } };
}

const lireNombre = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Emplacement lu d'une saisie (virgule ou point décimal) ; le premier champ refusé est nommé. */
export function lireSaisieEmplacementGeoData(s: { readonly lieu: string; readonly latitude: string; readonly longitude: string; readonly altitude: string; readonly nord: string }): { readonly ok: true; readonly emplacement: EmplacementGeoData } | { readonly ok: false; readonly champ: ChampEmplacementGeoData } {
  if (s.lieu.trim() === "") return { ok: false, champ: "lieu" };
  const latitude = lireNombre(s.latitude);
  if (latitude === null) return { ok: false, champ: "latitude" };
  const longitude = lireNombre(s.longitude);
  if (longitude === null) return { ok: false, champ: "longitude" };
  const altitude = s.altitude.trim() === "" ? null : lireNombre(s.altitude);
  if (altitude === null && s.altitude.trim() !== "") return { ok: false, champ: "altitude" };
  const nord = s.nord.trim() === "" ? 0 : lireNombre(s.nord);
  if (nord === null) return { ok: false, champ: "nord" };
  return validerEmplacementGeoData({ lieu: s.lieu, latitude, longitude, altitude, nord });
}
