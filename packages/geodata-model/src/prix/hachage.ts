/**
 * Hachage pur pour la reproductibilité des instantanés de prix (PRX12) : SHA-256 (FIPS 180-4) écrit en TypeScript, sans
 * `node:crypto` ni `crypto.subtle`, pour donner la même empreinte, de façon synchrone, au serveur et au navigateur.
 * Le texte est encodé en UTF-8 par ce module (pas de `TextEncoder`, absent des types ES2022 du paquet).
 *
 * `jsonCanonique` produit une sérialisation stable (clés triées par point de code, `undefined` omis) : deux objets
 * égaux en contenu ont la même chaîne, donc la même empreinte, quel que soit l'ordre d'insertion des clés.
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** Encodage UTF-8 d'une chaîne JavaScript (paires de substitution comprises ; substitut isolé → U+FFFD). */
export function encoderUtf8(texte: string): Uint8Array {
  const octets: number[] = [];
  for (let i = 0; i < texte.length; i++) {
    let c = texte.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < texte.length) {
      const d = texte.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) octets.push(c);
    else if (c < 0x800) octets.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) octets.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else octets.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(octets);
}

/** Empreinte SHA-256 en hexadécimal minuscule d'une chaîne (encodée en UTF-8) ou d'octets. */
export function sha256Hex(entree: string | Uint8Array): string {
  const donnees = typeof entree === "string" ? encoderUtf8(entree) : entree;
  const longueurBits = donnees.length * 8;
  const total = Math.ceil((donnees.length + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(donnees);
  m[donnees.length] = 0x80;
  // Longueur en bits sur 64 bits gros-boutiste (les 32 bits hauts couvrent les messages > 512 Mo).
  const haut = Math.floor(longueurBits / 0x100000000), bas = longueurBits >>> 0;
  for (let i = 0; i < 4; i++) {
    m[total - 8 + i] = (haut >>> (24 - 8 * i)) & 0xff;
    m[total - 4 + i] = (bas >>> (24 - 8 * i)) & 0xff;
  }
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const rotd = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let bloc = 0; bloc < total; bloc += 64) {
    for (let t = 0; t < 16; t++) {
      const j = bloc + 4 * t;
      w[t] = ((m[j]! << 24) | (m[j + 1]! << 16) | (m[j + 2]! << 8) | m[j + 3]!) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15]!, y = w[t - 2]!;
      const s0 = rotd(x, 7) ^ rotd(x, 18) ^ (x >>> 3);
      const s1 = rotd(y, 17) ^ rotd(y, 19) ^ (y >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let t = 0; t < 64; t++) {
      const S1 = rotd(e, 6) ^ rotd(e, 11) ^ rotd(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotd(a, 2) ^ rotd(a, 13) ^ rotd(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/**
 * Sérialisation JSON canonique : clés d'objet triées (ordre des points de code), `undefined` omis dans les objets,
 * nombres non finis refusés (une valeur absente s'écrit `null`, jamais `NaN` ni 0).
 */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null) return "null";
  switch (typeof valeur) {
    case "number":
      if (!Number.isFinite(valeur)) throw new RangeError("nombre non fini dans un manifeste");
      return JSON.stringify(valeur);
    case "string": case "boolean": return JSON.stringify(valeur);
    case "object": {
      if (Array.isArray(valeur)) return `[${valeur.map((v) => (v === undefined ? "null" : jsonCanonique(v))).join(",")}]`;
      const o = valeur as Record<string, unknown>;
      const cles = Object.keys(o).filter((k) => o[k] !== undefined).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      return `{${cles.map((k) => `${JSON.stringify(k)}:${jsonCanonique(o[k])}`).join(",")}}`;
    }
    default: throw new TypeError(`valeur non sérialisable : ${typeof valeur}`);
  }
}

/** Empreinte SHA-256 du JSON canonique d'une valeur. */
export const empreinteCanonique = (valeur: unknown): string => sha256Hex(jsonCanonique(valeur));
