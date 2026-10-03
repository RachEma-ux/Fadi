/**
 * Empreinte du modèle, algorithme `atelier-empreinte/1` (contrat `contrats/etat.ts`).
 *
 * Définition :
 * 1. contenu retenu : `objets` (triés par identifiant), `relations` (triées par leur forme canonique),
 *    `catalogue`, `proprietesProjet` (triées par leur forme canonique). La révision, l'identifiant de projet,
 *    la version d'ontologie, l'empreinte elle-même et la liste `supprimes` (traces d'identité) n'en font pas
 *    partie : l'empreinte décrit le contenu, indépendamment de l'ordre d'insertion ;
 * 2. sérialisation canonique : JSON, clés d'objet triées (ordre des unités de code UTF-16), champs `undefined`
 *    omis, nombres écrits par `JSON.stringify` (plus courte écriture exacte, aucun arrondi), tableaux dans leur
 *    ordre (l'ordre des sommets ou des propriétés d'un objet est une donnée) ;
 * 3. condensat SHA-256 (FIPS 180-4) des octets UTF-8, écrit `sha256-<64 chiffres hexadécimaux>`.
 *
 * Pur : aucune API Node ni navigateur (R6) ; SHA-256 et UTF-8 implémentés ici.
 */
import type { EtatModele } from "../contrats/etat.js";
import { ALGORITHME_EMPREINTE } from "../contrats/etat.js";

/** Erreur levée quand une valeur n'est pas sérialisable de façon canonique (nombre non fini, fonction…). */
export class ErreurEmpreinte extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurEmpreinte";
  }
}

/** Sérialisation JSON canonique (clés triées, `undefined` omis). */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null) return "null";
  switch (typeof valeur) {
    case "boolean":
      return valeur ? "true" : "false";
    case "number":
      if (!Number.isFinite(valeur)) throw new ErreurEmpreinte(`nombre non fini : ${String(valeur)}`);
      return JSON.stringify(valeur);
    case "string":
      return JSON.stringify(valeur);
    case "object": {
      if (Array.isArray(valeur)) return `[${valeur.map((v) => (v === undefined ? "null" : jsonCanonique(v))).join(",")}]`;
      const o = valeur as Record<string, unknown>;
      const cles = Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort();
      return `{${cles.map((k) => `${JSON.stringify(k)}:${jsonCanonique(o[k])}`).join(",")}}`;
    }
    default:
      throw new ErreurEmpreinte(`valeur non sérialisable (${typeof valeur})`);
  }
}

function utf8(texte: string): Uint8Array {
  const octets: number[] = [];
  for (let i = 0; i < texte.length; i++) {
    let c = texte.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < texte.length) {
      const d = texte.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) octets.push(c);
    else if (c < 0x800) octets.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) octets.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else octets.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(octets);
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 (FIPS 180-4) d'une suite d'octets, en hexadécimal. */
export function sha256Hex(message: Uint8Array): string {
  const longueurBits = message.length * 8;
  const total = Math.ceil((message.length + 9) / 64) * 64;
  const bloc = new Uint8Array(total);
  bloc.set(message);
  bloc[message.length] = 0x80;
  const vue = new DataView(bloc.buffer);
  vue.setUint32(total - 8, Math.floor(longueurBits / 0x100000000));
  vue.setUint32(total - 4, longueurBits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let debut = 0; debut < total; debut += 64) {
    for (let t = 0; t < 16; t++) w[t] = vue.getUint32(debut + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15] ?? 0;
      const y = w[t - 2] ?? 0;
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = ((w[t - 16] ?? 0) + s0 + (w[t - 7] ?? 0) + s1) >>> 0;
    }
    let a = h[0] ?? 0;
    let b = h[1] ?? 0;
    let c = h[2] ?? 0;
    let d = h[3] ?? 0;
    let e = h[4] ?? 0;
    let f = h[5] ?? 0;
    let g = h[6] ?? 0;
    let hh = h[7] ?? 0;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (K[t] ?? 0) + (w[t] ?? 0)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] ?? 0) + a) >>> 0;
    h[1] = ((h[1] ?? 0) + b) >>> 0;
    h[2] = ((h[2] ?? 0) + c) >>> 0;
    h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0;
    h[5] = ((h[5] ?? 0) + f) >>> 0;
    h[6] = ((h[6] ?? 0) + g) >>> 0;
    h[7] = ((h[7] ?? 0) + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}

/** Condensat `sha256-…` d'un texte (UTF-8). */
export function condensat(texte: string): string {
  return `sha256-${sha256Hex(utf8(texte))}`;
}

/** Empreinte d'une valeur quelconque (objet du modèle, catalogue…) : condensat de sa forme canonique. */
export function empreinteValeur(valeur: unknown): string {
  return condensat(jsonCanonique(valeur));
}

/** Contenu canonique du modèle retenu par `atelier-empreinte/1`. */
export function contenuCanonique(etat: Pick<EtatModele, "objets" | "relations" | "catalogue" | "proprietesProjet">): string {
  const objets = Object.keys(etat.objets)
    .sort()
    .map((id) => jsonCanonique(etat.objets[id]));
  const relations = etat.relations.map((r) => jsonCanonique(r)).sort();
  const proprietes = etat.proprietesProjet.map((p) => jsonCanonique(p)).sort();
  return `{"algorithme":${JSON.stringify(ALGORITHME_EMPREINTE)},"catalogue":${jsonCanonique(etat.catalogue)},"objets":[${objets.join(",")}],"proprietesProjet":[${proprietes.join(",")}],"relations":[${relations.join(",")}]}`;
}

/** Empreinte `atelier-empreinte/1` du modèle. */
export function calculerEmpreinte(etat: Pick<EtatModele, "objets" | "relations" | "catalogue" | "proprietesProjet">): string {
  return condensat(contenuCanonique(etat));
}
