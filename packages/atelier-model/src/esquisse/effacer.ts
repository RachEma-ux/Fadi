/**
 * Effacement partiel (D-100, DA-01-06) : la gomme ne retire d'un trait que la portion traversée, entre les deux
 * intersections les plus proches avec les autres traits (comme « ajuster » entre deux limites). Sans intersection de
 * part et d'autre, le trait entier est retiré. Pur : renvoie les morceaux conservés, l'appelant émet les commandes.
 */
import { distance, intersectionSegments, type Vec } from "../geometrie.js";
import { pt, type Point2 } from "../unites.js";

/** Abscisses curvilignes des intersections d'une chaîne (ouverte ou fermée) avec des segments. */
export function abscissesIntersections(chaine: readonly Vec[], ferme: boolean, segments: readonly { a: Vec; b: Vec }[]): number[] {
  const pts = ferme ? [...chaine, chaine[0]!] : chaine;
  const out: number[] = [];
  let s0 = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const l = distance(a, b);
    for (const g of segments) {
      const x = intersectionSegments(a, b, g.a, g.b);
      if (x) out.push(s0 + distance(a, x.point));
    }
    s0 += l;
  }
  return out.sort((u, v) => u - v);
}

/** Point de la chaîne à l'abscisse s, et sous-chaîne [s0, s1] (s0 < s1, sans repli). */
function sousChaine(pts: readonly Vec[], s0: number, s1: number): Point2[] {
  const out: Point2[] = [];
  let cumul = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const l = distance(a, b);
    const at = (s: number) => {
      const t = l > 0 ? (s - cumul) / l : 0;
      return pt(Math.round((a.x + (b.x - a.x) * t) * 1e9) / 1e9, Math.round((a.y + (b.y - a.y) * t) * 1e9) / 1e9);
    };
    if (cumul + l >= s0 && cumul <= s1) {
      if (!out.length) out.push(at(Math.max(s0, cumul)));
      if (cumul + l <= s1) out.push(pt(b.x, b.y));
      else {
        out.push(at(s1));
        break;
      }
    }
    cumul += l;
  }
  return out.filter((q, i) => i === 0 || distance(q, out[i - 1]!) > 1e-9);
}

/**
 * Morceaux conservés d'une chaîne traversée par la gomme à l'abscisse `sCroisement`, les autres traits la coupant aux
 * abscisses `coupures`. Ouverte : jusqu'à deux morceaux. Fermée : un morceau ouvert (il faut deux coupures au moins).
 */
export function effacerPortion(chaine: readonly Vec[], ferme: boolean, sCroisement: number, coupures: readonly number[], tol = 1e-6): Point2[][] {
  const pts = ferme ? [...chaine, chaine[0]!] : [...chaine];
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += distance(pts[i]!, pts[i + 1]!);
  const c = [...new Set(coupures.filter((s) => s > tol && s < L - tol).map((s) => Math.round(s * 1e9) / 1e9))].sort((u, v) => u - v);
  const avant = c.filter((s) => s < sCroisement - tol);
  const apres = c.filter((s) => s > sCroisement + tol);
  if (!ferme) {
    const morceaux: Point2[][] = [];
    if (avant.length) morceaux.push(sousChaine(pts, 0, avant[avant.length - 1]!));
    if (apres.length) morceaux.push(sousChaine(pts, apres[0]!, L));
    return morceaux.filter((m) => m.length >= 2);
  }
  if (c.length < 2) return [];
  const lo = avant.length ? avant[avant.length - 1]! : c[c.length - 1]!;
  const hi = apres.length ? apres[0]! : c[0]!;
  // Morceau conservé : de hi à lo en avançant (avec repli par le point de départ si hi > lo).
  const m = hi < lo ? sousChaine(pts, hi, lo) : [...sousChaine(pts, hi, L), ...sousChaine(pts, 0, lo).slice(1)];
  return m.length >= 2 ? [m] : [];
}
