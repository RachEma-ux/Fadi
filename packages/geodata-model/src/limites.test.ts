import { describe, expect, it } from "vitest";
import { epaisseurContour, ordreAffichage } from "./limites.js";

describe("limites administratives (D-GD-16, D-GD-42)", () => {
  it("épaisseur : décroît avec le rang, quel que soit le nombre de niveaux", () => {
    for (let r = 1; r < 8; r++) expect(epaisseurContour(r)).toBeGreaterThanOrEqual(epaisseurContour(r + 1));
    expect(epaisseurContour(1)).toBeGreaterThan(epaisseurContour(2));
    expect(epaisseurContour(20)).toBeGreaterThan(0);
  });
  it("superposition : le plus global au-dessus ; autres couches à leur place", () => {
    const c = (coucheId: string) => ({ coucheId });
    const rangs = new Map([["region", 1], ["province", 2], ["commune", 3], ["arrondissement", 5]]);
    expect(ordreAffichage([c("region"), c("barrages"), c("arrondissement"), c("commune"), c("province")], rangs).map((k) => k.coucheId))
      .toEqual(["arrondissement", "barrages", "commune", "province", "region"]);
  });
});
