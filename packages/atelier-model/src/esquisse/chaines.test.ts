import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { chaineFermee } from "./chaines.js";
import { modeleVide } from "../modele.js";
import { pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const ligne = (id: string, a: [number, number], b: [number, number]) => ({ type: "objet.creer", params: { id, classe: "esquisse", niveauId: "n", params: { forme: "ligne", points: [pt(...a), pt(...b)], ferme: false } } });

describe("chaînes jointives comme profils (D-126, DA-01-09)", () => {
  it("quatre lignes jointives (dans le désordre, une inversée) forment un contour ; ouverte ou ramifiée : null", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      ligne("a", [0, 0], [4, 0]),
      ligne("c", [4, 3], [0, 3]),
      ligne("b", [4, 3], [4, 0]),
      ligne("d", [0, 3], [0, 0]),
      ligne("x", [10, 0], [11, 0]),
    ])).etat;
    expect(chaineFermee(e, ["a", "c", "b", "d"])).toEqual([pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)]);
    expect(chaineFermee(e, ["a", "b", "c"])).toBeNull();
    expect(chaineFermee(e, ["a", "b", "c", "d", "x"])).toBeNull();
    // Le profil proposé s'obtient par « Joindre » (commande existante) : un polygone.
    const j = appliquerLot(e, lot([{ type: "transformer.joindre", params: {}, cibles: ["a", "c", "b", "d"] }], "j")).etat;
    expect(j.objets["a"]!.params).toMatchObject({ forme: "polygone", ferme: true });
  });
});
