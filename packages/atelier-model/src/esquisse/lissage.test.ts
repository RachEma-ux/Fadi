import { describe, expect, it } from "vitest";
import { simplifierTrace, tolerancesAdaptatives } from "../geometrie.js";
import { pt } from "../unites.js";

describe("lissage adaptatif de la main levée (D-107, DA-01-06)", () => {
  // Tracé en dents de 3 cm d'amplitude : première moitié dessinée lentement, seconde moitié quatre fois plus vite.
  const points = Array.from({ length: 41 }, (_, i) => pt(i * 0.1, i % 2 ? 0.03 : 0));
  const instants = points.map((_, i) => (i <= 20 ? i * 40 : 800 + (i - 20) * 10));

  it("tolérance par point : bornée de 0,5 à 3 fois la tolérance, plus grande là où le geste est rapide", () => {
    const t = tolerancesAdaptatives(points, instants, 0.02);
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0.01 - 1e-12);
    expect(Math.max(...t)).toBeLessThanOrEqual(0.06 + 1e-12);
    expect(t[10]!).toBeLessThan(t[30]!);
    expect(tolerancesAdaptatives(points, instants.slice(1), 0.02).every((x) => x === 0.02)).toBe(true);
  });

  it("simplification : la partie lente garde ses dents, la partie rapide est lissée", () => {
    const fixe = simplifierTrace(points, 0.02);
    const adapte = simplifierTrace(points, tolerancesAdaptatives(points, instants, 0.02));
    const dentsLentes = (l: { x: number }[]) => l.filter((q) => q.x < 2).length;
    const dentsRapides = (l: { x: number }[]) => l.filter((q) => q.x > 2.05).length;
    expect(dentsLentes(adapte)).toBe(dentsLentes(fixe));
    expect(dentsRapides(adapte)).toBeLessThan(dentsRapides(fixe));
  });
});
