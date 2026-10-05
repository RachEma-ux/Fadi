import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { decalerArrondi, pointsPolyligne } from "../geometrie.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "esquisse.rectangle", params: { id: "rect", niveauId: "n0", points: [pt(0, 0), pt(4, 3)] } },
    { type: "esquisse.polyligne", params: { id: "pl", niveauId: "n0", points: [pt(0, 0), pt(4, 0), pt(4, 4)] } },
    { type: "esquisse.hachure", params: { id: "h", niveauId: "n0", points: [pt(10, 0), pt(12, 0), pt(12, 2)], motif: "beton" } },
  ])).etat;
const E = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params;

describe("décalage à angles arrondis, chanfrein multiple, décomposer une hachure (D-064)", () => {
  it("géométrie : polyligne en L décalée à droite (extérieur du virage à gauche) → arc de rayon d au sommet", () => {
    const r = decalerArrondi([pt(0, 0), pt(4, 0), pt(4, 4)], false, -1)!;
    expect(r.points).toEqual([pt(0, -1), pt(4, -1), pt(5, 0), pt(5, 4)]);
    expect(r.renflements).toEqual([0, Math.round(Math.tan(Math.PI / 8) * 1e12) / 1e12, 0]);
    // Côté intérieur : angle vif (intersection).
    expect(decalerArrondi([pt(0, 0), pt(4, 0), pt(4, 4)], false, 1)!.points).toEqual([pt(0, 1), pt(3, 1), pt(3, 4)]);
  });

  it("rectangle décalé vers l'extérieur, angles arrondis : polyligne fermée, 4 arcs ; vers l'intérieur : angles vifs, aucun arc", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.decaler", params: { distance: m(0.5), cote: "exterieur", angles: "arrondis" }, cibles: ["rect"] }], "d"));
    const q = E(r.etat, r.effets.crees[0]!);
    expect(q).toMatchObject({ forme: "polyligne", ferme: true });
    expect(q.points).toHaveLength(8);
    expect(q.renflements!.filter((b) => b !== 0)).toHaveLength(4);
    const d = pointsPolyligne(q.points, true, q.renflements);
    expect(Math.min(...d.map((p) => p.x))).toBeCloseTo(-0.5, 9);
    expect(Math.max(...d.map((p) => p.y))).toBeCloseTo(3.5, 9);
    const i = appliquerLot(e, lot([{ type: "transformer.decaler", params: { distance: m(0.5), cote: "interieur", angles: "arrondis" }, cibles: ["rect"] }], "i"));
    const qi = E(i.etat, i.effets.crees[0]!);
    expect(qi.points).toEqual([pt(0.5, 0.5), pt(3.5, 0.5), pt(3.5, 2.5), pt(0.5, 2.5)]);
    expect("renflements" in qi).toBe(false);
    expect(() => appliquerLot(e, lot([{ type: "transformer.decaler", params: { distance: m(2), cote: "interieur", angles: "arrondis" }, cibles: ["rect"] }]))).toThrow(/impossible/);
  });

  it("chanfrein multiple : tous les sommets d'un rectangle (polygone) en une commande ; décomposer une hachure en lignes", () => {
    const e = appliquerLot(base(), lot([{ type: "esquisse.polygone", params: { id: "pg", niveauId: "n0", points: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)] } }], "pg")).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.chanfreinerSommet", params: { id: "pg", distance: m(0.5), sommets: [0, 1, 2, 3] } }], "c")).etat;
    expect(E(r, "pg").points).toHaveLength(8);
    expect(E(r, "pg").points[0]).toEqual(pt(0, 0.5));
    const h = appliquerLot(e, lot([{ type: "transformer.decomposer", params: {}, cibles: ["h"] }], "h"));
    expect(h.effets.crees.map((id) => E(h.etat, id).forme)).toEqual(["ligne", "ligne", "ligne"]);
  });
});
