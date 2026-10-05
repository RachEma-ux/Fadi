import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { quantites } from "../quantites.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = (x: number, y: number, c: number) => [pt(x, y), pt(x + c, y), pt(x + c, y + c), pt(x, y + c)];
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3, hauteur: 3 } },
    { type: "piece.creer", params: { id: "p", niveauId: "n0", nom: "Hall", contour: carre(0, 0, 4) } },
    { type: "dalle.creer", params: { id: "d1", niveauId: "n1", contour: carre(-1, -1, 10), epaisseur: m(0.2) } },
    { type: "dalle.creer", params: { id: "d2", niveauId: "n1", contour: carre(20, 0, 2), epaisseur: m(0.2), usage: "dalle-isolee" } },
    { type: "escalier.creer", params: { id: "e", niveauId: "n0", a: pt(1, 1), b: pt(5, 1), largeur: m(1), hauteurAFranchir: m(3), niveauDepartId: "n0", niveauArriveeId: "n1" } },
  ])).etat;

describe("dalles, pièces et trémies (D-059)", () => {
  it("hauteur propre d'une pièce : volume aux quantités ; effaçable ; archive", () => {
    const e = base();
    expect(quantites(e).niveaux[0]!.pieces[0]).not.toHaveProperty("volume");
    const h = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { hauteur: m(2.6) } } }], "h")).etat;
    expect(quantites(h).niveaux[0]!.pieces[0]).toMatchObject({ hauteur: 2.6, volume: 41.6 });
    expect(verifierModele(JSON.parse(JSON.stringify(h))).ok).toBe(true);
    const sans = appliquerLot(h, lot([{ type: "objet.modifier", params: { id: "p", params: { hauteur: null } } }], "x")).etat;
    expect("hauteur" in (sans.objets["p"] as Occurrence<"piece">).params).toBe(false);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { hauteur: 2.6 } } }]))).toThrow(/hauteur/);
  });

  it("usage des dalles : quantités par usage (non renseigné compté à part), valeur hors liste refusée", () => {
    const e = base();
    expect(quantites(e).niveaux[1]!.dalles.parUsage).toEqual({ "dalle-isolee": { nombre: 1, aireNette: 4 }, "non-renseigne": { nombre: 1, aireNette: 100 } });
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "d1", params: { usage: "terrasse" } } }]))).toThrow(/usage/);
    const sansUsage = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "d2", params: { usage: null } } }], "u")).etat;
    expect(quantites(sansUsage).niveaux[1]!.dalles).not.toHaveProperty("parUsage");
  });

  it("trémie : la dalle est percée de l'emprise de l'escalier (marge déclarée) ; refus hors dalle ou chevauchement ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "escalier.tremie", params: { id: "e", dalleId: "d1", marge: 0.1 } }], "t"));
    const trous = (r.etat.objets["d1"] as Occurrence<"dalle">).params.trous;
    expect(trous).toHaveLength(1);
    expect(trous[0]!.map((q) => [q.x, q.y])).toEqual([[0.9, 0.4], [5.1, 0.4], [5.1, 1.6], [0.9, 1.6]]);
    expect(quantites(r.etat).niveaux[1]!.dalles.aireNette).toBeCloseTo(104 - 4.2 * 1.2, 6);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(r.etat, lot([{ type: "escalier.tremie", params: { id: "e", dalleId: "d1" } }]))).toThrow(/chevauche/);
    expect(() => appliquerLot(e, lot([{ type: "escalier.tremie", params: { id: "e", dalleId: "d2" } }]))).toThrow(/ne tient pas/);
    expect(() => appliquerLot(e, lot([{ type: "escalier.tremie", params: { id: "p", dalleId: "d1" } }]))).toThrow(/escalier inconnu/);
  });
});
