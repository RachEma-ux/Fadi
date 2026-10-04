import { describe, expect, it } from "vitest";
import { modeleVide } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const ligne = (id: string, y: number) => ({ type: "esquisse.ligne", params: { id, niveauId: "n0", points: [pt(0, y), pt(1, y)] } });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    ligne("e1", 0), ligne("e2", 1), ligne("e3", 2), ligne("e4", 3),
    { type: "groupe.creer", params: { id: "g", nom: "Mobilier", cibles: ["e1", "e2"] } },
    { type: "groupe.creer", params: { id: "h", nom: "Autre", cibles: ["e4"] } },
  ])).etat;

describe("groupe.modifier (D-041)", () => {
  it("renommer, ajouter, retirer ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "groupe.modifier", params: { id: "g", nom: "Mobilier séjour", ajouter: ["e3"], retirer: ["e1"] } }], "m"));
    expect(r.etat.groupes["g"]!.nom).toBe("Mobilier séjour");
    expect(Object.values(r.etat.objets).filter((o) => o.groupeId === "g").map((o) => o.id).sort()).toEqual(["e2", "e3"]);
    expect(r.etat.objets["e1"]!.groupeId).toBeNull();
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("refus : membre d'un autre groupe, non-membre retiré, groupe vidé, nom vide", () => {
    const e = base();
    const x = (params: Record<string, unknown>) => () => appliquerLot(e, lot([{ type: "groupe.modifier", params: { id: "g", ...params } }]));
    expect(x({ ajouter: ["e4"] })).toThrow(/déjà au groupe « Autre »/);
    expect(x({ retirer: ["e3"] })).toThrow(/pas membre/);
    expect(x({ retirer: ["e1", "e2"] })).toThrow(/vide/);
    expect(x({ nom: "  " })).toThrow(/nom/);
    void m;
  });
});
