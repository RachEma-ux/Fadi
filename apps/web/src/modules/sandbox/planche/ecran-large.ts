/**
 * Planche détachée sur un téléphone (24 novembre 2026) : le téléphone n'ouvre pas de fenêtre séparée, la Planche passe en
 * plein écran. Au lieu de la mise en page « téléphone », elle y garde la mise en page large (bandeau, barre de gauche,
 * colonne de droite avec ses libellés, bande du bas), comme la « version ordinateur » du navigateur : le temps du plein
 * écran, la balise viewport impose une largeur de mise en page, que le navigateur réduit à la largeur de l'écran. Cette
 * largeur vaut au moins LARGEUR_VIRTUELLE et, en position couchée, assez pour que la hauteur correspondante atteigne
 * HAUTEUR_VIRTUELLE (toute la barre de gauche et toute la colonne y tiennent) : rien ne déborde, rien ne manque. Pur.
 */
export const LARGEUR_VIRTUELLE = 980;
export const HAUTEUR_VIRTUELLE = 1080;

/** Largeur (px CSS) à donner à la balise viewport pour un écran de `largeur` × `hauteur` (orientation courante). */
export function largeurVueEcranLarge(ecran: { largeur: number; hauteur: number }): number {
  const l = Math.max(1, ecran.largeur);
  const h = Math.max(1, ecran.hauteur);
  return Math.ceil(Math.max(LARGEUR_VIRTUELLE, l, (HAUTEUR_VIRTUELLE * l) / h));
}
