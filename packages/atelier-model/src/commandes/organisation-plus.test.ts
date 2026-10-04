import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (...cmds: Commande[]): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3, hauteur: 3 } },
    { type: "type.definir", params: { id: "t1", classe: "mur", nom: "Béton 20" } },
    { type: "type.definir", params: { id: "t2", classe: "mur", nom: "Brique 25" } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n1", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3), definitionId: "t1" } },
    { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(2.1), ouvrant: { charniere: "debut", cote: "gauche" } } },
    ...cmds,
  ])).etat;

describe("organisation complémentaire (D-044)", () => {
  it("supprimer un niveau en réaffectant ses objets ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "niveau.supprimer", params: { id: "n1", reaffecterA: "n0" } }], "s"));
    expect(r.etat.niveaux["n1"]).toBeUndefined();
    expect(r.etat.objets["w"]!.niveauId).toBe("n0");
    expect(r.etat.objets["p"]!.niveauId).toBe("n0");
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "niveau.supprimer", params: { id: "n1", reaffecterA: "n1" } }]))).toThrow(/réaffectation/);
  });

  it("supprimer un type : refus s'il est utilisé, sauf détacher ; substituer un type par un autre", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "definition.supprimer", params: { id: "t1" } }]))).toThrow(/utilisé par 1/);
    const d = appliquerLot(e, lot([{ type: "definition.supprimer", params: { id: "t1", detacher: true } }], "d")).etat;
    expect(d.definitions["t1"]).toBeUndefined();
    expect(d.objets["w"]!.definitionId).toBeNull();
    const sub = appliquerLot(e, lot([{ type: "definition.substituer", params: { ancienne: "t1", nouvelle: "t2" } }], "x")).etat;
    expect(sub.objets["w"]!.definitionId).toBe("t2");
    expect(() => appliquerLot(e, lot([{ type: "definition.substituer", params: { ancienne: "t2", nouvelle: "t1" } }]))).toThrow(/aucune occurrence/);
    expect(appliquerLot(e, lot([{ type: "definition.supprimer", params: { id: "t2" } }], "y")).etat.definitions["t2"]).toBeUndefined();
  });

  it("changer la classe d'une ouverture sur place : porte → fenêtre (sens retiré) → baie ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "ouverture.changerClasse", params: { id: "p", classe: "fenetre" } }], "c"));
    const f = r.etat.objets["p"] as Occurrence<"fenetre">;
    expect(f.classe).toBe("fenetre");
    expect(f.params).toMatchObject({ murHoteId: "w", position: 0.5, largeur: { value: 1 } });
    expect((f.params as { ouvrant?: unknown }).ouvrant).toBeUndefined();
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "ouverture.changerClasse", params: { id: "p", classe: "porte" } }]))).toThrow(/déjà/);
    expect(() => appliquerLot(e, lot([{ type: "ouverture.changerClasse", params: { id: "w", classe: "porte" } }]))).toThrow(/n'est pas une ouverture/);
  });
});
