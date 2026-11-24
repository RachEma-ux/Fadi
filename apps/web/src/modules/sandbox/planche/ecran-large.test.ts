import { describe, expect, it } from "vitest";
import { HAUTEUR_VIRTUELLE, LARGEUR_VIRTUELLE, miseEchelleEcranLarge } from "./ecran-large";

describe("Planche détachée au téléphone : mise à l'échelle", () => {
  it("debout : pose la Planche sur la largeur virtuelle et la réduit pour couvrir exactement l'écran", () => {
    const m = miseEchelleEcranLarge({ largeur: 412, hauteur: 915 });
    expect(m.largeur).toBeCloseTo(LARGEUR_VIRTUELLE);
    expect(m.largeur * m.echelle).toBeCloseTo(412);
    expect(m.hauteur * m.echelle).toBeCloseTo(915);
  });
  it("couché : la hauteur virtuelle garde toute la barre de gauche et toute la colonne", () => {
    const m = miseEchelleEcranLarge({ largeur: 915, hauteur: 412 });
    expect(m.hauteur).toBeCloseTo(HAUTEUR_VIRTUELLE);
    expect(m.largeur).toBeGreaterThanOrEqual(LARGEUR_VIRTUELLE);
    expect(m.largeur * m.echelle).toBeCloseTo(915);
    expect(m.hauteur * m.echelle).toBeCloseTo(412);
  });
  it("ne réduit pas un écran déjà assez grand", () => {
    expect(miseEchelleEcranLarge({ largeur: 1280, hauteur: 1200 })).toEqual({ largeur: 1280, hauteur: 1200, echelle: 1 });
  });
  it("reste défini pour une taille nulle", () => {
    const m = miseEchelleEcranLarge({ largeur: 0, hauteur: 0 });
    expect(Number.isFinite(m.echelle) && m.echelle > 0).toBe(true);
  });
});
