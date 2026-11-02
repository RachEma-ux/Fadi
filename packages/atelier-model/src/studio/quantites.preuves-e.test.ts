/**
 * EX-078 — cohérence des totaux (groupe E, point 2) : une somme ne mélange pas, sans signalement, des quantités
 * d'unités différentes. Les totaux sont faits grandeur par grandeur, chacun dans l'unité de sa grandeur ; une valeur
 * portée dans une autre unité n'est jamais additionnée et rend le total partiel (signalé). Pur.
 */
import { describe, expect, it } from "vitest";
import { totaliserQuantites, UNITE_GRANDEUR, type QuantitesObjet, type ValeurQuantite } from "./quantites.js";

const v = (grandeur: ValeurQuantite["grandeur"], valeur: number | null, unite = UNITE_GRANDEUR[grandeur]): ValeurQuantite => ({ grandeur, unite, valeur });
const objet = (objetId: string, valeurs: ValeurQuantite[]): QuantitesObjet => ({ objetId, type: "rectangle", nature: "prisme", calqueId: "0", calqueMasque: false, valeurs });

describe("EX-078 — totaux sans mélange d'unités", () => {
  it("EX-078 [+] quantités homogènes : un total par grandeur, dans son unité (m², m³ jamais additionnés ensemble) ; hauteur non cumulée ; non évaluées comptées", () => {
    const t = totaliserQuantites([
      objet("a", [v("surface", 2), v("hauteur", 3), v("volume", 6)]),
      objet("b", [v("surface", 1.5), v("hauteur", 2), v("volume", 3)]),
      objet("c", [v("surface", 4), v("volume", null)]),
    ]);
    expect(t.map((x) => [x.grandeur, x.unite, x.valeur, x.evalues, x.nonEvalues])).toEqual([
      ["surface", "m2", 7.5, 3, 0],
      ["volume", "m3", 9, 2, 1],
    ]);
  });

  it("EX-078 [−] une valeur m² rangée sous le volume (m³) : jamais additionnée, total du volume déclaré partiel", () => {
    const t = totaliserQuantites([
      objet("a", [v("volume", 6)]),
      objet("b", [v("volume", 12, "m2")]),
      objet("c", [v("surface", 5, "m3"), v("volume", 1)]),
    ]);
    expect(t.find((x) => x.grandeur === "volume")).toEqual({ grandeur: "volume", unite: "m3", valeur: 7, evalues: 2, nonEvalues: 1 });
    expect(t.find((x) => x.grandeur === "surface")).toEqual({ grandeur: "surface", unite: "m2", valeur: null, evalues: 0, nonEvalues: 1 });
  });
});
