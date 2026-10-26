import { describe, expect, it } from "vitest";
import { codeAdmis, parentsParCodes, validerDeclarationTerritoire } from "./territoires.js";

describe("découpage territorial (lot H, D-GD-28)", () => {
  const ok = { pays: "MA", nomPays: "Maroc", rang: 2, niveau: { singulier: "Province ou préfecture", pluriel: "Provinces et préfectures" }, parent: "codes-hcp" };
  it("déclaration valide relue ; pays ISO alpha-2, rang 1 à 4, niveau nommé, règle connue exigés", () => {
    expect(validerDeclarationTerritoire(ok)).toEqual({ ok: true, declaration: ok });
    for (const mauvais of [{ ...ok, pays: "Maroc" }, { ...ok, pays: "ma" }, { ...ok, rang: 5 }, { ...ok, niveau: { singulier: "" } }, { ...ok, parent: "noms" }, { ...ok, nomPays: "" }, null, []]) {
      expect(validerDeclarationTerritoire(mauvais).ok, JSON.stringify(mauvais)).toBe(false);
    }
  });
  it("codes admis : règle « codes-hcp » = codes HCP seulement (contour non rattaché écarté) ; « inclusion » = tout code", () => {
    expect(codeAdmis("15110103", "codes-hcp")).toBe(true);
    expect(codeAdmis("contour:r123", "codes-hcp")).toBe(false);
    expect(codeAdmis("contour:r123", "inclusion")).toBe(true);
    expect(codeAdmis(" ", "inclusion")).toBe(false);
  });
  it("parents par les codes HCP : jamais devinés (absent → null)", () => {
    expect([...parentsParCodes(["1001", "2001", "9001"], 2, new Set(["1", "2"]))]).toEqual([["1001", "1"], ["2001", "2"], ["9001", null]]);
  });
});
