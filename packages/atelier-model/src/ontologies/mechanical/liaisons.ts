/**
 * Liaisons mécaniques (P2-2, DA-10-08, DA-10-09) : chaque liaison nommée se développe en contraintes élémentaires du
 * solveur, avec ses degrés de liberté restants déclarés. Références géométriques sur chaque pièce, dans son repère local :
 * point `p`, direction principale `d` (axe), direction secondaire `e` (repère de l'angle ou du guidage). Un angle de 0°
 * ou 180° est écrit en parallélisme (produit vectoriel), jamais en produit scalaire (leçon du banc P2-0).
 */
import type { ParamsLiaison, TypeLiaison } from "../../modele.js";
import { cross, normalise3, scl, type ContrainteSolveur, type V3 } from "./solveur.js";

export const TYPES_LIAISON: readonly TypeLiaison[] = ["encastrement", "pivot", "glissiere", "rotule", "coincidence", "concentrique", "parallele", "angle", "distance", "plan"];
export const LIBELLES_LIAISON: Record<TypeLiaison, string> = {
  encastrement: "Encastrement",
  pivot: "Pivot",
  glissiere: "Glissière",
  rotule: "Rotule",
  coincidence: "Coïncidence",
  concentrique: "Concentricité",
  parallele: "Parallélisme",
  angle: "Angle",
  distance: "Distance",
  plan: "Plan",
};
/** Degrés de liberté que la liaison laisse entre les deux pièces (6 au départ). */
export const DDL_LIAISON: Record<TypeLiaison, number> = { encastrement: 0, pivot: 1, glissiere: 1, rotule: 3, coincidence: 3, concentrique: 2, parallele: 4, angle: 5, distance: 5, plan: 5 };
/** Équations indépendantes qu'une liaison impose en position générale (6 − ddl, plus 1 pour la valeur pilotée d'un pivot ou d'une glissière). */
export const RANG_LIAISON: Record<TypeLiaison, number> = { encastrement: 6, pivot: 6, glissiere: 6, rotule: 3, coincidence: 3, concentrique: 4, parallele: 2, angle: 1, distance: 1, plan: 1 };
/** Liaisons qui portent une valeur de pilotage : pivot (angle, °), glissière (course, m), angle (°), distance (m). */
export const PILOTAGE: Partial<Record<TypeLiaison, { unite: "deg" | "m"; libelle: string }>> = { pivot: { unite: "deg", libelle: "Angle" }, glissiere: { unite: "m", libelle: "Course" }, angle: { unite: "deg", libelle: "Angle" }, distance: { unite: "m", libelle: "Distance" } };

const v3 = (p: { x: number; y: number; z: number }): V3 => [p.x, p.y, p.z];

/** Contraintes élémentaires d'une liaison ; `valeur` absente : 0 pour un angle ou une course, refusée pour une distance. */
export function developperLiaison(l: ParamsLiaison): ContrainteSolveur[] {
  const { a, b } = l;
  const pa = v3(l.pa), pb = v3(l.pb);
  const da = normalise3(v3(l.da)), db = normalise3(v3(l.db)), ea = normalise3(v3(l.ea)), eb = normalise3(v3(l.eb));
  const valeur = l.valeur ?? 0;
  const angleOuParallele = (u: V3, v: V3, deg: number): ContrainteSolveur => {
    const k = ((deg % 360) + 360) % 360;
    if (Math.abs(k) < 1e-9) return { type: "parallele", a, b, da: u, db: v };
    if (Math.abs(k - 180) < 1e-9) return { type: "parallele", a, b, da: u, db: scl(v, -1) };
    return { type: "angle", a, b, da: u, db: v, deg };
  };
  switch (l.type) {
    case "coincidence": return [{ type: "coincidence", a, b, pa, pb }];
    case "concentrique": return [{ type: "concentrique", a, b, pa, da, pb, db }];
    case "parallele": return [{ type: "parallele", a, b, da, db }];
    case "angle": return [angleOuParallele(da, db, valeur)];
    case "distance": return [{ type: "distance", a, b, pa, pb, d: valeur }];
    case "plan": return [{ type: "plan", a, b, pa, da, pb }];
    case "rotule": return [{ type: "coincidence", a, b, pa, pb }];
    case "encastrement": return [{ type: "coincidence", a, b, pa, pb }, { type: "parallele", a, b, da, db }, { type: "parallele", a, b, da: ea, db: eb }];
    // Pivot : angle orienté autour de l'axe (P2-6) — le signe de la rotation est tenu, une trajectoire ne se retourne pas.
    case "pivot": return [{ type: "concentrique", a, b, pa, da, pb, db }, { type: "plan", a, b, pa, da, pb }, { type: "angle-oriente", a, b, da: ea, db: eb, axe: da, deg: valeur }];
    case "glissiere": {
      const na = normalise3(cross(da, ea));
      return [{ type: "parallele", a, b, da, db }, { type: "parallele", a, b, da: ea, db: eb }, { type: "plan", a, b, pa, da: ea, pb }, { type: "plan", a, b, pa, da: na, pb }, { type: "decalage", a, b, pa, da, pb, d: valeur }];
    }
  }
}
