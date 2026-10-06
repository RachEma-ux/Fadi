import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { marchesBalancees } from "./escalier-balance.js";
import { aireSignee } from "../geometrie.js";
import { modeleVide, objetsDeClasse } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
// Quart tournant à gauche : 3 m vers +x puis 3 m vers +y, largeur 1 m.
const axe = [pt(0, 0), pt(3, 0), pt(3, 3)];

describe("escalier balancé (D-123, DA-07-10)", () => {
  it("girons égaux sur la ligne de foulée, marches droites hors du tournant, aire totale = emprise", () => {
    const c = marchesBalancees(axe, 1, 12, 0.5, 4);
    expect(c).toHaveLength(12);
    // Emprise de l'escalier : deux bandes 1 × 3,5 qui se recouvrent sur 1 × 1 → 6 m² (axe de 6 m, onglet).
    const aire = c.reduce((s, q) => s + Math.abs(aireSignee(q)), 0);
    expect(aire).toBeCloseTo(6, 6);
    // Première marche : rectangle droit de 0,5 m de giron (6 m / 12 sur la ligne de foulée au milieu).
    const xs = c[0]!.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.5, 6);
    expect(c.every((q) => aireSignee(q) > 0)).toBe(true);
    // Marches balancées : plus étroites au limon intérieur qu'à l'extérieur.
    const dansTournant = c.slice(4, 8);
    expect(dansTournant.every((q) => q.length >= 4)).toBe(true);
  });

  it("commande : une marche par contremarche dans un groupe ; refus motivés", () => {
    const e = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } }])).etat;
    const params = { niveauId: "n", points: axe, largeur: m(1), hauteurAFranchir: m(2.8), contremarches: 14, epaisseurMarche: m(0.05), ligneFoulee: m(0.5), marchesBalancees: 4 };
    const r = appliquerLot(e, lot([{ type: "escalier.balance", params }], "b")).etat;
    const marches = objetsDeClasse(r, "solide");
    expect(marches).toHaveLength(14);
    expect(marches.every((s) => s.params.role === "marche-balancee")).toBe(true);
    expect(Math.max(...marches.map((s) => s.params.decalageBase.value + (s.params.hauteur?.value ?? 0)))).toBeCloseTo(2.8, 6);
    expect(Object.values(r.groupes)).toHaveLength(1);
    expect(() => appliquerLot(e, lot([{ type: "escalier.balance", params: { ...params, ligneFoulee: m(1.2) } }], "x"))).toThrow(/ligne de foulée/);
    expect(() => appliquerLot(e, lot([{ type: "escalier.balance", params: { ...params, points: [pt(0, 0), pt(3, 0), pt(3, 3), pt(6, 3)] } }], "y"))).toThrow(/même côté/);
    expect(() => appliquerLot(e, lot([{ type: "escalier.balance", params: { ...params, marchesBalancees: 20 } }], "z"))).toThrow(/dépassent/);
  });
});
