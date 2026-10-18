import { describe, expect, it } from "vitest";
import { comparerDocumentsStudio, newStudioDocument, type StudioDocument } from "@parcours/atelier-model";
import { superposition } from "./superposition";

const doc = (objects: StudioDocument["objects"]): StudioDocument => ({ ...newStudioDocument("d"), objects });

describe("superposition de comparaison Studio", () => {
  it("gris pour l'avant, vert pour l'ajouté, rouge pour le supprimé, orange pour le modifié ; y retourné", () => {
    const a = doc([
      { id: "garde", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { id: "part", type: "line", start: { x: 0, y: 1 }, end: { x: 1, y: 1 } },
      { id: "bouge", type: "rectangle", origin: { x: 0, y: 2 }, width: 2, height: 1 },
    ]);
    const b = doc([
      { id: "garde", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { id: "bouge", type: "rectangle", origin: { x: 3, y: 2 }, width: 2, height: 1 },
      { id: "neuf", type: "line", start: { x: 0, y: 4 }, end: { x: 2, y: 4 } },
    ]);
    const s = superposition(comparerDocumentsStudio(a, b));
    expect(s.traces.map((t) => [t.id, t.couche])).toEqual([["bouge", "avant"], ["garde", "avant"], ["part", "supprime"], ["bouge", "modifie"], ["neuf", "ajoute"]]);
    expect(s.traces.find((t) => t.couche === "modifie")!.forme).toEqual({ kind: "rectangle", x: 3, y: -3, w: 2, h: 1 });
    expect(s.traces.find((t) => t.id === "neuf")!.forme).toEqual({ kind: "ligne", x1: 0, y1: -4, x2: 2, y2: -4 });
    expect(s.viewBox).toBe("-0.25 -4.25 5.5 4.5");
    expect(new Set(s.traces.map((t) => t.cle)).size).toBe(s.traces.length);
  });

  it("aucun objet : aucun cadre", () => {
    expect(superposition(comparerDocumentsStudio(doc([]), doc([])))).toEqual({ traces: [], viewBox: null });
  });
});
