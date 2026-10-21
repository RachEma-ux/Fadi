import { describe, expect, it } from "vitest";
import { JOURNAL_MAX, ajouterEntree, dernieresEntrees, formaterDateJournal, lireJournal, serialiserJournal, type EntreeJournal } from "./journal-planche";

const e = (min: number, description = "Ligne", sec = 0): EntreeJournal => ({ a: new Date(Date.UTC(2026, 9, 21, 12, min, sec)).toISOString(), auteur: "Vous", description });

describe("journal des modifications d'une Planche", () => {
  it("aller-retour ; un texte absent, d'un autre format ou mal formé donne un journal vide ; une entrée invalide est écartée", () => {
    const j = [e(0), e(5, "Rectangle")];
    expect(lireJournal(serialiserJournal(j))).toEqual(j);
    expect(lireJournal(null)).toEqual([]);
    expect(lireJournal("{")).toEqual([]);
    expect(lireJournal(JSON.stringify({ format: "autre", entrees: j }))).toEqual([]);
    expect(lireJournal(JSON.stringify({ format: "sandbox-planche-journal/1", entrees: [j[0], { a: "pas une date", auteur: "x", description: "y" }, 3] }))).toEqual([j[0]]);
  });
  it("même description à moins d'une minute : une seule entrée (la plus récente) ; sinon deux", () => {
    let j = ajouterEntree([], e(0, "Ligne", 0));
    j = ajouterEntree(j, e(0, "Ligne", 30));
    expect(j).toHaveLength(1);
    expect(j[0]!.a).toBe(e(0, "Ligne", 30).a);
    j = ajouterEntree(j, e(2, "Ligne"));
    expect(j).toHaveLength(2);
    j = ajouterEntree(j, e(2, "Rectangle", 10));
    expect(j).toHaveLength(3);
  });
  it("plafond de 200 entrées ; la page n'affiche que les 5 plus récentes, la plus récente d'abord", () => {
    let j: EntreeJournal[] = [];
    for (let i = 0; i < JOURNAL_MAX + 20; i++) j = ajouterEntree(j, { a: new Date(Date.UTC(2026, 9, 21, 0, i * 2)).toISOString(), auteur: "Vous", description: `Op ${i}` });
    expect(j).toHaveLength(JOURNAL_MAX);
    const d = dernieresEntrees(j);
    expect(d.map((x) => x.description)).toEqual(["Op 219", "Op 218", "Op 217", "Op 216", "Op 215"]);
    expect(dernieresEntrees([e(0)])).toHaveLength(1);
  });
  it("date « jj.mm.aaaa hh.mm » avec zéros", () => {
    const d = new Date(2026, 0, 5, 3, 7).toISOString();
    expect(formaterDateJournal(d)).toBe("05.01.2026 03.07");
    expect(formaterDateJournal("nope")).toBe("—");
  });
});
