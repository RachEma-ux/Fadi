import { describe, expect, it } from "vitest";
import {
  applyStudioCommands, measureStudioDimension, newStudioDocument, STUDIO_APPLIED_TOOL_IDS, STUDIO_DEFAULT_LAYER_ID, STUDIO_LIMITS,
  studioAnchorPoint, studioLayerState, StudioValidationError, validateStudioDocument,
  type StudioCommand, type StudioDimension, type StudioDocument, type StudioLayer, type StudioLine, type StudioRectangle,
} from "./document-2d.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_REGISTRY_MATCHES_COMMANDS, STUDIO_TOOL_IDS, STUDIO_TOOLS } from "./registry.js";

const line = (over: Partial<StudioLine> = {}): StudioLine => ({ id: "line-a", type: "line", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, ...over });
const rect = (over: Partial<StudioRectangle> = {}): StudioRectangle => ({ id: "rect-a", type: "rectangle", origin: { x: 10, y: 0 }, width: 2, height: 1, ...over });
const layer = (over: Partial<StudioLayer> = {}): StudioLayer => ({ id: "murs", name: "Murs", visible: true, locked: false, ...over });
/** Cote liée aux deux extrémités de `line-a`. */
const cote = (over: Partial<StudioDimension> = {}): StudioDimension => ({
  id: "cote-a", type: "dimension", start: { x: 0, y: 0 }, end: { x: 3, y: 4 }, offset: 0.5,
  links: { start: { objectId: "line-a", anchor: "start" }, end: { objectId: "line-a", anchor: "end" } }, toResolve: false, ...over,
});
const base = (): StudioDocument => ({ ...newStudioDocument("planche"), objects: [line(), rect()] });
const withCote = (): StudioDocument => applyStudioCommands(base(), [{ toolId: "studio.dessin.cote", params: cote() }]);
const unchecked = (commands: unknown): StudioCommand[] => commands as StudioCommand[];
const refuses = (document: StudioDocument, commands: unknown) => {
  const snapshot = JSON.stringify(document);
  expect(() => applyStudioCommands(document, unchecked(commands))).toThrow(StudioValidationError);
  expect(JSON.stringify(document)).toBe(snapshot);
};

describe("Studio V1 : rétrocompatibilité de l’extension additive", () => {
  it("un document V1 (lignes, rectangles, sans calque) valide et s’applique à l’identique, sans champ ajouté", () => {
    const v1 = JSON.parse(JSON.stringify(base()));
    expect(validateStudioDocument(v1)).toEqual(v1);
    expect(Object.keys(validateStudioDocument(v1)).sort()).toEqual(["frame", "id", "objects", "schemaVersion", "units"]);
    const moved = applyStudioCommands(v1, [{ toolId: "studio.dessin.deplacer", params: { id: "rect-a", dx: 1, dy: 1 } }]);
    expect(JSON.stringify(moved)).toBe(JSON.stringify({ ...v1, objects: [line(), rect({ origin: { x: 11, y: 1 } })] }));
    expect(moved.schemaVersion).toBe("studio-document/1");
    expect(moved.frame).toBe("local-2d");
    expect(moved.units).toBe("m");
  });

  it("des tableaux vides de calques ou de cotes sont acceptés et retirés de la forme canonique", () => {
    const d = validateStudioDocument({ ...base(), layers: [], dimensions: [] });
    expect(d).not.toHaveProperty("layers");
    expect(d).not.toHaveProperty("dimensions");
  });
});

describe("Calques", () => {
  it("crée, règle et affecte ; le calque implicite reste visible et déverrouillé tant qu’il n’est pas matérialisé", () => {
    const d = applyStudioCommands(base(), [
      { toolId: "studio.calque.creer", params: layer() },
      { toolId: "studio.objet.calque", params: { ids: ["line-a"], layerId: "murs" } },
      { toolId: "studio.calque.modifier", params: layer({ name: "Murs porteurs", visible: false }) },
    ]);
    expect(d.layers).toEqual([layer({ name: "Murs porteurs", visible: false })]);
    expect(d.objects[0]).toEqual(line({ layerId: "murs" }));
    expect(d.objects[1]).not.toHaveProperty("layerId");
    expect(studioLayerState(d, "murs")).toEqual({ id: "murs", visible: false, locked: false, implicit: false });
    expect(studioLayerState(d, undefined)).toEqual({ id: STUDIO_DEFAULT_LAYER_ID, visible: true, locked: false, implicit: true });
    expect(studioLayerState(d, "inconnu")).toBeNull();
    const back = applyStudioCommands(d, [{ toolId: "studio.objet.calque", params: { ids: ["line-a"], layerId: STUDIO_DEFAULT_LAYER_ID } }]);
    expect(back.objects[0]).toEqual(line());
    expect(back.objects[0]).not.toHaveProperty("layerId");
  });

  it("un calque verrouillé refuse création, déplacement, modification, suppression et changement de calque", () => {
    const locked = applyStudioCommands(base(), [
      { toolId: "studio.calque.creer", params: layer() },
      { toolId: "studio.objet.calque", params: { ids: ["line-a"], layerId: "murs" } },
      { toolId: "studio.calque.modifier", params: layer({ locked: true }) },
    ]);
    refuses(locked, [{ toolId: "studio.dessin.ligne", params: line({ id: "n", layerId: "murs" }) }]);
    refuses(locked, [{ toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: 0 } }]);
    refuses(locked, [{ toolId: "studio.dessin.modifier", params: line({ layerId: "murs", end: { x: 9, y: 9 } }) }]);
    refuses(locked, [{ toolId: "studio.dessin.supprimer", params: { ids: ["line-a"] } }]);
    refuses(locked, [{ toolId: "studio.objet.calque", params: { ids: ["line-a"], layerId: STUDIO_DEFAULT_LAYER_ID } }]);
    refuses(locked, [{ toolId: "studio.objet.calque", params: { ids: ["rect-a"], layerId: "murs" } }]);
    // Déverrouiller est un réglage permis, puis l'édition reprend.
    const unlocked = applyStudioCommands(locked, [
      { toolId: "studio.calque.modifier", params: layer() },
      { toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: 0 } },
    ]);
    expect(unlocked.objects[0]).toEqual(line({ layerId: "murs", start: { x: 1, y: 0 }, end: { x: 4, y: 4 } }));
  });

  it("le calque implicite peut être matérialisé pour être verrouillé", () => {
    const d = applyStudioCommands(base(), [{ toolId: "studio.calque.creer", params: layer({ id: STUDIO_DEFAULT_LAYER_ID, name: "Calque 0", locked: true }) }]);
    refuses(d, [{ toolId: "studio.dessin.deplacer", params: { id: "rect-a", dx: 1, dy: 0 } }]);
    expect(studioLayerState(d, undefined)).toMatchObject({ locked: true, implicit: false });
  });

  it.each([
    ["calque inconnu", { ...base(), objects: [line({ layerId: "absent" })] }],
    ["calque implicite nommé", { ...base(), objects: [line({ layerId: STUDIO_DEFAULT_LAYER_ID })] }],
    ["calque dupliqué", { ...base(), layers: [layer(), layer()] }],
    ["nom vide", { ...base(), layers: [layer({ name: "  " })] }],
    ["nom trop long", { ...base(), layers: [layer({ name: "x".repeat(STUDIO_LIMITS.layerName + 1) })] }],
    ["champ calque inconnu", { ...base(), layers: [{ ...layer(), color: "red" }] }],
    ["booléen chaîne", { ...base(), layers: [{ ...layer(), locked: "false" }] }],
    ["trop de calques", { ...base(), layers: Array.from({ length: STUDIO_LIMITS.layers + 1 }, (_, i) => layer({ id: `c${i}` })) }],
    ["trop d’objets", { ...base(), objects: Array.from({ length: STUDIO_LIMITS.objects + 1 }, (_, i) => line({ id: `l${i}` })) }],
    ["layers non tableau", { ...base(), layers: {} }],
    ["calque à prototype", { ...base(), layers: [Object.assign(Object.create({ x: 1 }), layer())] }],
  ])("refuse le document : %s", (_label, value) => {
    expect(() => validateStudioDocument(value)).toThrow(StudioValidationError);
  });

  it.each([
    ["calque déjà existant", [{ toolId: "studio.calque.creer", params: layer() }, { toolId: "studio.calque.creer", params: layer() }]],
    ["régler un calque inconnu", [{ toolId: "studio.calque.modifier", params: layer() }]],
    ["affecter à un calque inconnu", [{ toolId: "studio.objet.calque", params: { ids: ["line-a"], layerId: "absent" } }]],
    ["affecter un objet inconnu", [{ toolId: "studio.calque.creer", params: layer() }, { toolId: "studio.objet.calque", params: { ids: ["x"], layerId: "murs" } }]],
    ["affecter une liste vide", [{ toolId: "studio.objet.calque", params: { ids: [], layerId: STUDIO_DEFAULT_LAYER_ID } }]],
    ["changer de calque par modifier", [{ toolId: "studio.calque.creer", params: layer() }, { toolId: "studio.dessin.modifier", params: line({ layerId: "murs" }) }]],
  ])("refuse un lot : %s", (_label, commands) => refuses(base(), commands));

  it("borne le nombre de calques à la création", () => {
    const full: StudioDocument = { ...base(), layers: Array.from({ length: STUDIO_LIMITS.layers }, (_, i) => layer({ id: `c${i}` })) };
    expect(validateStudioDocument(full).layers).toHaveLength(STUDIO_LIMITS.layers);
    refuses(full, [{ toolId: "studio.calque.creer", params: layer({ id: "en-trop" }) }]);
  });
});

describe("Cotes associatives", () => {
  it("cote deux sommets ; la valeur est dérivée, jamais stockée", () => {
    const d = withCote();
    expect(d.dimensions).toEqual([cote()]);
    expect(JSON.stringify(d)).not.toContain("value");
    expect(measureStudioDimension(d, "cote-a")).toEqual({ id: "cote-a", status: "resolved", value: 5, unit: "m", frame: "local-2d" });
    expect(measureStudioDimension(d, "absente")).toBeNull();
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it("suit l’objet lié quand il est déplacé ou modifié, et se lie aux sommets d’un rectangle", () => {
    const d = applyStudioCommands(withCote(), [
      { toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: 1 } },
      { toolId: "studio.dessin.modifier", params: line({ start: { x: 1, y: 1 }, end: { x: 7, y: 9 } }) },
      { toolId: "studio.dessin.cote", params: {
        id: "cote-r", type: "dimension", start: { x: 10, y: 0 }, end: { x: 12, y: 1 }, offset: -0.2,
        links: { start: { objectId: "rect-a", anchor: "corner-origin" }, end: { objectId: "rect-a", anchor: "corner-opposite" } }, toResolve: false,
      } },
      { toolId: "studio.dessin.deplacer", params: { id: "rect-a", dx: -10, dy: 0 } },
    ]);
    expect(d.dimensions?.[0]).toEqual(cote({ start: { x: 1, y: 1 }, end: { x: 7, y: 9 } }));
    expect(measureStudioDimension(d, "cote-a")?.value).toBe(10);
    expect(d.dimensions?.[1]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 2, y: 1 } });
    expect(studioAnchorPoint(rect(), "corner-width")).toEqual({ x: 12, y: 0 });
    expect(studioAnchorPoint(rect(), "corner-height")).toEqual({ x: 10, y: 1 });
    expect(studioAnchorPoint(line(), "corner-origin")).toBeNull();
  });

  it("supprimer l’objet lié rend la cote « à résoudre » au lieu de l’effacer ; sa valeur devient non évaluée", () => {
    const d = applyStudioCommands(withCote(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["line-a"] } }]);
    expect(d.objects.map((o) => o.id)).toEqual(["rect-a"]);
    expect(d.dimensions).toEqual([cote({ links: { start: null, end: null }, toResolve: true })]);
    expect(measureStudioDimension(d, "cote-a")).toMatchObject({ status: "to-resolve", value: null });
    // Résolution explicite : la cote est ressaisie (liée à un nouvel objet), jamais rattachée seule.
    const resolved = applyStudioCommands(d, [
      { toolId: "studio.dessin.ligne", params: line({ id: "line-b" }) },
      { toolId: "studio.dessin.modifier", params: cote({ links: { start: { objectId: "line-b", anchor: "start" }, end: null } }) },
    ]);
    expect(measureStudioDimension(resolved, "cote-a")).toMatchObject({ status: "resolved", value: 5 });
  });

  it("une cote libre se déplace et se supprime ; une cote liée ne se déplace pas seule", () => {
    const free = cote({ id: "libre", links: { start: null, end: null } });
    const d = applyStudioCommands(withCote(), [
      { toolId: "studio.dessin.cote", params: free },
      { toolId: "studio.dessin.deplacer", params: { id: "libre", dx: 0, dy: 2 } },
    ]);
    expect(d.dimensions?.[1]).toEqual({ ...free, start: { x: 0, y: 2 }, end: { x: 3, y: 6 } });
    refuses(d, [{ toolId: "studio.dessin.deplacer", params: { id: "cote-a", dx: 1, dy: 0 } }]);
    const removed = applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["libre", "cote-a"] } }]);
    expect(removed).not.toHaveProperty("dimensions");
  });

  it("une cote liée sur un calque verrouillé bloque la modification ou la suppression de l’objet coté", () => {
    const d = applyStudioCommands(base(), [
      { toolId: "studio.calque.creer", params: layer({ id: "cotes", name: "Cotes" }) },
      { toolId: "studio.dessin.cote", params: cote({ layerId: "cotes" }) },
      { toolId: "studio.calque.modifier", params: layer({ id: "cotes", name: "Cotes", locked: true }) },
    ]);
    refuses(d, [{ toolId: "studio.dessin.deplacer", params: { id: "line-a", dx: 1, dy: 0 } }]);
    refuses(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["line-a"] } }]);
    // Un changement qui laisse la cote intacte reste permis.
    expect(applyStudioCommands(d, [{ toolId: "studio.dessin.deplacer", params: { id: "rect-a", dx: 1, dy: 0 } }]).dimensions).toEqual(d.dimensions);
  });

  it.each([
    ["lien vers objet absent", [{ toolId: "studio.dessin.cote", params: cote({ links: { start: { objectId: "absent", anchor: "start" }, end: null } }) }]],
    ["lien vers une cote", [{ toolId: "studio.dessin.cote", params: cote() }, { toolId: "studio.dessin.cote", params: cote({ id: "c2", links: { start: { objectId: "cote-a", anchor: "start" }, end: null } }) }]],
    ["sommet incompatible", [{ toolId: "studio.dessin.cote", params: cote({ links: { start: { objectId: "line-a", anchor: "corner-origin" }, end: null } }) }]],
    ["extrémité différente du sommet", [{ toolId: "studio.dessin.cote", params: cote({ start: { x: 0.001, y: 0 } }) }]],
    ["cote saisie à résoudre", [{ toolId: "studio.dessin.cote", params: cote({ links: { start: null, end: null }, toResolve: true }) }]],
    ["cote dégénérée", [{ toolId: "studio.dessin.cote", params: cote({ end: { x: 0, y: 0 }, links: { start: null, end: null } }) }]],
    ["décalage infini", [{ toolId: "studio.dessin.cote", params: cote({ offset: Infinity }) }]],
    ["identifiant déjà pris par un objet", [{ toolId: "studio.dessin.cote", params: cote({ id: "rect-a" }) }]],
    ["une ligne par l’outil cote", [{ toolId: "studio.dessin.cote", params: line({ id: "n" }) }]],
    ["une cote par l’outil ligne", [{ toolId: "studio.dessin.ligne", params: cote() }]],
    ["modifier une ligne en cote", [{ toolId: "studio.dessin.modifier", params: cote({ id: "line-a" }) }]],
    ["sommet inconnu", [{ toolId: "studio.dessin.cote", params: cote({ links: { start: { objectId: "line-a", anchor: "middle" as never }, end: null } }) }]],
    ["lien avec champ inconnu", [{ toolId: "studio.dessin.cote", params: { ...cote(), links: { start: { objectId: "line-a", anchor: "start", extra: 1 }, end: null } } }]],
    ["valeur mesurée saisie", [{ toolId: "studio.dessin.cote", params: { ...cote(), value: 5 } }]],
  ])("refuse un lot : %s", (_label, commands) => refuses(base(), commands));

  it("refuse une modification qui rendrait nulle une cote liée à deux objets", () => {
    const d = applyStudioCommands(base(), [
      { toolId: "studio.dessin.ligne", params: line({ id: "line-b", start: { x: 5, y: 5 }, end: { x: 6, y: 5 } }) },
      { toolId: "studio.dessin.cote", params: cote({ id: "c", start: { x: 3, y: 4 }, end: { x: 5, y: 5 }, links: { start: { objectId: "line-a", anchor: "end" }, end: { objectId: "line-b", anchor: "start" } } }) },
    ]);
    refuses(d, [{ toolId: "studio.dessin.deplacer", params: { id: "line-b", dx: -2, dy: -1 } }]);
  });

  it.each([
    ["cote à résoudre entièrement liée", { ...withCote(), dimensions: [cote({ toResolve: true })] }],
    ["lien vers objet absent", { ...base(), dimensions: [cote({ links: { start: { objectId: "absent", anchor: "start" }, end: null } })] }],
    ["extrémité désynchronisée", { ...base(), dimensions: [cote({ end: { x: 3, y: 5 } })] }],
    ["identifiant dupliqué avec un objet", { ...base(), dimensions: [cote({ id: "line-a", links: { start: null, end: null } })] }],
    ["cote dans objects", { ...base(), objects: [line(), cote()] }],
    ["toResolve absent", { ...base(), dimensions: [(({ toResolve: _t, ...rest }) => rest)(cote())] }],
    ["calque de cote inconnu", { ...base(), dimensions: [cote({ layerId: "absent" })] }],
    ["trop d’objets cumulés", { ...base(), objects: [], dimensions: Array.from({ length: STUDIO_LIMITS.objects + 1 }, (_, i) => cote({ id: `c${i}`, links: { start: null, end: null } })) }],
  ])("refuse le document : %s", (_label, value) => {
    expect(() => validateStudioDocument(value)).toThrow(StudioValidationError);
  });
});

describe("Supprimer", () => {
  it.each([
    ["liste vide", { ids: [] }],
    ["identifiant répété", { ids: ["line-a", "line-a"] }],
    ["objet absent", { ids: ["line-a", "absent"] }],
    ["identifiant vide", { ids: [" "] }],
    ["champ inconnu", { ids: ["line-a"], cascade: true }],
  ])("refuse %s sans rien supprimer", (_label, params) => refuses(base(), [{ toolId: "studio.dessin.supprimer", params }]));

  it("est atomique avec le reste du lot", () => {
    refuses(withCote(), [
      { toolId: "studio.dessin.supprimer", params: { ids: ["line-a"] } },
      { toolId: "studio.dessin.modifier", params: line({ id: "missing" }) },
    ]);
  });
});

describe("Registre Studio : règle d’or", () => {
  it("chaque outil a une identité, une icône, une barre et un raccourci propres", () => {
    for (const key of ["toolId", "iconeSymbolique", "raccourci"] as const) {
      expect(new Set(STUDIO_TOOLS.map((tool) => tool[key])).size).toBe(STUDIO_TOOLS.length);
    }
    for (const tool of STUDIO_TOOLS) {
      expect(tool.iconeSymbolique).toMatch(/^studio-[a-z-]+$/);
      expect(["dessin", "modification", "calques", "volume", "volume-libre", "architecture", "proprietes", "visualisation", "non-natifs", "graphismes", "reperes"]).toContain(tool.groupe);
      expect(tool.raccourci.trim()).not.toBe("");
      expect(tool.agentExposure).toBe("none");
    }
    const byId = Object.fromEntries(STUDIO_TOOLS.map((tool) => [tool.toolId, tool]));
    expect(byId["studio.dessin.cote"]?.raccourci).toBe("Shift+C");
    expect(byId["studio.dessin.supprimer"]?.raccourci).toBe("Delete");
    for (const idCalque of ["studio.calque.creer", "studio.calque.modifier", "studio.objet.calque"]) expect(byId[idCalque]?.groupe).toBe("calques");
    // Raccourcis réservés à l'éditeur (annuler, rétablir, enregistrer, cadrer) : jamais pris par un outil.
    for (const reserved of ["Ctrl+Z", "Ctrl+Y", "Ctrl+S", "Shift+Z"]) expect(STUDIO_TOOLS.map((t) => t.raccourci)).not.toContain(reserved);
  });

  it("les mutations du registre et les commandes appliquées sont le même ensemble", () => {
    expect(STUDIO_REGISTRY_MATCHES_COMMANDS).toBe(true);
    expect([...STUDIO_COMMAND_TOOL_IDS].sort()).toEqual([...STUDIO_APPLIED_TOOL_IDS].sort());
    expect([...STUDIO_TOOL_IDS]).toEqual(STUDIO_TOOLS.map((tool) => tool.toolId));
    expect(STUDIO_TOOL_IDS).toContain("studio.dessin.selection");
    expect(STUDIO_COMMAND_TOOL_IDS).not.toContain("studio.dessin.selection");
    expect(Object.isFrozen(STUDIO_TOOL_IDS)).toBe(true);
    expect(Object.isFrozen(STUDIO_COMMAND_TOOL_IDS)).toBe(true);
    for (const toolId of ["toString", "__proto__", "constructor", "studio.dessin.selection"]) refuses(base(), [{ toolId, params: {} }]);
  });

  it("le schéma de document publie calques et cotes, facultatifs", () => {
    expect(STUDIO_DOCUMENT_SCHEMA.required).toEqual(["id", "schemaVersion", "units", "frame", "objects"]);
    expect(STUDIO_DOCUMENT_SCHEMA.properties.layers.maxItems).toBe(STUDIO_LIMITS.layers);
    expect(STUDIO_DOCUMENT_SCHEMA.properties.dimensions.items.properties.type.const).toBe("dimension");
    expect(Object.isFrozen(STUDIO_DOCUMENT_SCHEMA.properties.dimensions.items)).toBe(true);
  });
});
