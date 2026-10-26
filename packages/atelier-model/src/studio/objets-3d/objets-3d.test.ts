import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { exportStudioIfc, studioIfcSummary } from "../ifc.js";
import { studioMesh3d } from "../mesh-3d.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOLS } from "../registry.js";
import { couperStudio, empriseSolide, studioQuantitesSolides, studioSolideVers3d, studioVolumeSolide, type StudioBox, type StudioProfilePrism } from "../solides-libres.js";

/** Volume libre (A.3-02, A.3-05, A.3-07, A.3-09) : solides créés dans l'espace, coupe dérivée, IFC, quantités. */

const unchecked = (c: unknown) => c as StudioCommand[];
const boite = (over: Partial<StudioBox> = {}): StudioBox => ({ id: "b1", type: "box", placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 3, ...over });
/** Profil en L (non convexe), posé à la cote 1. */
const prisme = (over: Partial<StudioProfilePrism> = {}): StudioProfilePrism => ({
  id: "p1", type: "prism", placement: { origin: { x: 10, y: 0, z: 1 }, rotation: 0 },
  profile: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }], height: 2, ...over,
});
const avecSolides = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.solide.boite", params: boite() },
  { toolId: "studio.solide.prisme", params: prisme() },
]);
const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};

describe("Volume libre : création directe dans l'espace (A.3-02)", () => {
  it("une boîte 2 × 1 × 3 en (1, 1, 0) et un prisme sur profil fermé, rangés dans `solides`, jamais dans `objects`", () => {
    const d = avecSolides();
    expect(d.objects.map((o) => o.id)).toEqual(["l1"]);
    expect(d.solides).toEqual([boite(), prisme()]);
    // Relue, la forme canonique est identique (enregistrer puis recharger ne change rien).
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(JSON.stringify(validateStudioDocument(d))).toBe(JSON.stringify(d));
  });

  it("un document sans solide reste dans sa forme d'origine (`solides` vide omis)", () => {
    const d = applyStudioCommands(avecSolides(), [{ toolId: "studio.solide.supprimer", params: { ids: ["b1", "p1"] } }]);
    expect(Object.hasOwn(d, "solides")).toBe(false);
    expect(validateStudioDocument({ ...d, solides: [] })).toEqual(d);
  });

  it("déplacer (dx, dy, dz) et supprimer un solide ; les commandes 2D ne le touchent pas", () => {
    const d = applyStudioCommands(avecSolides(), [{ toolId: "studio.solide.deplacer", params: { id: "b1", dx: 0.5, dy: -1, dz: 2 } }]);
    expect(d.solides![0]!.placement).toEqual({ origin: { x: 1.5, y: 0, z: 2 }, rotation: 0 });
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.dessin.deplacer", params: { id: "b1", dx: 1, dy: 1 } }]))).toBe("commands[0] : objet introuvable");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.dessin.supprimer", params: { ids: ["b1"] } }]))).toBe("commands[0] : objet introuvable : b1");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.deplacer", params: { id: "l1", dx: 1, dy: 1, dz: 0 } }]))).toBe("commands[0] : ce n’est pas un solide libre : l1");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.supprimer", params: { ids: ["zz"] } }]))).toBe("commands[0] : solide introuvable : zz");
    const sans = applyStudioCommands(d, [{ toolId: "studio.solide.supprimer", params: { ids: ["b1"] } }]);
    expect(sans.solides!.map((s) => s.id)).toEqual(["p1"]);
  });

  it("identifiants uniques entre objets, cotes et solides", () => {
    const d = avecSolides();
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.boite", params: boite({ id: "l1" }) }]))).toBe("commands[0] : identifiant déjà utilisé");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.dessin.ligne", params: { id: "b1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }]))).toBe("commands[0] : identifiant déjà utilisé");
    expect(refus(() => validateStudioDocument({ ...d, solides: [boite(), boite()] }))).toBe("studioDocument.solides : identifiant dupliqué");
  });

  it("validation : dimensions finies et strictement positives, bornes techniques, rotation dans [0 ; 2π[", () => {
    const c = (p: unknown) => refus(() => applyStudioCommands(newStudioDocument("d"), unchecked([{ toolId: "studio.solide.boite", params: p }])));
    expect(c(boite({ width: 0 }))).toBe("commands[0].params.width : dimension strictement positive attendue");
    expect(c(boite({ depth: -1 }))).toBe("commands[0].params.depth : dimension strictement positive attendue");
    expect(c(boite({ height: Number.NaN }))).toBe("commands[0].params.height : nombre fini attendu");
    expect(c(boite({ height: Number.POSITIVE_INFINITY }))).toBe("commands[0].params.height : nombre fini attendu");
    expect(c(boite({ width: 1e6 + 1 }))).toBe("commands[0].params.width : dimension de 1 000 000 m au plus");
    expect(c(boite({ placement: { origin: { x: 2e9, y: 0, z: 0 }, rotation: 0 } }))).toBe("commands[0].params.placement.origin.x : valeur absolue de 1 000 000 000 m au plus");
    expect(c(boite({ placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 2 * Math.PI } }))).toBe("commands[0].params.placement.rotation : angle en radians dans [0 ; 2π[ attendu");
    expect(c({ ...boite(), type: "sphere" })).toBe("commands[0].params.type : type de solide non pris en charge");
    expect(c({ ...prisme(), id: "b1" })).toBe("commands[0].params.type : type incompatible avec l’outil");
    expect(refus(() => applyStudioCommands(newStudioDocument("d"), unchecked([{ toolId: "studio.solide.deplacer", params: { id: "b1", dx: 1, dy: 0 } }])))).toBe("commands[0].params : champs absents ou inconnus");
  });

  it("validation du profil : fermé, trois sommets au moins, sans sommets confondus ni croisement", () => {
    const c = (profile: unknown) => refus(() => applyStudioCommands(newStudioDocument("d"), unchecked([{ toolId: "studio.solide.prisme", params: { ...prisme(), profile } }])));
    expect(c([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe("commands[0].params.profile : trois sommets au moins attendus");
    expect(c([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }])).toBe("commands[0].params.profile[2] : sommets consécutifs confondus");
    expect(c([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }])).toBe("commands[0].params.profile : profil fermé simple attendu (sans croisement, aire non nulle)");
    expect(c([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBe("commands[0].params.profile : profil fermé simple attendu (sans croisement, aire non nulle)");
    expect(c(Array.from({ length: 1025 }, (_, i) => ({ x: Math.cos(i / 163), y: Math.sin(i / 163) })))).toBe("commands[0].params.profile : 1024 sommets au plus");
  });

  it("calques : un calque verrouillé refuse création, déplacement et suppression ; un calque inconnu est refusé", () => {
    const d = applyStudioCommands(newStudioDocument("d"), [
      { toolId: "studio.calque.creer", params: { id: "v", name: "Volumes", visible: true, locked: false } },
      { toolId: "studio.solide.boite", params: boite({ layerId: "v" }) },
      { toolId: "studio.calque.modifier", params: { id: "v", name: "Volumes", visible: true, locked: true } },
    ]);
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.boite", params: boite({ id: "b2", layerId: "v" }) }]))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.deplacer", params: { id: "b1", dx: 1, dy: 0, dz: 0 } }]))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.supprimer", params: { ids: ["b1"] } }]))).toBe("commands[0] : calque verrouillé");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.boite", params: boite({ id: "b2", layerId: "absent" }) }]))).toBe("commands[0] : calque inconnu");
    expect(refus(() => validateStudioDocument({ ...newStudioDocument("d"), solides: [boite({ layerId: "absent" })] }))).toBe("studioDocument.solides : calque inconnu");
  });

  it("lot tout ou rien : un refus n'écrit rien, ni dans le document ni dans les paramètres", () => {
    const d = avecSolides();
    const avant = JSON.stringify(d);
    const params = boite({ id: "b2" });
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.solide.boite", params }, { toolId: "studio.solide.supprimer", params: { ids: ["zz"] } }]))).toBe("commands[1] : solide introuvable : zz");
    expect(JSON.stringify(d)).toBe(avant);
    expect(params).toEqual(boite({ id: "b2" }));
  });

  it("registre : neuf outils de la barre « volume-libre » (édition des faces et lien du lot F1, booléen exact du lot F2 compris), icône, raccourci et schéma propres ; acceptés par l'API", () => {
    // Lot G2 : la cote de face 3D (INV-013) s’ajoute à la barre ; X.1-05 : les trois outils des surfaces libres aussi ;
    // ils sont contrôlés à part (document-2d.test.ts).
    const outils = STUDIO_TOOLS.filter((t) => t.groupe === "volume-libre" && t.toolId !== "studio.solide.cote-face" && !t.toolId.startsWith("studio.surface."));
    expect(outils.map((t) => [t.toolId, t.raccourci, t.iconeSymbolique])).toEqual([
      ["studio.solide.boite", "B", "studio-solid-box"], ["studio.solide.prisme", "Shift+B", "studio-solid-prism"],
      ["studio.solide.deplacer", "Shift+W", "studio-solid-move"], ["studio.solide.supprimer", "Shift+Delete", "studio-solid-delete"],
      ["studio.solide.face-decaler", "Ctrl+Shift+U", "studio-solid-push-pull"], ["studio.solide.face-diviser", "Ctrl+Shift+V", "studio-solid-split-face"],
      ["studio.solide.pivoter", "Ctrl+Shift+H", "studio-solid-rotate"], ["studio.solide.resoudre", "Ctrl+Shift+G", "studio-solid-link"],
      ["studio.solide.booleen", "Ctrl+Shift+Y", "studio-solid-boolean"],
    ]);
    for (const t of outils) expect(STUDIO_COMMAND_TOOL_IDS).toContain(t.toolId);
    expect(STUDIO_DOCUMENT_SCHEMA.properties.solides.items.oneOf.map((s) => s.properties.type.const)).toEqual(["box", "prism"]);
  });
});

describe("Volume libre : géométrie dérivée dans le repère local-3d (A.3-05)", () => {
  it("maillage exact de la boîte, présent seulement si le document a des solides ; emprise comprise", () => {
    const m = studioMesh3d(avecSolides());
    expect(m.frame).toBe("local-3d");
    const b = m.freeSolids!.find((s) => s.id === "b1")!;
    expect(b.vertices).toEqual([
      { x: 1, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, { x: 3, y: 2, z: 0 }, { x: 1, y: 2, z: 0 },
      { x: 1, y: 1, z: 3 }, { x: 3, y: 1, z: 3 }, { x: 3, y: 2, z: 3 }, { x: 1, y: 2, z: 3 },
    ]);
    expect(b.triangles).toHaveLength(12);
    expect(b.edges).toHaveLength(12);
    const p = m.freeSolids!.find((s) => s.id === "p1")!;
    expect(p.triangles).toHaveLength(2 * 4 + 2 * 6);
    expect(m.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 14, y: 3, z: 3 } });
    expect(m.solids).toEqual([]);
    expect(Object.hasOwn(studioMesh3d(newStudioDocument("v")), "freeSolids")).toBe(false);
  });

  it("rotation autour de z : conversion explicite, sens trigonométrique", () => {
    const s = boite({ placement: { origin: { x: 0, y: 0, z: 2 }, rotation: Math.PI / 2 } });
    const e = empriseSolide(s);
    for (const [q, attendu] of e.map((q, i) => [q, [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: -1, y: 2 }, { x: -1, y: 0 }][i]!] as const)) {
      expect(q.x).toBeCloseTo(attendu.x, 12);
      expect(q.y).toBeCloseTo(attendu.y, 12);
    }
    expect(studioSolideVers3d(s.placement, { x: 0, y: 0 }, 1)).toEqual({ x: 0, y: 0, z: 3 });
  });

  it("calque masqué : solide ni rendu ni coupé, compté", () => {
    const d = applyStudioCommands(avecSolides(), [
      { toolId: "studio.calque.creer", params: { id: "c", name: "Caché", visible: false, locked: false } },
      { toolId: "studio.solide.boite", params: boite({ id: "b2", layerId: "c" }) },
    ]);
    const m = studioMesh3d(d);
    expect(m.freeSolids!.map((s) => s.id)).toEqual(["b1", "p1"]);
    expect(m.hidden).toBe(1);
    expect(couperStudio(d, { z: 1.5 }).hidden).toBe(1);
  });
});

describe("Coupe plane dérivée avec provenance (A.3-07)", () => {
  it("à z = 1,5 : les contours de la boîte et du prisme, chaque segment rattaché à son solide", () => {
    const c = couperStudio(avecSolides(), { z: 1.5 });
    expect([c.frame, c.derived, c.editable, c.source]).toEqual(["local-2d", true, false, { frame: "local-3d", plan: { normal: "z", z: 1.5 }, conversion: "(x, y, z) → (x, y)" }]);
    expect(c.sources).toEqual([{ id: "b1", segments: 4 }, { id: "p1", segments: 6 }]);
    expect(c.segments.slice(0, 4)).toEqual([
      { id: "b1#0", source: "b1", start: { x: 1, y: 1 }, end: { x: 3, y: 1 } },
      { id: "b1#1", source: "b1", start: { x: 3, y: 1 }, end: { x: 3, y: 2 } },
      { id: "b1#2", source: "b1", start: { x: 3, y: 2 }, end: { x: 1, y: 2 } },
      { id: "b1#3", source: "b1", start: { x: 1, y: 2 }, end: { x: 1, y: 1 } },
    ]);
    expect(c.segments.filter((s) => s.source === "p1").map((s) => s.start)).toEqual([{ x: 10, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 1 }, { x: 11, y: 1 }, { x: 11, y: 3 }, { x: 10, y: 3 }]);
  });

  it("hors des solides : rien ; aux cotes inférieure et supérieure : la face ; la coupe ne modifie pas le document", () => {
    const d = avecSolides();
    const avant = JSON.stringify(d);
    expect(couperStudio(d, { z: 5 }).segments).toEqual([]);
    expect(couperStudio(d, { z: 0.5 }).sources.map((s) => s.id)).toEqual(["b1"]);
    expect(couperStudio(d, { z: 3 }).sources.map((s) => s.id)).toEqual(["b1", "p1"]);
    expect(couperStudio(d, { z: 0 }).sources.map((s) => s.id)).toEqual(["b1"]);
    expect(JSON.stringify(d)).toBe(avant);
    expect(refus(() => couperStudio(d, { z: Number.NaN }))).toBe("plan.z : nombre fini attendu");
    expect(refus(() => couperStudio(d, { z: 1, x: 0 } as never))).toBe("plan : champs absents ou inconnus");
  });
});

describe("Quantités et export IFC des solides libres", () => {
  it("volume et emprise exacts, dérivés des seules dimensions saisies", () => {
    const q = studioQuantitesSolides(avecSolides());
    expect(q).toEqual({ units: { footprint: "m2", volume: "m3" }, items: [{ id: "b1", type: "box", footprint: 2, volume: 6 }, { id: "p1", type: "prism", footprint: 6, volume: 12 }], totalVolume: 18 });
    expect(studioVolumeSolide(boite())).toBe(6);
  });

  it("IFC : deux IfcBuildingElementProxy .NOTDEFINED. de plus, placés et déterministes", () => {
    const meta = { studyName: "É", variantName: "V", timestamp: "2026-10-19T00:00:00" };
    const sans = exportStudioIfc(applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } }]), meta);
    const avec = exportStudioIfc(avecSolides(), meta);
    const proxies = (t: string) => (t.match(/IFCBUILDINGELEMENTPROXY\(/g) ?? []).length;
    expect(proxies(avec)).toBe(proxies(sans) + 2);
    expect(avec).toMatch(/IFCBUILDINGELEMENTPROXY\([^;]*'b1','Volume libre \(boîte\)'|IFCBUILDINGELEMENTPROXY\([^;]*'b1','Volume libre \(bo\\X2\\00EE\\X0\\te\)'/);
    expect(avec).toContain("IFCRECTANGLEPROFILEDEF(.AREA.,$,");
    expect(avec).toContain("IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,");
    expect(avec).toContain("IFCCARTESIANPOINT((1.,1.,0.))");
    expect(avec).toContain("IFCPROPERTYSINGLEVALUE('FreeSolids',$,IFCINTEGER(2),$)");
    expect(avec).toBe(exportStudioIfc(avecSolides(), meta));
    expect(studioIfcSummary(avecSolides()).prisms).toBe(2);
  });
});

describe("Aucune signification BIM acquise par la géométrie libre (A.3-09)", () => {
  it("une boîte aux proportions de mur, de dalle ou de poteau reste un proxy .NOTDEFINED., sans catégorie", () => {
    const d = applyStudioCommands(newStudioDocument("d"), [
      { toolId: "studio.solide.boite", params: boite({ id: "mur", width: 6, depth: 0.2, height: 2.7 }) },
      { toolId: "studio.solide.boite", params: boite({ id: "dalle", width: 6, depth: 6, height: 0.2 }) },
      { toolId: "studio.solide.boite", params: boite({ id: "poteau", width: 0.3, depth: 0.3, height: 3 }) },
    ]);
    const ifc = exportStudioIfc(d, { studyName: "É", variantName: "V", timestamp: "2026-10-19T00:00:00" });
    for (const entite of ["IFCWALL", "IFCSLAB", "IFCCOLUMN", "IFCBEAM", "IFCSPACE", "IFCMATERIAL", "IFCCLASSIFICATION"]) expect(ifc).not.toContain(`${entite}(`);
    expect((ifc.match(/IFCBUILDINGELEMENTPROXY\([^;]*\.NOTDEFINED\.\);/g) ?? []).length).toBe(3);
    expect(studioIfcSummary(d).walls).toBe(0);
    // Les quantités sont géométriques : ni catégorie, ni matériau, ni coefficient.
    for (const q of studioQuantitesSolides(d).items) expect(Object.keys(q).sort()).toEqual(["footprint", "id", "type", "volume"]);
    expect(Object.keys(d.solides![0]!).sort()).toEqual(["depth", "height", "id", "placement", "type", "width"]);
  });

  it("aucun champ de signification n'est accepté : catégorie, classe IFC, matériau sont refusés, jamais ignorés", () => {
    for (const champ of ["category", "ifcClass", "material", "classification"]) {
      expect(refus(() => applyStudioCommands(newStudioDocument("d"), unchecked([{ toolId: "studio.solide.boite", params: { ...boite(), [champ]: "IfcWall" } }])))).toBe("commands[0].params : champs absents ou inconnus");
    }
    expect(refus(() => validateStudioDocument({ ...newStudioDocument("d"), solides: [{ ...prisme(), category: "slab" }] }))).toBe("studioDocument.solides[0] : champs absents ou inconnus");
  });
});
