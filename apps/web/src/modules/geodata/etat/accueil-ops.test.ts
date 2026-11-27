import { describe, expect, it } from "vitest";
import { carteVide, consigneVisible, niveauAccueil } from "./accueil-ops";

const vide = { ongletCartes: true, carteOuverte: false, couchesVisibles: 0 };

describe("carte d'arrivée (P1)", () => {
  it("carte vide : onglet Cartes, aucune carte ouverte, aucune couche visible", () => {
    expect(carteVide(vide)).toBe(true);
    expect(carteVide({ ...vide, ongletCartes: false })).toBe(false);
    expect(carteVide({ ...vide, carteOuverte: true })).toBe(false);
    // Thème activé d'office, couche importée ou vue rouverte avec ses couches : l'accueil s'arrête.
    expect(carteVide({ ...vide, couchesVisibles: 1 })).toBe(false);
  });

  it("consigne : seulement avec WebGL et tant qu'elle n'est pas écartée", () => {
    expect(consigneVisible({ ...vide, webgl: true, ecartee: false })).toBe(true);
    expect(consigneVisible({ ...vide, webgl: false, ecartee: false })).toBe(false);
    expect(consigneVisible({ ...vide, webgl: true, ecartee: true })).toBe(false);
    expect(consigneVisible({ ...vide, couchesVisibles: 2, webgl: true, ecartee: false })).toBe(false);
  });

  it("niveau d'accueil : le plus global qui a une couche publiée, sinon rien (jamais un code écrit)", () => {
    const n = (code: string, rang: number, coucheId: string | null) => ({ code, rang, pluriel: code, coucheId });
    expect(niveauAccueil([n("provinces", 2, "c2"), n("regions", 1, "c1")])?.coucheId).toBe("c1");
    expect(niveauAccueil([n("regions", 1, null), n("provinces", 2, "c2")])?.code).toBe("provinces");
    expect(niveauAccueil([n("regions", 1, null)])).toBeNull();
    expect(niveauAccueil([])).toBeNull();
    expect(niveauAccueil(null)).toBeNull();
  });
});
