import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "n2", nom: "Combles", elevation: 6, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(2.1) } },
    { type: "mur.tracer", params: { id: "wh", niveauId: "n0", a: pt(0, 5), b: pt(4, 5), epaisseur: m(0.2), niveauHautId: "n1" } },
    { type: "poteau.creer", params: { id: "c", niveauId: "n0", point: pt(2, 2), formeId: "rectangle", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3) } },
  ])).etat;

describe("vers un autre niveau (D-039)", () => {
  it("déplacer : objets et ouvertures hébergées passent sur le niveau cible ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 0, dy: 0, niveauCible: "n1" }, cibles: ["w", "c"] }], "d"));
    expect(r.etat.objets["w"]!.niveauId).toBe("n1");
    expect(r.etat.objets["p"]!.niveauId).toBe("n1");
    expect(r.etat.objets["c"]!.niveauId).toBe("n1");
    expect((r.etat.objets["w"] as Occurrence<"mur">).params.a).toEqual((e.objets["w"] as Occurrence<"mur">).params.a);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("copier : les copies (avec leurs ouvertures) sont sur le niveau cible, décalées ; l'original reste", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "transformer.copier", params: { dx: 1, dy: 0, niveauCible: "n2" }, cibles: ["w"] }], "c"));
    const copies = r.effets.crees.map((id) => r.etat.objets[id]!);
    expect(copies.map((o) => o.classe).sort()).toEqual(["mur", "porte"]);
    expect(copies.every((o) => o.niveauId === "n2")).toBe(true);
    expect((copies.find((o) => o.classe === "mur") as Occurrence<"mur">).params.a.x).toBe(1);
    expect(r.etat.objets["w"]!.niveauId).toBe("n0");
  });

  it("refus : niveau inconnu, mur dont le niveau haut ne serait plus au-dessus", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 0, dy: 0, niveauCible: "zz" }, cibles: ["w"] }]))).toThrow(/niveau inconnu/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 0, dy: 0, niveauCible: "n1" }, cibles: ["wh"] }]))).toThrow(/niveau haut/);
  });
});

describe("dupliquer un niveau (D-040)", () => {
  it("nouveau niveau avec la copie de son contenu ; niveau haut → hauteur effective ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "niveau.dupliquer", params: { source: "n0", id: "n3", nom: "Rez bis", elevation: 9 } }], "dup"));
    expect(r.etat.niveaux["n3"]).toMatchObject({ nom: "Rez bis", elevation: 9, hauteur: 3 });
    const copies = Object.values(r.etat.objets).filter((o) => o.niveauId === "n3");
    expect(copies.map((o) => o.classe).sort()).toEqual(["mur", "mur", "porte", "poteau"]);
    const haut = copies.find((o): o is Occurrence<"mur"> => o.classe === "mur" && o.params.a.y === 5)!;
    expect(haut.params.niveauHautId).toBeNull();
    expect(haut.params.hauteur).toEqual({ value: 3, unit: "m" });
    expect(Object.values(r.etat.objets).filter((o) => o.niveauId === "n0")).toHaveLength(4);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "niveau.dupliquer", params: { source: "zz", nom: "X", elevation: 9 } }]))).toThrow(/niveau inconnu/);
  });
});
