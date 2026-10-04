import { describe, expect, it } from "vitest";
import { cercleTroisPoints, polygoneRegulier } from "./geometrie.js";
import { pt } from "./unites.js";

describe("constructions d'esquisse (D-042)", () => {
  it("polygone régulier : n sommets à égale distance du centre, premier sommet donné ; bornes", () => {
    const p = polygoneRegulier(pt(1, 1), pt(3, 1), 6);
    expect(p).toHaveLength(6);
    expect(p[0]).toMatchObject({ x: 3, y: 1 });
    for (const q of p) expect(Math.hypot(q.x - 1, q.y - 1)).toBeCloseTo(2, 9);
    expect(Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y)).toBeCloseTo(2, 9); // hexagone : côté = rayon
    expect(() => polygoneRegulier(pt(0, 0), pt(1, 0), 2)).toThrow(/3 à 64/);
    expect(() => polygoneRegulier(pt(0, 0), pt(0, 0), 5)).toThrow(/rayon nul/);
  });
  it("cercle par trois points ; alignés → null", () => {
    const c = cercleTroisPoints(pt(0, 0), pt(4, 0), pt(2, 2))!;
    expect(c.centre).toMatchObject({ x: 2, y: 0 });
    expect(c.rayon).toBeCloseTo(2, 9);
    expect(cercleTroisPoints(pt(0, 0), pt(1, 1), pt(2, 2))).toBeNull();
  });
});
