import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { aireSignee, flecheCorde, hoteOuverture, longueurAxeMur, pointAxeMur, portionAxeMur, projectionSurAxeMur, renflementTroisPoints } from "./geometrie.js";
import { modeleVide, type Occurrence } from "./modele.js";
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
    expect(() => appliquerLot(e, lot([{ type: "mur.joindre", params: { id: "d", autreId: "c" } }]))).toThrow(/courbe/);
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
