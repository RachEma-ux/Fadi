import { describe, expect, it } from "vitest";
import {
  applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument,
  type StudioCommand, type StudioDocument, type StudioLine, type StudioRectangle,
} from "./document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "./export.js";
import { STUDIO_FRAME_3D, studioLocal2dVers3d, studioMesh3d } from "./mesh-3d.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOLS } from "./registry.js";

const line = (): StudioLine => ({ id: "mur", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } });
const rect = (): StudioRectangle => ({ id: "piece", type: "rectangle", origin: { x: 1, y: 1 }, width: 3, height: 2 });
const doc = (): StudioDocument => ({ ...newStudioDocument("d"), objects: [line(), rect()] });
const unchecked = (c: unknown) => c as StudioCommand[];
const refuses = (d: StudioDocument, c: unknown) => expect(() => applyStudioCommands(d, unchecked(c))).toThrow(StudioValidationError);

describe("Studio : extrusion déclarée (studio.objet.extruder / studio.objet.aplatir)", () => {
  it("pose les seules valeurs saisies, épaisseur pour les lignes, et les retire", () => {
    const d = applyStudioCommands(doc(), [
      { toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 2.5, thickness: 0.2 } },
      { toolId: "studio.objet.extruder", params: { ids: ["piece"], base: -0.5, height: 3 } },
    ]);
    expect(d.objects[0]).toEqual({ ...line(), extrusion: { base: 0, height: 2.5, thickness: 0.2 } });
    expect(d.objects[1]).toEqual({ ...rect(), extrusion: { base: -0.5, height: 3 } });
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
    // Sans épaisseur : rien n'est supposé.
    const sans = applyStudioCommands(doc(), [{ toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 2 } }]);
    expect(sans.objects[0]!.extrusion).toEqual({ base: 0, height: 2 });
    const plat = applyStudioCommands(d, [{ toolId: "studio.objet.aplatir", params: { ids: ["mur", "piece"] } }]);
    expect(plat).toEqual(doc());
  });

  it("refuse hauteur nulle ou non finie, épaisseur non positive, épaisseur d'un rectangle, cote, calque verrouillé", () => {
    for (const params of [
      { ids: ["mur"], base: 0, height: 0 }, { ids: ["mur"], base: 0, height: -1 }, { ids: ["mur"], base: 0, height: Number.POSITIVE_INFINITY },
      { ids: ["mur"], base: Number.NaN, height: 1 }, { ids: ["mur"], base: 0, height: 1, thickness: 0 }, { ids: ["mur"], base: 0, height: 1, thickness: -0.2 },
      { ids: ["piece"], base: 0, height: 1, thickness: 0.2 }, { ids: ["mur"], base: 0 }, { ids: [], base: 0, height: 1 },
      { ids: ["inconnu"], base: 0, height: 1 }, { ids: ["mur"], base: 0, height: 1, autre: 1 }, { ids: ["mur"], base: 1e308, height: 1e308 },
    ]) refuses(doc(), [{ toolId: "studio.objet.extruder", params }]);
    const cote = applyStudioCommands(doc(), [{ toolId: "studio.dessin.cote", params: { id: "c", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 1, links: { start: null, end: null }, toResolve: false } }]);
    refuses(cote, [{ toolId: "studio.objet.extruder", params: { ids: ["c"], base: 0, height: 1 } }]);
    const verrou = applyStudioCommands(doc(), [
      { toolId: "studio.calque.creer", params: { id: "L", name: "Murs", visible: true, locked: false } },
      { toolId: "studio.objet.calque", params: { ids: ["mur"], layerId: "L" } },
      { toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 2 } },
      { toolId: "studio.calque.modifier", params: { id: "L", name: "Murs", visible: true, locked: true } },
    ]);
    refuses(verrou, [{ toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 3 } }]);
    refuses(verrou, [{ toolId: "studio.objet.aplatir", params: { ids: ["mur"] } }]);
    // Aplatir un objet non extrudé est refusé (aucun effet silencieux).
    refuses(doc(), [{ toolId: "studio.objet.aplatir", params: { ids: ["piece"] } }]);
    // Document : extrusion invalide refusée à la lecture.
    for (const extrusion of [{ base: 0, height: 0 }, { base: 0 }, { base: 0, height: 1, thickness: 0 }, { base: 0, height: 1, extra: 1 }]) {
      expect(() => validateStudioDocument({ ...doc(), objects: [{ ...line(), extrusion }] })).toThrow(StudioValidationError);
    }
    expect(() => validateStudioDocument({ ...doc(), objects: [{ ...rect(), extrusion: { base: 0, height: 1, thickness: 0.2 } }] })).toThrow(StudioValidationError);
  });

  it("rétrocompatible : un document V1 sans extrusion reste identique ; l'extrusion suit déplacer et modifier", () => {
    const v1 = JSON.parse(JSON.stringify(doc()));
    expect(validateStudioDocument(v1)).toEqual(v1);
    expect(Object.hasOwn(validateStudioDocument(v1).objects[0]!, "extrusion")).toBe(false);
    const d = applyStudioCommands(doc(), [
      { toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 2.5, thickness: 0.2 } },
      { toolId: "studio.dessin.deplacer", params: { id: "mur", dx: 1, dy: 0 } },
    ]);
    expect(d.objects[0]).toMatchObject({ start: { x: 1, y: 0 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } });
    // Les exports 2D ignorent l'extrusion (même SVG / DXF qu'à plat).
    const plat = applyStudioCommands(doc(), [{ toolId: "studio.dessin.deplacer", params: { id: "mur", dx: 1, dy: 0 } }]);
    expect(exportStudioSvg(d)).toBe(exportStudioSvg(plat));
    expect(exportStudioDxf(d)).toBe(exportStudioDxf(plat));
  });

  it("registre : deux mutations propres (icône, raccourci, barre « volume »), schéma de document additif", () => {
    const byId = Object.fromEntries(STUDIO_TOOLS.map((t) => [t.toolId, t]));
    expect(byId["studio.objet.extruder"]).toMatchObject({ raccourci: "Shift+E", iconeSymbolique: "studio-extrude", groupe: "volume", nature: "mutation", agentExposure: "none" });
    expect(byId["studio.objet.aplatir"]).toMatchObject({ raccourci: "Shift+F", iconeSymbolique: "studio-flatten", groupe: "volume", nature: "mutation", agentExposure: "none" });
    expect(STUDIO_COMMAND_TOOL_IDS).toContain("studio.objet.extruder");
    expect(STUDIO_COMMAND_TOOL_IDS).toContain("studio.objet.aplatir");
    const [l, r] = STUDIO_DOCUMENT_SCHEMA.properties.objects.items.oneOf;
    expect(l.required).not.toContain("extrusion");
    expect(l.properties.extrusion.properties.thickness.exclusiveMinimum).toBe(0);
    expect(Object.keys(r.properties.extrusion.properties)).toEqual(["base", "height"]);
  });
});

describe("Studio : géométrie 3D dérivée (studioMesh3d)", () => {
  it("conversion explicite local-2d → local-3d, z vers le haut", () => {
    expect(studioLocal2dVers3d({ x: 2, y: 3 }, 1.5)).toEqual({ x: 2, y: 3, z: 1.5 });
    const m = studioMesh3d(doc());
    expect(m.frame).toBe(STUDIO_FRAME_3D);
    expect(m).toMatchObject({ units: "m", source: { frame: "local-2d" }, solids: [], nonExtruded: 2, hidden: 0 });
    expect(m.outlines.flatMap((o) => o.points).every((p) => p.z === 0)).toBe(true);
    expect(m.outlines.find((o) => o.id === "piece")).toMatchObject({ closed: true });
    expect(m.outlines.find((o) => o.id === "piece")!.points).toHaveLength(4);
  });

  it("ligne + épaisseur = mur centré ; rectangle = prisme ; ligne sans épaisseur = surface", () => {
    const d = applyStudioCommands(doc(), [
      { toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 2.5, thickness: 0.2 } },
      { toolId: "studio.objet.extruder", params: { ids: ["piece"], base: 1, height: 2 } },
    ]);
    const m = studioMesh3d(d);
    expect(m.nonExtruded).toBe(0);
    const mur = m.solids.find((s) => s.id === "mur")!;
    expect(mur.kind).toBe("prism");
    expect(mur.vertices).toHaveLength(8);
    expect(mur.triangles).toHaveLength(12);
    expect(mur.edges).toHaveLength(12);
    const ys = mur.vertices.map((v) => v.y);
    expect(Math.min(...ys)).toBeCloseTo(-0.1, 12);
    expect(Math.max(...ys)).toBeCloseTo(0.1, 12);
    expect(new Set(mur.vertices.map((v) => v.z))).toEqual(new Set([0, 2.5]));
    // Faces extérieures : la somme des normales (aires orientées) est nulle et le volume est positif.
    const volume = mur.triangles.reduce((s, [a, b, c]) => {
      const p = mur.vertices[a]!, q = mur.vertices[b]!, r = mur.vertices[c]!;
      return s + (p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x)) / 6;
    }, 0);
    expect(volume).toBeCloseTo(4 * 0.2 * 2.5, 9);
    const piece = m.solids.find((s) => s.id === "piece")!;
    expect(new Set(piece.vertices.map((v) => v.z))).toEqual(new Set([1, 3]));
    expect(m.bounds).toEqual({ min: { x: 0, y: -0.1, z: 0 }, max: { x: 4, y: 3, z: 3 } });
    const surface = studioMesh3d(applyStudioCommands(doc(), [{ toolId: "studio.objet.extruder", params: { ids: ["mur"], base: 0, height: 2 } }]));
    expect(surface.solids[0]).toMatchObject({ id: "mur", kind: "wall-surface" });
    expect(surface.solids[0]!.triangles).toHaveLength(2);
    expect(surface.nonExtruded).toBe(1);
  });

  it("calques masqués : ni rendus ni comptés non extrudés ; document invalide refusé", () => {
    const d = applyStudioCommands(doc(), [
      { toolId: "studio.calque.creer", params: { id: "L", name: "Masqué", visible: false, locked: false } },
      { toolId: "studio.objet.calque", params: { ids: ["piece"], layerId: "L" } },
    ]);
    const m = studioMesh3d(d);
    expect([m.nonExtruded, m.hidden, m.outlines.map((o) => o.id)]).toEqual([1, 1, ["mur"]]);
    expect(studioMesh3d(newStudioDocument("vide")).bounds).toBeNull();
    expect(() => studioMesh3d({ ...doc(), frame: "local-3d" } as unknown as StudioDocument)).toThrow(StudioValidationError);
  });
});
