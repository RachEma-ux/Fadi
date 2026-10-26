import { describe, expect, it } from "vitest";
import { epaisseurContour, ordreAffichage, rangAdministratif } from "./limites.js";

describe("limites administratives (D-GD-16)", () => {
  it("rang lu de la source : ADM1/ADM2, niveau OSM du titre ; sinon aucun", () => {
    expect(rangAdministratif({ niveau: "ADM1", titre: "Régions du Maroc (ADM1)" })).toBe(1);
    expect(rangAdministratif({ niveau: "ADM2", titre: "Provinces" })).toBe(2);
    expect(rangAdministratif({ niveau: null, titre: "Communes du Maroc (OpenStreetMap, niveau administratif 8)" })).toBe(3);
    expect(rangAdministratif({ niveau: "OSM8", titre: "Population légale RGPH 2024 — communes" })).toBe(3);
    expect(rangAdministratif({ niveau: null, titre: "Barrages" })).toBeNull();
    expect(rangAdministratif({ niveau: "TEST", titre: "Unités synthétiques (test)" })).toBeNull();
  });
  it("épaisseur : région > province > commune", () => {
    expect(epaisseurContour(1)).toBeGreaterThan(epaisseurContour(2));
    expect(epaisseurContour(2)).toBeGreaterThan(epaisseurContour(3));
  });
  it("superposition : région au-dessus, province, commune dessous ; autres couches à leur place", () => {
    const c = (coucheId: string) => ({ coucheId });
    const rangs = new Map([["region", 1], ["province", 2], ["commune", 3]] as const);
    // Composition (du dessous vers le dessus) : région, barrages, commune, province.
    expect(ordreAffichage([c("region"), c("barrages"), c("commune"), c("province")], rangs).map((k) => k.coucheId)).toEqual(["commune", "barrages", "province", "region"]);
  });
});
