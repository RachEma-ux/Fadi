/**
 * Police géométrique intégrée pour le Texte 3D (lot 5, décision P-7) : glyphes sur une grille de 5 × 7 cellules,
 * définis dans le code (aucun fichier de police, aucune licence tierce). Chaque glyphe devient un ou plusieurs
 * polygones (contour extérieur + trous) : l'union des cellules pleines, contour reconstitué sans sommet aligné.
 * Lettres accentuées ramenées à la lettre de base, minuscules en capitales. Un caractère inconnu est ignoré
 * (dit à l'appelant). Choix Fadi déclaré : « police géométrique Fadi », régulière, sans graisse ni style.
 */
import { type Vec3, v3 } from "./vecteur.js";

const G: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00010", "00100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "°": ["01100", "10010", "01100", "00000", "00000", "00000", "00000"],
  "&": ["01000", "10100", "10100", "01000", "10101", "10010", "01101"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
};

const ACCENTS: Readonly<Record<string, string>> = { À: "A", Â: "A", Ä: "A", Á: "A", Ã: "A", Å: "A", Ç: "C", É: "E", È: "E", Ê: "E", Ë: "E", Î: "I", Ï: "I", Í: "I", Ì: "I", Ô: "O", Ö: "O", Ó: "O", Ò: "O", Õ: "O", Ù: "U", Û: "U", Ü: "U", Ú: "U", Ÿ: "Y", Ñ: "N", Œ: "O", Æ: "A" };

export const COLONNES = 5;
export const LIGNES = 7;
/** Espace entre deux glyphes, en cellules. */
export const INTERLETTRE = 1;
/** Hauteur d'une interligne, en cellules. */
export const INTERLIGNE = 9;

/**
 * Deux cellules pleines qui ne se touchent que par un coin (« pince ») donneraient des faces qui se touchent en un
 * seul point et une extrusion qui n'est pas un solide : la cellule orthogonale voisine est remplie (forme un peu
 * plus carrée, déclarée). Idempotent.
 */
export function sansPinces(glyphe: readonly string[]): string[] {
  const g = glyphe.map((l) => l.split(""));
  const plein = (r: number, c: number): boolean => r >= 0 && r < LIGNES && c >= 0 && c < COLONNES && g[r]![c] === "1";
  let change = true;
  let garde = 0;
  while (change && garde++ < 50) {
    change = false;
    for (let r = 0; r + 1 < LIGNES; r++) {
      for (let c = 0; c < COLONNES; c++) {
        if (!plein(r, c)) continue;
        for (const dc of [-1, 1]) {
          if (!plein(r + 1, c + dc)) continue;
          if (plein(r + 1, c) || plein(r, c + dc)) continue;
          g[r + 1]![c] = "1";
          change = true;
        }
      }
    }
  }
  return g.map((l) => l.join(""));
}

const CACHE = new Map<string, readonly string[]>();

export function glypheDe(caractere: string): readonly string[] | null {
  const c = caractere.toUpperCase();
  const brut = G[c] ?? (ACCENTS[c] ? G[ACCENTS[c] as string] ?? null : null);
  if (!brut) return null;
  let g = CACHE.get(c);
  if (!g) {
    g = sansPinces(brut);
    CACHE.set(c, g);
  }
  return g;
}

type P = { x: number; y: number };

/** Contours (coordonnées en cellules) d'un glyphe : chaque polygone = [extérieur (anti-horaire), ...trous]. */
export function contoursDuGlyphe(glyphe: readonly string[]): P[][][] {
  const plein = (c: number, r: number): boolean => r >= 0 && r < LIGNES && c >= 0 && c < COLONNES && (glyphe[r] as string).charAt(c) === "1";
  // Arêtes orientées anti-horaire autour de chaque cellule pleine (y vers le haut : ligne 0 en haut).
  const aretes = new Map<string, [P, P]>();
  const cle = (a: P, b: P): string => `${a.x},${a.y}>${b.x},${b.y}`;
  const ajouter = (a: P, b: P): void => {
    const inverse = cle(b, a);
    if (aretes.has(inverse)) aretes.delete(inverse);
    else aretes.set(cle(a, b), [a, b]);
  };
  for (let r = 0; r < LIGNES; r++) {
    for (let c = 0; c < COLONNES; c++) {
      if (!plein(c, r)) continue;
      const x0 = c, x1 = c + 1, y0 = LIGNES - 1 - r, y1 = LIGNES - r;
      ajouter({ x: x0, y: y0 }, { x: x1, y: y0 });
      ajouter({ x: x1, y: y0 }, { x: x1, y: y1 });
      ajouter({ x: x1, y: y1 }, { x: x0, y: y1 });
      ajouter({ x: x0, y: y1 }, { x: x0, y: y0 });
    }
  }
  // Chaînage : aux sommets de degré 2 (deux arêtes sortantes, cas des coins en diagonale), on tourne à gauche de
  // préférence pour garder des contours simples.
  const sortantes = new Map<string, [P, P][]>();
  for (const e of aretes.values()) {
    const k = `${e[0].x},${e[0].y}`;
    const l = sortantes.get(k);
    if (l) l.push(e);
    else sortantes.set(k, [e]);
  }
  const boucles: P[][] = [];
  while (aretes.size) {
    const premiere = aretes.values().next().value as [P, P];
    const boucle: P[] = [premiere[0]];
    let courante = premiere;
    let garde = 0;
    while (garde++ < 1000) {
      aretes.delete(cle(courante[0], courante[1]));
      const l = (sortantes.get(`${courante[1].x},${courante[1].y}`) ?? []).filter((e) => aretes.has(cle(e[0], e[1])));
      if (courante[1].x === premiere[0].x && courante[1].y === premiere[0].y) break;
      boucle.push(courante[1]);
      if (l.length === 0) break;
      // Tourner à gauche en priorité (produit vectoriel positif), sinon tout droit, sinon à droite.
      const d = { x: courante[1].x - courante[0].x, y: courante[1].y - courante[0].y };
      l.sort((e1, e2) => {
        const v1 = { x: e1[1].x - e1[0].x, y: e1[1].y - e1[0].y };
        const v2 = { x: e2[1].x - e2[0].x, y: e2[1].y - e2[0].y };
        return d.x * v2.y - d.y * v2.x - (d.x * v1.y - d.y * v1.x);
      });
      courante = l[0] as [P, P];
    }
    if (boucle.length >= 3) boucles.push(simplifier(boucle));
  }
  // Extérieurs (aire > 0) et trous (aire < 0), rattachés à l'extérieur qui les contient.
  const aire = (b: P[]): number => b.reduce((s, p, i) => s + (p.x * (b[(i + 1) % b.length] as P).y - (b[(i + 1) % b.length] as P).x * p.y), 0) / 2;
  const dedans = (p: P, b: P[]): boolean => {
    let c = false;
    for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
      const a = b[i] as P, q = b[j] as P;
      if (a.y > p.y !== q.y > p.y && p.x < ((q.x - a.x) * (p.y - a.y)) / (q.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const exterieurs = boucles.filter((b) => aire(b) > 0).sort((a, b) => aire(a) - aire(b));
  const trous = boucles.filter((b) => aire(b) < 0);
  const r: P[][][] = exterieurs.map((e) => [e]);
  for (const t of trous) {
    const centre = { x: (t[0] as P).x + 0.5, y: (t[0] as P).y + 0.5 };
    // Le plus petit extérieur contenant un point intérieur du trou.
    const k = exterieurs.findIndex((e) => dedans(centre, e) || dedans(t[0] as P, e));
    if (k >= 0) (r[k] as P[][]).push(t);
  }
  return r;
}

function simplifier(b: P[]): P[] {
  const r: P[] = [];
  for (let i = 0; i < b.length; i++) {
    const prev = b[(i - 1 + b.length) % b.length] as P, cur = b[i] as P, next = b[(i + 1) % b.length] as P;
    if ((cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x) === 0) continue;
    r.push(cur);
  }
  return r;
}

export interface TexteGeometrique {
  /** Polygones (points monde) : [extérieur, ...trous], dans le plan z = 0, lettres de gauche à droite. */
  readonly polygones: readonly (readonly (readonly Vec3[])[])[];
  readonly largeur: number;
  readonly hauteur: number;
  readonly ignores: readonly string[];
}

/** Géométrie d'un texte (plusieurs lignes séparées par \n), hauteur de capitale `hauteur` (m), au sol, origine en bas à gauche. */
export function geometrieDuTexte(texte: string, hauteur: number): TexteGeometrique {
  const s = hauteur / LIGNES;
  const lignes = texte.split(/\r?\n/);
  const polygones: Vec3[][][] = [];
  const ignores: string[] = [];
  let largeur = 0;
  lignes.forEach((ligne, li) => {
    let x = 0;
    const y0 = -(li * INTERLIGNE) * s;
    for (const ch of ligne) {
      if (ch === " ") {
        x += (COLONNES - 1) * s;
        continue;
      }
      const g = glypheDe(ch);
      if (!g) {
        ignores.push(ch);
        continue;
      }
      for (const poly of contoursDuGlyphe(g)) polygones.push(poly.map((b) => b.map((p) => v3(x + p.x * s, y0 + p.y * s, 0))));
      x += (COLONNES + INTERLETTRE) * s;
    }
    largeur = Math.max(largeur, Math.max(0, x - INTERLETTRE * s));
  });
  return { polygones, largeur, hauteur: hauteur + (lignes.length - 1) * INTERLIGNE * s, ignores };
}
