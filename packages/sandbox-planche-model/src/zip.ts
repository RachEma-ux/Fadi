/**
 * (Cas 4, lot C4, étape 6) Archive ZIP minimale, sans bibliothèque : écriture « stockée » (méthode 0) ou compressée
 * (méthode 8, `ecrireZipCompresse`) et lecture. La (dé)compression passe par les flux intégrés aux navigateurs
 * (`compression.ts`, décision « 3 A » du 28 novembre 2026), qui sont asynchrones : une archive reçue est d'abord
 * « dépliée » (`deplierZip` : entrées compressées rendues stockées, CRC contrôlé), puis lue par `lireZip`, synchrone.
 * Sert au `.ifczip`, au 3MF, au KMZ et au lot d'échange. Pur : ni DOM, ni React.
 */
import { compresser, decompresser } from "./compression.js";

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLE_CRC[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date et heure DOS (heure locale de l'horodatage donné, en UTC pour la reproductibilité). */
function dateDos(d: Date): { heure: number; jour: number } {
  return {
    heure: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    jour: ((Math.max(1980, d.getUTCFullYear()) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

interface EntreeBrute {
  readonly nom: string;
  /** Octets rangés (compressés pour la méthode 8). */
  readonly brut: Uint8Array;
  readonly methode: 0 | 8;
  readonly crc: number;
  /** Taille décompressée. */
  readonly taille: number;
}

/** Archive stockée : chaque entrée telle quelle, noms en UTF-8 (drapeau 11). Même contenu et même date, mêmes octets. */
export function ecrireZip(entrees: readonly { readonly nom: string; readonly donnees: Uint8Array }[], date: Date): Uint8Array {
  return assembler(entrees.map((e) => ({ nom: e.nom, brut: e.donnees, methode: 0, crc: crc32(e.donnees), taille: e.donnees.length })), date);
}

/** Archive compressée (« deflate-raw », méthode 8) ; une entrée que la compression n'allège pas reste stockée. */
export async function ecrireZipCompresse(entrees: readonly { readonly nom: string; readonly donnees: Uint8Array }[], date: Date): Promise<Uint8Array> {
  const bruts: EntreeBrute[] = [];
  for (const e of entrees) {
    const z = await compresser(e.donnees);
    bruts.push(z.length < e.donnees.length ? { nom: e.nom, brut: z, methode: 8, crc: crc32(e.donnees), taille: e.donnees.length } : { nom: e.nom, brut: e.donnees, methode: 0, crc: crc32(e.donnees), taille: e.donnees.length });
  }
  return assembler(bruts, date);
}

function assembler(entrees: readonly EntreeBrute[], date: Date): Uint8Array {
  const enc = new TextEncoder();
  const { heure, jour } = dateDos(date);
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = enc.encode(e.nom);
    const crc = e.crc;
    const l = new Uint8Array(30 + nom.length);
    const v = new DataView(l.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint16(8, e.methode, true);
    v.setUint16(10, heure, true);
    v.setUint16(12, jour, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, e.brut.length, true);
    v.setUint32(22, e.taille, true);
    v.setUint16(26, nom.length, true);
    l.set(nom, 30);
    const c = new Uint8Array(46 + nom.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, e.methode, true);
    w.setUint16(12, heure, true);
    w.setUint16(14, jour, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, e.brut.length, true);
    w.setUint32(24, e.taille, true);
    w.setUint16(28, nom.length, true);
    w.setUint32(42, decalage, true);
    c.set(nom, 46);
    locaux.push(l, e.brut);
    centraux.push(c);
    decalage += l.length + e.brut.length;
  }
  const tailleCentrale = centraux.reduce((n, c) => n + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, entrees.length, true);
  f.setUint16(10, entrees.length, true);
  f.setUint32(12, tailleCentrale, true);
  f.setUint32(16, decalage, true);
  const sortie = new Uint8Array(decalage + tailleCentrale + 22);
  let k = 0;
  for (const p of [...locaux, ...centraux, fin]) {
    sortie.set(p, k);
    k += p.length;
  }
  return sortie;
}

export const estZip = (d: Uint8Array): boolean => d.length >= 4 && d[0] === 0x50 && d[1] === 0x4b && d[2] === 0x03 && d[3] === 0x04;

/** Entrées brutes d'une archive (répertoire central), sans décompression ; `null` = archive illisible. */
function entreesBrutes(d: Uint8Array): EntreeBrute[] | null {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let fin = -1;
  for (let i = d.length - 22; i >= Math.max(0, d.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;
  const nombre = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const sortie: EntreeBrute[] = [];
  for (let k = 0; k < nombre; k++) {
    if (p + 46 > d.length || v.getUint32(p, true) !== 0x02014b50) return null;
    const methode = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const taille = v.getUint32(p + 20, true);
    const tailleDepliee = v.getUint32(p + 24, true);
    const longueurNom = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const commentaire = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = dec.decode(d.subarray(p + 46, p + 46 + longueurNom));
    p += 46 + longueurNom + extra + commentaire;
    if (local + 30 > d.length || v.getUint32(local, true) !== 0x04034b50) return null;
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const brut = d.subarray(debut, debut + taille);
    if (nom.endsWith("/")) continue;
    if ((methode !== 0 && methode !== 8) || brut.length !== taille) return null;
    sortie.push({ nom, brut, methode, crc, taille: tailleDepliee });
  }
  return sortie;
}

/**
 * Entrées d'une archive stockée, CRC contrôlé. `null` = archive illisible, ou entrée compressée : la déplier d'abord
 * (`deplierZip`), la décompression des navigateurs étant asynchrone.
 */
export function lireZip(d: Uint8Array): { readonly nom: string; readonly donnees: Uint8Array }[] | null {
  const e = entreesBrutes(d);
  if (!e || e.some((x) => x.methode !== 0 || crc32(x.brut) !== x.crc)) return null;
  return e.map((x) => ({ nom: x.nom, donnees: x.brut }));
}

/** Archive « dépliée » : chaque entrée compressée décompressée (CRC contrôlé) et rangée stockée ; `null` = illisible. */
export async function deplierZip(d: Uint8Array): Promise<Uint8Array | null> {
  const e = entreesBrutes(d);
  if (!e) return null;
  if (e.every((x) => x.methode === 0)) return d;
  const sortie: { nom: string; donnees: Uint8Array }[] = [];
  for (const x of e) {
    const donnees = x.methode === 0 ? x.brut : await decompresser(x.brut, "deflate-raw");
    if (!donnees || crc32(donnees) !== x.crc) return null;
    sortie.push({ nom: x.nom, donnees });
  }
  return ecrireZip(sortie, new Date(Date.UTC(1980, 0, 1)));
}

/** Octets prêts pour les lecteurs synchrones : une archive ZIP est dépliée, tout autre fichier rendu tel quel. */
export const deplierSiZip = async (d: Uint8Array): Promise<Uint8Array> => (estZip(d) ? ((await deplierZip(d)) ?? d) : d);
