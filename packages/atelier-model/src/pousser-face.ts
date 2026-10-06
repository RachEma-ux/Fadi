/**
 * Pousser / tirer une face latérale (D-125, DA-04-07) : l'arête `i` (sommets i et i + 1) d'un contour fermé avance de
 * `d` mètres le long de sa normale extérieure (d < 0 : vers l'intérieur) ; ses deux sommets glissent sur les droites
 * des arêtes voisines (prolongées), de sorte que la forme reste fermée et que les autres faces restent en place. Une
 * arête voisine parallèle ne peut pas porter le sommet : il suit alors la normale. Résultat refusé (null) si le
 * contour se croise ou s'annule. Fonction pure, sans DOM.
 */
import { aireSignee, cross, distance, sub, type Vec } from "./geometrie.js";
import { pt, type Point2 } from "./unites.js";
import { seCroise } from "./commandes/etirer-fenetre.js";

const r9 = (x: number) => Math.round(x * 1e9) / 1e9;

/** Normale extérieure unitaire de l'arête i d'un contour fermé. */
export function normaleExterieure(contour: readonly Vec[], i: number): Vec {
  const n = contour.length;
  const a = contour[i]!;
  const b = contour[(i + 1) % n]!;
  const L = distance(a, b) || 1;
  const sens = aireSignee(contour) >= 0 ? 1 : -1; // sens direct : l'extérieur est à droite de l'arête
  return { x: (sens * (b.y - a.y)) / L, y: (sens * -(b.x - a.x)) / L };
}

/** Indice de l'arête du contour la plus proche d'un point du plan. */
export function areteLaPlusProche(contour: readonly Vec[], p: Vec): number {
  let meilleur = 0;
  let dmin = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i]!;
    const b = contour[(i + 1) % contour.length]!;
    const ab = sub(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y;
    const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
    const d = distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
    if (d < dmin) {
      dmin = d;
      meilleur = i;
    }
  }
  return meilleur;
}

export function pousserArete(contour: readonly Vec[], i: number, d: number): Point2[] | null {
  const n = contour.length;
  if (n < 3 || i < 0 || i >= n) return null;
  const nrm = normaleExterieure(contour, i);
  const a = contour[i]!;
  const b = contour[(i + 1) % n]!;
  const a2 = { x: a.x + nrm.x * d, y: a.y + nrm.y * d };
  const b2 = { x: b.x + nrm.x * d, y: b.y + nrm.y * d };
  const dir = sub(b2, a2);
  // Sommet porté par la droite de l'arête voisine (p0 → p1) et la nouvelle droite de l'arête poussée.
  const surVoisine = (p0: Vec, p1: Vec, defaut: Vec): Vec => {
    const v = sub(p1, p0);
    const den = cross(v, dir);
    if (Math.abs(den) < 1e-12 * Math.max(1, Math.hypot(v.x, v.y) * Math.hypot(dir.x, dir.y))) return defaut;
    const t = cross(sub(a2, p0), dir) / den;
    return { x: p0.x + v.x * t, y: p0.y + v.y * t };
  };
  const prec = contour[(i - 1 + n) % n]!;
  const suiv = contour[(i + 2) % n]!;
  const na = surVoisine(prec, a, a2);
  const nb = surVoisine(suiv, b, b2);
  const out = contour.map((q) => pt(q.x, q.y));
  out[i] = pt(r9(na.x), r9(na.y));
  out[(i + 1) % n] = pt(r9(nb.x), r9(nb.y));
  if (Math.abs(aireSignee(out)) < 1e-9 || seCroise(out) || distance(out[i]!, out[(i + 1) % n]!) < 1e-6) return null;
  if (Math.sign(aireSignee(out)) !== Math.sign(aireSignee(contour))) return null;
  return out;
}
