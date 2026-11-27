/**
 * Emplacements enregistrés dans GeoData (bouton « Emplacements Projets » de la carte, 27 novembre 2026), lus par la
 * Planche pour en faire son Emplacement : `GET /geodata/api/emplacements` (liste) et `/geodata/api/emplacements/:id`
 * (ouverture par l'adresse `/sandbox?emplacement-geodata=<id>`). Lecture seule, sur la session du compte ; aucun import
 * du module GeoData (les adresses sont écrites en toutes lettres) ; chaque réponse repasse `estEmplacement`.
 */
import { estEmplacement, type Emplacement } from "@parcours/sandbox-planche-model";

export const ADRESSE_EMPLACEMENTS_GEODATA = "/geodata/api/emplacements";
/** Paramètre d'adresse qui ouvre un emplacement de GeoData dans la Planche. */
export const PARAMETRE_EMPLACEMENT_GEODATA = "emplacement-geodata";

export interface EmplacementGeoDataLu {
  readonly id: string;
  readonly emplacement: Emplacement;
}

/** Erreur d'un appel : `statut` HTTP (0 = réseau indisponible ; 404 = GeoData fermé ou emplacement introuvable). */
export class ErreurEmplacementsGeoData extends Error {
  constructor(readonly statut: number) {
    super(`Emplacements GeoData : ${statut === 0 ? "réseau indisponible" : `réponse ${statut}`}`);
  }
}

/** Réponse de l'API relue au format de la Planche ; `null` si elle n'en est pas un. */
export function lireEmplacementGeoData(v: unknown): EmplacementGeoDataLu | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r["id"] !== "string") return null;
  const e = {
    latitude: r["latitude"], longitude: r["longitude"], nord: r["nord"],
    ...(typeof r["altitude"] === "number" ? { altitude: r["altitude"] } : {}),
    ...(typeof r["lieu"] === "string" && r["lieu"] ? { lieu: r["lieu"] } : {}),
  };
  return estEmplacement(e) ? { id: r["id"], emplacement: e } : null;
}

async function lire(adresse: string): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(adresse, { credentials: "include", headers: { Accept: "application/json" } });
  } catch {
    throw new ErreurEmplacementsGeoData(0);
  }
  if (!r.ok) throw new ErreurEmplacementsGeoData(r.status);
  return r.json();
}

export async function listerEmplacementsGeoData(): Promise<readonly EmplacementGeoDataLu[]> {
  const corps = (await lire(ADRESSE_EMPLACEMENTS_GEODATA)) as { emplacements?: unknown };
  return (Array.isArray(corps.emplacements) ? corps.emplacements : []).map(lireEmplacementGeoData).filter((e): e is EmplacementGeoDataLu => e !== null);
}

export async function lireEmplacementGeoDataParId(id: string): Promise<EmplacementGeoDataLu> {
  const e = lireEmplacementGeoData(await lire(`${ADRESSE_EMPLACEMENTS_GEODATA}/${encodeURIComponent(id)}`));
  if (!e) throw new ErreurEmplacementsGeoData(422);
  return e;
}
