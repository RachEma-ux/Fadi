import { describe, expect, it } from "vitest";
import { financeKpis, isDecisionChoice, scoreKpis } from "./kpis";

describe("financeKpis — étape 14", () => {
  it("ne calcule rien tant qu'un poste requis manque : une valeur inconnue n'est pas zéro", () => {
    // Scénario rejoué sur le prototype (captures/reference/new-14-desktop-after-input.png) :
    // f1=1000 et f9=400 seuls → « Chiffrage incomplet ».
    expect(financeKpis({ f1: 1000, f9: 400 })).toBeNull();
    expect(financeKpis({ f1: 1, f2: 2, f3: 3, f4: 4, f5: 5, f6: 6, f9: 7, f10: "" })).toBeNull();
    expect(financeKpis({ f1: 1, f2: 2, f3: 3, f4: 4, f5: 5, f6: 6, f9: 7, f10: "abc" })).toBeNull();
  });

  it("additionne les six postes d'investissement, le financement et le solde (données P.118 de l'exemple)", () => {
    const k = financeKpis({ f1: 3200000, f2: 13500000, f3: 1600000, f4: 1200000, f5: 2000000, f6: 2500000, f7: 1400000, f8: 3600000, f9: 10000000, f10: 14000000 });
    expect(k).toEqual({ investissement: 24000000, financement: 24000000, solde: 0 });
  });

  it("accepte les nombres saisis sous forme de texte et des postes à zéro explicites", () => {
    expect(financeKpis({ f1: "100", f2: "0", f3: 0, f4: 0, f5: 0, f6: 0, f9: "50", f10: 0 })).toEqual({ investissement: 100, financement: 50, solde: -50 });
  });
});

describe("scoreKpis — étape 17", () => {
  it("moyenne les critères notés de 1 à 5 et ignore les autres", () => {
    expect(scoreKpis({})).toEqual({ average: null, count: 0, of: 8 });
    expect(scoreKpis({ f1: 4, f2: 2, f3: 4, f4: 2, f5: 3, f6: 4, f7: 2, f8: 2 })).toEqual({ average: 2.875, count: 8, of: 8 });
    expect(scoreKpis({ f1: 5, f2: 0, f3: 6, f4: "3" })).toEqual({ average: 4, count: 2, of: 8 });
  });
});

describe("décision — étape 19", () => {
  it("n'admet que les quatre issues du prototype", () => {
    expect(isDecisionChoice("GO sous conditions")).toBe(true);
    expect(isDecisionChoice("Peut-être")).toBe(false);
  });
});
