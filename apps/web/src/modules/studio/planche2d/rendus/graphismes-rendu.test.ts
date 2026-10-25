/**
 * TR-EX-055 — fidélité du rendu 2D sur une scène qui réunit lignes, arcs, cercles, contours, cotes, textes, calques
 * (dont un masqué) et les graphismes du modèle : splines, hachures, symboles et transparences. Rendu SVG du modèle
 * (`exportStudioSvg`) comparé au moteur Canvas (traits relus : mêmes primitives, mêmes positions, même opacité) et au
 * moteur GPU (segments, opacité par segment) du module de preuve `comparaison-moteurs.ts`.
 * F.1-02 — moteur Canvas de la planche derrière la règle F.1-01 : SVG par défaut, Canvas seulement avec un rapport
 * qualifiant ; mêmes coordonnées que la planche SVG (cadre de vue identique), même désignation et même accrochage.
 */
import { describe, expect, it } from "vitest";
import {
  applyStudioCommands, exportStudioSvg, newStudioDocument, STUDIO_RAPPORT_ACCELERATION_SCHEMA, STUDIO_SEGMENTS_PAR_BEZIER,
  type StudioCommand, type StudioDocument, type StudioRapportAcceleration,
} from "@parcours/atelier-model";
import {
  cadreViewBox, comparerTraits, compterElementsSvg, dessinerCanvas, EnregistreurCanvas, lirePrimitivesSvg, SEGMENTS_BEZIER_GPU, segmentsGpu, traitsCanvas, traitsSvg,
} from "./comparaison-moteurs";
import { cadrePlanche, moteurPlanche, rendrePlancheCanvas, scenePlanche, texteMoteurPlanche } from "./moteur-canvas";
import { ecranVersPlanche } from "../vue";
import { indexLineaire, MODES_ACCROCHAGE, resoudre, type ReglagesAccrochage } from "../accrochage";

const L = 1200, H = 800;

/** Scène de fidélité EX-055 : toutes les familles de tracé du renderer 2D, deux calques dont un masqué. */
export function sceneFidelite(): StudioDocument {
  const cs: StudioCommand[] = [
    { toolId: "studio.calque.creer", params: { id: "plan", name: "Plan", visible: true, locked: false } },
    { toolId: "studio.calque.creer", params: { id: "cache", name: "Caché", visible: false, locked: false } },
    { toolId: "studio.dessin.ligne", params: { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } } },
    { toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 0, y: 1 }, width: 3, height: 2, layerId: "plan" } },
    { toolId: "studio.dessin.cercle", params: { id: "c", type: "circle", center: { x: 9, y: 2 }, radius: 1.5 } },
    { toolId: "studio.dessin.arc", params: { id: "a", type: "arc", center: { x: 13, y: 2 }, radius: 1.2, startAngle: 0.3, endAngle: 2.6 } },
    { toolId: "studio.dessin.polyligne", params: { id: "p", type: "polyline", points: [{ x: 0, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 8 }], closed: false, bulges: [0.4, 0] } },
    { toolId: "studio.dessin.ligne", params: { id: "cachee", type: "line", start: { x: 0, y: 9 }, end: { x: 3, y: 9 }, layerId: "cache" } },
    { toolId: "studio.dessin.cote", params: { id: "d", type: "dimension", start: { x: 0, y: 0 }, end: { x: 6, y: 0 }, offset: -0.6, links: { start: { objectId: "l", anchor: "start" }, end: { objectId: "l", anchor: "end" } }, toResolve: false } },
    { toolId: "studio.dessin.texte", params: { id: "t", type: "text", position: { x: 6, y: 6 }, height: 0.4, rotation: 0.4, content: "Séjour", justification: "center" } },
    { toolId: "studio.graphisme.creer", params: { id: "sp", type: "spline", points: [{ x: 6, y: 9 }, { x: 7, y: 11 }, { x: 9, y: 11 }, { x: 10, y: 9 }, { x: 11, y: 7 }, { x: 13, y: 7 }, { x: 14, y: 9 }] } },
    { toolId: "studio.graphisme.creer", params: { id: "ha", type: "hachure", contour: [{ x: 15, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 4 }, { x: 17, y: 2 }, { x: 15, y: 4 }], angle: Math.PI / 4, espacement: 0.4, opacite: 0.5, layerId: "plan" } },
    { toolId: "studio.graphisme.creer", params: { id: "hb", type: "hachure", contour: [{ x: 15, y: 5 }, { x: 19, y: 5 }, { x: 19, y: 8 }, { x: 15, y: 8 }], angle: 0, espacement: 0.5 } },
    { toolId: "studio.graphisme.creer", params: { id: "sn", type: "symbole", symbole: "nord", position: { x: 22, y: 2 }, rotation: Math.PI / 6, echelle: 2, opacite: 0.75 } },
    { toolId: "studio.graphisme.creer", params: { id: "sc", type: "symbole", symbole: "croix", position: { x: 22, y: 6 }, rotation: 0, echelle: 1 } },
    { toolId: "studio.graphisme.creer", params: { id: "sv", type: "symbole", symbole: "niveau", position: { x: 22, y: 9 }, rotation: 0, echelle: 1.5, opacite: 0.3 } },
  ];
  return applyStudioCommands(newStudioDocument("fidelite-ex055"), cs);
}

/** Rapport qualifiant SYNTHÉTIQUE (forme seulement) : il exerce le chemin d'activation, ce n'est pas une mesure. */
const rapportSynthetique = (): StudioRapportAcceleration => ({
  schema: STUDIO_RAPPORT_ACCELERATION_SCHEMA, acceleration: "rendu-canvas-planche", test: "TEST-025 (synthétique)", reference: "svg", candidat: "canvas",
  environnement: { appareil: "synthétique", renduLogiciel: true, date: "2026-10-25" },
  mesures: [{ scene: "S1", reference: 10, candidat: 5 }],
  equivalence: [{ critere: "primitives-rendues", ecart: 0, tolerance: 1e-6 }, { critere: "textes-accessibles", ecart: 0, tolerance: 0 }, { critere: "cibles-accrochage", ecart: 0, tolerance: 0 }, { critere: "selection", ecart: 0, tolerance: 0 }],
});

describe("TR-EX-055 — splines, hachures, symboles et transparences : rendu SVG et comparaison Canvas / GPU", () => {
  it("rendu SVG du modèle : chaque famille présente (Bézier `C`, traits de hachure, symboles, opacité), lecture sans perte", () => {
    const svg = exportStudioSvg(sceneFidelite());
    const lu = lirePrimitivesSvg(svg);
    const genres: Record<string, string> = { ligne: "line", rect: "rect", cercle: "circle", chemin: "path", polygone: "polygon", texte: "text" };
    const lus: Record<string, number> = {};
    for (const p of lu.primitives) lus[genres[p.genre]!] = (lus[genres[p.genre]!] ?? 0) + 1;
    expect(lus).toEqual(compterElementsSvg(svg));
    const traits = traitsSvg(lu);
    const parType = (t: string) => traits.filter((x) => x.t === t).length;
    expect(parType("bezier")).toBe(2);
    expect(parType("arc")).toBeGreaterThanOrEqual(4);
    expect(parType("texte")).toBe(2);
    // Transparences portées : 0,5 (hachure), 0,75 (nord) et 0,3 (niveau), opaques ailleurs.
    expect([...new Set(traits.map((t) => t.a))].sort()).toEqual([0.3, 0.5, 0.75, 1]);
    // Le calque masqué garde son contenu, non visible : aucun de ses traits n'est rendu.
    expect(lu.primitives.some((p) => !p.visible)).toBe(true);
  });

  it("Canvas = SVG : mêmes primitives, mêmes positions, même opacité (aucun trait manquant ni en trop, écart < 1e-6 m)", () => {
    const lu = lirePrimitivesSvg(exportStudioSvg(sceneFidelite()));
    const ctx = new EnregistreurCanvas();
    dessinerCanvas(ctx, lu, L, H);
    const c = comparerTraits(traitsSvg(lu), traitsCanvas(ctx.appels, cadreViewBox(lu.viewBox, L, H)));
    expect(c.manquants, JSON.stringify(c)).toBe(0);
    expect(c.enTrop, JSON.stringify(c)).toBe(0);
    expect(c.compare).toEqual(c.reference);
    expect(c.reference.bezier).toBe(2);
    expect(c.ecartMax).toBeLessThan(1e-6);
    expect(ctx.appels.filter((a) => a.f === "bezierCurveTo")).toHaveLength(2);
  });

  it("le contrôle porte : un moteur qui ignore la transparence, omet une spline ou un trait de hachure est relevé", () => {
    const lu = lirePrimitivesSvg(exportStudioSvg(sceneFidelite()));
    const reference = traitsSvg(lu);
    const relire = (scene: typeof lu) => { const ctx = new EnregistreurCanvas(); dessinerCanvas(ctx, scene, L, H); return traitsCanvas(ctx.appels, cadreViewBox(lu.viewBox, L, H)); };
    const opaque = { ...lu, primitives: lu.primitives.map((p) => ({ ...p, alpha: 1 })) };
    expect(comparerTraits(reference, relire(opaque)).manquants).toBeGreaterThan(0);
    const sansSpline = { ...lu, primitives: lu.primitives.filter((p) => !(p.genre === "chemin" && p.commandes.some((c) => c.c === "C"))) };
    expect(comparerTraits(reference, relire(sansSpline)).reference.bezier - comparerTraits(reference, relire(sansSpline)).compare.bezier).toBe(2);
    const i = lu.primitives.findIndex((p) => p.genre === "ligne" && p.alpha === 0.5);
    expect(i).toBeGreaterThan(-1);
    const sansTrait = { ...lu, primitives: lu.primitives.filter((_, k) => k !== i) };
    expect(comparerTraits(reference, relire(sansTrait)).manquants).toBe(1);
  });

  it("GPU : splines découpées au pas déclaré, opacité portée par segment, textes non tracés et comptés", () => {
    const lu = lirePrimitivesSvg(exportStudioSvg(sceneFidelite()));
    const g = segmentsGpu(lu, L, H);
    const t = traitsSvg(lu);
    expect(SEGMENTS_BEZIER_GPU).toBe(STUDIO_SEGMENTS_PAR_BEZIER);
    expect(g.alphas).toHaveLength(g.segments);
    expect(g.textesNonTraces).toBe(t.filter((x) => x.t === "texte").length);
    expect(g.segments).toBeGreaterThanOrEqual(t.filter((x) => x.t === "segment").length + 2 * SEGMENTS_BEZIER_GPU);
    expect([...new Set([...g.alphas].map((a) => Math.round(a * 100) / 100))].sort()).toEqual([0.3, 0.5, 0.75, 1]);
    for (const v of g.sommets) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("F.1-02 — moteur Canvas de la planche, derrière la règle F.1-01 (défaut SVG, DEC-08)", () => {
  it("sans rapport : SVG ; rapport qualifiant : Canvas ; rapport qui ne prouve pas le gain : SVG avec le motif dit", () => {
    expect(moteurPlanche(null)).toEqual({ moteur: "svg", verdict: null });
    expect(texteMoteurPlanche(moteurPlanche(null))).toBe("Moteur de rendu de la planche : SVG (référence, DEC-08)");
    expect(moteurPlanche(rapportSynthetique()).moteur).toBe("canvas");
    const lent = { ...rapportSynthetique(), mesures: [{ scene: "S1", reference: 5, candidat: 9 }] };
    const m = moteurPlanche(lent);
    expect(m.moteur).toBe("svg");
    expect(texteMoteurPlanche(m)).toBe("Moteur de rendu de la planche : SVG (référence) — Canvas refusé : gain non prouvé");
    const sansAccessibilite = { ...rapportSynthetique(), equivalence: rapportSynthetique().equivalence.filter((e) => e.critere !== "textes-accessibles") };
    expect(texteMoteurPlanche(moteurPlanche(sansAccessibilite))).toContain("critère d’équivalence absent");
  });

  it("la planche en Canvas trace les mêmes traits que le SVG de référence, au cadre de la vue (axe y retourné)", () => {
    const doc = sceneFidelite();
    const scene = scenePlanche(doc);
    const cadre = { x: -2, y: -3, w: 30, h: 16 };
    const ctx = new EnregistreurCanvas();
    rendrePlancheCanvas(ctx, scene, cadre, L, H);
    const c = comparerTraits(traitsSvg(scene), traitsCanvas(ctx.appels, cadrePlanche(cadre, L, H)));
    expect(c.manquants, JSON.stringify(c)).toBe(0);
    expect(c.enTrop).toBe(0);
    expect(c.ecartMax).toBeLessThan(1e-6);
  });

  it("mêmes coordonnées que la planche SVG : un point du document tombe au même pixel ; même désignation et même accrochage quel que soit le moteur", () => {
    const cadre = { x: -2, y: -3, w: 30, h: 16 }, r = { left: 0, top: 0, width: L, height: H };
    const k = cadrePlanche(cadre, L, H);
    for (const p of [{ x: 0, y: 0 }, { x: 9, y: 2 }, { x: 22.5, y: -1.25 }, { x: 27, y: 12 }]) {
      // Pixel du canevas pour le point p (scène exportée : y SVG = −y du document).
      const px = { x: k.ox + p.x * k.echelle, y: k.oy + (k.sy ?? 1) * -p.y * k.echelle };
      const relu = ecranVersPlanche(cadre, r, px);
      expect(relu.x).toBeCloseTo(p.x, 9);
      expect(relu.y).toBeCloseTo(p.y, 9);
    }
    // Accrochage : résolu sur le document (formes), jamais sur le rendu — identique pour les deux moteurs.
    const doc = sceneFidelite();
    const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
    const q = { curseur: { x: 6.05, y: 0.04 }, tolerance: 0.2, base: null };
    const svg = resoudre(indexLineaire(doc.objects), q, reglages);
    expect(moteurPlanche(rapportSynthetique()).moteur).toBe("canvas");
    const canvas = resoudre(indexLineaire(doc.objects), q, reglages);
    expect(canvas).toEqual(svg);
    expect(svg?.point).toEqual({ x: 6, y: 0 });
  });
});
