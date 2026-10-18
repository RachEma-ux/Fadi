import { describe, expect, it } from "vitest";
import type { Primitive } from "../documents/dessin.js";
import { StudioValidationError, type StudioDocument } from "./document-2d.js";
import {
  composerFeuilleStudio, exportStudioSheetSvg, STUDIO_SHEET_FORMATS, studioFitText, studioScaleLabel, studioSheetMm, studioSheetPdf, studioSheetSize, studioSheetSvg,
  studioTitleField, type StudioSheetOptions,
} from "./feuille.js";

const doc = (over: Partial<StudioDocument> = {}): StudioDocument => ({
  id: "doc-1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
  objects: [
    { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    { id: "r1", type: "rectangle", layerId: "murs", origin: { x: 0, y: 1 }, width: 2, height: 1 },
  ],
  layers: [{ id: "murs", name: "Murs", visible: true, locked: false }],
  dimensions: [{ id: "c1", type: "dimension", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: -0.5, links: { start: { objectId: "l1", anchor: "start" }, end: { objectId: "l1", anchor: "end" } }, toResolve: false }],
  ...over,
});
const A3P: StudioSheetOptions = { format: "A3", orientation: "paysage", scale: 100 };
const ligne = (prims: Primitive[], id: string) => prims.find((p): p is Extract<Primitive, { type: "ligne" }> => p.type === "ligne" && p.objetId === id);
const textes = (prims: Primitive[]) => prims.filter((p): p is Extract<Primitive, { type: "texte" }> => p.type === "texte");
const champ = (svg: string, key: string) => new RegExp(`<text data-id="cartouche\\.${key.replace(/\./g, "\\.")}"[^>]*>([^<]*)</text>`).exec(svg)?.[1];

describe("Feuille Studio — formats ISO 216", () => {
  it("dimensions réelles en millimètres, portrait et paysage", () => {
    expect(STUDIO_SHEET_FORMATS).toEqual({ A4: { width: 210, height: 297 }, A3: { width: 297, height: 420 }, A2: { width: 420, height: 594 }, A1: { width: 594, height: 841 } });
    expect(studioSheetSize("A4", "portrait")).toEqual({ width: 210, height: 297 });
    expect(studioSheetSize("A3", "paysage")).toEqual({ width: 420, height: 297 });
    expect(studioSheetSize("A1", "paysage")).toEqual({ width: 841, height: 594 });
    const svg = exportStudioSheetSvg(doc(), A3P);
    expect(svg).toContain('width="420mm" height="297mm" viewBox="0 0 420 297"');
    expect(exportStudioSheetSvg(doc(), { format: "A2", orientation: "portrait", scale: 50 })).toContain('width="420mm" height="594mm"');
  });

  it("cadre ISO 5457 (20 mm à gauche, 10 mm ailleurs) et cartouche de 180 mm en bas à droite", () => {
    const f = composerFeuilleStudio(doc(), { format: "A4", orientation: "portrait", scale: 100 });
    expect(f.frame).toEqual({ min: { x: 20, y: 10 }, max: { x: 200, y: 287 } });
    expect(f.titleBlockBox).toEqual({ min: { x: 20, y: 10 }, max: { x: 200, y: 50 } });
    expect(f.viewport).toEqual({ min: { x: 20, y: 50 }, max: { x: 200, y: 287 } });
  });

  it("options invalides refusées", () => {
    expect(() => composerFeuilleStudio(doc(), { ...A3P, format: "A0" as never })).toThrow(StudioValidationError);
    expect(() => composerFeuilleStudio(doc(), { ...A3P, orientation: "carre" as never })).toThrow(StudioValidationError);
    expect(() => composerFeuilleStudio(doc(), { ...A3P, scale: 75 as never })).toThrow(StudioValidationError);
    expect(() => composerFeuilleStudio(doc(), { ...A3P, north: { angle: Number.NaN } })).toThrow(StudioValidationError);
    expect(() => composerFeuilleStudio(doc(), { ...A3P, titleBlock: { study: 3 as never } })).toThrow(StudioValidationError);
  });
});

describe("Feuille Studio — échelle", () => {
  it("1 m à 1:100 = 10 mm ; à 1:20 = 50 mm ; à 1:500 = 2 mm", () => {
    expect(studioSheetMm(1, 100)).toBe(10);
    expect(studioSheetMm(1, 20)).toBe(50);
    expect(studioSheetMm(1, 500)).toBe(2);
    for (const [s, mm] of [[100, 10], [50, 20], [200, 5]] as const) {
      const f = composerFeuilleStudio(doc(), { ...A3P, scale: s });
      const l = ligne(f.drawing.flatMap((d) => d.primitives), "l1")!;
      expect(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y)).toBeCloseTo(mm, 9);
      expect(f.scale).toEqual({ denominator: s, fitted: false, label: `1:${s}` });
    }
  });

  it("« ajuster » : dénominateur entier arrondi vers le haut, libellé « (ajustée) », dessin contenu dans la zone", () => {
    // 40 m de large dans une zone A3 paysage de 390 mm (380 mm utiles) : 40 000 / 380 = 105,26… → 1:106.
    const large = doc({ objects: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 40, y: 0 } }], layers: [], dimensions: [] });
    const f = composerFeuilleStudio(large, { ...A3P, scale: "ajuster" });
    expect(f.scale).toEqual({ denominator: 106, fitted: true, label: "1:106 (ajustée)" });
    expect(studioScaleLabel(87, true)).toBe("1:87 (ajustée)");
    expect(f.clipped).toBe(false);
    const l = ligne(f.drawing[0]!.primitives, "l1")!;
    expect(l.a.x).toBeGreaterThanOrEqual(f.viewport.min.x);
    expect(l.b.x).toBeLessThanOrEqual(f.viewport.max.x);
    expect(l.b.x - l.a.x).toBeCloseTo(40000 / 106, 9);
    expect(studioSheetSvg(f)).toContain('data-scale="106" data-scale-label="1:106 (ajustée)"');
    expect(champ(studioSheetSvg(f), "scale")).toBe("1:106 (ajustée)");
  });

  it("dessin vide : échelle ajustée non évaluée, rien n'est tracé", () => {
    const f = composerFeuilleStudio(doc({ objects: [], dimensions: [], layers: [] }), { ...A3P, scale: "ajuster", scaleBar: true });
    expect(f.scale.denominator).toBeNull();
    expect(f.scale.label).toBe("non évaluée (dessin vide)");
    expect(f.scaleBar).toEqual([]);
    expect(f.drawing).toEqual([]);
  });
});

describe("Feuille Studio — placement et découpage", () => {
  it("le dessin est centré dans sa zone", () => {
    const f = composerFeuilleStudio(doc({ objects: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 2 } }], layers: [], dimensions: [] }), A3P);
    const l = ligne(f.drawing[0]!.primitives, "l1")!;
    expect((l.a.x + l.b.x) / 2).toBeCloseTo((f.viewport.min.x + f.viewport.max.x) / 2, 9);
    expect((l.a.y + l.b.y) / 2).toBeCloseTo((f.viewport.min.y + f.viewport.max.y) / 2, 9);
  });

  it("à une échelle trop grande, le dessin est découpé au cadre de la zone, jamais hors de la feuille", () => {
    // 100 m à 1:20 = 5 000 mm : la ligne est coupée aux bords de la zone (390 mm).
    const f = composerFeuilleStudio(doc({ objects: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, { id: "loin", type: "line", start: { x: -60, y: 0 }, end: { x: -59, y: 0 } }], layers: [], dimensions: [] }), { ...A3P, scale: 20 });
    expect(f.clipped).toBe(true);
    const prims = f.drawing[0]!.primitives;
    const l = ligne(prims, "l1")!;
    expect(l.a.x).toBeCloseTo(f.viewport.min.x, 9);
    expect(l.b.x).toBeCloseTo(f.viewport.max.x, 9);
    expect(ligne(prims, "loin")).toBeUndefined();
    for (const p of prims) if (p.type === "ligne") for (const q of [p.a, p.b]) {
      expect(q.x).toBeGreaterThanOrEqual(f.viewport.min.x - 1e-9);
      expect(q.x).toBeLessThanOrEqual(f.viewport.max.x + 1e-9);
      expect(q.y).toBeGreaterThanOrEqual(f.viewport.min.y - 1e-9);
      expect(q.y).toBeLessThanOrEqual(f.viewport.max.y + 1e-9);
    }
    const svg = studioSheetSvg(f);
    expect(svg).toContain('<g data-sheet-part="drawing" clip-path="url(#studio-sheet-viewport)">');
    expect(svg).toContain('<clipPath id="studio-sheet-viewport"><rect x="20" y="10" width="390" height="237"/></clipPath>');
    expect(svg).toContain('data-clipped="true"');
  });

  it("rectangle découpé en traits ; calque masqué non imprimé ; cotes avec leur valeur mesurée", () => {
    const masque = doc({ layers: [{ id: "murs", name: "Murs", visible: false, locked: false }] });
    const f = composerFeuilleStudio(masque, A3P);
    expect(f.drawing.map((d) => d.layerId)).toEqual(["default"]);
    expect(studioSheetSvg(f)).not.toContain('data-id="r1"');
    const g = composerFeuilleStudio(doc(), A3P);
    expect(studioSheetSvg(g)).toContain('<g data-layer="murs" data-name="Murs">');
    expect(textes(g.drawing.flatMap((d) => d.primitives)).filter((t) => t.objetId === "c1").map((t) => t.texte)).toEqual(["1,00 m"]);
    const aResoudre = doc({ dimensions: [{ ...doc().dimensions![0]!, links: { start: null, end: null }, toResolve: true }] });
    expect(textes(composerFeuilleStudio(aResoudre, A3P).drawing.flatMap((d) => d.primitives)).map((t) => t.texte)).toContain("à résoudre");
  });
});

describe("Feuille Studio — cartouche, échelle graphique, nord", () => {
  it("champs fournis seulement ; un champ vide ou absent s'affiche « — » ; format et échelle déduits", () => {
    const svg = exportStudioSheetSvg(doc(), { ...A3P, titleBlock: { projectCode: "P.118", projectName: "Maison", study: "Implantation nord", revisionId: "rev-1", author: "   " } });
    expect(champ(svg, "projectCode")).toBe("P.118");
    expect(champ(svg, "projectName")).toBe("Maison");
    expect(champ(svg, "study")).toBe("Implantation nord");
    expect(champ(svg, "revisionId")).toBe("rev-1");
    for (const k of ["variant", "title", "revisionDate", "author"]) expect(champ(svg, k), k).toBe("—");
    expect(champ(svg, "format")).toBe("A3 paysage");
    expect(champ(svg, "scale")).toBe("1:100");
    expect(studioTitleField(undefined)).toBe("—");
    expect(studioTitleField(" a\n b ")).toBe("a b");
  });

  it("échappement XML des champs et des noms ; texte trop long tronqué", () => {
    const svg = exportStudioSheetSvg(doc({ id: "d&<1>", layers: [{ id: "murs", name: "Murs \"A\" & 'B'", visible: true, locked: false }] }), { ...A3P, titleBlock: { study: "<script>alert(1)</script> & co", title: "x\u0001y" } });
    expect(svg).not.toContain("<script>");
    expect(champ(svg, "study")).toBe("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
    expect(svg).toContain('data-document="d&amp;&lt;1&gt;"');
    expect(svg).toContain('data-name="Murs &quot;A&quot; &amp; &apos;B&apos;"');
    expect(champ(svg, "title")).toBe("xy");
    expect(studioFitText("abcdefghij", 6, 1)).toBe("abcdefghij");
    expect(studioFitText("abcdefghijk", 6, 1)).toBe("abcdefghi…");
  });

  it("nord « non orienté » par défaut, flèche seulement à la demande avec l'angle déclaré", () => {
    const sans = composerFeuilleStudio(doc(), A3P);
    expect(sans.north).toEqual([]);
    expect(champ(studioSheetSvg(sans), "north")).toBe("Nord : non orienté");
    expect(studioSheetSvg(sans)).not.toContain('data-sheet-part="north"');
    const avec = composerFeuilleStudio(doc(), { ...A3P, north: { angle: 90 } });
    const fleche = ligne(avec.north, "nord")!;
    // 90° horaire depuis +y : le nord pointe vers +x.
    expect(fleche.b.x - fleche.a.x).toBeCloseTo(12, 9);
    expect(fleche.b.y - fleche.a.y).toBeCloseTo(0, 9);
    expect(studioSheetSvg(avec)).toContain('data-sheet-part="north"');
    expect(champ(studioSheetSvg(avec), "north")).toBeUndefined();
  });

  it("échelle graphique seulement à la demande, longueur réelle à l'échelle", () => {
    expect(composerFeuilleStudio(doc(), A3P).scaleBar).toEqual([]);
    const f = composerFeuilleStudio(doc(), { ...A3P, scaleBar: true });
    // 1:100 : 2 m = 20 mm, 5 m = 50 mm (> 44 mm) → 2 m retenus.
    const xs = f.scaleBar.flatMap((p) => (p.type === "poly" ? p.points.map((q) => q.x) : []));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 9);
    expect(textes(f.scaleBar).map((t) => t.texte)).toEqual(["0", "1 m", "2 m"]);
    expect(studioSheetSvg(f)).toContain('data-sheet-part="scale-bar"');
  });
});

describe("Feuille Studio — rendus", () => {
  it("SVG et PDF déterministes ; PDF d'une page à la taille réelle", () => {
    const o: StudioSheetOptions = { ...A3P, titleBlock: { study: "Implantation nord" }, scaleBar: true, north: { angle: 0 } };
    expect(exportStudioSheetSvg(doc(), o)).toBe(exportStudioSheetSvg(doc(), o));
    const pdf = studioSheetPdf(composerFeuilleStudio(doc(), o));
    const text = String.fromCharCode(...pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    // 420 × 297 mm en points (72 / 25,4).
    expect(text).toContain("/MediaBox [0 0 1190.551 841.89]");
    expect(text).toContain("(Implantation nord) Tj");
    expect(String.fromCharCode(...studioSheetPdf(composerFeuilleStudio(doc(), o)))).toBe(text);
  });
});
