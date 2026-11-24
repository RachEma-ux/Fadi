import { describe, expect, it } from "vitest";
import { HAUTEUR_VIRTUELLE, LARGEUR_VIRTUELLE, largeurVueEcranLarge } from "./ecran-large";

describe("Planche détachée au téléphone : largeur de mise en page", () => {
  it("debout : la largeur virtuelle (comme la « version ordinateur »), hauteur suffisante", () => {
    const l = largeurVueEcranLarge({ largeur: 412, hauteur: 915 });
    expect(l).toBe(LARGEUR_VIRTUELLE);
    expect((l * 915) / 412).toBeGreaterThanOrEqual(HAUTEUR_VIRTUELLE);
  });
  it("couché : assez large pour que la hauteur garde toute la barre de gauche et toute la colonne", () => {
    const l = largeurVueEcranLarge({ largeur: 915, hauteur: 412 });
    expect(l).toBeGreaterThan(LARGEUR_VIRTUELLE);
    expect((l * 412) / 915).toBeGreaterThanOrEqual(HAUTEUR_VIRTUELLE - 0.5);
  });
  it("ne descend jamais sous la largeur de l'écran", () => {
    expect(largeurVueEcranLarge({ largeur: 1280, hauteur: 1400 })).toBe(1280);
  });
  it("reste défini pour une taille nulle", () => {
    expect(Number.isFinite(largeurVueEcranLarge({ largeur: 0, hauteur: 0 }))).toBe(true);
  });
});
