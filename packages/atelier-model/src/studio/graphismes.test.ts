/**
 * TR-EX-055 (modèle) — splines, hachures, symboles et transparences dans le document 2D de Studio : validation,
 * commandes, géométrie dérivée et écritures SVG / DXF.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, StudioValidationError, type StudioDocument } from "./document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "./export.js";
import { studioRapportFidelite } from "./echanges/rapport-fidelite.js";
import {
  STUDIO_LIMITES_GRAPHISMES, studioPointBezier, studioPointsSpline, studioPrimitivesGraphisme, studioTraitsHachure, type StudioGraphisme,
} from "./graphismes/graphismes.js";

const refus = (f: () => unknown): string => { try { f(); } catch (e) { if (e instanceof StudioValidationError) return e.message; throw e; } return ""; };

export const GRAPHISMES_FIDELITE: StudioGraphisme[] = [
  { id: "sp", type: "spline", points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }, { x: 5, y: -2 }, { x: 7, y: -2 }, { x: 8, y: 0 }] },
  { id: "ha", type: "hachure", contour: [{ x: 0, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 7 }, { x: 0, y: 7 }], angle: Math.PI / 4, espacement: 0.5, opacite: 0.5 },
  { id: "sy", type: "symbole", symbole: "nord", position: { x: 10, y: 5 }, rotation: Math.PI / 6, echelle: 2, opacite: 0.75 },
];

const avecGraphismes = (): StudioDocument => applyStudioCommands(newStudioDocument("g"), GRAPHISMES_FIDELITE.map((g) => ({ toolId: "studio.graphisme.creer" as const, params: g })));

describe("TR-EX-055 — graphismes du document 2D (spline, hachure, symbole, transparence)", () => {
  it("création par commande, document relu à l'identique ; opacité 1 non stockée (opaque = absente)", () => {
    const d = avecGraphismes();
    expect(d.graphismes).toEqual(GRAPHISMES_FIDELITE);
    expect(validateStudioDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const opaque = applyStudioCommands(newStudioDocument("o"), [{ toolId: "studio.graphisme.creer", params: { ...GRAPHISMES_FIDELITE[0]!, id: "x", opacite: 1 } as StudioGraphisme }]);
    expect(opaque.graphismes?.[0]).not.toHaveProperty("opacite");
    const retire = applyStudioCommands(d, [{ toolId: "studio.graphisme.retirer", params: { ids: ["ha", "sy"] } }]);
    expect(retire.graphismes?.map((g) => g.id)).toEqual(["sp"]);
    expect(applyStudioCommands(retire, [{ toolId: "studio.graphisme.retirer", params: { ids: ["sp"] } }])).not.toHaveProperty("graphismes");
  });

  it("refus explicites : spline sans 3n + 1 points, contour d'aire nulle, espacement nul ou trop fin, opacité hors ]0 ; 1], symbole inconnu, identifiant pris", () => {
    const d = newStudioDocument("d");
    const creer = (g: unknown) => () => applyStudioCommands(d, [{ toolId: "studio.graphisme.creer", params: g as StudioGraphisme }]);
    expect(refus(creer({ id: "s", type: "spline", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }] }))).toContain("3n + 1 points");
    expect(refus(creer({ id: "h", type: "hachure", contour: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], angle: 0, espacement: 0.1 }))).toContain("aire nulle");
    expect(refus(creer({ id: "h", type: "hachure", contour: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], angle: 0, espacement: 0 }))).toContain("espacement strictement positif");
    expect(refus(creer({ id: "h", type: "hachure", contour: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }], angle: 0, espacement: 0.01 }))).toContain(`plus de ${STUDIO_LIMITES_GRAPHISMES.traitsHachure} traits`);
    expect(refus(creer({ ...GRAPHISMES_FIDELITE[0], opacite: 0 }))).toContain("opacité");
    expect(refus(creer({ ...GRAPHISMES_FIDELITE[0], opacite: 1.5 }))).toContain("opacité");
    expect(refus(creer({ ...GRAPHISMES_FIDELITE[2], symbole: "rose-des-vents" }))).toContain("symbole inconnu");
    expect(refus(creer({ id: "z", type: "ellipse" }))).toContain("type de graphisme inconnu");
    expect(refus(() => applyStudioCommands(avecGraphismes(), [{ toolId: "studio.graphisme.creer", params: { ...GRAPHISMES_FIDELITE[0]!, id: "ha" } }]))).toContain("identifiant déjà utilisé");
    expect(refus(() => applyStudioCommands(d, [{ toolId: "studio.graphisme.retirer", params: { ids: ["rien"] } }]))).toContain("graphisme introuvable");
  });

  it("géométrie : Bézier exacte aux extrémités, découpe déclarée ; traits de hachure dans le contour, ancrés sur l'origine, à l'espacement saisi", () => {
    const s = GRAPHISMES_FIDELITE[0] as Extract<StudioGraphisme, { type: "spline" }>;
    const pts = studioPointsSpline(s);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 8, y: 0 });
    expect(pts).toHaveLength(2 * 16 + 1);
    expect(studioPointBezier({ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }, 0.5)).toEqual({ x: 2, y: 1.5 });
    // Hachure horizontale d'un carré 0..2 × 0..2 au pas 0,5 : droites y = 0 ; 0,5 ; 1 ; 1,5 (y = 2 exclue : demi-ouvert).
    const t = studioTraitsHachure({ contour: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], angle: 0, espacement: 0.5 });
    expect(t.map(([a, b]) => [a.y, Math.min(a.x, b.x), Math.max(a.x, b.x)])).toEqual([[0, 0, 2], [0.5, 0, 2], [1, 0, 2], [1.5, 0, 2]]);
    // Contour en U (non convexe) : la règle pair-impair coupe la droite en deux traits.
    const u = studioTraitsHachure({ contour: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }], angle: 0, espacement: 1 });
    expect(u.filter(([a]) => a.y === 2).map(([a, b]) => [Math.min(a.x, b.x), Math.max(a.x, b.x)])).toEqual([[0, 1], [2, 3]]);
  });

  it("export SVG : courbe de Bézier `C` exacte, traits de hachure, symbole posé, opacité ; DXF : polyligne découpée, transparence déclarée ; rapport de fidélité", () => {
    const d = avecGraphismes();
    const svg = exportStudioSvg(d);
    expect(svg).toContain('<g data-graphisme="sp" data-type="spline">');
    expect(svg).toContain('<path d="M 0 0 C 1 -2 3 -2 4 0 C 5 2 7 2 8 0"');
    expect(svg).toContain('<g data-graphisme="ha" data-type="hachure" opacity="0.5">');
    expect(svg).toContain('<g data-graphisme="sy" data-type="symbole" data-symbole="nord" opacity="0.75">');
    const traits = studioPrimitivesGraphisme(GRAPHISMES_FIDELITE[1]!).filter((p) => p.genre === "segment").length;
    expect(traits).toBeGreaterThan(5);
    const blocHachure = svg.slice(svg.indexOf('data-graphisme="ha"'), svg.indexOf('data-graphisme="sy"'));
    expect((blocHachure.match(/<line /g) ?? []).length).toBe(traits);
    const dxf = exportStudioDxf(d);
    expect(dxf).toContain("graphisme ha : opacite 0.5 non representable en DXF R12");
    expect(studioRapportFidelite(d, "dxf").lignes.filter((l) => l.categorie === "graphismes").map((l) => [l.type, l.raison])).toEqual([["spline", "spline-decoupee"], ["hachure", "transparence-non-portee"], ["symbole", "transparence-non-portee"]]);
    expect(studioRapportFidelite(d, "ifc").lignes.filter((l) => l.categorie === "graphismes").every((l) => l.raison === "graphisme-hors-ifc")).toBe(true);
    expect(studioRapportFidelite(d, "svg").lignes.filter((l) => l.categorie === "graphismes").every((l) => l.statut === "exact")).toBe(true);
  });
});
