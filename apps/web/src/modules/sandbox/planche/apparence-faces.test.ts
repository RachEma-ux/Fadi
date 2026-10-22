import { describe, expect, it } from "vitest";
import { COULEUR_RECTO, TRAME_SELECTION, intensiteLumiere, pointDeTrame } from "./apparence-faces";

/** Luminance affichée (sRGB) d'une face blanche éclairée comme dans three.js : Lambert = couleur / π. */
function luminanceAffichee(cosLumiere: number, ombres: boolean): number {
  const hemisphere = 2.2;
  const solLineaire = Math.pow((0x9a + 0xa0 + 0xa8) / 3 / 255, 2.2);
  const indirect = (hemisphere * (1 + solLineaire)) / 2 / Math.PI; // face verticale : mélange ciel / sol à 50 %
  const direct = (intensiteLumiere(ombres) * Math.max(0, cosLumiere)) / Math.PI;
  return Math.pow(Math.min(1, indirect + direct), 1 / 2.2);
}

describe("apparence des faces (Sandbox)", () => {
  it("le recto par défaut est blanc", () => {
    expect(COULEUR_RECTO).toBe("#ffffff");
  });

  it("sans ombres, une face vue de face ou à 40° est blanche ; une face rasante reste grisée", () => {
    expect(luminanceAffichee(1, false)).toBe(1);
    expect(luminanceAffichee(Math.cos((40 * Math.PI) / 180), false)).toBe(1);
    expect(luminanceAffichee(0, false)).toBeLessThan(0.8);
  });

  it("avec ombres, l'intensité du soleil est inchangée", () => {
    expect(intensiteLumiere(true)).toBe(1.6);
  });

  it("la trame donne des points espacés d'un pas, rangées décalées d'un demi-pas", () => {
    const pas = TRAME_SELECTION.pas;
    // Centre de cellule sur une rangée paire : point ; coin de cellule : vide.
    expect(pointDeTrame(pas / 2, pas / 2, 1)).toBe(true);
    expect(pointDeTrame(0, 0, 1)).toBe(false);
    // Rangée impaire : le point est décalé d'un demi-pas.
    expect(pointDeTrame(pas / 2, pas * 1.5, 1)).toBe(false);
    expect(pointDeTrame(0, pas * 1.5, 1)).toBe(true);
  });

  it("la trame suit le ratio de pixels (même densité visuelle sur écran dense)", () => {
    const r = 2;
    expect(pointDeTrame(TRAME_SELECTION.pas, TRAME_SELECTION.pas, r)).toBe(true);
    let points = 0;
    for (let x = 0; x < 40 * r; x++) for (let y = 0; y < 40 * r; y++) if (pointDeTrame(x + 0.5, y + 0.5, r)) points++;
    const surface = points / (40 * r * 40 * r);
    // Environ π r² / pas² de la surface couverte : une trame légère, la face reste lisible dessous.
    expect(surface).toBeGreaterThan(0.08);
    expect(surface).toBeLessThan(0.2);
  });
});
