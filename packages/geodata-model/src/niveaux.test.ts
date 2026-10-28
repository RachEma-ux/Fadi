import { describe, expect, it } from "vitest";
import { cheminValide, combinerFiltres, enfantsDe, filtresNiveaux, type CoucheNiveau, type EtapeNiveau } from "./niveaux.js";

// Liens parent → enfant synthétiques (dans l'application, ils sont lus en base) : deux profondeurs différentes, comme une
// ville à arrondissements regroupés (R › P › C1 › G › A1) et une ville à arrondissements directs (R › P › C2 › A2).
const parents = new Map<string, string | null>([
  ["R", null], ["P", "R"], ["Q", "R"], ["C1", "P"], ["C2", "P"], ["C3", "Q"], ["G", "C1"], ["A1", "G"], ["A2", "C2"],
]);
const regions: CoucheNiveau = { coucheId: "r", rang: 1, codes: ["R", "contour:x"] };
const provinces: CoucheNiveau = { coucheId: "p", rang: 2, codes: ["P", "Q"] };
const communes: CoucheNiveau = { coucheId: "c", rang: 3, codes: ["C1", "C2", "C3", "contour:r1"] };
const groupes: CoucheNiveau = { coucheId: "g", rang: 4, codes: ["G"] };
const arrondissements: CoucheNiveau = { coucheId: "a", rang: 5, codes: ["A1", "A2"] };
const tout = [regions, provinces, communes, groupes, arrondissements];
const etape = (c: CoucheNiveau, code: string): EtapeNiveau => ({ coucheId: c.coucheId, rang: c.rang, code, nom: code });

describe("navigation par niveaux : liens parent → enfant lus en base (D-GD-35)", () => {
  it("enfants : la couche la plus proche en dessous qui a des descendants ; sinon la suivante", () => {
    expect(enfantsDe(etape(regions, "R"), tout, parents)).toEqual([{ coucheId: "p", codes: ["P", "Q"] }]);
    expect(enfantsDe(etape(communes, "C1"), tout, parents)).toEqual([{ coucheId: "g", codes: ["G"] }]);
    // C2 n'a pas de regroupement : ses arrondissements viennent directement.
    expect(enfantsDe(etape(communes, "C2"), tout, parents)).toEqual([{ coucheId: "a", codes: ["A2"] }]);
    // Couche des regroupements absente : les arrondissements de C1.
    expect(enfantsDe(etape(communes, "C1"), [communes, arrondissements], parents)).toEqual([{ coucheId: "a", codes: ["A1"] }]);
    expect(enfantsDe(etape(communes, "C3"), tout, parents)).toEqual([]);
  });
  it("filtres d'un chemin : ancêtres, l'entité, toute sa descendance ; chemin vide = aucun filtre", () => {
    expect(filtresNiveaux([], tout, parents).size).toBe(0);
    const f = filtresNiveaux([etape(regions, "R"), etape(provinces, "P")], tout, parents);
    expect(f.get("r")).toEqual(["R"]);
    expect(f.get("p")).toEqual(["P"]);
    expect(f.get("c")).toEqual(["C1", "C2"]);
    expect(f.get("g")).toEqual(["G"]);
    expect(f.get("a")).toEqual(["A1", "A2"]);
  });
  it("descendance suivie même quand un niveau intermédiaire n'est pas chargé ; code hors découpage jamais rangé", () => {
    const f = filtresNiveaux([etape(regions, "R")], [regions, arrondissements], parents);
    expect(f.get("a")).toEqual(["A1", "A2"]);
    expect(filtresNiveaux([etape(provinces, "Q")], tout, parents).get("c")).toEqual(["C3"]);
  });
  it("filtres combinés par intersection ; chemin coupé quand une couche disparaît", () => {
    const r = combinerFiltres(new Map([["c", ["C1", "C3"]]]), new Map([["c", ["C1", "C2"]], ["p", ["P"]]]));
    expect(r.get("c")).toEqual(["C1"]);
    expect(r.get("p")).toEqual(["P"]);
    expect(cheminValide([etape(regions, "R"), etape(provinces, "P")], new Set(["r"]))).toHaveLength(1);
  });
});
