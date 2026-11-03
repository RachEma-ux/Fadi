import { describe, expect, it } from "vitest";
import { centile, statistiquesVerrou } from "./atelier-mesures-stats.js";

describe("mesure du verrou de projet de l'Atelier (BD-9)", () => {
  it("centile au rang le plus proche ; aucune valeur → null (jamais zéro)", () => {
    expect(centile([], 95)).toBeNull();
    expect(centile([30, 10, 20], 50)).toBe(20);
    expect(centile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
    expect(centile([5], 95)).toBe(5);
  });

  it("par nature : médiane, 95ᵉ centile, maximum, attente et part au-delà du seuil", () => {
    const lignes = [
      ...Array.from({ length: 19 }, () => ({ nature: "commande", attente_ms: 0, tenue_ms: 40 })),
      { nature: "commande", attente_ms: 120, tenue_ms: 900 },
      { nature: "import-ifc", attente_ms: 0, tenue_ms: 4000 },
    ];
    const [c, i] = statistiquesVerrou(lignes, 250);
    expect(c).toEqual({ nature: "commande", n: 20, tenueMedianeMs: 40, tenueP95Ms: 40, tenueMaxMs: 900, attenteP95Ms: 0, partAuDelaDuSeuil: 0.05 });
    expect(i).toMatchObject({ nature: "import-ifc", n: 1, partAuDelaDuSeuil: 1 });
  });
});
