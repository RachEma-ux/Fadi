import { describe, expect, it } from "vitest";
import {
  buildModelGeometry,
  columnWorldPolygon,
  cutPrism,
  deepClone,
  elevationOf,
  polygonIntervalsAtAxis,
  prismFaces,
  rotateLocal,
  segmentLength,
  stairFootprint,
  subtractIntervals,
  verticalExtent,
  wallPolygon,
  type BuildingModel,
  type Level,
} from "./geometry";

describe("primitives", () => {
  it("segmentLength mesure la distance euclidienne 2D", () => {
    expect(segmentLength([0, 0], [3, 4])).toBeCloseTo(5);
    expect(segmentLength([1, 1], [1, 1])).toBe(0);
  });

  it("rotateLocal pivote un point de 90° autour de l'origine", () => {
    const [x, y] = rotateLocal([1, 0], Math.PI / 2);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
  });

  it("deepClone ne partage aucune référence avec l'original", () => {
    const original = { a: [1, 2], nested: { b: 3 } };
    const clone = deepClone(original);
    clone.nested.b = 99;
    expect(original.nested.b).toBe(3);
  });

  it("elevationOf retourne 0 pour un niveau inconnu", () => {
    const levels: Level[] = [{ id: "rdc", elevation: 0 }, { id: "r1", elevation: 3 }];
    expect(elevationOf("r1", levels)).toBe(3);
    expect(elevationOf("inconnu", levels)).toBe(0);
  });

  it("verticalExtent additionne l'altitude du niveau de base et le décalage", () => {
    const levels: Level[] = [{ id: "rdc", elevation: 0, height: 2.7 }];
    const level = levels[0]!;
    const [z0, z1] = verticalExtent({ baseLevel: "rdc", baseOffset: 0.1 }, level, levels);
    expect(z0).toBeCloseTo(0.1);
    expect(z1).toBeCloseTo(2.8); // z0 + height du niveau, faute de height propre à l'élément
  });
});

describe("wallPolygon", () => {
  it("produit un rectangle centré sur l'axe pour un mur horizontal", () => {
    const wall = { id: "w1", a: [0, 0] as const, b: [4, 0] as const, thickness: 0.2 };
    const poly = wallPolygon(wall);
    // axe horizontal (0,0)->(4,0) : normale = (0,1), épaisseur 0.2 → y entre -0.1 et 0.1
    const ys = poly.map((p) => p[1]).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-0.1);
    expect(ys[ys.length - 1]).toBeCloseTo(0.1);
  });

  it("décale sur la face intérieure quand lineRef le demande", () => {
    const wall = { id: "w1", a: [0, 0] as const, b: [4, 0] as const, thickness: 0.2, lineRef: "face-intérieure" };
    const poly = wallPolygon(wall);
    const ys = poly.map((p) => p[1]);
    // offset = +t/2 = 0.1 → le mur est décalé entièrement du côté +y : [0, 0.2]
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(0.2);
  });
});

describe("stairFootprint", () => {
  it("produit un rectangle de la largeur demandée, centré sur l'axe", () => {
    const foot = stairFootprint({ id: "s1", a: [0, 0], b: [0, 5], width: 1.2 });
    const xs = foot.map((p) => p[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-0.6);
    expect(xs[xs.length - 1]).toBeCloseTo(0.6);
  });
});

describe("columnWorldPolygon", () => {
  it("place un profil local sans rotation à la position du poteau", () => {
    const poly = columnWorldPolygon({ id: "c1", p: [10, 20] }, [
      [-0.1, -0.1],
      [0.1, -0.1],
      [0.1, 0.1],
      [-0.1, 0.1],
    ]);
    expect(poly[0]).toEqual([9.9, 19.9]);
    expect(poly[2]).toEqual([10.1, 20.1]);
  });

  it("applique la rotation du poteau (90°) avant translation", () => {
    const poly = columnWorldPolygon({ id: "c1", p: [0, 0], angle: 90 }, [[1, 0]]);
    expect(poly[0]![0]).toBeCloseTo(0, 10);
    expect(poly[0]![1]).toBeCloseTo(1, 10);
  });
});

describe("polygonIntervalsAtAxis + subtractIntervals", () => {
  it("trouve l'intervalle plein d'un carré coupé par une verticale", () => {
    const square = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ] as const;
    const intervals = polygonIntervalsAtAxis(square, 0, 2); // coupe à x=2
    expect(intervals).toEqual([[0, 4]]);
  });

  it("soustrait un trou d'un intervalle plein", () => {
    const result = subtractIntervals([[0, 10]], [[3, 5]]);
    expect(result).toEqual([
      [0, 3],
      [5, 10],
    ]);
  });

  it("cutPrism carve le trou d'un prisme à un plan donné", () => {
    const prism = {
      poly: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ] as [number, number][],
      holes: [],
      z0: 0,
      z1: 2.5,
      kind: "wall" as const,
      id: "w1",
    };
    const segments = cutPrism(prism, 0, 2);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ a: 0, b: 4, z0: 0, z1: 2.5, id: "w1" });
  });
});

describe("prismFaces", () => {
  it("génère 2 faces horizontales + 4 faces latérales pour un prisme carré sans trou", () => {
    const faces = prismFaces({
      poly: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      holes: [],
      z0: 0,
      z1: 2.5,
      kind: "wall",
      id: "w1",
      fill: "#607c69",
    });
    expect(faces).toHaveLength(2 + 4);
    expect(faces.every((f) => f.id === "w1")).toBe(true);
  });
});

describe("buildModelGeometry", () => {
  const levels: Level[] = [{ id: "rdc", elevation: 0, height: 2.5 }];
  const level = levels[0]!;

  it("construit un prisme plein pour un mur sans ouverture", () => {
    const model: BuildingModel = {
      walls: [{ id: "w1", a: [0, 0], b: [4, 0], thickness: 0.2, baseLevel: "rdc" }],
    };
    const { prisms, warnings } = buildModelGeometry(model, level, levels);
    expect(prisms).toHaveLength(1);
    expect(prisms[0]).toMatchObject({ id: "w1", kind: "wall", z0: 0, z1: 2.5 });
    expect(warnings).toHaveLength(0);
  });

  it("carve une porte dans le mur : le prisme est coupé en segments de part et d'autre", () => {
    const model: BuildingModel = {
      walls: [{ id: "w1", a: [0, 0], b: [4, 0], thickness: 0.2, baseLevel: "rdc" }],
      doors: [{ id: "d1", hostWallId: "w1", kind: "door", t: 0.5, width: 0.9 }],
    };
    const { prisms, surfaces } = buildModelGeometry(model, level, levels);
    // porte centrée en x=2, largeur 0.9 → ouverture entre x=1.55 et x=2.45
    // le mur plein doit être coupé en (au moins) un segment avant et un après l'ouverture, plus la bande au-dessus de la porte
    const wallSegments = prisms.filter((p) => p.kind === "wall");
    expect(wallSegments.length).toBeGreaterThanOrEqual(2);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.kind).toBe("door");
  });

  it("signale explicitement les poteaux non extrudés plutôt que de les ignorer en silence", () => {
    const model: BuildingModel = {
      columns: [{ id: "c1", p: [1, 1], shapeId: "rect" }],
    };
    const { prisms, warnings } = buildModelGeometry(model, level, levels);
    expect(prisms.filter((p) => p.kind === "column")).toHaveLength(0);
    expect(warnings[0]).toMatch(/poteau/i);
  });

  it("extrude les poteaux quand un columnShapeResolver est fourni", () => {
    const model: BuildingModel = {
      columns: [{ id: "c1", p: [1, 1], baseLevel: "rdc", height: 2.5 }],
    };
    const square: [number, number][] = [
      [-0.1, -0.1],
      [0.1, -0.1],
      [0.1, 0.1],
      [-0.1, 0.1],
    ];
    const { prisms, warnings } = buildModelGeometry(model, level, levels, () => ({
      solids: [square],
      holes: [],
      inserts: [],
    }));
    expect(warnings).toHaveLength(0);
    expect(prisms).toHaveLength(1);
    expect(prisms[0]).toMatchObject({ kind: "column", id: "c1" });
  });

  it("découpe un escalier en marches dont l'altitude augmente régulièrement", () => {
    const model: BuildingModel = {
      stairs: [{ id: "s1", a: [0, 0], b: [0, 3], width: 1.2, height: 2.5, steps: 10 }],
    };
    const { prisms } = buildModelGeometry(model, level, levels);
    const steps = prisms.filter((p) => p.kind === "stairs").sort((a, b) => a.z0 - b.z0);
    expect(steps).toHaveLength(10);
    expect(steps[0]!.z0).toBeCloseTo(0);
    expect(steps[steps.length - 1]!.z1).toBeCloseTo(2.5);
  });
});
