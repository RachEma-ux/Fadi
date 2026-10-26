/**
 * X.1-01 (interface) — boîtes « Blocs » et « Contraintes » : commandes produites depuis la saisie et la sélection,
 * refus dits (jamais une valeur supposée), état des contraintes, rendu de la planche (insertions désignables, marques des
 * contraintes) et règle d'or des quatre outils (icône, barre, raccourci, alternative clavier).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import {
  commandeDefinirBloc, commandeEclater, commandeInsererBloc, commandePoserContrainte, commandeResoudre, commandeRetirerBloc, commandeRetirerContraintes, etatsContraintes,
  listeBlocs, NOMS_CONTRAINTES, NOMS_STATUTS_CONTRAINTE, precisionsPossibles, saisieDepuisInsertion, saisieDepuisSelection, SAISIE_INSERTION_INITIALE,
} from "./blocs-ui";
import { DialogueBlocs } from "./DialogueBlocs";
import { DialogueContraintes } from "./DialogueContraintes";
import { Dessin2D } from "../planche2d/Dessin2D";
import { CADRE_INITIAL, emprise } from "../planche2d/geometrie-2d";
import { insertionsPosees, selectionParRectangle, toutSelectionnable, commandesDeplacement } from "../planche2d/selection";
import { ALTERNATIVES_GESTES } from "../planche2d/alternatives-gestes";
import { cibleRaccourci, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { familleDeOutil } from "../planche2d/barre-compacte";

const ok = (r: { commandes: StudioCommand[] } | { erreur: string }): StudioCommand[] => { if ("erreur" in r) throw new Error(r.erreur); return r.commandes; };
const erreur = (r: { commandes: StudioCommand[] } | { erreur: string }): string => ("erreur" in r ? r.erreur : "");

function dessin(): StudioDocument {
  return applyStudioCommands(newStudioDocument("ui"), [
    { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 0.4 } } },
    { toolId: "studio.dessin.ligne", params: { id: "m", type: "line", start: { x: 0, y: 2 }, end: { x: 2, y: 2.9 } } },
    { toolId: "studio.dessin.cercle", params: { id: "c", type: "circle", center: { x: 1, y: 1 }, radius: 0.3 } },
  ]);
}

describe("X.1-01 — boîte « Blocs » (définir, insérer, modifier la pose, éclater, retirer)", () => {
  it("X.1-01 interface blocs : définir depuis la sélection, insérer, modifier la pose, éclater et retirer — commandes du modèle, refus dits", () => {
    let d = dessin();
    // Refus dits : aucune forme sélectionnée, nom ou point de base absent.
    expect(erreur(commandeDefinirBloc(d, [], { nom: "B", x: "0", y: "0", remplacer: false }, { bloc: "b", insertion: "i" }))).toMatch(/^Sélectionnez d’abord/);
    expect(erreur(commandeDefinirBloc(d, ["l"], { nom: " ", x: "0", y: "0", remplacer: false }, { bloc: "b", insertion: "i" }))).toBe("Nom du bloc à saisir.");
    expect(erreur(commandeDefinirBloc(d, ["l"], { nom: "B", x: "", y: "0", remplacer: false }, { bloc: "b", insertion: "i" }))).toBe("Point de base (X, Y) à saisir, en mètres.");
    // Définir avec remplacement : les formes deviennent une insertion au point de base.
    d = applyStudioCommands(d, ok(commandeDefinirBloc(d, ["l", "c"], { nom: "Repère", x: "0", y: "0", remplacer: true }, { bloc: "b", insertion: "i0" })));
    expect(d.objects.map((o) => o.id)).toEqual(["m"]);
    expect(listeBlocs(d)).toEqual([{ id: "b", nom: "Repère", elements: 2, insertions: 1 }]);
    // Insérer (rotation en degrés, échelle, symétrie), sur le calque actif.
    expect(erreur(commandeInsererBloc(d, { ...SAISIE_INSERTION_INITIALE, bloc: "b" }, "i1", undefined))).toMatch(/sont à saisir/);
    d = applyStudioCommands(d, ok(commandeInsererBloc(d, { bloc: "b", x: "5", y: "1", rotation: "90", echelle: "2", symetrie: true }, "i1", undefined)));
    expect(d.insertions?.find((i) => i.id === "i1")).toMatchObject({ position: { x: 5, y: 1 }, echelle: 2, symetrie: true });
    expect(d.insertions!.find((i) => i.id === "i1")!.rotation).toBeCloseTo(Math.PI / 2, 12);
    // Nouvelle pose de l'insertion sélectionnée (pré-remplie depuis l'insertion, en degrés).
    expect(saisieDepuisInsertion(d, "i1")).toEqual({ bloc: "b", x: "5", y: "1", rotation: "90", echelle: "2", symetrie: true });
    d = applyStudioCommands(d, ok(commandeInsererBloc(d, { bloc: "b", x: "6", y: "1", rotation: "-90", echelle: "1", symetrie: false }, "i1", undefined, true)));
    expect(d.insertions?.find((i) => i.id === "i1")?.rotation).toBeCloseTo((3 * Math.PI) / 2, 12);
    // Redéfinir depuis une autre sélection : les deux insertions suivent.
    d = applyStudioCommands(d, ok(commandeDefinirBloc(d, ["m"], { nom: "Repère 2", x: "0", y: "2", remplacer: false }, { bloc: "b", insertion: "x" }, true)));
    for (const p of insertionsPosees(d)) expect(p.formes.map((o) => o.type)).toEqual(["line"]);
    // Éclater l'insertion sélectionnée ; retirer la définition refusé tant qu'elle est insérée.
    expect(erreur(commandeEclater(d, ["m"]))).toMatch(/^Sélectionnez d’abord/);
    expect(erreur(commandeRetirerBloc(d, "b"))).toMatch(/encore inséré/);
    d = applyStudioCommands(d, ok(commandeEclater(d, ["i0", "i1"])));
    expect(d.objects.map((o) => o.id)).toEqual(["m", "i0.m", "i1.m"]);
    d = applyStudioCommands(d, ok(commandeRetirerBloc(d, "b")));
    expect(d).not.toHaveProperty("blocs");
  });

  it("X.1-01 interface blocs : une insertion se sélectionne (clic, rectangle, tout sélectionner), se déplace et compte dans le cadrage ; la planche la dessine", () => {
    const d = applyStudioCommands(dessin(), [
      { toolId: "studio.bloc.definir", params: { id: "b", nom: "Repère", base: { x: 0, y: 0 }, objets: ["c"] } },
      { toolId: "studio.bloc.inserer", params: { id: "i", type: "insertion", bloc: "b", position: { x: 20, y: 20 }, rotation: 0, echelle: 1 } },
    ]);
    expect(toutSelectionnable(d)).toContain("i");
    expect(selectionParRectangle(d, { x: 19, y: 19 }, { x: 23, y: 23 })).toEqual(["i"]);
    expect(commandesDeplacement(d, ["i"], 1, 0).commandes).toEqual([{ toolId: "studio.dessin.deplacer", params: { id: "i", dx: 1, dy: 0 } }]);
    expect(emprise(d, () => true)!.max).toEqual({ x: 21.3, y: 21.3 });
    const html = renderToStaticMarkup(createElement(Dessin2D, {
      svgRef: null, doc: d, cadre: CADRE_INITIAL, pas: 1, outil: "studio.dessin.selection", selection: new Set(["i"]), trace: null, survol: null, rectangle: null, glissement: false,
      clicsVersPlanche: () => false, surPlanche: () => {}, surSurvol: () => {}, surPointeurBas: () => {}, surPointeurHaut: () => {}, surClicCapture: () => {}, surSelection: () => {},
    }));
    expect(html).toMatch(/data-studio-insertion="i"[^>]*data-studio-bloc="b"/);
    expect(html).toMatch(/class="studio-shape studio-insertion selected"/);
    expect(html).toContain('cx="21" cy="21" r="0.3"');
    const boite = renderToStaticMarkup(createElement(DialogueBlocs, { doc: d, modifiable: true, layerId: undefined, selection: ["i"], surAppliquer: () => true, surFermer: () => {} }));
    expect(boite).toContain('data-studio-bloc="b" data-studio-bloc-insertions="1"');
    expect(boite).toContain("Appliquer la pose à l’insertion sélectionnée");
  });
});

describe("X.1-01 — boîte « Contraintes » (poser, état, résoudre, retirer)", () => {
  it("X.1-01 interface contraintes : poser depuis la sélection et résoudre, refus de l'insatisfaisable dit, état « à résoudre » affiché puis résolu", () => {
    let d = dessin();
    const s = saisieDepuisSelection(d, ["l", "m"], "parallele");
    expect(s.cibles.map((c) => c.objet)).toEqual(["l", "m"]);
    d = applyStudioCommands(d, ok(commandePoserContrainte(d, s, "pa")));
    expect(etatsContraintes(d).map((e) => [e.id, e.libelle, e.statut])).toEqual([["pa", "Parallélisme", "satisfaite"]]);
    // Distance : valeur à saisir, jamais supposée ; puis posée sur le segment seul (second objet vide).
    const dist = { ...saisieDepuisSelection(d, ["l"], "distance") };
    expect(erreur(commandePoserContrainte(d, dist, "di"))).toBe("Distance à saisir, en mètres : aucune valeur n’est supposée.");
    d = applyStudioCommands(d, ok(commandePoserContrainte(d, { ...dist, valeur: "3" }, "di")));
    expect(etatsContraintes(d).find((e) => e.id === "di")?.libelle).toBe("Distance fixée 3 m");
    // Horizontale puis verticale du même segment : insatisfaisable, refusé avec son motif.
    d = applyStudioCommands(d, ok(commandePoserContrainte(d, saisieDepuisSelection(d, ["l"], "horizontal"), "h")));
    expect(erreur(commandePoserContrainte(d, saisieDepuisSelection(d, ["l"], "vertical"), "v"))).toMatch(/^Contrainte : Système de contraintes insatisfaisable/);
    // Sur-contrainte : un second parallélisme identique.
    expect(erreur(commandePoserContrainte(d, s, "pa2"))).toMatch(/^Contrainte : Sur-contrainte : pa2 est redondante/);
    // Une rotation rompt les contraintes de la ligne : « À résoudre » affiché, puis résolu sur demande.
    d = applyStudioCommands(d, [{ toolId: "studio.dessin.rotation", params: { ids: ["m"], center: { x: 0, y: 2 }, angle: 0.4 } }]);
    expect(etatsContraintes(d).find((e) => e.id === "pa")?.statut).toBe("a-resoudre");
    const html = renderToStaticMarkup(createElement(DialogueContraintes, { doc: d, modifiable: true, selection: [], surAppliquer: () => true, surFermer: () => {} }));
    expect(html).toContain('data-studio-contrainte="pa" data-studio-contrainte-statut="a-resoudre"');
    expect(erreur(commandeResoudre(d, []))).toBe("Cochez d’abord les contraintes à résoudre.");
    d = applyStudioCommands(d, ok(commandeResoudre(d, ["pa"])));
    expect(etatsContraintes(d).every((e) => e.statut === "satisfaite")).toBe(true);
    d = applyStudioCommands(d, ok(commandeRetirerContraintes(d, ["di"])));
    expect(etatsContraintes(d).map((e) => e.id)).toEqual(["pa", "h"]);
    // Précisions d'une polyligne : segments droits seulement ; points d'une ligne : début et fin.
    expect(precisionsPossibles(d, "l", true).map((p) => p.valeur)).toEqual(["debut", "fin"]);
    // Planche : une marque par contrainte, rouge quand elle est à résoudre.
    const rompu = applyStudioCommands(d, [{ toolId: "studio.dessin.rotation", params: { ids: ["l"], center: { x: 0, y: 0 }, angle: 0.2 } }]);
    const planche = renderToStaticMarkup(createElement(Dessin2D, {
      svgRef: null, doc: rompu, cadre: CADRE_INITIAL, pas: 1, outil: "studio.dessin.selection", selection: new Set(), trace: null, survol: null, rectangle: null, glissement: false,
      clicsVersPlanche: () => false, surPlanche: () => {}, surSurvol: () => {}, surPointeurBas: () => {}, surPointeurHaut: () => {}, surClicCapture: () => {}, surSelection: () => {},
    }));
    expect(planche).toMatch(/class="studio-contrainte-marque a-resoudre" data-studio-contrainte-marque="h"/);
  });

  it("X.1-01 interface : règle d'or des quatre outils (icône, barre, raccourci libre et non réservé, alternative clavier) ; textes traduits", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const outils = STUDIO_TOOLS.filter((x) => x.groupe === "blocs" || x.groupe === "contraintes");
    expect(outils.map((x) => [x.toolId, x.raccourci])).toEqual([["studio.bloc.definir", "Shift+F1"], ["studio.bloc.inserer", "Shift+F3"], ["studio.bloc.eclater", "Ctrl+F12"], ["studio.contrainte.poser", "Ctrl+F1"]]);
    for (const o of outils) {
      expect(cibleRaccourci(o.raccourci)).toEqual({ type: "outil", toolId: o.toolId });
      expect(RACCOURCIS_RESERVES).not.toContain(o.raccourci);
      expect(ALTERNATIVES_GESTES[o.toolId]?.moyens).toEqual(["bouton-raccourci"]);
      expect(t.traduire(o.libelleFR), o.libelleFR).not.toBe(o.libelleFR);
    }
    expect([familleDeOutil("studio.bloc.definir"), familleDeOutil("studio.contrainte.poser")]).toEqual(["dessin", "modification"]);
    for (const s of [...Object.values(NOMS_CONTRAINTES), ...Object.values(NOMS_STATUTS_CONTRAINTE)]) expect(t.traduire(s), s).not.toBe(s);
  });
});
