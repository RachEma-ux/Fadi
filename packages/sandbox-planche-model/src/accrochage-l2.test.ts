/**
 * Cas 2 du catalogue, lot 2 « Accrochage et saisie » : accrochages ajoutés au moteur d'inférence (maquette lot2-1 validée
 * le 27 novembre 2026). Chaque accrochage n'agit qu'avec les réglages de l'interface (`accrochage`).
 */
import { describe, expect, it } from "vitest";
import { ajouterRectangle, exclureDeLAccrochage, grouper, modeleVide } from "./geometrie-libre.js";
import { type EntreeInference, type GeometrieVisible, aretesDeSection, geometrieVisible, inferer } from "./inference.js";
import { v3 } from "./vecteur.js";

const base = (g: GeometrieVisible, autres: Partial<EntreeInference> = {}): EntreeInference => ({ tolerance: 0.05, geometrie: g, accrochage: {}, ...autres });
const vide: GeometrieVisible = { aretes: [], faces: [], centres: [] };

describe("guides (n° 37)", () => {
  const guides = [
    { id: "g1", genre: "ligne" as const, origine: v3(2, 0, 0), direction: v3(0, 1, 0) },
    { id: "g2", genre: "ligne" as const, origine: v3(0, 3, 0), direction: v3(1, 0, 0) },
    { id: "g3", genre: "point" as const, origine: v3(5, 5, 0) },
  ];
  it("intersection guide × guide", () => {
    const r = inferer(base(vide, { point: v3(2.02, 3.01, 0), guides }));
    expect(r.type).toBe("intersection");
    expect(r.point.x).toBeCloseTo(2);
    expect(r.point.y).toBeCloseTo(3);
  });
  it("intersection guide × arête", () => {
    const g: GeometrieVisible = { aretes: [{ id: "a", a: v3(0, 1, 0), b: v3(5, 1, 0) }], faces: [], centres: [] };
    const r = inferer(base(g, { point: v3(2.01, 1.02, 0), guides: [guides[0]!] }));
    expect(r.type).toBe("intersection");
    expect(r.point).toEqual(v3(2, 1, 0));
  });
  it("point de guide et sur le guide", () => {
    expect(inferer(base(vide, { point: v3(5.01, 5, 0), guides })).type).toBe("point-guide");
    const r = inferer(base(vide, { point: v3(2.02, 1.5, 0), guides }));
    expect(r.type).toBe("sur-guide");
    expect(r.point.x).toBeCloseTo(2);
  });
  it("sans les réglages de l'interface, les guides ne sont pas accrochés (comportement d'avant)", () => {
    expect(inferer({ tolerance: 0.05, geometrie: vide, point: v3(5.01, 5, 0), guides }).type).toBe("aucune");
  });
});

describe("croisement de deux alignements (n° 67)", () => {
  it("axe depuis le départ × axe depuis un point de référence, sans ligne de construction", () => {
    const r = inferer(base(vide, { point: v3(3.02, 2.01, 0), depart: v3(0, 2, 0), pointsReference: [v3(3, 0, 0)] }));
    expect(r.type).toBe("croisement");
    expect(r.point.x).toBeCloseTo(3);
    expect(r.point.y).toBeCloseTo(2);
  });
  it("alignement × arête", () => {
    const g: GeometrieVisible = { aretes: [{ id: "a", a: v3(4, -1, 0), b: v3(4, 5, 0) }], faces: [], centres: [] };
    const r = inferer(base(g, { point: v3(4.03, 0.03, 0), tolerance: 0.05, depart: v3(0, 0, 0) }));
    expect(r.type).toBe("croisement");
    expect(r.point).toEqual(v3(4, 0, 0));
  });
});

describe("intersection apparente (n° 84)", () => {
  it("deux arêtes à des hauteurs différentes se croisent vues de dessus", () => {
    const g: GeometrieVisible = { aretes: [{ id: "a", a: v3(0, 0, 0), b: v3(5, 0, 0) }, { id: "b", a: v3(2, -2, 1), b: v3(2, 3, 1) }], faces: [], centres: [] };
    const r = inferer(base(g, { rayon: { origine: v3(2.01, 0.01, 10), direction: v3(0, 0, -1) } }));
    expect(r.type).toBe("intersection-apparente");
    expect(r.point).toEqual(v3(2, 0, 0));
  });
});

describe("quadrants (n° 106)", () => {
  it("dans le repère de travail", () => {
    const g: GeometrieVisible = { aretes: [], faces: [], centres: [{ id: "k", position: v3(0, 0, 0), rayon: 2, normale: v3(0, 0, 1) }] };
    const r = inferer(base(g, { point: v3(0.01, 2.01, 0) }));
    expect(r.type).toBe("quadrant");
    expect(r.point.y).toBeCloseTo(2);
    const tourne = inferer(base(g, { point: v3(1.42, 1.41, 0), axes: { origine: v3(0, 0, 0), x: v3(Math.SQRT1_2, Math.SQRT1_2, 0), y: v3(-Math.SQRT1_2, Math.SQRT1_2, 0), z: v3(0, 0, 1) } }));
    expect(tourne.type).toBe("quadrant");
    expect(tourne.point.x).toBeCloseTo(Math.SQRT2);
  });
  it("la géométrie visible porte le rayon et la normale des courbes", () => {
    const m = modeleVide();
    expect(geometrieVisible(m).centres).toEqual([]);
  });
});

describe("axe médian entre deux nus (n° 101)", () => {
  const mur: GeometrieVisible = { aretes: [{ id: "n1", a: v3(0, 0, 0), b: v3(4, 0, 0) }, { id: "n2", a: v3(0, 0.2, 0), b: v3(4, 0.2, 0) }], faces: [], centres: [] };
  it("le point se pose sur l'axe, à égale distance des deux nus", () => {
    const r = inferer(base(mur, { point: v3(2.3, 0.105, 0), tolerance: 0.01 }));
    expect(r.type).toBe("axe-median");
    expect(r.point.y).toBeCloseTo(0.1);
  });
  it("au-delà de l'écart maximal, pas d'axe", () => {
    const large: GeometrieVisible = { aretes: [mur.aretes[0]!, { id: "n3", a: v3(0, 2, 0), b: v3(4, 2, 0) }], faces: [], centres: [] };
    expect(inferer(base(large, { point: v3(2.3, 1, 0), tolerance: 0.01 })).type).toBe("aucune");
  });
});

describe("arêtes de section du plan de coupe (n° 10)", () => {
  it("le plan coupe une face verticale : l'arête de section est accrochable, sans identifiant d'entité", () => {
    const g: GeometrieVisible = { aretes: [], faces: [{ id: "f", exterieur: [v3(0, 0, 0), v3(4, 0, 0), v3(4, 0, 3), v3(0, 0, 3)], trous: [], normale: v3(0, -1, 0) }], centres: [] };
    const plan = { origine: v3(0, 0, 1.5), normale: v3(0, 0, 1) };
    const s = aretesDeSection(g.faces, plan);
    expect(s).toHaveLength(1);
    expect(s[0]!.a.z).toBeCloseTo(1.5);
    const r = inferer(base(g, { point: v3(4.01, 0, 1.51), coupe: plan }));
    expect(r.type).toBe("extremite");
    expect(r.point.z).toBeCloseTo(1.5);
    expect(r.entite).toBeUndefined();
  });
});

describe("un seul genre pour le prochain point (n° 111)", () => {
  const g: GeometrieVisible = { aretes: [{ id: "a", a: v3(0, 0, 0), b: v3(4, 0, 0) }], faces: [], centres: [] };
  it("forcé sur le milieu, l'extrémité proche est ignorée", () => {
    expect(inferer(base(g, { point: v3(0.02, 0, 0), tolerance: 0.05 })).type).toBe("extremite");
    expect(inferer(base(g, { point: v3(0.02, 0, 0), tolerance: 0.05, accrochage: { force: "milieu" } })).type).toBe("aucune");
    expect(inferer(base(g, { point: v3(2.02, 0, 0), tolerance: 0.05, accrochage: { force: "milieu" } })).type).toBe("milieu");
  });
  it("un genre coupé n'est plus proposé", () => {
    const gs = [{ id: "g", genre: "point" as const, origine: v3(9, 9, 0) }];
    expect(inferer(base(vide, { point: v3(9, 9.01, 0), guides: gs, accrochage: { coupes: ["guide"] } })).type).toBe("aucune");
  });
});

describe("presque accroché (n° 17) et pas de longueur (n° 4)", () => {
  const g: GeometrieVisible = { aretes: [{ id: "a", a: v3(0, 0, 0), b: v3(4, 0, 0) }], faces: [], centres: [] };
  it("à 6 mm d'un sommet hors tolérance : signalé, jamais déplacé", () => {
    const r = inferer(base(g, { point: v3(1.3, 0.006, 0), tolerance: 0.001, accrochage: { presque: 0.01 } }));
    expect(r.type).toBe("aucune");
    expect(r.point).toEqual(v3(1.3, 0.006, 0));
    expect(r.presque?.genre).toBe("arete");
    const s = inferer(base(g, { point: v3(4.006, 0, 0.001), tolerance: 0.0001, accrochage: { presque: 0.01 } }));
    expect(s.presque?.genre).toBe("sommet");
    expect(s.presque?.ecart).toBeCloseTo(Math.hypot(0.006, 0.001));
  });
  it("le pas de longueur ramène un point libre à un multiple depuis le départ", () => {
    const r = inferer(base(vide, { point: v3(1.234, 1.234, 0), depart: v3(0, 0, 0), accrochage: { pasLongueur: 0.05 } }));
    expect(Math.hypot(r.point.x, r.point.y)).toBeCloseTo(1.75);
    expect(r.pasApplique).toBe(true);
    // Un point accroché n'est pas touché.
    expect(inferer(base(g, { point: v3(4.01, 0, 0), depart: v3(0, 1, 0), accrochage: { pasLongueur: 0.05 } })).point).toEqual(v3(4, 0, 0));
  });
});

describe("objet exclu de l'accrochage sans être masqué (n° 49)", () => {
  it("ses arêtes restent visibles mais rien ne s'y accroche", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const ids = [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)];
    const gr = grouper(m, ids);
    m = gr.modele;
    const occ = gr.occurrence;
    m = exclureDeLAccrochage(m, [occ], true).modele;
    const g = geometrieVisible(m);
    expect(g.aretes.length).toBeGreaterThan(0);
    expect(g.aretes.every((a) => a.horsAccrochage)).toBe(true);
    expect(inferer({ point: v3(2.001, 0, 0), tolerance: 0.05, geometrie: g }).type).toBe("aucune");
    m = exclureDeLAccrochage(m, [occ], false).modele;
    expect(inferer({ point: v3(2.001, 0, 0), tolerance: 0.05, geometrie: geometrieVisible(m) }).type).toBe("extremite");
  });
});
