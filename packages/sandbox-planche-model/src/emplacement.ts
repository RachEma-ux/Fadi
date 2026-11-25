/**
 * Extension « Emplacement » (25 novembre 2026 ; d'après Add Location et Solar North de SketchUp, fusionnés par décision
 * du maître d'ouvrage) : la position de la Planche sur Terre, **saisie** — latitude, longitude, altitude, lieu — et la
 * direction du **nord vrai** par rapport aux axes du dessin. Les ombres lisent la latitude et le nord. Pur.
 *
 * Aucune donnée n'est fournie ni devinée : pas de carte, pas de terrain, pas de géocodage (ils demandent une source
 * qualifiée et le serveur). La longitude est conservée mais ne déplace pas le soleil : l'heure des ombres est l'heure
 * solaire du lieu (formule de déclinaison simplifiée, déjà celle de la Planche).
 */
import type { Vec3 } from "./vecteur.js";

export interface Emplacement {
  /** Degrés décimaux, nord positif (−90 à 90). */
  readonly latitude: number;
  /** Degrés décimaux, est positif (−180 à 180). */
  readonly longitude: number;
  /** Altitude déclarée (m), sans effet sur la géométrie. */
  readonly altitude?: number;
  /** Nord vrai : angle en degrés depuis l'axe vert (+y), dans le sens horaire vu de dessus (0 à 360 exclu). */
  readonly nord: number;
  /** Nom du lieu, libre. */
  readonly lieu?: string;
}

export type ChampEmplacement = "latitude" | "longitude" | "altitude" | "nord";
const RAD = Math.PI / 180;

/** Angle ramené dans [0, 360). */
export const normaliserNord = (angle: number): number => ((angle % 360) + 360) % 360;

const lireNombre = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** Emplacement lu d'une saisie (virgule ou point) ; le premier champ refusé est nommé, rien n'est corrigé en silence. */
export function lireEmplacement(s: { readonly latitude: string; readonly longitude: string; readonly altitude: string; readonly nord: string; readonly lieu: string }): { readonly emplacement: Emplacement } | { readonly erreur: ChampEmplacement } {
  const latitude = lireNombre(s.latitude);
  if (latitude === null || latitude < -90 || latitude > 90) return { erreur: "latitude" };
  const longitude = lireNombre(s.longitude);
  if (longitude === null || longitude < -180 || longitude > 180) return { erreur: "longitude" };
  const altitude = s.altitude.trim() === "" ? undefined : lireNombre(s.altitude);
  if (altitude === null) return { erreur: "altitude" };
  const nord = s.nord.trim() === "" ? 0 : lireNombre(s.nord);
  if (nord === null) return { erreur: "nord" };
  const lieu = s.lieu.trim().slice(0, 120);
  return { emplacement: { latitude, longitude, nord: normaliserNord(nord), ...(altitude !== undefined ? { altitude } : {}), ...(lieu ? { lieu } : {}) } };
}

export function estEmplacement(v: unknown): v is Emplacement {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  return fini(e["latitude"]) && Math.abs(e["latitude"]) <= 90 && fini(e["longitude"]) && Math.abs(e["longitude"]) <= 180 && fini(e["nord"]) && e["nord"] >= 0 && e["nord"] < 360 && (e["altitude"] === undefined || fini(e["altitude"])) && (e["lieu"] === undefined || (typeof e["lieu"] === "string" && e["lieu"].length <= 120));
}

/** Direction horizontale du nord vrai dans le repère du dessin (unitaire). */
export const directionNord = (nord: number): Vec3 => ({ x: Math.sin(nord * RAD), y: Math.cos(nord * RAD), z: 0 });

/**
 * Nord aligné sur une arête (de `a` à `b`) : sa direction horizontale, dans le sens le plus proche du nord actuel (une
 * arête n'a pas de sens propre). `null` pour une arête verticale.
 */
export function nordDepuisArete(a: Vec3, b: Vec3, actuel = 0): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;
  const angle = normaliserNord(Math.atan2(dx, dy) / RAD);
  const ecart = Math.abs(((angle - actuel + 540) % 360) - 180);
  return Number(normaliserNord(ecart <= 90 ? angle : angle + 180).toFixed(6));
}

/**
 * Soleil vu du lieu : hauteur (degrés) et direction **vers** le soleil dans le repère du dessin, pour un jour de l'année
 * (1–365), une heure solaire (0–24), une latitude et un nord vrai. Formule de déclinaison simplifiée.
 */
export function soleil(o: { readonly jour: number; readonly heure: number; readonly latitude: number; readonly nord?: number }): { readonly hauteur: number; readonly azimut: number; readonly direction: Vec3 } {
  const decl = 23.44 * RAD * Math.sin(((2 * Math.PI) / 365) * (o.jour - 81));
  const lat = o.latitude * RAD;
  const h = (o.heure - 12) * 15 * RAD;
  const alt = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h))));
  const cosAz = (Math.sin(decl) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat) || 1e-9);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (h > 0) az = 2 * Math.PI - az;
  // Azimut compté depuis le nord vrai vers l'est ; le nord vrai est tourné de `nord` par rapport à l'axe vert.
  const a = az + (o.nord ?? 0) * RAD;
  return { hauteur: alt / RAD, azimut: az / RAD, direction: { x: Math.sin(a) * Math.cos(alt), y: Math.cos(a) * Math.cos(alt), z: Math.sin(alt) } };
}
