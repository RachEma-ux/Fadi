import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { pt } from "../unites.js";
import { commandesNumerotationPieces, commandesProprietesCsv, syntheseZone } from "./proprietes-csv.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = (x: number, y: number, c = 4) => [pt(x, y), pt(x + c, y), pt(x + c, y + c), pt(x, y + c)];
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "piece.creer", params: { id: "p1", niveauId: "n0", contour: carre(0, 4), trous: [], nom: "Séjour", code: null } },
    { type: "piece.creer", params: { id: "p2", niveauId: "n0", contour: carre(4, 4), trous: [], nom: "Cuisine", code: null } },
    { type: "piece.creer", params: { id: "p3", niveauId: "n0", contour: carre(0, 0), trous: [], nom: "Chambre", code: "A9" } },
    { type: "piece.creer", params: { id: "p4", niveauId: "n0", contour: carre(20, 0), trous: [], nom: "Garage", code: null } },
    { type: "zone.creer", params: { id: "z", niveauId: "n0", contour: [pt(0, 0), pt(8, 0), pt(8, 8), pt(0, 8)], trous: [], nom: "Logement" } },
  ])).etat;

describe("propriétés en tableau, numérotation, synthèse de zone (D-045)", () => {
  it("import CSV : lignes valides en commandes, refus nominatifs (objet inconnu, nombre sans unité, valeur vide)", () => {
    const e = base();
    const csv = "id;propriete;valeur;unite\np1;Revêtement;Parquet chêne;\np1;Hauteur sous plafond;2,6;m\np2;Ventilée;oui;\nzz;X;1;m\np2;Surface relevée;12;\np2;Vide;;\n";
    const { commandes, rapport } = commandesProprietesCsv(e, csv);
    expect(rapport).toMatchObject({ lignes: 6, retenues: 3 });
    expect(rapport.refus.map((r) => r.ligne)).toEqual([5, 6, 7]);
    expect(rapport.refus[1]!.motif).toMatch(/sans unité/);
    const r = appliquerLot(e, lot(commandes, "csv")).etat;
    expect(r.objets["p1"]!.proprietes["Hauteur sous plafond"]).toMatchObject({ valeur: 2.6, unite: "m", provenance: "import", statut: "declaree" });
    expect(r.objets["p2"]!.proprietes["Ventilée"]!.valeur).toBe(true);
    expect(() => commandesProprietesCsv(e, "a,b\n1,2")).toThrow(/En-tête/);
    expect(commandesProprietesCsv(e, 'id,propriete,valeur\np1,"Note, libre","a ""b"""\n').commandes[0]!.params).toMatchObject({ nom: "Note, libre", valeur: 'a "b"' });
  });

  it("numérotation des pièces dans l'ordre de lecture ; code déjà porté refusé", () => {
    const e = base();
    const c = commandesNumerotationPieces(e, ["p2", "p1", "p4"], "R", 1, 2);
    expect(c.map((x) => [(x.params as { id: string }).id, (x.params as { params: { code: string } }).params.code])).toEqual([["p1", "R01"], ["p2", "R02"], ["p4", "R03"]]);
    expect(() => commandesNumerotationPieces(e, ["p1"], "A", 9)).toThrow(/déjà porté/);
    const r = appliquerLot(e, lot(c, "n")).etat;
    expect((r.objets["p4"] as Occurrence<"piece">).params.code).toBe("R03");
  });

  it("synthèse d'une zone : pièces entièrement dedans (bords partagés compris), aire totale", () => {
    const e = base();
    const s = syntheseZone(e, e.objets["z"] as Occurrence<"zone">);
    expect(s.pieces.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);
    expect(s.aireTotale).toBe(48);
  });
});
