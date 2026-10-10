import { describe, expect, it } from "vitest";
import { BARRES_OUTILS_DEFAUT, ECART_BARRES, barresRendues, basculerBarre, estTelephone, lireBarresOutils, placerBarre, positionDefautBarre, positionDocquee, reinitialiserDisposition } from "./barres-outils-disposition";

const taille = { largeur: 420, hauteur: 44 };

describe("Barres d'opérations flottantes (D-198) — disposition", () => {
  it("affichage : une barre affichée passe en dernier ; masquer la retire ; réinitialiser garde l'affichage", () => {
    let e = basculerBarre(BARRES_OUTILS_DEFAUT, "ligne", true);
    e = basculerBarre(e, "rectangle", true);
    e = basculerBarre(e, "ligne", true);
    expect(e.visibles).toEqual(["rectangle", "ligne"]);
    e = placerBarre(e, "ligne", { x: 10, y: 20 });
    expect(placerBarre(e, "ligne", { x: 10, y: 20 })).toBe(e);
    expect(reinitialiserDisposition(e)).toEqual({ visibles: ["rectangle", "ligne"], positions: {} });
    expect(basculerBarre(e, "ligne", false).visibles).toEqual(["rectangle"]);
  });

  it("téléphone (≤ 760 px) : une seule barre, la dernière affichée ; bureau : toutes", () => {
    expect(estTelephone(390)).toBe(true);
    expect(estTelephone(760)).toBe(true);
    expect(estTelephone(761)).toBe(false);
    const e = { visibles: ["ligne", "rectangle", "metre"], positions: {} };
    expect(barresRendues(e, false)).toEqual(["ligne", "rectangle", "metre"]);
    expect(barresRendues(e, true)).toEqual(["metre"]);
    expect(barresRendues(BARRES_OUTILS_DEFAUT, true)).toEqual([]);
  });

  it("position par défaut au bureau : empilées sous la barre du haut, à droite du rail, toujours dans la zone", () => {
    const zone = { largeur: 1536, hauteur: 800, gauche: 0, haut: 64 };
    const reserves = { haut: 60, gauche: 70 };
    expect(positionDefautBarre(0, taille, zone, reserves)).toEqual({ x: 70, y: 124 });
    expect(positionDefautBarre(1, taille, zone, reserves)).toEqual({ x: 70, y: 124 + 44 + ECART_BARRES });
    // Cent barres empilées : la dernière reste entière dans la zone.
    const loin = positionDefautBarre(100, taille, zone, reserves);
    expect(loin.y + taille.hauteur).toBeLessThanOrEqual(64 + 800 - 4);
  });

  it("téléphone : rangée en bas au-dessus du volet, entière dans l'écran, rotation comprise", () => {
    const portrait = { largeur: 390, hauteur: 780, gauche: 0, haut: 64 };
    const t = { largeur: 382, hauteur: 50 };
    expect(positionDocquee(t, portrait, 200)).toEqual({ x: 4, y: 64 + 780 - 200 - 50 - 4 });
    // Volet plus haut que la zone : la barre reste visible, calée en haut.
    expect(positionDocquee(t, portrait, 2000)).toEqual({ x: 4, y: 68 });
    // Paysage 844 × 390 : toujours dans la zone.
    const p = positionDocquee({ largeur: 836, hauteur: 50 }, { largeur: 844, hauteur: 390 }, 120);
    expect(p.y + 50).toBeLessThanOrEqual(390 - 4);
    expect(p.x).toBe(4);
  });

  it("relecture défensive des préférences", () => {
    expect(lireBarresOutils(null)).toEqual({ visibles: [], positions: {} });
    expect(lireBarresOutils("x")).toEqual({ visibles: [], positions: {} });
    const lu = lireBarresOutils({ visibles: ["ligne", 3, "ligne", "inconnu"], positions: { ligne: { x: 1, y: 2 }, rectangle: { x: "a", y: 2 }, inconnu: { x: 1, y: 1 } } }, (id) => id !== "inconnu");
    expect(lu).toEqual({ visibles: ["ligne"], positions: { ligne: { x: 1, y: 2 } } });
  });
});
