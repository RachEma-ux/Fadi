/**
 * Calcul des dérivés d'une version de terrain (plan v1.0, lot TER-03, décision TER-D6) : exécuté par le travailleur
 * `terrain-worker` (GDAL épinglé), jamais dans une requête interactive.
 *
 *  1. altitude : l'original converti en COG (`gdal_translate -of COG`, compression sans perte), valeurs relues et
 *     **comparées cellule à cellule** à l'original ; aperçus par moyenne, pour l'affichage seulement ;
 *  2. pente (degrés, Horn) et ombrage (315° / 45°) calculés par le paquet pur sur la grille numérique d'origine, pas
 *     horizontal en mètres (grille géographique ramenée en mètres ligne par ligne), puis convertis en COG ;
 *  3. couverture : rectangles des cellules valides dans le repère natif (union exacte, NoData exclu) ;
 *  4. courbes de niveau à l'équidistance permise par la précision (TER-D17), en coordonnées du repère natif.
 * Aucune valeur n'est lissée ni corrigée ; NoData reste distinct de zéro. Les versions des logiciels sont relevées.
 */
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { fromFile } from "geotiff";
import { courbesDeNiveau, espacementMetrique, ombrage, pente, rectanglesValides, sansValeur, type Courbe, type GrilleAltitudes } from "@parcours/geodata-model";
import { empreinteFichier } from "./stockage.js";

const executer = promisify(execFile);
export class ErreurTraitement extends Error {}

export interface FichierDerive { readonly nature: "altitude" | "pente" | "ombrage"; readonly chemin: string; readonly empreinte: string; readonly taille: number }
export interface ResultatDerives {
  readonly fichiers: readonly FichierDerive[];
  /** Rectangles de couverture valide dans le repère natif : [x0, y0, x1, y1]. */
  readonly rectangles: readonly (readonly [number, number, number, number])[];
  readonly cellulesValides: number;
  readonly cellulesTotal: number;
  readonly courbes: readonly { readonly altitude: number; readonly maitresse: boolean; readonly lignes: readonly (readonly (readonly [number, number])[])[] }[];
  readonly logiciels: { readonly gdal: string; readonly methodePente: string; readonly ombrage: string };
}

/** Version de GDAL disponible (« GDAL 3.6.2, released … »), ou null. */
export async function versionGdal(): Promise<string | null> {
  try { return (await executer("gdalinfo", ["--version"])).stdout.trim(); } catch { return null; }
}

async function versCog(source: string, cible: string, reechantillonnage: "AVERAGE" | "NEAREST"): Promise<void> {
  await executer("gdal_translate", ["-q", "-of", "COG", "-co", "COMPRESS=DEFLATE", "-co", "PREDICTOR=YES", "-co", "BLOCKSIZE=512",
    "-co", `OVERVIEW_RESAMPLING=${reechantillonnage}`, "-co", "BIGTIFF=IF_SAFER", source, cible], { maxBuffer: 16 * 1024 * 1024 });
  const info = JSON.parse((await executer("gdalinfo", ["-json", cible], { maxBuffer: 64 * 1024 * 1024 })).stdout) as { metadata?: Record<string, Record<string, string>> };
  if (info.metadata?.["IMAGE_STRUCTURE"]?.["LAYOUT"] !== "COG") throw new ErreurTraitement(`${cible} : GDAL n'a pas produit de COG.`);
}

/** Lit la bande 1 en entier, avec la géoréférence (origine, résolution) et les balises à recopier. */
async function lireGrille(chemin: string) {
  const tiff = await fromFile(chemin);
  try {
    const image = await tiff.getImage();
    const [bande] = (await image.readRasters({ samples: [0] })) as unknown as [ArrayLike<number>];
    return {
      largeur: image.getWidth(),
      hauteur: image.getHeight(),
      valeurs: bande,
      origine: image.getOrigin() as number[],
      resolution: image.getResolution() as number[],
      cles: { ...(image.getGeoKeys() ?? {}) } as Record<string, unknown>,
      nodata: image.getGDALNoData() as number | null,
    };
  } finally {
    await tiff.close?.();
  }
}

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Écrit une grille dérivée avec la géoréférence **exacte** de l'original, recopiée par GDAL (système de coordonnées WKT
 * complet et transformation affine lus par `gdalinfo -json`) : valeurs brutes petit-boutistes + VRT, converties ensuite
 * en COG. Aucune clé de géoréférence n'est réécrite à la main.
 */
async function ecrireDerive(original: string, valeurs: Float32Array | Uint8Array, nodata: string, base: string): Promise<string> {
  const info = JSON.parse((await executer("gdalinfo", ["-json", "-nomd", "-norat", "-noct", original], { maxBuffer: 64 * 1024 * 1024 })).stdout) as { size: [number, number]; geoTransform: number[]; coordinateSystem?: { wkt?: string } };
  const [largeur, hauteur] = info.size;
  const octet = valeurs instanceof Uint8Array;
  const brut = `${base}.raw`;
  await writeFile(brut, Buffer.from(valeurs.buffer, valeurs.byteOffset, valeurs.byteLength));
  const taille = octet ? 1 : 4;
  const vrt = `<VRTDataset rasterXSize="${largeur}" rasterYSize="${hauteur}">
  <SRS>${echapper(info.coordinateSystem?.wkt ?? "")}</SRS>
  <GeoTransform>${info.geoTransform.join(", ")}</GeoTransform>
  <VRTRasterBand dataType="${octet ? "Byte" : "Float32"}" band="1" subClass="VRTRawRasterBand">
    <NoDataValue>${nodata}</NoDataValue>
    <SourceFilename relativeToVRT="1">${brut.split("/").pop()}</SourceFilename>
    <ImageOffset>0</ImageOffset><PixelOffset>${taille}</PixelOffset><LineOffset>${taille * largeur}</LineOffset><ByteOrder>LSB</ByteOrder>
  </VRTRasterBand>
</VRTDataset>
`;
  await writeFile(`${base}.vrt`, vrt);
  return `${base}.vrt`;
}

/**
 * Calcule les dérivés de l'original dans `dossier` (créé, vidé s'il existait : un traitement repris repart de zéro).
 * `geographique` : grille en degrés (pas ramené en mètres sur l'ellipsoïde WGS 84).
 */
export async function calculerDerives(original: string, dossier: string, o: { readonly geographique: boolean; readonly nodata: number | null; readonly equidistance: number }): Promise<ResultatDerives> {
  const gdal = await versionGdal();
  if (!gdal) throw new ErreurTraitement("GDAL absent : le traitement tourne dans le travailleur terrain (TER-D6).");
  await rm(dossier, { recursive: true, force: true });
  await mkdir(dossier, { recursive: true });

  // 1. Altitude en COG, relue et comparée à l'original.
  const altitude = join(dossier, "altitude.tif");
  await versCog(original, altitude, "AVERAGE");
  const g = await lireGrille(original);
  const relu = await lireGrille(altitude);
  const nodata = g.nodata ?? o.nodata;
  if (relu.largeur !== g.largeur || relu.hauteur !== g.hauteur) throw new ErreurTraitement("COG : dimensions différentes de l'original.");
  for (let i = 0; i < g.largeur * g.hauteur; i++) {
    const a = g.valeurs[i]!, b = relu.valeurs[i]!;
    if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) throw new ErreurTraitement(`COG : valeur différente de l'original à la cellule ${i}.`);
  }
  if (relu.origine.some((v, i) => v !== g.origine[i]) || relu.resolution.some((v, i) => v !== g.resolution[i])) throw new ErreurTraitement("COG : géoréférence différente de l'original.");

  // 2. Pente et ombrage (paquet pur), pas en mètres.
  const [rx, ry] = g.resolution as [number, number];
  // Origine au coin nord-ouest de la première cellule : un raster « PixelIsPoint » (GTRasterTypeGeoKey = 2) déclare le
  // centre de la cellule, décalé d'un demi-pas.
  const pointe = g.cles["GTRasterTypeGeoKey"] === 2;
  const ox = (g.origine[0] as number) - (pointe ? rx / 2 : 0);
  const oy = (g.origine[1] as number) - (pointe ? ry / 2 : 0);
  const grille: GrilleAltitudes = {
    largeur: g.largeur, hauteur: g.hauteur, valeurs: g.valeurs, nodata,
    pasX: o.geographique ? (l: number) => espacementMetrique(oy + (l + 0.5) * ry, Math.abs(rx), Math.abs(ry)).pasX : Math.abs(rx),
    pasY: o.geographique ? espacementMetrique(oy + (g.hauteur / 2) * ry, Math.abs(rx), Math.abs(ry)).pasY : Math.abs(ry),
  };
  const fichiers: FichierDerive[] = [];
  const p = pente(grille);
  for (let i = 0; i < p.length; i++) if (Number.isNaN(p[i]!)) p[i] = -9999;
  await versCog(await ecrireDerive(original, p, "-9999", join(dossier, "pente.brut")), join(dossier, "pente.tif"), "AVERAGE");
  const om = ombrage(grille);
  const octets = new Uint8Array(om.length);
  for (let i = 0; i < om.length; i++) octets[i] = Number.isNaN(om[i]!) ? 0 : 1 + Math.round(om[i]! * 254);
  await versCog(await ecrireDerive(original, octets, "0", join(dossier, "ombrage.brut")), join(dossier, "ombrage.tif"), "AVERAGE");
  for (const f of ["pente.brut.raw", "pente.brut.vrt", "ombrage.brut.raw", "ombrage.brut.vrt"]) await rm(join(dossier, f), { force: true });
  for (const nature of ["altitude", "pente", "ombrage"] as const) {
    const chemin = join(dossier, `${nature}.tif`);
    fichiers.push({ nature, chemin, ...(await empreinteFichier(chemin)) });
  }

  // 3. Couverture valide (repère natif) ; 4. courbes de niveau (repère natif). Coordonnées de grille → repère : coin.
  const versRepere = (c: number, l: number): [number, number] => [ox + c * rx, oy + l * ry];
  const rects = rectanglesValides(grille).map(([c0, l0, c1, l1]) => {
    const [xa, ya] = versRepere(c0, l0);
    const [xb, yb] = versRepere(c1, l1);
    return [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)] as const;
  });
  let valides = 0;
  for (let i = 0; i < g.largeur * g.hauteur; i++) if (!sansValeur(g.valeurs[i]!, nodata)) valides++;
  const courbes = courbesDeNiveau(grille, o.equidistance).map((k: Courbe) => ({ altitude: k.altitude, maitresse: k.maitresse, lignes: k.lignes.map((ligne) => ligne.map(([c, l]) => versRepere(c, l))) }));

  return {
    fichiers, rectangles: rects, cellulesValides: valides, cellulesTotal: g.largeur * g.hauteur, courbes,
    logiciels: { gdal, methodePente: "Horn 3 × 3 (paquet @parcours/geodata-model)", ombrage: "azimut 315°, hauteur 45°, rendu seulement" },
  };
}
