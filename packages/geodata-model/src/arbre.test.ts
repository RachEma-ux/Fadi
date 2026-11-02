import { describe, expect, it } from "vitest";
import { arbreIndicateurs, normaliserRecherche } from "./dimensions.js";

const ind = (id: string, theme: string | null, famille: string | null, modalite: string | null = null, unite = "%") =>
  ({ id, titre: famille ?? id, theme, famille, modalite, milieu: null, sexe: null, unite });

const liste = [
  ind("a", "Démographie", "Population légale", null, "personnes"),
  ind("b", "Démographie", "Population par âge", "0-4 ans"),
  ind("c", "Démographie", "Population par âge", "5-9 ans"),
  ind("d", "Activité", "Taux de chômage"),
  ind("e", "Logement urbain", "Âge du logement", "Moins de 10 ans"),
  ind("f", null, null),
];

describe("arbre d'indicateurs (lot F, D-GD-26)", () => {
  it("sans recherche : tous les thèmes et familles, dans l'ordre reçu, effectifs des déclinaisons", () => {
    const a = arbreIndicateurs(liste);
    expect(a.map((b) => b.theme)).toEqual(["Démographie", "Activité", "Logement urbain", "Autres indicateurs"]);
    expect(a[0]!.familles.map((f) => f.famille)).toEqual(["Population légale", "Population par âge"]);
    expect(a[0]!.effectif).toBe(3);
  });
  it("recherche sans accents ni casse, tous les mots, sur thème, famille, modalité et unité", () => {
    expect(arbreIndicateurs(liste, "AGE").flatMap((b) => b.familles.map((f) => f.famille))).toEqual(["Population par âge", "Âge du logement"]);
    expect(arbreIndicateurs(liste, "âge logement").flatMap((b) => b.familles.map((f) => f.famille))).toEqual(["Âge du logement"]);
    expect(arbreIndicateurs(liste, "0-4").flatMap((b) => b.familles.map((f) => f.famille))).toEqual(["Population par âge"]);
    expect(arbreIndicateurs(liste, "demographie personnes").flatMap((b) => b.familles.map((f) => f.famille))).toEqual(["Population légale"]);
    expect(arbreIndicateurs(liste, "chomage")[0]!.theme).toBe("Activité");
    expect(arbreIndicateurs(liste, "introuvable")).toEqual([]);
    expect(arbreIndicateurs(liste, "   ")).toHaveLength(4);
  });
  it("normalisation", () => expect(normaliserRecherche("  Taux de Chômage (%) — Rural ")).toBe("taux de chomage % rural"));
});
