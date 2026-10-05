import { describe, expect, it } from "vitest";
import { modeleVide, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0 } },
    { type: "mur.tracer", params: { id: "a", niveauId: "n", a: pt(0, 0), b: pt(10, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "mur.tracer", params: { id: "b", niveauId: "n", a: pt(10, 0), b: pt(10, 8), epaisseur: m(0.4), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "a", position: 0.5, largeur: m(3.1), hauteur: m(1.4), allege: m(0.9), repere: "F1" } },
  ])).etat;

describe("fenêtres jumelées et d'angle (D-083)", () => {
  it("jumeler : trois fenêtres égales séparées de meneaux, même emprise, groupées ; inverse exact ; meneaux trop larges refusés", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "ouverture.jumeler", params: { id: "f", nombre: 3, meneau: m(0.05) } }], "j"));
    const fs = Object.values(r.etat.objets).filter((o) => o.classe === "fenetre") as Occurrence<"fenetre">[];
    expect(fs).toHaveLength(3);
    expect(fs.every((x) => Math.abs(x.params.largeur.value - 1) < 1e-9)).toBe(true);
    const bords = fs.map((x) => [x.params.position * 10 - 0.5, x.params.position * 10 + 0.5]).sort((u, v) => u[0]! - v[0]!);
    expect(bords[0]![0]).toBeCloseTo(3.45, 9);
    expect(bords[2]![1]).toBeCloseTo(6.55, 9);
    expect(bords[1]![0]! - bords[0]![1]!).toBeCloseTo(0.05, 9);
    expect(new Set(fs.map((x) => x.groupeId)).size).toBe(1);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "ouverture.jumeler", params: { id: "f", nombre: 4, meneau: m(1.1) } }]))).toThrow(/trop larges/);
  });

  it("angle : deux fenêtres partant de la face intérieure de l'autre mur", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "ouverture.angle", params: { murA: "a", murB: "b", largeurA: m(2), largeurB: m(1.5), hauteur: m(1.4), allege: m(0.9) } }], "a")).etat;
    const nouvelles = Object.values(r.objets).filter((o) => o.classe === "fenetre" && o.id !== "f") as Occurrence<"fenetre">[];
    const surA = nouvelles.find((x) => x.params.murHoteId === "a")!;
    const surB = nouvelles.find((x) => x.params.murHoteId === "b")!;
    expect(surA.params.position * 10 + 1).toBeCloseTo(10 - 0.2, 9); // bord à la face du mur b (épaisseur 0,4)
    expect(surB.params.position * 8 - 0.75).toBeCloseTo(0.1, 9); // bord à la face du mur a (épaisseur 0,2)
    expect(surA.groupeId).toBe(surB.groupeId);
    expect(() => appliquerLot(e, lot([{ type: "ouverture.angle", params: { murA: "a", murB: "a", largeurA: m(1), largeurB: m(1), hauteur: m(1) } }]))).toThrow();
  });
});

describe("angle sans poteau (D-106)", () => {
  it("les deux fenêtres vont jusqu'au point d'angle ; le mur s'ouvre jusqu'à l'onglet dans la hauteur des fenêtres", async () => {
    const { maillageObjet } = await import("../projection/maillage.js");
    const zCoin = (etat: ReturnType<typeof base>) => {
      const mai = maillageObjet(etat, etat.objets["a"]!)!;
      const zs = new Set<number>();
      for (let i = 0; i < mai.positions.length; i += 3) if (Math.abs(mai.positions[i]! - 10.2) < 1e-6 && Math.abs(mai.positions[i + 1]! + 0.1) < 1e-6) zs.add(Math.round(mai.positions[i + 2]! * 1000) / 1000);
      return [...zs].sort((u, v) => u - v);
    };
    const e = base();
    const avec = appliquerLot(e, lot([{ type: "ouverture.angle", params: { murA: "a", murB: "b", largeurA: m(2), largeurB: m(1.5), hauteur: m(1.4), allege: m(0.9) } }], "a")).etat;
    const sans = appliquerLot(e, lot([{ type: "ouverture.angle", params: { murA: "a", murB: "b", largeurA: m(2), largeurB: m(1.5), hauteur: m(1.4), allege: m(0.9), sansPoteau: true } }], "s")).etat;
    const ns = Object.values(sans.objets).filter((o) => o.classe === "fenetre" && o.id !== "f") as Occurrence<"fenetre">[];
    expect(ns.find((x) => x.params.murHoteId === "a")!.params.position * 10 + 1).toBeCloseTo(10, 9);
    expect(ns.find((x) => x.params.murHoteId === "b")!.params.position * 8 - 0.75).toBeCloseTo(0, 9);
    expect(sans.groupes[ns[0]!.groupeId!]!.nom).toMatch(/sans poteau/);
    // Avec poteau : le poteau d'angle (triangle de l'onglet) monte sur toute la hauteur.
    expect(zCoin(avec)).toEqual([0, 3]);
    expect(zCoin(sans)).toEqual([0, 0.9, 2.3, 3]);
  });
});
