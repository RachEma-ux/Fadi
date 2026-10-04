import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const ligne = (id: string, a: [number, number], b: [number, number]) => ({ type: "esquisse.ligne", params: { id, niveauId: "n0", points: [pt(...a), pt(...b)] } });
const base = (...cmds: Commande[]): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } }, ...cmds])).etat;
const E = (e: ModeleAtelier, id: string) => e.objets[id] as Occurrence<"esquisse">;

describe("transformations complémentaires (D-043)", () => {
  it("tourner et mettre à l'échelle une copie : l'original reste", () => {
    const e = base(ligne("l", [0, 0], [2, 0]));
    const r = appliquerLot(e, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 90, unit: "deg" }, copie: true }, cibles: ["l"] }], "t"));
    expect(E(r.etat, "l").params.points[1]).toMatchObject({ x: 2, y: 0 });
    const copie = E(r.etat, r.effets.crees[0]!);
    expect(copie.params.points[1]!.x).toBeCloseTo(0, 9);
    expect(copie.params.points[1]!.y).toBeCloseTo(2, 9);
    const s = appliquerLot(e, lot([{ type: "transformer.echelle", params: { centre: pt(0, 0), facteur: 2, copie: true }, cibles: ["l"] }], "s"));
    expect(E(s.etat, s.effets.crees[0]!).params.points[1]).toMatchObject({ x: 4, y: 0 });
  });

  it("copies à pas irréguliers en un lot ; décalage invalide refusé", () => {
    const e = base(ligne("l", [0, 0], [1, 0]));
    const r = appliquerLot(e, lot([{ type: "transformer.copier", params: { vecteurs: [{ dx: 0, dy: 1 }, { dx: 0, dy: 2.5 }, { dx: 3, dy: 0 }] }, cibles: ["l"] }], "c"));
    expect(r.effets.crees).toHaveLength(3);
    expect(r.effets.crees.map((id) => E(r.etat, id).params.points[0]).map((q) => [q!.x, q!.y]).sort()).toEqual([[0, 1], [0, 2.5], [3, 0]]);
    expect(() => appliquerLot(e, lot([{ type: "transformer.copier", params: { vecteurs: [{ dx: "a" }] }, cibles: ["l"] }]))).toThrow(/vecteurs\[0\]/);
  });

  it("prolonger d'une longueur donnée, sans frontière", () => {
    const e = base(ligne("l", [0, 0], [2, 0]));
    const r = appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "l", extremite: "b", longueur: m(1.5) } }], "p"));
    expect(E(r.etat, "l").params.points[1]).toMatchObject({ x: 3.5, y: 0 });
    const a = appliquerLot(e, lot([{ type: "transformer.prolonger", params: { id: "l", extremite: "a", longueur: m(0.5) } }], "q"));
    expect(E(a.etat, "l").params.points[0]).toMatchObject({ x: -0.5, y: 0 });
  });

  it("raccord de rayon nul : jonction d'angle (prolongement et ajustement), sans arc", () => {
    const e = base(ligne("h", [0, 0], [3, 0]), ligne("v", [4, 1], [4, 3]));
    const r = appliquerLot(e, lot([{ type: "transformer.raccorder", params: { id1: "h", id2: "v", rayon: m(0) } }], "r"));
    expect(r.effets.crees).toHaveLength(0);
    expect(E(r.etat, "h").params.points[1]).toMatchObject({ x: 4, y: 0 });
    expect(E(r.etat, "v").params.points[0]).toMatchObject({ x: 4, y: 0 });
  });

  it("scinder un mur en plusieurs points : morceaux successifs, ouvertures réaffectées ; inverse exact", () => {
    const e = base({ type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(10, 0), epaisseur: m(0.2), hauteur: m(3) } }, { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.55, largeur: m(1), hauteur: m(2) } });
    const r = appliquerLot(e, lot([{ type: "mur.scinder", params: { id: "w", positions: [0.8, 0.3] } }], "s"));
    const murs = Object.values(r.etat.objets).filter((o): o is Occurrence<"mur"> => o.classe === "mur").map((o) => [o.params.a.x, o.params.b.x]).sort((x, y) => x[0]! - y[0]!);
    expect(murs.map((x) => x.map((v) => Math.round(v! * 1e6) / 1e6))).toEqual([[0, 3], [3, 8], [8, 10]]);
    const porte = r.etat.objets["p"] as Occurrence<"porte">;
    const hote = r.etat.objets[porte.params.murHoteId] as Occurrence<"mur">;
    expect(hote.params.a.x).toBeCloseTo(3, 9);
    expect(porte.params.position).toBeCloseTo(0.5, 9);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "mur.scinder", params: { id: "w", positions: [1.2] } }]))).toThrow(/positions/);
  });

  it("joindre : lignes jointives (dans le désordre, inversées) → polyligne ; chaîne fermée → polygone ; non jointives refusées", () => {
    const e = base(ligne("a", [0, 0], [1, 0]), ligne("c", [1, 1], [1, 0]), ligne("b", [1, 1], [0, 1]));
    const r = appliquerLot(e, lot([{ type: "transformer.joindre", params: {}, cibles: ["a", "c", "b"] }], "j"));
    expect(E(r.etat, "a").params.forme).toBe("polyligne");
    expect(E(r.etat, "a").params.points.map((q) => [q.x, q.y])).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
    expect(r.etat.objets["b"]).toBeUndefined();
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const f = base(ligne("a", [0, 0], [1, 0]), ligne("b", [1, 0], [1, 1]), ligne("c", [1, 1], [0, 0]));
    const rf = appliquerLot(f, lot([{ type: "transformer.joindre", params: {}, cibles: ["a", "b", "c"] }], "f"));
    expect(E(rf.etat, "a").params).toMatchObject({ forme: "polygone", ferme: true });
    expect(E(rf.etat, "a").params.points).toHaveLength(3);
    const n = base(ligne("a", [0, 0], [1, 0]), ligne("b", [5, 5], [6, 5]));
    expect(() => appliquerLot(n, lot([{ type: "transformer.joindre", params: {}, cibles: ["a", "b"] }]))).toThrow(/jointifs/);
  });
});
