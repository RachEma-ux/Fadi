import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const deg = (value: number) => ({ value, unit: "deg" as const });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "dalle.creer", params: { id: "d", niveauId: "n", contour: [pt(0, 0), pt(4, 0), pt(4, 2), pt(0, 2)], trous: [], epaisseur: m(0.2), pente: { angle: deg(45), direction: deg(0) } } },
  ])).etat;

describe("dalles inclinées (D-140, DA-07-06)", () => {
  it("dessous au point bas à la hauteur de base, montée selon la pente ; épaisseur verticale gardée", () => {
    const e = base();
    const ma = maillageObjet(e, e.objets["d"]!)!;
    const pts: [number, number, number][] = [];
    for (let i = 0; i < ma.positions.length; i += 3) pts.push([ma.positions[i]!, ma.positions[i + 1]!, ma.positions[i + 2]!]);
    const z = (x: number, haut: boolean) => pts.filter((q) => Math.abs(q[0] - x) < 1e-9).map((q) => q[2]).sort((a, b) => a - b)[haut ? pts.filter((q) => Math.abs(q[0] - x) < 1e-9).length - 1 : 0];
    expect(z(0, false)).toBeCloseTo(0, 9);
    expect(z(4, false)).toBeCloseTo(4, 9); // 45° sur 4 m
    expect(z(4, true)).toBeCloseTo(4.2, 9);
  });

  it("saisie validée, retirée par null ; direction tournée avec la dalle ; IFC en tessellation", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "d", params: { pente: { angle: deg(75), direction: deg(0) } } } }], "x"))).toThrow(/60°/);
    expect((appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "d", params: { pente: null } } }], "y")).etat.objets["d"] as Occurrence<"dalle">).params.pente).toBeUndefined();
    const t = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: deg(90) }, cibles: ["d"] }], "t")).etat;
    expect((t.objets["d"] as Occurrence<"dalle">).params.pente!.direction.value).toBe(90);
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" });
    expect(ifc.contenu).toMatch(/IFCTRIANGULATEDFACESET/);
  });
});
