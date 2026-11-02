/** Chantier Axes (AX-3) : triade d'orientation — géométrie pure, préférences relues, placement dans un coin. */
import { describe, expect, it } from "vitest";
import { REPERE_DU_MODELE } from "@parcours/sandbox-planche-model";
import { MARGE_TRIADE, TAILLE_TRIADE, TRIADE_DEFAUT, lireTriade, placerTriade, segmentsTriade } from "./triade";

describe("triade d'orientation", () => {
  it("vue de dessus (identité) : X à droite, Y en haut de l'écran, Z vers l'observateur, tracé en dernier", () => {
    const s = segmentsTriade(REPERE_DU_MODELE, (d) => d, 20);
    expect(s.map((x) => x.axe)).toEqual(["x", "y", "z"].sort((a, b) => (a === "z" ? 1 : b === "z" ? -1 : 0)));
    const x = s.find((e) => e.axe === "x")!;
    const y = s.find((e) => e.axe === "y")!;
    expect(x.fin).toEqual({ x: 20, y: -0 });
    expect(y.fin).toEqual({ x: 0, y: -20 });
    // Demi-axe négatif opposé et plus court (pointillé), étiquette au-delà de l'extrémité.
    expect(x.negatif.x).toBeCloseTo(-9);
    expect(x.etiquette.x).toBeGreaterThan(x.fin.x);
    expect(s[s.length - 1]!.axe).toBe("z");
  });

  it("préférences : défaut visible en haut à droite, exclue de l'export ; valeurs inconnues ignorées", () => {
    expect(TRIADE_DEFAUT).toEqual({ visible: true, coin: "haut-droite", represente: "travail", export: false });
    expect(lireTriade(null)).toEqual(TRIADE_DEFAUT);
    expect(lireTriade({ visible: false, coin: "milieu", represente: "modele", export: true })).toEqual({ visible: false, coin: "haut-droite", represente: "modele", export: true });
  });

  it("placement : dans le coin choisi, hors des réserves (menu, rail, colonne, pied)", () => {
    const r = { haut: 56, bas: 100, gauche: 72, droite: 72 };
    expect(placerTriade("haut-gauche", 1000, 800, r)).toEqual({ x: 72 + MARGE_TRIADE, y: 56 + MARGE_TRIADE });
    expect(placerTriade("bas-droite", 1000, 800, r)).toEqual({ x: 1000 - 72 - MARGE_TRIADE - TAILLE_TRIADE, y: 800 - 100 - MARGE_TRIADE - TAILLE_TRIADE });
    expect(placerTriade("bas-droite", 100, 100, r)).toEqual({ x: 0, y: 0 });
  });
});
