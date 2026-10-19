import { describe, expect, it } from "vitest";
import {
  applyStudioCommands, newStudioDocument, selectStudioShape, STUDIO_CONTRACT,
  StudioValidationError, validateStudioDocument,
  type StudioCommand, type StudioDocument, type StudioShape,
} from "./document-2d.js";
import { STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOLS } from "./registry.js";

const line = (): StudioShape => ({ id: "line-a", type: "line", start: { x: 0, y: 0 }, end: { x: 3, y: 2 } });
const rectangle = (): StudioShape => ({ id: "rectangle-a", type: "rectangle", origin: { x: 1, y: -2 }, width: 6, height: 2 });
const document = (): StudioDocument => ({ ...newStudioDocument("drawing-a"), objects: [line(), rectangle()] });
const unchecked = (commands: unknown): StudioCommand[] => commands as StudioCommand[];

describe("Studio : document 2D natif", () => {
  it("crée, déplace, édite et rouvre sans niveau, maillage ou modèle 3D", () => {
    const initial = newStudioDocument("drawing-a");
    const commands = unchecked([
      { toolId: "studio.dessin.ligne", params: line() },
      { toolId: "studio.dessin.rectangle", params: rectangle() },
      { toolId: "studio.dessin.deplacer", params: { id: "rectangle-a", dx: 2, dy: 4 } },
      { toolId: "studio.dessin.modifier", params: { ...line(), end: { x: 5, y: 4 } } },
    ]);
    const result = applyStudioCommands(initial, commands);
    expect(result).toEqual({ ...initial, objects: [
      { ...line(), end: { x: 5, y: 4 } },
      { ...rectangle(), origin: { x: 3, y: 2 } },
    ] });
    expect(initial.objects).toEqual([]);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(STUDIO_CONTRACT).toBe("studio-commands/1");
  });

  it("ne partage aucune référence modifiable avec les entrées ou une sélection", () => {
    const original = document();
    const result = applyStudioCommands(original, [{ toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: -1 } }]);
    const selected = selectStudioShape(result, "rectangle-a");
    if (!selected || selected.type !== "rectangle") throw new Error("rectangle absent");
    selected.origin.x = 90;
    expect(result.objects[1]).toEqual(rectangle());
    expect(original).toEqual(document());
    expect(result.objects[0]).toEqual({ ...line(), start: { x: 1, y: -1 }, end: { x: 4, y: 1 } });
    expect(selectStudioShape(result, "inexistant")).toBeNull();
    const source = line();
    const created = applyStudioCommands(newStudioDocument("d"), unchecked([{ toolId: "studio.dessin.ligne", params: source }]));
    if (source.type === "line") source.start.x = 200;
    expect(created.objects[0]).toEqual(line());
  });

  it.each([
    ["unité", { ...document(), units: "mm" }],
    ["repère", { ...document(), frame: "WGS84" }],
    ["version inconnue", { ...document(), schemaVersion: "studio-document/2" }],
    ["champ document inconnu", { ...document(), future: true }],
    ["champ objet inconnu", { ...document(), objects: [{ ...line(), future: true }] }],
    ["champ point inconnu", { ...document(), objects: [{ ...line(), start: { x: 0, y: 0, z: 0 } }] }],
    ["id vide", { ...document(), id: " " }],
    ["id nul", { ...document(), id: "a\0b" }],
    ["id objet dupliqué", { ...document(), objects: [line(), line()] }],
    ["géométrie inconnue", { ...document(), objects: [{ id: "x", type: "mesh" }] }],
    ["champ absent", { ...document(), objects: [{ id: "a", type: "line", start: { x: 0, y: 0 } }] }],
    ["coordonnée chaîne", { ...document(), objects: [{ ...line(), start: { x: "1", y: 0 } }] }],
    ["coordonnée infinie", { ...document(), objects: [{ ...line(), start: { x: Infinity, y: 0 } }] }],
    ["coordonnée NaN", { ...document(), objects: [{ ...line(), start: { x: 0, y: NaN } }] }],
    ["ligne dégénérée", { ...document(), objects: [{ ...line(), end: { x: 0, y: 0 } }] }],
    ["rectangle nul", { ...document(), objects: [{ ...rectangle(), width: 0 }] }],
    ["rectangle négatif", { ...document(), objects: [{ ...rectangle(), height: -2 }] }],
    ["rectangle infini", { ...document(), objects: [{ ...rectangle(), height: Infinity }] }],
    ["sommet déborde", { ...document(), objects: [{ ...rectangle(), origin: { x: 1e308, y: 0 }, width: 1e308 }] }],
    ["objects non tableau", { ...document(), objects: {} }],
    ["tableau troué", { ...document(), objects: new Array(1) }],
    ["tableau avec champ inconnu", { ...document(), objects: Object.assign([line()], { future: true }) }],
    ["tableau à prototype modifié", { ...document(), objects: Object.setPrototypeOf([line()], null) }],
    ["objet à prototype métier", Object.assign(Object.create({ inherited: true }), document())],
    ["objet accessor", { ...document(), objects: [{ ...line(), get start() { throw new Error("getter exécuté"); } }] }],
  ])("refuse %s sans perdre silencieusement des données", (_label, value) => {
    expect(() => validateStudioDocument(value)).toThrow(StudioValidationError);
  });

  it.each([
    ["outil inconnu", [{ toolId: "studio.dessin.3d", params: {} }]],
    ["sélection n’est pas une mutation", [{ toolId: "studio.dessin.selection", params: { id: "line-a" } }]],
    ["création avec mauvais type", [{ toolId: "studio.dessin.ligne", params: rectangle() }]],
    ["id existant", [{ toolId: "studio.dessin.ligne", params: line() }]],
    ["édition change type", [{ toolId: "studio.dessin.modifier", params: { ...rectangle(), id: "line-a" } }]],
    ["édition cible inconnue", [{ toolId: "studio.dessin.modifier", params: { ...line(), id: "missing" } }]],
    ["déplacement cible inconnue", [{ toolId: "studio.dessin.deplacer", params: { id: "missing", dx: 1, dy: 0 } }]],
    ["déplacement non fini", [{ toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: Infinity, dy: 0 } }]],
    ["déplacement avec données inconnues", [{ toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: 0, dz: 0 } }]],
    ["enveloppe de commande inconnue", [{ toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: 0 }, extra: true }]],
    ["lot vide", []],
    ["lot troué", new Array(1)],
  ])("refuse un lot : %s", (_label, commands) => {
    const original = document();
    expect(() => applyStudioCommands(original, unchecked(commands))).toThrow(StudioValidationError);
    expect(original).toEqual(document());
  });

  it("refuse un dernier pas sans appliquer les premiers au document appelant", () => {
    const original = document();
    const commands = unchecked([
      { toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 20, dy: 5 } },
      { toolId: "studio.dessin.rectangle", params: { ...rectangle(), id: "new" } },
      { toolId: "studio.dessin.modifier", params: { ...line(), id: "missing" } },
    ]);
    const beforeCommands = JSON.stringify(commands);
    expect(() => applyStudioCommands(original, commands)).toThrow(StudioValidationError);
    expect(original).toEqual(document());
    expect(JSON.stringify(commands)).toBe(beforeCommands);
  });

  it("refuse le débordement lors d’un déplacement", () => {
    const original: StudioDocument = { ...newStudioDocument("d"), objects: [{ id: "r", type: "rectangle", origin: { x: 1e308, y: 0 }, width: 1, height: 1 }] };
    expect(() => applyStudioCommands(original, [{ toolId: "studio.dessin.deplacer", params: { id: "r", dx: 1e308, dy: 0 } }])).toThrow(StudioValidationError);
    expect(original.objects[0]).toMatchObject({ origin: { x: 1e308, y: 0 } });
  });
});

describe("Registry Studio minimal", () => {
  it("publie vingt-quatre identités, icônes et raccourcis propres (volume libre et transformations compris), sans agent", () => {
    // Seize outils de base, le volume libre (boîte, prisme, déplacer, supprimer), puis Copier, Rotation, Symétrie et Échelle.
    expect(STUDIO_TOOLS).toHaveLength(24);
    for (const key of ["toolId", "iconeSymbolique", "raccourci"] as const) {
      expect(new Set(STUDIO_TOOLS.map((tool) => tool[key])).size).toBe(24);
    }
    for (const tool of STUDIO_TOOLS) {
      expect(tool.agentExposure).toBe("none");
      expect(tool.contractVersion).toBe(STUDIO_CONTRACT);
      expect(tool.refusalCodes).toEqual(["studio-invalid"]);
      expect(Object.isFrozen(tool.refusalCodes)).toBe(true);
      expect(tool.supportsDryRun).toBe(true);
      expect(tool.libelleFR.trim()).not.toBe("");
      expect(JSON.parse(JSON.stringify(tool.inputSchema))).toEqual(tool.inputSchema);
      expect(JSON.parse(JSON.stringify(tool.outputSchema))).toEqual(tool.outputSchema);
      expect(Object.isFrozen(tool)).toBe(true);
      expect(Object.isFrozen(tool.inputSchema)).toBe(true);
    }
    const idPattern = new RegExp(STUDIO_DOCUMENT_SCHEMA.properties.id.pattern);
    for (const id of ["valid", " a ", "opaque/é-2"]) expect(idPattern.test(id)).toBe(true);
    for (const id of ["", " ", "a\0b", "a\n\0b"]) expect(idPattern.test(id)).toBe(false);
    expect(Object.isFrozen(STUDIO_TOOLS)).toBe(true);
    expect(Object.isFrozen(STUDIO_DOCUMENT_SCHEMA.properties.objects.items.oneOf)).toBe(true);
  });
});
