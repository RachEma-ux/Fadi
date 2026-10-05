import { describe, expect, it } from "vitest";
import { modeleVide, type Occurrence } from "../modele.js";
import { proposerPlancher } from "../plancher.js";
import { m, pt } from "../unites.js";
import { repartirEntier } from "./escaliers.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

describe("escalier à volées et paliers (D-084)", () => {
  it("répartition des contremarches au prorata, au moins une par volée", () => {
    expect(repartirEntier(18, [3, 3])).toEqual([9, 9]);
    expect(repartirEntier(17, [4, 1])).toEqual([13, 4]);
    expect(() => repartirEntier(1, [1, 1])).toThrow(/au moins une/);
  });

  it("escalier en L : deux volées et un palier, hauteurs enchaînées, groupe commun ; inverse exact ; trémie d'un seul tenant", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
      { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3, hauteur: 3 } },
    ], "b")).etat;
    const r = appliquerLot(e, lot([{ type: "escalier.volees", params: { niveauId: "n0", points: [pt(0, 0), pt(4, 0), pt(4, 3)], largeur: m(1), hauteurAFranchir: m(3), contremarches: 18, epaisseurPalier: m(0.2), niveauArriveeId: "n1" } }], "v"));
    const vs = Object.values(r.etat.objets).filter((o) => o.classe === "escalier") as Occurrence<"escalier">[];
    const pal = Object.values(r.etat.objets).filter((o) => o.classe === "dalle") as Occurrence<"dalle">[];
    expect(vs).toHaveLength(2);
    expect(pal).toHaveLength(1);
    vs.sort((a, b) => a.params.decalageBase.value - b.params.decalageBase.value);
    expect(vs[0]!.params.a).toMatchObject({ x: 0, y: 0 });
    expect(vs[0]!.params.b).toMatchObject({ x: 3.5, y: 0 });
    expect(vs[1]!.params.a).toMatchObject({ x: 4, y: 0.5 });
    expect(vs[0]!.params.contremarches! + vs[1]!.params.contremarches!).toBe(18);
    expect(vs[1]!.params.decalageBase.value).toBeCloseTo(vs[0]!.params.hauteurAFranchir.value, 9);
    expect(pal[0]!.params.decalageBase.value + pal[0]!.params.epaisseur.value).toBeCloseTo(vs[0]!.params.hauteurAFranchir.value, 9);
    expect(new Set([...vs, ...pal].map((o) => o.groupeId)).size).toBe(1);
    expect(vs[0]!.params.groupe).toBe(vs[1]!.params.groupe);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    expect(proposerPlancher(r.etat, "n1", "axe").tremiesIsolees).toHaveLength(1);
    expect(() => appliquerLot(e, lot([{ type: "escalier.volees", params: { niveauId: "n0", points: [pt(0, 0), pt(0.52, 0), pt(0.52, 3)], largeur: m(1), hauteurAFranchir: m(3), contremarches: 18, epaisseurPalier: m(0.2) } }]))).toThrow(/trop courte/);
  });
});

describe("escalier hélicoïdal (D-092)", () => {
  it("une marche par contremarche, en secteur d'anneau, hauteurs enchaînées, groupe ; inverse exact ; rayons incohérents refusés", () => {
    const e = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } }], "b")).etat;
    const r = appliquerLot(e, lot([{ type: "escalier.helicoidal", params: { niveauId: "n0", centre: pt(0, 0), rayonInterieur: m(0.1), rayonExterieur: m(1), angleDepart: 0, balayage: 360, hauteurAFranchir: m(2.88), contremarches: 16, epaisseurMarche: m(0.05) } }], "h"));
    const marches = Object.values(r.etat.objets).filter((o) => o.classe === "solide") as Occurrence<"solide">[];
    expect(marches).toHaveLength(16);
    const derniere = marches.reduce((a, b) => (a.params.decalageBase.value > b.params.decalageBase.value ? a : b));
    expect(derniere.params.decalageBase.value + derniere.params.hauteur!.value).toBeCloseTo(2.88, 6);
    expect(new Set(marches.map((x) => x.groupeId)).size).toBe(1);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "escalier.helicoidal", params: { niveauId: "n0", centre: pt(0, 0), rayonInterieur: m(1), rayonExterieur: m(0.5), angleDepart: 0, balayage: 360, hauteurAFranchir: m(3), contremarches: 16, epaisseurMarche: m(0.05) } }]))).toThrow(/rayon/);
  });
});
