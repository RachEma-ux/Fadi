import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { pointsSpline } from "./geometrie.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

describe("tangentes de courbe (D-082)", () => {
  it("sans tangente : courbe inchangée ; tangente imposée : la courbe part dans sa direction et passe par ses points", () => {
    const P = [pt(0, 0), pt(4, 0), pt(8, 0)];
    expect(pointsSpline(P, 8, false, null)).toEqual(pointsSpline(P, 8, false));
    const c = pointsSpline(P, 8, false, [{ x: 0, y: 4 }, null, null]);
    expect(c[0]).toMatchObject({ x: 0, y: 0 });
    expect(c[1]!.y).toBeGreaterThan(0); // part vers le haut
    expect(c[8]).toMatchObject({ x: 4, y: 0 });
    expect(c[c.length - 1]).toMatchObject({ x: 8, y: 0 });
  });

  it("imposée par objet.modifier, tournée avec l'objet, refusée si mal formée ; libérée : clé retirée", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0 } },
      { type: "esquisse.spline", params: { id: "s", niveauId: "n", points: [pt(0, 0), pt(4, 0), pt(8, 0)] } },
    ], "a")).etat;
    const t = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "s", params: { tangentes: [{ x: 1, y: 0 }, null, null] } } }], "t")).etat;
    expect((t.objets["s"] as Occurrence<"esquisse">).params.tangentes).toEqual([{ x: 1, y: 0 }, null, null]);
    const r = appliquerLot(t, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 90, unit: "deg" } }, cibles: ["s"] }], "r")).etat;
    const v = (r.objets["s"] as Occurrence<"esquisse">).params.tangentes![0]!;
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "s", params: { tangentes: [null] } } }]))).toThrow(/une tangente/);
    const l = appliquerLot(t, lot([{ type: "objet.modifier", params: { id: "s", params: { tangentes: null } } }], "l")).etat;
    expect("tangentes" in (l.objets["s"] as Occurrence<"esquisse">).params).toBe(false);
  });
});
