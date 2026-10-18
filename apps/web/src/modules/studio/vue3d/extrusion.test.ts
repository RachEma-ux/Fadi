import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioMesh3d, type StudioDocument } from "@parcours/atelier-model";
import { commandesAplatir, commandesExtrusion, valeursDe, VALEURS_VIDES } from "./extrusion";

const doc = (): StudioDocument => ({
  ...newStudioDocument("d"),
  objects: [
    { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
    { id: "r", type: "rectangle", origin: { x: 0, y: 1 }, width: 2, height: 2 },
  ],
  dimensions: [{ id: "c", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 1, links: { start: null, end: null }, toResolve: false }],
});

describe("Studio : formulaire d'extrusion", () => {
  it("aucune valeur par défaut : base et hauteur vides bloquent l'extrusion", () => {
    expect(commandesExtrusion(doc(), ["l"], VALEURS_VIDES)).toEqual({ erreur: "Saisissez la base et la hauteur, en mètres." });
    expect(commandesExtrusion(doc(), ["l"], { ...VALEURS_VIDES, base: 0 })).toHaveProperty("erreur");
    expect(commandesExtrusion(doc(), ["l"], { base: 0, hauteur: 0, epaisseur: Number.NaN })).toHaveProperty("erreur");
    expect(commandesExtrusion(doc(), ["l"], { base: 0, hauteur: 2, epaisseur: 0 })).toHaveProperty("erreur");
    expect(commandesExtrusion(doc(), ["c"], { base: 0, hauteur: 2, epaisseur: Number.NaN })).toEqual({ erreur: "Sélectionnez une ligne ou un rectangle à extruder." });
  });

  it("lignes avec épaisseur, rectangles sans ; les commandes s'appliquent au modèle", () => {
    const r = commandesExtrusion(doc(), ["l", "r", "c"], { base: 0, hauteur: 2.5, epaisseur: 0.2 });
    if (!("commandes" in r)) throw new Error("commandes attendues");
    expect(r.commandes).toEqual([
      { toolId: "studio.objet.extruder", params: { ids: ["l"], base: 0, height: 2.5, thickness: 0.2 } },
      { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 0, height: 2.5 } },
    ]);
    expect(r.info).toContain("rectangles");
    const d = applyStudioCommands(doc(), r.commandes);
    expect(valeursDe(d.objects[0]!)).toEqual({ base: 0, hauteur: 2.5, epaisseur: 0.2 });
    expect(Number.isNaN(valeursDe(d.objects[1]!)!.epaisseur)).toBe(true);
    expect(studioMesh3d(d).nonExtruded).toBe(0);
    expect(commandesAplatir(d, ["l", "c"])).toEqual([{ toolId: "studio.objet.aplatir", params: { ids: ["l"] } }]);
    expect(commandesAplatir(doc(), ["l"])).toEqual([]);
    expect(valeursDe(doc().objects[0]!)).toBeNull();
  });
});
