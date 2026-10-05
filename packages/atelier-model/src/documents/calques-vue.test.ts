import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { m, pt } from "../unites.js";
import { genererVue, type ParamsVue } from "./vues.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "calque.creer", params: { id: "mobilier", nom: "Mobilier" } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "esquisse.polygone", params: { id: "table", niveauId: "n0", calqueId: "mobilier", points: [pt(1, 1), pt(2, 1), pt(2, 2), pt(1, 2)] } },
    { type: "vue.creer", params: { id: "v", type: "plan", titre: "Rez", echelle: 50, niveauId: "n0" } },
  ])).etat;
const dessines = (e: ModeleAtelier) => new Set(genererVue(e, e.definitions["v"]!.params as unknown as ParamsVue, "v").primitives.map((p) => (p as { objetId?: string | null }).objetId).filter(Boolean));

describe("calques masqués dans une vue (D-057)", () => {
  it("le calque masqué n'est pas dessiné dans cette vue seulement ; l'empreinte change ; inverse exact", () => {
    const e = base();
    expect(dessines(e).has("table")).toBe(true);
    const r = appliquerLot(e, lot([{ type: "vue.modifier", params: { id: "v", params: { calquesMasques: ["mobilier", "mobilier"] } } }], "m"));
    expect((r.etat.definitions["v"]!.params as unknown as ParamsVue).calquesMasques).toEqual(["mobilier"]);
    expect(dessines(r.etat).has("table")).toBe(false);
    expect(dessines(r.etat).has("w")).toBe(true);
    expect(r.etat.calques["mobilier"]!.visible).toBe(true);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "vue.modifier", params: { id: "v", params: { calquesMasques: ["zz"] } } }]))).toThrow(/calque inconnu/);
  });

  it("supprimer un calque le retire des vues qui le masquaient ; liste vide : clé absente", () => {
    const e = appliquerLot(base(), lot([
      { type: "calque.creer", params: { id: "vide", nom: "Vide" } },
      { type: "vue.modifier", params: { id: "v", params: { calquesMasques: ["vide"] } } },
    ], "c")).etat;
    const s = appliquerLot(e, lot([{ type: "calque.supprimer", params: { id: "vide" } }], "s")).etat;
    expect("calquesMasques" in s.definitions["v"]!.params).toBe(false);
    expect(s.definitions["v"]!.version).toBe(e.definitions["v"]!.version + 1);
  });
});
