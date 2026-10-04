import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { importerModeleNatif, type JeuNatif } from "./import/natif.js";
import { modeleVide, objetsDeClasse, type ModeleAtelier, type Occurrence } from "./modele.js";
import { croisementsDuNiveau, facesMurRaccordees, polygoneMurRaccorde, raccordMur, raccordsDuNiveau } from "./raccords.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[]) => ({ requestId: "r", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "r", commands });
const mur = (id: string, a: [number, number], b: [number, number], alignement = "axe") => ({ type: "mur.tracer", params: { id, niveauId: "n0", a: pt(...a), b: pt(...b), epaisseur: m(0.2), hauteur: m(3), alignement } });
const modele = (...murs: Commande[]): ModeleAtelier => appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } }, ...murs])).etat;
const M = (e: ModeleAtelier, id: string) => e.objets[id] as Occurrence<"mur">;
const proche = (p: { x: number; y: number }, x: number, y: number) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9;

describe("raccords de murs (géométrie dérivée)", () => {
  it("angle : coupe d'onglet, faces extérieures et intérieures se rejoignent ; les paramètres ne changent pas", () => {
    const e = modele(mur("h", [0, 0], [4, 0]), mur("v", [0, 0], [0, 3]));
    const h = facesMurRaccordees(e, M(e, "h"));
    const v = facesMurRaccordees(e, M(e, "v"));
    // h : face gauche (y = +0,1, intérieure) commence en x = 0,1 ; face droite (y = -0,1, extérieure) en x = -0,1.
    expect(proche(h.gauche[0], 0.1, 0.1)).toBe(true);
    expect(proche(h.droite[0], -0.1, -0.1)).toBe(true);
    // v : les mêmes coins, vus depuis l'autre mur.
    const coins = [...v.gauche, ...v.droite];
    expect(coins.some((p) => proche(p, 0.1, 0.1))).toBe(true);
    expect(coins.some((p) => proche(p, -0.1, -0.1))).toBe(true);
    expect(raccordMur(e, M(e, "h"))!.extremites).toEqual(["angle", "libre"]);
    expect(M(e, "h").params.a).toEqual(pt(0, 0));
  });

  it("té : le mur aboutissant s'arrête sur la face du mur traversant (axe ou face) ; le traversant est inchangé", () => {
    for (const fin of [0, 0.1]) {
      const e = modele(mur("t", [0, 0], [6, 0]), mur("a", [3, 4], [3, fin]));
      const a = facesMurRaccordees(e, M(e, "a"));
      expect(Math.abs(a.gauche[1].y - 0.1)).toBeLessThan(1e-9);
      expect(Math.abs(a.droite[1].y - 0.1)).toBeLessThan(1e-9);
      expect(raccordMur(e, M(e, "t"))!.extremites).toEqual(["libre", "libre"]);
      expect(raccordMur(e, M(e, "a"))!.extremites[1]).toBe("te");
    }
  });

  it("nœud de trois murs (une paire alignée) : la paire se prolonge, le troisième s'arrête sur sa face ; croisement de quatre : nœud (D-032)", () => {
    const n3 = modele(mur("g", [0, 0], [4, 0]), mur("d", [4, 0], [8, 0]), mur("t", [4, 0], [4, 3]));
    expect(raccordMur(n3, M(n3, "g"))!.extremites).toEqual(["libre", "libre"]);
    expect(raccordMur(n3, M(n3, "d"))!.extremites).toEqual(["libre", "libre"]);
    expect(raccordMur(n3, M(n3, "t"))!.extremites[0]).toBe("te");
    const t = facesMurRaccordees(n3, M(n3, "t"));
    expect(Math.abs(t.gauche[0].y - 0.1)).toBeLessThan(1e-9);
    expect(Math.abs(t.droite[0].y - 0.1)).toBeLessThan(1e-9);
    const n4 = modele(mur("a1", [0, 0], [4, 0]), mur("a2", [4, 0], [8, 0]), mur("b1", [4, 0], [4, 3]), mur("b2", [4, 0], [4, -3]));
    // Deux paires alignées : chaque face s'arrête sur la face voisine, le contour passe par le nœud.
    const r4 = raccordMur(n4, M(n4, "b1"))!;
    expect(r4.extremites[0]).toBe("noeud");
    expect(r4.gauche[0]).toBeCloseTo(0.1, 9);
    expect(r4.droite[0]).toBeCloseTo(0.1, 9);
    const p4 = polygoneMurRaccorde(n4, M(n4, "b1"));
    expect(p4).toHaveLength(5);
    expect(p4.some((q) => proche(q, 4, 0))).toBe(true);
  });

  it("nœud de trois murs sans paire alignée (Y) : faces arrêtées sur les voisines, cœur du nœud couvert sans vide (D-032)", () => {
    const c = (deg: number): [number, number] => [Math.round(3 * Math.cos((deg * Math.PI) / 180) * 1e9) / 1e9, Math.round(3 * Math.sin((deg * Math.PI) / 180) * 1e9) / 1e9];
    const y = modele(mur("y0", [0, 0], c(0)), mur("y1", [0, 0], c(120)), mur("y2", c(240), [0, 0]));
    for (const id of ["y0", "y1", "y2"]) {
      const r = raccordMur(y, M(y, id))!;
      const fin = id === "y2" ? 1 : 0;
      expect(r.extremites[fin]).toBe("noeud");
      const L = 3;
      const attendu = 0.1 / Math.tan(Math.PI / 3);
      expect(Math.abs(r.gauche[fin] - (fin ? L - attendu : attendu))).toBeLessThan(1e-6);
      expect(Math.abs(r.droite[fin] - (fin ? L - attendu : attendu))).toBeLessThan(1e-6);
    }
    // Le cœur (centre du triangle entre les faces) est dans au moins un contour.
    const dedans = (poly: { x: number; y: number }[], q: { x: number; y: number }) => {
      let d = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const A = poly[i]!;
        const B = poly[j]!;
        if (A.y > q.y !== B.y > q.y && q.x < ((B.x - A.x) * (q.y - A.y)) / (B.y - A.y) + A.x) d = !d;
      }
      return d;
    };
    for (const q of [{ x: 0.01, y: 0.005 }, { x: -0.02, y: 0.01 }, { x: 0.005, y: -0.03 }]) expect(["y0", "y1", "y2"].some((id) => dedans(polygoneMurRaccorde(y, M(y, id)), q))).toBe(true);
  });

  it("alignés, croisement et nœud de trois murs : extrémités inchangées ou « non traitées »", () => {
    const e = modele(mur("a", [0, 0], [4, 0]), mur("b", [4, 0], [8, 0]), mur("x1", [10, -2], [10, 2]), mur("x2", [8, 0], [8, 3]), mur("x3", [8, 0], [8, -3]));
    expect(raccordMur(e, M(e, "a"))!.extremites).toEqual(["libre", "libre"]);
    // b, x2 et x3 se rejoignent en (8 ; 0) : x2 et x3 forment la paire alignée, b s'arrête sur leur face.
    expect(raccordMur(e, M(e, "b"))!.extremites[1]).toBe("te");
    const p = polygoneMurRaccorde(e, M(e, "x1"));
    expect(p).toHaveLength(4);
  });

  it("P.118 : chaque mur garde un quadrilatère valide ; des angles et des tés sont raccordés ; cache par état", () => {
    const p118 = importerModeleNatif(JSON.parse(readFileSync(new URL("../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif).modele;
    let angles = 0;
    let tes = 0;
    for (const n of Object.keys(p118.niveaux)) {
      const r = raccordsDuNiveau(p118, n);
      expect(raccordsDuNiveau(p118, n)).toBe(r);
      for (const x of r.values()) {
        angles += x.extremites.filter((t) => t === "angle").length;
        tes += x.extremites.filter((t) => t === "te").length;
        expect(x.gauche[1]).toBeGreaterThan(x.gauche[0]);
        expect(x.droite[1]).toBeGreaterThan(x.droite[0]);
      }
    }
    expect(angles).toBeGreaterThan(0);
    expect(tes + angles).toBeGreaterThan(objetsDeClasse(p118, "mur").length / 4);
  });

  it("croisement de deux murs qui se traversent : zone commune donnée pour le dessin ; ni té, ni angle, ni nœud (D-034)", () => {
    const e = modele(mur("h", [0, 0], [4, 0]), mur("v", [2, -2], [2, 2]), mur("t", [0, 3], [0, 0.1]), mur("l", [4, 0], [4, 3]));
    const c = croisementsDuNiveau(e, "n0");
    expect(c).toHaveLength(1);
    expect(c[0]!.murs.sort()).toEqual(["h", "v"]);
    let aire = 0;
    const p = c[0]!.polygone;
    for (let k = 0; k < p.length; k++) aire += p[k]!.x * p[(k + 1) % p.length]!.y - p[(k + 1) % p.length]!.x * p[k]!.y;
    expect(Math.abs(aire) / 2).toBeCloseTo(0.04, 9);
    expect(raccordMur(e, M(e, "v"))!.extremites).toEqual(["libre", "libre"]);
    expect(croisementsDuNiveau(e, "n0")).toBe(c); // cache par état
  });
});
