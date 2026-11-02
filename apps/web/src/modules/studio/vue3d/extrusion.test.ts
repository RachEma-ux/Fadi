import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormulaireExtrusion } from "./FormulaireExtrusion";
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
    expect(commandesExtrusion(doc(), ["l"], { base: 0, hauteur: 0, epaisseur: Number.NaN, direction: "+z" })).toHaveProperty("erreur");
    expect(commandesExtrusion(doc(), ["l"], { base: 0, hauteur: 2, epaisseur: 0, direction: "+z" })).toHaveProperty("erreur");
    expect(commandesExtrusion(doc(), ["c"], { base: 0, hauteur: 2, epaisseur: Number.NaN, direction: "+z" })).toEqual({ erreur: "Sélectionnez une ligne ou un rectangle à extruder." });
  });

  it("TEST-005 : la direction est demandée, jamais proposée ; −Z extrude sous la base, relue telle quelle", () => {
    expect(VALEURS_VIDES.direction).toBe("");
    expect(commandesExtrusion(doc(), ["r"], { base: 3, hauteur: 2, epaisseur: Number.NaN, direction: "" })).toEqual({ erreur: "Choisissez la direction d’extrusion : vers le haut (+Z) ou vers le bas (−Z)." });
    const r = commandesExtrusion(doc(), ["r"], { base: 3, hauteur: 2, epaisseur: Number.NaN, direction: "-z" });
    if (!("commandes" in r)) throw new Error("commandes attendues");
    expect(r.commandes).toEqual([{ toolId: "studio.objet.extruder", params: { ids: ["r"], base: 3, height: 2, direction: "-z" } }]);
    const d = applyStudioCommands(doc(), r.commandes);
    expect(valeursDe(d.objects[1]!)).toEqual({ base: 3, hauteur: 2, epaisseur: Number.NaN, direction: "-z" });
    const zs = studioMesh3d(d).solids[0]!.vertices.map((v) => v.z);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([1, 3]);
    // Extrudé avant le lot F1 (sans direction enregistrée) : affiché en +Z, son seul sens.
    expect(valeursDe({ id: "x", type: "rectangle", origin: { x: 0, y: 0 }, width: 1, height: 1, extrusion: { base: 0, height: 1 } })!.direction).toBe("+z");
    const html = renderToStaticMarkup(createElement(FormulaireExtrusion, { valeurs: VALEURS_VIDES, modifiable: true, formes: 1, extrudes: 0, surValeurs: () => {}, surExtruder: () => {}, surAplatir: () => {} }));
    expect(html).toMatch(/<select name="extrusion-direction" required=""[^>]*>/);
    expect(html).toContain('<option value="" selected="">Choisir la direction…</option>');
    expect(html).toContain("Vers le haut (+Z, normale du plan)");
    expect(html).toContain("Vers le bas (−Z)");
  });

  it("lignes avec épaisseur, rectangles sans ; les commandes s'appliquent au modèle", () => {
    const r = commandesExtrusion(doc(), ["l", "r", "c"], { base: 0, hauteur: 2.5, epaisseur: 0.2, direction: "+z" });
    if (!("commandes" in r)) throw new Error("commandes attendues");
    expect(r.commandes).toEqual([
      { toolId: "studio.objet.extruder", params: { ids: ["l"], base: 0, height: 2.5, thickness: 0.2, direction: "+z" } },
      { toolId: "studio.objet.extruder", params: { ids: ["r"], base: 0, height: 2.5, direction: "+z" } },
    ]);
    expect(r.info).toContain("rectangles");
    const d = applyStudioCommands(doc(), r.commandes);
    expect(valeursDe(d.objects[0]!)).toEqual({ base: 0, hauteur: 2.5, epaisseur: 0.2, direction: "+z" });
    expect(Number.isNaN(valeursDe(d.objects[1]!)!.epaisseur)).toBe(true);
    expect(studioMesh3d(d).nonExtruded).toBe(0);
    expect(commandesAplatir(d, ["l", "c"])).toEqual([{ toolId: "studio.objet.aplatir", params: { ids: ["l"] } }]);
    expect(commandesAplatir(doc(), ["l"])).toEqual([]);
    expect(valeursDe(doc().objects[0]!)).toBeNull();
  });
});
