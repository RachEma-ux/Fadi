import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { aireSignee, flecheCorde, hoteOuverture, longueurAxeMur, pointAxeMur, portionAxeMur, projectionSurAxeMur, renflementTroisPoints } from "./geometrie.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { detecterPieces } from "./commandes/organisation.js";
import { proposerPlancher } from "./plancher.js";
import { maillageObjet } from "./projection/maillage.js";
import { quantites } from "./quantites.js";
import { polygoneMurRaccorde } from "./raccords.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const b90 = Math.tan(Math.PI / 8); // quart de cercle
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "c", niveauId: "n", a: pt(4, 0), b: pt(0, 4), renflement: b90, epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "d", niveauId: "n", a: pt(10, 0), b: pt(14, 0), epaisseur: m(0.2), hauteur: m(3) } },
  ])).etat;

describe("murs courbes (D-086)", () => {
  it("renflement par trois points ; longueur d'arc ; contour en anneau d'épaisseur ; quantités", () => {
    expect(renflementTroisPoints(pt(4, 0), pt(0, 4), pt(4 * Math.SQRT1_2, 4 * Math.SQRT1_2))).toBeCloseTo(b90, 9);
    expect(renflementTroisPoints(pt(0, 0), pt(2, 0), pt(1, 0))).toBeNull();
    const e = base();
    const c = e.objets["c"] as Occurrence<"mur">;
    expect(longueurAxeMur(c.params)).toBeCloseTo(2 * Math.PI, 9); // quart de cercle de rayon 4
    const poly = polygoneMurRaccorde(e, c);
    expect(aireSignee(poly)).toBeCloseTo(0.2 * 2 * Math.PI, 2);
    expect(quantites(e).niveaux[0]!.murs.longueurAxe).toBeCloseTo(2 * Math.PI + 4, 3);
    expect(maillageObjet(e, c)).not.toBeNull();
  });

  it("scission et jonction refusées ; miroir inverse l'arc ; IFC et vue produits", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "mur.scinder", params: { id: "c", t: 0.5 } }]))).toThrow(/courbe/);
    // Jonction avec un mur courbe (D-105) : le mur droit est porté sur le cercle de l'arc.
    expect((appliquerLot(e, lot([{ type: "mur.joindre", params: { id: "d", autreId: "c" } }])).etat.objets["d"] as Occurrence<"mur">).params.a).toEqual(pt(4, 0));
    const r = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(1, 0) }, cibles: ["c"] }], "m")).etat;
    expect((r.objets["c"] as Occurrence<"mur">).params.renflement).toBeCloseTo(-b90, 12);
    expect(exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu).toMatch(/IFCWALL/);
    const v = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "n" } }], "v")).etat;
    expect(genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v").primitives.some((p) => (p as { objetId?: string }).objetId === "c")).toBe(true);
  });
});

describe("ouvertures sur un mur courbe (D-095)", () => {
  const r2 = Math.SQRT1_2;
  it("abscisse curviligne : point et tangente, projection, portion d'arc, hôte droit équivalent, flèche", () => {
    const c = (base().objets["c"] as Occurrence<"mur">).params;
    const L = longueurAxeMur(c);
    const mi = pointAxeMur(c, L / 2);
    expect(mi.p.x).toBeCloseTo(4 * r2, 9);
    expect(mi.p.y).toBeCloseTo(4 * r2, 9);
    expect(mi.u.x).toBeCloseTo(-r2, 9);
    expect(mi.u.y).toBeCloseTo(r2, 9);
    const q = projectionSurAxeMur(pt(5, 5), c);
    expect(q.t).toBeCloseTo(0.5, 9);
    expect(q.distance).toBeCloseTo(Math.hypot(5, 5) - 4, 9);
    expect(projectionSurAxeMur(pt(5, -3), c).t).toBe(0);
    const portion = portionAxeMur(c, 0, L / 2);
    expect(longueurAxeMur(portion)).toBeCloseTo(L / 2, 9);
    const h = hoteOuverture(c, 0.5, 1);
    expect(h.position).toBe(0.5);
    expect(Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y)).toBeCloseTo(1, 9);
    expect((h.a.x + h.b.x) / 2).toBeCloseTo(4 * r2, 9);
    expect(flecheCorde(c, 1)).toBeCloseTo(4 - Math.sqrt(16 - 0.25), 9);
    expect(hoteOuverture((base().objets["d"] as Occurrence<"mur">).params, 0.3, 1)).toEqual({ a: pt(10, 0), b: pt(14, 0), position: 0.3 });
  });

  it("fenêtre et porte posées le long de l'arc ; emprise contrôlée sur la longueur d'arc ; mur vidé en 3D ; IFC et plan", () => {
    const e = appliquerLot(base(), lot([
      { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "c", position: 0.5, largeur: m(1.2), hauteur: m(1), allege: m(1) } },
      { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "c", position: 0.15, largeur: m(0.9), hauteur: m(2.1) } },
    ], "o")).etat;
    // 2π ≈ 6,28 m d'arc : 0,9 m à 0,07 dépasse ; 0,9 m à 0,08 tient (la corde, 5,66 m, l'aurait refusée plus tôt).
    expect(() => appliquerLot(e, lot([{ type: "ouverture.poser", params: { classe: "porte", murHoteId: "c", position: 0.07, largeur: m(0.9), hauteur: m(2) } }], "x"))).toThrow(/sort du mur/);
    const mur = maillageObjet(e, e.objets["c"]!)!;
    const zs = new Set<number>();
    for (let i = 2; i < mur.positions.length; i += 3) zs.add(Math.round(mur.positions[i]! * 1000) / 1000);
    expect([...zs].sort()).toEqual([0, 1, 2, 2.1, 3]);
    const fen = maillageObjet(e, e.objets["f"]!)!;
    expect(fen.positions.length).toBeGreaterThan(0);
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu;
    expect(ifc).toMatch(/IFCWINDOW/);
    expect(ifc).toMatch(/IFCDOOR/);
    expect((ifc.match(/IFCRELVOIDSELEMENT/g) ?? []).length).toBe(2);
    const v = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "n" } }], "v")).etat;
    const prims = genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v").primitives;
    expect(prims.some((p) => (p as { objetId?: string }).objetId === "f")).toBe(true);
    expect(prims.some((p) => (p as { objetId?: string }).objetId === "p")).toBe(true);
  });
});

describe("pièces et planchers délimités par un arc (D-096)", () => {
  const demiDisque = () =>
    appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "droit", niveauId: "n", a: pt(-4, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "arc", niveauId: "n", a: pt(4, 0), b: pt(-4, 0), renflement: 1, epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
  const aireCordes = (r: number) => 0.5 * r * r * 36 * Math.sin((5 * Math.PI) / 180);

  it("boucle fermée par un mur droit et un mur en demi-cercle : pièce proposée, contour qui suit l'arc", () => {
    const p = detecterPieces(demiDisque(), "n");
    expect(p).toHaveLength(1);
    expect(p[0]!.murs.sort()).toEqual(["arc", "droit"]);
    expect(p[0]!.aire).toBeCloseTo(aireCordes(4), 6);
    expect(p[0]!.contour.some((q) => Math.abs(q.x) < 1e-9 && Math.abs(q.y - 4) < 1e-9)).toBe(true);
  });

  it("plancher : sur l'axe, et sur la face extérieure (arc élargi d'une demi-épaisseur)", () => {
    const e = demiDisque();
    const axe = proposerPlancher(e, "n", "axe");
    expect(axe.contours).toHaveLength(1);
    expect(axe.contours[0]!.aire).toBeCloseTo(aireCordes(4), 5);
    const ext = proposerPlancher(e, "n", "exterieur").contours[0]!;
    expect(Math.max(...ext.contour.map((q) => q.y))).toBeGreaterThan(4.09);
    expect(Math.min(...ext.contour.map((q) => q.y))).toBeCloseTo(-0.1, 9);
    expect(proposerPlancher(e, "n", "axe").interstices).toEqual([]);
  });
});

describe("raccords avec un mur courbe (D-104)", () => {
  it("angle entre un mur droit et l'extrémité d'un mur courbe : onglet sur la tangente ; 3D et vues suivent", async () => {
    const { raccordMur } = await import("./raccords.js");
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "arc", niveauId: "n", a: pt(4, 0), b: pt(0, 4), renflement: b90, epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "droit", niveauId: "n", a: pt(8, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
    const arc = e.objets["arc"] as Occurrence<"mur">;
    const r = raccordMur(e, arc)!;
    expect(r.extremites).toEqual(["angle", "libre"]);
    expect(r.gauche[0]).toBeCloseTo(-0.1, 9);
    expect(r.droite[0]).toBeCloseTo(0.1, 9);
    const rd = raccordMur(e, e.objets["droit"] as Occurrence<"mur">)!;
    expect(rd.extremites[1]).toBe("angle");
    const poly = polygoneMurRaccorde(e, arc);
    const a = (x: number, y: number) => poly.some((q) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9);
    expect(a(3.9, -0.1)).toBe(true);
    expect(a(4.1, 0.1)).toBe(true);
    expect(polygoneMurRaccorde(e, e.objets["droit"] as Occurrence<"mur">).some((q) => Math.abs(q.x - 3.9) < 1e-9 && Math.abs(q.y + 0.1) < 1e-9)).toBe(true);
    // 3D : le prisme du mur courbe part du point d'onglet.
    const mai = maillageObjet(e, arc)!;
    let trouve = false;
    for (let i = 0; i < mai.positions.length; i += 3) if (Math.abs(mai.positions[i]! - 3.9) < 1e-9 && Math.abs(mai.positions[i + 1]! + 0.1) < 1e-9) trouve = true;
    expect(trouve).toBe(true);
    // Mur droit aligné sur la tangente : prolongement, aucun raccord.
    const al = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "arc", niveauId: "n", a: pt(4, 0), b: pt(0, 4), renflement: b90, epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "droit", niveauId: "n", a: pt(4, -3), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
    expect(raccordMur(al, al.objets["arc"] as Occurrence<"mur">)!.extremites).toEqual(["libre", "libre"]);
  });
});

describe("té sur un mur courbe (D-105)", () => {
  it("mur droit radial aboutissant au milieu de l'arc : arrêté sur la face extérieure de l'arc", async () => {
    const { raccordMur } = await import("./raccords.js");
    const P = 4 * Math.SQRT1_2;
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "arc", niveauId: "n", a: pt(4, 0), b: pt(0, 4), renflement: b90, epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "radial", niveauId: "n", a: pt(6, 6), b: pt(P, P), epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
    const r = raccordMur(e, e.objets["radial"] as Occurrence<"mur">)!;
    expect(r.extremites[1]).toBe("te");
    const attendu = Math.hypot(6, 6) - 4.1;
    expect(r.gauche[1]).toBeCloseTo(attendu, 6);
    expect(r.droite[1]).toBeCloseTo(attendu, 6);
    // Le mur courbe lui-même n'est pas modifié par le té.
    expect(raccordMur(e, e.objets["arc"] as Occurrence<"mur">)!.extremites).toEqual(["libre", "libre"]);
  });
});

describe("jonction d'un mur courbe (D-105)", () => {
  it("le mur courbe glisse sur son cercle jusqu'à l'axe d'un mur droit (renflement recalculé) ; trop loin : refus", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "c", niveauId: "n", a: pt(4, 0), b: pt(0, 4), renflement: b90, epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "h", niveauId: "n", a: pt(-6, 2), b: pt(-5, 2), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "loin", niveauId: "n", a: pt(9, -9), b: pt(9, -8), epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
    const c = appliquerLot(e, lot([{ type: "mur.joindre", params: { id: "c", autreId: "h" } }], "j")).etat.objets["c"] as Occurrence<"mur">;
    expect(c.params.a.x).toBeCloseTo(Math.sqrt(12), 9);
    expect(c.params.a.y).toBeCloseTo(2, 9);
    expect(c.params.b).toEqual(pt(0, 4));
    expect(c.params.renflement).toBeCloseTo(Math.tan(Math.PI / 12), 9);
    expect(longueurAxeMur(c.params)).toBeCloseTo((4 * Math.PI) / 3, 9);
    expect(() => appliquerLot(e, lot([{ type: "mur.joindre", params: { id: "c", autreId: "loin" } }], "x"))).toThrow(/ne se rencontrent pas/);
  });
});
