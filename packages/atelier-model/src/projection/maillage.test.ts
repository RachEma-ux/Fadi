import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { aire } from "../geometrie.js";
import { importerModeleNatif, type JeuNatif } from "../import/natif.js";
import { modeleVide, type ModeleAtelier } from "../modele.js";
import { m, pt } from "../unites.js";
import { couper, englobant, maillageObjet, maillagesModele, trianguler } from "./maillage.js";

const lot = (etat: ModeleAtelier, commands: Commande[]) => appliquerLot(etat, { requestId: "r", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "t", commands }).etat;
const aireTriangles = (pts: { x: number; y: number }[], tri: number[]) => {
  let s = 0;
  for (let k = 0; k < tri.length; k += 3) s += aire([pts[tri[k]!]!, pts[tri[k + 1]!]!, pts[tri[k + 2]!]!]);
  return s;
};
/** Volume d'un maillage fermé (théorème de la divergence). */
const volume = (pos: number[], ind: number[]) => {
  let v = 0;
  for (let k = 0; k < ind.length; k += 3) {
    const [a, b, c] = [ind[k]!, ind[k + 1]!, ind[k + 2]!].map((i) => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!]) as [number[], number[], number[]];
    v += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
  }
  return Math.abs(v);
};

describe("triangulation", () => {
  it("couvre exactement l'aire d'un polygone concave, dans les deux sens", () => {
    const l = [pt(0, 0), pt(4, 0), pt(4, 1), pt(1, 1), pt(1, 3), pt(0, 3)];
    expect(aireTriangles(l, trianguler(l))).toBeCloseTo(6);
    const inverse = [...l].reverse();
    expect(aireTriangles(inverse, trianguler(inverse))).toBeCloseTo(6);
  });

  it("retire les trous (aire nette)", () => {
    const ext = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];
    const t1 = [pt(2, 2), pt(4, 2), pt(4, 4), pt(2, 4)];
    const t2 = [pt(6, 6), pt(8, 6), pt(8, 8), pt(6, 8)].reverse();
    const tri = trianguler(ext, [t1, t2]);
    expect(aireTriangles([...ext, ...t1, ...t2], tri)).toBeCloseTo(92);
  });
});

describe("maillages des objets", () => {
  const socle = lot(modeleVide(), [
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "r1", nom: "R+1", elevation: 3, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "rdc", a: pt(0, 0), b: pt(5, 0), epaisseur: m(0.2), hauteur: m(2.5) } },
  ]);

  it("un mur plein est une boîte de longueur × épaisseur × hauteur", () => {
    const mm = maillageObjet(socle, socle.objets["w"]!)!;
    expect(volume(mm.positions, mm.indices)).toBeCloseTo(5 * 0.2 * 2.5);
    expect(englobant([mm])).toEqual({ min: [0, -0.1, 0], max: [5, 0.1, 2.5] });
  });

  it("les ouvertures hébergées creusent le mur ; la porte et la fenêtre ont leur propre maillage", () => {
    const etat = lot(socle, [
      { type: "ouverture.poser", params: { classe: "porte", murHoteId: "w", position: 0.2, largeur: m(1), hauteur: m(2) } },
      { type: "ouverture.poser", params: { classe: "fenetre", murHoteId: "w", position: 0.7, largeur: m(1.5), hauteur: m(1), allege: m(1) } },
    ]);
    const mur = maillageObjet(etat, etat.objets["w"]!)!;
    expect(volume(mur.positions, mur.indices)).toBeCloseTo(0.2 * (5 * 2.5 - 1 * 2 - 1.5 * 1));
    const portes = maillagesModele(etat).filter((x) => x.classe === "porte" || x.classe === "fenetre");
    expect(portes).toHaveLength(2);
    expect(portes.find((x) => x.classe === "fenetre")!.opacite).toBeLessThan(1);
  });

  it("le niveau haut fixe le sommet du mur ; sans hauteur ni niveau haut, aucun volume", () => {
    const etat = lot(socle, [
      { type: "objet.modifier", params: { id: "w", params: { niveauHautId: "r1" } } },
      { type: "mur.tracer", params: { id: "plan", niveauId: "rdc", a: pt(0, 2), b: pt(5, 2), epaisseur: m(0.2), hauteur: null } },
    ]);
    expect(englobant([maillageObjet(etat, etat.objets["w"]!)!])!.max[2]).toBe(3);
    expect(maillageObjet(etat, etat.objets["plan"]!)).toBeNull();
  });

  it("escalier : autant de marches que de contremarches, jusqu'à la hauteur à franchir", () => {
    const etat = lot(socle, [{ type: "escalier.creer", params: { id: "e", niveauId: "rdc", a: pt(0, 1), b: pt(4, 1), largeur: m(1), hauteurAFranchir: m(3), niveauDepartId: "rdc", niveauArriveeId: "r1", contremarches: 18 } }]);
    const mm = maillageObjet(etat, etat.objets["e"]!)!;
    expect(mm.indices.length / 36).toBe(18);
    expect(englobant([mm])!.max[2]).toBeCloseTo(3);
  });

  it("coupe verticale à travers le mur : profil de hauteur 2,5 m", () => {
    const mm = maillageObjet(socle, socle.objets["w"]!)!;
    const seg = couper(mm, { point: [2.5, 0, 0], normale: [1, 0, 0] });
    const zs = [];
    for (let k = 0; k < seg.length; k += 3) zs.push(seg[k + 2]!);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2.5);
    for (let k = 0; k < seg.length; k += 3) expect(seg[k]).toBeCloseTo(2.5);
  });
});

describe("P.118", () => {
  const JEU = JSON.parse(readFileSync(new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif;
  const { modele } = importerModeleNatif(JEU);

  it("chaque niveau a des volumes, sans coordonnée invalide, du sous-sol (−3,2 m) au R+3", () => {
    const tous = maillagesModele(modele);
    for (const n of Object.keys(modele.niveaux)) expect(tous.filter((x) => x.niveauId === n).length).toBeGreaterThan(10);
    for (const x of tous) for (const v of x.positions) expect(Number.isFinite(v)).toBe(true);
    const e = englobant(tous)!;
    expect(e.min[2]).toBeLessThanOrEqual(-3.2);
    expect(e.max[2]).toBeGreaterThan(13.2);
  });

  it("tous les murs et poteaux ont un volume (hauteurs importées)", () => {
    const murs = Object.values(modele.objets).filter((o) => o.classe === "mur" || o.classe === "poteau");
    expect(murs.every((o) => maillageObjet(modele, o) !== null)).toBe(true);
  });
});
