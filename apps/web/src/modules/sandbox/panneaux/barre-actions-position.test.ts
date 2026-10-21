/** Position de la barre d'actions : réserve à gauche (barre d'outils verticale), largeur maximale qui en découle. */
import { describe, expect, it } from "vitest";
import { MARGE, largeurMaximale, positionParDefaut, positionParDefautHaut, retirerGauche } from "./barre-actions-position";

describe("barre d'actions — réserve à gauche", () => {
  const zone = { gauche: 75, haut: 260, largeur: 300, hauteur: 682 };

  it("le bord gauche de la zone passe au bord droit de la barre d'outils ; sans réserve, la zone est inchangée", () => {
    expect(retirerGauche(zone, [137])).toEqual({ gauche: 137, haut: 260, largeur: 238, hauteur: 682 });
    expect(retirerGauche(zone, [])).toBe(zone);
    expect(retirerGauche(zone, [60])).toBe(zone);
    expect(retirerGauche(zone, [120, 137]).gauche).toBe(137);
  });

  it("la barre placée par défaut dans la zone réduite commence à droite de la barre d'outils", () => {
    const reduite = retirerGauche(zone, [137]);
    const largeur = largeurMaximale(reduite);
    expect(largeur).toBe(238 - 16 - MARGE);
    const p = positionParDefaut({ largeur, hauteur: 144 }, reduite, 0);
    expect(p.x).toBeGreaterThanOrEqual(137);
    expect(p.x + largeur).toBeLessThanOrEqual(75 + 300);
  });
});

describe("barre d'actions — position par défaut en haut au centre", () => {
  const zone = { gauche: 96, haut: 302, largeur: 806, hauteur: 1550 };
  it("centrée en haut de la zone de dessin quand rien ne la gêne", () => {
    const p = positionParDefautHaut({ largeur: 496, hauteur: 44 }, zone);
    expect(p).toEqual({ x: 96 + (806 - 496) / 2, y: 302 + 8 });
  });
  it("se centre dans la zone réduite quand le centre recouvrirait une réserve", () => {
    const reduite = { ...zone, gauche: 400, largeur: 400 };
    const p = positionParDefautHaut({ largeur: 300, hauteur: 44 }, zone, reduite);
    expect(p.x).toBeGreaterThanOrEqual(400);
    expect(p.x + 300).toBeLessThanOrEqual(800);
  });
  it("reste dans la zone même si elle est plus étroite que la barre", () => {
    const p = positionParDefautHaut({ largeur: 900, hauteur: 44 }, { gauche: 0, haut: 0, largeur: 800, hauteur: 600 });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });
});
