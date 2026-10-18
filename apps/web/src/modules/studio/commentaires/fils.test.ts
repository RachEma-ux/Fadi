import { describe, expect, it } from "vitest";
import { newStudioDocument, type StudioDocument } from "@parcours/atelier-model";
import type { StudioComment } from "../../../lib/api";
import { ancrageSelection, objetsPresents, regrouperFils } from "./fils";

const c = (id: string, parentId: string | null = null, objectIds: string[] = []): StudioComment => ({
  id, variantId: "v", parentId, revisionId: null, objectIds, authorId: "u", authorEmail: "u@example.test", body: id,
  createdAt: "2026-10-18T00:00:00.000Z", deletedAt: null, mine: true,
});
const doc: StudioDocument = {
  ...newStudioDocument("d"),
  objects: [{ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }],
  dimensions: [{ id: "cote", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false }],
};

describe("Commentaires de Studio — lectures pures", () => {
  it("regroupe les fils dans l'ordre du serveur, sans rien omettre", () => {
    const fils = regrouperFils([c("a"), c("a1", "a"), c("b"), c("a2", "a"), c("orpheline", "inconnu")]);
    expect(fils.map((f) => [f.origine.id, f.reponses.map((r) => r.id)])).toEqual([["a", ["a1", "a2"]], ["b", []], ["orpheline", []]]);
  });

  it("ne cite que les objets et cotes de la révision enregistrée", () => {
    expect(ancrageSelection(["l", "brouillon", "cote"], doc)).toEqual({ citables: ["l", "cote"], nonEnregistres: ["brouillon"] });
  });

  it("sélectionne les objets cités encore présents et compte les disparus", () => {
    expect(objetsPresents(c("x", null, ["l", "disparu"]), doc)).toEqual({ presents: ["l"], absents: 1 });
  });
});
