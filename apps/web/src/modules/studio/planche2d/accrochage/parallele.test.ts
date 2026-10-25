/**
 * TR-EX-053 / EX-053 — narrow phase : mode d'accrochage « parallèle » (droite menée du dernier point parallèlement à un
 * segment de la vue), avec les autres règles de référence (priorités, tolérance, départage sous permutation).
 */
import { describe, expect, it } from "vitest";
import type { StudioShape } from "@parcours/atelier-model";
import { basculerAccrochage, BASCULES_INITIALES, candidatsObjets, indexLineaire, MODES_ACCROCHAGE, MODES_PAR_DEFAUT, resoudre, type ModeAccrochage, type ReglagesAccrochage } from ".";
import { cibleRaccourci, COMMANDES_EDITEUR } from "../raccourcis";

const ligne = (id: string, ax: number, ay: number, bx: number, by: number): StudioShape => ({ id, type: "line", start: { x: ax, y: ay }, end: { x: bx, y: by } });
const reglages = (modes: ModeAccrochage[]): ReglagesAccrochage => ({ objets: true, modes: new Set(modes), orthogonal: false, polaire: false, pasPolaire: 45 });
const VUE = { min: { x: -50, y: -50 }, max: { x: 50, y: 50 } };

describe("TR-EX-053 — accrochage parallèle", () => {
  it("depuis le dernier point, le pointeur proche de la parallèle à un segment éloigné s'accroche sur cette droite (point exact, ligne guide)", () => {
    const index = indexLineaire([ligne("oblique", 10, 0, 13, 4)]);
    // Base (0, 0) ; direction de référence (3, 4)/5 ; pointeur à 0,05 m de la droite y = 4x/3.
    const r = resoudre(index, { curseur: { x: 3.04, y: 3.97 }, tolerance: 0.1, base: { x: 0, y: 0 }, vue: VUE }, reglages(["parallele"]));
    expect(r).toMatchObject({ genre: "parallele", objets: ["oblique"], ancre: null, guide: { de: { x: 0, y: 0 } } });
    expect(r!.point.y / r!.point.x).toBeCloseTo(4 / 3, 12);
    expect(r!.distance).toBeLessThanOrEqual(0.1);
  });

  it("tolérance : au-delà, aucune parallèle ; sans dernier point, aucune ; mode coupé, aucune", () => {
    const index = indexLineaire([ligne("h", 10, 10, 20, 10)]);
    const q = { curseur: { x: 5, y: 0.3 }, tolerance: 0.2, base: { x: 0, y: 0 }, vue: VUE };
    expect(candidatsObjets(index, q, reglages(["parallele"]))).toEqual([]);
    expect(candidatsObjets(index, { ...q, curseur: { x: 5, y: 0.1 } }, reglages(["parallele"]))[0]).toMatchObject({ genre: "parallele", point: { x: 5, y: 0 } });
    expect(candidatsObjets(index, { ...q, curseur: { x: 5, y: 0.1 }, base: null }, reglages(["parallele"]))).toEqual([]);
    expect(candidatsObjets(index, { ...q, curseur: { x: 5, y: 0.1 } }, reglages(["perpendiculaire"]))).toEqual([]);
  });

  it("priorités : un point exact (extrémité) l'emporte sur la parallèle ; la parallèle (rang relatif) l'emporte sur le plus proche ; départage stable sous permutation", () => {
    const formes = [ligne("ref", 0, 10, 10, 10), ligne("cible", 5, -2, 5, 2)];
    const q = { curseur: { x: 5.02, y: 0.03 }, tolerance: 0.2, base: { x: 0, y: 0 }, vue: VUE };
    const tous = reglages([...MODES_ACCROCHAGE]);
    // Le point exact de rang 0 le plus proche (milieu de « cible ») passe devant la parallèle.
    expect(resoudre(indexLineaire(formes), q, tous)).toMatchObject({ genre: "milieu", point: { x: 5, y: 0 } });
    const sansExacts = reglages(["parallele", "proche"]);
    expect(resoudre(indexLineaire(formes), q, sansExacts)).toMatchObject({ genre: "parallele", point: { x: 5.02, y: 0 } });
    expect(resoudre(indexLineaire([...formes].reverse()), q, sansExacts)).toEqual(resoudre(indexLineaire(formes), q, sansExacts));
    expect(MODES_ACCROCHAGE.indexOf("parallele")).toBeGreaterThan(MODES_ACCROCHAGE.indexOf("tangente"));
    expect(MODES_PAR_DEFAUT.has("parallele")).toBe(false);
  });

  it("bascule propre (règle d'or) : commande « Accrocher en parallèle », Maj+F6, icône propre, barre Accrochage", () => {
    expect(cibleRaccourci("Shift+F6")).toEqual({ type: "commande", id: "accrochage-parallele" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "accrochage-parallele")).toMatchObject({ groupe: "accrochage", iconeSymbolique: "studio-snap-parallel", bascule: true });
    expect(basculerAccrochage(BASCULES_INITIALES, "accrochage-parallele")!.modes.has("parallele")).toBe(true);
  });
});
