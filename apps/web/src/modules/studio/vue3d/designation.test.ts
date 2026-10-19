/**
 * Désignation 3D (contrat de `picking.ts`) : objet présent, calque affiché et déverrouillé.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import { architectureDesignable, estOuverture, solidesDesignables } from "./designation";
import { designer } from "./picking";

const boite = (id: string, layerId?: string): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", ...(layerId ? { layerId } : {}), placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } });
const calque = (id: string, locked: boolean, visible = true): StudioCommand => ({ toolId: "studio.calque.modifier", params: { id, name: id, visible, locked } });

const modele = () => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.calque.creer", params: { id: "a", name: "a", visible: true, locked: false } },
  { toolId: "studio.calque.creer", params: { id: "b", name: "b", visible: true, locked: false } },
  boite("libre", "a"), boite("derriere", "b"),
  { toolId: "studio.architecture.mur", params: { id: "m", type: "wall", layerId: "a", axis: [{ x: 0, y: 4 }, { x: 6, y: 4 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.architecture.ouverture", params: { id: "o", type: "opening", hostId: "m", position: 1, width: 1, height: 2, sill: 0 } },
]);

describe("désignation 3D : calque affiché et déverrouillé", () => {
  it("solide libre sur un calque verrouillé : jamais désigné, l'objet derrière l'est", () => {
    const d = modele();
    expect(solidesDesignables(d)("libre")).toBe(true);
    const verrou = applyStudioCommands(d, [calque("a", true)]);
    const ok = solidesDesignables(verrou);
    expect(ok("libre")).toBe(false);
    expect(ok("derriere")).toBe(true);
    expect(designer([{ distance: 1, id: "libre" }, { distance: 2, id: "derriere" }], ok)).toEqual({ id: "derriere", distance: 2 });
    expect(designer([{ distance: 1, id: "libre" }], ok)).toBeNull();
    // Calque masqué : pas désignable non plus ; solide supprimé : jamais.
    expect(solidesDesignables(applyStudioCommands(d, [calque("a", false, false)]))("libre")).toBe(false);
    expect(solidesDesignables(applyStudioCommands(d, [{ toolId: "studio.solide.supprimer", params: { ids: ["libre"] } }]))("libre")).toBe(false);
  });

  it("mur et ouverture : calque du mur hôte, affichés dans le maillage", () => {
    const d = modele();
    const affiches = new Set(["m", "o"]);
    expect([architectureDesignable(d, affiches)("m"), architectureDesignable(d, affiches)("o")]).toEqual([true, true]);
    expect(architectureDesignable(d, new Set(["m"]))("o")).toBe(false);
    const verrou = applyStudioCommands(d, [calque("a", true)]);
    expect([architectureDesignable(verrou, affiches)("m"), architectureDesignable(verrou, affiches)("o")]).toEqual([false, false]);
    expect([estOuverture(d)("o"), estOuverture(d)("m")]).toEqual([true, false]);
  });
});
