import { describe, expect, it } from "vitest";
import { controlerCoherence, estUniteDeCompte, partDansEnsemble, tableauCroise } from "./tableau-croise.js";
import type { Milieu, Sexe } from "./dimensions.js";

const ind = (milieu: Milieu, sexe: Sexe, valeur: number | null, motifAbsence: string | null = valeur === null ? "non-publiee" : null) =>
  ({ id: `${milieu}-${sexe}`, titre: "Population municipale", theme: "Démographie", famille: "Population municipale", modalite: null, milieu, sexe, valeur, motifAbsence });

const province = [
  ind("ensemble", "ensemble", 1487236), ind("ensemble", "masculin", 755166), ind("ensemble", "feminin", 732070),
  ind("urbain", "ensemble", 1397890), ind("urbain", "masculin", 708304), ind("urbain", "feminin", 689586),
  ind("rural", "ensemble", 89346), ind("rural", "masculin", 46862), ind("rural", "feminin", 42484),
];

describe("tableau croisé Milieu × Sexe (D-GD-39)", () => {
  it("lignes Urbain, Rural, puis Ensemble ; colonnes Ensemble, Masculin, Féminin ; lues des déclinaisons présentes", () => {
    const t = tableauCroise(province)!;
    expect(t.lignes).toEqual(["urbain", "rural", "ensemble"]);
    expect(t.colonnes).toEqual(["ensemble", "masculin", "feminin"]);
    expect(t.cellules[2]!.map((c) => c?.valeur)).toEqual([1487236, 755166, 732070]);
  });

  it("population légale (sans ventilation par sexe) : une seule colonne Ensemble", () => {
    const t = tableauCroise([ind("ensemble", "ensemble", 1494413), ind("urbain", "ensemble", 1402668), ind("rural", "ensemble", 91745)])!;
    expect(t.colonnes).toEqual(["ensemble"]);
    expect(t.lignes).toEqual(["urbain", "rural", "ensemble"]);
  });

  it("ligne entièrement sans objet masquée (Urbain d'une commune rurale) ; une donnée non publiée reste affichée", () => {
    const t = tableauCroise([
      ind("ensemble", "ensemble", 5000), ind("ensemble", "masculin", 2600), ind("ensemble", "feminin", null),
      ind("urbain", "ensemble", null, "sans-objet"), ind("urbain", "masculin", null, "sans-objet"), ind("urbain", "feminin", null, "sans-objet"),
      ind("rural", "ensemble", 5000), ind("rural", "masculin", 2600), ind("rural", "feminin", 2400),
    ])!;
    expect(t.lignes).toEqual(["rural", "ensemble"]);
    expect(t.cellules[1]![2]).toMatchObject({ valeur: null, motifAbsence: "non-publiee" });
  });

  it("famille à modalités ou valeur unique : pas de tableau croisé", () => {
    expect(tableauCroise([{ ...ind("ensemble", "ensemble", 1), modalite: "0-4 ans" }, { ...ind("urbain", "ensemble", 1), modalite: "0-4 ans" }])).toBeNull();
    expect(tableauCroise([ind("ensemble", "ensemble", 1)])).toBeNull();
  });

  it("cohérence : Urbain + Rural = Ensemble et Masculin + Féminin = Ensemble ; un écart est signalé, jamais corrigé", () => {
    expect(controlerCoherence(tableauCroise(province)!)).toEqual([]);
    // L'exemple du constat : Ensemble de la population légale face à Masculin / Féminin de la population municipale.
    const melange = province.map((i) => (i.milieu === "ensemble" && i.sexe === "ensemble" ? { ...i, valeur: 1494413 } : i));
    const ecarts = controlerCoherence(tableauCroise(melange)!);
    expect(ecarts).toContainEqual({ controle: "sexe", ou: "ensemble", somme: 1487236, total: 1494413 });
    expect(ecarts).toContainEqual({ controle: "milieu", ou: "ensemble", somme: 1487236, total: 1494413 });
    expect(melange.find((i) => i.milieu === "ensemble" && i.sexe === "ensemble")!.valeur).toBe(1494413);
  });

  it("unités de compte seulement ; part dans l'Ensemble de la colonne", () => {
    expect(estUniteDeCompte("personnes")).toBe(true);
    expect(estUniteDeCompte("ménages")).toBe(true);
    expect(estUniteDeCompte("%")).toBe(false);
    expect(estUniteDeCompte("personnes par ménage")).toBe(false);
    expect(estUniteDeCompte("ans")).toBe(false);
    const t = tableauCroise(province)!;
    expect(partDansEnsemble(t, 0, 0)).toBeCloseTo(1397890 / 1487236);
    expect(partDansEnsemble(t, 2, 1)).toBeCloseTo(1);
  });
});
