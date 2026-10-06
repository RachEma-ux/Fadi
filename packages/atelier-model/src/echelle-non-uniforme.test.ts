import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const xy = (q: { x: number; y: number }) => [q.x, q.y];

const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "dalle.creer", params: { id: "d", niveauId: "n", contour: [pt(0, 0), pt(4, 0), pt(4, 2), pt(0, 2)], trous: [], epaisseur: m(0.2) } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(4, 2), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "objet.creer", params: { id: "c", classe: "esquisse", niveauId: "n", params: { forme: "cercle", points: [], ferme: true, centre: pt(2, 2), rayon: m(1), angleDebut: null, angleFin: null, motif: null } } },
    { type: "objet.creer", params: { id: "a", classe: "esquisse", niveauId: "n", params: { forme: "arc", points: [], ferme: false, centre: pt(0, 0), rayon: m(1), angleDebut: { value: 0, unit: "deg" }, angleFin: { value: 90, unit: "deg" }, motif: null } } },
  ])).etat;

const ech = (cibles: string[], fx: number, fy: number) => ({ type: "transformer.echelle", params: { centre: pt(0, 0), facteur: fx, facteurY: fy }, cibles });

describe("échelle non uniforme (D-145, DA-02-05)", () => {
  it("contours et axes : x et y mis à l'échelle séparément, dimensions typées gardées", () => {
    const e = appliquerLot(base(), lot([ech(["d", "w"], 2, 0.5)])).etat;
    const d = e.objets["d"] as Occurrence<"dalle">;
    expect(d.params.contour.map(xy)).toEqual([[0, 0], [8, 0], [8, 1], [0, 1]]);
    expect(d.params.epaisseur).toEqual(m(0.2));
    const w = e.objets["w"] as Occurrence<"mur">;
    expect(xy(w.params.b)).toEqual([8, 1]);
    expect(w.params.epaisseur).toEqual(m(0.2));
  });

  it("cercle → ellipse alignée sur les axes ; facteurY égal : échelle uniforme ordinaire", () => {
    const e = appliquerLot(base(), lot([ech(["c"], 1, 3)])).etat;
    const c = e.objets["c"] as Occurrence<"esquisse">;
    expect(c.params.forme).toBe("ellipse");
    expect([c.params.rayon!.value, c.params.rayonB!.value, c.params.rotation!.value]).toEqual([3, 1, 90]);
    expect(xy(c.params.centre!)).toEqual([2, 6]);
    const u = appliquerLot(base(), lot([ech(["c"], 2, 2)])).etat.objets["c"] as Occurrence<"esquisse">;
    expect([u.params.forme, u.params.rayon!.value]).toEqual(["cercle", 2]);
  });

  it("refus nommés : arc, mur courbe ; tout le lot est refusé", () => {
    expect(() => appliquerLot(base(), lot([ech(["d", "a"], 2, 1)]))).toThrow(/a : arc — échelle non uniforme refusée/);
    const courbe = appliquerLot(base(), lot([{ type: "objet.modifier", params: { id: "w", params: { renflement: 0.3 } } }], "c")).etat;
    expect(() => appliquerLot(courbe, lot([ech(["w"], 2, 1)], "x"))).toThrow(/mur courbe/);
  });
});
