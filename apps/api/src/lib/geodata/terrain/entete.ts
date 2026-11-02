/**
 * Lecture de l'en-tête d'un GeoTIFF de terrain (lot TER-02) : signature du fichier, dimensions, clés de géoréférence,
 * pas, emprise, NoData, type des valeurs — sans lire la grille. Ce que le fichier dit de lui-même, rien de plus : les
 * écarts avec la fiche sont jugés par `controlerTerrain` (paquet pur).
 */
import { open } from "node:fs/promises";
import { fromFile } from "geotiff";
import type { EnTeteRaster } from "@parcours/geodata-model";

export class FichierIllisible extends Error {}

/** Signatures TIFF (petit-boutiste, gros-boutiste) et BigTIFF. */
const SIGNATURES = ["49492a00", "4d4d002a", "49492b00", "4d4d002b"];

export async function signatureTiff(chemin: string): Promise<boolean> {
  const f = await open(chemin, "r");
  try {
    const b = Buffer.alloc(4);
    const { bytesRead } = await f.read(b, 0, 4, 0);
    return bytesRead === 4 && SIGNATURES.includes(b.toString("hex"));
  } finally {
    await f.close();
  }
}

const entier = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x > 0 && x < 32767 ? x : null);

/** En-tête d'un GeoTIFF ; `FichierIllisible` si la signature ou la structure ne sont pas celles d'un TIFF. */
export async function lireEnTete(chemin: string): Promise<EnTeteRaster> {
  if (!(await signatureTiff(chemin))) throw new FichierIllisible("Signature TIFF absente : le fichier n'est pas un GeoTIFF.");
  let tiff;
  let image;
  try {
    tiff = await fromFile(chemin);
    image = await tiff.getImage();
  } catch (e) {
    throw new FichierIllisible(`Structure TIFF illisible : ${(e as Error).message}`);
  }
  try {
    const cles = (image.getGeoKeys() ?? {}) as Record<string, unknown>;
    const fd = image.getFileDirectory();
    const projete = entier(cles["ProjectedCSTypeGeoKey"]);
    const geographique = projete === null;
    const geo = entier(cles["GeographicTypeGeoKey"]);
    const crs = projete ?? geo;
    let pas: [number, number] = [Number.NaN, Number.NaN];
    let bornes: [number, number, number, number] = [Number.NaN, Number.NaN, Number.NaN, Number.NaN];
    try {
      const r = image.getResolution();
      pas = [Math.abs(r[0]!), Math.abs(r[1]!)];
      const b = image.getBoundingBox();
      bornes = [b[0]!, b[1]!, b[2]!, b[3]!];
    } catch { /* aucune géoréférence lisible : contrôlé ensuite (rejet) */ }
    const sf = await fd.loadValue("SampleFormat");
    const bps = await fd.loadValue("BitsPerSample");
    const premier = (x: unknown, defaut: number): number => (typeof x === "number" ? x : x && typeof x === "object" && "length" in x && (x as ArrayLike<number>).length ? Number((x as ArrayLike<number>)[0]) : defaut);
    const format = premier(sf, 1);
    const bits = premier(bps, 0);
    const typeEchantillon = format === 3 ? "flottant" : format === 2 ? "entier" : "entier-non-signe";
    const nd = image.getGDALNoData();
    const rasterType = cles["GTRasterTypeGeoKey"];
    return {
      format: "GeoTIFF",
      largeur: image.getWidth(),
      hauteur: image.getHeight(),
      crsHorizontal: crs ? `EPSG:${crs}` : null,
      geographique,
      verticalEpsg: entier(cles["VerticalCSTypeGeoKey"]),
      uniteVerticaleEpsg: entier(cles["VerticalUnitsGeoKey"]),
      uniteHorizontaleEpsg: geographique ? null : entier(cles["ProjLinearUnitsGeoKey"]),
      pas,
      bornes,
      nodata: nd === null || nd === undefined || !Number.isFinite(Number(nd)) ? null : Number(nd),
      typeEchantillon,
      bits,
      pixel: rasterType === 1 ? "aire" : rasterType === 2 ? "point" : null,
    };
  } finally {
    await tiff.close?.();
  }
}
