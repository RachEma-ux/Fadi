import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { champsEnConflit, reprendreChamps, rejouerLots } from "./sync.js";
import { modeleVide } from "./modele.js";
import { m, pt } from "./unites.js";

const env = (commands: Commande[], id = "r", base = 0) => ({ requestId: id, baseRevision: base, contract: CONTRAT_COMMANDES, label: id, commands });

describe("aide à la résolution champ par champ (D-128, DA-21-02)", () => {
  it("champ devenu invalide repéré, les autres repris seuls ; lot mixte : pas d'aide", () => {
    const e0 = appliquerLot(modeleVide(), env([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "niveau.creer", params: { id: "n1", nom: "R+1", elevation: 3, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    ])).etat;
    // Ici : épaisseur 0,3 et niveau haut R+1 ; au serveur, R+1 a été supprimé entre-temps.
    const lot = env([{ type: "objet.modifier", params: { id: "w", params: { epaisseur: m(0.3), niveauHautId: "n1" } } }], "ici", 1);
    const serveur = appliquerLot(e0, env([{ type: "niveau.supprimer", params: { id: "n1" } }], "autre", 1)).etat;
    const rejeu = rejouerLots(serveur, 2, [{ enveloppe: lot, etat: "local", creeA: "", detail: null }]);
    expect(rejeu.incompatibles).toHaveLength(1);
    const champs = champsEnConflit(serveur, lot)!;
    expect(champs.map((c) => [c.champ, c.applicable])).toEqual([["epaisseur", true], ["niveauHautId", false]]);
    expect(champs[0]!.serveur).toEqual(m(0.2));
    const cmds = reprendreChamps(lot, new Set(["0:epaisseur"]));
    expect(cmds).toEqual([{ type: "objet.modifier", params: { id: "w", params: { epaisseur: m(0.3) } } }]);
    expect((appliquerLot(serveur, env(cmds, "reprise", 2)).etat.objets["w"]!.params as { epaisseur: unknown }).epaisseur).toEqual(m(0.3));
    expect(champsEnConflit(serveur, env([{ type: "objet.supprimer", params: { ids: ["w"] } }]))).toBeNull();
  });
});
