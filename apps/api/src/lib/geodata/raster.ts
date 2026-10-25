/**
 * Couches raster GeoData (D-GD-13) : lecture d'un GeoTIFF mono-bande en WGS 84 (EPSG:4326 seulement, aucune
 * reprojection devinée), grille ramenée au plus à MAX_PIXELS_RASTER cellules (plus proche voisin, déclaré), stockage
 * Float32 compressé, puis rendu de tuiles PNG 256 × 256 (Web Mercator) et valeur en un point. Un pixel « nodata » reste
 * transparent et se lit « non évalué », jamais zéro.
 */
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { fromArrayBuffer } from "geotiff";
import { couleurPixel, MAX_PIXELS_RASTER, type DescriptionRaster } from "@parcours/geodata-model";

export interface GrilleRaster {
  readonly largeur: number;
  readonly hauteur: number;
  /** Emprise [ouest, sud, est, nord] en degrés. */
  readonly emprise: readonly [number, number, number, number];
  readonly nodata: number | null;
  readonly valeurs: Float32Array;
}

export interface LectureRaster { readonly grille: GrilleRaster; readonly crs: string; readonly tailleSource: readonly [number, number]; readonly reechantillonne: boolean }

/** Lit un GeoTIFF : EPSG:4326 exigé, première bande, grille ramenée sous la borne de pixels. */
export async function lireGeoTiff(octets: Buffer): Promise<LectureRaster> {
  const tiff = await fromArrayBuffer(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer);
  const image = await tiff.getImage();
  const cles = (image.getGeoKeys() ?? {}) as Record<string, number | undefined>;
  const epsg = cles["GeographicTypeGeoKey"] ?? cles["ProjectedCSTypeGeoKey"];
  if (cles["ProjectedCSTypeGeoKey"] || (epsg !== undefined && epsg !== 4326)) {
    throw new Error(`Système de coordonnées EPSG:${epsg ?? "inconnu"} refusé : seul EPSG:4326 (WGS 84) est accepté, aucune reprojection n'est devinée.`);
  }
  const [ouest, sud, est, nord] = image.getBoundingBox() as [number, number, number, number];
  if (!(ouest >= -180 && est <= 180 && sud >= -90 && nord <= 90 && est > ouest && nord > sud)) throw new Error("Emprise hors des plages de longitude et de latitude : le fichier n'est pas en degrés WGS 84.");
  const l0 = image.getWidth();
  const h0 = image.getHeight();
  const facteur = Math.max(1, Math.sqrt((l0 * h0) / MAX_PIXELS_RASTER));
  const largeur = Math.max(1, Math.floor(l0 / facteur));
  const hauteur = Math.max(1, Math.floor(h0 / facteur));
  const bandes = (await image.readRasters({ samples: [0], width: largeur, height: hauteur, resampleMethod: "nearest", interleave: false })) as unknown as ArrayLike<number>[];
  const brut = bandes[0]!;
  const nd = image.getGDALNoData();
  const valeurs = new Float32Array(largeur * hauteur);
  for (let i = 0; i < valeurs.length; i++) valeurs[i] = brut[i]!;
  return { grille: { largeur, hauteur, emprise: [ouest, sud, est, nord], nodata: nd === null || nd === undefined ? null : Number(nd), valeurs }, crs: "EPSG:4326 (GeoTIFF)", tailleSource: [l0, h0], reechantillonne: largeur !== l0 || hauteur !== h0 };
}

export const compresser = (v: Float32Array): Buffer => deflateSync(Buffer.from(v.buffer, v.byteOffset, v.byteLength), { level: 6 });
export function decompresser(b: Buffer, n: number): Float32Array {
  const o = inflateSync(b);
  if (o.byteLength !== n * 4) throw new Error("Grille raster corrompue (taille inattendue).");
  return new Float32Array(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength));
}

/** Valeur d'une cellule au point (lon, lat), ou null (hors emprise, nodata). */
export function valeurAuPoint(g: GrilleRaster, lon: number, lat: number): number | null {
  const [ouest, sud, est, nord] = g.emprise;
  if (lon < ouest || lon >= est || lat <= sud || lat > nord) return null;
  const col = Math.min(g.largeur - 1, Math.floor(((lon - ouest) / (est - ouest)) * g.largeur));
  const lig = Math.min(g.hauteur - 1, Math.floor(((nord - lat) / (nord - sud)) * g.hauteur));
  const v = g.valeurs[lig * g.largeur + col]!;
  return !Number.isFinite(v) || (g.nodata !== null && v === g.nodata) ? null : v;
}

const TAILLE = 256;

/** PNG RGBA minimal (filtre « aucun », deflate) : aucune bibliothèque d'image. */
export function encoderPng(rgba: Uint8Array, largeur: number, hauteur: number): Buffer {
  const lignes = Buffer.alloc((largeur * 4 + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    lignes[y * (largeur * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * largeur * 4, largeur * 4).copy(lignes, y * (largeur * 4 + 1) + 1);
  }
  const bloc = (type: string, donnees: Buffer) => {
    const t = Buffer.from(type, "ascii");
    const l = Buffer.alloc(4);
    l.writeUInt32BE(donnees.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(Buffer.concat([t, donnees])) >>> 0);
    return Buffer.concat([l, t, donnees, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc("IHDR", ihdr), bloc("IDAT", deflateSync(lignes)), bloc("IEND", Buffer.alloc(0))]);
}

let tuileVide: Buffer | null = null;
export const pngTransparent = (): Buffer => (tuileVide ??= encoderPng(new Uint8Array(TAILLE * TAILLE * 4), TAILLE, TAILLE));

/** Tuile z/x/y (Web Mercator) : plus proche cellule, couleur par la symbologie ; `null` si la tuile ne recoupe pas la grille. */
export function tuileRaster(g: GrilleRaster, d: Pick<DescriptionRaster, "palette" | "min" | "max" | "classes">, z: number, x: number, y: number): Buffer | null {
  const n = 2 ** z;
  const lonDe = (px: number) => (px / (TAILLE * n)) * 360 - 180;
  const latDe = (py: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / (TAILLE * n)))) * 180) / Math.PI;
  const [ouest, sud, est, nord] = g.emprise;
  if (lonDe((x + 1) * TAILLE) <= ouest || lonDe(x * TAILLE) >= est || latDe(y * TAILLE) <= sud || latDe((y + 1) * TAILLE) >= nord) return null;
  const rgba = new Uint8Array(TAILLE * TAILLE * 4);
  const cache = new Map<number, [number, number, number, number]>();
  for (let py = 0; py < TAILLE; py++) {
    const lat = latDe(y * TAILLE + py + 0.5);
    for (let px = 0; px < TAILLE; px++) {
      const v = valeurAuPoint(g, lonDe(x * TAILLE + px + 0.5), lat);
      if (v === null) continue;
      let c = cache.get(v);
      if (!c) { c = couleurPixel(v, d); if (cache.size < 4096) cache.set(v, c); }
      rgba.set(c, (py * TAILLE + px) * 4);
    }
  }
  return encoderPng(rgba, TAILLE, TAILLE);
}
