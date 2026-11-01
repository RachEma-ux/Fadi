/**
 * Lecture et écriture PNG du serveur pour les illustrations Studio (lot F) : décodage des PNG 8 bits non entrelacés
 * (RVB, RVBA, gris, gris + alpha — ce que produit un canevas), filtres 0 à 4 ; relecture des blocs `tEXt` / `iTXt` non
 * compressés ; encodage RVBA avec un bloc `iTXt` de provenance juste après `IHDR`. `node:zlib` seulement ; tout autre
 * PNG (palette, 16 bits, entrelacé, CRC faux) est refusé plutôt qu'approché.
 */
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of b) c = TABLE[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class StudioPngError extends Error {}
export interface StudioPngLu { largeur: number; hauteur: number; rgba: Uint8Array; textes: Record<string, string> }

const CANAUX: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function lirePng(octets: Uint8Array, coteMax = 4096): StudioPngLu {
  const b = Buffer.from(octets.buffer, octets.byteOffset, octets.byteLength);
  if (b.length < 33 || !b.subarray(0, 8).equals(SIGNATURE)) throw new StudioPngError("fichier PNG attendu");
  let i = 8, largeur = 0, hauteur = 0, type = -1, ihdr = false, fin = false;
  const idat: Buffer[] = [];
  const textes: Record<string, string> = {};
  while (i + 12 <= b.length) {
    const n = b.readUInt32BE(i);
    if (i + 12 + n > b.length) throw new StudioPngError("bloc tronqué");
    const nom = b.toString("latin1", i + 4, i + 8);
    const donnees = b.subarray(i + 8, i + 8 + n);
    if (crc32(b.subarray(i + 4, i + 8 + n)) !== b.readUInt32BE(i + 8 + n)) throw new StudioPngError(`bloc ${nom} : CRC invalide`);
    if (!ihdr && nom !== "IHDR") throw new StudioPngError("en-tête IHDR attendu en premier");
    if (nom === "IHDR") {
      largeur = donnees.readUInt32BE(0); hauteur = donnees.readUInt32BE(4);
      const profondeur = donnees[8]!; type = donnees[9]!;
      if (profondeur !== 8 || !(type in CANAUX) || donnees[10] !== 0 || donnees[11] !== 0 || donnees[12] !== 0) throw new StudioPngError("PNG 8 bits non entrelacé (gris, RVB, RVBA) attendu");
      if (largeur < 1 || hauteur < 1 || largeur > coteMax || hauteur > coteMax) throw new StudioPngError(`dimensions de 1 à ${coteMax} pixels attendues`);
      ihdr = true;
    } else if (nom === "IDAT") idat.push(donnees);
    else if (nom === "tEXt" || nom === "iTXt") {
      const z = donnees.indexOf(0);
      if (z > 0) {
        const cle = donnees.toString("latin1", 0, z);
        if (nom === "tEXt") textes[cle] = donnees.toString("latin1", z + 1);
        else if (donnees[z + 1] === 0) {
          let j = donnees.indexOf(0, z + 3) + 1;
          j = donnees.indexOf(0, j) + 1;
          if (j > 0) textes[cle] = donnees.toString("utf8", j);
        }
      }
    } else if (nom === "IEND") { fin = true; break; }
    i += 12 + n;
  }
  if (!ihdr || !fin || idat.length === 0) throw new StudioPngError("PNG incomplet");
  const canaux = CANAUX[type]!;
  const ligne = largeur * canaux;
  let brut: Buffer;
  try { brut = inflateSync(Buffer.concat(idat), { maxOutputLength: (ligne + 1) * hauteur + 1 }); } catch { throw new StudioPngError("données d’image illisibles"); }
  if (brut.length !== (ligne + 1) * hauteur) throw new StudioPngError("données d’image de taille inattendue");
  const px = new Uint8Array(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (ligne + 1)]!;
    const src = brut.subarray(y * (ligne + 1) + 1, (y + 1) * (ligne + 1));
    const o = y * ligne;
    for (let x = 0; x < ligne; x++) {
      const a = x >= canaux ? px[o + x - canaux]! : 0;
      const up = y > 0 ? px[o - ligne + x]! : 0;
      const c = x >= canaux && y > 0 ? px[o - ligne + x - canaux]! : 0;
      let v = src[x]!;
      if (filtre === 1) v += a;
      else if (filtre === 2) v += up;
      else if (filtre === 3) v += (a + up) >> 1;
      else if (filtre === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      else if (filtre !== 0) throw new StudioPngError("filtre PNG inconnu");
      px[o + x] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(largeur * hauteur * 4);
  for (let p = 0; p < largeur * hauteur; p++) {
    const s = p * canaux, d = p * 4;
    if (canaux === 4) { rgba[d] = px[s]!; rgba[d + 1] = px[s + 1]!; rgba[d + 2] = px[s + 2]!; rgba[d + 3] = px[s + 3]!; }
    else if (canaux === 3) { rgba[d] = px[s]!; rgba[d + 1] = px[s + 1]!; rgba[d + 2] = px[s + 2]!; rgba[d + 3] = 255; }
    else if (canaux === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]!; rgba[d + 3] = px[s + 1]!; }
    else { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]!; rgba[d + 3] = 255; }
  }
  return { largeur, hauteur, rgba, textes };
}

function bloc(nom: string, donnees: Buffer): Buffer {
  const out = Buffer.alloc(12 + donnees.length);
  out.writeUInt32BE(donnees.length, 0);
  out.write(nom, 4, "latin1");
  donnees.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + donnees.length)), 8 + donnees.length);
  return out;
}

/** PNG RVBA (filtre 0, compression zlib déterministe), avec des blocs `iTXt` après `IHDR`. */
export function ecrirePng(img: { largeur: number; hauteur: number; rgba: Uint8Array }, textes: Record<string, string> = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.largeur, 0); ihdr.writeUInt32BE(img.hauteur, 4); ihdr[8] = 8; ihdr[9] = 6;
  const ligne = img.largeur * 4;
  const brut = Buffer.alloc((ligne + 1) * img.hauteur);
  for (let y = 0; y < img.hauteur; y++) Buffer.from(img.rgba.buffer, img.rgba.byteOffset + y * ligne, ligne).copy(brut, y * (ligne + 1) + 1);
  const itxt = Object.entries(textes).map(([cle, t]) => bloc("iTXt", Buffer.concat([Buffer.from(cle, "latin1"), Buffer.from([0, 0, 0, 0, 0]), Buffer.from(t, "utf8")])));
  return Buffer.concat([SIGNATURE, bloc("IHDR", ihdr), ...itxt, bloc("IDAT", deflateSync(brut, { level: 9 })), bloc("IEND", Buffer.alloc(0))]);
}
