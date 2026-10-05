import { describe, expect, it } from "vitest";
import { pt } from "../unites.js";
import { abscissesIntersections, effacerPortion } from "./effacer.js";

describe("effacement partiel (D-100, DA-01-06)", () => {
  const ligne = [pt(0, 0), pt(10, 0)];
  const coupes = [{ a: pt(3, -1), b: pt(3, 1) }, { a: pt(6, -1), b: pt(6, 1) }];

  it("abscisses des intersections ; portion entre les deux coupures voisines retirée", () => {
    const c = abscissesIntersections(ligne, false, coupes);
    expect(c).toEqual([3, 6]);
    expect(effacerPortion(ligne, false, 4.5, c)).toEqual([[pt(0, 0), pt(3, 0)], [pt(6, 0), pt(10, 0)]]);
    expect(effacerPortion(ligne, false, 8, c)).toEqual([[pt(0, 0), pt(6, 0)]]);
    expect(effacerPortion(ligne, false, 1, c)).toEqual([[pt(3, 0), pt(10, 0)]]);
    expect(effacerPortion(ligne, false, 5, [])).toEqual([]);
  });

  it("polyligne : morceaux qui gardent les sommets ; contour fermé : un morceau ouvert, repli par le départ", () => {
    const poly = [pt(0, 0), pt(4, 0), pt(4, 4)];
    expect(effacerPortion(poly, false, 5, [2, 6])).toEqual([[pt(0, 0), pt(2, 0)], [pt(4, 2), pt(4, 4)]]);
    const carre = [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)];
    // Coupures à 2 (bas) et 6 (droite) ; gomme à 4 (coin bas droit) : on garde de 6 à 2 en passant par le haut et la gauche.
    expect(effacerPortion(carre, true, 4, [2, 6])).toEqual([[pt(4, 2), pt(4, 4), pt(0, 4), pt(0, 0), pt(2, 0)]]);
    expect(effacerPortion(carre, true, 4, [2])).toEqual([]);
  });
});
