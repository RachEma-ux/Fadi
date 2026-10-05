import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { aireSignee, longueurAxeMur, renflementTroisPoints } from "./geometrie.js";
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

  it("ouverture refusée sur un mur courbe ; scission et jonction refusées ; miroir inverse l'arc ; IFC et vue produits", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "ouverture.poser", params: { classe: "fenetre", murHoteId: "c", position: 0.5, largeur: m(1), hauteur: m(1), allege: m(1) } }]))).toThrow(/mur courbe/);
    expect(() => appliquerLot(e, lot([{ type: "mur.scinder", params: { id: "c", t: 0.5 } }]))).toThrow(/courbe/);
    expect(() => appliquerLot(e, lot([{ type: "mur.joindre", params: { id: "d", autreId: "c" } }]))).toThrow(/courbe/);
    const r = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 0), b: pt(1, 0) }, cibles: ["c"] }], "m")).etat;
    expect((r.objets["c"] as Occurrence<"mur">).params.renflement).toBeCloseTo(-b90, 12);
    expect(exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu).toMatch(/IFCWALL/);
    const v = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "n" } }], "v")).etat;
    expect(genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v").primitives.some((p) => (p as { objetId?: string }).objetId === "c")).toBe(true);
  });
});
