import { describe, expect, it } from "vitest";
import type { Point2 } from "@parcours/core-geometry";
import {
  DEFAULT_SITE_OBSERVATIONS,
  SITE_SVG_EMPTY,
  recommendedSiteOption,
  siteContext,
  siteGeographic,
  siteLegend,
  siteOptions,
  siteSvg,
  validateSiteObservations,
  type SiteParcel,
} from "./site";
import { HarmonieError, type HarmonieProfile } from "./harmonie";

// Bornes S01 de P.118 (EPSG:26191) — données du fichier source.
const P118: SiteParcel = {
  vertices: [
    [321946.82, 347183.88],
    [321954.11, 347215.38],
    [321995.84, 347186.25],
    [321978.68, 347161.67],
  ],
  vertexIds: ["B.266", "B.267", "B.268", "B.265"],
  crs: "EPSG:26191",
  units: "m",
  officialArea: 1346,
  parcelNumber: "118",
  commune: "El Mansouria",
  sourceFile: "118_officiel.kmz",
};
const PROFILE: HarmonieProfile = { key: "mixte", sourceType: "mixte", label: "Formation & bureaux", site: "SITE-MIXTE.", usage: "USAGE", decor: "DECOR" };

describe("site (étape 01 Harmonie)", () => {
  it("computes the three site options on the real contour, with their zoning, and names the assumed approach edge", () => {
    const c = siteContext(P118, DEFAULT_SITE_OBSERVATIONS, PROFILE);
    expect(c.area).toBeCloseTo(1345.5476, 3);
    expect(c.frontage).toBeNull();
    const opts = siteOptions(c);
    expect(opts.map((o) => o.key)).toEqual(["A", "B", "C"]);
    expect(opts[0]!.title).toBe("Accueil ouvert, jardin en retrait");
    expect(opts[0]!.why).toContain("SITE-MIXTE.");
    expect(opts[0]!.why).toContain("le premier côté sert uniquement de repère graphique");
    expect(opts[0]!.zoning?.edgeAssumed).toBe(true);
    expect(opts[1]!.zoning!.zones[2]!.area / c.area).toBeCloseTo(0.35, 3);
    expect(opts[2]!.zoning!.zones[3]!.area / c.area).toBeCloseTo(0.25, 3);
  });

  it("describes a chosen, documented approach edge by its bornes", () => {
    const c = siteContext(P118, { ...DEFAULT_SITE_OBSERVATIONS, frontageEdge: 3, approachStatus: "documented", source: "Relevé photo du 12/03", backContext: "built" }, PROFILE);
    const why = siteOptions(c)[0]!.why;
    expect(why).toContain("Approche étudiée depuis B.265 → B.266, déclarée documentée.");
    expect(why).toContain("Contexte arrière déclaré : masse bâtie");
    expect(siteOptions(c)[0]!.zoning?.edge).toBe(3);
  });

  it("has no zoning without a usable contour, and never a replacement shape", () => {
    const c = siteContext(null, DEFAULT_SITE_OBSERVATIONS, PROFILE);
    expect(siteOptions(c).every((o) => o.zoning === null)).toBe(true);
    expect(SITE_SVG_EMPTY).toMatch(/Aucune parcelle rectangulaire de remplacement/);
  });

  it("recommends A by default, B for retreat / exposed front, C for movement separation", () => {
    expect(recommendedSiteOption(DEFAULT_SITE_OBSERVATIONS).key).toBe("A");
    expect(recommendedSiteOption({ ...DEFAULT_SITE_OBSERVATIONS, priority: "retreat" }).key).toBe("B");
    expect(recommendedSiteOption({ ...DEFAULT_SITE_OBSERVATIONS, frontContext: "exposed" })).toEqual({ key: "B", reason: expect.stringMatching(/façade exposée/) });
    expect(recommendedSiteOption({ ...DEFAULT_SITE_OBSERVATIONS, priority: "service" }).key).toBe("C");
  });

  it("refuses a documented approach without its edge and source (prototype rule)", () => {
    expect(() => validateSiteObservations({ ...DEFAULT_SITE_OBSERVATIONS, approachStatus: "documented" }, 4)).toThrow(HarmonieError);
    expect(() => validateSiteObservations({ ...DEFAULT_SITE_OBSERVATIONS, approachStatus: "documented", frontageEdge: 1, source: "court" }, 4)).toThrow(/choisissez son côté et indiquez sa source/);
    expect(() => validateSiteObservations({ ...DEFAULT_SITE_OBSERVATIONS, frontageEdge: 9 }, 4)).toThrow(/Côté d’approche inconnu/);
    expect(validateSiteObservations({ ...DEFAULT_SITE_OBSERVATIONS, approachStatus: "documented", frontageEdge: 1, source: "Photo datée 2026-03-12" }, 4).frontageEdge).toBe(1);
  });

  it("geolocates through the explicit converter, else through the manual mark, else says it is to document", () => {
    const convert = (crs: string, p: Point2): Point2 | null => (crs === "EPSG:26191" ? [-7.3 + (p[0] - 321970) * 1e-5, 33.7 + (p[1] - 347190) * 1e-5] : null);
    const geo = siteGeographic(P118, DEFAULT_SITE_OBSERVATIONS, convert);
    expect(geo.center?.frame).toBe("geographic");
    expect(geo.center?.lon).toBeCloseTo(-7.3 + (321968.8625 - 321970) * 1e-5, 8);
    expect(geo.source).toBe("Conversion EPSG:26191 → WGS84 ; système source à confirmer");
    const manual = siteGeographic({ ...P118, crs: "EPSG:9999" }, { ...DEFAULT_SITE_OBSERVATIONS, geographic: { longitude: -7.31, latitude: 33.7, source: "" } }, convert);
    expect(manual.center).toEqual({ frame: "geographic", lon: -7.31, lat: 33.7 });
    expect(manual.source).toBe("Repérage saisi, sans calage du contour");
    expect(siteGeographic({ ...P118, crs: "EPSG:9999" }, DEFAULT_SITE_OBSERVATIONS, convert).center).toBeNull();
  });

  it("draws the site sketch with the variant, the computed area, the bornes and the approach edge", () => {
    const c = siteContext(P118, DEFAULT_SITE_OBSERVATIONS, PROFILE);
    const z = siteOptions(c)[0]!.zoning!;
    const svg = siteSvg({ local: c.local, area: c.area, vertexIds: c.parcel.vertexIds, crs: c.parcel.crs, approachStatus: "hypothesis" }, z);
    expect(svg.replace(/[\u202f\u00a0]/g, " ")).toContain("SITE · VARIANTE A · 1 345,55 m² calculés");
    expect(svg).toContain(">B.266<");
    expect(svg).toContain('stroke-dasharray="8 5"');
    expect(svg).toContain("non choisi · repère graphique seulement");
    const legend = siteLegend(z);
    expect(legend.map((r) => Math.round(r.share))).toEqual([15, 50, 25, 10]);
  });
});
