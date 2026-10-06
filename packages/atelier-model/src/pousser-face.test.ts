import { describe, expect, it } from "vitest";
import { areteLaPlusProche, normaleExterieure, pousserArete } from "./pousser-face.js";
import { pt } from "./unites.js";

const carre = [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)];
describe("pousser / tirer une face latérale (D-125, DA-04-07)", () => {
  it("arête droite poussée de 1 m vers l'extérieur ; tirée vers l'intérieur ; sens horaire géré", () => {
    expect(normaleExterieure(carre, 1)).toEqual({ x: 1, y: -0 });
    expect(pousserArete(carre, 1, 1)).toEqual([pt(0, 0), pt(5, 0), pt(5, 3), pt(0, 3)]);
    expect(pousserArete(carre, 2, -1)).toEqual([pt(0, 0), pt(4, 0), pt(4, 2), pt(0, 2)]);
    const horaire = [...carre].reverse();
    expect(pousserArete(horaire, 0, 1)).toEqual([pt(0, 4), pt(4, 4), pt(4, 0), pt(0, 0)]);
    expect(areteLaPlusProche(carre, pt(4.1, 1.5))).toBe(1);
  });

  it("voisines obliques : les sommets glissent sur leurs droites ; effondrement refusé", () => {
    const trapeze = [pt(0, 0), pt(6, 0), pt(4, 2), pt(2, 2)];
    const r = pousserArete(trapeze, 2, 0.5)!; // arête du haut (4,2)→(2,2) montée de 0,5 m
    expect(r[2]).toEqual(pt(3.5, 2.5));
    expect(r[3]).toEqual(pt(2.5, 2.5));
    expect(pousserArete(trapeze, 2, 1)).toBeNull(); // les voisines se rejoignent : arête nulle
    expect(pousserArete(carre, 1, -4)).toBeNull(); // forme retournée
  });
});
