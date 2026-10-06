import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { couperPolygone } from "./ajuster-forme.js";
import { modeleVide, type Occurrence } from "../modele.js";
import { pointsSpline } from "../geometrie.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "objet.creer", params: { id: "lim", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(3, -10), pt(3, 10)], ferme: false } } },
    { type: "objet.creer", params: { id: "d", classe: "dalle", niveauId: "n", params: { contour: [pt(0, 0), pt(6, 0), pt(6, 4), pt(0, 4)], trous: [[pt(0.5, 1), pt(1.5, 1), pt(1.5, 2), pt(0.5, 2)]], epaisseur: m(0.2) } } },
    { type: "objet.creer", params: { id: "r", classe: "esquisse", niveauId: "n", params: { forme: "rectangle", points: [pt(1, 5), pt(5, 7)], ferme: true } } },
    { type: "objet.creer", params: { id: "s", classe: "esquisse", niveauId: "n", params: { forme: "spline", points: [pt(0, 8), pt(2, 9), pt(4, 8), pt(6, 9)], ferme: false } } },
  ])).etat;
const ajuster = (e: ReturnType<typeof base>, params: Record<string, unknown>) => appliquerLot(e, lot([{ type: "transformer.ajuster", params: { limiteId: "lim", ...params } }], "a"));

describe("ajuster des formes fermées et des splines, extrémité imposée (D-117, DA-02-07/08)", () => {
  it("dalle coupée par la droite de la limite, côté gardé désigné ; trou du côté retiré enlevé ; inverse exact", () => {
    const e = base();
    const r = ajuster(e, { id: "d", cote: pt(5, 2) });
    const d = (r.etat.objets["d"] as Occurrence<"dalle">).params;
    expect(d.contour).toEqual([pt(3, 0), pt(6, 0), pt(6, 4), pt(3, 4)]);
    expect(d.trous).toEqual([]);
    const g = (ajuster(e, { id: "d", cote: pt(1, 2) }).etat.objets["d"] as Occurrence<"dalle">).params;
    expect(g.contour).toEqual([pt(0, 0), pt(3, 0), pt(3, 4), pt(0, 4)]);
    expect(g.trous).toHaveLength(1);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("rectangle d'esquisse devenu polygone ; refus : sans côté, limite courbe, forme non coupée, plusieurs morceaux", () => {
    const e = base();
    const r = (ajuster(e, { id: "r", cote: pt(4, 6) }).etat.objets["r"] as Occurrence<"esquisse">).params;
    expect(r.forme).toBe("polygone");
    expect(r.points).toEqual([pt(3, 5), pt(5, 5), pt(5, 7), pt(3, 7)]);
    expect(() => ajuster(e, { id: "r" })).toThrow(/côté à garder/);
    expect(() => ajuster(e, { id: "r", limiteId: "s", cote: pt(4, 6) })).toThrow(/limite doit être droite/);
    const loin = appliquerLot(e, lot([{ type: "objet.creer", params: { id: "lim2", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(20, 0), pt(20, 1)], ferme: false } } }], "l")).etat;
    expect(() => ajuster(loin, { id: "r", limiteId: "lim2", cote: pt(4, 6) })).toThrow(/ne coupe pas/);
    expect(() => ajuster(loin, { id: "r", limiteId: "lim2", cote: pt(30, 6) })).toThrow(/rien ne resterait/);
    // U : la droite y = 1 coupe les deux branches.
    expect(couperPolygone([pt(0, 0), pt(3, 0), pt(3, 3), pt(2, 3), pt(2, 0.5), pt(1, 0.5), pt(1, 3), pt(0, 3)], pt(0, 1), pt(1, 1), 1)).toBe("morceaux");
  });

  it("spline ajustée : points de passage gardés, point de coupe sur la courbe ; prolongée : point ajouté sur la tangente", () => {
    const e = base();
    const s = (ajuster(e, { id: "s" }).etat.objets["s"] as Occurrence<"esquisse">).params;
    // Coupe à x = 3, au milieu de la courbe : trois points de passage restent (deux d'un côté et le point de coupe).
    expect(s.points.length).toBe(3);
    const X = s.points.find((q) => Math.abs(q.x - 3) < 1e-6)!;
    const dense = pointsSpline([pt(0, 8), pt(2, 9), pt(4, 8), pt(6, 9)], 16);
    const proche = Math.min(...dense.map((q) => Math.hypot(q.x - X.x, q.y - X.y)));
    expect(proche).toBeLessThan(0.05);
    const debut = (ajuster(e, { id: "s", extremite: "a" }).etat.objets["s"] as Occurrence<"esquisse">).params.points;
    expect(debut[0]!.x).toBeCloseTo(3, 6);
    expect(debut.slice(1)).toEqual([pt(4, 8), pt(6, 9)]);
    const fin = (ajuster(e, { id: "s", extremite: "b" }).etat.objets["s"] as Occurrence<"esquisse">).params.points;
    expect(fin.slice(0, 2)).toEqual([pt(0, 8), pt(2, 9)]);
    // Prolonger jusqu'à une ligne verticale x = 8 : un point ajouté au bout (extrémité b).
    const p = appliquerLot(e, lot([
      { type: "objet.creer", params: { id: "l8", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(8, -20), pt(8, 20)], ferme: false } } },
      { type: "transformer.prolonger", params: { id: "s", limiteId: "l8" } },
    ], "p")).etat;
    const pts = (p.objets["s"] as Occurrence<"esquisse">).params.points;
    expect(pts).toHaveLength(5);
    expect(pts[4]!.x).toBeCloseTo(8, 9);
  });

  it("extrémité imposée : ligne prolongée par l'extrémité désignée, même si l'autre est plus proche", () => {
    const e = appliquerLot(base(), lot([
      { type: "objet.creer", params: { id: "pl", classe: "esquisse", niveauId: "n", params: { forme: "polyligne", points: [pt(-4, -2), pt(-2, -2), pt(-2, -3)], ferme: false } } },
    ], "pl")).etat;
    // La limite x = 3 n'est atteinte ni par a (vers −x) ni par b (vers −y).
    expect(() => appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "pl", limiteId: "lim" } }], "x"))).toThrow(/n'est pas atteinte/);
    const w = appliquerLot(e, lot([
      { type: "objet.creer", params: { id: "h", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(-10, -6), pt(10, -6)], ferme: false } } },
      { type: "transformer.prolonger", params: { id: "pl", limiteId: "h", extremite: "b" } },
    ], "y")).etat;
    expect((w.objets["pl"] as Occurrence<"esquisse">).params.points.at(-1)).toEqual(pt(-2, -6));
    expect(() => appliquerLot(e, lot([
      { type: "objet.creer", params: { id: "h", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(-10, -6), pt(10, -6)], ferme: false } } },
      { type: "transformer.prolonger", params: { id: "pl", limiteId: "h", extremite: "a" } },
    ], "z"))).toThrow(/extrémité a/);
  });
});
