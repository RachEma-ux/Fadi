/**
 * Dégradation sûre de la vue 3D (TR-EX-057, EX-057) : politique pure. Ordre des réductions (ombres, puis résolution,
 * puis anti-crénelage), retour quand la charge baisse, aucune oscillation, et sortie limitée aux réglages de
 * présentation — accrochage et tolérances identiques sous charge.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StudioShape } from "@parcours/atelier-model";
import { candidatsObjets, indexLineaire, MODES_ACCROCHAGE, resoudre, type ReglagesAccrochage } from "../planche2d/accrochage";
import {
  BUDGET_TRAME_MS, descriptionReduction, ETAT_QUALITE_INITIAL, FENETRE_TRAMES, observerTrame, paliersApplicables, PALIERS_QUALITE,
  qualiteReduite, rapportPixels, reglageQualite, SEUIL_RETOUR_MS, type CapacitesRendu, type EtatQualite,
} from "./qualite-rendu";

const TOUS: CapacitesRendu = { ombres: true, antiCrenelage: true };
const SANS_OMBRES: CapacitesRendu = { ombres: false, antiCrenelage: true };

function jouer(e: EtatQualite, durees: readonly number[], c: CapacitesRendu): EtatQualite {
  return durees.reduce((s, d) => observerTrame(s, d, c), e);
}
const lourd = (n: number) => Array.from({ length: n }, () => BUDGET_TRAME_MS * 3);
const leger = (n: number) => Array.from({ length: n }, () => SEUIL_RETOUR_MS / 4);

describe("TR-EX-057 — seuils déclarés", () => {
  it("budget = une trame à 60 Hz, retour sous la moitié, fenêtre de 8 trames", () => {
    expect(BUDGET_TRAME_MS).toBeCloseTo(16.667, 3);
    expect(SEUIL_RETOUR_MS).toBeCloseTo(BUDGET_TRAME_MS / 2, 9);
    expect(FENETRE_TRAMES).toBe(8);
  });
});

describe("TR-EX-057 — ordre des réductions sous charge", () => {
  it("ombres d'abord, puis résolution (75 %, 50 %), puis anti-crénelage ; un palier par fenêtre", () => {
    let e = ETAT_QUALITE_INITIAL;
    const vus = [reglageQualite(e, TOUS)];
    for (let k = 0; k < 6; k++) {
      // Une fenêtre moins une trame : rien ne change encore.
      const avant = e.palier;
      e = jouer(e, lourd(FENETRE_TRAMES - 1), TOUS);
      expect(e.palier).toBe(avant);
      e = observerTrame(e, BUDGET_TRAME_MS * 3, TOUS);
      vus.push(reglageQualite(e, TOUS));
    }
    expect(vus.slice(0, 5)).toEqual([
      { ombres: true, resolution: 1, antiCrenelage: true },
      { ombres: false, resolution: 1, antiCrenelage: true },
      { ombres: false, resolution: 0.75, antiCrenelage: true },
      { ombres: false, resolution: 0.5, antiCrenelage: true },
      { ombres: false, resolution: 0.5, antiCrenelage: false },
    ]);
    // Dernier palier atteint : la charge persistante ne va pas plus loin.
    expect(vus[5]).toEqual(vus[4]);
    expect(e.palier).toBe(4);
    expect(qualiteReduite(e)).toBe(true);
  });

  it("sans ombres calculées (vue Studio actuelle), le palier « ombres » est sauté : la résolution baisse la première", () => {
    expect(paliersApplicables(SANS_OMBRES)).toEqual([
      { ombres: false, resolution: 1, antiCrenelage: true },
      { ombres: false, resolution: 0.75, antiCrenelage: true },
      { ombres: false, resolution: 0.5, antiCrenelage: true },
      { ombres: false, resolution: 0.5, antiCrenelage: false },
    ]);
    const e = jouer(ETAT_QUALITE_INITIAL, lourd(FENETRE_TRAMES), SANS_OMBRES);
    expect(reglageQualite(e, SANS_OMBRES)).toEqual({ ombres: false, resolution: 0.75, antiCrenelage: true });
    expect(descriptionReduction(reglageQualite(e, SANS_OMBRES), SANS_OMBRES)).toEqual(["résolution à 75 %"]);
    const max = jouer(e, lourd(FENETRE_TRAMES * 5), SANS_OMBRES);
    expect(descriptionReduction(reglageQualite(max, SANS_OMBRES), SANS_OMBRES)).toEqual(["résolution à 50 %", "anti-crénelage coupé"]);
  });

  it("une trame lourde isolée (premier rendu, reconstruction) ne dégrade rien : médiane de la fenêtre", () => {
    const durees = Array.from({ length: 80 }, (_, i) => (i % 8 === 3 ? 400 : 2));
    const e = jouer(ETAT_QUALITE_INITIAL, durees, TOUS);
    expect(e.palier).toBe(0);
    expect(e.changements).toBe(0);
  });

  it("une durée non finie ou négative n'est pas une mesure (ignorée, jamais un zéro)", () => {
    const e = jouer(ETAT_QUALITE_INITIAL, [Number.NaN, Infinity, -1, Number.NaN], TOUS);
    expect(e).toEqual(ETAT_QUALITE_INITIAL);
  });
});

describe("TR-EX-057 — retour quand la charge baisse", () => {
  it("palier par palier jusqu'à la qualité complète ; entre le seuil de retour et le budget, rien ne bouge (hystérésis)", () => {
    let e = jouer(ETAT_QUALITE_INITIAL, lourd(FENETRE_TRAMES * 4), TOUS);
    expect(e.palier).toBe(4);
    const entre = Array.from({ length: FENETRE_TRAMES * 3 }, () => (SEUIL_RETOUR_MS + BUDGET_TRAME_MS) / 2);
    const tenu = jouer(e, entre, TOUS);
    expect(tenu.palier).toBe(4);
    const paliers: number[] = [];
    for (let k = 0; k < 5; k++) { e = jouer(e, leger(FENETRE_TRAMES), TOUS); paliers.push(e.palier); }
    expect(paliers).toEqual([3, 2, 1, 0, 0]);
    expect(reglageQualite(e, TOUS)).toEqual(PALIERS_QUALITE[0]);
    expect(qualiteReduite(e)).toBe(false);
    expect(e.changements).toBe(8);
  });
});

describe("TR-EX-057 — présentation seulement : accrochage et tolérances identiques sous charge", () => {
  it("chaque palier ne porte que ombres / résolution / anti-crénelage (aucun accrochage, aucune tolérance, aucun objet)", () => {
    for (const p of [...PALIERS_QUALITE, ...paliersApplicables(SANS_OMBRES)]) expect(Object.keys(p).sort()).toEqual(["antiCrenelage", "ombres", "resolution"]);
    // La politique n'importe rien de l'accrochage ni du modèle : elle ne peut rien en modifier.
    const source = readFileSync(new URL("./qualite-rendu.ts", import.meta.url), "utf8");
    expect(source.match(/^import .*$/gm) ?? []).toEqual([]);
  });

  it("candidats, point accroché et tolérance rendus identiques avant, pendant et après la charge (paliers 0 à 4)", () => {
    const objets: StudioShape[] = [
      { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { id: "l2", type: "line", start: { x: 5, y: -5 }, end: { x: 5, y: 5 } },
      { id: "c1", type: "circle", center: { x: 20, y: 0 }, radius: 3 },
      { id: "r1", type: "rectangle", origin: { x: -8, y: 2 }, width: 4, height: 3 },
    ];
    const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: true, polaire: true, pasPolaire: 45 };
    const requetes = [
      { curseur: { x: 5.04, y: 0.03 }, tolerance: 0.12, base: null },
      { curseur: { x: 10.05, y: -0.02 }, tolerance: 0.12, base: { x: 0, y: 3 } },
      { curseur: { x: 23.02, y: 0.01 }, tolerance: 0.25, base: null },
      { curseur: { x: -4.03, y: 5.01 }, tolerance: 0.1, base: { x: -8, y: 2 } },
    ];
    const releve = () => {
      const index = indexLineaire(objets);
      return requetes.map((q) => ({ tolerance: q.tolerance, candidats: candidatsObjets(index, q, reglages), repere: resoudre(index, q, reglages) }));
    };
    const reference = JSON.stringify(releve());
    let e = ETAT_QUALITE_INITIAL;
    const vus = new Set<number>();
    for (let k = 0; k < 6; k++) {
      e = jouer(e, lourd(FENETRE_TRAMES), TOUS);
      vus.add(e.palier);
      expect(JSON.stringify(releve()), `palier ${e.palier}`).toBe(reference);
    }
    for (let k = 0; k < 5; k++) {
      e = jouer(e, leger(FENETRE_TRAMES), TOUS);
      expect(JSON.stringify(releve()), `retour, palier ${e.palier}`).toBe(reference);
    }
    expect([...vus].sort()).toEqual([1, 2, 3, 4]);
    expect(JSON.parse(reference).every((r: { repere: unknown }) => r.repere !== null)).toBe(true);
  });

  it("rapport de pixels : celui de l'appareil (borné à 2) multiplié par la résolution du palier", () => {
    expect(rapportPixels(1, PALIERS_QUALITE[0]!)).toBe(1);
    expect(rapportPixels(3, PALIERS_QUALITE[0]!)).toBe(2);
    expect(rapportPixels(2, PALIERS_QUALITE[2]!)).toBe(1.5);
    expect(rapportPixels(Number.NaN, PALIERS_QUALITE[3]!)).toBe(0.5);
  });
});
