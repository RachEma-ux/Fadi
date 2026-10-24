import { describe, expect, it } from "vitest";
import { COTE_MAX, dimensionsCibles, OCTETS_MAX, QUALITES } from "./com-photos";

describe("photos COM : compression sur l'appareil (COM-D15)", () => {
  it("2 560 px au plus par côté, proportions gardées", () => {
    expect(dimensionsCibles(4032, 3024)).toEqual({ width: 2560, height: 1920 });
    expect(dimensionsCibles(3024, 4032)).toEqual({ width: 1920, height: 2560 });
    expect(dimensionsCibles(800, 600)).toEqual({ width: 800, height: 600 });
    expect(dimensionsCibles(10000, 10)).toEqual({ width: 2560, height: 3 });
    expect(() => dimensionsCibles(0, 10)).toThrow();
  });
  it("bornes et qualités décroissantes", () => {
    expect(COTE_MAX).toBe(2560);
    expect(OCTETS_MAX).toBe(2 * 1024 * 1024);
    expect([...QUALITES].every((q, i, a) => i === 0 || q < a[i - 1]!)).toBe(true);
  });
});
