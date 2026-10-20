/** Position de la barre d'actions : réserve à gauche (barre d'outils verticale), largeur maximale qui en découle. */
import { describe, expect, it } from "vitest";
import { MARGE, largeurMaximale, positionParDefaut, retirerGauche } from "./barre-actions-position";

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
