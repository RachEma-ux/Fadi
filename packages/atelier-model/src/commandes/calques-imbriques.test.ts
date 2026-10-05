import { describe, expect, it } from "vitest";
import { modeleVide } from "../modele.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "calque.creer", params: { id: "archi", nom: "Architecture" } },
    { type: "calque.creer", params: { id: "murs", nom: "Murs", parentId: "archi" } },
    { type: "calque.creer", params: { id: "cloisons", nom: "Cloisons", parentId: "murs" } },
    { type: "calque.creer", params: { id: "mob", nom: "Mobilier" } },
  ])).etat;

describe("calques imbriqués (D-080)", () => {
  it("masquer ou verrouiller un parent l'applique aux descendants, en une commande ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "calque.modifier", params: { id: "archi", visible: false, verrouille: true } }], "m"));
    expect(["archi", "murs", "cloisons"].map((id) => [r.etat.calques[id]!.visible, r.etat.calques[id]!.verrouille])).toEqual([[false, true], [false, true], [false, true]]);
    expect(r.etat.calques["mob"]!.visible).toBe(true);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    const seul = appliquerLot(r.etat, lot([{ type: "calque.modifier", params: { id: "cloisons", visible: true } }], "s")).etat;
    expect(seul.calques["murs"]!.visible).toBe(false);
  });

  it("cycle refusé ; parent inconnu refusé ; supprimer un parent rattache ses enfants au grand-parent ; déplacer à la racine", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "calque.modifier", params: { id: "archi", parentId: "cloisons" } }]))).toThrow(/cycle/);
    expect(() => appliquerLot(e, lot([{ type: "calque.creer", params: { nom: "X", parentId: "zz" } }]))).toThrow(/inconnu/);
    const s = appliquerLot(e, lot([{ type: "calque.supprimer", params: { id: "murs" } }], "d")).etat;
    expect(s.calques["cloisons"]!.parentId).toBe("archi");
    const racine = appliquerLot(e, lot([{ type: "calque.modifier", params: { id: "murs", parentId: null } }], "z")).etat;
    expect("parentId" in racine.calques["murs"]!).toBe(false);
  });
});
