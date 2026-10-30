import { describe, expect, it } from "vitest";
import { bornerPosition, ICONES, POSITION_PAR_DEFAUT, RACCOURCIS_BARRE } from "./BarreOutilsCarte";

describe("barre d'outils flottante GeoData", () => {
  it("position par défaut : à droite, en haut", () => expect(POSITION_PAR_DEFAUT).toEqual({ droite: 10, haut: 10 }));
  it("bornée à la carte : jamais hors champ, même sur une petite carte", () => {
    const carte = { largeur: 800, hauteur: 600 }, barre = { largeur: 40, hauteur: 500 };
    expect(bornerPosition({ droite: -50, haut: -20 }, carte, barre)).toEqual({ droite: 4, haut: 4 });
    expect(bornerPosition({ droite: 2000, haut: 2000 }, carte, barre)).toEqual({ droite: 756, haut: 96 });
    expect(bornerPosition({ droite: 30, haut: 50 }, { largeur: 30, hauteur: 300 }, barre)).toEqual({ droite: 4, haut: 4 });
  });
  it("chaque outil a sa propre icône et chaque commande sa propre touche (lecture de l'emprise, D-GD-40)", () => {
    const traces = Object.values(ICONES);
    expect(new Set(traces).size).toBe(traces.length);
    const touches = Object.values(RACCOURCIS_BARRE);
    expect(new Set(touches).size).toBe(touches.length);
    expect(RACCOURCIS_BARRE).toMatchObject({ synthese: "Alt+V", regrouper: "Alt+G", lien: "Alt+K" });
  });
});
