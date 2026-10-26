/**
 * EX-080 — rapport de transformation (lot PUB) : l'import DXF et les exports SVG / DXF / IFC déclarent leurs unités et
 * leurs repères source et cible, avec la conversion appliquée ; une unité inconnue n'est jamais remplacée, une entité
 * non prise est rapportée. Données synthétiques.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "./document-2d.js";
import { STUDIO_FORMATS_ECHANGE, studioRapportFidelite } from "./echanges/rapport-fidelite.js";
import { dxf, ligne } from "./import-dxf.fixtures.js";
import { lireDxfStudio } from "./import-dxf.js";

describe("EX-080 — repères source / cible des rapports d'import et d'export", () => {
  it("EX-080 [+] import DXF en millimètres : repère WCS du fichier vers local-2d en mètres, facteur exact, sans translation ni rotation, Z ignoré", () => {
    const r = lireDxfStudio(dxf({ insunits: 4, entites: [ligne(0, 0, 1000, 0), "0\r\nTEXT\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n40\r\n2.5\r\n1\r\nx"] }));
    expect(r.statut).toBe("pret");
    expect(r.rapport.reperes).toEqual({ source: { repere: "dxf-wcs", unite: "mm", espace: "objet" }, cible: { repere: "local-2d", unite: "m" }, echelle: 0.001, translation: { x: 0, y: 0 }, rotation: 0, z: "ignore" });
    expect(r.rapport.nonPris).toEqual([{ type: "TEXT", nombre: 1 }]);
  });

  it("EX-080 [−] unité inconnue : le repère source garde une unité nulle, aucun facteur n'est substitué, aucune commande", () => {
    const r = lireDxfStudio(dxf({ entites: [ligne(0, 0, 1, 0)] }));
    expect(r.statut).toBe("unite-inconnue");
    expect(r.rapport.reperes.source.unite).toBeNull();
    expect(r.rapport.reperes.echelle).toBeNull();
    expect(r.commandes).toEqual([]);
  });

  it("EX-080 [+] chaque export déclare son repère source (local-2d, m) et son repère cible, sans géoréférencement", () => {
    const doc = applyStudioCommands(newStudioDocument("e"), [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } }] as StudioCommand[]);
    const cibles = Object.fromEntries(STUDIO_FORMATS_ECHANGE.map((f) => [f, studioRapportFidelite(doc, f).reperes]));
    expect(Object.values(cibles).every((r) => r.source.repere === "local-2d" && r.source.unite === "m" && r.cible.unite === "m" && r.georeferencement === "aucun")).toBe(true);
    expect(cibles["svg"]!.cible.repere).toBe("svg-utilisateur");
    expect(cibles["svg"]!.conversion).toMatch(/axe y retourné/);
    expect(cibles["dxf"]!.cible).toMatchObject({ repere: "dxf-wcs", declaration: "$INSUNITS = 6 (mètre)" });
    expect(cibles["ifc"]!.source.derive3d).toBe("local-3d");
  });
});
