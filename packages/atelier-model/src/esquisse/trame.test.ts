import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot } from "../commandes/index.js";
import { lireEntraxes, rectangleTroisPoints } from "../geometrie.js";
import { modeleVide, objetsDeClasse } from "../modele.js";
import { pt } from "../unites.js";
import { commandesTrame } from "./trame.js";

describe("trame, rectangle par trois points, entraxes (D-046)", () => {
  it("entraxes saisis : nombres, répétitions n*d, refus", () => {
    expect(lireEntraxes("4,5 ; 2*5 6")).toEqual([4.5, 5, 5, 6]);
    expect(() => lireEntraxes("4 ; x")).toThrow(/illisible/);
    expect(() => lireEntraxes("0")).toThrow(/invalide/);
  });
  it("trame : axes de construction, repères 1, 2, 3 / A, B, groupe ; appliquée en un lot", () => {
    const e0 = appliquerLot(modeleVide(), { requestId: "n", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "n", commands: [{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }] }).etat;
    const c = commandesTrame({ niveauId: "n0", origine: pt(10, 20), entraxesX: [5, 5], entraxesY: [6], depassement: 1, reperesX: "chiffres" }, "trame");
    const e = appliquerLot(e0, { requestId: "t", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "t", commands: c }).etat;
    const axes = objetsDeClasse(e, "esquisse").filter((o) => o.params.forme === "construction");
    expect(axes).toHaveLength(5);
    expect(axes.some((o) => o.params.points[0]!.x === 20 && o.params.points[0]!.y === 19 && o.params.points[1]!.y === 27)).toBe(true);
    expect(objetsDeClasse(e, "texte").map((t) => t.params.texte).sort()).toEqual(["1", "2", "3", "A", "B"]);
    expect(Object.values(e.groupes)[0]!.nom).toBe("Trame");
    expect(() => commandesTrame({ niveauId: "n0", origine: pt(0, 0), entraxesX: [], entraxesY: [], depassement: 1, reperesX: "lettres" }, "x")).toThrow(/au moins un/);
  });
  it("rectangle par trois points : côté a-b, largeur par projection ; dégénéré → null", () => {
    const r = rectangleTroisPoints(pt(0, 0), pt(4, 0), pt(1, 2))!;
    expect(r.map((q) => [q.x, q.y])).toEqual([[0, 0], [4, 0], [4, 2], [0, 2]]);
    expect(rectangleTroisPoints(pt(0, 0), pt(4, 0), pt(9, 0))).toBeNull();
  });
});
