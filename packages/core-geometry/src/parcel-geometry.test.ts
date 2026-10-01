import { describe, expect, it } from "vitest";
import {
  buildingFootprint,
  inwardOffset,
  intersectLines,
  isConvexPolygon,
  parcelCenter,
  polygonArea,
  projectCode,
  signedArea,
} from "./parcel-geometry";
import type { Point2 } from "./geometry";

const SQUARE: Point2[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe("signedArea / polygonArea", () => {
  it("un carré 10x10 anti-horaire a une aire signée positive de 100", () => {
    expect(signedArea(SQUARE)).toBeCloseTo(100);
    expect(polygonArea(SQUARE)).toBeCloseTo(100);
  });

  it("l'ordre inverse (horaire) donne une aire signée négative, mais la même aire absolue", () => {
    const clockwise = [...SQUARE].reverse();
    expect(signedArea(clockwise)).toBeCloseTo(-100);
    expect(polygonArea(clockwise)).toBeCloseTo(100);
  });
});

describe("isConvexPolygon", () => {
  it("un carré est convexe", () => {
    expect(isConvexPolygon(SQUARE)).toBe(true);
  });

  it("un polygone en L n'est pas convexe", () => {
    const L: Point2[] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ];
    expect(isConvexPolygon(L)).toBe(false);
  });

  it("moins de 3 points n'est jamais convexe", () => {
    expect(isConvexPolygon([[0, 0], [1, 1]])).toBe(false);
  });
});

describe("intersectLines", () => {
  it("trouve l'intersection de deux droites sécantes", () => {
    const p = intersectLines([0, 0], [10, 10], [0, 10], [10, 0]);
    expect(p).not.toBeNull();
    expect(p![0]).toBeCloseTo(5);
    expect(p![1]).toBeCloseTo(5);
  });

  it("retourne null pour deux droites parallèles", () => {
    expect(intersectLines([0, 0], [10, 0], [0, 1], [10, 1])).toBeNull();
  });
});

describe("inwardOffset", () => {
  it("recule chaque côté d'un carré de la distance demandée", () => {
    const result = inwardOffset(SQUARE, 1);
    expect(result).not.toBeNull();
    expect(polygonArea(result!)).toBeCloseTo(8 * 8); // 10x10 reculé de 1 de chaque côté → 8x8
  });

  it("distance nulle ou négative renvoie une copie du polygone", () => {
    const result = inwardOffset(SQUARE, 0);
    expect(result).toEqual(SQUARE);
  });

  it("refuse un polygone non convexe", () => {
    const L: Point2[] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
    ];
    expect(inwardOffset(L, 1)).toBeNull();
  });

  it("un recul égal à la demi-largeur dégénère le carré en un point (aire nulle) et renvoie null", () => {
    expect(inwardOffset(SQUARE, 5)).toBeNull();
  });

  it("au-delà de la demi-largeur, les côtés opposés se croisent : le résultat n'est pas null mais s'inverse", () => {
    // Comportement réel de l'algorithme source (pas d'anti-repliement) : à documenter, pas à masquer.
    const result = inwardOffset(SQUARE, 10);
    expect(result).not.toBeNull();
    expect(polygonArea(result!)).toBeCloseTo(100);
  });
});

describe("parcelCenter", () => {
  it("retourne le centroïde de la parcelle", () => {
    expect(parcelCenter({ centroid: [12, 34] })).toEqual([12, 34]);
  });

  it("retourne [0,0] si la parcelle est absente", () => {
    expect(parcelCenter(null)).toEqual([0, 0]);
    expect(parcelCenter(undefined)).toEqual([0, 0]);
  });
});

describe("buildingFootprint", () => {
  it("priorise le contour bâti de la parcelle active", () => {
    const result = buildingFootprint({ building: { vertices: SQUARE } }, null, undefined);
    expect(result).toBe(SQUARE);
  });

  it("retombe sur le contour mémorisé si la parcelle n'en a pas", () => {
    const stored = { vertices: SQUARE };
    const result = buildingFootprint(null, stored, undefined);
    expect(result).toBe(SQUARE);
  });

  it("retombe sur un tracé de niveau marqué buildingFootprint, recentré sur la parcelle", () => {
    const levels = {
      rdc: { paths: [{ closed: true, role: "buildingFootprint", points: [[1, 1], [2, 1], [2, 2]] as Point2[] }] },
    };
    const result = buildingFootprint({ centroid: [100, 200] }, null, levels);
    expect(result).toEqual([
      [101, 201],
      [102, 201],
      [102, 202],
    ]);
  });

  it("retourne null si aucune source n'a de contour exploitable", () => {
    expect(buildingFootprint(null, null, undefined)).toBeNull();
  });
});

describe("projectCode", () => {
  it("préfixe P. quand un numéro de parcelle est connu", () => {
    expect(projectCode({ name: "Mezzanine" }, { parcelNumber: "1234" })).toBe("P.1234");
  });

  it("retombe sur le numéro de parcelle du projet si la parcelle active n'en a pas", () => {
    expect(projectCode({ name: "Mezzanine", parcel: "5678" }, null)).toBe("P.5678");
  });

  it("retombe sur le nom du projet sans numéro de parcelle", () => {
    expect(projectCode({ name: "Mezzanine" }, null)).toBe("Mezzanine");
  });

  it("retombe sur 'V14' sans projet actif", () => {
    expect(projectCode(null, null)).toBe("V14");
  });
});
