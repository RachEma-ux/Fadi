/**
 * Cas 2 du catalogue, lot 5 — soleil (n° 77, 105, 110). Pur, sans React ni DOM.
 *
 * - Position du soleil par l'algorithme de référence de la NOAA (Solar Calculator, d'après J. Meeus, « Astronomical
 *   Algorithms », 1991) : déclinaison, équation du temps, angle horaire, hauteur et azimut ; précision de l'ordre du
 *   centième de degré entre 1901 et 2099 (sans réfraction atmosphérique : la hauteur est géométrique).
 * - Heure légale (n° 105) : le décalage du fuseau par rapport à UTC est **fourni** par l'interface (lu dans la base des
 *   fuseaux du navigateur) ; sans décalage, l'heure donnée est l'heure solaire vraie du lieu, comme avant le lot 5.
 * - Course solaire et masques depuis un point (n° 110) : trois courses (équinoxe de mars, solstices de juin et de
 *   décembre), heure par heure à pas fin, et silhouette des masques formée par les objets de la Planche seulement — le
 *   relief et les bâtiments non modélisés ne sont pas fournis (non évalués).
 */
import type { Vec3 } from "./vecteur.js";

const RAD = Math.PI / 180;
const deg = (r: number): number => r / RAD;
const modulo = (a: number, n: number): number => ((a % n) + n) % n;

/** Jour julien d'une date civile (calendrier grégorien) à 0 h UTC. */
export function jourJulien(annee: number, mois: number, jour: number): number {
  let a = annee;
  let m = mois;
  if (m <= 2) {
    a -= 1;
    m += 12;
  }
  const A = Math.floor(a / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (a + 4716)) + Math.floor(30.6001 * (m + 1)) + jour + B - 1524.5;
}

/** Rang du jour dans l'année (1 à 366). */
export function rangDuJour(annee: number, mois: number, jour: number): number {
  return Math.round(jourJulien(annee, mois, jour) - jourJulien(annee, 1, 1)) + 1;
}

/** Date civile (mois 1–12, jour) d'un rang de jour dans l'année. */
export function dateDuRang(annee: number, rang: number): { readonly mois: number; readonly jour: number } {
  const d = new Date(Date.UTC(annee, 0, 1) + (Math.max(1, Math.round(rang)) - 1) * 86_400_000);
  return { mois: d.getUTCMonth() + 1, jour: d.getUTCDate() };
}

/** Déclinaison (degrés) et équation du temps (minutes) au siècle julien `T` (NOAA). */
function ephemeride(T: number): { readonly declinaison: number; readonly equationTemps: number } {
  const L0 = modulo(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const longitudeApparente = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const obliquiteMoyenne = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliquite = obliquiteMoyenne + 0.00256 * Math.cos(omega * RAD);
  const declinaison = deg(Math.asin(Math.sin(obliquite * RAD) * Math.sin(longitudeApparente * RAD)));
  const y = Math.tan((obliquite / 2) * RAD) ** 2;
  const eot = y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD);
  return { declinaison, equationTemps: 4 * deg(eot) };
}

export interface DemandeSoleil {
  readonly annee: number;
  /** Mois (1–12) et jour du mois. */
  readonly mois: number;
  readonly jour: number;
  /** Heure (décimale, 0–24) : heure légale si `decalageMinutes` est donné, sinon heure solaire vraie du lieu. */
  readonly heure: number;
  /** Décalage du fuseau sur UTC, en minutes (heure d'été comprise), lu dans la base des fuseaux ; absent = heure solaire. */
  readonly decalageMinutes?: number | null;
  /** Degrés décimaux, nord positif. */
  readonly latitude: number;
  /** Degrés décimaux, est positif ; nécessaire à l'heure légale. */
  readonly longitude?: number | null;
  /** Nord vrai : angle depuis l'axe vert, sens horaire vu de dessus (degrés). */
  readonly nord?: number;
}

export interface PositionSoleil {
  /** Hauteur géométrique au-dessus de l'horizon (degrés). */
  readonly hauteur: number;
  /** Azimut depuis le nord vrai, vers l'est (0 à 360). */
  readonly azimut: number;
  /** Direction **vers** le soleil dans le repère du dessin (unitaire). */
  readonly direction: Vec3;
  /** Heure solaire vraie du lieu (décimale). */
  readonly heureSolaire: number;
  /** Équation du temps (minutes) : heure solaire vraie − heure solaire moyenne. */
  readonly equationTemps: number;
  /** Déclinaison du soleil (degrés). */
  readonly declinaison: number;
  /** `true` : l'heure donnée est l'heure légale (fuseau et longitude connus). */
  readonly legale: boolean;
}

/** Heure solaire vraie (décimale) d'une heure légale, d'après le fuseau, la longitude et l'équation du temps. */
export const heureSolaireVraie = (heureLegale: number, decalageMinutes: number, longitude: number, equationTemps: number): number =>
  modulo(heureLegale * 60 + equationTemps + 4 * longitude - decalageMinutes, 1440) / 60;

/** Position du soleil (n° 77, 105). L'heure légale n'est employée que si le décalage **et** la longitude sont connus. */
export function positionSoleil(d: DemandeSoleil): PositionSoleil {
  const legale = d.decalageMinutes !== undefined && d.decalageMinutes !== null && d.longitude !== undefined && d.longitude !== null;
  const jj0 = jourJulien(d.annee, d.mois, d.jour);
  // Instant UTC : exact en heure légale ; en heure solaire, midi solaire approché (la déclinaison varie peu dans la journée).
  const utc = legale ? d.heure - (d.decalageMinutes as number) / 60 : d.heure - (d.longitude ?? 0) / 15;
  const T = (jj0 + utc / 24 - 2451545) / 36525;
  const { declinaison, equationTemps } = ephemeride(T);
  const heureSolaire = legale ? heureSolaireVraie(d.heure, d.decalageMinutes as number, d.longitude as number, equationTemps) : modulo(d.heure, 24);
  const angleHoraire = (heureSolaire * 60) / 4 - 180;
  const lat = d.latitude * RAD;
  const dec = declinaison * RAD;
  const cosZ = Math.max(-1, Math.min(1, Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(angleHoraire * RAD)));
  const zenith = Math.acos(cosZ);
  const denominateur = Math.cos(lat) * Math.sin(zenith);
  let azimut: number;
  if (Math.abs(denominateur) < 1e-12) azimut = d.latitude >= 0 ? 180 : 0;
  else {
    const a = deg(Math.acos(Math.max(-1, Math.min(1, (Math.sin(lat) * Math.cos(zenith) - Math.sin(dec)) / denominateur))));
    azimut = angleHoraire > 0 ? modulo(a + 180, 360) : modulo(540 - a, 360);
  }
  const hauteur = 90 - deg(zenith);
  const az = (azimut + (d.nord ?? 0)) * RAD;
  const h = hauteur * RAD;
  return { hauteur, azimut, direction: { x: Math.sin(az) * Math.cos(h), y: Math.cos(az) * Math.cos(h), z: Math.sin(h) }, heureSolaire, equationTemps, declinaison, legale };
}

// ——————————————————————————————————————————————————————————————— Course solaire et masques (n° 110)

/** Triangles monde (coordonnées, 3 par sommet) : la Planche les donne par `maillagesPlanche`. */
export interface MaillageMasques {
  readonly positions: readonly number[];
  readonly triangles: readonly number[];
}

/** Silhouette des masques : hauteur (degrés) par tranche d'azimut **vrai** (`pas` degrés, tranche k = [k·pas, (k+1)·pas[). */
export interface SilhouetteMasques {
  readonly pas: number;
  readonly hauteurs: readonly number[];
}

/** Pas angulaire de la silhouette (choix Fadi : 2°, lisible sur un diagramme de 300 px). */
export const PAS_SILHOUETTE = 2;
/** Pas de calcul des courses (minutes, choix Fadi). */
export const PAS_COURSE_MINUTES = 10;
/** Écart minimal au point d'observation (m) : la face où il est posé ne le masque pas. */
const ECART_POINT = 0.02;

/** Normale unitaire du triangle (a, b, c) si `q` est dessus (à ECART_POINT près), sinon `null`. */
function surTriangle(q: Vec3, p: readonly number[], a: number, b: number, c: number): Vec3 | null {
  const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
  const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-12) return null;
  nx /= l;
  ny /= l;
  nz /= l;
  const wx = q.x - p[a]!, wy = q.y - p[a + 1]!, wz = q.z - p[a + 2]!;
  if (Math.abs(wx * nx + wy * ny + wz * nz) > ECART_POINT) return null;
  // Coordonnées barycentriques dans le plan du triangle, avec la même tolérance ramenée aux côtés.
  const uu = ux * ux + uy * uy + uz * uz, uv = ux * vx + uy * vy + uz * vz, vv = vx * vx + vy * vy + vz * vz;
  const wu = wx * ux + wy * uy + wz * uz, wv = wx * vx + wy * vy + wz * vz;
  const d = uv * uv - uu * vv;
  const s = (uv * wv - vv * wu) / d;
  const t = (uv * wu - uu * wv) / d;
  const tol = ECART_POINT / Math.sqrt(Math.max(uu, vv));
  return s >= -tol && t >= -tol && s + t <= 1 + tol ? { x: nx, y: ny, z: nz } : null;
}

/**
 * Silhouette des masques vue du point : pour un azimut donné, le plus haut point d'un triangle plan se trouve sur son
 * bord ; les arêtes sont donc découpées assez finement (au plus un demi-pas d'azimut entre deux points) et chaque point
 * relève la hauteur de sa tranche. Les azimuts sont vrais (le nord du dessin est corrigé de `nord`).
 */
export function silhouetteMasques(point: Vec3, maillages: readonly MaillageMasques[], nord = 0, pas = PAS_SILHOUETTE): SilhouetteMasques {
  const n = Math.round(360 / pas);
  const hauteurs = new Array<number>(n).fill(0);
  const relever = (x: number, y: number, z: number) => {
    const dx = x - point.x;
    const dy = y - point.y;
    const dz = z - point.z;
    const horizontal = Math.hypot(dx, dy);
    if (horizontal < ECART_POINT || dz <= 0) return;
    const h = deg(Math.atan2(dz, horizontal));
    // Azimut du dessin (depuis +y, horaire) ramené au nord vrai.
    const az = modulo(deg(Math.atan2(dx, dy)) - nord, 360);
    const k = Math.min(n - 1, Math.floor(az / pas));
    if (h > hauteurs[k]!) hauteurs[k] = h;
  };
  // Face où le point est posé (une fenêtre dans un mur) : elle ne se masque pas par ses arêtes mais par son plan, qui
  // cache tout le demi-espace situé derrière elle (normale sortante, sens des triangles).
  const derriere = (nx: number, ny: number, nz: number) => {
    for (let k = 0; k < n; k++) {
      const a = (((k + 0.5) * pas + nord) * Math.PI) / 180; // azimut du dessin du milieu de la tranche
      const c = nx * Math.sin(a) + ny * Math.cos(a);
      if (c >= -1e-9) continue;
      const h = nz <= 1e-9 ? 90 : deg(Math.atan(-c / nz));
      if (h > hauteurs[k]!) hauteurs[k] = h;
    }
  };
  for (const m of maillages) {
    const p = m.positions;
    for (let t = 0; t + 2 < m.triangles.length; t += 3) {
      const ids = [m.triangles[t]!, m.triangles[t + 1]!, m.triangles[t + 2]!];
      const porteur = surTriangle(point, p, ids[0]! * 3, ids[1]! * 3, ids[2]! * 3);
      if (porteur) {
        derriere(porteur.x, porteur.y, porteur.z);
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const a = ids[k]! * 3;
        const b = ids[(k + 1) % 3]! * 3;
        const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!;
        const bx = p[b]!, by = p[b + 1]!, bz = p[b + 2]!;
        // Écart angulaire vu du point, borné : assez de points pour ne sauter aucune tranche.
        const ua = Math.atan2(ax - point.x, ay - point.y);
        const ub = Math.atan2(bx - point.x, by - point.y);
        let ecart = Math.abs(deg(ub - ua));
        if (ecart > 180) ecart = 360 - ecart;
        const segments = Math.min(1440, Math.max(1, Math.ceil(ecart / (pas / 2)), Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.5)));
        for (let s = 0; s <= segments; s++) {
          const f = s / segments;
          relever(ax + (bx - ax) * f, ay + (by - ay) * f, az + (bz - az) * f);
        }
      }
    }
  }
  return { pas, hauteurs };
}

/** Hauteur du masque à un azimut vrai. */
export const hauteurMasque = (s: SilhouetteMasques, azimut: number): number => s.hauteurs[Math.min(s.hauteurs.length - 1, Math.floor(modulo(azimut, 360) / s.pas))] ?? 0;

export interface PointCourse {
  /** Heure (décimale) : légale si la course l'est, sinon solaire. */
  readonly heure: number;
  readonly azimut: number;
  readonly hauteur: number;
  readonly masque: boolean;
}

export interface CourseDuJour {
  /** Date retenue (mois, jour) : équinoxe de mars, solstices de juin et de décembre (dates conventionnelles du 21). */
  readonly mois: number;
  readonly jour: number;
  readonly points: readonly PointCourse[];
  /** Périodes masquées (heures de début et de fin). */
  readonly masquees: readonly { readonly de: number; readonly a: number }[];
}

export interface ResultatCourseSolaire {
  readonly point: Vec3;
  readonly legale: boolean;
  readonly silhouette: SilhouetteMasques;
  readonly courses: readonly CourseDuJour[];
}

/** Dates des trois courses (choix Fadi : le 21 de mars, juin et décembre, dates usuelles des diagrammes solaires). */
export const DATES_COURSES: readonly { readonly mois: number; readonly jour: number }[] = [
  { mois: 6, jour: 21 },
  { mois: 3, jour: 21 },
  { mois: 12, jour: 21 },
];

/**
 * Course solaire et masques depuis un point (n° 110). `decalage(mois, jour, heure)` rend le décalage du fuseau (minutes)
 * à cette date — il change avec l'heure d'été — ou `null` (heure solaire).
 */
export function courseSolaire(o: {
  readonly point: Vec3;
  readonly maillages: readonly MaillageMasques[];
  readonly annee: number;
  readonly latitude: number;
  readonly longitude?: number | null;
  readonly nord?: number;
  readonly decalage?: ((mois: number, jour: number) => number | null) | null;
}): ResultatCourseSolaire {
  const silhouette = silhouetteMasques(o.point, o.maillages, o.nord ?? 0);
  let legale = false;
  const courses = DATES_COURSES.map(({ mois, jour }) => {
    const dec = o.decalage?.(mois, jour) ?? null;
    const points: PointCourse[] = [];
    for (let minute = 0; minute <= 1440; minute += PAS_COURSE_MINUTES) {
      const heure = minute / 60;
      const s = positionSoleil({ annee: o.annee, mois, jour, heure, decalageMinutes: dec, latitude: o.latitude, longitude: o.longitude ?? null });
      legale = legale || s.legale;
      if (s.hauteur <= 0) continue;
      points.push({ heure, azimut: s.azimut, hauteur: s.hauteur, masque: s.hauteur < hauteurMasque(silhouette, s.azimut) });
    }
    const masquees: { de: number; a: number }[] = [];
    for (const p of points) {
      const der = masquees[masquees.length - 1];
      if (!p.masque) continue;
      if (der && Math.abs(der.a - p.heure) <= PAS_COURSE_MINUTES / 60 + 1e-9) der.a = p.heure;
      else masquees.push({ de: p.heure, a: p.heure });
    }
    return { mois, jour, points, masquees };
  });
  return { point: o.point, legale, silhouette, courses };
}

/** Heure décimale écrite « 10 h 40 ». */
export function texteHeure(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${hh} h ${String(mm).padStart(2, "0")}`;
}
