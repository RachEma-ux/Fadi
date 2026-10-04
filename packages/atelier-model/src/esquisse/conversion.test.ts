import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { distance, pointsSpline, projectionSurSegment } from "../geometrie.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { deg, m, pt } from "../unites.js";
import { ajusterSpline } from "./conversion.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "esquisse.polyligne", params: { id: "poly", niveauId: "n0", points: Array.from({ length: 21 }, (_, i) => pt(i * 0.5, Math.sin(i * 0.3) * 2)) } },
    { type: "esquisse.polygone", params: { id: "pg", niveauId: "n0", points: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)] } },
    { type: "esquisse.arc", params: { id: "arc", niveauId: "n0", centre: pt(0, 0), rayon: m(2), angleDebut: deg(0), angleFin: deg(90) } },
    { type: "esquisse.cercle", params: { id: "cercle", niveauId: "n0", centre: pt(10, 0), rayon: m(1) } },
  ])).etat;
const E = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params;

describe("conversion d'esquisses (D-054)", () => {
  it("polyligne → spline par tous les sommets ; inverse exact ; puis spline → polyligne par 8 segments par travée", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "esquisse.convertir", params: { id: "poly", forme: "spline" } }], "s"));
    expect(E(r.etat, "poly")).toMatchObject({ forme: "spline", ferme: false });
    expect(E(r.etat, "poly").points).toEqual(E(e, "poly").points);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const p = appliquerLot(r.etat, lot([{ type: "esquisse.convertir", params: { id: "poly", forme: "polyligne", segments: 8 } }], "p")).etat;
    expect(E(p, "poly").forme).toBe("polyligne");
    expect(E(p, "poly").points).toHaveLength(20 * 8 + 1);
  });

  it("ajustement à une tolérance : moins de sommets, chaque sommet d'origine à moins de la tolérance de la courbe", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "esquisse.convertir", params: { id: "poly", forme: "spline", tolerance: 0.02 } }], "a")).etat;
    const gardes = E(r, "poly").points;
    expect(gardes.length).toBeLessThan(21);
    expect(gardes[0]).toEqual(E(e, "poly").points[0]);
    const courbe = pointsSpline(gardes, 32, false);
    for (const q of E(e, "poly").points) {
      const d = Math.min(...courbe.slice(1).map((b, i) => projectionSurSegment(q, courbe[i]!, b).distance));
      expect(d).toBeLessThan(0.02 + 1e-3);
    }
    expect(ajusterSpline(E(e, "poly").points, false, 0.02).ecart).toBeLessThanOrEqual(0.02);
  });

  it("polygone → spline fermée ; arc → polyligne ouverte ; cercle → polyligne fermée sans sommet répété", () => {
    const e = base();
    const r = appliquerLot(e, lot([
      { type: "esquisse.convertir", params: { id: "pg", forme: "spline" } },
      { type: "esquisse.convertir", params: { id: "arc", forme: "polyligne", segments: 6 } },
      { type: "esquisse.convertir", params: { id: "cercle", forme: "polyligne", segments: 12 } },
    ], "c")).etat;
    expect(E(r, "pg")).toMatchObject({ forme: "spline", ferme: true });
    const arc = E(r, "arc");
    expect(arc).toMatchObject({ forme: "polyligne", ferme: false, centre: null, rayon: null });
    expect(arc.points).toHaveLength(7);
    expect(arc.points[6]!.x).toBeCloseTo(0, 6);
    expect(arc.points[6]!.y).toBeCloseTo(2, 6);
    const c = E(r, "cercle");
    expect(c).toMatchObject({ forme: "polyligne", ferme: true });
    expect(c.points).toHaveLength(12);
    expect(c.points.every((q) => Math.abs(distance(q, pt(10, 0)) - 1) < 1e-5)).toBe(true);
  });

  it("refus : forme incompatible, segments absents, esquisse contrainte", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "esquisse.convertir", params: { id: "arc", forme: "spline" } }]))).toThrow(/ne devient pas une spline/);
    expect(() => appliquerLot(e, lot([{ type: "esquisse.convertir", params: { id: "pg", forme: "polyligne", segments: 4 } }]))).toThrow(/déjà faite de segments/);
    expect(() => appliquerLot(e, lot([{ type: "esquisse.convertir", params: { id: "arc", forme: "polyligne" } }]))).toThrow(/segments/);
    const k = appliquerLot(e, lot([{ type: "contrainte.ajouter", params: { type: "horizontal", objetA: "pg", a: "segment[0]" } }], "k")).etat;
    expect(() => appliquerLot(k, lot([{ type: "esquisse.convertir", params: { id: "pg", forme: "spline" } }]))).toThrow(/contraintes/);
  });
});
