import { describe, expect, it } from "vitest";
import { ECART_GROUPES, LARGEUR_RECHERCHE, placerMiniBarre, placerRecherche } from "./BarreRecherche";

describe("mini-barre de recherche GeoData", () => {
  const carte = { largeur: 1000, hauteur: 700 }, mini = { largeur: 42, hauteur: 42 };
  it("sous la barre d'outils, au même bord droit, séparée par l'écart des groupes", () => {
    expect(placerMiniBarre({ droite: 10, haut: 10, largeur: 42, hauteur: 560 }, carte, mini, 40)).toEqual({ droite: 10, haut: 10 + 560 + ECART_GROUPES });
  });
  it("jamais sur l'échelle ni les sources : sans place dessous, à gauche du bas de la barre d'outils", () => {
    const q = placerMiniBarre({ droite: 10, haut: 10, largeur: 42, hauteur: 600 }, carte, mini, 60);
    expect(q).toEqual({ droite: 10 + 42 + ECART_GROUPES, haut: 10 + 600 - 42 });
    expect(q.haut + mini.hauteur).toBeLessThanOrEqual(carte.hauteur - 60);
    // Petite carte : la mini-barre reste au-dessus de la réserve du bas, jamais hors champ en haut.
    const p = placerMiniBarre({ droite: 10, haut: 4, largeur: 42, hauteur: 300 }, { largeur: 390, hauteur: 320 }, mini, 50);
    expect(p.haut).toBeGreaterThanOrEqual(4);
    expect(p.haut + mini.hauteur).toBeLessThanOrEqual(320 - 50);
  });
  it("barre flottante à gauche de la loupe, alignée ; toute la place disponible sur un petit écran ; à droite si la place manque", () => {
    const grand = placerRecherche({ droite: 10, haut: 578, ...mini }, carte);
    expect(grand).toEqual({ gauche: 1000 - 10 - 42 - ECART_GROUPES - LARGEUR_RECHERCHE, haut: 578, largeur: LARGEUR_RECHERCHE, resultatsVersLeHaut: true });
    const telephone = placerRecherche({ droite: 10, haut: 100, ...mini }, { largeur: 390, hauteur: 600 });
    expect(telephone.gauche).toBe(4);
    expect(telephone.gauche + telephone.largeur).toBe(390 - 10 - 42 - ECART_GROUPES);
    expect(telephone.resultatsVersLeHaut).toBe(false);
    const aGauche = placerRecherche({ droite: 900, haut: 100, ...mini }, carte);
    expect(aGauche.gauche).toBe(1000 - 900 + ECART_GROUPES);
    expect(aGauche.largeur).toBe(LARGEUR_RECHERCHE);
  });
});
