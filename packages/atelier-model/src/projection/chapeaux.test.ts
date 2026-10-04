import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide } from "../modele.js";
import { m, pt } from "../unites.js";
import { assombrir, chapeauxDeCoupe } from "./chapeaux.js";
import { maillagesModele } from "./maillage.js";

const lot = (commands: Commande[]) => ({ requestId: "r", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "r", commands });
const aireMaillage = (pos: number[], idx: number[]) => {
  let s = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const [a, b, c] = [idx[k]!, idx[k + 1]!, idx[k + 2]!].map((i) => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!]);
    const ab = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
    const ac = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
    s += Math.hypot(ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!) / 2;
  }
  return s;
};

describe("remplissage des coupes en 3D (chapeaux)", () => {
  it("un mur coupé à 1 m : section pleine de longueur × épaisseur ; coupé au droit d'une porte : la baie est vide", () => {
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "ouverture.poser", params: { classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(2.1) } },
    ])).etat;
    const mm = maillagesModele(e);
    const haut = chapeauxDeCoupe(mm, { point: [0, 0, 2.5], normale: [0, 0, -1] });
    expect(haut).toHaveLength(1);
    expect(aireMaillage(haut[0]!.positions, haut[0]!.indices)).toBeCloseTo(1, 6);
    const bas = chapeauxDeCoupe(mm, { point: [0, 0, 1], normale: [0, 0, -1] });
    expect(aireMaillage(bas[0]!.positions, bas[0]!.indices)).toBeCloseTo(0.8, 6);
    expect(bas[0]!.positions.every((v, i) => i % 3 !== 2 || Math.abs(v - 1) < 1e-9)).toBe(true);
    // Coupe verticale à travers le mur (x = 2) : rectangle épaisseur × hauteur.
    const vert = chapeauxDeCoupe(mm, { point: [1, 0, 0], normale: [1, 0, 0] });
    expect(aireMaillage(vert[0]!.positions, vert[0]!.indices)).toBeCloseTo(0.6, 6);
    expect(assombrir("#ffffff")).toBe("#8c8c8c");
  });

  it("P.118 coupé à 1,20 m au-dessus du RDC : des chapeaux pour les murs, aucun pour les objets transparents", () => {
    const p = importerModeleNatif(JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif).modele;
    const mm = maillagesModele(p, "rdc");
    const ch = chapeauxDeCoupe(mm, { point: [0, 0, 1.2], normale: [0, 0, -1] });
    expect(ch.filter((c) => c.classe === "mur").length).toBeGreaterThan(10);
    expect(ch.every((c) => c.opacite === 1 && c.classe !== "fenetre")).toBe(true);
  });
});
