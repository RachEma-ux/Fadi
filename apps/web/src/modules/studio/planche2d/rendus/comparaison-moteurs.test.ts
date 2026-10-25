/**
 * TEST-025 (partie sans navigateur) — comparaison SVG / Canvas / GPU sur les scènes S1–S3 du corpus : la scène SVG de
 * référence (`exportStudioSvg`) est lue en primitives sans perte, tracée par le moteur Canvas sur un enregistreur, et les
 * traits relus du Canvas sont comparés à ceux du SVG (mêmes primitives, mêmes positions). Le moteur GPU (segments de
 * droite) est contrôlé sur ce qu'il trace et sur ce qu'il ne trace pas (textes). Accessibilité : le SVG porte ses textes
 * dans le document ; le Canvas ne les rend qu'en pixels (noté). DEC-08 retient SVG : rien ne bascule.
 * Les mesures dans un navigateur (pixels, latence, arbre d'accessibilité) sont faites par `e2e/studio-rendu.mjs`.
 */
import { describe, expect, it, vi } from "vitest";
import { exportStudioSvg } from "@parcours/atelier-model";
import { genererCorpus } from "@parcours/atelier-model/studio-corpus";
import {
  arcCentre, cadreViewBox, comparerTraits, compterElementsSvg, dessinerCanvas, EnregistreurCanvas, lirePrimitivesSvg, PAS_ARC_GPU, segmentsGpu, traitsCanvas, traitsSvg,
} from "./comparaison-moteurs";

vi.setConfig({ testTimeout: 60_000 });

const LARGEUR = 1200, HAUTEUR = 800;
const CAS = [["S1", 100], ["S2", 100], ["S3", 100], ["S3", 10_000]] as const;

describe("TEST-025 — fidélité SVG / Canvas sur S1–S3 (mêmes primitives, mêmes positions)", () => {
  for (const [scene, taille] of CAS) {
    it(`${scene} (${taille} primitives) : lecture sans perte, traits Canvas = traits SVG (aucun manquant, aucun en trop)`, () => {
      const corpus = genererCorpus(scene, taille);
      for (const doc of corpus.documents) {
        const svg = exportStudioSvg(doc);
        const lu = lirePrimitivesSvg(svg);
        // Rien n'est perdu à la lecture : autant de primitives que d'éléments graphiques dans le fichier.
        const elements = compterElementsSvg(svg);
        const genres: Record<string, string> = { ligne: "line", rect: "rect", cercle: "circle", chemin: "path", polygone: "polygon", texte: "text" };
        const lus: Record<string, number> = {};
        for (const p of lu.primitives) lus[genres[p.genre]!] = (lus[genres[p.genre]!] ?? 0) + 1;
        expect(lus).toEqual(elements);
        const ctx = new EnregistreurCanvas();
        dessinerCanvas(ctx, lu, LARGEUR, HAUTEUR);
        const reference = traitsSvg(lu);
        const c = comparerTraits(reference, traitsCanvas(ctx.appels, cadreViewBox(lu.viewBox, LARGEUR, HAUTEUR)));
        expect(c.manquants, JSON.stringify(c)).toBe(0);
        expect(c.enTrop, JSON.stringify(c)).toBe(0);
        expect(c.compare).toEqual(c.reference);
        expect(c.ecartMax).toBeLessThan(1e-6);
        expect(reference.length).toBeGreaterThan(0);
      }
    });
  }

  it("le contrôle porte : une primitive omise ou déplacée par le moteur Canvas est relevée", () => {
    const lu = lirePrimitivesSvg(exportStudioSvg(genererCorpus("S1", 100).documents[0]!));
    const reference = traitsSvg(lu);
    const omis = { ...lu, primitives: lu.primitives.filter((p, i) => !(p.genre === "chemin" && i % 2 === 0)) };
    const ctx = new EnregistreurCanvas();
    dessinerCanvas(ctx, omis, LARGEUR, HAUTEUR);
    expect(comparerTraits(reference, traitsCanvas(ctx.appels, cadreViewBox(lu.viewBox, LARGEUR, HAUTEUR))).manquants).toBeGreaterThan(0);
    const decale = { ...lu, primitives: lu.primitives.map((p) => (p.genre === "ligne" ? { ...p, x1: p.x1 + 0.01 } : p)) };
    const ctx2 = new EnregistreurCanvas();
    dessinerCanvas(ctx2, decale, LARGEUR, HAUTEUR);
    expect(comparerTraits(reference, traitsCanvas(ctx2.appels, cadreViewBox(lu.viewBox, LARGEUR, HAUTEUR))).manquants).toBeGreaterThan(0);
  });

  it("arc SVG → centre : quart de cercle dans les deux sens, grand et petit arc", () => {
    const a = arcCentre(1, 0, 1, false, true, 0, 1)!;
    expect(a.cx).toBeCloseTo(0, 12); expect(a.cy).toBeCloseTo(0, 12); expect(a.r).toBe(1); expect(a.positif).toBe(true);
    const b = arcCentre(1, 0, 1, true, true, 0, 1)!;
    expect(b.cx).toBeCloseTo(1, 12); expect(b.cy).toBeCloseTo(1, 12);
    expect(arcCentre(0, 0, 1, false, true, 0, 0)).toBeNull();
  });
});

describe("TEST-025 — moteur GPU (segments de droite) et accessibilité", () => {
  it("S1–S3 : segments en coordonnées de découpe [−1 ; 1], arcs découpés au pas déclaré, textes non tracés et comptés", () => {
    expect(PAS_ARC_GPU).toBeCloseTo(Math.PI / 32, 12);
    for (const scene of ["S1", "S2", "S3"] as const) {
      const lu = lirePrimitivesSvg(exportStudioSvg(genererCorpus(scene, 100).documents[0]!));
      const g = segmentsGpu(lu, LARGEUR, HAUTEUR);
      const t = traitsSvg(lu);
      expect(g.textesNonTraces).toBe(t.filter((x) => x.t === "texte").length);
      expect(g.segments).toBeGreaterThanOrEqual(t.filter((x) => x.t === "segment").length + t.filter((x) => x.t === "arc").length);
      for (const v of g.sommets) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("accessibilité : le SVG porte ses textes dans le document ; le Canvas ne les rend qu'en pixels (aucun texte exposé)", () => {
    const svg = exportStudioSvg(genererCorpus("S1", 100).documents[0]!);
    const lu = lirePrimitivesSvg(svg);
    const textes = lu.primitives.filter((p) => p.genre === "texte");
    expect(textes.length).toBeGreaterThan(0);
    for (const t of textes) if (t.genre === "texte") expect(svg).toContain(`>${t.contenu}</text>`);
    const ctx = new EnregistreurCanvas();
    dessinerCanvas(ctx, lu, LARGEUR, HAUTEUR);
    // Le contexte reçoit les textes, mais le canevas n'en garde que des pixels : rien de lisible par une aide technique.
    expect(ctx.appels.filter((a) => a.f === "fillText").length).toBe(textes.filter((t) => t.visible).length);
  });
});
