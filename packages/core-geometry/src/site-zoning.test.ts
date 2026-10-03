import { describe, expect, it } from "vitest";
import { cutArea, siteZoning, sumArea, triangulate, vertexCentroid } from "./site-zoning.js";
import { polygonArea } from "./parcel-geometry.js";
import type { Point2 } from "./geometry.js";

// Bornes S01 de P.118 (EPSG:26191, mètres) — données du fichier source, pas inventées.
const S01: Point2[] = [
  [321946.82, 347183.88],
  [321954.11, 347215.38],
  [321995.84, 347186.25],
  [321978.68, 347161.67],
];
const o = vertexCentroid(S01);
const local: Point2[] = S01.map((p) => [p[0] - o[0], p[1] - o[1]]);

describe("site-zoning (h7-app zoning)", () => {
  it("triangulates a quadrilateral into two triangles covering the same area", () => {
    const tris = triangulate(local);
    expect(tris).toHaveLength(2);
    expect(sumArea(tris)).toBeCloseTo(polygonArea(local), 6);
  });

  it("refuses a degenerate contour (collinear points) instead of inventing a shape", () => {
    expect(() => triangulate([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]])).toThrow(/dégénéré ou auto-intersecté/);
  });

  it("cuts a set of polygons so the lower part has the wanted area", () => {
    const square: Point2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const [low, high] = cutArea([square], [0, 1], 30);
    expect(sumArea(low)).toBeCloseTo(30, 6);
    expect(sumArea(high)).toBeCloseTo(70, 6);
  });

  it("splits the P.118 contour into the four zones of variant A at 15 / 50 / 25 / 10 %", () => {
    const area = polygonArea(local);
    const z = siteZoning({ local, area, units: "m", crs: "EPSG:26191", frontage: null }, "A");
    expect(z).not.toBeNull();
    expect(z!.edgeAssumed).toBe(true);
    expect(z!.edge).toBe(0);
    expect(z!.zones.map((q) => q.id)).toEqual(["arrival", "study", "garden", "service"]);
    const ratios = z!.zones.map((q) => q.area / area);
    expect(ratios[0]).toBeCloseTo(0.15, 3);
    expect(ratios[1]).toBeCloseTo(0.5, 3);
    expect(ratios[2]).toBeCloseTo(0.25, 3);
    expect(ratios[3]).toBeCloseTo(0.1, 3);
    expect(sumArea(z!.zones.flatMap((q) => q.polys))).toBeCloseTo(area, 3);
  });

  it("uses the chosen frontage edge and the variant rates (C: 12 / 43 / 20 / 25 %)", () => {
    const area = polygonArea(local);
    const z = siteZoning({ local, area, units: "m", crs: "EPSG:26191", frontage: 2 }, "C");
    expect(z!.edge).toBe(2);
    expect(z!.edgeAssumed).toBe(false);
    expect(z!.zones[3]!.area / area).toBeCloseTo(0.25, 3);
    expect(z!.zones[1]!.area / area).toBeCloseTo(0.43, 3);
  });

  it("returns null without a usable contour (too few points, degrees, non-metric units)", () => {
    expect(siteZoning({ local: local.slice(0, 2), area: 1, units: "m", crs: "EPSG:26191", frontage: null })).toBeNull();
    expect(siteZoning({ local, area: polygonArea(local), units: "m", crs: "EPSG:4326", frontage: null })).toBeNull();
    expect(siteZoning({ local, area: polygonArea(local), units: "ft", crs: "EPSG:26191", frontage: null })).toBeNull();
  });
});
