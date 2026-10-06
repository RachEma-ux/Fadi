import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { modeleVide, objetsDeClasse, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "esquisse.cercle", params: { id: "c", niveauId: "n", centre: pt(2, 3), rayon: m(1) } },
    { type: "esquisse.axesCentre", params: { id: "c", debord: 0.2 } },
  ])).etat;
const axes = (e: ReturnType<typeof base>) => objetsDeClasse(e, "esquisse").filter((o) => o.params.axeDe) as Occurrence<"esquisse">[];

describe("axes associés au centre d'un cercle (D-132, DA-01-10)", () => {
  it("deux axes créés, débord compris ; ils suivent le cercle déplacé et agrandi ; source supprimée : lien perdu", () => {
    const e = base();
    const [h, v] = axes(e);
    expect(h!.params.points).toEqual([pt(0.8, 3), pt(3.2, 3)]);
    expect(v!.params.points[0]!.x).toBeCloseTo(2, 9);
    expect(v!.params.points[1]!.y).toBeCloseTo(4.2, 9);
    const d = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 5, dy: 0 }, cibles: ["c"] }, { type: "objet.modifier", params: { id: "c", params: { rayon: m(2) } } }], "d")).etat;
    expect(axes(d)[0]!.params.points).toEqual([pt(4.8, 3), pt(9.2, 3)]);
    const s = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "c" } }], "s")).etat;
    expect(objetsDeClasse(s, "esquisse").every((o) => !o.params.axeDe)).toBe(true);
    expect(objetsDeClasse(s, "esquisse")).toHaveLength(2);
  });

  it("ellipse : axes selon ses axes propres ; refus hors cercle, arc, ellipse", () => {
    const e = appliquerLot(base(), lot([
      { type: "objet.creer", params: { id: "el", classe: "esquisse", niveauId: "n", params: { forme: "ellipse", centre: pt(0, 0), rayon: m(3), rayonB: m(1), rotation: { value: 90, unit: "deg" }, points: [], ferme: true } } },
      { type: "esquisse.axesCentre", params: { id: "el", debord: 0 } },
    ], "e")).etat;
    const ax = axes(e).filter((o) => o.params.axeDe!.sourceId === "el");
    expect(ax[0]!.params.points[1]!.y).toBeCloseTo(3, 9); // grand axe vertical
    expect(ax[1]!.params.points[1]!.x).toBeCloseTo(-1, 9);
    expect(() => appliquerLot(e, lot([{ type: "objet.creer", params: { id: "l", classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(0, 0), pt(1, 0)], ferme: false } } }, { type: "esquisse.axesCentre", params: { id: "l", debord: 0.1 } }], "x"))).toThrow(/cercle, arc ou ellipse/);
  });
});
