/**
 * (Cas 4, lot C4, étape 6) Archive ZIP minimale, sans bibliothèque : écriture en mode « stocké » (méthode 0, sans
 * compression : aucune dépendance ajoutée, écart déclaré) et lecture des entrées stockées ou compressées (méthode 8,
 * `inflate.ts`). Sert au `.ifczip`. Pur : ni DOM, ni React.
 */
import { inflerSync } from "./inflate.js";

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

/** Archive stockée : chaque entrée telle quelle, noms en UTF-8 (drapeau 11). Même contenu et même date, mêmes octets. */
export function ecrireZip(entrees: readonly { readonly nom: string; readonly donnees: Uint8Array }[], date: Date): Uint8Array {
  const enc = new TextEncoder();
  const { heure, jour } = dateDos(date);
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = enc.encode(e.nom);
    const crc = crc32(e.donnees);
    const l = new Uint8Array(30 + nom.length);
    const v = new DataView(l.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true);
    v.setUint16(10, heure, true);
    v.setUint16(12, jour, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, e.donnees.length, true);
    v.setUint32(22, e.donnees.length, true);
    v.setUint16(26, nom.length, true);
    l.set(nom, 30);
    const c = new Uint8Array(46 + nom.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint16(10, 0, true);
    w.setUint16(12, heure, true);
    w.setUint16(14, jour, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, e.donnees.length, true);
    w.setUint32(24, e.donnees.length, true);
    w.setUint16(28, nom.length, true);
    w.setUint32(42, decalage, true);
    c.set(nom, 46);
    locaux.push(l, e.donnees);
    centraux.push(c);
    decalage += l.length + e.donnees.length;
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

/** Entrées d'une archive (répertoire central) ; méthodes 0 et 8 seulement, CRC contrôlé. `null` = archive illisible. */
export function lireZip(d: Uint8Array): { readonly nom: string; readonly donnees: Uint8Array }[] | null {
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
  const sortie: { nom: string; donnees: Uint8Array }[] = [];
  for (let k = 0; k < nombre; k++) {
    if (p + 46 > d.length || v.getUint32(p, true) !== 0x02014b50) return null;
    const methode = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const taille = v.getUint32(p + 20, true);
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
    const donnees = methode === 0 ? brut : methode === 8 ? inflerSync(brut) : null;
    if (!donnees || crc32(donnees) !== crc) return null;
    sortie.push({ nom, donnees });
  }
  return sortie;
}
