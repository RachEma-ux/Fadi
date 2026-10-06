import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { symbolePorte } from "./ouvrants.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (ouvrant: unknown) =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(6, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1.2), hauteur: m(2.1), ouvrant } },
  ])).etat;

describe("portes pliantes et pivotantes (D-152, DA-07-02)", () => {
  it("pliante : panneaux saisis, accordéon replié vers la charnière ; IFC FOLDING", () => {
    expect(() => base({ charniere: "debut", cote: "gauche", type: "pliante" })).toThrow(/panneaux/);
    const e = base({ charniere: "debut", cote: "gauche", type: "pliante", panneaux: 4 });
    const s = symbolePorte(e, e.objets["p"] as Occurrence<"porte">)!;
    expect(s.vantaux[0]).toHaveLength(5);
    const xs = s.vantaux[0]!.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.6, 9); // replié sur la moitié de la baie
    expect(exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu).toMatch(/\.FOLDING_TO_(LEFT|RIGHT)\./);
  });

  it("pivotante : axe à la distance saisie, vantail des deux côtés du mur, deux arcs ; IFC USERDEFINED « PIVOTING »", () => {
    expect(() => base({ charniere: "debut", cote: "gauche", type: "pivotante" })).toThrow(/pivot/);
    expect(() => base({ charniere: "debut", cote: "gauche", type: "pivotante", decalagePivot: m(1.5) })).toThrow(/pivot/);
    const e = base({ charniere: "debut", cote: "gauche", type: "pivotante", decalagePivot: m(0.3) });
    const s = symbolePorte(e, e.objets["p"] as Occurrence<"porte">)!;
    const [a, b] = s.vantaux[0]!;
    expect(Math.hypot(b!.x - a!.x, b!.y - a!.y)).toBeCloseTo(1.2, 9);
    expect(a!.x).toBeCloseTo(2.4 + 0.3, 9);
    expect(Math.sign(a!.y) * Math.sign(b!.y)).toBe(-1); // de part et d'autre du mur
    expect(s.arcs).toHaveLength(2);
    expect(exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu).toMatch(/\.USERDEFINED\.,'PIVOTING'\)/);
  });
});
