import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    // Trajet en L : 10 m vers l'est puis 10 m vers le nord.
    { type: "esquisse.polyligne", params: { id: "t", niveauId: "n0", points: [pt(0, 0), pt(10, 0), pt(10, 10)] } },
    { type: "poteau.creer", params: { id: "c", niveauId: "n0", point: pt(0, -2), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
    { type: "esquisse.ligne", params: { id: "l", niveauId: "n0", points: [pt(0, 0), pt(1, 0)] } },
  ])).etat;
const P = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"poteau">).params.point;
const proche = (a: { x: number; y: number }, x: number, y: number) => Math.abs(a.x - x) < 1e-6 && Math.abs(a.y - y) < 1e-6;

describe("réseau suivant une trajectoire et aligner (D-058)", () => {
  it("nombre : copies à intervalles égaux, le point de base posé sur le trajet ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.repeter", params: { trajetId: "t", base: pt(0, -2), nombre: 4 }, cibles: ["c"] }], "a"));
    const copies = r.effets.crees.map((id) => P(r.etat, id));
    expect(copies).toHaveLength(4);
    expect([[5, 0], [10, 0], [10, 5], [10, 10]].every(([x, y], i) => proche(copies[i]!, x!, y!))).toBe(true);
    expect(P(r.etat, "c")).toEqual(pt(0, -2));
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("pas et orientation : la ligne tourne avec la tangente (90° sur la seconde branche)", () => {
    const r = appliquerLot(base(), lot([{ type: "transformer.repeter", params: { trajetId: "t", base: pt(0, 0), pas: 7, orienter: true }, cibles: ["l"] }], "b"));
    const lignes = r.effets.crees.map((id) => (r.etat.objets[id] as Occurrence<"esquisse">).params.points);
    expect(lignes).toHaveLength(2);
    expect(proche(lignes[0]![0]!, 7, 0) && proche(lignes[0]![1]!, 8, 0)).toBe(true);
    expect(proche(lignes[1]![0]!, 10, 4) && proche(lignes[1]![1]!, 10, 5)).toBe(true);
  });

  it("refus : trajet inconnu ou dans la sélection, pas trop long, base absente", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "transformer.repeter", params: { trajetId: "c", base: pt(0, 0), nombre: 2 }, cibles: ["l"] }]))).toThrow(/trajectoire/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.repeter", params: { trajetId: "t", base: pt(0, 0), nombre: 2 }, cibles: ["t"] }]))).toThrow(/sélection/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.repeter", params: { trajetId: "t", base: pt(0, 0), pas: 50 }, cibles: ["l"] }]))).toThrow(/pas plus long/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.repeter", params: { trajetId: "t", nombre: 2 }, cibles: ["l"] }]))).toThrow(/base/);
  });

  it("aligner : deux paires de points, translation puis rotation ; copie au choix", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.aligner", params: { source1: pt(0, 0), source2: pt(1, 0), dest1: pt(5, 5), dest2: pt(5, 9) }, cibles: ["l"] }], "al"));
    const q = (r.etat.objets["l"] as Occurrence<"esquisse">).params.points;
    expect(proche(q[0]!, 5, 5) && proche(q[1]!, 5, 6)).toBe(true);
    const cp = appliquerLot(e, lot([{ type: "transformer.aligner", params: { source1: pt(0, 0), source2: pt(1, 0), dest1: pt(5, 5), dest2: pt(4, 5), copie: true }, cibles: ["l"] }], "cp"));
    expect(cp.effets.crees).toHaveLength(1);
    expect((cp.etat.objets["l"] as Occurrence<"esquisse">).params.points[1]).toEqual(pt(1, 0));
    expect(() => appliquerLot(e, lot([{ type: "transformer.aligner", params: { source1: pt(0, 0), source2: pt(0, 0), dest1: pt(5, 5), dest2: pt(4, 5) }, cibles: ["l"] }]))).toThrow(/confondus/);
  });
});
