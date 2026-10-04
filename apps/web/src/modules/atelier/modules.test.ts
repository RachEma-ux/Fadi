import { describe, expect, it } from "vitest";
import { MODULES_ATELIER } from "./NouvelAtelier";
import { creerRegistres } from "./socle";
import { tableRaccourcis } from "./ui/raccourcis";

describe("modules installés dans le nouvel Atelier", () => {
  it("plan 2D, architecture et documents s'installent ensemble, sans conflit de raccourci (D-037)", () => {
    const r = creerRegistres();
    for (const installer of MODULES_ATELIER) installer(r);
    const outils = r.outils.lister();
    expect(tableRaccourcis(outils).conflits).toEqual([]);
    const parRaccourci = Object.fromEntries(outils.filter((o) => o.raccourci).map((o) => [o.raccourci, o.id]));
    expect(Object.keys(parRaccourci).sort()).toEqual(["A", "C", "E", "F", "K", "L", "M", "O", "P", "R", "S", "T", "U"]);
    expect(parRaccourci.M).toBe("creer.mur");
    expect(parRaccourci.P).toBe("creer.porte");
    for (const classe of ["mur", "porte", "piece", "cotation", "texte"]) expect(r.dessinateurs.pour(classe), classe).not.toBeNull();
  });
});
