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

describe("propriétés des groupes et des calques (D-088)", () => {
  it("définir, remplacer, retirer ; nombre sans unité refusé ; cible inconnue refusée ; inverse exact", () => {
    const e = appliquerLot(base(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0 } },
      { type: "esquisse.ligne", params: { id: "l", niveauId: "n", points: [{ x: 0, y: 0, frame: "local", unit: "m" }, { x: 1, y: 0, frame: "local", unit: "m" }] } },
      { type: "groupe.creer", params: { id: "g", nom: "Lot A" }, cibles: ["l"] },
    ], "g")).etat;
    const r = appliquerLot(e, lot([
      { type: "propriete.definir", params: { groupeId: "g", nom: "Lot", valeur: "A" } },
      { type: "propriete.definir", params: { calqueCible: "murs", nom: "Coût", valeur: 120, unite: "€/m" } },
    ], "p"));
    expect(r.etat.groupes["g"]!.proprietes!["Lot"]!.valeur).toBe("A");
    expect(r.etat.calques["murs"]!.proprietes!["Coût"]).toMatchObject({ valeur: 120, unite: "€/m" });
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    const sans = appliquerLot(r.etat, lot([{ type: "propriete.definir", params: { groupeId: "g", nom: "Lot" } }], "s")).etat;
    expect("proprietes" in sans.groupes["g"]!).toBe(false);
    expect(() => appliquerLot(e, lot([{ type: "propriete.definir", params: { calqueCible: "murs", nom: "x", valeur: 3 } }]))).toThrow(/sans unité/);
    expect(() => appliquerLot(e, lot([{ type: "propriete.definir", params: { groupeId: "zz", nom: "x", valeur: "a" } }]))).toThrow(/inconnu/);
  });
});

describe("calques gelés (D-103, DA-05-01)", () => {
  it("geler un parent gèle ses descendants ; objets figés (modification refusée) ; hors des vues ; inverse exact", async () => {
    const { pt } = await import("../unites.js");
    const { genererVue } = await import("../documents/vues.js");
    const e = appliquerLot(base(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
      { type: "esquisse.ligne", params: { id: "l", niveauId: "n", points: [pt(0, 0), pt(2, 0)], calqueId: "cloisons" } },
      { type: "esquisse.ligne", params: { id: "l2", niveauId: "n", points: [pt(0, 1), pt(2, 1)], calqueId: "mob" } },
    ], "o")).etat;
    const r = appliquerLot(e, lot([{ type: "calque.modifier", params: { id: "archi", gele: true } }], "g"));
    expect(["archi", "murs", "cloisons", "mob"].map((id) => !!r.etat.calques[id]!.gele)).toEqual([true, true, true, false]);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    expect(() => appliquerLot(r.etat, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["l"] }], "x"))).toThrow(/calque gelé.*dégeler le calque/);
    const vue = { type: "plan" as const, titre: "P", echelle: 50, niveauId: "n", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null };
    const ids = (etat: typeof e) => new Set(genererVue(etat, vue).primitives.map((p) => (p as { objetId?: string }).objetId));
    expect(ids(e).has("l")).toBe(true);
    expect(ids(r.etat).has("l")).toBe(false);
    expect(ids(r.etat).has("l2")).toBe(true);
    const d = appliquerLot(r.etat, lot([{ type: "calque.modifier", params: { id: "cloisons", gele: false } }], "d")).etat;
    expect(d.calques["cloisons"]!.gele).toBeUndefined();
    expect(d.calques["murs"]!.gele).toBe(true);
    const { verifierModele } = await import("../archive.js");
    const relu = verifierModele(JSON.parse(JSON.stringify(r.etat)));
    if (!relu.ok) throw new Error(relu.erreurs.join(" ; "));
    expect(relu.modele.calques["murs"]!.gele).toBe(true);
    expect(relu.modele.calques["mob"]!.gele).toBeUndefined();
  });
});
