import { describe, expect, it } from "vitest";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const carre = [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)];
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "esquisse.polygone", params: { id: "s", niveauId: "n0", points: carre } },
    { type: "esquisse.ligne", params: { id: "l", niveauId: "n0", points: [pt(0, 0), pt(1, 0)] } },
    { type: "dalle.creer", params: { id: "d", niveauId: "n0", contour: carre, trous: [[pt(1, 1), pt(2, 1), pt(2, 2)]], epaisseur: m(0.2) } },
  ])).etat;
const chg = (id: string, classe: string, params?: Record<string, unknown>): Commande => ({ type: "objet.changerClasse", params: { id, classe, ...(params ? { params } : {}) } });

describe("changer de classe sur place (D-060)", () => {
  it("esquisse fermée → pièce (nom donné) → zone → dalle (épaisseur donnée) ; même identifiant ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([chg("s", "piece", { nom: "Bureau" })], "p"));
    const piece = r.etat.objets["s"] as Occurrence<"piece">;
    expect(piece).toMatchObject({ classe: "piece", niveauId: "n0", params: { nom: "Bureau", contour: carre, trous: [] } });
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const z = appliquerLot(r.etat, lot([chg("s", "zone", { nom: "Administration" }), chg("s", "dalle", { epaisseur: m(0.25) })], "zd")).etat;
    expect(z.objets["s"]).toMatchObject({ classe: "dalle", params: { epaisseur: m(0.25) } });
  });

  it("dalle à trou → pièce garde le trou ; → esquisse refusée (trou perdu) ; paramètres manquants refusés", () => {
    const e = base();
    const p = appliquerLot(e, lot([chg("d", "piece", { nom: "Atrium" })], "p")).etat;
    expect((p.objets["d"] as Occurrence<"piece">).params.trous).toHaveLength(1);
    expect(() => appliquerLot(e, lot([chg("d", "esquisse")]))).toThrow(/trous/);
    expect(() => appliquerLot(e, lot([chg("s", "dalle")]))).toThrow(/epaisseur/);
    expect(() => appliquerLot(e, lot([chg("s", "zone")]))).toThrow(/nom/);
  });

  it("refus : esquisse ouverte, même classe, objet lié", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([chg("l", "piece", { nom: "X" })]))).toThrow(/ouverte/);
    expect(() => appliquerLot(e, lot([chg("d", "dalle", { epaisseur: m(0.2) })]))).toThrow(/déjà/);
    const k = appliquerLot(e, lot([{ type: "contrainte.ajouter", params: { type: "horizontal", objetA: "s", a: "segment[0]" } }], "k")).etat;
    expect(() => appliquerLot(k, lot([chg("s", "piece", { nom: "X" })]))).toThrow(/lié/);
  });
});

describe("copie de pièces avec nouveau code (D-060)", () => {
  const avecPieces = () =>
    appliquerLot(base(), lot([
      { type: "piece.creer", params: { id: "a", niveauId: "n0", nom: "Bureau", code: "B07", contour: carre } },
      { type: "piece.creer", params: { id: "b", niveauId: "n0", nom: "Bureau", code: "B08", contour: carre.map((q) => pt(q.x + 10, q.y)) } },
      { type: "piece.creer", params: { id: "c", niveauId: "n0", nom: "Hall", code: "HALL", contour: carre.map((q) => pt(q.x + 20, q.y)) } },
    ], "p")).etat;
  const code = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"piece">).params.code;

  it("« suivant » : premier numéro libre, zéros gardés ; sans numéro : suffixe ; copies multiples distinctes", () => {
    const e = avecPieces();
    const r = appliquerLot(e, lot([{ type: "transformer.copier", params: { dx: 0, dy: 10, codes: "suivant" }, cibles: ["a", "c"] }], "s"));
    expect(r.effets.crees.map((id) => code(r.etat, id)).sort()).toEqual(["B09", "HALL-2"]);
    const v = appliquerLot(e, lot([{ type: "transformer.copier", params: { vecteurs: [{ dx: 0, dy: 10 }, { dx: 0, dy: 20 }], codes: "suivant" }, cibles: ["a"] }], "v"));
    expect(v.effets.crees.map((id) => code(v.etat, id))).toEqual(["B09", "B10"]);
  });

  it("« vider » : code à renseigner ; par défaut : gardé (comportement antérieur) ; valeur inconnue refusée", () => {
    const e = avecPieces();
    const r = appliquerLot(e, lot([{ type: "transformer.copier", params: { dx: 0, dy: 10, codes: "vider" }, cibles: ["a"] }], "x"));
    expect(code(r.etat, r.effets.crees[0]!)).toBeNull();
    const g = appliquerLot(e, lot([{ type: "transformer.copier", params: { dx: 0, dy: 10 }, cibles: ["a"] }], "g"));
    expect(code(g.etat, g.effets.crees[0]!)).toBe("B07");
    expect(() => appliquerLot(e, lot([{ type: "transformer.copier", params: { dx: 0, dy: 10, codes: "inventer" }, cibles: ["a"] }]))).toThrow(/codes/);
  });
});
