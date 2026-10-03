/**
 * Tests des adaptations de la relecture L1.5 (voir RELECTURE.md) : tolérances reçues en paramètre, repères marqués
 * au niveau du type, cas dégénérés signalés. Chaque adaptation vérifie aussi que le comportement par défaut
 * (sans tolérance) est inchangé.
 */
import { describe, expect, it } from "vitest";
import {
  buildModelGeometry,
  cutPrism,
  findLevel,
  polygonIntervalsAtAxis,
  wallPolygon,
  type BuildingModel,
  type Level,
  type Point2,
  type Prism,
} from "./geometry";
import { inwardOffset, intersectLines, isConvexPolygon, offsetInverts, polygonArea } from "./parcel-geometry";
import { enRepere, ErreurPointGeometrie, type Point2Cadastral, type Point2Local } from "./reperes";
import { clipHalfPlane, cutArea, siteZoning, triangulate, vertexCentroid } from "./site-zoning";
import {
  ErreurTolerance,
  produitVectorielNegligeable,
  resoudreTolerance,
  TOLERANCES_HISTORIQUES,
  type TolerancesGeometrie,
} from "./tolerances";

/** Même forme que `TOLERANCES` d'atelier-model (D-012), recopiée ici seulement pour le test de compatibilité structurelle. */
const FORME_D012 = {
  tolCoincidence: 1e-6,
  longueurMin: 0.001,
  tolAngle: 1e-6,
  aireMin: 1e-6,
  tolCorde: 0.001,
  copiesMax: 500,
  rayonAccrochageSourisPx: 8,
  rayonAccrochageTouchePx: 16,
} as const;

const carre: Point2[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe("tolérances (D-012 reçues en paramètre)", () => {
  it("un objet de la forme D-012 est accepté tel quel (typage structurel, sans dépendre d'atelier-model)", () => {
    const tol: TolerancesGeometrie = FORME_D012;
    expect(resoudreTolerance(tol, "longueurMin", 123)).toBe(0.001);
  });

  it("sans tolérance, le seuil historique est rendu", () => {
    expect(resoudreTolerance(undefined, "aireMin", TOLERANCES_HISTORIQUES.aireDecalageMin)).toBe(1e-6);
    expect(resoudreTolerance({}, "tolCoincidence", 1e-8)).toBe(1e-8);
  });

  it("refuse une tolérance négative, infinie ou NaN", () => {
    expect(() => resoudreTolerance({ aireMin: -1 }, "aireMin", 0)).toThrow(ErreurTolerance);
    expect(() => resoudreTolerance({ tolAngle: Number.NaN }, "tolAngle", 0)).toThrow(/tolAngle/);
    expect(() => resoudreTolerance({ longueurMin: Infinity }, "longueurMin", 0)).toThrow(ErreurTolerance);
  });

  it("le test de produit vectoriel devient normalisé quand tolAngle est fourni", () => {
    // |u| = |v| = 1000, sin θ = 1e-8 → cross = 1e-2 : non négligeable en absolu, négligeable en angle.
    expect(produitVectorielNegligeable(1e-2, 1000, 1000, undefined, 1e-9)).toBe(false);
    expect(produitVectorielNegligeable(1e-2, 1000, 1000, { tolAngle: 1e-6 }, 1e-9)).toBe(true);
  });

  it("les seuils historiques sont figés", () => {
    expect(Object.isFrozen(TOLERANCES_HISTORIQUES)).toBe(true);
  });
});

describe("repères marqués au niveau du type", () => {
  it("enRepere ne copie ni ne convertit, et refuse une coordonnée non finie", () => {
    const pts: Point2[] = [[1, 2]];
    expect(enRepere("local", pts)).toBe(pts);
    expect(() => enRepere("cadastral", [[0, Number.NaN]])).toThrow(ErreurPointGeometrie);
  });

  it("le compilateur refuse de mélanger local et cadastral ; un Point2 non marqué reste accepté", () => {
    const local: readonly Point2Local[] = enRepere("local", carre);
    const nonMarque: readonly Point2Local[] = carre;
    // @ts-expect-error — un point local n'est pas un point cadastral (R5).
    const melange: readonly Point2Cadastral[] = local;
    expect(nonMarque).toBe(carre);
    expect(melange).toBe(local);
  });

  it("inwardOffset, vertexCentroid et triangulate rendent leurs points dans le repère de l'entrée", () => {
    const cad = enRepere("cadastral", carre);
    const recul: Point2Cadastral[] | null = inwardOffset(cad, 1);
    const centre: Point2Cadastral = vertexCentroid(cad);
    const triangles: Point2Cadastral[][] = triangulate(cad);
    // @ts-expect-error — le résultat reste cadastral, pas local.
    const fautif: Point2Local[] | null = inwardOffset(cad, 1);
    expect(polygonArea(recul!)).toBeCloseTo(64);
    expect(centre).toEqual([5, 5]);
    expect(triangles).toHaveLength(2);
    expect(fautif).not.toBeNull();
  });
});

describe("geometry.ts — adaptations", () => {
  it("polygonIntervalsAtAxis : tolCoincidence écarte un intervalle plus étroit ; défaut inchangé", () => {
    const fin: Point2[] = [
      [0, 0],
      [1e-7, 0],
      [1e-7, 1],
      [0, 1],
    ];
    expect(polygonIntervalsAtAxis(fin, 1, 0.5)).toHaveLength(1);
    expect(polygonIntervalsAtAxis(fin, 1, 0.5, { tolCoincidence: 1e-6 })).toHaveLength(0);
  });

  it("cutPrism transmet la tolérance", () => {
    const prism: Prism = {
      poly: [
        [0, 0],
        [1e-7, 0],
        [1e-7, 1],
        [0, 1],
      ],
      holes: [],
      z0: 0,
      z1: 1,
      kind: "wall",
      id: "w",
      fill: "#000",
    };
    expect(cutPrism(prism, 1, 0.5)).toHaveLength(1);
    expect(cutPrism(prism, 1, 0.5, { tolCoincidence: 1e-6 })).toHaveLength(0);
  });

  it("findLevel distingue un niveau absent d'un niveau à l'altitude 0", () => {
    const levels: Level[] = [{ id: "rdc", elevation: 0 }];
    expect(findLevel("rdc", levels)).toEqual({ id: "rdc", elevation: 0 });
    expect(findLevel("r+9", levels)).toBeNull();
  });

  it("wallPolygon d'un mur de longueur nulle : quatre sommets confondus (cas documenté, inchangé)", () => {
    const poly = wallPolygon({ id: "w", a: [2, 3], b: [2, 3], thickness: 0.2 });
    expect(poly.every((p) => Math.abs(p[0] - 2) < 1e-12 && Math.abs(p[1] - 3) < 1e-12)).toBe(true);
  });
});

describe("buildModelGeometry — diagnostics des cas dégénérés et des valeurs du prototype", () => {
  const levels: Level[] = [
    { id: "rdc", elevation: 0, height: 2.5 },
    { id: "r1", elevation: 2.5, height: 2.5 },
  ];
  const level = levels[0]!;
  const codes = (model: BuildingModel, tol?: TolerancesGeometrie) =>
    buildModelGeometry(model, level, levels, undefined, tol).diagnostics.map((d) => `${d.code}:${d.elementId}`);

  it("un modèle complet et explicite ne produit aucun diagnostic", () => {
    const r = buildModelGeometry(
      {
        walls: [{ id: "w1", a: [0, 0], b: [4, 0], thickness: 0.2, baseLevel: "rdc", topLevel: "r1" }],
        windows: [{ id: "f1", hostWallId: "w1", kind: "window", t: 0.5, width: 1, sill: 0.9, height: 1.2 }],
        stairs: [{ id: "s1", a: [0, 1], b: [0, 4], width: 1, steps: 14, height: 2.5 }],
        paths: [{ id: "p1", points: [[0, 0], [1, 1]] }],
      },
      level,
      levels,
    );
    expect(r.diagnostics).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("signale un mur trop court au lieu de l'écarter en silence", () => {
    expect(codes({ walls: [{ id: "w0", a: [1, 1], b: [1, 1], thickness: 0.2 }] })).toEqual(["mur-degenere:w0"]);
  });

  it("longueurMin (D-012) écarte un mur que le seuil historique garde ; la géométrie par défaut est inchangée", () => {
    const model: BuildingModel = { walls: [{ id: "w", a: [0, 0], b: [0.0005, 0], thickness: 0.2 }] };
    expect(buildModelGeometry(model, level, levels).prisms).toHaveLength(1);
    const r = buildModelGeometry(model, level, levels, undefined, { longueurMin: 0.001 });
    expect(r.prisms).toHaveLength(0);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["mur-degenere"]);
  });

  it("signale un niveau inconnu (altitude 0 retenue comme le prototype)", () => {
    const r = buildModelGeometry(
      { walls: [{ id: "w", a: [0, 0], b: [4, 0], thickness: 0.2, baseLevel: "fantome", height: 3 }] },
      level,
      levels,
    );
    expect(r.prisms[0]).toMatchObject({ z0: 0, z1: 3 });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["niveau-inconnu"]);
  });

  it("signale une hauteur nulle (sommet sous la base)", () => {
    const r = buildModelGeometry(
      { walls: [{ id: "w", a: [0, 0], b: [4, 0], thickness: 0.2, baseLevel: "r1", topLevel: "rdc" }] },
      level,
      levels,
    );
    expect(r.prisms).toHaveLength(0);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["hauteur-nulle"]);
  });

  it("signale les valeurs par défaut du prototype (épaisseur, allège, hauteur d'ouverture)", () => {
    expect(
      codes({
        walls: [{ id: "w", a: [0, 0], b: [4, 0] }],
        windows: [{ id: "f", hostWallId: "w", kind: "window", t: 0.5, width: 1 }],
        doors: [{ id: "d", hostWallId: "w", kind: "door", t: 0.2, width: 0.9, height: 2 }],
      }),
    ).toEqual(["valeur-prototype:w", "valeur-prototype:f", "valeur-prototype:f"]);
  });

  it("signale une ouverture dont le mur hôte est absent ou dégénéré", () => {
    expect(
      codes({
        walls: [{ id: "court", a: [0, 0], b: [0, 0], thickness: 0.2 }],
        doors: [
          { id: "d1", hostWallId: "absent", kind: "door", t: 0.5, width: 0.9, height: 2 },
          { id: "d2", hostWallId: "court", kind: "door", t: 0.5, width: 0.9, height: 2 },
        ],
      }),
    ).toEqual(["mur-degenere:court", "ouverture-orpheline:d1", "ouverture-orpheline:d2"]);
  });

  it("signale une ouverture de largeur nulle", () => {
    expect(
      codes({
        walls: [{ id: "w", a: [0, 0], b: [4, 0], thickness: 0.2 }],
        doors: [{ id: "d", hostWallId: "w", kind: "door", t: 0.5, width: 0, height: 2 }],
      }),
    ).toEqual(["ouverture-largeur-nulle:d"]);
  });

  it("escaliers : longueur nulle, valeurs du prototype, marches bornées, hauteur nulle", () => {
    expect(codes({ stairs: [{ id: "s0", a: [1, 1], b: [1, 1], width: 1, steps: 10, height: 2 }] })).toEqual([
      "escalier-degenere:s0",
    ]);
    expect(codes({ stairs: [{ id: "s1", a: [0, 0], b: [0, 3], height: 2 }] })).toEqual([
      "valeur-prototype:s1",
      "valeur-prototype:s1",
    ]);
    expect(codes({ stairs: [{ id: "s2", a: [0, 0], b: [0, 3], width: 1, steps: 500, height: 2 }] })).toEqual([
      "escalier-marches-bornees:s2",
    ]);
    const sansHauteur = buildModelGeometry(
      { stairs: [{ id: "s3", a: [0, 0], b: [0, 3], width: 1, steps: 10 }] },
      { id: "x", elevation: 0 },
      [],
    );
    expect(sansHauteur.prisms).toHaveLength(0);
    expect(sansHauteur.diagnostics.map((d) => d.code)).toEqual(["hauteur-nulle"]);
  });

  it("signale un tracé de moins de 2 points", () => {
    expect(codes({ paths: [{ id: "p", points: [[0, 0]] }] })).toEqual(["chemin-degenere:p"]);
  });

  it("signale un poteau de hauteur nulle quand un résolveur est fourni", () => {
    const r = buildModelGeometry(
      { columns: [{ id: "c", p: [0, 0] }] },
      { id: "x", elevation: 0 },
      [{ id: "x", elevation: 0 }],
      () => ({ solids: [[[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1]]], holes: [], inserts: [] }),
    );
    expect(r.prisms).toHaveLength(0);
    expect(r.diagnostics.map((d) => `${d.code}:${d.elementId}`)).toEqual(["hauteur-nulle:c"]);
  });

  it("warnings reste la liste des messages des diagnostics (compatibilité)", () => {
    const r = buildModelGeometry({ columns: [{ id: "c", p: [0, 0] }], paths: [{ id: "p", points: [] }] }, level, levels);
    expect(r.warnings).toEqual(r.diagnostics.map((d) => d.message));
    expect(r.diagnostics.map((d) => d.code)).toEqual(["poteaux-sans-resolveur", "chemin-degenere"]);
  });
});

describe("parcel-geometry.ts — adaptations", () => {
  it("isConvexPolygon : sommets tous alignés → vrai (cas documenté, inchangé)", () => {
    expect(isConvexPolygon([[0, 0], [1, 0], [2, 0]])).toBe(true);
  });

  it("isConvexPolygon : tolAngle ignore un sommet presque aligné sur une grande longueur", () => {
    // Le sommet du milieu rentre de 1e-9 m sur 2 km : virage rentrant négligeable en angle (~2e-12 rad).
    const presque: Point2[] = [
      [0, 0],
      [1000, 1e-9],
      [2000, 0],
      [2000, 100],
      [0, 100],
    ];
    expect(isConvexPolygon(presque)).toBe(false);
    expect(isConvexPolygon(presque, { tolAngle: 1e-6 })).toBe(true);
  });

  it("intersectLines : droites presque parallèles, tolAngle normalisé ; défaut historique inchangé", () => {
    const a: Point2 = [0, 0];
    const b: Point2 = [1000, 0];
    const c: Point2 = [0, 1];
    const d: Point2 = [1000, 1 + 1e-11];
    expect(intersectLines(a, b, c, d)).not.toBeNull();
    expect(intersectLines(a, b, c, d, { tolAngle: 1e-6 })).toBeNull();
  });

  it("intersectLines : droite indéterminée (deux points confondus) → null", () => {
    expect(intersectLines([0, 0], [0, 0], [0, 1], [1, 1])).toBeNull();
    expect(intersectLines([0, 0], [0, 0], [0, 1], [1, 1], { tolAngle: 0 })).toBeNull();
  });

  it("inwardOffset : aireMin et longueurMin reçus en paramètre", () => {
    expect(inwardOffset(carre, 4.99)).not.toBeNull();
    expect(inwardOffset(carre, 4.99, { aireMin: 0.01 })).toBeNull();
    const petit: Point2[] = [
      [0, 0],
      [0.0005, 0],
      [0.0005, 10],
      [0, 10],
    ];
    expect(inwardOffset(petit, 0.0001)).not.toBeNull();
    expect(inwardOffset(petit, 0.0001, { longueurMin: 0.001 })).toBeNull();
  });

  it("offsetInverts détecte le polygone inversé d'un recul trop grand, sans modifier inwardOffset", () => {
    const inverse = inwardOffset(carre, 7);
    expect(inverse).not.toBeNull();
    expect(offsetInverts(carre, inverse)).toBe(true);
    expect(offsetInverts(carre, inwardOffset(carre, 1))).toBe(false);
    expect(offsetInverts(carre, null)).toBe(false);
  });
});

describe("site-zoning.ts — adaptations", () => {
  it("clipHalfPlane : aireMin reçu en paramètre ; défaut inchangé", () => {
    // Bande de 1e-4 × 10 : aire 1e-3, au-dessus du seuil historique (1e-8 m²), sous un aireMin de 0,01 m².
    expect(clipHalfPlane(carre, [1, 0], 5)).toHaveLength(4);
    expect(clipHalfPlane(carre, [1, 0], 1e-4, true, { aireMin: 0.01 })).toEqual([]);
    expect(clipHalfPlane(carre, [1, 0], 1e-4)).toHaveLength(4);
  });

  it("cutArea transmet la tolérance à clipHalfPlane", () => {
    const [bas, haut] = cutArea([carre], [1, 0], 50, { aireMin: 1e-6 });
    expect(polygonArea(bas[0]!)).toBeCloseTo(50, 6);
    expect(polygonArea(haut[0]!)).toBeCloseTo(50, 6);
  });

  it("siteZoning : longueurMin refuse un côté d'approche trop court ; défaut inchangé", () => {
    const local: Point2[] = [
      [-5, -5],
      [-4.9995, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ];
    const entree = { local, area: 100, units: "m", crs: "EPSG:2056", frontage: 0 };
    expect(siteZoning(entree)).not.toBeNull();
    expect(siteZoning(entree, "A", { longueurMin: 0.001 })).toBeNull();
  });

  it("vertexCentroid d'une liste vide → [0, 0] ; triangulate de 3 points alignés → le triangle tel quel (cas documentés)", () => {
    expect(vertexCentroid([])).toEqual([0, 0]);
    expect(triangulate([[0, 0], [1, 0], [2, 0]])).toHaveLength(1);
    expect(() => triangulate(Array.from({ length: 2001 }, (_, i): Point2 => [Math.cos(i), Math.sin(i)]))).toThrow(
      /trop détaillé/,
    );
  });
});
