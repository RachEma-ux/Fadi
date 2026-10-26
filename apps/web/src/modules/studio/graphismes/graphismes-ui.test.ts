/**
 * Saisie des graphismes (EX-055) et du système de projet (EX-023) : commandes produites, refus dits, conversion
 * affichée avec sa trace ; aucune valeur supposée.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument } from "@parcours/atelier-model";
import { commandeGraphisme, commandeRetrait, commandeSystemeProjet, convertir, lirePoints, SAISIE_GRAPHISME_INITIALE, traitsPrevus } from "./graphismes-ui";

describe("Graphismes et système de projet : saisie", () => {
  it("spline, hachure et symbole saisis → commande studio.graphisme.creer appliquée par le brouillon ; opacité en pour cent", () => {
    const doc = newStudioDocument("d");
    const sp = commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, points: "0 0; 1 2; 3 2; 4 0" }, "g1", "default", doc);
    expect(sp).toEqual({ commandes: [{ toolId: "studio.graphisme.creer", params: { id: "g1", type: "spline", points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }] } }] });
    const ha = commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, type: "hachure", points: "0 0; 2 0; 2 2; 0 2", angle: "45", espacement: "0,25", opacite: "50" }, "g2", "plan", doc);
    expect("commandes" in ha && ha.commandes[0]!.params).toMatchObject({ type: "hachure", layerId: "plan", opacite: 0.5, espacement: 0.25 });
    const sy = commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, type: "symbole", symbole: "croix", x: "3", y: "4", rotation: "90", echelle: "2" }, "g3", undefined, doc);
    expect("commandes" in sy && sy.commandes[0]!.params).toMatchObject({ type: "symbole", symbole: "croix", position: { x: 3, y: 4 }, echelle: 2 });
    const d = applyStudioCommands(doc, [...("commandes" in sp ? sp.commandes : []), ...("commandes" in sy ? sy.commandes : [])]);
    expect(d.graphismes?.map((g) => g.id)).toEqual(["g1", "g3"]);
    expect(commandeRetrait(d, ["g3", "inconnu"])).toEqual([{ toolId: "studio.graphisme.retirer", params: { ids: ["g3"] } }]);
    expect(commandeRetrait(d, ["inconnu"])).toEqual([]);
  });

  it("refus dits : points illisibles, champs vides, opacité hors bornes, géométrie refusée par le modèle", () => {
    const doc = newStudioDocument("d");
    expect(commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, points: "0 0; a b" }, "x", undefined, doc)).toEqual({ erreur: "Points illisibles : écrivez « x y ; x y ; … » en mètres." });
    expect(commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, type: "hachure", points: "0 0; 1 0; 0 1" }, "x", undefined, doc)).toEqual({ erreur: "Angle et espacement des traits sont à saisir." });
    expect(commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, points: "0 0; 1 1; 2 2; 3 3", opacite: "0" }, "x", undefined, doc)).toEqual({ erreur: "Opacité : un pourcentage de 1 à 100 est attendu (100 = opaque)." });
    const r = commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, points: "0 0; 1 1; 2 2" }, "x", undefined, doc);
    expect("erreur" in r && r.erreur).toContain("Graphisme refusé : graphisme.points : 3n + 1 points");
    expect(commandeGraphisme({ ...SAISIE_GRAPHISME_INITIALE, type: "symbole" }, "x", undefined, doc)).toEqual({ erreur: "Position, rotation et échelle du symbole sont à saisir." });
    expect(lirePoints("1,5 2; 3 4,25")).toEqual([{ x: 1.5, y: 2 }, { x: 3, y: 4.25 }]);
    expect(traitsPrevus({ ...SAISIE_GRAPHISME_INITIALE, type: "hachure", points: "0 0; 2 0; 2 2; 0 2", angle: "0", espacement: "0.5" })).toBe(5);
  });

  it("système de projet : version suivante saisie, conversion du point avec la version employée ; sans déclaration, rien n'est converti", () => {
    const doc = newStudioDocument("d");
    expect(convertir(doc, "vers-projet", "1", "2")).toEqual({ erreur: "Système de projet non déclaré : aucune conversion n’est supposée." });
    const c = commandeSystemeProjet(doc, { x: "100", y: "200", rotation: "0" });
    expect(c).toEqual({ commandes: [{ toolId: "studio.repere.projet", params: { version: 1, origine: { x: 100, y: 200 }, rotation: 0 } }] });
    const d = applyStudioCommands(doc, "commandes" in c ? c.commandes : []);
    const p = convertir(d, "vers-projet", "1", "2");
    expect(p).toMatchObject({ repere: "projet", x: 101, y: 202, trace: { version: 1, de: "local-2d", vers: "projet" } });
    expect(convertir(d, "depuis-projet", "101", "202")).toMatchObject({ repere: "local-2d", x: 1, y: 2 });
    const c2 = commandeSystemeProjet(d, { x: "0", y: "0", rotation: "90" });
    expect("commandes" in c2 && c2.commandes[0]!.params).toMatchObject({ version: 2 });
    expect(commandeSystemeProjet(d, { x: "", y: "0", rotation: "0" })).toEqual({ erreur: "Origine (X, Y) et rotation du système de projet sont à saisir." });
  });
});
