import { describe, expect, it } from "vitest";
import { legendeLue } from "./legende-lue.js";
import type { ValeurIndicateur } from "./valeurs.js";

const v = (x: number): ValeurIndicateur => ({ valeur: x, motifAbsence: null });
const absente = (m: "secret-statistique" | "non-publiee"): ValeurIndicateur => ({ valeur: null, motifAbsence: m });
const valeurs = new Map<string, ValeurIndicateur>([["a", v(1)], ["b", v(5)], ["c", absente("secret-statistique")], ["d", absente("non-publiee")], ["e", absente("secret-statistique")]]);
const base = {
  indicateur: { titre: "Population", unite: "habitants", periode: "2024", nature: "source" as const },
  version: { periode: "2020", libelle: "RGPH 2024", attribution: "HCP", source: { titre: "Recensement" } },
  valeurs,
  entrees: [
    { classe: 0, couleur: "#ffffcc", libelle: "< 3", effectif: 1 },
    { classe: 1, couleur: "#800026", libelle: "≥ 3", effectif: 1 },
    { classe: "absente" as const, couleur: "#9e9e9e", libelle: "Valeur absente", effectif: 3 },
  ],
  classification: { methode: "quantiles" as const, classes: 2, palette: "jaune-rouge" as const, decision: "D-GD-55" },
  classeDe: new Map<string, number | "absente">([["a", 0], ["b", 1], ["c", "absente"], ["d", "absente"], ["e", "absente"]]),
  selection: null,
};

describe("légende lue (P9, carto-2 L1-L5)", () => {
  it("L1 : période de l'indicateur, sinon de la version, sinon non évaluée", () => {
    expect(legendeLue(base).periode).toEqual({ texte: "2024", origine: "indicateur" });
    expect(legendeLue({ ...base, indicateur: { ...base.indicateur, periode: null } }).periode).toEqual({ texte: "2020", origine: "version" });
    expect(legendeLue({ ...base, indicateur: { ...base.indicateur, periode: " " }, version: { ...base.version, periode: null } }).periode).toEqual({ texte: null, origine: "non-evaluee" });
  });
  it("L2 : classification nommée, nombre effectif, nature de la palette", () => {
    expect(legendeLue(base).classification).toEqual({ methode: "quantiles", classes: 2, palette: "jaune-rouge", decision: "D-GD-55", natureP: "sequentielle" });
  });
  it("L3 : absences ventilées par motif, dans l'ordre des motifs, sans ligne à zéro ; toutes les valeurs comptées une fois", () => {
    const l = legendeLue(base);
    expect(l.classes.map((c) => c.classe)).toEqual([0, 1]);
    expect(l.absences).toEqual({ effectif: 3, parMotif: [{ motif: "non-publiee", effectif: 1 }, { motif: "secret-statistique", effectif: 2 }] });
    expect(l.valeursLues).toBe(valeurs.size);
  });
  it("L4 : source et statut provisoire (seul critère : la qualification)", () => {
    expect(legendeLue(base).source).toEqual({ titre: "Recensement", libelle: "RGPH 2024", attribution: "HCP", provisoire: false, decision: null });
    expect(legendeLue({ ...base, version: { ...base.version, qualification: { etat: "provisoire", decision: "D-GD-54" } } }).source).toMatchObject({ provisoire: true, decision: "D-GD-54" });
  });
  it("L5 : lieu sélectionné dans sa classe, ou absent avec son motif ; null hors couche", () => {
    expect(legendeLue({ ...base, selection: "b" }).lieu).toEqual({ code: "b", classe: 1, motif: null });
    expect(legendeLue({ ...base, selection: "c" }).lieu).toEqual({ code: "c", classe: "absente", motif: "secret-statistique" });
    expect(legendeLue({ ...base, selection: "z" }).lieu).toBeNull();
    expect(legendeLue(base).lieu).toBeNull();
  });
});
