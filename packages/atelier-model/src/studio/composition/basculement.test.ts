import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { exportStudioIfc } from "../ifc.js";
import { studioMesh3d } from "../mesh-3d.js";
import { couperStudio, studioBoiteEnglobante, studioOperandeNoyau, studioQuantitesSolides, studioVecteurSolide, type StudioBox } from "../solides-libres.js";

/**
 * A.3-03 — transformations du sous-ensemble 3D retenu : rotation autour des axes horizontaux du solide (basculement,
 * `studio.solide.pivoter` avec `axe: "x" | "y"`) et mise à l'échelle 3D (`studio.dessin.echelle`, volumes compris),
 * cohérentes dans le maillage, la coupe, les quantités, l'IFC et l'édition des faces ; ce que le sous-ensemble ne prend
 * pas en charge est refusé explicitement (booléen exact d'un solide basculé, symétrie d'un solide basculé).
 */
const refus = (f: () => unknown): string => {
  try { f(); } catch (e) { expect(e).toBeInstanceOf(StudioValidationError); return (e as Error).message; }
  throw new Error("refus attendu");
};
const appliquer = (d: StudioDocument, ...cs: unknown[]) => applyStudioCommands(d, cs as StudioCommand[]);
const boite = (over: Partial<StudioBox> = {}): StudioBox => ({ id: "b", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 1, height: 4, ...over });
const docBoite = (over: Partial<StudioBox> = {}) => appliquer(newStudioDocument("t"), { toolId: "studio.solide.boite", params: boite(over) });
const pivoter = (d: StudioDocument, angle: number, axe?: "x" | "y" | "z", id = "b") => appliquer(d, { toolId: "studio.solide.pivoter", params: { id, angle, ...(axe ? { axe } : {}) } });
const sommets = (d: StudioDocument) => studioMesh3d(d).freeSolids![0]!.vertices;
const proche = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9;

describe("A.3-03 — rotation autour des axes horizontaux (basculement)", () => {
  it("basculer de 90° autour de l'axe y : la boîte de 4 m de haut se couche le long de x ; volume, coupe et emprise suivent", () => {
    const d = pivoter(docBoite(), Math.PI / 2, "y");
    expect(d.solides![0]!.placement).toEqual({ origin: { x: 0, y: 0, z: 0 }, rotation: 0, basculement: { x: 0, y: Math.PI / 2 } });
    const v = sommets(d);
    const zMax = Math.max(...v.map((p) => p.z)), xMax = Math.max(...v.map((p) => p.x)), xMin = Math.min(...v.map((p) => p.x));
    // Ry(+90°) envoie +z vers +x et +x vers −z : hauteur 4 m le long de x, largeur 2 m vers le bas.
    expect([Math.round(xMin * 1e9) / 1e9, Math.round(xMax * 1e9) / 1e9, Math.round(zMax * 1e9) / 1e9]).toEqual([0, 4, 0]);
    expect(Math.round(Math.min(...v.map((p) => p.z)) * 1e9) / 1e9).toBe(-2);
    expect(studioQuantitesSolides(d).items[0]!.volume).toBe(8);
    const b = studioBoiteEnglobante(d.solides![0]! as never);
    expect([b.min.x, b.max.x].map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 4]);
    // Coupe horizontale à z = −1 : section 4 × 1 m de la boîte couchée (au lieu du profil 2 × 1 m de la boîte debout).
    const c = couperStudio(d, { z: -1 });
    expect(c.sources).toEqual([{ id: "b", segments: expect.any(Number) }]);
    const xs = c.segments.flatMap((s) => [s.start.x, s.end.x]);
    expect([Math.min(...xs), Math.max(...xs)].map((x) => Math.round(x * 1e9) / 1e9)).toEqual([0, 4]);
  });

  it("basculer autour de x après un pivot autour de z : orientation Rz · Ry · Rx, maillage exact ; revenir à zéro retire le basculement (forme canonique)", () => {
    let d = pivoter(docBoite({ placement: { origin: { x: 5, y: 1, z: 2 }, rotation: 0 } }), Math.PI / 2, "z");
    d = pivoter(d, Math.PI / 2, "x");
    const pl = d.solides![0]!.placement;
    expect(pl.basculement).toEqual({ x: Math.PI / 2, y: 0 });
    // Sommet local (0, 0, 4) (haut de l'origine) : Rx(90°) → (0, −4, 0), puis Rz(90°) → (4, 0, 0), plus l'origine.
    expect(proche(studioVecteurSolide(pl, { x: 0, y: 0, z: 4 }), { x: 4, y: 0, z: 0 })).toBe(true);
    expect(sommets(d).some((p) => proche(p, { x: 9, y: 1, z: 2 }))).toBe(true);
    const retour = pivoter(d, -Math.PI / 2, "x");
    expect(retour.solides![0]!.placement).toEqual({ origin: { x: 5, y: 1, z: 2 }, rotation: Math.PI / 2 });
    // Relu : basculement nul stocké → refusé (jamais deux écritures du même placement).
    expect(refus(() => validateStudioDocument({ ...d, solides: [{ ...d.solides![0]!, placement: { ...pl, basculement: { x: 0, y: 0 } } }] }))).toMatch(/basculement nul/);
    expect(refus(() => pivoter(d, 1, "w" as never))).toMatch(/axe « z », « x » ou « y » attendu/);
  });

  it("pousser la face « sommet » d'une boîte basculée : la hauteur locale grandit, la face d'origine reste en place (aucune dérive de l'origine)", () => {
    let d = pivoter(docBoite(), Math.PI / 2, "y");
    d = appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b", face: "sommet", distance: 1 } });
    expect((d.solides![0] as StudioBox).height).toBe(5);
    expect(Math.round(Math.max(...sommets(d).map((p) => p.x)) * 1e9) / 1e9).toBe(5);
    // Face x− (latérale 3) : l'origine recule le long de l'axe x LOCAL, devenu −z.
    d = appliquer(d, { toolId: "studio.solide.face-decaler", params: { id: "b", face: "lateral-3", distance: 1 } });
    expect(d.solides![0]!.placement.origin.z).toBe(1);
    expect((d.solides![0] as StudioBox).width).toBe(3);
  });

  it("export IFC : placement d'orientation complète (axe z et axe x locaux), jamais la seule rotation autour de z", () => {
    const d = pivoter(docBoite(), Math.PI / 2, "y");
    const ifc = exportStudioIfc(d, { studyName: "S", variantName: "V", timestamp: "2026-10-26T00:00:00" });
    expect(ifc).toMatch(/IFCDIRECTION\(\(1\.,0\.,-?0\.\)\)/);
    expect(ifc).toMatch(/IFCDIRECTION\(\(-?0\.,-?0\.,-1\.\)\)/);
  });

  it("refus explicites : booléen exact d’un solide basculé, symétrie d’un solide basculé", () => {
    const d = pivoter(docBoite(), 0.3, "x");
    expect(studioOperandeNoyau(d.solides![0]! as never)).toMatch(/solide basculé/);
    expect(refus(() => appliquer(d, { toolId: "studio.dessin.symetrie", params: { ids: ["b"], axisStart: { x: 0, y: 0 }, axisEnd: { x: 1, y: 0 }, keepSource: false } }))).toMatch(/symétrie d’un solide basculé/);
  });
});

describe("A.3-03 — échelle 3D depuis la vue 3D (volumes compris)", () => {
  it("échelle ×2 d'une boîte basculée autour de son origine : dimensions doublées, basculement conservé, volume ×8", () => {
    const d = pivoter(docBoite({ placement: { origin: { x: 1, y: 1, z: 0 }, rotation: 0 } }), Math.PI / 2, "y");
    const e = appliquer(d, { toolId: "studio.dessin.echelle", params: { ids: ["b"], center: { x: 1, y: 1 }, factor: 2, includeVolumes: true } });
    expect(e.solides![0]).toMatchObject({ width: 4, depth: 2, height: 8, placement: { origin: { x: 1, y: 1, z: 0 }, basculement: { x: 0, y: Math.PI / 2 } } });
    expect(studioQuantitesSolides(e).items[0]!.volume).toBe(64);
  });
});
