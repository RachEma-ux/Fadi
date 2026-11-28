/**
 * Redressement d'une photo sur quatre points (cas 4 du catalogue des extensions, lot C4, étape 7c : D10-F23a-003).
 *
 * On pointe, sur la photo, les quatre coins d'un rectangle de dimensions connues (bas gauche, bas droit, haut droit,
 * haut gauche) et l'on saisit sa largeur et sa hauteur (m). L'homographie qui envoie ces quatre pixels sur le rectangle
 * redresse la photo : chaque pixel va en coordonnées de façade (s le long de la façade, t en hauteur, mètres). Des points
 * de contrôle (pixel ↔ position saisie) donnent chacun un résidu et l'écart quadratique moyen ; une alerte de façade non
 * plane est levée quand cet écart dépasse 1/500 de la diagonale du rectangle (seuil retenu comme hypothèse du
 * catalogue, à confirmer). Sans point de contrôle, les résidus sont « non évalués ».
 *
 * L'image redressée devient un fond vertical (`Fond.vertical`) : sa pose envoie un pixel en (s, t) ; le plan vertical
 * part d'une origine (x, y) du dessin selon un azimut, t comptant depuis l'altitude du fond. Pur : ni DOM, ni React.
 */
import type { PixelFond, PositionPlan } from "./fonds.js";

/**
 * Homographie 3 × 3 rangée par lignes. Son échelle est choisie pour que le dénominateur soit positif sur le quadrilatère
 * pointé (et donc du côté de la ligne de fuite où se trouve la façade) : h[8] n'est pas forcément 1.
 */
export type Homographie = readonly [number, number, number, number, number, number, number, number, number];

const fini = (v: number) => Number.isFinite(v);

/** Résout A·x = b (n × n) par Gauss avec pivot partiel ; null si singulier. */
function resoudre(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((l, i) => [...l, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let l = c + 1; l < n; l++) if (Math.abs(m[l]![c]!) > Math.abs(m[p]![c]!)) p = l;
    if (Math.abs(m[p]![c]!) < 1e-12) return null;
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let l = 0; l < n; l++) {
      if (l === c) continue;
      const k = m[l]![c]! / m[c]![c]!;
      for (let j = c; j <= n; j++) m[l]![j]! -= k * m[c]![j]!;
    }
  }
  return m.map((l, i) => l[n]! / l[i]!);
}

/**
 * Homographie envoyant exactement quatre pixels sur quatre positions ; null si trois points sont alignés (sur la photo ou
 * sur le rectangle) ou si le quadrilatère pointé se croise.
 */
export function homographie(src: readonly PixelFond[], dst: readonly PositionPlan[]): Homographie | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  if (!convexe(src.map((p) => [p.u, p.v])) || !convexe(dst.map((p) => [p.x, p.y]))) return null;
  // Les pixels sont recentrés sur leur centre de gravité : le dénominateur y vaut 1, du bon côté de la ligne de fuite
  // quelle que soit la position de l'origine de la photo (qui peut se trouver au-delà).
  const cu = src.reduce((s, p) => s + p.u, 0) / 4;
  const cv = src.reduce((s, p) => s + p.v, 0) / 4;
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const u = src[i]!.u - cu, v = src[i]!.v - cv;
    const { x, y } = dst[i]!;
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const k = resoudre(a, b);
  if (!k || !k.every(fini)) return null;
  // H = K · T, T translatant de (−cu, −cv).
  const ligne = (p: number, q: number, r: number) => [p, q, r - p * cu - q * cv] as const;
  const [h0, h1, h2] = ligne(k[0]!, k[1]!, k[2]!);
  const [h3, h4, h5] = ligne(k[3]!, k[4]!, k[5]!);
  const [h6, h7, h8] = ligne(k[6]!, k[7]!, 1);
  const h: Homographie = [h0, h1, h2, h3, h4, h5, h6, h7, h8];
  // Les quatre coins doivent être du même côté de la ligne de fuite que leur centre.
  if (!src.every((p) => h6 * p.u + h7 * p.v + h8 > 0)) return null;
  return h;
}

/** Quadrilatère convexe non dégénéré (les quatre produits vectoriels de même signe). */
function convexe(q: readonly (readonly [number, number])[]): boolean {
  let signe = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i]!;
    const [bx, by] = q[(i + 1) % 4]!;
    const [cx, cy] = q[(i + 2) % 4]!;
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(z) < 1e-9) return false;
    const s = Math.sign(z);
    if (signe !== 0 && s !== signe) return false;
    signe = s;
  }
  return true;
}

/** Image d'un point ; null s'il tombe au-delà de la ligne de fuite (dénominateur nul ou de signe opposé). */
export function appliquerHomographie(h: Homographie, u: number, v: number): PositionPlan | null {
  const w = h[6] * u + h[7] * v + h[8];
  if (!(w > 1e-12)) return null;
  return { x: (h[0] * u + h[1] * v + h[2]) / w, y: (h[3] * u + h[4] * v + h[5]) / w };
}

/**
 * Inverse d'une homographie : adjointe divisée par le déterminant, sans autre renormalisation, de sorte que l'image d'un
 * point de dénominateur positif revienne avec un dénominateur positif ; null si singulière.
 */
export function inverserHomographie(h: Homographie): Homographie | null {
  const [a, b, c, d, e, f, g, k, l] = h;
  const A = e * l - f * k, B = -(d * l - f * g), C = d * k - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  const r = [A, -(b * l - c * k), b * f - c * e, B, a * l - c * g, -(a * f - c * d), C, -(a * k - b * g), a * e - b * d].map((x) => x / det);
  return r.every(fini) ? (r as unknown as Homographie) : null;
}

/** Rectangle de référence : bas gauche (0, 0), bas droit (L, 0), haut droit (L, H), haut gauche (0, H). */
export const rectangleReference = (largeur: number, hauteur: number): PositionPlan[] => [{ x: 0, y: 0 }, { x: largeur, y: 0 }, { x: largeur, y: hauteur }, { x: 0, y: hauteur }];

export interface ControleRedressement {
  readonly pixel: PixelFond;
  /** Position saisie sur la façade (s, t), mètres. */
  readonly cible: PositionPlan;
}
export interface ResidusRedressement {
  /** Distance (m) entre l'image du pixel et la position saisie, dans l'ordre des contrôles ; null = point au-delà de la ligne de fuite. */
  readonly points: readonly (number | null)[];
  /** Écart quadratique moyen ; null sans contrôle évaluable (« non évalué »). */
  readonly moyen: number | null;
  /** Seuil d'alerte : 1/500 de la diagonale du rectangle. */
  readonly seuil: number;
  readonly nonPlane: boolean;
}

export const SEUIL_NON_PLANE = 1 / 500;

export function residusRedressement(h: Homographie, controles: readonly ControleRedressement[], largeur: number, hauteur: number): ResidusRedressement {
  const points = controles.map((c) => {
    const q = appliquerHomographie(h, c.pixel.u, c.pixel.v);
    return q ? Math.hypot(q.x - c.cible.x, q.y - c.cible.y) : null;
  });
  const valides = points.filter((d): d is number => d !== null);
  const moyen = valides.length > 0 ? Math.sqrt(valides.reduce((s, d) => s + d * d, 0) / valides.length) : null;
  const seuil = Math.hypot(largeur, hauteur) * SEUIL_NON_PLANE;
  return { points, moyen, seuil, nonPlane: (moyen !== null && moyen > seuil) || points.some((d) => d === null) };
}

export interface CadreRedresse {
  /** Coin bas gauche et haut droit du cadre, en coordonnées de façade (m). */
  readonly sMin: number;
  readonly tMin: number;
  readonly sMax: number;
  readonly tMax: number;
  /** Mètres par pixel de l'image redressée. */
  readonly echelle: number;
  readonly largeurPx: number;
  readonly hauteurPx: number;
}

/**
 * Cadre de l'image redressée : l'emprise de la photo redressée, bornée à une marge de la moitié du rectangle de chaque
 * côté (une photo prise de biais s'étire vers l'infini près de sa ligne de fuite) ; côté le plus long `cote` px au plus.
 */
export function cadreRedresse(h: Homographie, largeurPx: number, hauteurPx: number, largeur: number, hauteur: number, cote = 2048): CadreRedresse {
  const bornes = { sMin: -largeur / 2, tMin: -hauteur / 2, sMax: largeur * 1.5, tMax: hauteur * 1.5 };
  const coins = [appliquerHomographie(h, 0, 0), appliquerHomographie(h, largeurPx, 0), appliquerHomographie(h, largeurPx, hauteurPx), appliquerHomographie(h, 0, hauteurPx)];
  let { sMin, tMin, sMax, tMax } = coins.every((c) => c !== null)
    ? { sMin: Math.min(...coins.map((c) => c!.x)), tMin: Math.min(...coins.map((c) => c!.y)), sMax: Math.max(...coins.map((c) => c!.x)), tMax: Math.max(...coins.map((c) => c!.y)) }
    : bornes;
  sMin = Math.max(sMin, bornes.sMin);
  tMin = Math.max(tMin, bornes.tMin);
  sMax = Math.min(sMax, bornes.sMax);
  tMax = Math.min(tMax, bornes.tMax);
  const echelle = Math.max(sMax - sMin, tMax - tMin) / cote;
  return { sMin, tMin, sMax, tMax, echelle, largeurPx: Math.max(1, Math.round((sMax - sMin) / echelle)), hauteurPx: Math.max(1, Math.round((tMax - tMin) / echelle)) };
}

/**
 * Rééchantillonne la photo (RGBA, `largeur` × `hauteur`) dans le cadre redressé, en interpolation bilinéaire ; les
 * pixels hors de la photo restent transparents.
 */
export function redresserPixels(src: Uint8ClampedArray, largeur: number, hauteur: number, h: Homographie, cadre: CadreRedresse): Uint8ClampedArray | null {
  const inv = inverserHomographie(h);
  if (!inv) return null;
  const out = new Uint8ClampedArray(cadre.largeurPx * cadre.hauteurPx * 4);
  for (let j = 0; j < cadre.hauteurPx; j++) {
    const t = cadre.tMax - (j + 0.5) * cadre.echelle;
    for (let i = 0; i < cadre.largeurPx; i++) {
      const s = cadre.sMin + (i + 0.5) * cadre.echelle;
      const p = appliquerHomographie(inv, s, t);
      if (!p) continue;
      const x = p.x - 0.5, y = p.y - 0.5;
      if (x < -0.5 || y < -0.5 || x > largeur - 0.5 || y > hauteur - 0.5) continue;
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(largeur - 1, x0 + 1), y1 = Math.min(hauteur - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
      const o = (j * cadre.largeurPx + i) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * largeur + x0) * 4 + c]!, b = src[(y0 * largeur + x1) * 4 + c]!;
        const d = src[(y1 * largeur + x0) * 4 + c]!, e = src[(y1 * largeur + x1) * 4 + c]!;
        out[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
    }
  }
  return out;
}
