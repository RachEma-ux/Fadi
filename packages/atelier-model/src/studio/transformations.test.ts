import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument, type StudioShape } from "./document-2d.js";
import { studioMesh3d } from "./mesh-3d.js";
import { STUDIO_TOOLS } from "./registry.js";
import { studioIdCopie } from "./commandes/modification.js";
import { studioRotation, studioSymetrie } from "./transformations.js";

/**
 * Transformations de la sélection (Copier, Rotation, Symétrie, Échelle) : géométrie exacte de chaque type d'objet,
 * cotes liées qui suivent (sommet correspondant), extrusions conservées, calques verrouillés refusés, copies aux
 * identifiants déterministes, lot tout ou rien.
 */

const H = Math.PI / 2;
const base = (): StudioDocument => applyStudioCommands(newStudioDocument("doc"), [
  { toolId: "studio.calque.creer", params: { id: "verrou", name: "Verrou", visible: true, locked: false } },
  { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 1, y: 1 }, width: 2, height: 1 } },
  { toolId: "studio.dessin.cercle", params: { id: "c", type: "circle", center: { x: 5, y: 5 }, radius: 1 } },
  { toolId: "studio.dessin.arc", params: { id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: H } },
  { toolId: "studio.dessin.polyligne", params: { id: "p", type: "polyline", points: [{ x: 10, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 2 }], closed: true, bulges: [0, 0, 0.4] } },
  { toolId: "studio.dessin.ligne", params: { id: "lv", type: "line", layerId: "verrou", start: { x: 0, y: 9 }, end: { x: 1, y: 9 } } },
  { toolId: "studio.dessin.cote", params: { id: "d1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 0.5, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "d2", type: "dimension", start: { x: 1, y: 1 }, end: { x: 3, y: 2 }, offset: -0.4, links: { start: { objectId: "r", anchor: "corner-origin" }, end: { objectId: "r", anchor: "corner-opposite" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "dc", type: "dimension", start: { x: 5, y: 5 }, end: { x: 6, y: 5 }, offset: 0.3, links: { start: { objectId: "c", anchor: "center" }, end: { objectId: "c", anchor: "quadrant-0" } }, toResolve: false } },
  { toolId: "studio.dessin.cote", params: { id: "dl", type: "dimension", start: { x: 0, y: -1 }, end: { x: 2, y: -1 }, offset: 0.2, links: { start: null, end: null }, toResolve: false } },
  { toolId: "studio.objet.extruder", params: { ids: ["l"], base: 0, height: 3, thickness: 0.2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["r", "p"], base: -0.2, height: 2.5 } },
  { toolId: "studio.objet.extruder", params: { ids: ["a"], base: 0, height: 3, thickness: 0.5 } },
  { toolId: "studio.calque.modifier", params: { id: "verrou", name: "Verrou", visible: true, locked: true } },
]);

const run = (doc: StudioDocument, ...c: StudioCommand[]) => applyStudioCommands(doc, c);
const objet = (doc: StudioDocument, id: string) => doc.objects.find((o) => o.id === id)!;
const cote = (doc: StudioDocument, id: string) => doc.dimensions!.find((d) => d.id === id)!;
const refus = (doc: StudioDocument, c: unknown) => () => applyStudioCommands(doc, [c as StudioCommand]);

describe("Rotation", () => {
  it("quart de tour exact : chaque type garde sa nature, les rectangles restent alignés, les cotes liées suivent", () => {
    const d = run(base(), { toolId: "studio.dessin.rotation", params: { ids: ["l", "r", "c", "a", "p", "d1", "dl"], center: { x: 0, y: 0 }, angle: H } });
    expect(objet(d, "l")).toEqual({ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 4 }, extrusion: { base: 0, height: 3, thickness: 0.2 } });
    // Coins (1,1) (3,1) (3,2) (1,2) → (-1,1) (-1,3) (-2,3) (-2,1) : rectangle d'origine (-2,1), largeur 1, hauteur 2.
    expect(objet(d, "r")).toEqual({ id: "r", type: "rectangle", origin: { x: -2, y: 1 }, width: 1, height: 2, extrusion: { base: -0.2, height: 2.5 } });
    expect(objet(d, "c")).toEqual({ id: "c", type: "circle", center: { x: -5, y: 5 }, radius: 1 });
    expect(objet(d, "a")).toEqual({ id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: H, endAngle: Math.PI, extrusion: { base: 0, height: 3, thickness: 0.5 } });
    expect(objet(d, "p")).toEqual({ id: "p", type: "polyline", points: [{ x: 0, y: 10 }, { x: 0, y: 12 }, { x: -2, y: 12 }], closed: true, bulges: [0, 0, 0.4], extrusion: { base: -0.2, height: 2.5 } });
    expect(cote(d, "d1")).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 0, y: 4 }, offset: 0.5, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } } });
    // Cote non choisie liée au rectangle : les mêmes coins physiques, renommés sur l'image.
    expect(cote(d, "d2")).toMatchObject({ start: { x: -1, y: 1 }, end: { x: -2, y: 3 }, offset: -0.4, links: { start: { objectId: "r", anchor: "corner-width" }, end: { objectId: "r", anchor: "corner-height" } } });
    expect(cote(d, "dc")).toMatchObject({ start: { x: -5, y: 5 }, end: { x: -5, y: 6 }, links: { start: { anchor: "center" }, end: { anchor: "quadrant-90" } } });
    // Cote libre choisie : ses extrémités tournent.
    expect(cote(d, "dl")).toMatchObject({ start: { x: 1, y: 0 }, end: { x: 1, y: 2 }, offset: 0.2 });
    // Hors sélection : rien ne bouge.
    expect(objet(d, "lv")).toEqual(objet(base(), "lv"));
  });

  it("angle quelconque : le rectangle devient une polyligne fermée de ses quatre coins (même id, même extrusion)", () => {
    const t = Math.PI / 6;
    const d = run(base(), { toolId: "studio.dessin.rotation", params: { ids: ["r", "c"], center: { x: 1, y: 1 }, angle: t } });
    const r = objet(d, "r");
    expect(r.type).toBe("polyline");
    if (r.type !== "polyline") return;
    expect(r.closed).toBe(true);
    expect(r.extrusion).toEqual({ base: -0.2, height: 2.5 });
    const rot = studioRotation({ x: 1, y: 1 }, t);
    expect(r.points).toEqual([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 2 }].map(rot.point));
    expect(r.points[1]!.x).toBeCloseTo(1 + 2 * Math.cos(t), 12);
    expect(r.points[1]!.y).toBeCloseTo(1 + 2 * Math.sin(t), 12);
    // Coins liés : sommets 0 et 2 de la polyligne.
    expect(cote(d, "d2").links).toEqual({ start: { objectId: "r", anchor: "vertex-0" }, end: { objectId: "r", anchor: "vertex-2" } });
    expect(cote(d, "d2").end).toEqual(r.points[2]);
    // Quadrant d'un cercle tourné de 30° : la cote suit le quadrant (même nom), comme pour une modification.
    const c = objet(d, "c");
    if (c.type !== "circle") throw new Error("cercle attendu");
    expect(cote(d, "dc").links.end).toEqual({ objectId: "c", anchor: "quadrant-0" });
    expect(cote(d, "dc").end).toEqual({ x: c.center.x + 1, y: c.center.y });
  });

  it("arc : angles tournés et ramenés dans [0 ; 2π[", () => {
    const d = run(base(), { toolId: "studio.dessin.rotation", params: { ids: ["a"], center: { x: 0, y: 0 }, angle: -H } });
    expect(objet(d, "a")).toMatchObject({ startAngle: 3 * H, endAngle: 0 });
  });
});

describe("Symétrie", () => {
  it("axe vertical, source supprimée : arcs exacts (début et fin échangés), renflements opposés, rectangle conservé", () => {
    const d = run(base(), { toolId: "studio.dessin.symetrie", params: { ids: ["r", "a", "p", "l"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 0, y: 1 }, keepSource: false } });
    expect(objet(d, "a")).toEqual({ id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: H, endAngle: Math.PI, extrusion: { base: 0, height: 3, thickness: 0.5 } });
    expect(objet(d, "p")).toMatchObject({ points: [{ x: -10, y: 0 }, { x: -12, y: 0 }, { x: -12, y: 2 }], bulges: [0, 0, -0.4] });
    expect(objet(d, "r")).toEqual({ id: "r", type: "rectangle", origin: { x: -3, y: 1 }, width: 2, height: 1, extrusion: { base: -0.2, height: 2.5 } });
    expect(cote(d, "d2")).toMatchObject({ start: { x: -1, y: 1 }, end: { x: -3, y: 2 }, links: { start: { anchor: "corner-width" }, end: { anchor: "corner-height" } } });
    expect(objet(d, "l")).toMatchObject({ start: { x: 0, y: 0 }, end: { x: -4, y: 0 } });
    expect(d.objects.map((o) => o.id)).toEqual(base().objects.map((o) => o.id));
  });

  it("axe à 45° : le rectangle reste un rectangle (largeur et hauteur échangées)", () => {
    const d = run(base(), { toolId: "studio.dessin.symetrie", params: { ids: ["r"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 2, y: 2 }, keepSource: false } });
    expect(objet(d, "r")).toMatchObject({ type: "rectangle", origin: { x: 1, y: 1 }, width: 1, height: 2 });
  });

  it("axe oblique : rectangle en polyligne, points symétriques", () => {
    const d = run(base(), { toolId: "studio.dessin.symetrie", params: { ids: ["r"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 2, y: 1 }, keepSource: false } });
    const r = objet(d, "r");
    expect(r.type).toBe("polyline");
    const s = studioSymetrie({ x: 0, y: 0 }, { x: 2, y: 1 });
    const points = (r as Extract<StudioShape, { type: "polyline" }>).points;
    // (1,1) : projection (6/5, 3/5) sur l'axe, image (7/5, 1/5) ; involution : appliquée deux fois, le point revient.
    expect(points[0]!.x).toBeCloseTo(1.4, 12);
    expect(points[0]!.y).toBeCloseTo(0.2, 12);
    const retour = s.point(points[2]!);
    expect(retour.x).toBeCloseTo(3, 12);
    expect(retour.y).toBeCloseTo(2, 12);
  });

  it("source conservée : copies d'identifiants déterministes, cote copiée liée à la copie, décalage opposé", () => {
    const avant = base();
    const d = run(avant, { toolId: "studio.dessin.symetrie", params: { ids: ["l", "d1", "c"], axisStart: { x: 0, y: -2 }, axisEnd: { x: 1, y: -2 }, keepSource: true, prefix: "m" } });
    for (const o of avant.objects) expect(objet(d, o.id)).toEqual(o);
    expect(objet(d, studioIdCopie("m", 1, 0))).toEqual({ id: "m-1-0", type: "line", start: { x: 0, y: -4 }, end: { x: 4, y: -4 }, extrusion: { base: 0, height: 3, thickness: 0.2 } });
    expect(objet(d, "m-1-2")).toEqual({ id: "m-1-2", type: "circle", center: { x: 5, y: -9 }, radius: 1 });
    expect(cote(d, "m-1-1")).toEqual({ id: "m-1-1", type: "dimension", start: { x: 0, y: -4 }, end: { x: 4, y: -4 }, offset: -0.5, links: { start: { objectId: "m-1-0", anchor: "start" }, end: { objectId: "m-1-0", anchor: "end" } }, toResolve: false });
    expect(cote(d, "d1")).toEqual(cote(avant, "d1"));
  });
});

describe("Échelle", () => {
  it("facteur 2 : longueurs et rayons doublés, extrusions inchangées, cotes liées suivantes", () => {
    const d = run(base(), { toolId: "studio.dessin.echelle", params: { ids: ["l", "r", "c", "a", "p"], center: { x: 0, y: 0 }, factor: 2, includeVolumes: false } });
    expect(objet(d, "l")).toEqual({ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 8, y: 0 }, extrusion: { base: 0, height: 3, thickness: 0.2 } });
    expect(objet(d, "r")).toEqual({ id: "r", type: "rectangle", origin: { x: 2, y: 2 }, width: 4, height: 2, extrusion: { base: -0.2, height: 2.5 } });
    expect(objet(d, "c")).toEqual({ id: "c", type: "circle", center: { x: 10, y: 10 }, radius: 2 });
    expect(objet(d, "a")).toMatchObject({ radius: 4, startAngle: 0, endAngle: H, extrusion: { base: 0, height: 3, thickness: 0.5 } });
    expect(objet(d, "p")).toMatchObject({ points: [{ x: 20, y: 0 }, { x: 24, y: 0 }, { x: 24, y: 4 }], bulges: [0, 0, 0.4] });
    // Cote non choisie dont les deux extrémités suivent des formes mises à l'échelle : décalage multiplié aussi.
    expect(cote(d, "d1")).toMatchObject({ end: { x: 8, y: 0 }, offset: 1 });
    expect(cote(d, "d2")).toMatchObject({ start: { x: 2, y: 2 }, end: { x: 6, y: 4 }, links: { start: { anchor: "corner-origin" }, end: { anchor: "corner-opposite" } } });
    expect(cote(d, "dc")).toMatchObject({ start: { x: 10, y: 10 }, end: { x: 12, y: 10 } });
  });

  it("« volumes aussi » : base, hauteur et épaisseur multipliées ; cote libre choisie : décalage multiplié", () => {
    const d = run(base(), { toolId: "studio.dessin.echelle", params: { ids: ["l", "r", "dl"], center: { x: 0, y: 0 }, factor: 2, includeVolumes: true } });
    expect(objet(d, "l").extrusion).toEqual({ base: 0, height: 6, thickness: 0.4 });
    expect(objet(d, "r").extrusion).toEqual({ base: -0.4, height: 5 });
    expect(cote(d, "dl")).toMatchObject({ start: { x: 0, y: -2 }, end: { x: 4, y: -2 }, offset: 0.4 });
    expect(studioMesh3d(d).solids.length).toBe(studioMesh3d(base()).solids.length);
  });

  it("une épaisseur d'arc devenue supérieure au diamètre refuse le lot", () => {
    expect(refus(base(), { toolId: "studio.dessin.echelle", params: { ids: ["a"], center: { x: 0, y: 0 }, factor: 0.1, includeVolumes: false } })).toThrow(/diamètre/);
  });
});

describe("Copier", () => {
  it("trois copies en série, identifiants déterministes, cote copiée avec ses objets", () => {
    const avant = base();
    const c: StudioCommand = { toolId: "studio.dessin.copier", params: { ids: ["l", "d1", "d2"], dx: 1, dy: 0.5, copies: 3, prefix: "k" } };
    const d = run(avant, c);
    expect(run(avant, c)).toEqual(d);
    for (const o of avant.objects) expect(objet(d, o.id)).toEqual(o);
    for (const k of [1, 2, 3]) {
      expect(objet(d, `k-${k}-0`)).toEqual({ id: `k-${k}-0`, type: "line", start: { x: k, y: k * 0.5 }, end: { x: 4 + k, y: k * 0.5 }, extrusion: { base: 0, height: 3, thickness: 0.2 } });
      expect(cote(d, `k-${k}-1`).links).toEqual({ start: { objectId: `k-${k}-0`, anchor: "start" }, end: { objectId: `k-${k}-0`, anchor: "end" } });
      // Cote liée à un objet non copié : extrémités libres, à l'image des points.
      expect(cote(d, `k-${k}-2`)).toMatchObject({ start: { x: 1 + k, y: 1 + k * 0.5 }, end: { x: 3 + k, y: 2 + k * 0.5 }, links: { start: null, end: null }, toResolve: false });
    }
    expect(d.objects).toHaveLength(avant.objects.length + 3);
    // Même préfixe une seconde fois : identifiants pris, refus.
    expect(refus(d, c)).toThrow(/identifiant déjà utilisé/);
  });

  it("toutes les formes se copient à l'identique, décalées", () => {
    const d = run(base(), { toolId: "studio.dessin.copier", params: { ids: ["r", "c", "a", "p"], dx: 0, dy: -10, copies: 1, prefix: "x" } });
    expect(objet(d, "x-1-0")).toEqual({ ...objet(base(), "r"), id: "x-1-0", origin: { x: 1, y: -9 } });
    expect(objet(d, "x-1-2")).toEqual({ ...objet(base(), "a"), id: "x-1-2", center: { x: 0, y: -10 } });
    expect(objet(d, "x-1-3")).toMatchObject({ points: [{ x: 10, y: -10 }, { x: 12, y: -10 }, { x: 12, y: -8 }], bulges: [0, 0, 0.4] });
  });
});

describe("Refus (lot tout ou rien)", () => {
  const ids = ["l", "lv"];
  it.each([
    ["copier", { ids, dx: 1, dy: 0, copies: 1, prefix: "z" }],
    ["rotation", { ids, center: { x: 0, y: 0 }, angle: 1 }],
    ["symetrie", { ids, axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 }, keepSource: false }],
    ["echelle", { ids, center: { x: 0, y: 0 }, factor: 2, includeVolumes: false }],
  ])("%s : calque verrouillé refusé, document intact", (outil, params) => {
    const doc = base();
    const copie = structuredClone(doc);
    expect(refus(doc, { toolId: `studio.dessin.${outil}`, params })).toThrow(/calque verrouillé/);
    expect(doc).toEqual(copie);
  });

  it("une cote sur un calque verrouillé liée à un objet transformé refuse le lot", () => {
    const doc = run(base(),
      { toolId: "studio.calque.modifier", params: { id: "verrou", name: "Verrou", visible: true, locked: false } },
      { toolId: "studio.dessin.cote", params: { id: "dv", type: "dimension", layerId: "verrou", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, offset: 1, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false } },
      { toolId: "studio.calque.modifier", params: { id: "verrou", name: "Verrou", visible: true, locked: true } });
    expect(refus(doc, { toolId: "studio.dessin.rotation", params: { ids: ["l"], center: { x: 0, y: 0 }, angle: 1 } })).toThrow(/cote liée dv.*calque verrouillé/);
  });

  it.each([
    [{ toolId: "studio.dessin.rotation", params: { ids: ["l"], center: { x: 0, y: 0 }, angle: 0 } }, /angle non nul/],
    [{ toolId: "studio.dessin.echelle", params: { ids: ["l"], center: { x: 0, y: 0 }, factor: 0, includeVolumes: false } }, /strictement positif/],
    [{ toolId: "studio.dessin.echelle", params: { ids: ["l"], center: { x: 0, y: 0 }, factor: -2, includeVolumes: false } }, /strictement positif/],
    [{ toolId: "studio.dessin.copier", params: { ids: ["l"], dx: 1, dy: 0, copies: 0, prefix: "z" } }, /copies/],
    [{ toolId: "studio.dessin.copier", params: { ids: ["l"], dx: 1, dy: 0, copies: 1.5, prefix: "z" } }, /copies/],
    [{ toolId: "studio.dessin.copier", params: { ids: ["l"], dx: 0, dy: 0, copies: 1, prefix: "z" } }, /déplacement non nul/],
    [{ toolId: "studio.dessin.symetrie", params: { ids: ["l"], axisStart: { x: 1, y: 1 }, axisEnd: { x: 1, y: 1 }, keepSource: false } }, /deux points distincts/],
    [{ toolId: "studio.dessin.symetrie", params: { ids: ["l"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 1 }, keepSource: true } }, /préfixe de copie attendu/],
    [{ toolId: "studio.dessin.symetrie", params: { ids: ["l"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 1 }, keepSource: false, prefix: "z" } }, /sans objet/],
    [{ toolId: "studio.dessin.rotation", params: { ids: ["inconnu"], center: { x: 0, y: 0 }, angle: 1 } }, /objet introuvable/],
    [{ toolId: "studio.dessin.echelle", params: { ids: ["l"], center: { x: 0, y: 0 }, factor: 1e308, includeVolumes: false } }, /nombre fini/],
  ])("paramètres refusés %#", (c, motif) => {
    expect(refus(base(), c)).toThrow(motif);
  });
});

describe("Registre des transformations", () => {
  it("quatre outils de la barre Modification, icône et raccourci propres, schéma sans valeur métier", () => {
    const t = STUDIO_TOOLS.filter((x) => ["studio.dessin.copier", "studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle"].includes(x.toolId));
    expect(t.map((x) => [x.libelleFR, x.raccourci, x.iconeSymbolique, x.groupe, x.nature])).toEqual([
      ["Copier", "D", "studio-copy", "modification", "mutation"],
      ["Rotation", "Shift+R", "studio-rotate", "modification", "mutation"],
      ["Symétrie", "I", "studio-mirror", "modification", "mutation"],
      ["Échelle", "S", "studio-scale", "modification", "mutation"],
    ]);
  });
});
