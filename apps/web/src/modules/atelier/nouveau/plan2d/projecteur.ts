/**
 * Projection repère local (mètres, y vers le nord / le haut) ↔ écran (pixels, y vers le bas). L'origine de la
 * vue est locale à la zone visible (Architecture V4 §5.3) : rien n'est modifié dans le modèle en se déplaçant.
 */
import { pt, type Point2 } from "@parcours/atelier-model";
import type { Vue2D } from "../etat-ui";

export interface Projecteur {
  vers(p: { x: number; y: number }): { x: number; y: number };
  depuis(sx: number, sy: number): Point2;
  echelle: number;
  largeur: number;
  hauteur: number;
}

export function projecteur(vue: Vue2D, largeur: number, hauteur: number): Projecteur {
  const e = vue.echelle;
  return {
    echelle: e,
    largeur,
    hauteur,
    vers: (p) => ({ x: (p.x - vue.cx) * e + largeur / 2, y: hauteur / 2 - (p.y - vue.cy) * e }),
    depuis: (sx, sy) => pt((sx - largeur / 2) / e + vue.cx, (hauteur / 2 - sy) / e + vue.cy),
  };
}

export const chemin = (pr: Projecteur, points: readonly { x: number; y: number }[], ferme = true): string => {
  if (points.length === 0) return "";
  const d = points.map((p, i) => {
    const s = pr.vers(p);
    return `${i === 0 ? "M" : "L"}${s.x.toFixed(2)} ${s.y.toFixed(2)}`;
  });
  return d.join(" ") + (ferme ? " Z" : "");
};

/** Vue cadrant un ensemble de points avec une marge, pour une zone de `largeur × hauteur` px. */
export function cadrer(points: readonly { x: number; y: number }[], largeur: number, hauteur: number, marge = 40): Vue2D {
  if (points.length === 0) return { cx: 0, cy: 0, echelle: 24 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const echelle = Math.max(2, Math.min((largeur - marge * 2) / w, (hauteur - marge * 2) / h));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, echelle };
}
