import { describe, expect, it } from "vitest";
import { auMillimetre, cadrer, decalageSigne, versEcran, versMonde, VUE_INITIALE, zoomer } from "./vue-2d";

describe("vue de la Planche 2D", () => {
  it("aller-retour monde ↔ écran ; y monde vers le haut", () => {
    const p = { x: 3.25, y: -1.5 };
    const s = versEcran(VUE_INITIALE, 800, 600, p);
    expect(versMonde(VUE_INITIALE, 800, 600, s)).toEqual(p);
    expect(versEcran(VUE_INITIALE, 800, 600, { x: 0, y: 1 }).y).toBeLessThan(300);
  });
  it("le zoom garde le point sous le curseur", () => {
    const s = { x: 120, y: 80 };
    const avant = versMonde(VUE_INITIALE, 800, 600, s);
    const v = zoomer(VUE_INITIALE, 800, 600, s, 2);
    const apres = versMonde(v, 800, 600, s);
    expect(apres.x).toBeCloseTo(avant.x, 9);
    expect(apres.y).toBeCloseTo(avant.y, 9);
  });
  it("cadrer contient l'emprise ; décalage signé ; arrondi au millimètre", () => {
    const v = cadrer({ min: { x: 0, y: 0 }, max: { x: 10, y: 5 } }, 800, 600);
    expect(versEcran(v, 800, 600, { x: 0, y: 0 }).x).toBeGreaterThanOrEqual(0);
    expect(versEcran(v, 800, 600, { x: 10, y: 5 }).x).toBeLessThanOrEqual(800);
    expect(cadrer(null, 800, 600)).toEqual(VUE_INITIALE);
    expect(decalageSigne({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0.5 })).toBe(0.5);
    expect(decalageSigne({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: -0.5 })).toBe(-0.5);
    expect(auMillimetre({ x: 1.23456, y: -0.0004 })).toEqual({ x: 1.235, y: -0 });
  });
});
