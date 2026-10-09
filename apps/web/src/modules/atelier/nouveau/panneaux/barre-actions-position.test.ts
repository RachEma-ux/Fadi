import { describe, expect, it } from "vitest";
import { borner, lirePosition, pasClavier, positionParDefaut } from "./barre-actions-position";

const taille = { largeur: 200, hauteur: 48 };

describe("barre d'actions flottante : bornage (D-195)", () => {
  it("laisse une position intérieure inchangée et ramène une position sortie de l'écran, marge comprise", () => {
    const zone = { largeur: 1000, hauteur: 600 };
    expect(borner({ x: 300, y: 200 }, taille, zone)).toEqual({ x: 300, y: 200 });
    expect(borner({ x: -500, y: -500 }, taille, zone)).toEqual({ x: 4, y: 4 });
    expect(borner({ x: 5000, y: 5000 }, taille, zone)).toEqual({ x: 796, y: 548 });
  });
  it("suit la zone visuelle décalée (clavier virtuel, zoom) et une rotation du téléphone", () => {
    expect(borner({ x: 300, y: 700 }, taille, { largeur: 390, hauteur: 400, gauche: 0, haut: 0 })).toEqual({ x: 186, y: 348 });
    expect(borner({ x: 0, y: 0 }, taille, { largeur: 390, hauteur: 400, gauche: 20, haut: 120 })).toEqual({ x: 24, y: 124 });
    // Paysage 844 × 390 : une barre posée en bas du portrait revient dans l'écran.
    expect(borner({ x: 100, y: 780 }, taille, { largeur: 844, hauteur: 390 })).toEqual({ x: 100, y: 338 });
  });
  it("une barre plus large que la zone se cale au bord gauche plutôt que de disparaître", () => {
    expect(borner({ x: 300, y: 10 }, { largeur: 500, hauteur: 48 }, { largeur: 390, hauteur: 800 })).toEqual({ x: 4, y: 10 });
  });
  it("position par défaut : en bas à droite, au-dessus de la réserve", () => {
    expect(positionParDefaut(taille, { largeur: 1000, hauteur: 600 }, 30)).toEqual({ x: 784, y: 506 });
    expect(positionParDefaut(taille, { largeur: 390, hauteur: 844 }, 90)).toEqual({ x: 174, y: 690 });
  });
  it("préférence relue : deux nombres finis, sinon la position par défaut (null)", () => {
    expect(lirePosition({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(lirePosition({ x: "10", y: 20 })).toBeNull();
    expect(lirePosition({ x: Number.NaN, y: 20 })).toBeNull();
    expect(lirePosition(null)).toBeNull();
    expect(lirePosition("abc")).toBeNull();
  });
  it("flèches : 16 px, 64 px avec Maj, rien pour une autre touche", () => {
    expect(pasClavier("ArrowLeft", false)).toEqual({ x: -16, y: 0 });
    expect(pasClavier("ArrowDown", true)).toEqual({ x: 0, y: 64 });
    expect(pasClavier("Enter", false)).toBeNull();
  });
});
