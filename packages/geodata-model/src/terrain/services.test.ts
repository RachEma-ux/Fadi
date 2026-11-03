/** Terrain TER-04 — services numériques purs, fixtures synthétiques « test seulement ». */
import { describe, expect, it } from "vitest";
import { couleurContinue, dansPolygone, dxfCourbes, geojsonCourbes, lonLatTuile, PALETTE_ALTITUDE, pasPixelTuile, pointsLigne, statistiquesZone, type MetadonneesCourbes } from "./services.js";

describe("points le long d'une ligne", () => {
  it("un point tous les pas mètres et à chaque sommet, chaînage cumulé", () => {
    const p = pointsLigne([[0, 0], [10, 0], [10, 5]], 4);
    expect(p.map((x) => x.chainage)).toEqual([0, 4, 8, 10, 14, 15]);
    expect(p[3]).toEqual({ chainage: 10, x: 10, y: 0 });
    expect(() => pointsLigne([[0, 0], [1e6, 0]], 1)).toThrow(/traitement de fond/);
    expect(() => pointsLigne([[0, 0]], 1)).toThrow();
  });
});

describe("statistiques dans le polygone réel (AOI trouée)", () => {
  const carre = (x0: number, y0: number, d: number): [number, number][] => [[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]];
  it("le trou est exclu, le rectangle englobant n'est jamais utilisé", () => {
    expect(dansPolygone(5, 5, [carre(0, 0, 10), carre(4, 4, 2)])).toBe(false);
    expect(dansPolygone(1, 1, [carre(0, 0, 10), carre(4, 4, 2)])).toBe(true);
    const L = 10, H = 10, valeurs = new Float32Array(L * H);
    for (let l = 0; l < H; l++) for (let c = 0; c < L; c++) valeurs[l * L + c] = c;
    const s = statistiquesZone({ largeur: L, hauteur: H, valeurs, nodata: null }, [carre(0, 0, 10), carre(4, 4, 2)]);
    expect(s.cellulesZone).toBe(96);
    expect(s.cellulesValides).toBe(96);
    expect(s.min).toBe(0);
    expect(s.max).toBe(9);
    const triangle = statistiquesZone({ largeur: L, hauteur: H, valeurs, nodata: null }, [[[0, 0], [10, 0], [0, 10], [0, 0]]]);
    expect(triangle.cellulesZone).toBe(45);
  });
  it("NoData exclu et distinct de zéro ; aucune valeur → non évaluée", () => {
    const valeurs = [0, -9999, 0, -9999];
    const s = statistiquesZone({ largeur: 2, hauteur: 2, valeurs, nodata: -9999 }, [carre(0, 0, 2)]);
    expect(s).toMatchObject({ cellulesZone: 4, cellulesValides: 2, min: 0, max: 0, moyenne: 0 });
    expect(statistiquesZone({ largeur: 2, hauteur: 2, valeurs: [-9999, -9999, -9999, -9999], nodata: -9999 }, [carre(0, 0, 2)])).toMatchObject({ cellulesValides: 0, moyenne: null });
  });
});

describe("couleurs et tuiles", () => {
  it("aucune teinte bleue dans la palette d'altitude ; sans valeur transparent", () => {
    for (const h of PALETTE_ALTITUDE) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
      expect(b > r && b > g).toBe(false);
    }
    expect(couleurContinue(null, 0, 1, PALETTE_ALTITUDE)[3]).toBe(0);
    expect(couleurContinue(0, 0, 100, PALETTE_ALTITUDE)).toEqual([0x1b, 0x5e, 0x20, 255]);
    expect(couleurContinue(1000, 0, 100, PALETTE_ALTITUDE)).toEqual([0xf5, 0xf1, 0xea, 255]);
  });
  it("coins de tuile Web Mercator et taille du pixel", () => {
    expect(lonLatTuile(0, 0, 0, 0, 0)).toEqual([-180, expect.closeTo(85.0511, 3)]);
    expect(lonLatTuile(1, 1, 1, 0, 0)).toEqual([0, 0]);
    expect(pasPixelTuile(0, 0)).toBeCloseTo(156543.03, 1);
  });
});

describe("exports des courbes (TER-D18)", () => {
  const m: MetadonneesCourbes = { source: "test-plan", version: "v1", produit: "MNT", equidistance: 10, crs: "EPSG:2056", referenceVerticale: "Référence fictive de test (EPSG:5728)", licence: "Aucune (fixture)", attribution: "Fixture de test", etiquette: "Données synthétiques — test seulement", qualite: "non évaluée" };
  const courbes = [{ altitude: 510, maitresse: false, lignes: [[[1, 2], [3, 4]] as [number, number][]] }, { altitude: 550, maitresse: true, lignes: [[[5, 6], [7, 8], [9, 10]] as [number, number][]] }];
  it("GeoJSON : métadonnées complètes, altitude et référence par objet", () => {
    const g = JSON.parse(geojsonCourbes(courbes, m));
    expect(g.fadi).toMatchObject({ crs: "EPSG:2056", referenceVerticale: m.referenceVerticale, licence: m.licence, attribution: m.attribution, equidistance: 10, unite: "m" });
    expect(g.features[1].properties).toMatchObject({ altitude: 550, maitresse: true, referenceVerticale: m.referenceVerticale });
  });
  it("DXF R12 : commentaires de métadonnées, polylignes 3D à l'altitude, calques distincts", () => {
    const d = dxfCourbes(courbes, m).split("\r\n");
    const commentaires = d.filter((_, i) => d[i - 1] === "999");
    expect(commentaires).toEqual(expect.arrayContaining(["Repere horizontal : EPSG:2056", `Reference verticale : ${m.referenceVerticale}`, "Equidistance : 10 m", "Licence : Aucune (fixture)"]));
    expect(d.filter((x) => x === "POLYLINE")).toHaveLength(2);
    expect(d.filter((x) => x === "VERTEX")).toHaveLength(5);
    expect(d).toContain("COURBES_MAITRESSES");
    expect(d[d.length - 2]).toBe("EOF");
    const i = d.indexOf("VERTEX");
    expect(d.slice(i, i + 10)).toEqual(["VERTEX", "8", "COURBES_INTERMEDIAIRES", "10", "1", "20", "2", "30", "510", "70"]);
  });
});
