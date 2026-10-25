/**
 * Partie pure du chargement différé des images (bibliothèque unlazy, composant `components/ImageDifferee.tsx`) :
 * l'espace réservé est une petite image SVG aux proportions de l'image attendue, décodable tout de suite par le
 * navigateur. unlazy s'appuie dessus : l'attribut natif `loading="lazy"` ne charge cet espace réservé qu'à l'approche
 * de la zone visible, et c'est son événement `load` qui déclenche le téléchargement de l'image réelle.
 */

/** Couleur neutre de l'espace réservé (même teinte que la bordure des photos de la Communication). */
export const COULEUR_ESPACE_RESERVE = "#e8efeb";

/** Dimension retenue pour l'espace réservé : entier strictement positif, sinon 1 (image carrée par défaut). */
function cote(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
}

/** Espace réservé SVG (URI `data:`) aux proportions `largeur × hauteur`, rempli d'une couleur unie. */
export function espaceReserveSvg(largeur?: number, hauteur?: number, couleur = COULEUR_ESPACE_RESERVE): string {
  const l = cote(largeur);
  const h = cote(hauteur);
  const teinte = /^#[0-9a-f]{3,8}$/i.test(couleur) ? couleur : COULEUR_ESPACE_RESERVE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${h}" viewBox="0 0 ${l} ${h}"><rect width="${l}" height="${h}" fill="${teinte}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
