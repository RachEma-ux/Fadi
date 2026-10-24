/**
 * Photos de la Communication (lot COM-13, COM-D15, COM-D16) — contrôle et nettoyage, purs (aucune bibliothèque, aucune
 * base), testés par `com-images.test.ts`.
 *
 * - Type reconnu par sa signature (jamais par l'en-tête Content-Type ni le nom) : JPEG ou PNG seulement.
 * - Dimensions lues dans l'image (SOFn du JPEG, IHDR du PNG) : 2 560 px au plus par côté.
 * - Métadonnées retirées : JPEG — segments APP1 à APP13 et APP15 (EXIF, XMP, IPTC, position GPS comprise) et
 *   commentaires COM, APP0 (JFIF) et APP14 (Adobe, couleurs) gardés ; PNG — fragments texte, EXIF et date (tEXt, zTXt,
 *   iTXt, eXIf, tIME) retirés, les fragments d'image et de couleur gardés. Les pixels ne sont jamais réencodés.
 * - Taille après nettoyage : 2 Mo au plus.
 */
import { createHash } from "node:crypto";

export const PHOTO_OCTETS_MAX = 2 * 1024 * 1024;
export const PHOTO_COTE_MAX = 2560;
export type PhotoMime = "image/jpeg" | "image/png";

export interface PhotoNettoyee {
  mime: PhotoMime;
  width: number;
  height: number;
  content: Buffer;
  sha256: string;
}

export class PhotoRefusee extends Error {
  constructor(public readonly status: 413 | 415 | 422, public readonly code: string, message: string) {
    super(message);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function typeDePhoto(b: Buffer): PhotoMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  return null;
}

/** Marqueurs JPEG de début de trame (SOF0 à SOF15, sauf DHT C4, JPG C8, DAC CC) : portent hauteur et largeur. */
const estSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function nettoyerJpeg(b: Buffer): { content: Buffer; width: number; height: number } {
  const garde: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  let width = 0, height = 0;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new PhotoRefusee(422, "photo_illisible", "Photo JPEG illisible.");
    const m = b[i + 1]!;
    // Bourrage (FF FF…) et marqueurs sans longueur.
    if (m === 0xff) { i += 1; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { garde.push(b.subarray(i, i + 2)); i += 2; continue; }
    if (m === 0xd9) { garde.push(b.subarray(i, i + 2)); i += 2; break; }
    if (i + 4 > b.length) throw new PhotoRefusee(422, "photo_illisible", "Photo JPEG tronquée.");
    const len = b.readUInt16BE(i + 2);
    const fin = i + 2 + len;
    if (len < 2 || fin > b.length) throw new PhotoRefusee(422, "photo_illisible", "Photo JPEG tronquée.");
    if (estSof(m)) {
      if (len < 7) throw new PhotoRefusee(422, "photo_illisible", "En-tête de trame JPEG invalide.");
      height = b.readUInt16BE(i + 5);
      width = b.readUInt16BE(i + 7);
    }
    const metadonnee = (m >= 0xe1 && m <= 0xed) || m === 0xef || m === 0xfe;
    if (!metadonnee) garde.push(b.subarray(i, fin));
    if (m === 0xda) {
      // Début des données compressées : tout le reste (données, marqueurs RST, EOI) est gardé tel quel.
      garde.push(b.subarray(fin));
      i = b.length;
      break;
    }
    i = fin;
  }
  if (!width || !height) throw new PhotoRefusee(422, "photo_illisible", "Dimensions JPEG absentes.");
  return { content: Buffer.concat(garde), width, height };
}

const PNG_RETIRES = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function nettoyerPng(b: Buffer): { content: Buffer; width: number; height: number } {
  const garde: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  let width = 0, height = 0, fin = false;
  while (i < b.length && !fin) {
    if (i + 12 > b.length) throw new PhotoRefusee(422, "photo_illisible", "Photo PNG tronquée.");
    const len = b.readUInt32BE(i);
    const type = b.toString("latin1", i + 4, i + 8);
    const bout = i + 12 + len;
    if (bout > b.length) throw new PhotoRefusee(422, "photo_illisible", "Photo PNG tronquée.");
    if (type === "IHDR") { width = b.readUInt32BE(i + 8); height = b.readUInt32BE(i + 12); }
    if (!PNG_RETIRES.has(type)) garde.push(b.subarray(i, bout));
    if (type === "IEND") fin = true;
    i = bout;
  }
  if (!width || !height) throw new PhotoRefusee(422, "photo_illisible", "En-tête PNG absent.");
  return { content: Buffer.concat(garde), width, height };
}

/** Contrôle et nettoie une photo téléversée ; refuse (413, 415, 422) ce qui sort des règles COM-D15. */
export function nettoyerPhoto(brut: Buffer): PhotoNettoyee {
  if (brut.length === 0) throw new PhotoRefusee(422, "photo_vide", "Photo vide.");
  const mime = typeDePhoto(brut);
  if (!mime) throw new PhotoRefusee(415, "type_refuse", "Seules les photos JPEG ou PNG sont acceptées.");
  const r = mime === "image/jpeg" ? nettoyerJpeg(brut) : nettoyerPng(brut);
  if (r.width > PHOTO_COTE_MAX || r.height > PHOTO_COTE_MAX) {
    throw new PhotoRefusee(422, "photo_trop_grande", `La photo mesure ${r.width} × ${r.height} px : ${PHOTO_COTE_MAX} px au plus par côté.`);
  }
  if (r.content.length > PHOTO_OCTETS_MAX) throw new PhotoRefusee(413, "photo_trop_lourde", "La photo dépasse 2 Mo.");
  return { mime, width: r.width, height: r.height, content: r.content, sha256: createHash("sha256").update(r.content).digest("hex") };
}

/** Position déclarée (COM-D16) : coordonnées WGS84 valides, précision positive ou absente. */
export function positionValide(p: { lat: number; lon: number; precisionM?: number | null | undefined }): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
    && (p.precisionM === undefined || p.precisionM === null || (Number.isFinite(p.precisionM) && p.precisionM >= 0 && p.precisionM <= 100_000));
}
