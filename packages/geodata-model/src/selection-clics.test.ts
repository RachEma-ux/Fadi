import { describe, expect, it } from "vitest";
import { compterClic, niveauxDeSelection, niveauxDuPoint, rangPourClics } from "./selection-clics.js";

describe("sélection par nombre de clics (D-GD-34)", () => {
  it("compte les clics rapides au même endroit ; un délai dépassé ou un pointeur déplacé recommence à 1", () => {
    const s1 = compterClic(null, { t: 1000, x: 10, y: 10 });
    expect(s1.n).toBe(1);
    const s2 = compterClic(s1, { t: 1250, x: 13, y: 8 });
    expect(s2.n).toBe(2);
    expect(compterClic(s2, { t: 1500, x: 13, y: 8 }).n).toBe(3);
    expect(compterClic(s2, { t: 1600, x: 13, y: 8 }).n).toBe(1); // 350 ms après le 2e clic : nouvelle série
    expect(compterClic(s1, { t: 1100, x: 30, y: 10 }).n).toBe(1); // 20 px plus loin : nouvelle série
    expect(compterClic(s1, { t: 900, x: 10, y: 10 }).n).toBe(1); // horloge incohérente : jamais prolongée
  });
  it("niveaux du plus élémentaire au plus global : ceux des couches chargées, sinon ceux de la base", () => {
    expect(niveauxDeSelection([1, 2, 3], [1, 2, 3])).toEqual([3, 2, 1]);
    expect(niveauxDeSelection([2, 1], [1, 2, 3])).toEqual([2, 1]);
    expect(niveauxDeSelection([1, 3, 1], [1, 2, 3])).toEqual([3, 1]);
    expect(niveauxDeSelection([2], [1, 2, 3])).toEqual([2]);
    expect(niveauxDeSelection([], [2, 1, 3])).toEqual([3, 2, 1]);
    expect(niveauxDeSelection([5], [1, 2, 3, 5])).toEqual([5]);
    expect(niveauxDeSelection([], [])).toEqual([]);
  });
  it("niveaux réels de l'endroit cliqué (D-GD-35) : profondeur du lieu, restreinte aux couches chargées", () => {
    // Rangs d'une chaîne lue en base : 5 niveaux (arrondissement regroupé), 4 (arrondissement direct), 3 (commune).
    expect(niveauxDuPoint([1, 2, 3, 4, 5], [])).toEqual([5, 4, 3, 2, 1]);
    expect(niveauxDuPoint([5, 3, 2, 1], [])).toEqual([5, 3, 2, 1]);
    expect(niveauxDuPoint([3, 2, 1], [])).toEqual([3, 2, 1]);
    // Couches chargées : seuls leurs niveaux, et seulement ceux présents à l'endroit.
    expect(niveauxDuPoint([5, 4, 3, 2, 1], [1, 4])).toEqual([4, 1]);
    expect(niveauxDuPoint([3, 2, 1], [1, 4, 5])).toEqual([1]);
    expect(niveauxDuPoint([], [1])).toEqual([]);
  });
  it("le n-ième clic donne le n-ième niveau, puis le dernier ne change plus", () => {
    expect(rangPourClics([3, 2, 1], 1)).toBe(3);
    expect(rangPourClics([3, 2, 1], 2)).toBe(2);
    expect(rangPourClics([3, 2, 1], 3)).toBe(1);
    expect(rangPourClics([3, 2, 1], 7)).toBe(1);
    expect(rangPourClics([2, 1], 2)).toBe(1);
    expect(rangPourClics([2, 1], 3)).toBe(1);
    expect(rangPourClics([2], 2)).toBe(2);
    expect(rangPourClics([], 1)).toBeNull();
    expect(rangPourClics([3], 0)).toBeNull();
  });
});
