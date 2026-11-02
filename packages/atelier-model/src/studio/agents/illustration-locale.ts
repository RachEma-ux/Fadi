import { fail, record } from "../noyau/validation.js";

/**
 * Fournisseur d'illustration **local et déterministe**, livré par défaut (lot F, décision P-12) : il dérive une image
 * d'illustration (trait, lavis ou sépia) des seuls pixels du rendu du modèle de la vue. Ce n'est **pas** une IA et il
 * n'est jamais présenté comme telle : aucun réseau, aucune donnée envoyée, aucun coût, même entrée → mêmes pixels.
 * L'image produite n'ajoute aucune géométrie et ne relit pas le document : le modèle ne peut pas en être modifié.
 * Pur : opère sur un tableau RGBA, ni DOM, ni canevas, ni horloge.
 */

export const STUDIO_FOURNISSEUR_LOCAL = Object.freeze({
  id: "local-derive",
  nom: "Illustration dérivée du rendu (locale, sans IA)",
  nature: "local-deterministe" as const,
  version: "studio-illustration-locale/1",
  reseau: false,
});

export const STUDIO_STYLES_ILLUSTRATION = Object.freeze(["trait", "lavis", "sepia"] as const);
export type StudioStyleIllustration = (typeof STUDIO_STYLES_ILLUSTRATION)[number];

export interface StudioParametresIllustration {
  style: StudioStyleIllustration;
  /** Intensité de l'effet, de 0 à 1, au centième. */
  intensite: number;
}

/** Image RGBA 8 bits, rangée ligne par ligne. */
export interface StudioImageRgba { largeur: number; hauteur: number; rgba: Uint8Array }

/** Bornes techniques : 4 096 × 4 096 pixels au plus. */
export const STUDIO_ILLUSTRATION_COTE_MAX = 4096;

export function studioValiderParametresIllustration(value: unknown, path = "parametres"): StudioParametresIllustration {
  const o = record(value, ["style", "intensite"], path);
  if (!(STUDIO_STYLES_ILLUSTRATION as readonly unknown[]).includes(o["style"])) fail(`${path}.style`, "style attendu : trait, lavis ou sepia");
  const i = o["intensite"];
  if (typeof i !== "number" || !Number.isFinite(i) || i < 0 || i > 1 || Math.round(i * 100) !== i * 100) fail(`${path}.intensite`, "nombre de 0 à 1, au centième, attendu");
  return { style: o["style"] as StudioStyleIllustration, intensite: i };
}

export function studioValiderImage(img: StudioImageRgba): void {
  const { largeur, hauteur, rgba } = img;
  if (!Number.isInteger(largeur) || !Number.isInteger(hauteur) || largeur < 1 || hauteur < 1 || largeur > STUDIO_ILLUSTRATION_COTE_MAX || hauteur > STUDIO_ILLUSTRATION_COTE_MAX) fail("image", "dimensions de 1 à 4096 pixels attendues");
  if (!(rgba instanceof Uint8Array) || rgba.length !== largeur * hauteur * 4) fail("image.rgba", "pixels RGBA attendus");
}

const borne = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
/** Luminance entière (Rec. 601), sur fond de papier blanc pour la transparence. */
function gris(rgba: Uint8Array, k: number): number {
  const a = rgba[k + 3]! / 255;
  const r = rgba[k]! * a + 255 * (1 - a), g = rgba[k + 1]! * a + 255 * (1 - a), b = rgba[k + 2]! * a + 255 * (1 - a);
  return (299 * r + 587 * g + 114 * b) / 1000;
}

/** Illustration dérivée : nouvelle image (la source n'est pas touchée), alpha opaque. */
export function studioIllustrationLocale(img: StudioImageRgba, p: StudioParametresIllustration): StudioImageRgba {
  studioValiderImage(img);
  const { largeur: w, hauteur: h, rgba } = img;
  const out = new Uint8Array(w * h * 4);
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = gris(rgba, i * 4);
  const papier = [250, 246, 236];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, k = i * 4;
      let r: number, g: number, b: number;
      if (p.style === "trait") {
        // Contours (Sobel) en traits sombres sur papier ; l'intensité règle le seuil.
        const L = (dx: number, dy: number) => lum[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))]!;
        const gx = -L(-1, -1) - 2 * L(-1, 0) - L(-1, 1) + L(1, -1) + 2 * L(1, 0) + L(1, 1);
        const gy = -L(-1, -1) - 2 * L(0, -1) - L(1, -1) + L(-1, 1) + 2 * L(0, 1) + L(1, 1);
        const force = Math.min(1, Math.sqrt(gx * gx + gy * gy) / (400 - 300 * p.intensite));
        const ton = 0.15 * (1 - lum[i]! / 255);
        const encre = Math.min(1, force + ton);
        r = papier[0]! * (1 - encre) + 40 * encre; g = papier[1]! * (1 - encre) + 38 * encre; b = papier[2]! * (1 - encre) + 46 * encre;
      } else if (p.style === "lavis") {
        // Lavis : niveaux de gris en aplats (3 à 8), teintés vers le papier.
        const niveaux = 3 + Math.round(5 * (1 - p.intensite));
        const q = Math.round((lum[i]! / 255) * (niveaux - 1)) / (niveaux - 1);
        r = 60 + (papier[0]! - 60) * q; g = 72 + (papier[1]! - 72) * q; b = 96 + (papier[2]! - 96) * q;
      } else {
        // Sépia, mélangé à l'image d'origine selon l'intensité.
        const a = rgba[k + 3]! / 255;
        const r0 = rgba[k]! * a + 255 * (1 - a), g0 = rgba[k + 1]! * a + 255 * (1 - a), b0 = rgba[k + 2]! * a + 255 * (1 - a);
        const sr = 0.393 * r0 + 0.769 * g0 + 0.189 * b0, sg = 0.349 * r0 + 0.686 * g0 + 0.168 * b0, sb = 0.272 * r0 + 0.534 * g0 + 0.131 * b0;
        r = r0 + (sr - r0) * p.intensite; g = g0 + (sg - g0) * p.intensite; b = b0 + (sb - b0) * p.intensite;
      }
      out[k] = borne(r); out[k + 1] = borne(g); out[k + 2] = borne(b); out[k + 3] = 255;
    }
  }
  return { largeur: w, hauteur: h, rgba: out };
}
