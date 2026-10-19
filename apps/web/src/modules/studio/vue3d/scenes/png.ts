/**
 * Provenance incluse dans un fichier PNG (lot E.5-03) : bloc `iTXt` (texte UTF-8 non compressé, PNG 1.2 §11.3.4.5)
 * inséré juste après l'en-tête `IHDR`, et relecture des blocs `tEXt` / `iTXt`. Les pixels ne sont pas touchés. Pur :
 * ni DOM ni canevas.
 */

/** Mot-clé du bloc de provenance d'un rendu du modèle. */
export const CLE_PROVENANCE_PNG = "fadi:rendu";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (ISO 3309, celui des blocs PNG). */
export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const lireU32 = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const ecrireU32 = (b: Uint8Array, i: number, v: number) => { b[i] = v >>> 24; b[i + 1] = (v >>> 16) & 0xff; b[i + 2] = (v >>> 8) & 0xff; b[i + 3] = v & 0xff; };

function verifierSignature(png: Uint8Array): void {
  if (png.length < 33 || SIGNATURE.some((o, i) => png[i] !== o)) throw new Error("fichier PNG attendu");
  if (String.fromCharCode(...png.subarray(12, 16)) !== "IHDR") throw new Error("en-tête IHDR attendu en premier");
}

/** Bloc `iTXt` (mot-clé latin-1 de 1 à 79 caractères, texte UTF-8, sans compression ni langue). */
function blocItxt(cle: string, texte: string): Uint8Array {
  if (!/^[\x20-\x7e]{1,79}$/.test(cle)) throw new Error("mot-clé PNG invalide");
  const enc = new TextEncoder();
  const donnees = new Uint8Array([...enc.encode(cle), 0, 0, 0, 0, 0, ...enc.encode(texte)]);
  const bloc = new Uint8Array(12 + donnees.length);
  ecrireU32(bloc, 0, donnees.length);
  bloc.set(enc.encode("iTXt"), 4);
  bloc.set(donnees, 8);
  ecrireU32(bloc, 8 + donnees.length, crc32(bloc.subarray(4, 8 + donnees.length)));
  return bloc;
}

/** Copie du PNG avec un bloc `iTXt` `cle` = `texte` après `IHDR`. */
export function insererTextePng(png: Uint8Array, cle: string, texte: string): Uint8Array {
  verifierSignature(png);
  const finIhdr = 8 + 12 + lireU32(png, 8);
  const bloc = blocItxt(cle, texte);
  const out = new Uint8Array(png.length + bloc.length);
  out.set(png.subarray(0, finIhdr), 0);
  out.set(bloc, finIhdr);
  out.set(png.subarray(finIhdr), finIhdr + bloc.length);
  return out;
}

/** Textes `tEXt` (latin-1) et `iTXt` non compressés du PNG, par mot-clé ; un bloc au CRC faux est refusé. */
export function lireTextesPng(png: Uint8Array): Record<string, string> {
  verifierSignature(png);
  const out: Record<string, string> = {};
  const dec = new TextDecoder();
  for (let i = 8; i + 12 <= png.length;) {
    const n = lireU32(png, i);
    const type = String.fromCharCode(...png.subarray(i + 4, i + 8));
    const donnees = png.subarray(i + 8, i + 8 + n);
    if (crc32(png.subarray(i + 4, i + 8 + n)) !== lireU32(png, i + 8 + n)) throw new Error(`bloc ${type} : CRC invalide`);
    if (type === "tEXt" || type === "iTXt") {
      const zero = donnees.indexOf(0);
      const cle = String.fromCharCode(...donnees.subarray(0, zero));
      if (type === "tEXt") out[cle] = String.fromCharCode(...donnees.subarray(zero + 1));
      else if (donnees[zero + 1] === 0) {
        // Drapeau de compression nul, méthode, puis langue et mot-clé traduit terminés par un zéro.
        let j = zero + 3;
        j = donnees.indexOf(0, j) + 1;
        j = donnees.indexOf(0, j) + 1;
        out[cle] = dec.decode(donnees.subarray(j));
      }
    }
    if (type === "IEND") break;
    i += 12 + n;
  }
  return out;
}
