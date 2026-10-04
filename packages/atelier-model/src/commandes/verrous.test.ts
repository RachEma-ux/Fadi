import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, identifiantsCibles, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w1", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "w2", niveauId: "n0", a: pt(0, 5), b: pt(4, 5), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "poteau.creer", params: { id: "c", niveauId: "n0", point: pt(2, 2), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
  ])).etat;

describe("verrous d'objets et de groupes (D-052)", () => {
  it("objet verrouillé : déplacement, modification, suppression refusés en le nommant ; copie libre ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "objet.verrouiller", params: { ids: ["w1"], verrouille: true } }], "v"));
    const v = r.etat;
    expect(v.objets["w1"]!.verrouille).toBe(true);
    expect(() => appliquerLot(v, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["w1", "c"] }]))).toThrow(/w1 : objet verrouillé/);
    expect(() => appliquerLot(v, lot([{ type: "objet.supprimer", params: { id: "w1" } }]))).toThrow(/suppression refusée/);
    expect(() => appliquerLot(v, lot([{ type: "mur.modifier", params: { id: "w1", params: { epaisseur: m(0.3) } } }]))).toThrow(/verrouillé/);
    // Un autre objet reste libre ; une copie de l'objet verrouillé est libre.
    expect(() => appliquerLot(v, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["c"] }]))).not.toThrow();
    const copie = appliquerLot(v, lot([{ type: "transformer.copier", params: { dx: 0, dy: 1 }, cibles: ["w1"] }], "cp"));
    expect(copie.effets.crees.map((id) => copie.etat.objets[id]!.verrouille)).toEqual([undefined]);
    // Déverrouiller : modifiable à nouveau ; inverse exact.
    const libre = appliquerLot(v, lot([{ type: "objet.verrouiller", params: { ids: ["w1"], verrouille: false } }], "l")).etat;
    expect("verrouille" in libre.objets["w1"]!).toBe(false);
    expect(libre).toEqual(e);
    expect(appliquerLot(v, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "objet.verrouiller", params: { ids: ["zz"] } }]))).toThrow(/objet inconnu/);
    expect(identifiantsCibles(lot([{ type: "objet.verrouiller", params: { ids: ["w1", "c"] } }]))).toEqual(expect.arrayContaining(["w1", "c"]));
  });

  it("groupe verrouillé : membres tenus, retrait et dissolution refusés ; déverrouiller les libère", () => {
    const g = appliquerLot(base(), lot([{ type: "groupe.creer", params: { id: "g", nom: "Façade" }, cibles: ["w1", "w2"] }], "g")).etat;
    const v = appliquerLot(g, lot([{ type: "groupe.modifier", params: { id: "g", verrouille: true } }], "gv")).etat;
    expect(v.groupes["g"]).toEqual({ id: "g", nom: "Façade", verrouille: true });
    expect(() => appliquerLot(v, lot([{ type: "transformer.tourner", params: { centre: pt(0, 0), angle: { value: 90, unit: "deg" } }, cibles: ["w2"] }]))).toThrow(/groupe verrouillé « Façade »/);
    expect(() => appliquerLot(v, lot([{ type: "groupe.modifier", params: { id: "g", retirer: ["w2"] } }]))).toThrow(/verrouillé/);
    expect(() => appliquerLot(v, lot([{ type: "groupe.dissoudre", params: { id: "g" } }]))).toThrow(/verrouillé/);
    // Ajouter un membre reste permis (il devient tenu) ; renommer aussi.
    const plus = appliquerLot(v, lot([{ type: "groupe.modifier", params: { id: "g", ajouter: ["c"], nom: "Façade nord" } }], "a")).etat;
    expect(() => appliquerLot(plus, lot([{ type: "objet.supprimer", params: { id: "c" } }]))).toThrow(/Façade nord/);
    const libre = appliquerLot(plus, lot([{ type: "groupe.modifier", params: { id: "g", verrouille: false } }], "gl")).etat;
    expect(libre.groupes["g"]).toEqual({ id: "g", nom: "Façade nord" });
    expect(() => appliquerLot(libre, lot([{ type: "groupe.dissoudre", params: { id: "g" } }]))).not.toThrow();
  });

  it("archive : verrous conservés à la relecture, absents si non verrouillés", () => {
    const g = appliquerLot(base(), lot([
      { type: "groupe.creer", params: { id: "g", nom: "G" }, cibles: ["w2"] },
      { type: "groupe.modifier", params: { id: "g", verrouille: true } },
      { type: "objet.verrouiller", params: { ids: ["c"] } },
    ], "a")).etat;
    const relu = verifierModele(JSON.parse(JSON.stringify(g)));
    if (!relu.ok) throw new Error(relu.erreurs.join(" ; "));
    expect(relu.modele.groupes["g"]!.verrouille).toBe(true);
    expect((relu.modele.objets["c"] as Occurrence<"poteau">).verrouille).toBe(true);
    expect("verrouille" in relu.modele.objets["w1"]!).toBe(false);
  });
});
