import { describe, expect, it } from "vitest";
import { bornerPosition, POSITION_PAR_DEFAUT } from "./BarreOutilsCarte";

describe("barre d'outils flottante GeoData", () => {
  it("position par défaut : à droite, en haut", () => expect(POSITION_PAR_DEFAUT).toEqual({ droite: 10, haut: 10 }));
  it("bornée à la carte : jamais hors champ, même sur une petite carte", () => {
    const carte = { largeur: 800, hauteur: 600 }, barre = { largeur: 40, hauteur: 500 };
    expect(bornerPosition({ droite: -50, haut: -20 }, carte, barre)).toEqual({ droite: 4, haut: 4 });
    expect(bornerPosition({ droite: 2000, haut: 2000 }, carte, barre)).toEqual({ droite: 756, haut: 96 });
    expect(bornerPosition({ droite: 30, haut: 50 }, { largeur: 30, hauteur: 300 }, barre)).toEqual({ droite: 4, haut: 4 });
  });
});
