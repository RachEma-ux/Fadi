import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { ensemblesPartages } from "./ensembles.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3 } },
    { type: "calque.creer", params: { id: "mob", nom: "Mobilier" } },
  ])).etat;

describe("ensembles d'affichage partagés (D-066)", () => {
  it("enregistré, relu, mis à jour ; calque supprimé retiré ; étage supprimé détaché ; archive ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "ensemble.enregistrer", params: { id: "ens", nom: "Gros œuvre", calquesMasques: ["mob"], classesMasquees: ["esquisse", "cotation", "esquisse"], niveauId: "n1" } }], "e"));
    expect(ensemblesPartages(r.etat)[0]!.params).toEqual({ nom: "Gros œuvre", calquesMasques: ["mob"], classesMasquees: ["cotation", "esquisse"], niveauId: "n1" });
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(verifierModele(JSON.parse(JSON.stringify(r.etat))).ok).toBe(true);
    const sans = appliquerLot(r.etat, lot([{ type: "calque.supprimer", params: { id: "mob" } }, { type: "niveau.supprimer", params: { id: "n1" } }], "s")).etat;
    expect(sans.definitions["ens"]!.params).toMatchObject({ calquesMasques: [], niveauId: null });
    expect(() => appliquerLot(e, lot([{ type: "ensemble.enregistrer", params: { nom: "X", classesMasquees: ["licorne"] } }]))).toThrow(/classe inconnue/);
    expect(() => appliquerLot(e, lot([{ type: "ensemble.enregistrer", params: { nom: "X", calquesMasques: ["zz"] } }]))).toThrow(/calque inconnu/);
    expect(Object.keys(appliquerLot(r.etat, lot([{ type: "ensemble.supprimer", params: { id: "ens" } }], "x")).etat.definitions)).toEqual([]);
  });
});
