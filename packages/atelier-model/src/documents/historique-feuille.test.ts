import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { composerFeuilleDefinition, type ParamsFeuille } from "./feuilles.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const projet = { id: "p", nom: "Essai", code: "E" };
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "feuille.creer", params: { id: "f", titre: "Plans", numero: "A01", format: "A3", indice: "B" } },
  ])).etat;
const textes = (e: ModeleAtelier) => composerFeuilleDefinition(e, "f", 1, projet)!.primitives.filter((p) => p.type === "texte").map((p) => (p as { texte: string }).texte);

describe("historique des indices d'une feuille (D-061)", () => {
  it("lignes saisies dessinées au-dessus du cartouche ; absent sans ligne (forme antérieure) ; inverse exact", () => {
    const e = base();
    expect("historique" in e.definitions["f"]!.params).toBe(false);
    const r = appliquerLot(e, lot([{ type: "feuille.modifier", params: { id: "f", params: { historique: [{ indice: "A", date: "2026-09-01", objet: "Première diffusion" }, { indice: "B", objet: "Escalier B modifié" }] } } }], "h"));
    const h = (r.etat.definitions["f"]!.params as unknown as ParamsFeuille).historique;
    expect(h).toEqual([{ indice: "A", date: "2026-09-01", objet: "Première diffusion" }, { indice: "B", date: null, objet: "Escalier B modifié" }]);
    const t = textes(r.etat);
    expect(t).toEqual(expect.arrayContaining(["Première diffusion", "Escalier B modifié", "Objet de la modification", "—"]));
    expect(textes(e)).not.toContain("Objet de la modification");
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("refus : indice ou objet manquant, plus de dix lignes", () => {
    const e = base();
    const mod = (historique: unknown) => () => appliquerLot(e, lot([{ type: "feuille.modifier", params: { id: "f", params: { historique } } }]));
    expect(mod([{ objet: "X" }])).toThrow(/indice/);
    expect(mod([{ indice: "A" }])).toThrow(/objet/);
    expect(mod(Array.from({ length: 11 }, (_, i) => ({ indice: String(i), objet: "x" })))).toThrow(/10 lignes/);
  });
});
