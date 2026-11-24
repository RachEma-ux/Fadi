/**
 * Taille demandée pour la fenêtre détachée de la Planche (Document Picture-in-Picture) : la surface utile de l'écran,
 * au lieu des 1040 × 700 fixes d'avant (24 novembre 2026). Le navigateur peut la réduire à son maximum ; l'utilisateur
 * la redimensionne ensuite librement. Pur.
 */
export const TAILLE_FENETRE_MINIMALE = { width: 1040, height: 700 } as const;

export function tailleFenetreDetachee(ecran: { availWidth?: number; availHeight?: number } | undefined): { width: number; height: number } {
  const l = Math.round(ecran?.availWidth ?? 0);
  const h = Math.round(ecran?.availHeight ?? 0);
  return { width: Math.max(TAILLE_FENETRE_MINIMALE.width, l), height: Math.max(TAILLE_FENETRE_MINIMALE.height, h) };
}
