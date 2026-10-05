import { describe, expect, it } from "vitest";
import { syntheseZone } from "../echanges/proprietes-csv.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, identifiantsCibles, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = (x: number, y: number, c: number) => [pt(x, y), pt(x + c, y), pt(x + c, y + c), pt(x, y + c)];
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3 } },
    { type: "piece.creer", params: { id: "p0", niveauId: "n0", nom: "Bureau", contour: carre(0, 0, 4) } },
    { type: "piece.creer", params: { id: "p1", niveauId: "n1", nom: "Salle", contour: carre(0, 0, 5) } },
    { type: "piece.creer", params: { id: "p2", niveauId: "n1", nom: "Archives", contour: carre(10, 0, 3) } },
    { type: "zone.creer", params: { id: "zA", niveauId: "n0", nom: "Administration", contour: carre(-1, -1, 6) } },
    { type: "zone.creer", params: { id: "zB", niveauId: "n1", nom: "Étage administratif", contour: carre(50, 50, 1) } },
  ])).etat;
const Z = (e: ModeleAtelier, id: string) => e.objets[id] as Occurrence<"zone">;

describe("appartenance aux zones (D-056)", () => {
  it("zone sur plusieurs niveaux : une pièce d'un autre niveau rattachée compte dans la synthèse ; inverse exact", () => {
    const e = base();
    expect(syntheseZone(e, Z(e, "zA")).pieces.map((p) => p.id)).toEqual(["p0"]);
    const r = appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "zA", ajouter: ["p1"] } }], "a"));
    const s = syntheseZone(r.etat, Z(r.etat, "zA"));
    expect(s.pieces.map((p) => [p.id, p.par, p.niveauId])).toEqual([["p0", "contour", "n0"], ["p1", "relation", "n1"]]);
    expect(s.aireTotale).toBe(41);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(identifiantsCibles(lot([{ type: "zone.affecter", params: { zoneId: "zA", ajouter: ["p1"] } }]))).toEqual(expect.arrayContaining(["zA", "p1"]));
  });

  it("zones imbriquées : la sous-zone apporte ses pièces (une fois chacune) ; cycle refusé", () => {
    const e = appliquerLot(base(), lot([
      { type: "zone.affecter", params: { zoneId: "zB", ajouter: ["p2", "p1"] } },
      { type: "zone.affecter", params: { zoneId: "zA", ajouter: ["zB", "p1"] } },
    ], "i")).etat;
    const s = syntheseZone(e, Z(e, "zA"));
    expect(s.sousZones).toEqual([{ id: "zB", nom: "Étage administratif" }]);
    expect(s.pieces.map((p) => [p.id, p.par])).toEqual([["p0", "contour"], ["p1", "relation"], ["p2", "sous-zone"]]);
    expect(s.aireTotale).toBe(16 + 25 + 9);
    expect(() => appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "zB", ajouter: ["zA"] } }]))).toThrow(/cycle/);
    expect(() => appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "zA", ajouter: ["zA"] } }]))).toThrow(/elle-même/);
  });

  it("retirer ; refus : membre absent ou déjà présent, classe non admise, zone inconnue ; suppression d'une pièce retire le lien", () => {
    const e = appliquerLot(base(), lot([{ type: "zone.affecter", params: { zoneId: "zA", ajouter: ["p1"] } }], "a")).etat;
    const sans = appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "zA", retirer: ["p1"] } }], "r")).etat;
    expect(Object.values(sans.relations).filter((r) => r.kind === "contient")).toHaveLength(0);
    expect(() => appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "zA", retirer: ["p2"] } }]))).toThrow(/n'appartient pas/);
    expect(() => appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "zA", ajouter: ["p1"] } }]))).toThrow(/déjà/);
    expect(() => appliquerLot(e, lot([{ type: "zone.affecter", params: { zoneId: "p0", ajouter: ["p1"] } }]))).toThrow(/zone inconnue/);
    const avecMur = appliquerLot(e, lot([{ type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: { value: 0.2, unit: "m" } } }], "w")).etat;
    expect(() => appliquerLot(avecMur, lot([{ type: "zone.affecter", params: { zoneId: "zA", ajouter: ["w"] } }]))).toThrow(/pièces, des espaces/);
    const supp = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "p1" } }], "s")).etat;
    expect(Object.values(supp.relations).filter((r) => r.kind === "contient")).toHaveLength(0);
  });
});
