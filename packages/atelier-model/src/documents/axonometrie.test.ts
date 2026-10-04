import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { modeleVide } from "../modele.js";
import { m, pt } from "../unites.js";
import { genererVueDefinition } from "./vues.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });

describe("vue axonométrique (D-048)", () => {
  it("projection parallèle du modèle, sans repères de niveaux ; inclinaison bornée", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "a", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "b", niveauId: "n0", a: pt(4, 0), b: pt(4, 3), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "vue.creer", params: { id: "v", type: "axonometrie", titre: "Axo", echelle: 100, azimut: { value: 225, unit: "deg" }, inclinaison: { value: 35.26, unit: "deg" } } },
    ])).etat;
    const v = genererVueDefinition(e, "v")!;
    expect(v.primitives.filter((p) => p.type === "ligne" || p.type === "poly").length).toBeGreaterThan(8);
    expect(v.objets.sort()).toEqual(["a", "b"]);
    expect(v.avertissements.some((a) => /projection parallèle/.test(a))).toBe(true);
    expect(v.primitives.some((p) => p.type === "texte" && /Rez/.test(p.texte))).toBe(false);
    expect(() => appliquerLot(e, lot([{ type: "vue.creer", params: { type: "axonometrie", titre: "X", echelle: 100, azimut: { value: 0, unit: "deg" }, inclinaison: { value: 90, unit: "deg" } } }]))).toThrow(/inclinaison/);
    expect(() => appliquerLot(e, lot([{ type: "vue.creer", params: { type: "axonometrie", titre: "X", echelle: 100 } }]))).toThrow(/azimut/);
  });
});
