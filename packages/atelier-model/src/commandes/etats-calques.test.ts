import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";
import { etatsCalques } from "./etats-calques.js";
import { verifierModele } from "../archive.js";
import { modeleVide } from "../modele.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "calque.creer", params: { id: "a", nom: "Archi" } },
    { type: "calque.creer", params: { id: "b", nom: "Structure" } },
  ])).etat;

describe("états de calques versionnés (D-119, DA-05-03)", () => {
  it("instantané enregistré dans le modèle, restauré en un lot (inverse exact), mis à jour en nouvelle version", () => {
    const e0 = appliquerLot(base(), lot([{ type: "etatCalques.enregistrer", params: { id: "ec", nom: "Tout visible" } }], "s")).etat;
    expect(etatsCalques(e0)[0]!.params.calques).toEqual({ a: { visible: true, verrouille: false, gele: false }, b: { visible: true, verrouille: false, gele: false } });
    const change = appliquerLot(e0, lot([
      { type: "calque.modifier", params: { id: "a", visible: false } },
      { type: "calque.modifier", params: { id: "b", verrouille: true, gele: true } },
    ], "c")).etat;
    const r = appliquerLot(change, lot([{ type: "etatCalques.restaurer", params: { id: "ec" } }], "rest"));
    expect(r.etat.calques["a"]!.visible).toBe(true);
    expect(r.etat.calques["b"]!.verrouille).toBe(false);
    expect(r.etat.calques["b"]!.gele).toBeUndefined();
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(change);
    expect(() => appliquerLot(e0, lot([{ type: "etatCalques.restaurer", params: { id: "ec" } }], "x"))).toThrow(/déjà dans cet état/);
    const v2 = appliquerLot(change, lot([{ type: "etatCalques.enregistrer", params: { id: "ec" } }], "v2")).etat;
    expect(v2.definitions["ec"]!.version).toBe(2);
    expect(v2.definitions["ec"]!.nom).toBe("Tout visible");
    expect(etatsCalques(v2)[0]!.params.calques["b"]).toEqual({ visible: true, verrouille: true, gele: true });
  });

  it("un calque supprimé sort de l'instantané ; un calque créé depuis garde son état ; archive revalidée", () => {
    const e0 = appliquerLot(base(), lot([{ type: "etatCalques.enregistrer", params: { id: "ec", nom: "Départ" } }], "s")).etat;
    const e1 = appliquerLot(e0, lot([
      { type: "calque.supprimer", params: { id: "b" } },
      { type: "calque.creer", params: { id: "c", nom: "Nouveau", visible: false } },
      { type: "calque.modifier", params: { id: "a", visible: false } },
    ], "d")).etat;
    expect(Object.keys(etatsCalques(e1)[0]!.params.calques)).toEqual(["a"]);
    const r = appliquerLot(e1, lot([{ type: "etatCalques.restaurer", params: { id: "ec" } }], "r")).etat;
    expect(r.calques["a"]!.visible).toBe(true);
    expect(r.calques["c"]!.visible).toBe(e1.calques["c"]!.visible);
    expect(verifierModele(JSON.parse(JSON.stringify(r))).ok).toBe(true);
    const casse = JSON.parse(JSON.stringify(r));
    casse.definitions.ec.params.calques.a = { visible: "oui" };
    expect(verifierModele(casse).ok).toBe(false);
    expect(() => appliquerLot(r, lot([{ type: "definition.supprimer", params: { id: "ec" } }], "z"))).toThrow(/etatCalques.supprimer/);
    expect(appliquerLot(r, lot([{ type: "etatCalques.supprimer", params: { id: "ec" } }], "y")).etat.definitions["ec"]).toBeUndefined();
  });
});
