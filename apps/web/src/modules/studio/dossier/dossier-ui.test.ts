import { describe, expect, it } from "vitest";
import { applyStudioCommands, bilanQuantitesStudio, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import { cibleRaccourci, COMMANDES_EDITEUR, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import {
  calquesProposes, corpsFeuille, deplacer, empreinteAbregee, libelleTotal, libelleVueSource, messageRefusDossier, numeroPropose, refusSaisie, resumeBilan,
  saisieInitiale,
} from "./dossier-ui";

const feuille = (numero: string) => ({ definition: { numero } }) as never;

describe("panneau « Feuilles et dossier » (E.3) — règles d'affichage", () => {
  it("commande : icône propre, barre Présentation, raccourci Ctrl+Maj+D unique et non réservé, lecture admise", () => {
    const c = COMMANDES_EDITEUR.find((x) => x.id === "dossier");
    expect(c).toMatchObject({ libelleFR: "Feuilles et dossier", raccourci: "Ctrl+Shift+D", iconeSymbolique: "studio-dossier", groupe: "presentation", ecrit: false });
    expect(cibleRaccourci("Ctrl+Shift+D")).toEqual({ type: "commande", id: "dossier" });
    expect(RACCOURCIS_RESERVES).not.toContain("Ctrl+Shift+D");
  });

  it("numéro proposé : premier « F-nn » libre ; saisie initiale A3 paysage ajustée, calques visibles", () => {
    expect(numeroPropose([])).toBe("F-01");
    expect(numeroPropose([feuille("F-01"), feuille("F-03")])).toBe("F-02");
    expect(saisieInitiale([])).toEqual({ numero: "F-01", titre: "", format: "A3", orientation: "paysage", echelle: "ajuster", calques: null, auteur: "" });
  });

  it("corps envoyé : champs nettoyés, calques et auteur seulement s'ils sont fournis ; refus avant l'envoi", () => {
    const s = { ...saisieInitiale([]), titre: "  Plan  ", auteur: " " };
    expect(corpsFeuille(s)).toEqual({ number: "F-01", title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" });
    expect(corpsFeuille({ ...s, calques: ["a"], auteur: "Équipe" })).toMatchObject({ layers: ["a"], author: "Équipe" });
    expect(refusSaisie({ ...s, titre: "" })).toMatch(/titre/);
    expect(refusSaisie({ ...s, numero: " " })).toMatch(/numéro/);
    expect(refusSaisie({ ...s, calques: [] })).toMatch(/calque/);
    expect(refusSaisie(s)).toBeNull();
  });

  it("calques proposés : calque implicite seulement s'il porte un élément ; ordre déplaçable", () => {
    const doc = applyStudioCommands(newStudioDocument("d"), [
      { toolId: "studio.calque.creer", params: { id: "c", name: "Cotes", visible: false, locked: false } },
    ] as StudioCommand[]);
    expect(calquesProposes(doc)).toEqual([{ id: "c", nom: "Cotes", visible: false }]);
    const avec = applyStudioCommands(doc, [{ toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] as StudioCommand[]);
    expect(calquesProposes(avec).map((c) => c.id)).toEqual(["default", "c"]);
    expect(deplacer(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(deplacer(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });

  it("bilan : brut, déductions et net distincts, partiel ou « non évalué » sans valeur inventée", () => {
    const doc = applyStudioCommands(newStudioDocument("m"), [
      { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
      { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
      { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 1 }, end: { x: 1, y: 1 } } },
    ] as StudioCommand[]);
    const r = resumeBilan(bilanQuantitesStudio(doc), "fr-FR");
    expect(r.brut).toBe("3,600 m³ (partiel : 1 non évalué)");
    expect(r.deduit).toBe("0,420 m³ (partiel : 1 non évalué)");
    expect(r.net).toBe("3,180 m³ (partiel : 1 non évalué)");
    expect(r).toMatchObject({ deductions: 1, coherent: true });
    expect(libelleTotal({ valeur: null, evalues: 0, nonEvalues: 2 }, "fr-FR")).toBe("non évalué");
    expect(empreinteAbregee(null)).toBe("non évalué");
    expect(empreinteAbregee("a".repeat(64))).toBe("a".repeat(16));
  });

  it("chaque libellé et chaque refus a sa traduction anglaise", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const libelles = [
      "Feuilles et dossier", libelleVueSource({ definition: { vueSource: { type: "planche-2d" } }, provenance: null } as never),
      libelleVueSource({ definition: { vueSource: { type: "planche-2d", calques: ["a"] } }, provenance: null } as never),
      refusSaisie({ ...saisieInitiale([]), titre: "" })!, refusSaisie({ ...saisieInitiale([]), numero: "" })!, refusSaisie({ ...saisieInitiale([]), titre: "x", calques: [] })!,
      libelleTotal({ valeur: 1.5, evalues: 1, nonEvalues: 1 }, "fr-FR"), libelleTotal({ valeur: 1.5, evalues: 1, nonEvalues: 2 }, "fr-FR"),
      ...[
        [409, { error: "sheet_number_taken" }], [409, { error: "sheet_in_dossier" }], [409, { error: "dossier_sheet_missing" }], [409, { error: "dossier_invalid" }],
        [409, { error: "archived" }], [400, { code: "sheet_view_invalid" }], [400, {}], [403, {}], [423, {}], [500, {}],
      ].map(([s, b]) => messageRefusDossier(s as number, b)),
    ];
    for (const l of libelles) expect(t.traduire(l), l).not.toBe(l);
  });
});
