/**
 * Couches raster (D-GD-13) : une grille de valeurs (relief, climat, sols, imagerie dérivée) en WGS 84, rendue en tuiles
 * d'image par le serveur. Ce module pur décrit la grille et sa symbologie : palette continue entre deux bornes déclarées
 * ou classes discrètes (occupation du sol), et le calcul de la couleur d'un pixel. Une cellule sans valeur (« nodata »)
 * reste transparente : elle n'est jamais confondue avec zéro.
 */

/** Palettes continues (de la valeur basse à la valeur haute), couleurs à intervalles réguliers. */
export const PALETTES_RASTER = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  relief: ["#2c7bb6", "#abd9e9", "#ffffbf", "#d7a65c", "#8c510a", "#ffffff"],
  precipitations: ["#ffffcc", "#a1dab4", "#41b6c4", "#2c7fb8", "#253494"],
  temperature: ["#313695", "#74add1", "#ffffbf", "#f46d43", "#a50026"],
  vegetation: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  sols: ["#fff7ec", "#fdd49e", "#fc8d59", "#d7301f", "#7f0000"],
  population: ["#fff5eb", "#fdd0a2", "#fd8d3c", "#d94801", "#7f2704"],
  energie: ["#ffffd4", "#fed98e", "#fe9929", "#d95f0e", "#993404"],
  eau: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  gris: ["#000000", "#ffffff"],
} as const;
export type PaletteRaster = keyof typeof PALETTES_RASTER;

export interface ClasseRaster { readonly valeur: number; readonly libelle: string; readonly couleur: string }

/** Description d'une couche raster, déclarée par la fiche et complétée à l'import (bornes, emprise, taille). */
export interface DescriptionRaster {
  /** Unité des valeurs (« m », « mm/an », « % »…), ou null pour des classes. */
  readonly unite: string | null;
  /** Ce que représente un pixel (texte de la fiche). */
  readonly grandeur: string;
  readonly palette: PaletteRaster;
  /** Bornes de la palette (valeurs au-delà : couleur de l'extrémité). */
  readonly min: number;
  readonly max: number;
  /** Classes discrètes : la palette continue est alors ignorée. */
  readonly classes: readonly ClasseRaster[] | null;
  /** Taille de la grille et emprise (degrés WGS 84). */
  readonly largeur: number;
  readonly hauteur: number;
  readonly emprise: readonly [number, number, number, number];
}

export const MAX_PIXELS_RASTER = 4_000_000;

const COULEUR = /^#[0-9a-fA-F]{6}$/;
const rgb = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** Couleur RGBA d'une valeur ; `null` (nodata, NaN) → transparent. */
export function couleurPixel(v: number | null, d: Pick<DescriptionRaster, "palette" | "min" | "max" | "classes">): [number, number, number, number] {
  if (v === null || !Number.isFinite(v)) return [0, 0, 0, 0];
  if (d.classes) {
    const c = d.classes.find((k) => k.valeur === v);
    return c ? [...rgb(c.couleur), 255] : [0, 0, 0, 0];
  }
  const p = PALETTES_RASTER[d.palette] ?? PALETTES_RASTER.viridis;
  const t = d.max > d.min ? Math.min(1, Math.max(0, (v - d.min) / (d.max - d.min))) : 0.5;
  const pos = t * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = rgb(p[i]!);
  const b = rgb(p[i + 1]!);
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), 255];
}

/** Dégradé CSS de la légende d'une palette continue. */
export const degradeCss = (palette: PaletteRaster): string => `linear-gradient(to right, ${(PALETTES_RASTER[palette] ?? PALETTES_RASTER.viridis).join(", ")})`;

export type ValidationRaster = { readonly ok: true } | { readonly ok: false; readonly erreurs: readonly string[] };

/** Contrôle de la déclaration raster d'une fiche (avant lecture du fichier). */
export function validerDeclarationRaster(x: unknown): ValidationRaster {
  const erreurs: string[] = [];
  if (!x || typeof x !== "object") return { ok: false, erreurs: ["raster : objet attendu"] };
  const r = x as Record<string, unknown>;
  if (r["unite"] !== null && typeof r["unite"] !== "string") erreurs.push("raster.unite : texte ou null");
  if (typeof r["grandeur"] !== "string" || !r["grandeur"]) erreurs.push("raster.grandeur : texte attendu");
  if (typeof r["palette"] !== "string" || !(r["palette"] in PALETTES_RASTER)) erreurs.push(`raster.palette : ${Object.keys(PALETTES_RASTER).join(", ")}`);
  for (const b of ["min", "max"]) if (r[b] !== undefined && (typeof r[b] !== "number" || !Number.isFinite(r[b]))) erreurs.push(`raster.${b} : nombre`);
  if (r["classes"] !== undefined && r["classes"] !== null) {
    const cs = r["classes"];
    if (!Array.isArray(cs) || !cs.length || cs.length > 64 || !cs.every((c) => c && typeof c === "object" && Number.isFinite((c as ClasseRaster).valeur) && typeof (c as ClasseRaster).libelle === "string" && COULEUR.test(String((c as ClasseRaster).couleur)))) {
      erreurs.push("raster.classes : 1 à 64 classes { valeur, libelle, couleur #rrggbb }");
    }
  }
  return erreurs.length ? { ok: false, erreurs } : { ok: true };
}

/** Bornes robustes d'une palette : 2ᵉ et 98ᵉ centiles des valeurs présentes (les extrêmes isolés n'écrasent pas le dégradé). */
export function bornesRobustes(valeurs: ArrayLike<number>, nodata: number | null): { min: number; max: number } | null {
  const xs: number[] = [];
  const pas = Math.max(1, Math.floor(valeurs.length / 200_000));
  for (let i = 0; i < valeurs.length; i += pas) {
    const v = valeurs[i]!;
    if (Number.isFinite(v) && v !== nodata) xs.push(v);
  }
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))]!;
  const min = q(0.02);
  const max = q(0.98);
  return max > min ? { min, max } : { min: xs[0]!, max: xs[xs.length - 1]! };
}
