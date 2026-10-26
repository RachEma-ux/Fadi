import { describe, expect, it } from "vitest";
import { cheminValide, combinerFiltres, enfantsDe, filtresNiveaux, parentHcp, type CoucheNiveau, type EtapeNiveau } from "./niveaux.js";

// Codes HCP réels (RGPH 2024) : régions 1 et 10, provinces 1511 (Tanger-Assilah), 1051 (Al Hoceïma), 10511 (fictive à
// 5 chiffres, pour le plus long préfixe), communes et arrondissements de Tanger.
const regions: CoucheNiveau = { coucheId: "r", rang: 1, codes: ["1", "10", "6", "contour:x"] };
const provinces: CoucheNiveau = { coucheId: "p", rang: 2, codes: ["1511", "1051", "10511", "6141"] };
const communes: CoucheNiveau = { coucheId: "c", rang: 3, codes: ["1511010", "15110507", "10510103", "105110101", "6141010", "contour:r1"] };
const arrondissements: CoucheNiveau = { coucheId: "a", rang: 4, codes: ["15110103", "15110105", "61410111"] };
const tout = [regions, provinces, communes, arrondissements];
const etape = (c: CoucheNiveau, code: string): EtapeNiveau => ({ coucheId: c.coucheId, rang: c.rang, code, nom: code });

describe("navigation par niveaux (lot B) : parenté par les codes HCP", () => {
  it("province → région : code sans ses 3 derniers chiffres (jamais le plus long préfixe : 1051 est de la région 1)", () => {
    expect(parentHcp("1051", 2, new Set(["1", "10"]))).toBe("1");
    expect(parentHcp("10511", 2, new Set(["1", "10"]))).toBe("10");
  });
  it("commune → province : plus long préfixe ; arrondissement → commune de 7 chiffres aux 6 mêmes premiers", () => {
    expect(parentHcp("105110101", 3, new Set(["1051", "10511"]))).toBe("10511");
    expect(parentHcp("10510103", 3, new Set(["1051", "10511"]))).toBe("1051");
    expect(parentHcp("61410111", 4, new Set(["6141010", "1511010"]))).toBe("6141010");
  });
  it("jamais de parent deviné : code non HCP, parent absent", () => {
    expect(parentHcp("contour:r1", 3, new Set(["1511"]))).toBeNull();
    expect(parentHcp("9999", 2, new Set(["1"]))).toBeNull();
  });
  it("enfants d'une région, d'une commune", () => {
    expect(enfantsDe(etape(regions, "1"), tout)).toEqual([{ coucheId: "p", codes: ["1511", "1051"] }]);
    expect(enfantsDe(etape(communes, "1511010"), tout)).toEqual([{ coucheId: "a", codes: ["15110103", "15110105"] }]);
    expect(enfantsDe(etape(arrondissements, "15110103"), tout)).toEqual([]);
  });
  it("filtres d'un chemin : ancêtres, l'entité, ses descendants rang par rang ; chemin vide = aucun filtre", () => {
    expect(filtresNiveaux([], tout).size).toBe(0);
    const f = filtresNiveaux([etape(regions, "1"), etape(provinces, "1511")], tout);
    expect(f.get("r")).toEqual(["1"]);
    expect(f.get("p")).toEqual(["1511"]);
    expect(f.get("c")).toEqual(["1511010", "15110507"]);
    expect(f.get("a")).toEqual(["15110103", "15110105"]);
  });
  it("un rang absent interrompt la descente (pas de parenté devinée au-delà)", () => {
    const f = filtresNiveaux([etape(regions, "1")], [regions, communes]);
    expect(f.get("r")).toEqual(["1"]);
    expect(f.has("c")).toBe(false);
  });
  it("filtres combinés par intersection ; chemin coupé quand une couche disparaît", () => {
    const r = combinerFiltres(new Map([["c", ["1511010", "6141010"]]]), new Map([["c", ["1511010", "15110507"]], ["p", ["1511"]]]));
    expect(r.get("c")).toEqual(["1511010"]);
    expect(r.get("p")).toEqual(["1511"]);
    expect(cheminValide([etape(regions, "1"), etape(provinces, "1511")], new Set(["r"]))).toHaveLength(1);
  });
});
