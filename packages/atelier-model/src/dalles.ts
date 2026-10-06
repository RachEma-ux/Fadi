/**
 * Dalles : sens de l'épaisseur et retombée de rive (D-144, DA-07-06). Le décalage de base place la face de
 * référence de la dalle au-dessus du niveau ; par défaut l'épaisseur monte depuis elle (dessous de la dalle à la
 * base, comportement d'origine) ; `sens: "bas"` la fait descendre (dessus de la dalle à la base, épaisseur sous
 * le niveau fini). La retombée de rive est une bande pleine sous la dalle, le long de son contour extérieur, de
 * largeur et de hauteur saisies (aucune valeur par défaut). Pur (ni React ni DOM).
 */
import { decalerContour, type Vec } from "./geometrie.js";
import type { ParamsDalle } from "./modele.js";

/** Dessous et dessus de la dalle, relatifs à l'altitude du niveau (m). */
export function etendueDalle(p: Pick<ParamsDalle, "decalageBase" | "epaisseur" | "sens">): { bas: number; haut: number } {
  const ref = p.decalageBase.value;
  const ep = p.epaisseur.value;
  return p.sens === "bas" ? { bas: ref - ep, haut: ref } : { bas: ref, haut: ref + ep };
}

/** Anneau de la retombée de rive (contour extérieur, contour décalé vers l'intérieur en trou), ou null. */
export function anneauRetombee(p: Pick<ParamsDalle, "contour" | "retombee">): { contour: Vec[]; interieur: Vec[] } | null {
  if (!p.retombee) return null;
  const interieur = decalerContour(p.contour, -p.retombee.largeur.value);
  // Trou de l'anneau en sens inverse du contour (convention des trous du maillage et de l'IFC).
  return interieur ? { contour: [...p.contour], interieur: [...interieur].reverse() } : null;
}
