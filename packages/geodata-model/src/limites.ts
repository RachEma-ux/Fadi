/**
 * Limites administratives (D-GD-16, D-GD-42) : le rang d'une couche dans la hiérarchie est celui de son niveau dans la
 * table des niveaux **en base** (1 = le plus global), servi par l'API avec la couche — jamais lu du titre ni d'un code de
 * niveau écrit dans le code. Ordre d'affichage : en superposition, le niveau le plus global est au-dessus, avec le
 * contour le plus épais. Pur.
 */

/** Rang d'un niveau administratif (1 = le plus global) ; aucune borne : la table des niveaux en décide. */
export type RangAdministratif = number;

/** Épaisseur du contour (px) : décroît avec le rang (3,5 px au plus global), sans plancher en dessous de 0,5 px. */
export const epaisseurContour = (rang: RangAdministratif | null): number => (rang === null ? 1.5 : Math.max(0.5, Math.round(3.5 * 0.62 ** (rang - 1) * 100) / 100));

/**
 * Ordre d'affichage (du dessous vers le dessus) : l'ordre de la composition est gardé, sauf entre couches
 * administratives, qui occupent les mêmes places mais rangées du plus fin (dessous) au plus global (dessus).
 */
export function ordreAffichage<T extends { readonly coucheId: string }>(couches: readonly T[], rangs: ReadonlyMap<string, RangAdministratif>): T[] {
  const admin = couches.filter((k) => rangs.has(k.coucheId));
  const triees = [...admin].sort((a, b) => rangs.get(b.coucheId)! - rangs.get(a.coucheId)!);
  let i = 0;
  return couches.map((k) => (rangs.has(k.coucheId) ? triees[i++]! : k));
}
