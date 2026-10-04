import { describe, expect, it } from "vitest";
import { diagnosticContraintes, ecartContraintes } from "../contraintes.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande, type Enveloppe } from "./index.js";

const lot = (commands: Commande[], requestId = "r"): Enveloppe => ({ requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "test", commands });
const ligne = (id: string, ax: number, ay: number, bx: number, by: number): Commande => ({ type: "esquisse.ligne", params: { id, niveauId: "rdc", points: [pt(ax, ay), pt(bx, by)] } });
const c = (id: string, type: string, objetA: string, a: string, objetB?: string, b?: string, extra: Record<string, unknown> = {}): Commande => ({ type: "contrainte.ajouter", params: { id, type, objetA, a, objetB, b, ...extra } });
const P = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params.points.map((p) => [p.x, p.y] as [number, number]);
const L = (e: ModeleAtelier, id: string) => {
  const [a, b] = P(e, id);
  return Math.hypot(b![0] - a![0], b![1] - a![1]);
};

function socle(): ModeleAtelier {
  return appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } },
    ligne("A", 0, 0, 4, 0),
    ligne("B", 0, 2, 2.5, 2.2),
    ligne("C", 1.7, 1, 3, 3),
    { type: "esquisse.polyligne", params: { id: "Q", niveauId: "rdc", points: [pt(0, 5), pt(2, 5.1), pt(4, 5.3)] } },
  ], "socle")).etat;
}

describe("contraintes supplémentaires (D-051)", () => {
  it("longueurs égales : les deux segments prennent la même longueur ; inverse exact", () => {
    const e = socle();
    const r = appliquerLot(e, lot([c("k", "egalite", "A", "segment[0]", "B", "segment[0]")]));
    expect(L(r.etat, "A")).toBeCloseTo(L(r.etat, "B"), 5);
    expect(ecartContraintes(r.etat)).toBeLessThan(5e-6);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    // Écart résiduel de l'arrondi au micromètre : un déplacement rigide qui garde les longueurs reste permis.
    expect(() => appliquerLot(r.etat, lot([{ type: "transformer.deplacer", params: { dx: 1.234567, dy: 0.5 }, cibles: ["A"] }], "d"))).not.toThrow();
  });

  it("au milieu : le sommet rejoint le milieu du segment ; extrémité du même segment refusée", () => {
    const r = appliquerLot(socle(), lot([c("k", "milieu", "C", "sommet[0]", "A", "segment[0]")])).etat;
    const [a, b] = P(r, "A");
    const [m0] = P(r, "C");
    expect(m0![0]).toBeCloseTo((a![0] + b![0]) / 2, 6);
    expect(m0![1]).toBeCloseTo((a![1] + b![1]) / 2, 6);
    expect(() => appliquerLot(socle(), lot([c("k", "milieu", "Q", "sommet[1]", "Q", "segment[0]")]))).toThrow(/extrémité/);
    // Sommet intermédiaire d'une polyligne amené au milieu d'une autre esquisse.
    const q = appliquerLot(socle(), lot([c("k", "milieu", "Q", "sommet[1]", "A", "segment[0]")])).etat;
    expect(P(q, "Q")[1]![1]).toBeCloseTo(P(q, "A")[0]![1], 6);
  });

  it("sur la ligne : le sommet est porté par la droite du segment (n'importe où)", () => {
    const r = appliquerLot(socle(), lot([c("k", "sur-ligne", "C", "sommet[0]", "A", "segment[0]")])).etat;
    const [a, b] = P(r, "A");
    const [p] = P(r, "C");
    const croix = (b![0] - a![0]) * (p![1] - a![1]) - (b![1] - a![1]) * (p![0] - a![0]);
    expect(Math.abs(croix)).toBeLessThan(1e-6);
  });

  it("fixe : le sommet est tenu ; un geste qui le déplace est refusé, le reste suit les autres contraintes", () => {
    const e = appliquerLot(socle(), lot([c("f", "fixe", "A", "sommet[0]"), c("h", "horizontal", "A", "segment[0]")])).etat;
    expect(P(e, "A")[0]).toEqual([0, 0]);
    expect(diagnosticContraintes(e, ["A"]).degresDeLiberte).toBe(1);
    expect(() => appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["A"] }], "d"))).toThrow(/violerait/);
    // Position explicite : le sommet y est amené.
    const g = appliquerLot(socle(), lot([c("f", "fixe", "B", "sommet[1]", undefined, undefined, { position: { x: 3, y: 2 } })])).etat;
    expect(P(g, "B")[1]).toEqual([3, 2]);
  });

  it("symétriques : deux sommets se répondent par rapport à un axe ; sommets confondus ou sur l'axe refusés", () => {
    const e = appliquerLot(socle(), lot([
      ligne("X", 2, -1, 2, 4),
      c("f1", "fixe", "X", "sommet[0]"),
      c("f2", "fixe", "X", "sommet[1]"),
    ], "axe")).etat;
    const r = appliquerLot(e, lot([c("s", "symetrie", "X", "segment[0]", "B", "sommet[0]", { c: "sommet[1]" })]));
    const [p, q] = P(r.etat, "B");
    expect((p![0] + q![0]) / 2).toBeCloseTo(2, 6);
    expect(p![1]).toBeCloseTo(q![1], 6);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([c("s", "symetrie", "X", "segment[0]", "B", "sommet[0]", { c: "sommet[0]" })]))).toThrow(/distincts/);
    expect(() => appliquerLot(e, lot([c("s", "symetrie", "Q", "segment[0]", "Q", "sommet[1]", { c: "sommet[2]" })]))).toThrow(/axe/);
    expect(() => appliquerLot(e, lot([c("s", "symetrie", "X", "segment[0]", "B", "sommet[0]")]))).toThrow(/« c »|c/);
  });

  it("angle : orienté de a vers b, ramené modulo 180° ; modifiable ; 90° équivaut à perpendiculaires", () => {
    const e = appliquerLot(socle(), lot([c("f", "fixe", "A", "sommet[0]"), c("h", "horizontal", "A", "segment[0]"), c("f2", "fixe", "C", "sommet[0]")], "base")).etat;
    const r = appliquerLot(e, lot([c("k", "angle", "A", "segment[0]", "C", "segment[0]", { angle: { value: 210, unit: "deg" } })])).etat;
    const k = r.relations["k"]!.params as { angle: { value: number } };
    expect(k.angle.value).toBeCloseTo(30, 9);
    const [a, b] = P(r, "C");
    expect((Math.atan2(b![1] - a![1], b![0] - a![0]) * 180) / Math.PI % 180).toBeCloseTo(30, 3);
    const m = appliquerLot(r, lot([{ type: "contrainte.modifier", params: { id: "k", angle: { value: 60, unit: "deg" } } }], "m")).etat;
    const [a2, b2] = P(m, "C");
    expect((Math.atan2(b2![1] - a2![1], b2![0] - a2![0]) * 180) / Math.PI).toBeCloseTo(60, 3);
    expect(() => appliquerLot(e, lot([c("k", "angle", "A", "segment[0]", "C", "segment[0]")]))).toThrow(/angle/);
    expect(() => appliquerLot(e, lot([c("k", "angle", "A", "segment[0]", "C", "segment[0]", { angle: { value: 90, unit: "m" } })]))).toThrow(/degrés/);
  });
});
