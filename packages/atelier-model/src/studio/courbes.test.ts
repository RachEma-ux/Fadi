import { describe, expect, it } from "vitest";
import {
  studioArcFromCenter, studioArcFromThreePoints, studioArcSweep, studioBulgeArc, studioCirclePoints, studioOffset, studioPolylinePath,
  studioPathSimple, studioRingSimple, studioShapeAnchors, studioShapeBoundPoints, studioSignedArea, studioSvgPath, studioTriangulate, STUDIO_ONGLET_MAX,
} from "./courbes.js";
import { comparerDocumentsStudio } from "./comparaison.js";
import {
  applyStudioCommands, newStudioDocument, studioAnchorPoint, studioExtrudedRingVertices, STUDIO_LIMITS, StudioValidationError, validateStudioDocument,
  type StudioArc, type StudioCircle, type StudioCommand, type StudioDocument, type StudioPolyline, type StudioShape,
} from "./document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "./export.js";
import { composerFeuilleStudio } from "./feuille.js";
import { exportStudioIfc, studioIfcSummary } from "./ifc.js";
import { lireDxfStudio } from "./import-dxf.js";
import { studioMesh3d } from "./mesh-3d.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOLS } from "./registry.js";

const cercle = (over: Partial<StudioCircle> = {}): StudioCircle => ({ id: "c1", type: "circle", center: { x: 2, y: 3 }, radius: 1.5, ...over });
const arc = (over: Partial<StudioArc> = {}): StudioArc => ({ id: "a1", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2, ...over });
const carre = (over: Partial<StudioPolyline> = {}): StudioPolyline => ({ id: "p1", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], closed: true, ...over });
const enL = (): StudioPolyline => ({ id: "L", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }], closed: true });
const doc = (...objects: StudioShape[]): StudioDocument => ({ ...newStudioDocument("d"), objects });
const appliquer = (d: StudioDocument, ...c: unknown[]) => applyStudioCommands(d, c as StudioCommand[]);
const refuse = (d: StudioDocument, ...c: unknown[]) => expect(() => appliquer(d, ...c)).toThrow(StudioValidationError);
const aire = (pts: { x: number; y: number }[], tris: [number, number, number][]) =>
  tris.reduce((s, [a, b, c]) => s + ((pts[b]!.x - pts[a]!.x) * (pts[c]!.y - pts[a]!.y) - (pts[b]!.y - pts[a]!.y) * (pts[c]!.x - pts[a]!.x)) / 2, 0);

describe("Studio — courbes : document et validation", () => {
  it("cercle, arc et polyligne se créent, se relisent à l'identique ; un document V1 reste inchangé", () => {
    const d = appliquer(newStudioDocument("d"),
      { toolId: "studio.dessin.cercle", params: cercle() },
      { toolId: "studio.dessin.arc", params: arc() },
      { toolId: "studio.dessin.polyligne", params: carre({ bulges: [0, 0.5, 0, 0] }) },
    );
    expect(d.objects).toEqual([cercle(), arc(), carre({ bulges: [0, 0.5, 0, 0] })]);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const v1 = doc({ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, { id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 1, height: 1 });
    expect(validateStudioDocument(v1)).toEqual(v1);
  });

  it("renflements tous nuls omis (forme canonique) ; -0 ramené à 0", () => {
    expect(validateStudioDocument(doc(carre({ bulges: [0, 0, -0, 0] }))).objects[0]).toEqual(carre());
    expect((validateStudioDocument(doc(carre({ bulges: [0, -0, 0.25, 0] }))).objects[0] as StudioPolyline).bulges).toEqual([0, 0, 0.25, 0]);
  });

  it.each([
    ["rayon nul", cercle({ radius: 0 })],
    ["rayon négatif", cercle({ radius: -1 })],
    ["rayon infini", cercle({ radius: Infinity })],
    ["emprise infinie", cercle({ center: { x: 1.7e308, y: 0 }, radius: 1.7e308 })],
    ["cercle avec épaisseur", cercle({ extrusion: { base: 0, height: 1, thickness: 0.2 } as never })],
    ["champ inconnu", { ...cercle(), diametre: 3 }],
    ["angle négatif", arc({ startAngle: -0.1 })],
    ["angle de 2π", arc({ endAngle: 2 * Math.PI })],
    ["angles égaux", arc({ endAngle: 0 })],
    ["arc : épaisseur ≥ diamètre", arc({ extrusion: { base: 0, height: 1, thickness: 4 } })],
    ["un seul sommet", carre({ points: [{ x: 0, y: 0 }], closed: false })],
    ["sommets consécutifs confondus", carre({ points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }] })],
    ["fermeture confondue", carre({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }] })],
    ["fermée à deux sommets droits", carre({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] })],
    ["renflements de mauvaise longueur", carre({ bulges: [0, 1] })],
    ["renflement infini", carre({ bulges: [0, Infinity, 0, 0] })],
    ["renflement hors limites", carre({ bulges: [0, 2e6, 0, 0] })],
    ["polyligne avec épaisseur", carre({ extrusion: { base: 0, height: 1, thickness: 0.2 } as never })],
    ["polyligne fermée extrudée qui se croise", carre({ points: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }], extrusion: { base: 0, height: 1 } })],
    ["fermée sans booléen", { ...carre(), closed: 1 }],
  ])("refuse : %s", (_nom, o) => {
    expect(() => validateStudioDocument(doc(o as StudioShape))).toThrow(StudioValidationError);
  });

  it("une polyligne fermée à deux sommets avec un segment courbe est valide (demi-lune)", () => {
    const lune = carre({ points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], bulges: [1, 0] });
    expect(validateStudioDocument(doc(lune)).objects[0]).toEqual(lune);
  });

  it("déplacer, modifier, placer sur un calque, supprimer : chaque type", () => {
    let d = doc(cercle(), arc(), carre());
    d = appliquer(d,
      { toolId: "studio.dessin.deplacer", params: { id: "c1", dx: 1, dy: -1 } },
      { toolId: "studio.dessin.deplacer", params: { id: "a1", dx: 2, dy: 0 } },
      { toolId: "studio.dessin.deplacer", params: { id: "p1", dx: 0, dy: 1 } },
      { toolId: "studio.calque.creer", params: { id: "k", name: "Courbes", visible: true, locked: false } },
      { toolId: "studio.objet.calque", params: { ids: ["c1", "p1"], layerId: "k" } },
      { toolId: "studio.dessin.modifier", params: { ...arc({ center: { x: 2, y: 0 } }), radius: 3 } },
    );
    expect(d.objects[0]).toEqual({ ...cercle({ center: { x: 3, y: 2 } }), layerId: "k" });
    expect(d.objects[1]).toEqual(arc({ center: { x: 2, y: 0 }, radius: 3 }));
    expect((d.objects[2] as StudioPolyline).points[2]).toEqual({ x: 4, y: 5 });
    expect(appliquer(d, { toolId: "studio.dessin.supprimer", params: { ids: ["c1", "a1", "p1"] } }).objects).toEqual([]);
    // Le type ne change pas par modification.
    refuse(d, { toolId: "studio.dessin.modifier", params: { ...cercle(), type: "arc", startAngle: 0, endAngle: 1 } });
  });

  it("sommets nommés : centre, quadrants, extrémités et milieu d'arc, sommets et milieux de polyligne", () => {
    expect(studioShapeAnchors(cercle())).toEqual(["center", "quadrant-0", "quadrant-90", "quadrant-180", "quadrant-270"]);
    expect(studioAnchorPoint(cercle(), "quadrant-90")).toEqual({ x: 2, y: 4.5 });
    expect(studioAnchorPoint(arc(), "start")).toEqual({ x: 2, y: 0 });
    expect(studioAnchorPoint(arc(), "end")!.x).toBeCloseTo(0, 12);
    expect(studioAnchorPoint(arc(), "mid")!.x).toBeCloseTo(Math.SQRT2, 12);
    expect(studioShapeAnchors(carre())).toEqual(["vertex-0", "vertex-1", "vertex-2", "vertex-3", "mid-0", "mid-1", "mid-2", "mid-3"]);
    expect(studioAnchorPoint(carre(), "mid-3")).toEqual({ x: 0, y: 2 });
    expect(studioAnchorPoint(carre(), "vertex-4")).toBeNull();
    expect(studioAnchorPoint(carre(), "center")).toBeNull();
    expect(studioAnchorPoint({ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 4 } }, "mid")).toEqual({ x: 1, y: 2 });
  });

  it("une cote liée au centre d'un cercle et au sommet d'une polyligne suit leurs déplacements", () => {
    const cote = { id: "k1", type: "dimension", start: { x: 2, y: 3 }, end: { x: 0, y: 4 }, offset: 0.5, links: { start: { objectId: "c1", anchor: "center" }, end: { objectId: "p1", anchor: "vertex-3" } }, toResolve: false };
    let d = appliquer(doc(cercle(), carre()), { toolId: "studio.dessin.cote", params: cote });
    d = appliquer(d, { toolId: "studio.dessin.deplacer", params: { id: "c1", dx: 1, dy: 1 } }, { toolId: "studio.dessin.deplacer", params: { id: "p1", dx: 0, dy: 2 } });
    expect(d.dimensions![0]).toMatchObject({ start: { x: 3, y: 4 }, end: { x: 0, y: 6 } });
    // Index au format canonique seulement.
    refuse(doc(carre()), { toolId: "studio.dessin.cote", params: { ...cote, start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, links: { start: { objectId: "p1", anchor: "vertex-00" }, end: null } } });
    // Une polyligne qui perd le sommet coté : modification refusée (la cote ne se rattache pas ailleurs).
    refuse(d, { toolId: "studio.dessin.modifier", params: { ...carre(), points: [{ x: 9, y: 9 }, { x: 8, y: 9 }] , closed: false } });
  });

  it("extrusion : cercle et polyligne fermée en prisme, arc avec ou sans épaisseur, polyligne ouverte en surface ; refus motivés", () => {
    const ouverte = carre({ id: "o", closed: false });
    const croisee = carre({ id: "x", points: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }] });
    const d0 = doc(cercle(), arc(), carre(), ouverte, croisee);
    const d = appliquer(d0,
      { toolId: "studio.objet.extruder", params: { ids: ["c1", "p1", "o"], base: 0, height: 3 } },
      { toolId: "studio.objet.extruder", params: { ids: ["a1"], base: 0, height: 3, thickness: 0.2 } },
    );
    expect(d.objects.filter((o) => o.extrusion).map((o) => o.id)).toEqual(["c1", "a1", "p1", "o"]);
    refuse(d0, { toolId: "studio.objet.extruder", params: { ids: ["c1"], base: 0, height: 3, thickness: 0.2 } });
    refuse(d0, { toolId: "studio.objet.extruder", params: { ids: ["o"], base: 0, height: 3, thickness: 0.2 } });
    refuse(d0, { toolId: "studio.objet.extruder", params: { ids: ["x"], base: 0, height: 3 } });
    refuse(d0, { toolId: "studio.objet.extruder", params: { ids: ["a1"], base: 0, height: 3, thickness: 4 } });
  });
});

describe("Studio — courbes : géométrie pure", () => {
  it("renflement → arc : demi-cercle, quart de cercle horaire", () => {
    const demi = studioBulgeArc({ x: 0, y: 0 }, { x: 2, y: 0 }, 1)!;
    expect(demi.center.x).toBeCloseTo(1, 12);
    expect(demi.center.y).toBeCloseTo(0, 12);
    expect(demi.radius).toBeCloseTo(1, 12);
    expect(demi.sweep).toBeCloseTo(Math.PI, 12);
    const quart = studioBulgeArc({ x: 1, y: 0 }, { x: 0, y: -1 }, -Math.tan(Math.PI / 8))!;
    expect(quart.center.x).toBeCloseTo(0, 12);
    expect(quart.center.y).toBeCloseTo(0, 12);
    expect(quart.sweep).toBeCloseTo(-Math.PI / 2, 12);
    expect(studioBulgeArc({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBeNull();
  });

  it("discrétisation déterministe : 64 segments par tour, quadrants exacts, sommets saisis exacts", () => {
    const pts = studioCirclePoints({ x: 1, y: 1 }, 2);
    expect(pts).toHaveLength(64);
    expect([pts[0], pts[16], pts[32], pts[48]]).toEqual([{ x: 3, y: 1 }, { x: 1, y: 3 }, { x: -1, y: 1 }, { x: 1, y: -1 }]);
    const path = studioPolylinePath(carre({ bulges: [0, 1, 0, 0] }));
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path).toContainEqual({ x: 4, y: 4 });
    expect(path).toHaveLength(4 + 31);
    expect(studioPolylinePath(carre({ bulges: [0, 1, 0, 0] }))).toEqual(path);
  });

  it("bornes exactes d'un arc et d'une polyligne courbe", () => {
    const pts = studioShapeBoundPoints(arc({ startAngle: (3 * Math.PI) / 2, endAngle: Math.PI / 2 }));
    expect(Math.max(...pts.map((p) => p.x))).toBe(2);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(0, 12);
    const lune = studioShapeBoundPoints(carre({ points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], bulges: [1, 0] }));
    expect(Math.min(...lune.map((p) => p.y))).toBeCloseTo(-1, 12);
  });

  it("arc par trois points (rangé dans le sens trigonométrique) et par centre", () => {
    const a = studioArcFromThreePoints({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })!;
    expect(a.center.x).toBeCloseTo(0, 12);
    expect(a.radius).toBeCloseTo(1, 12);
    expect([a.startAngle, a.endAngle]).toEqual([0, Math.PI]);
    // Passage par le bas : sens horaire saisi → début et fin échangés.
    const b = studioArcFromThreePoints({ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 })!;
    expect(b.startAngle).toBeCloseTo(Math.PI, 12);
    expect(b.endAngle).toBe(0);
    expect(studioArcFromThreePoints({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
    const c = studioArcFromCenter({ x: 0, y: 0 }, { x: 0, y: 2 }, { x: -5, y: 0 })!;
    expect(c).toEqual({ center: { x: 0, y: 0 }, radius: 2, startAngle: Math.PI / 2, endAngle: Math.PI });
    expect(studioArcFromCenter({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(studioArcSweep(1.5 * Math.PI, 0.5 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it("anneau simple et triangulation par oreilles d'un contour concave", () => {
    expect(studioRingSimple(enL().points)).toBe(true);
    expect(studioRingSimple([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }])).toBe(false);
    expect(studioRingSimple([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 }])).toBe(false);
    const tris = studioTriangulate(enL().points);
    expect(tris).toHaveLength(4);
    expect(aire(enL().points, tris)).toBeCloseTo(studioSignedArea(enL().points), 12);
    expect(tris.every(([a, b, c]) => aire(enL().points, [[a, b, c]]) > 0)).toBe(true);
  });

  it("chemin SVG : arcs exacts, sens retourné quand l'axe y l'est", () => {
    expect(studioSvgPath(arc(), false)).toMatch(/^M 2 0 A 2 2 0 0 1 /);
    expect(studioSvgPath(arc(), true)).toMatch(/^M 2 0 A 2 2 0 0 0 /);
    expect(studioSvgPath(cercle(), false)).toBe("M 3.5 3 A 1.5 1.5 0 1 1 0.5 3 A 1.5 1.5 0 1 1 3.5 3 Z");
    expect(studioSvgPath(carre({ bulges: [0, 1, 0, 0] }), false)).toBe("M 0 0 L 4 0 A 2 2 0 0 1 4 4 L 0 4 L 0 0 Z");
  });
});

describe("Studio — décalage (studio.dessin.decaler)", () => {
  const ok = (o: StudioShape, d: number) => {
    const r = studioOffset(o, d, "n");
    if (!r.ok) throw new Error(r.raison);
    return r.shape;
  };

  it("ligne à gauche, cercle et arc vers l'extérieur, rectangle agrandi", () => {
    expect(ok({ id: "l", type: "line", layerId: "k", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }, 1)).toEqual({ id: "n", type: "line", layerId: "k", start: { x: 0, y: 1 }, end: { x: 4, y: 1 } });
    expect(ok(cercle(), -0.5)).toEqual({ id: "n", type: "circle", center: { x: 2, y: 3 }, radius: 1 });
    expect(ok(arc({ extrusion: { base: 0, height: 1 } }), 1)).toEqual({ id: "n", type: "arc", center: { x: 0, y: 0 }, radius: 3, startAngle: 0, endAngle: Math.PI / 2 });
    expect(ok({ id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 1 }, 0.5)).toEqual({ id: "n", type: "rectangle", origin: { x: -0.5, y: -0.5 }, width: 3, height: 2 });
    expect(studioOffset(cercle(), -2, "n")).toMatchObject({ ok: false });
    expect(studioOffset(cercle(), 0, "n")).toMatchObject({ ok: false });
  });

  it("polyligne fermée vers l'extérieur, quel que soit son sens ; ouverte en onglet à gauche", () => {
    expect(ok(carre(), 1)).toMatchObject({ points: [{ x: -1, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 5 }, { x: -1, y: 5 }], closed: true });
    const horaire = carre({ points: [...carre().points].reverse() });
    expect((ok(horaire, 1) as StudioPolyline).points).toEqual([{ x: -1, y: 5 }, { x: 5, y: 5 }, { x: 5, y: -1 }, { x: -1, y: -1 }]);
    expect((ok(carre(), -1) as StudioPolyline).points).toEqual([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }]);
    const coude: StudioPolyline = { id: "o", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], closed: false };
    expect((ok(coude, 1) as StudioPolyline).points).toEqual([{ x: 0, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }]);
    // Décalage plus grand que le carré : refusé (segments retournés).
    expect(studioOffset(carre(), -3, "n")).toMatchObject({ ok: false });
  });

  it("polyligne à congés tangents : renflements gardés ; jonction non tangente refusée", () => {
    // Rectangle arrondi : segments droits et quarts de cercle tangents (renflement tan(π/8)).
    const b = Math.tan(Math.PI / 8);
    const arrondi: StudioPolyline = { id: "ra", type: "polyline", closed: true,
      points: [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 }, { x: 3, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }],
      bulges: [0, b, 0, b, 0, b, 0, b] };
    const r = ok(arrondi, 0.5) as StudioPolyline;
    expect(r.bulges).toEqual(arrondi.bulges);
    expect(r.points[0]).toEqual({ x: 1, y: -0.5 });
    expect(r.points[2]).toEqual({ x: 4.5, y: 1 });
    expect(() => validateStudioDocument(doc(r))).not.toThrow();
    const anguleux = carre({ bulges: [0.5, 0, 0, 0] });
    expect(studioOffset(anguleux, 0.5, "n")).toMatchObject({ ok: false, raison: expect.stringContaining("tangente") });
  });

  it("commande : nouvel objet sur le même calque, non extrudé ; refus motivés", () => {
    const d0 = doc({ ...carre({ extrusion: { base: 0, height: 2 } }) });
    const d = appliquer(d0, { toolId: "studio.dessin.decaler", params: { id: "p1", newId: "p2", distance: 0.5 } });
    expect(d.objects).toHaveLength(2);
    expect(d.objects[1]).toEqual({ id: "p2", type: "polyline", points: [{ x: -0.5, y: -0.5 }, { x: 4.5, y: -0.5 }, { x: 4.5, y: 4.5 }, { x: -0.5, y: 4.5 }], closed: true });
    refuse(d, { toolId: "studio.dessin.decaler", params: { id: "p1", newId: "p2", distance: 1 } });
    refuse(d, { toolId: "studio.dessin.decaler", params: { id: "absent", newId: "p3", distance: 1 } });
    refuse(d, { toolId: "studio.dessin.decaler", params: { id: "p1", newId: "p3", distance: 0 } });
    refuse(d, { toolId: "studio.dessin.decaler", params: { id: "p1", newId: "p3", distance: -9 } });
    refuse(d, { toolId: "studio.dessin.decaler", params: { id: "p1", newId: "p3", distance: 1, extra: 1 } });
  });
});

describe("Studio — courbes dans les échanges et vues dérivées", () => {
  const d = (): StudioDocument => doc(cercle(), arc(), carre({ bulges: [0, 1, 0, 0] }), { id: "o", type: "polyline", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], closed: false });

  it("SVG : <circle> et <path> à arcs exacts ; bornes exactes", () => {
    const svg = exportStudioSvg(d());
    expect(svg).toContain('<circle data-id="c1" cx="2" cy="-3" r="1.5" vector-effect="non-scaling-stroke"/>');
    expect(svg).toMatch(/<path data-id="a1" data-type="arc" d="M 2 0 A 2 2 0 0 0 0 -2"/);
    expect(svg).toContain('d="M 0 0 L 4 0 A 2 2 0 0 0 4 -4 L 0 -4 L 0 0 Z"');
  });

  it("DXF R12 : CIRCLE, ARC (degrés) et POLYLINE à renflements ; relu par l'import à l'identique", () => {
    const dxf = exportStudioDxf(d());
    expect(dxf).toContain("0\r\nCIRCLE\r\n8\r\n0\r\n10\r\n2\r\n20\r\n3\r\n30\r\n0\r\n40\r\n1.5\r\n");
    expect(dxf).toContain("0\r\nARC\r\n8\r\n0\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n40\r\n2\r\n50\r\n0\r\n51\r\n90\r\n");
    expect(dxf).toMatch(/VERTEX\r\n8\r\n0\r\n10\r\n4\r\n20\r\n0\r\n30\r\n0\r\n42\r\n1\r\n/);
    const r = lireDxfStudio(dxf);
    expect(r.rapport.entites).toMatchObject({ cercles: 1, arcs: 1, polylignes: 1, segments: 2, total: 5 });
    expect(r.rapport.nonPris).toEqual([]);
    const relu = applyStudioCommands(newStudioDocument("r"), r.commandes);
    expect(relu.objects[0]).toMatchObject({ type: "circle", center: { x: 2, y: 3 }, radius: 1.5 });
    const a = relu.objects[1] as StudioArc;
    expect(a.startAngle).toBe(0);
    expect(a.endAngle).toBeCloseTo(Math.PI / 2, 12);
    expect(relu.objects[2]).toMatchObject({ type: "polyline", closed: true, bulges: [0, 1, 0, 0] });
  });

  it("import : ARC et CIRCLE en millimètres, angles normalisés, rayon converti ; ARC sans angle compté", () => {
    const e = (t: string) => t.split("|").join("\r\n");
    const texte = e("0|SECTION|2|HEADER|9|$INSUNITS|70|4|0|ENDSEC|0|SECTION|2|ENTITIES|0|CIRCLE|8|0|10|1000|20|0|40|500|0|ARC|8|0|10|0|20|0|40|2000|50|-90|51|450|0|ARC|8|0|10|0|20|0|40|1|0|ENDSEC|0|EOF") + "\r\n";
    const r = lireDxfStudio(texte);
    expect(r.rapport.nonPris).toEqual([{ type: "ARC (angles manquants)", nombre: 1 }]);
    const o = applyStudioCommands(newStudioDocument("r"), r.commandes).objects;
    expect(o[0]).toEqual({ id: "dxf-1", type: "circle", center: { x: 1, y: 0 }, radius: 0.5 });
    expect(o[1]).toMatchObject({ type: "arc", radius: 2, startAngle: (3 * Math.PI) / 2 });
    expect((o[1] as StudioArc).endAngle).toBeCloseTo(Math.PI / 2, 12);
  });

  it("IFC : prismes (cercle exact, polyligne discrétisée), mur courbe, surfaces", () => {
    const x = appliquer(d(),
      { toolId: "studio.objet.extruder", params: { ids: ["c1", "p1", "o"], base: 0, height: 2.5 } },
      { toolId: "studio.objet.extruder", params: { ids: ["a1"], base: 0, height: 2.5, thickness: 0.2 } },
    );
    expect(studioIfcSummary(x)).toMatchObject({ walls: 1, surfaces: 1, prisms: 2, nonExtruded: 0 });
    const ifc = exportStudioIfc(x, { studyName: "É", variantName: "V", timestamp: "2026-10-18T00:00:00" });
    expect(ifc).toContain("IFCCIRCLEPROFILEDEF(.AREA.,$,");
    expect(ifc).toMatch(/IFCARBITRARYCLOSEDPROFILEDEF\(\.AREA\.,\$,#\d+\)/);
    expect(ifc).toMatch(/IFCWALL\('[^']+',\$,'a1'/);
    expect(exportStudioIfc(x, { studyName: "É", variantName: "V", timestamp: "2026-10-18T00:00:00" })).toBe(ifc);
  });

  it("3D : cylindre, prisme concave triangulé, mur courbe, surface ouverte ; contours plats discrétisés", () => {
    const x = appliquer(doc(cercle(), arc(), enL(), carre({ id: "o", closed: false })),
      { toolId: "studio.objet.extruder", params: { ids: ["c1", "L", "o"], base: 0, height: 2 } },
      { toolId: "studio.objet.extruder", params: { ids: ["a1"], base: 1, height: 2, thickness: 0.4 } },
    );
    const m = studioMesh3d(x);
    const s = Object.fromEntries(m.solids.map((v) => [v.id, v]));
    expect(s.c1).toMatchObject({ kind: "prism" });
    expect(s.c1!.vertices).toHaveLength(128);
    expect(s.L!.kind).toBe("prism");
    // Dessous + dessus : deux fois l'aire de l'emprise (prisme concave sans triangle débordant).
    const bas = s.L!.triangles.filter(([a, b, c]) => a < 6 && b < 6 && c < 6);
    expect(-aire(s.L!.vertices, bas)).toBeCloseTo(studioSignedArea(enL().points), 9);
    expect(s.a1).toMatchObject({ kind: "prism" });
    expect(Math.min(...s.a1!.vertices.map((v) => v.z))).toBe(1);
    expect(s.o).toMatchObject({ kind: "wall-surface" });
    const plat = studioMesh3d(doc(cercle(), arc()));
    expect(plat.outlines.map((o) => [o.type, o.closed, o.points.length])).toEqual([["circle", true, 64], ["arc", false, 17]]);
  });

  it("feuille : contours discrétisés (traits découpés) ; échelle ajustée sur les bornes exactes", () => {
    const f = composerFeuilleStudio(doc(cercle()), { format: "A4", orientation: "portrait", scale: "ajuster" });
    const prims = f.drawing.flatMap((l) => l.primitives);
    // Polygone non rempli : découpé en traits, un par côté du contour discrétisé.
    expect(prims.filter((p) => p.type === "ligne" && p.objetId === "c1")).toHaveLength(64);
    expect(f.scale.denominator).not.toBeNull();
  });

  it("comparaison : translation d'un cercle et d'une polyligne détectée ; rayon changé = géométrie modifiée", () => {
    const a = d();
    const b = appliquer(a, { toolId: "studio.dessin.deplacer", params: { id: "c1", dx: 1, dy: 0 } }, { toolId: "studio.dessin.deplacer", params: { id: "p1", dx: 0, dy: 2 } }, { toolId: "studio.dessin.modifier", params: arc({ radius: 3 }) });
    const diff = comparerDocumentsStudio(a, b);
    const parId = Object.fromEntries(diff.objets.map((o) => [o.id, o]));
    expect(parId.c1).toMatchObject({ etat: "modifie", deplacement: { dx: 1, dy: 0 } });
    expect(parId.p1).toMatchObject({ etat: "modifie", deplacement: { dx: 0, dy: 2 } });
    expect(parId.a1).toMatchObject({ etat: "modifie", proprietes: ["geometrie"], deplacement: null });
    expect(parId.o).toMatchObject({ etat: "identique" });
  });

  it("registre : quatre mutations propres (icône, raccourci, barre) et schéma de document additif", () => {
    const byId = Object.fromEntries(STUDIO_TOOLS.map((t) => [t.toolId, t]));
    expect(byId["studio.dessin.cercle"]).toMatchObject({ raccourci: "C", iconeSymbolique: "studio-circle", groupe: "dessin", nature: "mutation", agentExposure: "none" });
    expect(byId["studio.dessin.arc"]).toMatchObject({ raccourci: "A", iconeSymbolique: "studio-arc", groupe: "dessin" });
    expect(byId["studio.dessin.polyligne"]).toMatchObject({ raccourci: "P", iconeSymbolique: "studio-polyline", groupe: "dessin" });
    expect(byId["studio.dessin.decaler"]).toMatchObject({ raccourci: "O", iconeSymbolique: "studio-offset", groupe: "modification" });
    for (const id of ["studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne", "studio.dessin.decaler"]) expect(STUDIO_COMMAND_TOOL_IDS).toContain(id);
    expect(STUDIO_DOCUMENT_SCHEMA.properties.objects.items.oneOf.map((s) => s.properties.type.const)).toEqual(["line", "rectangle", "circle", "arc", "polyline"]);
    const lien = STUDIO_DOCUMENT_SCHEMA.properties.dimensions.items.properties.links.properties.start.oneOf[1];
    const motif = new RegExp(lien.properties.anchor.anyOf[1].pattern);
    expect(["vertex-0", "mid-12"].every((a) => motif.test(a))).toBe(true);
    expect(["vertex-01", "vertex-", "corner"].some((a) => motif.test(a))).toBe(false);
  });
});

describe("Studio — courbes : corrections de revue (#195)", () => {
  const dxfDe = (entites: string) => ["0|SECTION|2|HEADER|9|$INSUNITS|70|6|0|ENDSEC|0|SECTION|2|ENTITIES", entites, "0|ENDSEC|0|EOF"].join("|").split("|").join("\r\n") + "\r\n";

  it("import : polyligne fermée dont le dernier sommet répète le premier — le renflement de fermeture est gardé", () => {
    const r = lireDxfStudio(dxfDe("0|LWPOLYLINE|8|0|90|4|70|1|10|0|20|0|10|1|20|0|10|1|20|1|42|0.5|10|0|20|0"));
    expect(r.rapport.nonPris).toEqual([{ type: "LWPOLYLINE (segment de longueur nulle)", nombre: 1 }]);
    const [p] = applyStudioCommands(newStudioDocument("r"), r.commandes).objects;
    expect(p).toMatchObject({ type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], bulges: [0, 0, 0.5] });
  });

  it("import : ARC de 0° à 360° (angles confondus) = cercle", () => {
    const r = lireDxfStudio(dxfDe("0|ARC|8|0|10|1|20|2|40|3|50|0|51|360"));
    expect(r.rapport.nonPris).toEqual([]);
    expect(r.rapport.entites).toMatchObject({ cercles: 1, arcs: 0 });
    expect(applyStudioCommands(newStudioDocument("r"), r.commandes).objects[0]).toMatchObject({ type: "circle", center: { x: 1, y: 2 }, radius: 3 });
  });

  it("décalage : un résultat qui se recoupe est refusé (C vers l'intérieur, polyligne ouverte rabattue sur elle-même)", () => {
    const c: StudioPolyline = { id: "c", type: "polyline", closed: true, points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 0, y: 6 }] };
    expect(studioOffset(c, -1.5, "n")).toMatchObject({ ok: false });
    expect(studioOffset(c, -0.5, "n")).toMatchObject({ ok: true });
    const crochet: StudioPolyline = { id: "o", type: "polyline", closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 1, y: 10 }, { x: 1, y: 0.5 }] };
    expect(studioOffset(crochet, 1, "n")).toMatchObject({ ok: false, raison: expect.stringContaining("recouperait") });
    expect(studioOffset(crochet, -0.2, "n")).toMatchObject({ ok: true });
    expect(studioPathSimple(crochet.points, false)).toBe(true);
    expect(studioPathSimple([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: -1 }], false)).toBe(false);
  });

  it("décalage : angle très aigu — onglet au-delà de 10 × la distance refusé, aucun chanfrein inventé", () => {
    const pointe: StudioPolyline = { id: "o", type: "polyline", closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0.5 }] };
    expect(studioOffset(pointe, -0.1, "n")).toMatchObject({ ok: false, raison: expect.stringContaining("onglet") });
    expect(STUDIO_ONGLET_MAX).toBe(10);
  });

  it("budget d'écriture des extrusions de polylignes fermées : refus au-delà, révision existante lisible", () => {
    const n = 1024;
    const anneau = Array.from({ length: n }, (_, i) => ({ x: Math.round(Math.cos((2 * Math.PI * i) / n) * 1e6) / 1e3, y: Math.round(Math.sin((2 * Math.PI * i) / n) * 1e6) / 1e3 }));
    const poly = (i: number, extrude: boolean): StudioPolyline => ({ id: `p${i}`, type: "polyline", points: anneau, closed: true, ...(extrude ? { extrusion: { base: 0, height: 1 } } : {}) });
    const max = Math.floor(STUDIO_LIMITS.extrudedRingsTotal / n);
    const plein = doc(...Array.from({ length: max }, (_, i) => poly(i, true)), poly(max, false));
    expect(studioExtrudedRingVertices(plein.objects)).toBe(max * n);
    refuse(plein, { toolId: "studio.objet.extruder", params: { ids: [`p${max}`], base: 0, height: 1 } });
    // Au-delà du budget (révision ancienne) : lisible, et un lot qui n'aggrave pas la charge passe.
    const ancien = doc(...Array.from({ length: max + 1 }, (_, i) => poly(i, true)));
    expect(validateStudioDocument(ancien).objects).toHaveLength(max + 1);
    expect(appliquer(ancien, { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }).objects).toHaveLength(max + 2);
    refuse(ancien, { toolId: "studio.dessin.polyligne", params: { ...poly(999, true), id: "x" } });
  });
});
