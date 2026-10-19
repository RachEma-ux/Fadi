// Concurrence des écritures (A.5-06, A.5-08) : éléments modifiés et chevauchements entre un brouillon et la tête.
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "./document-2d.js";
import { studioChevauchements, studioElementsModifies } from "./concurrence.js";

const ligne = (id: string, x: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 0 } } });
const deplacer = (id: string, dx: number): StudioCommand => ({ toolId: "studio.dessin.deplacer", params: { id, dx, dy: 0 } });
const supprimer = (id: string): StudioCommand => ({ toolId: "studio.dessin.supprimer", params: { ids: [id] } });
const calque = (id: string, name: string): StudioCommand => ({ toolId: "studio.calque.creer", params: { id, name, visible: true, locked: false } });

const base = applyStudioCommands(newStudioDocument("doc"), [ligne("a", 0), ligne("b", 4)]);

describe("studioElementsModifies", () => {
  it("rend les clés ajoutées, supprimées et modifiées, triées, sans l'en-tête du document", () => {
    const apres = applyStudioCommands(base, [deplacer("a", 1), supprimer("b"), ligne("c", 8), calque("k", "Calque")]);
    expect(studioElementsModifies(base, apres)).toEqual(["layers:k", "objects:a", "objects:b", "objects:c"]);
    expect(studioElementsModifies(base, base)).toEqual([]);
  });
  it("ne modifie pas ses entrées", () => {
    const copie = structuredClone(base);
    studioElementsModifies(base, applyStudioCommands(base, [deplacer("a", 1)]));
    expect(base).toEqual(copie);
  });
});

describe("studioChevauchements", () => {
  it("aucun chevauchement quand les deux écritures touchent des éléments distincts", () => {
    const local = applyStudioCommands(base, [deplacer("a", 1)]);
    const tete = applyStudioCommands(base, [deplacer("b", 2), ligne("z", 20)]);
    expect(studioChevauchements(base, local, tete)).toEqual([]);
  });
  it("signale un élément modifié des deux côtés avec des résultats différents", () => {
    const local = applyStudioCommands(base, [deplacer("a", 1), deplacer("b", 1)]);
    const tete = applyStudioCommands(base, [deplacer("a", 2)]);
    expect(studioChevauchements(base, local, tete)).toEqual(["objects:a"]);
  });
  it("une suppression locale d'un élément modifié ailleurs est un chevauchement (jamais un écrasement silencieux)", () => {
    const local = applyStudioCommands(base, [supprimer("a")]);
    const tete = applyStudioCommands(base, [deplacer("a", 3)]);
    expect(studioChevauchements(base, local, tete)).toEqual(["objects:a"]);
  });
  it("un même changement fait des deux côtés n'est pas un chevauchement", () => {
    const local = applyStudioCommands(base, [deplacer("a", 1), supprimer("b")]);
    const tete = applyStudioCommands(base, [deplacer("a", 1), supprimer("b")]);
    expect(studioChevauchements(base, local, tete)).toEqual([]);
  });
});
