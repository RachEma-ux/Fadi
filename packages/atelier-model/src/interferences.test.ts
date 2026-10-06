import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { aireCommune, interferences } from "./interferences.js";
import { collisions } from "./versions.js";
import { modeleVide } from "./modele.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = (x: number, y: number, c: number) => [pt(x, y), pt(x + c, y), pt(x + c, y + c), pt(x, y + c)];

describe("contrôle d'interférence (D-124, DA-03-12)", () => {
  it("aire commune de polygones (concaves compris)", () => {
    expect(aireCommune(carre(0, 0, 2), carre(1, 1, 2))).toBeCloseTo(1, 9);
    const L = [pt(0, 0), pt(3, 0), pt(3, 1), pt(1, 1), pt(1, 3), pt(0, 3)];
    expect(aireCommune(L, carre(0, 0, 3))).toBeCloseTo(5, 9);
    expect(aireCommune(carre(0, 0, 1), carre(1, 0, 1))).toBeCloseTo(0, 9);
  });

  it("solide contre poteau, solide contre mur, deux poteaux ; trou, hauteur décalée et murs entre eux non signalés", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "objet.creer", params: { id: "s", classe: "solide", niveauId: "n", params: { contour: carre(0, 0, 2), trous: [], ferme: true, hauteur: m(1) } } },
      { type: "poteau.creer", params: { id: "p1", niveauId: "n", point: pt(1.9, 1), formeId: "rectangle", largeur: m(0.4), profondeur: m(0.4), hauteur: m(3) } },
      { type: "poteau.creer", params: { id: "p2", niveauId: "n", point: pt(2.2, 1), formeId: "rectangle", largeur: m(0.4), profondeur: m(0.4), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "w1", niveauId: "n", a: pt(-1, 1), b: pt(5, 1), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "n", a: pt(4, -1), b: pt(4, 3), epaisseur: m(0.2), hauteur: m(3) } },
      // Solide percé, un poteau dans le trou ; solide au-dessus d'un autre (aucun volume commun).
      { type: "objet.creer", params: { id: "t", classe: "solide", niveauId: "n", params: { contour: carre(10, 0, 4), trous: [carre(11, 1, 2)], ferme: true, hauteur: m(1) } } },
      { type: "poteau.creer", params: { id: "p3", niveauId: "n", point: pt(12, 2), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
      { type: "objet.creer", params: { id: "u", classe: "solide", niveauId: "n", params: { contour: carre(10, 0, 4), trous: [], ferme: true, hauteur: m(1), decalageBase: m(1) } } },
    ])).etat;
    const paires = interferences(e).map((i) => i.objets.join("+"));
    expect(paires).toContain("p1+s");
    expect(paires).toContain("p1+p2");
    expect(paires).toContain("s+w1");
    expect(paires).not.toContain("w1+w2");
    expect(paires.some((x) => x.includes("p3") && x.includes("t"))).toBe(false);
    expect(paires.some((x) => x.includes("t") && x.includes("u"))).toBe(false);
    expect(paires.some((x) => x.includes("w1") && x.includes("p"))).toBe(false); // poteau noyé dans un mur : voulu
    const v = interferences(e).find((i) => i.objets.join("+") === "p1+s")!.volume;
    expect(v).toBeCloseTo(0.3 * 0.4 * 1, 9); // empreinte commune 0,3 × 0,4 sur 1 m de haut
    expect(collisions(e)).toEqual([]); // contrôle à la demande, hors des collisions permanentes
    expect(interferences(e, { niveauId: "autre" })).toEqual([]);
  });
});
