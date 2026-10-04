import { describe, expect, it } from "vitest";
import { exporterBibliotheque, modeleDepuisBibliotheque } from "../echanges/bibliotheque.js";
import { couperContour, unionContoursAdjacents } from "../geometrie.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { planifierReprise } from "../reprise.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const rect = (x0: number, y0: number, x1: number, y1: number) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)];
const base = (...c: Commande[]): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }, ...c])).etat;
const P = (e: ModeleAtelier, id: string) => e.objets[id] as Occurrence<"piece">;

describe("pièces : fusion et scission ; fichier de bibliothèque (D-050)", () => {
  it("union de contours adjacents (côté entier ou partiel) ; sans côté commun → null ; coupe par une droite", () => {
    expect(unionContoursAdjacents(rect(0, 0, 4, 4), rect(4, 0, 8, 4))!.map((q) => [q.x, q.y])).toEqual([[0, 0], [8, 0], [8, 4], [0, 4]]);
    expect(unionContoursAdjacents(rect(0, 0, 4, 4), rect(4, 1, 6, 3))!).toHaveLength(8);
    expect(unionContoursAdjacents(rect(0, 0, 4, 4), rect(5, 0, 8, 4))).toBeNull();
    const [a, b] = couperContour(rect(0, 0, 4, 4), pt(1, -1), pt(1, 5))!;
    expect(a.length + b.length).toBe(8);
    expect(couperContour(rect(0, 0, 4, 4), pt(9, -1), pt(9, 5))).toBeNull();
  });

  it("fusionner deux pièces adjacentes, scinder une pièce ; aire déclarée et pièce liée refusées ; inverses exacts", () => {
    const e = base(
      { type: "piece.creer", params: { id: "a", niveauId: "n0", contour: rect(0, 0, 4, 4), trous: [], nom: "Séjour", code: "R01" } },
      { type: "piece.creer", params: { id: "b", niveauId: "n0", contour: rect(4, 0, 8, 4), trous: [], nom: "Cuisine", code: "R02" } },
    );
    const f = appliquerLot(e, lot([{ type: "piece.fusionner", params: { ids: ["a", "b"] } }], "f"));
    expect(P(f.etat, "a").params.contour.map((q) => [q.x, q.y])).toEqual([[0, 0], [8, 0], [8, 4], [0, 4]]);
    expect(f.etat.objets["b"]).toBeUndefined();
    expect(appliquerLot(f.etat, lot([f.inverse], "i")).etat).toEqual(e);
    const s = appliquerLot(f.etat, lot([{ type: "piece.scinder", params: { id: "a", a: pt(5, -1), b: pt(5, 5), nouvelId: "c" } }], "s"));
    expect(P(s.etat, "c").params).toMatchObject({ nom: "Séjour", code: null });
    expect(appliquerLot(s.etat, lot([s.inverse], "i2")).etat).toEqual(f.etat);
    const d = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "b", params: { aireDeclaree: { value: 16, unit: "m2" } } } }], "d")).etat;
    expect(() => appliquerLot(d, lot([{ type: "piece.fusionner", params: { ids: ["a", "b"] } }]))).toThrow(/aire déclarée/);
  });

  it("fichier de bibliothèque : export (types, blocs, calques du contenu) puis reprise dans un autre projet", () => {
    const src = base(
      { type: "calque.creer", params: { id: "mob", nom: "Mobilier" } },
      { type: "type.definir", params: { id: "t", classe: "mur", nom: "Béton 20" } },
      { type: "esquisse.ligne", params: { id: "e", niveauId: "n0", points: [pt(0, 0), pt(1, 0)], calqueId: "mob" } },
      { type: "bloc.definir", params: { id: "table", nom: "Table", cibles: ["e"], pointDeBase: pt(0, 0), bibliotheque: "Mobilier" } },
      { type: "vue.creer", params: { id: "v", type: "plan", titre: "P", echelle: 100, niveauId: "n0" } },
    );
    const fichier = exporterBibliotheque(src, "Agence");
    expect(fichier.definitions.map((d) => d.id).sort()).toEqual(["t", "table"]);
    expect(fichier.calques.map((c) => c.nom)).toEqual(["Mobilier"]);
    const { modele, nom } = modeleDepuisBibliotheque(JSON.stringify(fichier));
    const cible = base();
    const plan = planifierReprise(modele, cible, { familles: ["definitions"], origine: { projet: "fichier", nom, revision: 0 } });
    const r = appliquerLot(cible, lot([plan.commande!], "b")).etat;
    expect(Object.values(r.definitions).map((d) => d.nom).sort()).toEqual(["Béton 20", "Table"]);
    expect(() => modeleDepuisBibliotheque("{}")).toThrow(/Format inconnu/);
    expect(() => modeleDepuisBibliotheque(JSON.stringify({ ...fichier, definitions: [{ id: "x" }] }))).toThrow(/invalide/);
    void m;
  });
});
