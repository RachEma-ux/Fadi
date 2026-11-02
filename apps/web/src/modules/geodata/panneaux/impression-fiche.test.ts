import { describe, expect, it } from "vitest";
import { refusImpressionFiche } from "./FicheTerritoriale";

const fiche = (exp: string) => ({ couche: { version: { droits: { export: exp } } } });

describe("impression d'une fiche (D-GD-54)", () => {
  it("refusée quand la source refuse l'export (source provisoire FeenWay) ; permise sinon", () => {
    expect(refusImpressionFiche(fiche("refuse"))).toMatch(/Impression refusée/);
    expect(refusImpressionFiche(fiche("autorise"))).toBeNull();
    expect(refusImpressionFiche(fiche("inconnu"))).toBeNull();
  });
});
