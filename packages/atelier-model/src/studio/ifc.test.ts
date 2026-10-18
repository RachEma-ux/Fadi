import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, type StudioDocument } from "./document-2d.js";
import { exportStudioIfc, STUDIO_IFC_SCHEMA, studioIfcGuid, studioIfcSummary, studioStepReal, studioStepString, type StudioIfcMeta } from "./ifc.js";

const meta: StudioIfcMeta = { studyName: "Étude A", variantName: "Variante 1", revisionId: "rev-1", timestamp: "2026-10-18T00:00:00" };

/** Mur diagonal (3, 4 → longueur 5) avec épaisseur, ligne sans épaisseur, rectangle extrudé, ligne plate, cote, calque masqué. */
function sample(): StudioDocument {
  return applyStudioCommands(newStudioDocument("doc-1"), [
    { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs extérieurs", visible: true, locked: false } },
    { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
    { toolId: "studio.dessin.ligne", params: { id: "m1", type: "line", layerId: "murs", start: { x: 1, y: 2 }, end: { x: 4, y: 6 } } },
    { toolId: "studio.dessin.ligne", params: { id: "s1", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 3 } } },
    { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", layerId: "cache", origin: { x: 5, y: 5 }, width: 2, height: 1 } },
    { toolId: "studio.dessin.ligne", params: { id: "plat", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } },
    { toolId: "studio.dessin.cote", params: { id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0.5, links: { start: null, end: null }, toResolve: false } },
    { toolId: "studio.objet.extruder", params: { ids: ["m1"], base: 0.5, height: 2.5, thickness: 0.2 } },
    { toolId: "studio.objet.extruder", params: { ids: ["s1"], base: 0, height: 3 } },
    { toolId: "studio.objet.extruder", params: { ids: ["r1"], base: -0.2, height: 0.2 } },
    { toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs extérieurs", visible: true, locked: true } },
  ]);
}

const entities = (ifc: string) => new Map(ifc.split("\n").filter((l) => l.startsWith("#")).map((l) => {
  const m = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(l)!;
  return [Number(m[1]), { type: m[2]!, args: m[3]! }];
}));
const count = (ifc: string, type: string) => [...entities(ifc).values()].filter((e) => e.type === type).length;
const refOf = (s: string) => Number(s.replace("#", ""));
/** Arguments de premier niveau d'une entité (sans descendre dans les parenthèses ni les chaînes). */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += "'"; i++; } else inStr = false; } continue; }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
const reals = (s: string) => s.replace(/[()]/g, "").split(",").map(Number);

describe("Studio : export IFC4X3_ADD2", () => {
  it("écrit l'en-tête ISO 10303-21, la structure spatiale et seulement les objets extrudés", () => {
    const ifc = exportStudioIfc(sample(), meta);
    expect(ifc.startsWith("ISO-10303-21;\nHEADER;\n")).toBe(true);
    expect(ifc).toContain(`FILE_SCHEMA(('${STUDIO_IFC_SCHEMA}'));`);
    expect(ifc.endsWith("ENDSEC;\nEND-ISO-10303-21;\n")).toBe(true);
    for (const [type, n] of Object.entries({
      IFCPROJECT: 1, IFCSITE: 1, IFCBUILDING: 1, IFCBUILDINGSTOREY: 1, IFCRELAGGREGATES: 3, IFCWALL: 1, IFCBUILDINGELEMENTPROXY: 2,
      IFCEXTRUDEDAREASOLID: 2, IFCTRIANGULATEDFACESET: 1, IFCRELCONTAINEDINSPATIALSTRUCTURE: 1, IFCPRESENTATIONLAYERWITHSTYLE: 3,
      IFCPROPERTYSET: 4, IFCMAPCONVERSION: 0, IFCPOSTALADDRESS: 0,
    })) expect(count(ifc, type), type).toBe(n);
    expect(ifc).toContain("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
    expect(ifc).toContain(`IFCSITE(`);
    expect(ifc).toContain(studioStepString("Étude A"));
    expect(ifc).toContain(studioStepString("Variante 1"));
    // Étage de référence à 0, rien d'autre.
    expect(ifc).toMatch(/IFCBUILDINGSTOREY\([^;]*,\.ELEMENT\.,0\.\);/);
    // Ligne plate et cote : comptées, non exportées.
    expect(ifc).not.toContain("'plat'");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('NonExtrudedObjects',$,IFCINTEGER(1),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('DimensionsNotExported',$,IFCINTEGER(1),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('ObjectsOnHiddenLayers',$,IFCINTEGER(1),$)");
    expect(studioIfcSummary(sample())).toEqual({ walls: 1, surfaces: 1, prisms: 1, nonExtruded: 1, dimensions: 1, onHiddenLayers: 1 });
    // Aucun type prédéfini deviné.
    expect(ifc).toMatch(/IFCWALL\([^;]*\.NOTDEFINED\.\);/);
    expect(ifc).not.toMatch(/IFCSLAB|IFCCOLUMN/);
  });

  it("est déterministe ; GlobalId uniques, 22 caractères base 64 IFC, stables d'un export à l'autre", () => {
    const a = exportStudioIfc(sample(), meta);
    expect(exportStudioIfc(sample(), meta)).toBe(a);
    // Entités enracinées (IfcRoot) : premier attribut = GlobalId.
    const racines = /^IFC(PROJECT|SITE|BUILDING|BUILDINGSTOREY|WALL|BUILDINGELEMENTPROXY|REL[A-Z]+|PROPERTYSET)$/;
    const guids = [...entities(a).values()].filter((x) => racines.test(x.type)).map((x) => args(x.args)[0]!.slice(1, -1));
    expect(guids.length).toBeGreaterThan(10);
    expect(new Set(guids).size).toBe(guids.length);
    for (const g of guids) expect(g).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(studioIfcGuid("k|m1")).toBe(studioIfcGuid("k|m1"));
    expect(studioIfcGuid("k|m1")).not.toBe(studioIfcGuid("k|m2"));
    // Même objet, même GlobalId quand le reste du document change.
    const wallGuid = (ifc: string) => /IFCWALL\('([^']*)'/.exec(ifc)![1];
    const autre = applyStudioCommands(sample(), [{ toolId: "studio.dessin.supprimer", params: { ids: ["s1"] } }]);
    expect(autre.objects.some((o) => o.id === "s1")).toBe(false);
    expect(wallGuid(exportStudioIfc(autre, meta))).toBe(wallGuid(a));
  });

  it("place un mur diagonal à son départ, orienté le long de la ligne, profil longueur × épaisseur centré, base et hauteur déclarées", () => {
    const ifc = exportStudioIfc(sample(), meta);
    const e = entities(ifc);
    const wall = [...e.values()].find((x) => x.type === "IFCWALL")!;
    const [, , name, , , placementRef, shapeRef, tag] = args(wall.args);
    expect([name, tag]).toEqual(["'m1'", "'m1'"]);
    const placement = e.get(refOf(placementRef!))!;
    expect(placement.type).toBe("IFCLOCALPLACEMENT");
    const [relativeTo, axisRef] = args(placement.args);
    expect(e.get(refOf(relativeTo!))!.type).toBe("IFCLOCALPLACEMENT");
    const [locRef, zRef, xRef] = args(e.get(refOf(axisRef!))!.args);
    expect(reals(e.get(refOf(locRef!))!.args)).toEqual([1, 2, 0.5]);
    expect(reals(e.get(refOf(zRef!))!.args)).toEqual([0, 0, 1]);
    expect(reals(e.get(refOf(xRef!))!.args)).toEqual([0.6, 0.8, 0]);
    const reps = args(e.get(refOf(shapeRef!))!.args)[2]!.replace(/[()]/g, "").split(",").map((r) => e.get(refOf(r))!);
    expect(reps.map((r) => args(r.args).slice(1, 3).join(" "))).toEqual(["'Body' 'SweptSolid'", "'Axis' 'Curve2D'"]);
    const solid = e.get(refOf(args(reps[0]!.args)[3]!.replace(/[()]/g, "")))!;
    expect(solid.type).toBe("IFCEXTRUDEDAREASOLID");
    const [profileRef, position, dirRef, depth] = args(solid.args);
    expect(position).toBe("$");
    expect(reals(e.get(refOf(dirRef!))!.args)).toEqual([0, 0, 1]);
    expect(Number(depth)).toBe(2.5);
    const profile = args(e.get(refOf(profileRef!))!.args);
    expect(profile.slice(3).map(Number)).toEqual([5, 0.2]);
    const [centreRef] = args(e.get(refOf(profile[2]!))!.args);
    expect(reals(e.get(refOf(centreRef!))!.args)).toEqual([2.5, 0]);
  });

  it("calques : nom, identifiant, visibilité et verrou ; propriétés d'extrusion déclarées", () => {
    const ifc = exportStudioIfc(sample(), meta);
    expect(ifc).toMatch(/IFCPRESENTATIONLAYERWITHSTYLE\('Murs ext\\X2\\00E9\\X0\\rieurs',\$,\(#\d+\),'murs',\.T\.,\.F\.,\.T\.,\(\)\);/);
    expect(ifc).toMatch(/IFCPRESENTATIONLAYERWITHSTYLE\('Cach\\X2\\00E9\\X0\\',\$,\(#\d+\),'cache',\.F\.,\.F\.,\.F\.,\(\)\);/);
    expect(ifc).toMatch(/IFCPRESENTATIONLAYERWITHSTYLE\('0',\$,\(#\d+\),'default',\.T\.,\.F\.,\.F\.,\(\)\);/);
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Thickness',$,IFCLENGTHMEASURE(0.2),$)");
    expect(ifc).toContain("IFCPROPERTYSINGLEVALUE('Base',$,IFCLENGTHMEASURE(-0.2),$)");
  });

  it("document sans objet extrudé : structure seule, aucun élément ; métadonnées vides refusées", () => {
    const ifc = exportStudioIfc(newStudioDocument("vide"), { studyName: "É", variantName: "V", timestamp: "2026-10-18T00:00:00" });
    expect(count(ifc, "IFCPROJECT")).toBe(1);
    expect(count(ifc, "IFCRELCONTAINEDINSPATIALSTRUCTURE")).toBe(0);
    expect(count(ifc, "IFCPRESENTATIONLAYERWITHSTYLE")).toBe(0);
    expect(() => exportStudioIfc(newStudioDocument("vide"), { ...meta, studyName: " " })).toThrow(StudioValidationError);
    expect(() => exportStudioIfc({ ...newStudioDocument("x"), units: "mm" } as unknown as StudioDocument, meta)).toThrow(StudioValidationError);
  });

  it("chaînes et réels STEP", () => {
    expect(studioStepString("l'a\\b\né")).toBe("'l''a\\\\b\\X2\\00E9\\X0\\'");
    expect(studioStepReal(2)).toBe("2.");
    expect(studioStepReal(-0)).toBe("0.");
    expect(studioStepReal(0.1 + 0.2)).toBe("0.3");
    expect(studioStepReal(1e-12)).toBe("0.");
  });
});
