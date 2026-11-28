import { describe, expect, it } from "vitest";
import { decisionPremierClic } from "./selection-ops";

const base = { objets: [], administratives: [], rastersVisibles: [], pays: null, rangsDuPays: [] };

describe("premier clic sur la carte (P11, D-GD-34)", () => {
  it("un objet hors limites administratives garde la sélection simple, même si une limite est aussi touchée", () => {
    const d = decisionPremierClic({ ...base, objets: [{ coucheId: "reg", code: "1" }, { coucheId: "poi", code: "x" }], administratives: [{ coucheId: "reg", rang: 1 }] });
    expect(d).toEqual({ cas: "objet", objet: { coucheId: "poi", code: "x" } });
  });
  it("entité administrative la plus fine parmi celles touchées", () => {
    const d = decisionPremierClic({ ...base, objets: [{ coucheId: "reg", code: "1" }, { coucheId: "pro", code: "11" }], administratives: [{ coucheId: "reg", rang: 1 }, { coucheId: "pro", rang: 2 }] });
    expect(d).toEqual({ cas: "administratif", objet: { coucheId: "pro", code: "11" }, rang: 2 });
  });
  it("limites affichées mais rien touché : la sélection est effacée (pas de lecture raster ni d'unités au point)", () => {
    expect(decisionPremierClic({ ...base, administratives: [{ coucheId: "reg", rang: 1 }], rastersVisibles: ["r"], pays: "ZZ", rangsDuPays: [1] })).toEqual({ cas: "effacer" });
  });
  it("sans limites : valeur au point du raster visible le plus haut", () => {
    expect(decisionPremierClic({ ...base, rastersVisibles: ["bas", "haut"], pays: "ZZ", rangsDuPays: [1] })).toEqual({ cas: "raster", coucheId: "haut" });
  });
  it("carte vierge : unités au point du pays courant, sinon rien", () => {
    expect(decisionPremierClic({ ...base, pays: "ZZ", rangsDuPays: [1, 2] })).toEqual({ cas: "unites-au-point", pays: "ZZ" });
    expect(decisionPremierClic({ ...base, pays: "ZZ", rangsDuPays: [] })).toEqual({ cas: "effacer" });
    expect(decisionPremierClic(base)).toEqual({ cas: "effacer" });
  });
});
