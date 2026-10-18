import { describe, expect, it } from "vitest";
import { comparerDocumentsStudio } from "./comparaison.js";
import { applyStudioCommands, newStudioDocument, type StudioDimension, type StudioDocument, type StudioLine, type StudioRectangle } from "./document-2d.js";

const line = (id: string, x = 0): StudioLine => ({ id, type: "line", start: { x, y: 0 }, end: { x: x + 5, y: 0 } });
const rect = (id: string): StudioRectangle => ({ id, type: "rectangle", origin: { x: 1, y: 1 }, width: 3, height: 2 });
const cote = (id: string): StudioDimension => ({
  id, type: "dimension", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, offset: -0.5,
  links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false,
});
const base = (): StudioDocument => ({
  ...newStudioDocument("doc-a"),
  objects: [line("l"), rect("r")],
  layers: [{ id: "murs", name: "Murs", visible: true, locked: false }],
  dimensions: [cote("c")],
});

describe("comparerDocumentsStudio", () => {
  it("deux documents identiques : tout est « identique », aucun compte de changement", () => {
    const d = comparerDocumentsStudio(base(), base());
    expect(d.identiques).toBe(true);
    expect(d.objets.map((o) => [o.id, o.etat])).toEqual([["l", "identique"], ["r", "identique"]]);
    expect(d.resume).toEqual({
      objets: { ajoute: 0, supprime: 0, modifie: 0, identique: 2, deplace: 0 },
      calques: { ajoute: 0, supprime: 0, modifie: 0, identique: 1, deplace: 0 },
      cotes: { ajoute: 0, supprime: 0, modifie: 0, identique: 1, deplace: 0 },
    });
  });

  it("deux documents vides : listes vides, identiques", () => {
    const d = comparerDocumentsStudio(newStudioDocument("a"), newStudioDocument("b"));
    expect(d).toEqual({ objets: [], calques: [], cotes: [], resume: d.resume, identiques: true });
    expect(d.resume.objets.identique).toBe(0);
  });

  it("ajouté, supprimé, déplacé, changement de calque et d'extrusion", () => {
    const a = base();
    const b = applyStudioCommands(a, [
      { toolId: "studio.dessin.ligne", params: line("n", 10) },
      { toolId: "studio.dessin.supprimer", params: { ids: ["c"] } },
      { toolId: "studio.dessin.deplacer", params: { id: "l", dx: 0.1, dy: -0.3 } },
      { toolId: "studio.objet.calque", params: { ids: ["r"], layerId: "murs" } },
      { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 0, height: 1 } },
    ]);
    const d = comparerDocumentsStudio(a, b);
    expect(d.identiques).toBe(false);
    expect(d.objets.map((o) => [o.id, o.etat, o.proprietes, o.deplacement])).toEqual([
      ["l", "modifie", ["geometrie"], { dx: 0.1, dy: -0.3 }],
      ["n", "ajoute", [], null],
      ["r", "modifie", ["calque", "extrusion"], null],
    ]);
    expect(d.cotes.map((c) => [c.id, c.etat])).toEqual([["c", "supprime"]]);
    expect(d.resume.objets).toEqual({ ajoute: 1, supprime: 0, modifie: 2, identique: 0, deplace: 1 });
    expect(d.resume.cotes).toEqual({ ajoute: 0, supprime: 1, modifie: 0, identique: 0, deplace: 0 });
  });

  it("modification de forme (pas une translation) : géométrie modifiée sans déplacement", () => {
    const a = base();
    const b = { ...a, objects: [{ ...line("l"), end: { x: 6, y: 1 } }, { ...rect("r"), origin: { x: 2, y: 1 }, width: 4 }] };
    const d = comparerDocumentsStudio(a, b);
    expect(d.objets.map((o) => [o.id, o.proprietes, o.deplacement])).toEqual([["l", ["geometrie"], null], ["r", ["geometrie"], null]]);
    const moved = comparerDocumentsStudio(a, { ...a, objects: [line("l"), { ...rect("r"), origin: { x: -1, y: 4 } }] });
    expect(moved.objets[1]!.deplacement).toEqual({ dx: -2, dy: 3 });
  });

  it("identifiant réutilisé avec un autre type : supprimé puis ajouté", () => {
    const a = base();
    const b = { ...a, objects: [{ ...rect("l") }, rect("r")] };
    const d = comparerDocumentsStudio(a, b);
    expect(d.objets.map((o) => [o.id, o.etat, o.type])).toEqual([["l", "supprime", "line"], ["l", "ajoute", "rectangle"], ["r", "identique", "rectangle"]]);
    expect(d.resume.objets).toEqual({ ajoute: 1, supprime: 1, modifie: 0, identique: 1, deplace: 0 });
  });

  it("calque implicite : `default` explicite ou absent ne compte pas comme un changement", () => {
    const a = { ...newStudioDocument("a"), objects: [line("l")] };
    const b = { ...a, objects: [{ ...line("l"), layerId: "default" }] };
    expect(comparerDocumentsStudio(a, b).objets[0]!.etat).toBe("identique");
  });

  it("calques : nom, visibilité, verrou ; ajout et suppression", () => {
    const a = base();
    const b = { ...a, layers: [{ id: "murs", name: "Murs porteurs", visible: false, locked: true }, { id: "z", name: "Z", visible: true, locked: false }] };
    const d = comparerDocumentsStudio(a, b);
    expect(d.calques.map((c) => [c.id, c.etat, c.proprietes])).toEqual([["murs", "modifie", ["nom", "visible", "verrouille"]], ["z", "ajoute", []]]);
    expect(comparerDocumentsStudio(b, a).calques.map((c) => c.etat)).toEqual(["modifie", "supprime"]);
  });

  it("cotes : translation, liens, décalage", () => {
    const a = base();
    const c = cote("c");
    const moved = { ...c, start: { x: 1, y: 2 }, end: { x: 6, y: 2 } };
    expect(comparerDocumentsStudio(a, { ...a, dimensions: [moved] }).cotes[0]).toMatchObject({ etat: "modifie", proprietes: ["geometrie"], deplacement: { dx: 1, dy: 2 } });
    expect(comparerDocumentsStudio(a, { ...a, dimensions: [{ ...c, offset: 1 }] }).cotes[0]).toMatchObject({ proprietes: ["geometrie"], deplacement: null });
    expect(comparerDocumentsStudio(a, { ...a, dimensions: [{ ...c, links: { start: null, end: c.links.end }, toResolve: true }] }).cotes[0]!.proprietes).toEqual(["liens"]);
  });

  it("déterministe et indépendant de l'ordre des tableaux ; entrées intactes", () => {
    const a = base();
    const b = applyStudioCommands(a, [{ toolId: "studio.dessin.ligne", params: line("b", 3) }, { toolId: "studio.dessin.ligne", params: line("a", 4) }]);
    const snapshot = JSON.stringify([a, b]);
    const d1 = comparerDocumentsStudio(a, b);
    const d2 = comparerDocumentsStudio(a, { ...b, objects: [...b.objects].reverse() });
    expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
    expect(d1.objets.map((o) => o.id)).toEqual(["a", "b", "l", "r"]);
    expect(JSON.stringify([a, b])).toBe(snapshot);
    d1.objets[0]!.apres!.id = "mutated";
    expect(b.objects.some((o) => o.id === "mutated")).toBe(false);
  });
});
