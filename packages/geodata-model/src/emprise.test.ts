import { describe, expect, it } from "vitest";
import { bornerEmprise, grilleRegroupement, ORIGINE_MERCATOR, regroupementActif, syntheseCouche, zoomSurGrappe } from "./emprise.js";
import type { ValeurIndicateur } from "./valeurs.js";

const v = (x: number): ValeurIndicateur => ({ valeur: x, motifAbsence: null });
const absente: ValeurIndicateur = { valeur: null, motifAbsence: "secret-statistique" };

describe("lecture de l'emprise (D-GD-39) : synthèse d'une couche dans la vue", () => {
  it("compte les objets de la vue et ceux de la couche", () => {
    expect(syntheseCouche({ codes: ["a", "b"], total: 10 })).toEqual({ dansVue: 2, total: 10, indicateur: null });
  });
  it("le filtre de la couche s'applique aux deux comptes", () => {
    expect(syntheseCouche({ codes: ["a", "b", "c"], total: 10, retenus: new Set(["b", "c", "z"]) })).toMatchObject({ dansVue: 2, total: 3 });
  });
  it("min, moyenne simple et max sur les seules valeurs évaluées ; une absence n'est jamais zéro", () => {
    const valeurs = new Map([["a", v(10)], ["b", v(0)], ["c", absente], ["d", v(50)]]);
    expect(syntheseCouche({ codes: ["a", "b", "c", "d", "e"], total: 5, valeurs }).indicateur).toEqual({ evaluees: 3, nonEvaluees: 2, min: 0, moyenne: 20, max: 50 });
  });
  it("aucune valeur évaluée : min, moyenne et max non évalués (null), jamais 0", () => {
    expect(syntheseCouche({ codes: ["c"], total: 1, valeurs: new Map([["c", absente]]) }).indicateur).toEqual({ evaluees: 0, nonEvaluees: 1, min: null, moyenne: null, max: null });
    expect(syntheseCouche({ codes: [], total: 4, valeurs: new Map() }).indicateur).toEqual({ evaluees: 0, nonEvaluees: 0, min: null, moyenne: null, max: null });
  });
  it("emprise bornée au domaine des tuiles ; vide ou mal formée → null", () => {
    expect(bornerEmprise([-200, -90, 200, 90])).toEqual([-180, -85.05, 180, 85.05]);
    expect(bornerEmprise([1, 2, 1, 3])).toBeNull();
    expect(bornerEmprise([1, 2, "3", 4])).toBeNull();
    expect(bornerEmprise([1, 2, 3])).toBeNull();
  });
});

describe("regroupement des points dans les tuiles (D-GD-39)", () => {
  it("8 × 8 cellules par tuile, bords des cellules sur les bords des tuiles", () => {
    for (const z of [0, 5, 13]) {
      const { cote, origine } = grilleRegroupement(z);
      const tuile = (2 * ORIGINE_MERCATOR) / 2 ** z;
      expect(cote * 8).toBeCloseTo(tuile, 6);
      // Centre de cellule = origine + k·côté ; bord = centre − côté / 2 = −ORIGINE + k·côté : multiple du côté.
      expect(origine - cote / 2).toBeCloseTo(-ORIGINE_MERCATOR, 6);
    }
  });
  it("actif jusqu'au zoom 13, jamais au zoom 14 (points servis seuls)", () => {
    expect(regroupementActif(0)).toBe(true);
    expect(regroupementActif(13)).toBe(true);
    expect(regroupementActif(14)).toBe(false);
  });
  it("clic sur une grappe : deux crans plus près, sans dépasser 14,5", () => {
    expect(zoomSurGrappe(6)).toBe(8);
    expect(zoomSurGrappe(13.4)).toBe(14.5);
  });
});
