import { describe, expect, it } from "vitest";
import { decalerContour } from "../geometrie.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)];
const base = (...c: Commande[]): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }, ...c])).etat;

describe("dessin complémentaire (D-049)", () => {
  it("décalage d'un contour fermé : extérieur, intérieur, rétréci jusqu'à disparaître → null", () => {
    expect(decalerContour(carre, 1)!.map((q) => [q.x, q.y])).toEqual([[-1, -1], [5, -1], [5, 5], [-1, 5]]);
    expect(decalerContour([...carre].reverse(), -1)!.map((q) => [q.x, q.y]).sort()).toEqual([[1, 1], [1, 3], [3, 1], [3, 3]]);
    expect(decalerContour(carre, -2.5)).toBeNull();
  });

  it("décaler une dalle et un polygone en série de distances ; côté incompatible refusé", () => {
    const e = base({ type: "dalle.creer", params: { id: "d", niveauId: "n0", contour: carre, trous: [], epaisseur: m(0.2) } }, { type: "esquisse.polygone", params: { id: "p", niveauId: "n0", points: carre, ferme: true } });
    const r = appliquerLot(e, lot([{ type: "transformer.decaler", params: { distances: [0.5, 1], cote: "interieur" }, cibles: ["d", "p"] }], "d"));
    expect(r.effets.crees).toHaveLength(4);
    const dalles = Object.values(r.etat.objets).filter((o): o is Occurrence<"dalle"> => o.classe === "dalle" && o.id !== "d");
    expect(dalles.map((o) => o.params.contour[0]).map((q) => [q!.x, q!.y]).sort()).toEqual([[0.5, 0.5], [1, 1]]);
    expect(() => appliquerLot(e, lot([{ type: "transformer.decaler", params: { distance: m(1), cote: "gauche" }, cibles: ["d"] }]))).toThrow(/extérieur ou intérieur/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.decaler", params: { distance: m(3), cote: "interieur" }, cibles: ["d"] }]))).toThrow(/impossible/);
  });

  it("chanfrein d'un sommet : le polygone garde sa classe ; distance trop longue refusée", () => {
    const e = base({ type: "esquisse.polygone", params: { id: "p", niveauId: "n0", points: carre, ferme: true } });
    const r = appliquerLot(e, lot([{ type: "transformer.chanfreinerSommet", params: { id: "p", index: 2, distance: m(1) } }], "c")).etat;
    const q = (r.objets["p"] as Occurrence<"esquisse">).params;
    expect(q.forme).toBe("polygone");
    expect(q.points.map((v) => [v.x, v.y])).toEqual([[0, 0], [4, 0], [4, 3], [3, 4], [0, 4]]);
    expect(() => appliquerLot(e, lot([{ type: "transformer.chanfreinerSommet", params: { id: "p", index: 0, distance: m(5) } }]))).toThrow(/plus longue/);
  });

  it("sommet commun : déplacer un sommet entraîne les sommets confondus et l'extrémité d'un mur ; inverse exact", () => {
    const e = base(
      { type: "esquisse.polygone", params: { id: "p", niveauId: "n0", points: carre, ferme: true } },
      { type: "zone.creer", params: { id: "z", niveauId: "n0", contour: [pt(4, 0), pt(8, 0), pt(8, 4), pt(4, 4)], trous: [], nom: "Z" } },
      { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(4, 4), b: pt(4, 10), epaisseur: m(0.2), hauteur: m(3) } },
    );
    const r = appliquerLot(e, lot([{ type: "transformer.pointsDeControle", params: { id: "p", index: 2, point: pt(5, 5), entrainer: true } }], "s"));
    expect((r.etat.objets["p"] as Occurrence<"esquisse">).params.points[2]).toMatchObject({ x: 5, y: 5 });
    expect((r.etat.objets["z"] as Occurrence<"zone">).params.contour[3]).toMatchObject({ x: 5, y: 5 });
    expect((r.etat.objets["w"] as Occurrence<"mur">).params.a).toMatchObject({ x: 5, y: 5 });
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });
});
