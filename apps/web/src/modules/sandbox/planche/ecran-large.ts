/**
 * Planche détachée sur un téléphone (24 novembre 2026) : le téléphone n'ouvre pas de fenêtre séparée, la Planche passe en
 * plein écran. Au lieu de la mise en page « téléphone », elle y garde la mise en page large (bandeau, barre de gauche,
 * colonne de droite avec ses libellés, bande du bas), comme la « version ordinateur » du navigateur : elle est posée sur
 * une surface virtuelle d'au moins LARGEUR_VIRTUELLE × HAUTEUR_VIRTUELLE px (toute la barre de gauche et toute la colonne
 * y tiennent), puis réduite à l'échelle pour couvrir EXACTEMENT l'écran (rien ne déborde, rien ne manque). Pur.
 */
export const LARGEUR_VIRTUELLE = 980;
export const HAUTEUR_VIRTUELLE = 1080;

export interface MiseEchelle {
  /** Largeur et hauteur de la Planche avant réduction (px CSS). */
  largeur: number;
  hauteur: number;
  /** Facteur de réduction (≤ 1) : largeur × echelle = largeur de l'écran, hauteur × echelle = hauteur de l'écran. */
  echelle: number;
}

export function miseEchelleEcranLarge(
  ecran: { largeur: number; hauteur: number },
  minimum: { largeur: number; hauteur: number } = { largeur: LARGEUR_VIRTUELLE, hauteur: HAUTEUR_VIRTUELLE },
): MiseEchelle {
  const l = Math.max(1, ecran.largeur);
  const h = Math.max(1, ecran.hauteur);
  const echelle = Math.min(1, l / minimum.largeur, h / minimum.hauteur);
  return { largeur: l / echelle, hauteur: h / echelle, echelle };
}
