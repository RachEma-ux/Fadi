/**
 * Décompression « deflate » (RFC 1951), avec ou sans en-tête zlib (RFC 1950), synchrone et pure : flux FlateDecode d'un
 * PDF reçu (lot C4, étape 4). Écrite pour Fadi (aucune bibliothèque) ; l'adler-32 de fin n'est pas vérifié.
 */

/** Tables de Huffman canoniques : nombre de codes par longueur, symboles triés. */
interface Arbre {
  readonly comptes: Uint16Array;
  readonly symboles: Uint16Array;
}

function arbre(longueurs: Uint8Array, debut: number, n: number): Arbre {
  const comptes = new Uint16Array(16);
  const symboles = new Uint16Array(n);
  for (let i = 0; i < n; i++) comptes[longueurs[debut + i]!]!++;
  comptes[0] = 0;
  const decalages = new Uint16Array(16);
  for (let i = 1; i < 16; i++) decalages[i] = decalages[i - 1]! + comptes[i - 1]!;
  for (let i = 0; i < n; i++) {
    const l = longueurs[debut + i]!;
    if (l) symboles[decalages[l]!++] = i;
  }
  return { comptes, symboles };
}

const BASE_LONGUEUR = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const EXTRA_LONGUEUR = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const BASE_DISTANCE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const EXTRA_DISTANCE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDRE_LONGUEURS = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const FIXES = (() => {
  const l = new Uint8Array(288 + 30);
  for (let i = 0; i < 144; i++) l[i] = 8;
  for (let i = 144; i < 256; i++) l[i] = 9;
  for (let i = 256; i < 280; i++) l[i] = 7;
  for (let i = 280; i < 288; i++) l[i] = 8;
  for (let i = 288; i < 318; i++) l[i] = 5;
  return { lit: arbre(l, 0, 288), dist: arbre(l, 288, 30) };
})();

class Sortie {
  o = new Uint8Array(1 << 16);
  n = 0;
  octet(b: number): void {
    if (this.n === this.o.length) this.agrandir(1);
    this.o[this.n++] = b;
  }
  agrandir(k: number): void {
    let t = this.o.length * 2;
    while (t < this.n + k) t *= 2;
    const o = new Uint8Array(t);
    o.set(this.o.subarray(0, this.n));
    this.o = o;
  }
}

/** Décompresse ; `null` si le flux est malformé (ou dépasse `max` octets). */
export function inflerSync(entree: Uint8Array, max = 512 * 1024 * 1024): Uint8Array | null {
  let i = 0;
  // En-tête zlib : CMF (méthode 8) et FLG, multiple de 31 ; sans dictionnaire.
  if (entree.length >= 2 && (entree[0]! & 0x0f) === 8 && ((entree[0]! << 8) | entree[1]!) % 31 === 0 && !(entree[1]! & 0x20)) i = 2;
  let bits = 0;
  let nb = 0;
  const lire = (n: number): number => {
    while (nb < n) {
      if (i >= entree.length) throw new RangeError("fin");
      bits |= entree[i++]! << nb;
      nb += 8;
    }
    const v = bits & ((1 << n) - 1);
    bits >>>= n;
    nb -= n;
    return v;
  };
  const decoder = (a: Arbre): number => {
    let code = 0;
    let premier = 0;
    let index = 0;
    for (let l = 1; l < 16; l++) {
      code |= lire(1);
      const c = a.comptes[l]!;
      if (code - c < premier) return a.symboles[index + (code - premier)]!;
      index += c;
      premier = (premier + c) << 1;
      code <<= 1;
    }
    throw new RangeError("code");
  };
  const s = new Sortie();
  try {
    for (;;) {
      const fin = lire(1);
      const type = lire(2);
      if (type === 0) {
        bits = 0;
        nb = 0;
        if (i + 4 > entree.length) return null;
        const len = entree[i]! | (entree[i + 1]! << 8);
        const nlen = entree[i + 2]! | (entree[i + 3]! << 8);
        if ((len ^ 0xffff) !== nlen) return null;
        i += 4;
        if (i + len > entree.length) return null;
        if (s.n + len > s.o.length) s.agrandir(len);
        s.o.set(entree.subarray(i, i + len), s.n);
        s.n += len;
        i += len;
      } else if (type === 1 || type === 2) {
        let lit = FIXES.lit;
        let dist = FIXES.dist;
        if (type === 2) {
          const hlit = lire(5) + 257;
          const hdist = lire(5) + 1;
          const hclen = lire(4) + 4;
          const lc = new Uint8Array(19);
          for (let k = 0; k < hclen; k++) lc[ORDRE_LONGUEURS[k]!] = lire(3);
          const ac = arbre(lc, 0, 19);
          const l = new Uint8Array(hlit + hdist);
          for (let k = 0; k < hlit + hdist; ) {
            const sym = decoder(ac);
            if (sym < 16) l[k++] = sym;
            else {
              let rep = 0;
              let val = 0;
              if (sym === 16) {
                if (k === 0) return null;
                val = l[k - 1]!;
                rep = 3 + lire(2);
              } else if (sym === 17) rep = 3 + lire(3);
              else rep = 11 + lire(7);
              if (k + rep > hlit + hdist) return null;
              while (rep--) l[k++] = val;
            }
          }
          lit = arbre(l, 0, hlit);
          dist = arbre(l, hlit, hdist);
        }
        for (;;) {
          const sym = decoder(lit);
          if (sym === 256) break;
          if (sym < 256) {
            s.octet(sym);
            continue;
          }
          const k = sym - 257;
          if (k >= 29) return null;
          const longueur = BASE_LONGUEUR[k]! + lire(EXTRA_LONGUEUR[k]!);
          const d = decoder(dist);
          if (d >= 30) return null;
          const distance = BASE_DISTANCE[d]! + lire(EXTRA_DISTANCE[d]!);
          if (distance > s.n) return null;
          if (s.n + longueur > s.o.length) s.agrandir(longueur);
          const depart = s.n - distance;
          for (let j = 0; j < longueur; j++) s.o[s.n + j] = s.o[depart + j]!;
          s.n += longueur;
        }
      } else return null;
      if (s.n > max) return null;
      if (fin) break;
    }
  } catch {
    // Flux tronqué : ce qui a été décodé est rendu s'il y a quelque chose (fréquent dans les PDF), sinon rien.
    return s.n > 0 ? s.o.slice(0, s.n) : null;
  }
  return s.o.slice(0, s.n);
}
