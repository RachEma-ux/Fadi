/**
 * C.1-02 (choix de l'index rapproché de la mesure, DEC-09) et TR-EX-052 (comparaison à la cible DEC-13) : règles de
 * l'analyse appliquée au rapport de mesure complet (`e2e/studio-rend.mjs`, Chromium de la CI). Les valeurs ci-dessous
 * sont SYNTHÉTIQUES (forme des mesures seulement) ; la mesure réelle est celle du rapport archivé.
 */
import { describe, expect, it } from "vitest";
import { analyserChoixIndex, BUDGET_INP_P75_MS, comparerALaCible, mesurerCorpus, statistiques, type MesureCorpus, type MesureOperation } from "./mesure-spatiale";
import { SEUIL_INDEX_SPATIAL } from "./index-spatial";

const st = (p: number) => ({ ...statistiques([p]), p50: p, p75: p * 1.2 });
const op = (lin: number, idx: number, construction = 0, divergences = 0): MesureOperation => ({ lineaire: st(lin), indexe: st(idx), constructionIndexMs: construction, constructionLineaireMs: 0, divergences, resultatsMoyens: 1 });
const m = (taille: number, sel: MesureOperation, acc: MesureOperation, scene: MesureCorpus["scene"] = "S3"): MesureCorpus => ({
  scene, taille, feuillets: 1, elementsPlanche: taille, formesAccrochables: taille, emprise: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } },
  cheminActuel: { selection: taille >= SEUIL_INDEX_SPATIAL ? "index" : "lineaire", accrochage: taille >= SEUIL_INDEX_SPATIAL ? "index" : "lineaire", seuil: SEUIL_INDEX_SPATIAL }, selection: sel, accrochage: acc,
});

describe("C.1-02 — choix de l'index selon DEC-09, sur la mesure et l'exactitude", () => {
  it("seuil cohérent : linéaire admissible sous 1 000, index plus rapide au-delà, zéro divergence ; croisement relevé", () => {
    const a = analyserChoixIndex([m(100, op(0.01, 0.02, 0.05), op(0.01, 0.015, 0.05)), m(10_000, op(1, 0.1), op(0.8, 0.05)), m(100_000, op(10, 0.5), op(9, 0.3))]);
    expect(a).toMatchObject({ seuil: 1000, croisement: { selection: 10_000, accrochage: 10_000 }, sousLeSeuilLineaireAdmis: true, auDessusIndexPlusRapide: true, divergences: 0, coherent: true });
  });

  it("incohérent : index plus lent au-delà du seuil, ou une divergence index / linéaire (résultat inexact)", () => {
    expect(analyserChoixIndex([m(10_000, op(0.1, 0.5), op(0.1, 0.05))]).coherent).toBe(false);
    expect(analyserChoixIndex([m(10_000, op(1, 0.1, 0, 1), op(0.8, 0.05))])).toMatchObject({ divergences: 1, coherent: false });
    // Sous le seuil, un linéaire plus lent que l'index même construction comprise : le seuil serait trop haut.
    expect(analyserChoixIndex([m(100, op(5, 0.1, 0.1), op(0.01, 0.02)), m(10_000, op(1, 0.1), op(0.8, 0.05))]).sousLeSeuilLineaireAdmis).toBe(false);
  });

  it("sur une vraie mesure courte (S1, S3 à 100 et 3 000 primitives) : exactitude (0 divergence) et analyse produite", () => {
    const mesures = (["S1", "S3"] as const).flatMap((s) => [100, 3000].map((t) => mesurerCorpus(s, t, { requetes: 20, echauffement: 2, graine: 3, maintenant: () => performance.now() })));
    const a = analyserChoixIndex(mesures);
    expect(a.divergences).toBe(0);
    expect(Object.keys(a.croisement)).toEqual(["selection", "accrochage"]);
    expect(mesures.every((x) => x.selection.lineaire.p75 >= x.selection.lineaire.p50)).toBe(true);
  });
});

describe("TR-EX-052 — recherches comparées à la cible DEC-13 (INP p75 ≤ 200 ms), chemin pris aujourd'hui", () => {
  it("le p75 du chemin effectivement pris est comparé au budget ; au-delà, hors cible", () => {
    expect(BUDGET_INP_P75_MS).toBe(200);
    const c = comparerALaCible([m(100, op(1, 9), op(2, 9)), m(100_000, op(500, 100), op(400, 250))]);
    expect(c.map((x) => [x.taille, x.operation, x.chemin, x.dansLaCible])).toEqual([
      [100, "selection", "lineaire", true], [100, "accrochage", "lineaire", true], [100_000, "selection", "index", true], [100_000, "accrochage", "index", false],
    ]);
    expect(c[3]!.p75).toBeCloseTo(300, 9);
    expect(c[3]!.partBudget).toBeCloseTo(1.5, 9);
  });
});
