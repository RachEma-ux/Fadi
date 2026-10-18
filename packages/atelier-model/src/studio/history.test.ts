import { describe, expect, it } from "vitest";
import { newStudioDocument, STUDIO_CONTRACT, StudioValidationError, type StudioEnvelope, type StudioLine } from "./document-2d.js";
import {
  applyToStudioHistory, canRedoStudio, canUndoStudio, createStudioHistory, recordStudioHistory, redoStudioHistory,
  studioHistoryFromEnvelopes, undoStudioHistory,
} from "./history.js";

const line = (id: string, x = 0): StudioLine => ({ id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 1 } });
const envelope = (requestId: string, commands: StudioEnvelope["commands"]): StudioEnvelope => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId: "r0", commands });

describe("Historique Studio (annuler / rétablir)", () => {
  it("annule et rétablit un lot entier comme un seul pas", () => {
    const empty = newStudioDocument("d");
    let h = createStudioHistory(empty);
    expect(canUndoStudio(h)).toBe(false);
    h = applyToStudioHistory(h, [{ toolId: "studio.dessin.ligne", params: line("a") }, { toolId: "studio.dessin.ligne", params: line("b", 2) }]);
    h = applyToStudioHistory(h, [{ toolId: "studio.dessin.supprimer", params: { ids: ["a"] } }]);
    expect(h.present.objects.map((o) => o.id)).toEqual(["b"]);
    h = undoStudioHistory(h);
    expect(h.present.objects.map((o) => o.id)).toEqual(["a", "b"]);
    h = undoStudioHistory(h);
    expect(h.present).toEqual(empty);
    expect(undoStudioHistory(h)).toBe(h);
    h = redoStudioHistory(redoStudioHistory(h));
    expect(h.present.objects.map((o) => o.id)).toEqual(["b"]);
    expect(canRedoStudio(h)).toBe(false);
    expect(redoStudioHistory(h)).toBe(h);
  });

  it("un nouvel état abandonne le futur ; le passé est borné", () => {
    let h = createStudioHistory(newStudioDocument("d"));
    for (let i = 0; i < 5; i++) h = applyToStudioHistory(h, [{ toolId: "studio.dessin.ligne", params: line(`l${i}`, i) }], 3);
    expect(h.past).toHaveLength(3);
    h = undoStudioHistory(h);
    expect(canRedoStudio(h)).toBe(true);
    h = recordStudioHistory(h, newStudioDocument("d"));
    expect(canRedoStudio(h)).toBe(false);
    expect(() => recordStudioHistory(h, newStudioDocument("d"), 0)).toThrow(StudioValidationError);
  });

  it("un lot refusé laisse l’historique intact ; les états conservés sont des copies gelées", () => {
    const source = newStudioDocument("d");
    const h = createStudioHistory(source);
    expect(() => applyToStudioHistory(h, [{ toolId: "studio.dessin.supprimer", params: { ids: ["absent"] } }])).toThrow(StudioValidationError);
    expect(h.past).toHaveLength(0);
    source.objects.push(line("hors-historique"));
    expect(h.present.objects).toEqual([]);
    expect(Object.isFrozen(h.present.objects)).toBe(true);
    expect(() => createStudioHistory({ ...source, units: "mm" } as never)).toThrow(StudioValidationError);
  });

  it("rejoue des enveloppes appliquées : un pas par enveloppe", () => {
    const h = studioHistoryFromEnvelopes(newStudioDocument("d"), [
      envelope("q1", [{ toolId: "studio.dessin.ligne", params: line("a") }]),
      envelope("q2", [{ toolId: "studio.dessin.deplacer", params: { id: "a", dx: 1, dy: 0 } }]),
    ]);
    expect(h.past).toHaveLength(2);
    expect(h.present.objects[0]).toEqual(line("a", 1));
    expect(undoStudioHistory(h).present.objects[0]).toEqual(line("a"));
    expect(() => studioHistoryFromEnvelopes(newStudioDocument("d"), [{ ...envelope("q", []), contractVersion: "studio-commands/2" } as never])).toThrow(StudioValidationError);
  });
});
