/**
 * Acquisition d'un original de terrain dans le dépôt du volume (lot TER-02, TER-D10) : seulement depuis l'adresse d'une
 * fiche relue et versée au dépôt Git (source approuvée) — jamais une adresse fournie à l'exécution. Deux méthodes :
 *  - `telechargement` : le fichier publié, tel quel, en flux, empreinte comparée à celle de la fiche ;
 *  - `fenetre` : extrait d'un COG distant (lecture par plages HTTP), aligné sur la grille de la source, valeurs copiées
 *    **sans rééchantillonnage**, clés de géoréférence et NoData recopiées telles quelles ; l'empreinte de l'extrait est
 *    comparée à celle de la fiche quand elle y figure.
 * L'écriture passe par un fichier `.part` renommé à la fin : un téléchargement interrompu ne laisse jamais un faux original.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fromUrl, writeArrayBuffer } from "geotiff";
import type { DeclarationTerrain } from "@parcours/geodata-model";
import type { StockageTerrain } from "./stockage.js";

export class AcquisitionRefusee extends Error {}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function telecharger(url: string, cible: string, attendue: string): Promise<{ empreinte: string; taille: number }> {
  const r = await fetch(url, { redirect: "error" });
  if (!r.ok || !r.body) throw new AcquisitionRefusee(`Téléchargement refusé par la source (HTTP ${r.status}).`);
  const part = `${cible}.part`;
  const h = createHash("sha256");
  let taille = 0;
  const flux = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
  flux.on("data", (m: Buffer) => { h.update(m); taille += m.length; });
  try {
    await pipeline(flux, createWriteStream(part, { flags: "wx" }));
  } catch (e) {
    await rm(part, { force: true });
    throw e;
  }
  const empreinte = h.digest("hex");
  if (empreinte !== attendue) {
    await rm(part, { force: true });
    throw new AcquisitionRefusee(`Empreinte reçue ${empreinte} différente de celle de la fiche ${attendue} : le fichier n'est pas déposé.`);
  }
  await rename(part, cible);
  return { empreinte, taille };
}

/** Clés de géoréférence recopiées telles quelles depuis la source (sauf l'origine, recalculée pour la fenêtre). */
async function extraire(url: string, f: { ouest: number; sud: number; est: number; nord: number }): Promise<Uint8Array> {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const [ox, oy] = image.getOrigin() as [number, number];
  const [rx, ry] = image.getResolution() as [number, number];
  const c0 = Math.floor((f.ouest - ox) / rx);
  const c1 = Math.ceil((f.est - ox) / rx);
  const l0 = Math.floor((f.nord - oy) / ry);
  const l1 = Math.ceil((f.sud - oy) / ry);
  if (!(c0 >= 0 && l0 >= 0 && c1 <= image.getWidth() && l1 <= image.getHeight() && c1 > c0 && l1 > l0)) throw new AcquisitionRefusee("Fenêtre hors de l'emprise de la source.");
  const [valeurs] = (await image.readRasters({ window: [c0, l0, c1, l1], samples: [0] })) as unknown as [Float32Array | Int16Array | Int32Array];
  if (!(valeurs instanceof Float32Array)) throw new AcquisitionRefusee("Extrait de fenêtre limité aux valeurs Float32 dans ce lot.");
  const cles = { ...(image.getGeoKeys() ?? {}) } as Record<string, unknown>;
  const nodata = await image.getFileDirectory().loadValue("GDAL_NODATA");
  const meta: Record<string, unknown> = {
    width: c1 - c0,
    height: l1 - l0,
    ModelPixelScale: [Math.abs(rx), Math.abs(ry), 0],
    ModelTiepoint: [0, 0, 0, ox + c0 * rx, oy + l0 * ry, 0],
    ...cles,
    ...(typeof nodata === "string" ? { GDAL_NODATA: nodata.endsWith("\0") ? nodata : `${nodata}\0` } : {}),
  };
  return new Uint8Array(writeArrayBuffer(valeurs, meta as Parameters<typeof writeArrayBuffer>[1]));
}

/** Dépose l'original d'une fiche dans `depot/<fichier.nom>` ; renvoie son empreinte et sa taille. */
export async function acquerir(stockage: StockageTerrain, d: DeclarationTerrain): Promise<{ empreinte: string; taille: number; cible: string }> {
  await stockage.preparer();
  const cible = stockage.cheminDepot(d.fichier.nom);
  const a = d.acquisition;
  if (a.methode === "depot") throw new AcquisitionRefusee("Fiche « depot » : le fichier est déposé par l'exploitant, aucune adresse n'est lue.");
  if (a.methode === "telechargement") return { ...(await telecharger(a.url, cible, a.empreinte)), cible };
  const octets = await extraire(a.url, a.fenetre);
  const empreinte = sha256(octets);
  if (a.empreinte && a.empreinte !== empreinte) throw new AcquisitionRefusee(`Empreinte de l'extrait ${empreinte} différente de celle de la fiche ${a.empreinte} : la source a changé ; rien n'est déposé.`);
  await writeFile(`${cible}.part`, octets, { flag: "wx" });
  await rename(`${cible}.part`, cible);
  return { empreinte, taille: octets.length, cible };
}
