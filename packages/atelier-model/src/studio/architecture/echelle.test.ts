import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "../export.js";
import { exportStudioIfc, studioIfcSummary } from "../ifc.js";
import { studioStepString } from "../exporteurs/ifc-step.js";
import { studioMesh3d } from "../mesh-3d.js";
import { quantitesStudio } from "../quantites.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "../registry.js";
import { geometrieEchelle, metreEchelle } from "./echelle.js";
import { studioQuantitesArchitecture } from "./quantites.js";
import type { StudioLadder } from "./types.js";

/**
 * EX-027 (lot G2) — cas positif : l'outil « Échelle d'accès » (`studio.architecture.echelle-acces`), identifiant
 * distinct de la transformation « Échelle » (`studio.dessin.echelle`), au registre des outils, avec sa géométrie, ses
 * propriétés, son plan, sa vue 3D et ses exports. Les dimensions ci-dessous sont des **données de test synthétiques**
 * (entre-axe 0,5 m, hauteur 3 m, 9 échelons, section 0,04 m), pas des valeurs de projet ni des règles : Studio n'en
 * propose aucune.
 */
const echelle = (over: Partial<StudioLadder> = {}): StudioLadder => ({ id: "e1", type: "ladder", position: { x: 2, y: 1 }, rotation: 0, width: 0.5, height: 3, base: 0, rungs: 9, section: 0.04, ...over });
const cmd = (c: unknown) => c as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(cmd));
const creer = (over: Partial<StudioLadder> = {}) => avec(newStudioDocument("ex027"), { toolId: "studio.architecture.echelle-acces", params: echelle(over) });
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "accepté"; };
const proche = (a: number, b: number) => expect(a).toBeCloseTo(b, 12);

/** Volume d'un maillage fermé orienté (théorème de la divergence). */
function volumeMaillage(m: { vertices: { x: number; y: number; z: number }[]; triangles: [number, number, number][] }): number {
  let v = 0;
  for (const [a, b, c] of m.triangles) {
    const p = m.vertices[a]!, q = m.vertices[b]!, r = m.vertices[c]!;
    v += (p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x)) / 6;
  }
  return v;
}

describe("EX-027 [+] — Échelle d'accès : outil du registre, géométrie, propriétés, plan, 3D, exports (lot G2)", () => {
  it("registre : mutation de la barre Architecture, Ctrl+Maj+F8, icône propre, acceptée par l'API et appliquée par le modèle ; distincte de la transformation Échelle", () => {
    const t = STUDIO_TOOLS.find((x) => x.toolId === "studio.architecture.echelle-acces")!;
    expect(t).toMatchObject({ libelleFR: "Échelle d’accès", raccourci: "Ctrl+Shift+F8", iconeSymbolique: "studio-ladder", groupe: "architecture", nature: "mutation", agentExposure: "none" });
    expect(STUDIO_COMMAND_TOOL_IDS).toContain("studio.architecture.echelle-acces");
    const transformation = STUDIO_TOOLS.find((x) => x.toolId === "studio.dessin.echelle")!;
    expect(transformation.groupe).toBe("modification");
    expect(t.iconeSymbolique).not.toBe(transformation.iconeSymbolique);
    expect(t.raccourci).not.toBe(transformation.raccourci);
    const d = creer();
    expect(d.architecture).toEqual([echelle()]);
    expect(validateStudioDocument(d)).toEqual(d);
  });

  it("géométrie dérivée : deux montants de section carrée, échelons au pas hauteur / (n + 1), emprise ; orientation suivie", () => {
    const g = geometrieEchelle(echelle());
    expect(g.pas).toBeCloseTo(0.3, 12);
    expect(g.cotesEchelons).toHaveLength(9);
    proche(g.cotesEchelons[0]!, 0.3);
    proche(g.cotesEchelons[8]!, 2.7);
    expect(g.montants[0]).toEqual([{ x: 1.73, y: 0.98 }, { x: 1.77, y: 0.98 }, { x: 1.77, y: 1.02 }, { x: 1.73, y: 1.02 }].map((p) => ({ x: expect.closeTo(p.x, 12), y: expect.closeTo(p.y, 12) })));
    expect(g.echelons.map((p) => p.x)).toEqual([expect.closeTo(1.77, 12), expect.closeTo(2.23, 12), expect.closeTo(2.23, 12), expect.closeTo(1.77, 12)]);
    // Orientation : un quart de tour envoie la largeur sur l'axe y.
    const r = geometrieEchelle(echelle({ rotation: Math.PI / 2 }));
    const xs = r.emprise.map((p) => p.x), ys = r.emprise.map((p) => p.y);
    proche(Math.max(...ys) - Math.min(...ys), 0.54);
    proche(Math.max(...xs) - Math.min(...xs), 0.04);
  });

  it("vue 3D : montants et échelons maillés sous le même identifiant, volume du maillage = volume de matière du métré", () => {
    const d = creer();
    const m = studioMesh3d(d);
    const a = m.architecture!.find((x) => x.id === "e1")!;
    expect(a.type).toBe("ladder");
    const volume = metreEchelle(echelle()).volume;
    proche(volume, 0.04 * 0.04 * (2 * 3 + 9 * 0.46));
    proche(volumeMaillage(a), volume);
    expect(m.bounds).toEqual({ min: { x: expect.closeTo(1.73, 12), y: expect.closeTo(0.98, 12), z: 0 }, max: { x: expect.closeTo(2.27, 12), y: expect.closeTo(1.02, 12), z: 3 } });
  });

  it("métré : longueur cumulée des montants et des échelons, hauteur, volume ; nombre et pas des échelons dans le métré architectural", () => {
    const d = creer();
    const q = quantitesStudio(d).objets.find((o) => o.objetId === "e1")!;
    expect(q.nature).toBe("echelle-acces");
    expect(q.valeurs.map((v) => [v.grandeur, v.unite])).toEqual([["longueur", "m"], ["hauteur", "m"], ["volume", "m3"]]);
    proche(q.valeurs[0]!.valeur!, 6 + 9 * 0.46);
    proche(q.valeurs[1]!.valeur!, 3);
    expect(studioQuantitesArchitecture(d.architecture!)).toEqual([expect.objectContaining({ id: "e1", type: "ladder", echelons: 9, pas: expect.closeTo(0.3, 12) })]);
  });

  it("propriétés : valeurs saisies modifiées par « Modifier l'élément architectural » (même identité), propriété BIM déclarée sur l'échelle", () => {
    const d = avec(creer(),
      { toolId: "studio.architecture.modifier", params: echelle({ rungs: 11, height: 3.6 }) },
      { toolId: "studio.propriete.definir", params: { cibleId: "e1", nom: "Matériau déclaré", valeur: "acier", source: "saisie" } },
    );
    expect(d.architecture![0]).toMatchObject({ id: "e1", rungs: 11, height: 3.6 });
    expect(d.proprietes).toEqual([{ cibleId: "e1", nom: "Matériau déclaré", valeur: "acier", source: "saisie" }]);
    expect(geometrieEchelle(d.architecture![0] as StudioLadder).pas).toBeCloseTo(0.3, 12);
  });

  it("plan : SVG et DXF tracent les montants et le contour des échelons sur le calque de l'échelle", () => {
    const d = avec(newStudioDocument("ex027"), { toolId: "studio.calque.creer", params: { id: "acces", name: "Accès", visible: true, locked: false } },
      { toolId: "studio.architecture.echelle-acces", params: { ...echelle(), layerId: "acces" } });
    const svg = exportStudioSvg(d);
    expect(svg).toContain('data-architecture="ladder" data-id="e1" data-rungs="9"');
    expect((svg.match(/<polygon/g) ?? []).length).toBe(3);
    const dxf = exportStudioDxf(d);
    expect((dxf.match(/\r\nPOLYLINE\r\n/g) ?? []).length).toBe(3);
    expect(dxf).toMatch(/\r\n8\r\nACCES\r\n|\r\n8\r\nAcces\r\n/);
  });

  it("IFC : IfcStair de type LADDER, montants et échelons extrudés exacts, jeu de propriétés Fadi_StudioLadder ; propriété déclarée exportée", () => {
    const d = avec(creer(), { toolId: "studio.propriete.definir", params: { cibleId: "e1", nom: "Matériau déclaré", valeur: "acier", source: "saisie" } });
    const ifc = exportStudioIfc(d, { studyName: "Étude", variantName: "Variante", timestamp: "2026-10-26T00:00:00" });
    expect(ifc).toMatch(/IFCSTAIR\('[^']+',\$,'e1',\$,\$,#\d+,#\d+,'e1',\.LADDER\.\)/);
    expect((ifc.match(/IFCEXTRUDEDAREASOLID\(/g) ?? []).length).toBe(2 + 9);
    expect(ifc).toContain("'Fadi_StudioLadder'");
    expect(ifc).toContain("'RungCount',$,IFCINTEGER(9)");
    expect(ifc).toContain("'ArchitecturalLadders',$,IFCINTEGER(1)");
    expect(ifc).toContain(studioStepString("Matériau déclaré"));
    expect(studioIfcSummary(d).architecture).toMatchObject({ walls: 0, ladders: 1 });
  });

  it("transformations : déplacer, pivoter, copier, symétrie, échelle (volumes aussi), calque, supprimer — même identité, copies à identifiants nouveaux", () => {
    let d = creer();
    d = avec(d, { toolId: "studio.dessin.deplacer", params: { id: "e1", dx: 1, dy: 2 } });
    expect(d.architecture![0]).toMatchObject({ position: { x: 3, y: 3 } });
    d = avec(d, { toolId: "studio.dessin.rotation", params: { ids: ["e1"], center: { x: 3, y: 3 }, angle: Math.PI / 2 } });
    expect((d.architecture![0] as StudioLadder).rotation).toBeCloseTo(Math.PI / 2, 12);
    d = avec(d, { toolId: "studio.dessin.copier", params: { ids: ["e1"], dx: 5, dy: 0, copies: 2, prefix: "k" } });
    expect(d.architecture!.map((x) => x.id)).toHaveLength(3);
    expect(d.architecture!.slice(1).every((x) => x.type === "ladder")).toBe(true);
    d = avec(d, { toolId: "studio.dessin.echelle", params: { ids: ["e1"], center: { x: 3, y: 3 }, factor: 2, includeVolumes: true } });
    expect(d.architecture![0]).toMatchObject({ width: 1, height: 6, section: 0.08, rungs: 9 });
    d = avec(d, { toolId: "studio.calque.creer", params: { id: "acces", name: "Accès", visible: true, locked: false } }, { toolId: "studio.objet.calque", params: { ids: ["e1"], layerId: "acces" } });
    expect(d.architecture![0]).toMatchObject({ layerId: "acces" });
    d = avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["e1"] } });
    expect(d.architecture!.some((x) => x.id === "e1")).toBe(false);
  });
});

describe("EX-027 [−] — Échelle d'accès : refus, jamais corrigée en silence (lot G2)", () => {
  it("aucune valeur par défaut : champ absent, nul, négatif ou non entier refusé ; section qui ne laisse aucun échelon ; échelons qui se touchent ; orientation hors [0 ; 2π[", () => {
    const { section: _s, ...sansSection } = echelle();
    expect(refus(() => avec(newStudioDocument("x"), { toolId: "studio.architecture.echelle-acces", params: sansSection }))).toMatch(/champs absents/);
    expect(refus(() => creer({ width: 0 }))).toMatch(/largeur strictement positive/);
    expect(refus(() => creer({ rungs: 2.5 }))).toMatch(/nombre entier d’échelons/);
    expect(refus(() => creer({ rungs: 0 }))).toMatch(/nombre entier d’échelons/);
    expect(refus(() => creer({ section: 0.5 }))).toMatch(/ne laisse aucun échelon/);
    expect(refus(() => creer({ rungs: 99 }))).toMatch(/se touchent/);
    expect(refus(() => creer({ rotation: 7 }))).toMatch(/orientation/);
    expect(refus(() => avec(newStudioDocument("x"), { toolId: "studio.architecture.echelle-acces", params: { ...echelle(), extra: 1 } }))).not.toBe("accepté");
  });

  it("identifiant déjà pris, calque verrouillé, ouverture dans une échelle, changement de nature : refus, document inchangé", () => {
    const d = creer();
    expect(refus(() => avec(d, { toolId: "studio.architecture.echelle-acces", params: echelle() }))).not.toBe("accepté");
    const verrou = avec(newStudioDocument("x"), { toolId: "studio.calque.creer", params: { id: "v", name: "V", visible: true, locked: true } });
    expect(refus(() => avec(verrou, { toolId: "studio.architecture.echelle-acces", params: { ...echelle(), layerId: "v" } }))).toMatch(/verrouill/);
    expect(refus(() => avec(d, { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "e1", position: 0, width: 0.2, height: 0.2, sill: 0 } }))).toMatch(/n’est pas un mur/);
    expect(refus(() => avec(d, { toolId: "studio.architecture.modifier", params: { id: "e1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 1, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } }))).toMatch(/ne peut pas changer/);
    expect(d.architecture).toEqual([echelle()]);
  });
});
