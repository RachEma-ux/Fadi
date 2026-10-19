/**
 * Moteur d'accrochage de la planche 2D (Studio) : intersections exactes (lignes, cercles, arcs, polylignes à
 * renflement), perpendiculaire, tangente, plus proche, règles de priorité, repérage orthogonal et polaire, zone de
 * recherche bornée, saisie directe, bascules.
 */
import { describe, expect, it } from "vitest";
import type { StudioShape } from "@parcours/atelier-model";
import {
  appliquerSaisie, basculerAccrochage, basculesActives, BASCULES_INITIALES, candidatsObjets, cercleCercle, entitesDe, indexLineaire,
  intersectionsEntites, libelleRepere, lireMesure, MODES_ACCROCHAGE, MODES_PAR_DEFAUT, net, pasPolaireSuivant, piedsPerpendiculaires,
  plusProche, pointsTangence, resoudre, segmentCercle, segmentSegment, suivre, type IndexAccrochage, type ModeAccrochage, type ReglagesAccrochage,
} from ".";

const ligne = (id: string, ax: number, ay: number, bx: number, by: number): StudioShape => ({ id, type: "line", start: { x: ax, y: ay }, end: { x: bx, y: by } });
const tous: ReadonlySet<ModeAccrochage> = new Set(MODES_ACCROCHAGE);
const reglages = (o: Partial<ReglagesAccrochage> = {}): ReglagesAccrochage => ({ objets: true, modes: tous, orthogonal: false, polaire: false, pasPolaire: 45, ...o });

describe("Intersections exactes", () => {
  it("ligne / ligne : point exact, bornes comprises ; parallèles ou disjointes : aucune", () => {
    expect(segmentSegment({ x: 2, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }, { x: 8, y: 2 })).toEqual({ x: 5, y: 5 });
    expect(segmentSegment({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 0 });
    // Point exact malgré le bruit flottant : 0,1 + 0,2.
    expect(segmentSegment({ x: 0.1, y: 0 }, { x: 0.1, y: 1 }, { x: 0, y: 0.3 }, { x: 1, y: 0.3 })).toEqual({ x: 0.1, y: 0.3 });
    expect(segmentSegment({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 })).toEqual({ x: 4, y: 0 });
    expect(segmentSegment({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 1 }, { x: 4, y: 1 })).toBeNull();
    expect(segmentSegment({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0 }, { x: 6, y: 0 })).toBeNull();
    expect(segmentSegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 })).toBeNull();
  });

  it("ligne / cercle : deux points, un en tangence, aucun à l'extérieur", () => {
    expect(segmentCercle({ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }, 3)).toEqual([{ x: -3, y: 0 }, { x: 3, y: 0 }]);
    expect(segmentCercle({ x: -5, y: 3 }, { x: 5, y: 3 }, { x: 0, y: 0 }, 3)).toEqual([{ x: 0, y: 3 }]);
    expect(segmentCercle({ x: -5, y: 4 }, { x: 5, y: 4 }, { x: 0, y: 0 }, 3)).toEqual([]);
    // Segment qui s'arrête dans le cercle : un seul point.
    expect(segmentCercle({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }, 3)).toEqual([{ x: 3, y: 0 }]);
  });

  it("cercle / cercle : triangle 3-4-5 exact ; tangents : un point ; concentriques ou disjoints : aucun", () => {
    expect(cercleCercle({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5)).toEqual([{ x: 4, y: 3 }, { x: 4, y: -3 }]);
    expect(cercleCercle({ x: 0, y: 0 }, 2, { x: 5, y: 0 }, 3)).toEqual([{ x: 2, y: 0 }]);
    expect(cercleCercle({ x: 0, y: 0 }, 2, { x: 0, y: 0 }, 3)).toEqual([]);
    expect(cercleCercle({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1)).toEqual([]);
  });

  it("tangences au bruit flottant près, y compris loin de l'origine (~1e5 m) et quand B ≈ 0", () => {
    const X = 100000.1, Y = 100000.2, R = 0.3;
    // Segment qui part exactement du point de tangence (B ≈ 0) : un seul point, pas de perte par le bruit.
    const t1 = segmentCercle({ x: X, y: Y + R }, { x: X + 5, y: Y + R }, { x: X, y: Y }, R);
    expect(t1).toHaveLength(1);
    expect(t1[0]!.x).toBeCloseTo(X, 7); expect(t1[0]!.y).toBeCloseTo(Y + R, 7);
    // Segment tangent traversant, loin de l'origine.
    const t2 = segmentCercle({ x: X - 5, y: Y + R }, { x: X + 5, y: Y + R }, { x: X, y: Y }, R);
    expect(t2).toHaveLength(1);
    expect(t2[0]!.x).toBeCloseTo(X, 6);
    // Sécante à 1e5 : deux points exacts au nanomètre.
    expect(segmentCercle({ x: 1e5 - 5, y: 1e5 }, { x: 1e5 + 5, y: 1e5 }, { x: 1e5, y: 1e5 }, 3)).toEqual([{ x: 1e5 - 3, y: 1e5 }, { x: 1e5 + 3, y: 1e5 }]);
    // Cercles tangents extérieurement et intérieurement à 1e5 (rayons décimaux) : un point chacun.
    const ext = cercleCercle({ x: X, y: Y }, 0.1, { x: X + 0.3, y: Y }, 0.2);
    expect(ext).toHaveLength(1);
    expect(ext[0]!.x).toBeCloseTo(X + 0.1, 7); expect(ext[0]!.y).toBeCloseTo(Y, 7);
    const int = cercleCercle({ x: X, y: Y }, 0.3, { x: X + 0.1, y: Y }, 0.2);
    expect(int).toHaveLength(1);
    expect(int[0]!.x).toBeCloseTo(X + 0.3, 7);
    // Sécants à 1e5 : triangle 3-4-5 exact.
    expect(cercleCercle({ x: 1e5, y: 1e5 }, 5, { x: 1e5 + 8, y: 1e5 }, 5)).toEqual([{ x: 1e5 + 4, y: 1e5 + 3 }, { x: 1e5 + 4, y: 1e5 - 3 }]);
    // Disjoints de 1 µm à 1e5 : aucun point (la tolérance relative reste très inférieure).
    expect(cercleCercle({ x: X, y: Y }, 0.1, { x: X + 0.300001, y: Y }, 0.2)).toEqual([]);
    expect(segmentCercle({ x: X - 5, y: Y + R + 1e-6 }, { x: X + 5, y: Y + R + 1e-6 }, { x: X, y: Y }, R)).toEqual([]);
  });

  it("arcs : seuls les points de l'étendue (objet Arc et renflement de polyligne)", () => {
    const [arc] = entitesDe({ id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2 });
    const [cercle] = entitesDe({ id: "c", type: "circle", center: { x: 8, y: 0 }, radius: 5 });
    expect(intersectionsEntites(arc!, cercle!)).toEqual([{ x: 4, y: 3 }]);
    // Arc traversant 0 (de 350° à 10°) : le point à 0° en fait partie.
    const [arc0] = entitesDe({ id: "a0", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: (350 * Math.PI) / 180, endAngle: (10 * Math.PI) / 180 });
    expect(intersectionsEntites(arc0!, entitesDe(ligne("h", 0, 0, 5, 0))[0]!)).toEqual([{ x: 2, y: 0 }]);
    // Polyligne : demi-cercle de (0,0) à (4,0), renflement 1 (sens trigonométrique, passe par (2,-2)) puis segment droit.
    const poly: StudioShape = { id: "p", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], closed: false, bulges: [1, 0] };
    const [demi, droit] = entitesDe(poly);
    expect(demi).toMatchObject({ type: "arc", c: { x: 2, y: 0 }, r: 2 });
    expect(droit).toMatchObject({ type: "segment", a: { x: 4, y: 0 }, b: { x: 4, y: 3 } });
    expect(intersectionsEntites(demi!, entitesDe(ligne("v", 2, -5, 2, 5))[0]!)).toEqual([{ x: 2, y: -2 }]);
    expect(intersectionsEntites(demi!, entitesDe(ligne("v2", 2, 1, 2, 5))[0]!)).toEqual([]);
  });

  it("intersection d'objets par le moteur : point exact, deux objets nommés, aucun sommet lié", () => {
    const index = indexLineaire([ligne("l1", 2, 2, 8, 8), ligne("l2", 2, 8, 8, 2)]);
    const r = resoudre(index, { curseur: { x: 5.08, y: 4.95 }, tolerance: 0.2, base: null }, reglages());
    expect(r).toMatchObject({ genre: "intersection", point: { x: 5, y: 5 }, objets: ["l1", "l2"], ancre: null });
    // Segments d'une même polyligne qui se recoupent.
    const croix: StudioShape = { id: "z", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }], closed: false };
    expect(resoudre(indexLineaire([croix]), { curseur: { x: 2.05, y: 2 }, tolerance: 0.2, base: null }, reglages())).toMatchObject({ genre: "intersection", point: { x: 2, y: 2 }, objets: ["z"] });
  });
});

describe("Perpendiculaire, tangente, plus proche", () => {
  it("pied de la perpendiculaire sur un segment (dans son étendue) et sur un cercle", () => {
    const [s] = entitesDe(ligne("h", -5, 0, 5, 0));
    expect(piedsPerpendiculaires(s!, { x: 1.5, y: 4 })).toEqual([{ x: 1.5, y: 0 }]);
    expect(piedsPerpendiculaires(s!, { x: 7, y: 4 })).toEqual([]);
    const [c] = entitesDe({ id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 });
    expect(piedsPerpendiculaires(c!, { x: 0, y: 10 })).toEqual([{ x: 0, y: 5 }, { x: 0, y: -5 }]);
  });
  it("points de tangence depuis un point extérieur ; intérieur : aucun", () => {
    const [c] = entitesDe({ id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 });
    const t = pointsTangence(c!, { x: 10, y: 0 });
    expect(t).toEqual([{ x: 2.5, y: net(5 * Math.sin(Math.PI / 3)) }, { x: 2.5, y: -net(5 * Math.sin(Math.PI / 3)) }]);
    for (const p of t) expect(Math.abs((p.x - 0) * (p.x - 10) + p.y * p.y)).toBeLessThan(1e-8);
    expect(pointsTangence(c!, { x: 1, y: 1 })).toEqual([]);
  });
  it("plus proche : projection bornée sur le segment, sur le cercle, extrémité d'un arc", () => {
    const [s] = entitesDe(ligne("h", 0, 0, 4, 0));
    expect(plusProche(s!, { x: 1.25, y: 0.1 })).toEqual({ x: 1.25, y: 0 });
    expect(plusProche(s!, { x: 9, y: 1 })).toEqual({ x: 4, y: 0 });
    const [a] = entitesDe({ id: "a", type: "arc", center: { x: 0, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI / 2 });
    expect(plusProche(a!, { x: 0, y: 3 })).toEqual({ x: 0, y: 2 });
    expect(plusProche(a!, { x: 3, y: 3 })).toEqual({ x: net(Math.SQRT2), y: net(Math.SQRT2) });
    expect(plusProche(a!, { x: 3, y: -1 })).toEqual({ x: 2, y: 0 });
  });
  it("perpendiculaire et tangente depuis le dernier point posé, par le moteur", () => {
    const index = indexLineaire([ligne("h", -5, 0, 5, 0), { id: "c", type: "circle", center: { x: 20, y: 0 }, radius: 5 }]);
    const perp = resoudre(index, { curseur: { x: 1.6, y: 0.05 }, tolerance: 0.2, base: { x: 1.5, y: 4 } }, reglages());
    expect(perp).toMatchObject({ genre: "perpendiculaire", point: { x: 1.5, y: 0 }, objets: ["h"], ancre: null });
    const tan = resoudre(index, { curseur: { x: 17.5, y: 4.3 }, tolerance: 0.2, base: { x: 10, y: 0 } }, reglages({ modes: new Set<ModeAccrochage>(["tangente", "proche"]) }));
    expect(tan).toMatchObject({ genre: "tangente", point: { x: 17.5, y: net(5 * Math.sin(Math.PI / 3)) } });
    // Sans dernier point, ni perpendiculaire ni tangente.
    expect(resoudre(index, { curseur: { x: 1.6, y: 0.05 }, tolerance: 0.2, base: null }, reglages())?.genre).toBe("proche");
  });
});

describe("Règles de priorité", () => {
  it("à distance égale, l'extrémité (liée, cote associative) l'emporte sur l'intersection confondue", () => {
    const index = indexLineaire([ligne("a", 0, 0, 4, 0), ligne("b", 4, 0, 4, 3)]);
    const r = resoudre(index, { curseur: { x: 4.05, y: 0.05 }, tolerance: 0.2, base: null }, reglages());
    expect(r).toMatchObject({ genre: "extremite", point: { x: 4, y: 0 }, ancre: { objectId: "a", anchor: "end" } });
  });
  it("points exacts : le plus proche du pointeur gagne, quel que soit le mode", () => {
    const index = indexLineaire([ligne("l1", 0, 0, 10, 10), ligne("l2", 0, 10, 10, 0), ligne("l3", 5.3, 5.3, 5.3, 9)]);
    // L'extrémité de l3 (5,3 ; 5,3) est à 0,1 du pointeur ; l'intersection (5 ; 5) à plus de 0,3.
    expect(resoudre(index, { curseur: { x: 5.25, y: 5.22 }, tolerance: 0.5, base: null }, reglages())).toMatchObject({ genre: "extremite", ancre: { objectId: "l3", anchor: "start" } });
    expect(resoudre(index, { curseur: { x: 5.02, y: 5.0 }, tolerance: 0.5, base: null }, reglages())).toMatchObject({ genre: "intersection", point: { x: 5, y: 5 } });
  });
  it("un point exact passe avant la perpendiculaire, qui passe avant le repérage, qui passe avant le plus proche", () => {
    const index = indexLineaire([ligne("h", -5, 0, 5, 0)]);
    const base = { x: 0.1, y: 3 };
    // Le milieu (0 ; 0) est à 0,06 ; le pied de la perpendiculaire (0,1 ; 0) à 0,04 : le milieu, point exact, l'emporte.
    expect(resoudre(index, { curseur: { x: 0.06, y: 0 }, tolerance: 0.2, base }, reglages())).toMatchObject({ genre: "milieu", point: { x: 0, y: 0 } });
    // Loin des points exacts : la perpendiculaire.
    expect(resoudre(index, { curseur: { x: 0.12, y: 0.05 }, tolerance: 0.2, base: { x: 0.1, y: 3 } }, reglages({ modes: new Set<ModeAccrochage>(["perpendiculaire", "proche"]), orthogonal: true }))).toMatchObject({ genre: "perpendiculaire" });
    // Repérage orthogonal avant le plus proche.
    expect(resoudre(index, { curseur: { x: 2.13, y: 0.05 }, tolerance: 0.2, base: { x: 2, y: 3 } }, reglages({ modes: new Set<ModeAccrochage>(["proche"]), orthogonal: true }))).toMatchObject({ genre: "orthogonal", point: { x: 2, y: 0.05 } });
    expect(resoudre(index, { curseur: { x: 2.13, y: 0.05 }, tolerance: 0.2, base: { x: 2, y: 3 } }, reglages({ modes: new Set<ModeAccrochage>(["proche"]) }))).toMatchObject({ genre: "proche", point: { x: 2.13, y: 0 } });
  });
  it("ordre déterministe : mêmes entrées, même liste ; départage par mode puis ordre des objets", () => {
    const objets = [ligne("b", 0, 0, 2, 0), ligne("a", 0, 0, 0, 2)];
    const q = { curseur: { x: 0.01, y: 0.01 }, tolerance: 0.2, base: null };
    const l1 = candidatsObjets(indexLineaire(objets), q, reglages());
    const l2 = candidatsObjets(indexLineaire(objets), q, reglages());
    expect(l1).toEqual(l2);
    // Deux extrémités confondues : celle de l'objet le premier dans le document (b) d'abord, puis l'intersection.
    expect(l1.slice(0, 3).map((c) => [c.genre, c.ancre?.objectId ?? c.objets.join("+")])).toEqual([["extremite", "b"], ["extremite", "a"], ["intersection", "b+a"]]);
    for (let i = 1; i < l1.length; i++) expect(l1[i]!.distance + 1e-9 >= l1[i - 1]!.distance || l1[i]!.genre !== l1[i - 1]!.genre).toBe(true);
  });
  it("bascules : accrochage aux objets coupé, mode coupé, objet exclu", () => {
    // Intersection (5 ; 5), milieux (5,5 ; 5,5) et (5,5 ; 4,5) hors tolérance.
    const index = indexLineaire([ligne("l1", 2, 2, 9, 9), ligne("l2", 2, 8, 9, 1)]);
    const q = { curseur: { x: 5.05, y: 5 }, tolerance: 0.2, base: null };
    expect(resoudre(index, q, reglages())).toMatchObject({ genre: "intersection", point: { x: 5, y: 5 } });
    expect(resoudre(index, q, reglages({ objets: false }))).toBeNull();
    expect(resoudre(index, q, reglages({ modes: new Set<ModeAccrochage>(["extremite", "milieu"]) }))).toBeNull();
    expect(resoudre(index, { ...q, exclure: new Set(["l2"]) }, reglages())?.genre).toBe("proche");
    expect(MODES_PAR_DEFAUT.has("intersection") && !MODES_PAR_DEFAUT.has("proche") && !MODES_PAR_DEFAUT.has("perpendiculaire") && !MODES_PAR_DEFAUT.has("tangente")).toBe(true);
  });
  it("points construits sans sommet nommé : milieu d'un côté de rectangle, quadrant d'un arc, centre d'un renflement", () => {
    const index = indexLineaire([
      { id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 4, height: 2 },
      { id: "a", type: "arc", center: { x: 10, y: 0 }, radius: 2, startAngle: 0, endAngle: Math.PI },
      { id: "p", type: "polyline", points: [{ x: 20, y: 0 }, { x: 24, y: 0 }], closed: false, bulges: [1] },
    ]);
    const r = (x: number, y: number) => resoudre(index, { curseur: { x, y }, tolerance: 0.2, base: null }, reglages());
    expect(r(2.05, 0.03)).toMatchObject({ genre: "milieu", point: { x: 2, y: 0 }, ancre: null });
    expect(r(10.02, 2.03)).toMatchObject({ genre: "milieu", ancre: { anchor: "mid" } });
    expect(r(8.03, 0.02)).toMatchObject({ genre: "extremite" });
    expect(r(22.04, 0.03)).toMatchObject({ genre: "centre", point: { x: 22, y: 0 }, ancre: null });
    expect(r(22.03, -2.04)).toMatchObject({ genre: "milieu", ancre: { objectId: "p", anchor: "mid-0" } });
    // Le quadrant à 270° n'appartient pas à l'arc de 0 à 180° ; pas de quadrant à (10 ; -2).
    expect(r(10.02, -2.02)).toBeNull();
  });
});

describe("Repérage orthogonal et polaire, angle imposé", () => {
  const base = { x: 1, y: 1 };
  it("orthogonal : multiple de 90° le plus proche, longueur au centimètre", () => {
    expect(suivre({ curseur: { x: 4.234, y: 1.4 }, tolerance: 0.1, base }, reglages({ orthogonal: true }))).toMatchObject({ genre: "orthogonal", point: { x: 4.23, y: 1 } });
    expect(suivre({ curseur: { x: 1.3, y: -2 }, tolerance: 0.1, base }, reglages({ orthogonal: true }))).toMatchObject({ genre: "orthogonal", point: { x: 1, y: -2 } });
  });
  it("polaire : engagé à tolérance de la droite, en avant ; pas configurable 15/30/45/90°", () => {
    const r = suivre({ curseur: { x: 3.13, y: 3.07 }, tolerance: 0.1, base }, reglages({ polaire: true, pasPolaire: 45 }));
    expect(r?.genre).toBe("polaire");
    expect(r?.angle).toBe(Math.PI / 4);
    expect(Math.abs(r!.point.x - r!.point.y)).toBeLessThan(1e-9);
    expect(suivre({ curseur: { x: 3.5, y: 2.6 }, tolerance: 0.1, base }, reglages({ polaire: true, pasPolaire: 45 }))).toBeNull();
    const t = suivre({ curseur: { x: 1 + 2 * Math.cos(Math.PI / 6), y: 1 + 2 * Math.sin(Math.PI / 6) + 0.02 }, tolerance: 0.1, base }, reglages({ polaire: true, pasPolaire: 30 }));
    expect(t?.angle).toBeCloseTo(Math.PI / 6, 15);
    expect(libelleRepere(t!)).toBe("Polaire 30°");
    expect(pasPolaireSuivant(15)).toBe(30); expect(pasPolaireSuivant(45)).toBe(90); expect(pasPolaireSuivant(90)).toBe(15);
  });
  it("angle imposé : l'emporte sur l'accrochage aux objets", () => {
    const index = indexLineaire([ligne("l", 0, 3, 6, 3)]);
    const r = resoudre(index, { curseur: { x: 3, y: 3 }, tolerance: 0.3, base: { x: 0, y: 0 }, verrouAngle: 90 }, reglages());
    expect(r).toMatchObject({ genre: "angle", point: { x: 0, y: 3 } });
    expect(libelleRepere(r!)).toBe("Angle imposé 90°");
  });
});

describe("Zone de recherche bornée", () => {
  it("l'index n'est interrogé que sur la vue ∩ tolérance ; rien hors de la vue", () => {
    const formes: StudioShape[] = Array.from({ length: 200 }, (_, i) => ligne(`l${i}`, i, 0, i, 1));
    const base = indexLineaire(formes);
    const zones: unknown[] = [];
    let rendues = 0;
    const espion: IndexAccrochage = { taille: base.taille, formes: (z) => { zones.push(z); const f = base.formes(z); rendues += f.length; return f; } };
    const r = resoudre(espion, { curseur: { x: 50.02, y: 0.03 }, tolerance: 0.1, base: null, vue: { min: { x: 0, y: -1 }, max: { x: 100, y: 2 } } }, reglages());
    expect(r).toMatchObject({ genre: "extremite", ancre: { objectId: "l50", anchor: "start" } });
    expect(zones).toEqual([{ min: { x: 49.92, y: -0.07 }, max: { x: 50.12, y: 0.13 } }].map((z) => ({ min: { x: expect.closeTo(z.min.x, 9), y: expect.closeTo(z.min.y, 9) }, max: { x: expect.closeTo(z.max.x, 9), y: expect.closeTo(z.max.y, 9) } })));
    expect(rendues).toBe(1);
    // Pointeur hors de la vue : aucun candidat.
    expect(candidatsObjets(espion, { curseur: { x: 150, y: 0 }, tolerance: 0.1, base: null, vue: { min: { x: 0, y: -1 }, max: { x: 100, y: 2 } } }, reglages())).toEqual([]);
  });
});

describe("Saisie directe (champ Mesures)", () => {
  it("lecture : longueur, angle, les deux ; virgule décimale ; refus", () => {
    expect(lireMesure("3")).toEqual({ longueur: 3, angle: null });
    expect(lireMesure(" 2,5 ")).toEqual({ longueur: 2.5, angle: null });
    expect(lireMesure("<45")).toEqual({ longueur: null, angle: 45 });
    expect(lireMesure("3<45")).toEqual({ longueur: 3, angle: 45 });
    expect(lireMesure("1.5 < -30")).toEqual({ longueur: 1.5, angle: -30 });
    for (const t of ["", "abc", "0", "<", "3<", "3 4"]) expect(lireMesure(t), t).toBeNull();
  });
  it("point à la longueur saisie dans la direction suivie (polaire 45°) : coordonnées exactes", () => {
    const base = { x: 2, y: 3 };
    const r = appliquerSaisie("3", base, Math.PI / 4, null);
    expect(r).toEqual({ type: "point", point: { x: net(2 + 3 * Math.cos(Math.PI / 4)), y: net(3 + 3 * Math.sin(Math.PI / 4)) } });
    expect(appliquerSaisie("4<90", base, 0, null)).toEqual({ type: "point", point: { x: 2, y: 7 } });
    expect(appliquerSaisie("2", base, 1, 180)).toEqual({ type: "point", point: { x: 0, y: 3 } });
    expect(appliquerSaisie("<30", base, null, null)).toEqual({ type: "angle", angle: 30 });
    expect(appliquerSaisie("3", base, null, null).type).toBe("erreur");
    expect(appliquerSaisie("x", base, 0, null).type).toBe("erreur");
  });
});

describe("Bascules d'accrochage et de repérage", () => {
  it("chaque mode a sa commande ; orthogonal et polaire s'excluent ; le pas tourne", () => {
    let e = BASCULES_INITIALES;
    expect(basculesActives(e)).toMatchObject({ "accrochage-milieu": true, "accrochage-intersection": true, "accrochage-proche": false, "reperage-orthogonal": false, "reperage-polaire": false });
    e = basculerAccrochage(e, "accrochage-proche")!;
    expect(e.modes.has("proche")).toBe(true);
    e = basculerAccrochage(e, "reperage-polaire")!;
    e = basculerAccrochage(e, "reperage-orthogonal")!;
    expect([e.orthogonal, e.polaire]).toEqual([true, false]);
    e = basculerAccrochage(e, "reperage-polaire")!;
    expect([e.orthogonal, e.polaire]).toEqual([false, true]);
    expect(basculerAccrochage(e, "pas-polaire")!.pasPolaire).toBe(90);
    expect(basculerAccrochage(e, "enregistrer")).toBeNull();
    // L'état initial n'est jamais modifié.
    expect(BASCULES_INITIALES.modes.has("proche")).toBe(false);
  });
});
