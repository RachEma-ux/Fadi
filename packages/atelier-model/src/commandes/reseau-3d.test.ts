import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { modeleVide, objetsDeClasse, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n2", nom: "R+2", elevation: 6, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n3", nom: "R+3", elevation: 9, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(1), allege: m(1) } },
    { type: "poteau.creer", params: { id: "p", niveauId: "n0", point: pt(6, 0), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
  ])).etat;

describe("réseau 3D sur les niveaux (D-122, DA-02-12)", () => {
  it("2 copies dans le plan × 2 étages : neuf ensembles, fenêtres suivies, un lot, inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.repeter", params: { nombre: 2, dx: 10, dy: 0, etages: 2 }, cibles: ["w", "p"] }], "res"));
    const murs = objetsDeClasse(r.etat, "mur");
    expect(murs).toHaveLength(9);
    const parNiveau = (n: string) => murs.filter((w) => w.niveauId === n).map((w) => w.params.a.x).sort((a, b) => a - b);
    expect(parNiveau("n0")).toEqual([0, 10, 20]);
    expect(parNiveau("n1")).toEqual([0, 10, 20]);
    expect(parNiveau("n2")).toEqual([0, 10, 20]);
    expect(parNiveau("n3")).toEqual([]);
    const fen = objetsDeClasse(r.etat, "fenetre");
    expect(fen).toHaveLength(9);
    for (const f of fen) expect(r.etat.objets[(f as Occurrence<"fenetre">).params.murHoteId]!.niveauId).toBe(f.niveauId ?? r.etat.objets[(f as Occurrence<"fenetre">).params.murHoteId]!.niveauId);
    expect(objetsDeClasse(r.etat, "poteau").filter((x) => x.niveauId === "n2")).toHaveLength(3);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    // Étages seuls (nombre 0) : une copie par niveau au-dessus.
    const seuls = appliquerLot(e, lot([{ type: "transformer.repeter", params: { nombre: 0, dx: 0, dy: 0, etages: 3 }, cibles: ["p"] }], "s")).etat;
    expect(objetsDeClasse(seuls, "poteau").map((x) => x.niveauId).sort()).toEqual(["n0", "n1", "n2", "n3"]);
  });

  it("niveau manquant ou niveau haut manquant : refus motivé, jamais de niveau inventé ; associatif refusé", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "transformer.repeter", params: { nombre: 0, dx: 0, dy: 0, etages: 4 }, cibles: ["p"] }], "x"))).toThrow(/il manque 1 niveau/);
    const h = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "w", params: { niveauHautId: "n1" } } }], "h")).etat;
    const ok = appliquerLot(h, lot([{ type: "transformer.repeter", params: { nombre: 0, dx: 0, dy: 0, etages: 2 }, cibles: ["w"] }], "o")).etat;
    expect(objetsDeClasse(ok, "mur").map((w) => [w.niveauId, w.params.niveauHautId]).sort()).toEqual([["n0", "n1"], ["n1", "n2"], ["n2", "n3"]]);
    expect(() => appliquerLot(h, lot([{ type: "transformer.repeter", params: { nombre: 0, dx: 0, dy: 0, etages: 3 }, cibles: ["w"] }], "y"))).toThrow(/niveau haut/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.repeter", params: { nombre: 2, dx: 1, dy: 0, etages: 1, associatif: true }, cibles: ["p"] }], "z"))).toThrow(/associatif/);
  });
});
