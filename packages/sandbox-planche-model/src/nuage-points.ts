/**
 * Cas 4 du catalogue des extensions, lot C4, étape 7f (D10-F23a-009) : nuage de points d'un relevé, posé en référence
 * verrouillée. Lecture sans bibliothèque des formats ouverts : LAS 1.0 à 1.4 non compressé (formats de point 0 à 10),
 * XYZ et PTS en texte, PLY sans faces (ASCII ou binaire). LAZ (compressé) et E57 sont refusés avec leur motif. Le nuage
 * est décimé à la lecture (un point sur n, pas régulier) pour l'affichage ; le fichier archivé reste la source.
 * Les points sont gardés relatifs à leur coin minimal (précision des grandes coordonnées d'un relevé géoréférencé).
 * Tranche horizontale et boîte de découpe isolent les points utiles ; un plan s'ajuste par moindres carrés à des
 * points choisis. Pur : ni DOM, ni React.
 */
import { lirePlyBrut } from "./formats-3d.js";
import type { PlacementReference } from "./references.js";
import type { Vec3 } from "./vecteur.js";

export type FormatNuage = "las" | "xyz" | "pts" | "ply";
export const FORMATS_NUAGE: readonly FormatNuage[] = ["las", "xyz", "pts", "ply"];

/** Points affichés au plus (maquette validée : « affichés 250 000 »). */
export const AFFICHES_MAX = 250_000;

/** Motif d'un refus de lecture, traduit par l'interface. */
export type ErreurLectureNuage = "laz" | "e57" | "ply-faces" | "illisible" | "vide" | "tronque";

export class ErreurNuagePoints extends Error {
  constructor(readonly code: ErreurLectureNuage, message: string) {
    super(message);
    this.name = "ErreurNuagePoints";
  }
}

export interface NuagePointsLu {
  readonly format: FormatNuage;
  /** Points du fichier (avant décimation). */
  readonly nombre: number;
  /** Points retenus, relatifs à `origine`, dans l'unité du fichier (3 nombres par point). */
  readonly points: Float32Array;
  /** Coin minimal du nuage retenu, unité du fichier. */
  readonly origine: Vec3;
  /** Étendue du nuage retenu, unité du fichier. */
  readonly etendue: Vec3;
  /** Pas de décimation (1 = tout). */
  readonly pas: number;
  /** Version LAS (« 1.2 »), ou null. */
  readonly version: string | null;
}

/** Format d'un nuage d'après le nom ; « laz » et « e57 » sont reconnus pour être refusés avec leur motif. */
export function formatNuageDuNom(nom: string): FormatNuage | "laz" | "e57" | null {
  const e = (nom.toLowerCase().split(".").pop() ?? "").trim();
  return e === "las" || e === "xyz" || e === "pts" || e === "ply" || e === "laz" || e === "e57" ? e : null;
}

/** Échantillon régulier : rangement relatif au coin minimal, en double avant la conversion en flottants 32 bits. */
function echantillon(n: number, max: number, lire: (i: number, sortie: number[]) => void): { points: Float32Array; origine: Vec3; etendue: Vec3; pas: number; retenus: number } {
  const pas = Math.max(1, Math.ceil(n / Math.max(1, max)));
  const retenus = Math.ceil(n / pas);
  const brut = new Float64Array(retenus * 3);
  const min = [Infinity, Infinity, Infinity];
  const maxi = [-Infinity, -Infinity, -Infinity];
  const p: number[] = [0, 0, 0];
  let k = 0;
  for (let i = 0; i < n; i += pas) {
    lire(i, p);
    for (let c = 0; c < 3; c++) {
      const v = p[c]!;
      brut[k * 3 + c] = v;
      if (v < min[c]!) min[c] = v;
      if (v > maxi[c]!) maxi[c] = v;
    }
    k++;
  }
  const points = new Float32Array(k * 3);
  for (let j = 0; j < k; j++) for (let c = 0; c < 3; c++) points[j * 3 + c] = brut[j * 3 + c]! - min[c]!;
  return { points, origine: { x: min[0]!, y: min[1]!, z: min[2]! }, etendue: { x: maxi[0]! - min[0]!, y: maxi[1]! - min[1]!, z: maxi[2]! - min[2]! }, pas, retenus: k };
}

/** LAS 1.0 à 1.4 non compressé : X, Y, Z entiers × échelle + décalage de l'en-tête. */
export function lireLas(octets: Uint8Array, max = AFFICHES_MAX): NuagePointsLu {
  if (octets.length < 227 || String.fromCharCode(octets[0]!, octets[1]!, octets[2]!, octets[3]!) !== "LASF") throw new ErreurNuagePoints("illisible", "Fichier LAS attendu (signature « LASF »).");
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const vMaj = octets[24]!;
  const vMin = octets[25]!;
  const debut = dv.getUint32(96, true);
  const format = octets[104]!;
  const taille = dv.getUint16(105, true);
  let n = dv.getUint32(107, true);
  if (format >= 128) throw new ErreurNuagePoints("laz", "LAZ (LAS compressé) : non lu. Fournissez un LAS non compressé.");
  if (format > 10 || taille < 20) throw new ErreurNuagePoints("illisible", `Format de point LAS ${format} inconnu (0 à 10 attendus).`);
  if (vMaj === 1 && vMin >= 4 && n === 0 && octets.length >= 255) n = dv.getUint32(251, true) * 4294967296 + dv.getUint32(247, true);
  if (!n) throw new ErreurNuagePoints("vide", "LAS sans point.");
  if (debut + n * taille > octets.length) throw new ErreurNuagePoints("tronque", `LAS tronqué : ${n} points annoncés, ${Math.max(0, Math.floor((octets.length - debut) / taille))} présents.`);
  const [sx, sy, sz, ox, oy, oz] = [131, 139, 147, 155, 163, 171].map((o) => dv.getFloat64(o, true)) as [number, number, number, number, number, number];
  const e = echantillon(n, max, (i, s) => {
    const o = debut + i * taille;
    s[0] = dv.getInt32(o, true) * sx + ox;
    s[1] = dv.getInt32(o + 4, true) * sy + oy;
    s[2] = dv.getInt32(o + 8, true) * sz + oz;
  });
  return { format: "las", nombre: n, points: e.points, origine: e.origine, etendue: e.etendue, pas: e.pas, version: `${vMaj}.${vMin}` };
}

/** XYZ ou PTS texte : « x y z [r g b | i] » par ligne ; une première ligne réduite à un entier est le compte du PTS. */
export function lireXyz(texte: string, format: "xyz" | "pts", max = AFFICHES_MAX): NuagePointsLu {
  const v: number[] = [];
  let premiere = true;
  for (const l of texte.split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    const m = t.split(/[\s;,]+/);
    if (premiere && m.length === 1 && /^\d+$/.test(m[0]!)) {
      premiere = false;
      continue;
    }
    premiere = false;
    if (m.length < 3) continue;
    const x = Number(m[0]);
    const y = Number(m[1]);
    const z = Number(m[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) v.push(x, y, z);
  }
  const n = v.length / 3;
  if (!n) throw new ErreurNuagePoints("vide", "Aucun point « x y z » lisible.");
  const e = echantillon(n, max, (i, s) => {
    s[0] = v[i * 3]!;
    s[1] = v[i * 3 + 1]!;
    s[2] = v[i * 3 + 2]!;
  });
  return { format, nombre: n, points: e.points, origine: e.origine, etendue: e.etendue, pas: e.pas, version: null };
}

/** Nuage d'après le nom du fichier ; LAZ, E57 et PLY avec faces sont refusés avec leur motif. */
export function lireNuagePoints(nom: string, octets: Uint8Array, max = AFFICHES_MAX): NuagePointsLu {
  const f = formatNuageDuNom(nom);
  if (f === "laz") throw new ErreurNuagePoints("laz", "LAZ (LAS compressé) : non lu. Fournissez un LAS non compressé.");
  if (f === "e57") throw new ErreurNuagePoints("e57", "E57 : non lu. Convertissez le relevé en LAS, XYZ, PTS ou PLY.");
  if (f === "las") return lireLas(octets, max);
  if (f === "ply") {
    let lu: ReturnType<typeof lirePlyBrut>;
    try {
      lu = lirePlyBrut(octets);
    } catch (e) {
      throw new ErreurNuagePoints("illisible", e instanceof Error ? e.message : "PLY illisible.");
    }
    if (lu.triangles.length > 0) throw new ErreurNuagePoints("ply-faces", "PLY avec faces : c'est un maillage, à poser par l'import d'un fabricant.");
    const n = lu.xyz.length / 3;
    if (!n) throw new ErreurNuagePoints("vide", "PLY sans point.");
    const e = echantillon(n, max, (i, s) => {
      s[0] = lu.xyz[i * 3]!;
      s[1] = lu.xyz[i * 3 + 1]!;
      s[2] = lu.xyz[i * 3 + 2]!;
    });
    return { format: "ply", nombre: n, points: e.points, origine: e.origine, etendue: e.etendue, pas: e.pas, version: null };
  }
  if (f === "xyz" || f === "pts") return lireXyz(new TextDecoder().decode(octets), f, max);
  throw new ErreurNuagePoints("illisible", "Format de nuage inconnu (LAS, XYZ, PTS ou PLY attendu).");
}

/**
 * Placement par défaut : le coin minimal du relevé à l'origine du projet, son point le plus bas à l'altitude 0. Le repère
 * du relevé n'est jamais deviné ; le placement se règle ensuite dans le panneau des références.
 */
export const placementNuageDefaut = (lu: Pick<NuagePointsLu, "origine">, echelle: number): PlacementReference => ({ x: -lu.origine.x * echelle, y: -lu.origine.y * echelle, z: -lu.origine.z * echelle, rotation: 0 });

/** Points dans le repère du projet (m) : (point relatif + origine) × échelle, tournés autour de la verticale, translatés. */
export function nuageDansProjet(lu: Pick<NuagePointsLu, "points" | "origine">, echelle: number, placement: PlacementReference): Float32Array {
  const c = Math.cos(placement.rotation);
  const s = Math.sin(placement.rotation);
  const p = lu.points;
  const r = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const X = (p[i]! + lu.origine.x) * echelle;
    const Y = (p[i + 1]! + lu.origine.y) * echelle;
    r[i] = placement.x + c * X - s * Y;
    r[i + 1] = placement.y + s * X + c * Y;
    r[i + 2] = placement.z + (p[i + 2]! + lu.origine.z) * echelle;
  }
  return r;
}

/** Boîte de découpe en plan (m, repère du projet). */
export interface BoiteNuage {
  readonly xmin: number;
  readonly ymin: number;
  readonly xmax: number;
  readonly ymax: number;
}

/** Emprise en plan et altitudes d'un nuage posé. */
export function empriseNuage(monde: Float32Array): { readonly boite: BoiteNuage; readonly zmin: number; readonly zmax: number } | null {
  if (monde.length < 3) return null;
  let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
  for (let i = 0; i < monde.length; i += 3) {
    const x = monde[i]!, y = monde[i + 1]!, z = monde[i + 2]!;
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
    if (z < zmin) zmin = z;
    if (z > zmax) zmax = z;
  }
  return { boite: { xmin, ymin, xmax, ymax }, zmin, zmax };
}

/** Boîte rangée (min ≤ max), d'après deux coins quelconques. */
export const boiteNuageDeCoins = (a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): BoiteNuage => ({ xmin: Math.min(a.x, b.x), ymin: Math.min(a.y, b.y), xmax: Math.max(a.x, b.x), ymax: Math.max(a.y, b.y) });

/** Tranche horizontale : points dont l'altitude est dans [altitude − e/2, altitude + e/2] et dans la boîte (m). */
export function trancheNuage(monde: Float32Array, altitude: number, epaisseur: number, boite: BoiteNuage | null): Float32Array {
  const h = Math.max(0, epaisseur) / 2;
  const bas = altitude - h;
  const haut = altitude + h;
  const r: number[] = [];
  for (let i = 0; i < monde.length; i += 3) {
    const x = monde[i]!, y = monde[i + 1]!, z = monde[i + 2]!;
    if (z < bas || z > haut) continue;
    if (boite && (x < boite.xmin || x > boite.xmax || y < boite.ymin || y > boite.ymax)) continue;
    r.push(x, y, z);
  }
  return Float32Array.from(r);
}

/** Points d'un tableau à plat (3 nombres par point). */
export function pointsDe(t: Float32Array): Vec3[] {
  const r: Vec3[] = [];
  for (let i = 0; i + 2 < t.length; i += 3) r.push({ x: t[i]!, y: t[i + 1]!, z: t[i + 2]! });
  return r;
}

export type PlanAjuste =
  | { readonly ok: true; readonly origine: Vec3; readonly normale: Vec3; readonly points: number; readonly ecartMoyen: number; readonly ecartMax: number }
  | { readonly ok: false; readonly erreur: "trop-peu" | "alignes" };

/** Valeurs propres croissantes et vecteur propre de la plus petite, matrice symétrique 3 × 3 (méthode de Jacobi). */
function decomposer(a: number[][]): { valeurs: [number, number, number]; normale: [number, number, number] } {
  const m = a.map((l) => [...l]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 50; it++) {
    let p = 0, q = 1;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) if (Math.abs(m[i]![j]!) > Math.abs(m[p]![q]!)) [p, q] = [i, j];
    if (Math.abs(m[p]![q]!) < 1e-18) break;
    const th = (m[q]![q]! - m[p]![p]!) / (2 * m[p]![q]!);
    const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    for (let k = 0; k < 3; k++) {
      const mkp = m[k]![p]!, mkq = m[k]![q]!;
      m[k]![p] = c * mkp - s * mkq;
      m[k]![q] = s * mkp + c * mkq;
    }
    for (let k = 0; k < 3; k++) {
      const mpk = m[p]![k]!, mqk = m[q]![k]!;
      m[p]![k] = c * mpk - s * mqk;
      m[q]![k] = s * mpk + c * mqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k]![p]!, vkq = v[k]![q]!;
      v[k]![p] = c * vkp - s * vkq;
      v[k]![q] = s * vkp + c * vkq;
    }
  }
  const ordre = [0, 1, 2].sort((x, y) => m[x]![x]! - m[y]![y]!);
  const i = ordre[0]!;
  return { valeurs: ordre.map((k) => m[k]![k]!) as [number, number, number], normale: [v[0]![i]!, v[1]![i]!, v[2]![i]!] };
}

/** Dispersion secondaire minimale, relative à la dispersion principale : en deçà, les points sont dits alignés. */
export const DISPERSION_PLAN_MIN = 0.02;

/**
 * Plan ajusté par moindres carrés (distance orthogonale) : passe par le centre des points, normale = direction de plus
 * faible dispersion. Écarts : moyenne quadratique et plus grand écart des points au plan (m). Trois points au moins,
 * non alignés : la deuxième dispersion doit atteindre 2 % de la première (des points pris dans une seule tranche mince
 * le long d'un mur sont presque alignés, leur plan n'est pas déterminé).
 */
export function ajusterPlan(points: readonly Vec3[]): PlanAjuste {
  if (points.length < 3) return { ok: false, erreur: "trop-peu" };
  const n = points.length;
  const c = points.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n, z: s.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a[i]![j]! += d[i]! * d[j]!;
  }
  const { valeurs, normale: [nx, ny, nz] } = decomposer(a);
  const l = Math.hypot(nx, ny, nz) || 1;
  let normale = { x: nx / l, y: ny / l, z: nz / l };
  if (normale.z < -1e-12 || (Math.abs(normale.z) <= 1e-12 && (normale.x < -1e-12 || (Math.abs(normale.x) <= 1e-12 && normale.y < 0)))) normale = { x: -normale.x, y: -normale.y, z: -normale.z };
  if (valeurs[2] <= 0 || Math.sqrt(Math.max(0, valeurs[1]) / valeurs[2]) < DISPERSION_PLAN_MIN) return { ok: false, erreur: "alignes" };
  let somme = 0;
  let max = 0;
  for (const p of points) {
    const d = Math.abs((p.x - c.x) * normale.x + (p.y - c.y) * normale.y + (p.z - c.z) * normale.z);
    somme += d * d;
    if (d > max) max = d;
  }
  return { ok: true, origine: c, normale, points: n, ecartMoyen: Math.sqrt(somme / n), ecartMax: max };
}
