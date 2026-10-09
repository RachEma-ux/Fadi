/**
 * Nuages de points (P2-7, DA-22-08, 09) — pur. Lecture des formats ouverts sans bibliothèque tierce : LAS 1.0 à 1.4
 * non compressé (formats de point 0 à 10 : X, Y, Z entiers × échelle + décalage de l'en-tête), XYZ / PTS texte
 * (x y z [r g b | i] par ligne, séparateurs espace, tabulation, point-virgule ou virgule). E57 (XML + binaire
 * CRC) et LAZ (compression) : non lus, refus nommé (déclaré, D-189). Le nuage est **décimé** à l'import (pas régulier)
 * pour tenir dans le modèle ; le fichier d'origine reste la source. Le repère du relevé n'est jamais deviné : une
 * translation d'origine explicite ramène le nuage dans le repère local du niveau.
 */
export interface Point3 { x: number; y: number; z: number }
export interface Bornes3 { min: Point3; max: Point3 }

export interface NuageLu {
  format: "las" | "xyz" | "pts";
  /** Points du fichier (avant décimation). */
  nombrePoints: number;
  /** Échantillon retenu (décimation régulière), dans le repère du fichier. */
  points: Point3[];
  bornes: Bornes3;
  /** Pas de décimation appliqué (1 = tout). */
  pas: number;
  /** Version LAS, ou null. */
  version: string | null;
  avertissements: string[];
}

export class ErreurNuage extends Error {
  constructor(message: string) { super(message); this.name = "ErreurNuage"; }
}

export const MAX_POINTS_ECHANTILLON = 20000;

function bornes(points: readonly Point3[]): Bornes3 {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) { min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z); max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z); }
  return { min, max };
}

/** Lecture d'un LAS (ArrayBuffer / Uint8Array) ; `maxPoints` borne l'échantillon. */
export function lireLas(donnees: Uint8Array, maxPoints = MAX_POINTS_ECHANTILLON): NuageLu {
  const dv = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength);
  if (donnees.byteLength < 227 || String.fromCharCode(donnees[0]!, donnees[1]!, donnees[2]!, donnees[3]!) !== "LASF") throw new ErreurNuage("fichier LAS attendu (signature « LASF »)");
  const vMaj = donnees[24]!, vMin = donnees[25]!;
  const offset = dv.getUint32(96, true);
  const format = donnees[104]!;
  const tailleEnr = dv.getUint16(105, true);
  let n = dv.getUint32(107, true);
  const sx = dv.getFloat64(131, true), sy = dv.getFloat64(139, true), sz = dv.getFloat64(147, true);
  const ox = dv.getFloat64(155, true), oy = dv.getFloat64(163, true), oz = dv.getFloat64(171, true);
  if (vMaj === 1 && vMin >= 4 && n === 0 && donnees.byteLength >= 255) {
    // LAS 1.4 : compte 64 bits à l'offset 247 (l'ancien champ 32 bits peut être nul).
    const bas = dv.getUint32(247, true), haut = dv.getUint32(251, true);
    n = haut * 4294967296 + bas;
  }
  if (format > 10) throw new ErreurNuage(`format de point LAS ${format} inconnu (0 à 10 attendus)`);
  if (format >= 128 || tailleEnr < 20) throw new ErreurNuage("LAZ (LAS compressé) : non lu — fournissez un LAS non compressé (déclaré)");
  if (offset + n * tailleEnr > donnees.byteLength) throw new ErreurNuage(`fichier LAS tronqué : ${n} points annoncés, ${Math.floor((donnees.byteLength - offset) / tailleEnr)} présents`);
  if (!n) throw new ErreurNuage("LAS sans point");
  const pas = Math.max(1, Math.ceil(n / maxPoints));
  const points: Point3[] = [];
  for (let i = 0; i < n; i += pas) {
    const o = offset + i * tailleEnr;
    points.push({ x: dv.getInt32(o, true) * sx + ox, y: dv.getInt32(o + 4, true) * sy + oy, z: dv.getInt32(o + 8, true) * sz + oz });
  }
  return { format: "las", nombrePoints: n, points, bornes: bornes(points), pas, version: `${vMaj}.${vMin}`, avertissements: pas > 1 ? [`Nuage décimé : un point sur ${pas} (${points.length} retenus sur ${n}).`] : [] };
}

/** Lecture d'un XYZ / PTS texte ; une première ligne ne contenant qu'un entier (PTS) est le compte. */
export function lireXyz(texte: string, maxPoints = MAX_POINTS_ECHANTILLON): NuageLu {
  const lignes = texte.split(/\r?\n/);
  const nombres: number[][] = [];
  let format: "xyz" | "pts" = "xyz";
  for (const l of lignes) {
    const t = l.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    const v = t.split(/[\s;,]+/).map((x) => Number(x));
    if (v.length === 1 && Number.isInteger(v[0]) && !nombres.length) { format = "pts"; continue; }
    if (v.length < 3 || !v.slice(0, 3).every((x) => Number.isFinite(x))) continue;
    nombres.push(v);
  }
  if (!nombres.length) throw new ErreurNuage("aucun point « x y z » lisible");
  const pas = Math.max(1, Math.ceil(nombres.length / maxPoints));
  const points: Point3[] = [];
  for (let i = 0; i < nombres.length; i += pas) points.push({ x: nombres[i]![0]!, y: nombres[i]![1]!, z: nombres[i]![2]! });
  return { format, nombrePoints: nombres.length, points, bornes: bornes(points), pas, version: null, avertissements: pas > 1 ? [`Nuage décimé : un point sur ${pas} (${points.length} retenus sur ${nombres.length}).`] : [] };
}

/** Lecture selon l'extension ou la signature ; E57 et LAZ refusés nommément. */
export function lireNuage(nom: string, donnees: Uint8Array, maxPoints = MAX_POINTS_ECHANTILLON): NuageLu {
  const ext = (nom.split(".").pop() ?? "").toLowerCase();
  if (ext === "e57") throw new ErreurNuage("E57 : format XML + binaire non lu en P2-7 (déclaré) — convertissez en LAS ou XYZ");
  if (ext === "laz") throw new ErreurNuage("LAZ : compression non lue (déclaré) — fournissez un LAS non compressé");
  if (ext === "las" || (donnees.length > 4 && donnees[0] === 0x4c && donnees[1] === 0x41 && donnees[2] === 0x53 && donnees[3] === 0x46)) return lireLas(donnees, maxPoints);
  return lireXyz(new TextDecoder().decode(donnees), maxPoints);
}

/** Tranche horizontale (relevé de plans, DA-22-07) : points dont z ∈ [z − e/2, z + e/2], projetés en plan. */
export function coupeNuage(points: readonly Point3[], z: number, epaisseur: number): { x: number; y: number }[] {
  const h = Math.max(0, epaisseur) / 2;
  return points.filter((p) => p.z >= z - h && p.z <= z + h).map((p) => ({ x: p.x, y: p.y }));
}
