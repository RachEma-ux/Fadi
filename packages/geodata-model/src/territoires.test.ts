import { describe, expect, it } from "vitest";
import { regleDe, validerDeclarationTerritoire } from "./territoires.js";

describe("découpage territorial (lot H, D-GD-28 ; D-GD-42)", () => {
  it("niveau du découpage en base : un code de niveau, règle « decoupage »", () => {
    const d = { pays: "MA", nomPays: "Maroc", niveau: "commune" };
    const v = validerDeclarationTerritoire(d);
    expect(v).toEqual({ ok: true, declaration: d });
    expect(v.ok && regleDe(v.declaration)).toBe("decoupage");
  });
  it("niveau nommé par la fiche, parenté par inclusion ; aucune borne de rang", () => {
    const ok = { pays: "ZZ", nomPays: "Pays test", rang: 7, niveau: { singulier: "Unité", pluriel: "Unités" }, parent: "inclusion" };
    const v = validerDeclarationTerritoire(ok);
    expect(v).toEqual({ ok: true, declaration: ok });
    expect(v.ok && regleDe(v.declaration)).toBe("inclusion");
  });
  it("déclarations refusées", () => {
    const ok = { pays: "ZZ", nomPays: "Pays test", rang: 2, niveau: { singulier: "Unité", pluriel: "Unités" }, parent: "inclusion" };
    for (const mauvais of [{ ...ok, pays: "Maroc" }, { ...ok, pays: "ma" }, { ...ok, rang: 0 }, { ...ok, rang: 1.5 }, { ...ok, niveau: { singulier: "" } }, { ...ok, parent: "codes-hcp" },
      { ...ok, nomPays: "" }, { pays: "MA", nomPays: "Maroc", niveau: "com mune" }, null, []]) {
      expect(validerDeclarationTerritoire(mauvais).ok, JSON.stringify(mauvais)).toBe(false);
    }
  });
});
