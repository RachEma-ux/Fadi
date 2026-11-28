import { describe, expect, it } from "vitest";
import { projeterWgs84, systemesConnus } from "./sandbox-projections.js";

// .prj de recette (forme ESRI) du système suisse CH1903+ / LV95 ; donnée de test, jamais livrée.
const PRJ_LV95 = 'PROJCS["CH1903+_LV95",GEOGCS["GCS_CH1903+",DATUM["D_CH1903+",SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Hotine_Oblique_Mercator_Azimuth_Center"],PARAMETER["False_Easting",2600000.0],PARAMETER["False_Northing",1200000.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Azimuth",90.0],PARAMETER["Longitude_Of_Center",7.439583333333333],PARAMETER["Latitude_Of_Center",46.95240555555556],UNIT["Meter",1.0]]';

describe("projection WGS84 → système du projet (étape 7b)", () => {
  it("système connu de Fadi (Lambert 93) sans .prj", () => {
    const r = projeterWgs84("EPSG:2154", undefined, [[3, 46.5]]);
    expect(r.ok && r.source).toBe("fadi");
    if (r.ok) {
      expect(r.points[0]?.[0]).toBeCloseTo(700000, 0);
      expect(r.points[0]?.[1]).toBeCloseTo(6600000, 0);
    }
  });
  it("système défini par un .prj fourni (LV95) ; Zurich près de E 2 683 000 / N 1 248 000", () => {
    const r = projeterWgs84("EPSG:2056", PRJ_LV95, [[8.5417, 47.3769]]);
    expect(r.ok && r.source).toBe("prj");
    if (r.ok) {
      expect(Math.abs((r.points[0]?.[0] ?? 0) - 2683000)).toBeLessThan(1000);
      expect(Math.abs((r.points[0]?.[1] ?? 0) - 1248000)).toBeLessThan(1000);
    }
  });
  it("système inconnu sans .prj, demande mal formée : refus", () => {
    expect(projeterWgs84("EPSG:2056", undefined, [[8, 47]])).toEqual({ ok: false, erreur: "systeme_inconnu" });
    expect(projeterWgs84("EPSG:2154", undefined, [])).toEqual({ ok: false, erreur: "demande" });
    expect(projeterWgs84("EPSG:2154", undefined, [[200, 0]])).toEqual({ ok: false, erreur: "demande" });
    expect(projeterWgs84("x", "PROJCS[rien", [[8, 47]])).toEqual({ ok: false, erreur: "systeme_inconnu" });
  });
  it("liste fermée des systèmes (cas 2, lot 5, n° 92) : les systèmes dont Fadi a la définition, aucun vertical", () => {
    const s = systemesConnus();
    expect(s.horizontaux).toEqual(expect.arrayContaining([{ code: "EPSG:2154", nom: "RGF93 / Lambert-93" }, { code: "EPSG:26191", nom: "Merchich / Nord Maroc" }]));
    expect(s.horizontaux.every((x) => projeterWgs84(x.code, undefined, [[0, 0]]).ok !== undefined)).toBe(true);
    expect(s.verticaux).toEqual([]);
  });
});
