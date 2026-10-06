import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { diagnosticContraintes } from "../contraintes.js";
import { modeleVide, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w1", niveauId: "n", a: pt(0, 0), b: pt(6, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "w2", niveauId: "n", a: pt(8, 1), b: pt(9, 5), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "w2", position: 0.5, largeur: m(1), hauteur: m(1), allege: m(1) } },
    { type: "objet.creer", params: { id: "l", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(0, 3), pt(6, 4)], ferme: false } } },
  ])).etat;

describe("contraintes avec des murs (D-129, DA-01-07)", () => {
  it("mur perpendiculaire à un autre, longueur pilotée, extrémité coïncidente ; ouverture suivie ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([
      { type: "contrainte.ajouter", params: { type: "perpendiculaire", objetA: "w1", a: "segment[0]", objetB: "w2", b: "segment[0]" } },
      { type: "contrainte.ajouter", params: { type: "distance", objetA: "w2", a: "segment[0]", valeur: m(3) } },
      { type: "contrainte.ajouter", params: { type: "coincidence", objetA: "w1", a: "sommet[1]", objetB: "w2", b: "sommet[0]" } },
    ], "c"));
    const w1 = r.etat.objets["w1"] as Occurrence<"mur">;
    const w2 = r.etat.objets["w2"] as Occurrence<"mur">;
    const d1 = { x: w1.params.b.x - w1.params.a.x, y: w1.params.b.y - w1.params.a.y };
    const d2 = { x: w2.params.b.x - w2.params.a.x, y: w2.params.b.y - w2.params.a.y };
    expect(Math.abs(d1.x * d2.x + d1.y * d2.y)).toBeLessThan(1e-5);
    expect(Math.hypot(d2.x, d2.y)).toBeCloseTo(3, 5);
    expect(Math.hypot(w1.params.b.x - w2.params.a.x, w1.params.b.y - w2.params.a.y)).toBeLessThan(1e-5);
    expect((r.etat.objets["f"] as Occurrence<"fenetre">).params.position).toBe(0.5);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(diagnosticContraintes(r.etat, ["w1", "w2"]).contraintes).toBe(3);
  });

  it("ligne d'esquisse parallèle à un mur ; un mur déplacé ensuite reste contraint ; mur courbe refusé", () => {
    const e = appliquerLot(base(), lot([{ type: "contrainte.ajouter", params: { type: "parallele", objetA: "w1", a: "segment[0]", objetB: "l", b: "segment[0]" } }], "p")).etat;
    const l = (e.objets["l"] as Occurrence<"esquisse">).params.points;
    const w = e.objets["w1"] as Occurrence<"mur">;
    const cr = (w.params.b.x - w.params.a.x) * (l[1]!.y - l[0]!.y) - (w.params.b.y - w.params.a.y) * (l[1]!.x - l[0]!.x);
    expect(Math.abs(cr)).toBeLessThan(1e-4);
    // Étirer le mur en le tournant violerait le parallélisme : transformation rigide refusée.
    expect(() => appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 10, unit: "deg" } }, cibles: ["w1"] }], "t"))).toThrow(/violerait les contraintes/);
    const c = appliquerLot(e, lot([{ type: "mur.tracer", params: { id: "wc", niveauId: "n", a: pt(20, 0), b: pt(24, 0), epaisseur: m(0.2), hauteur: m(3), renflement: 0.3 } }], "wc")).etat;
    expect(() => appliquerLot(c, lot([{ type: "contrainte.ajouter", params: { type: "horizontal", objetA: "wc", a: "segment[0]" } }], "h"))).toThrow(/mur courbe/);
  });
});
