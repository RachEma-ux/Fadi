import { describe, expect, it } from "vitest";
import { ajouterRectangle, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { etape } from "./commun-formes.js";
import { machineEchelle, poignees } from "./echelle.js";
import { boite, clicVers, contientPoint, emprise, partie, saisie, sommets, survolVers, toutSelectionner, touche } from "./essais-modification.js";

const DEPUIS = v3(1, 1, 1);
const sel = (a: number, b: number, h: number) => {
  const m = boite(a, b, h);
  return { m, ids: toutSelectionner(m) };
};

describe("Échelle (§4.18)", () => {
  it("CA-ECH-4 : exactement 26 poignées (8 coins, 12 arêtes, 6 faces) sur la boîte englobante", () => {
    const { m } = sel(4, 3, 2.7);
    const e = emprise(m);
    const hs = poignees({ min: e.min, max: e.max, centre: v3(2, 1.5, 1.35) });
    expect(hs).toHaveLength(26);
    expect(hs.filter((h) => h.genre === "coin")).toHaveLength(8);
    expect(hs.filter((h) => h.genre === "arete")).toHaveLength(12);
    expect(hs.filter((h) => h.genre === "face")).toHaveLength(6);
    expect(new Set(hs.map((h) => h.id)).size).toBe(26);
    const dessus = hs.find((h) => h.genre === "face" && h.axes.join() === "z" && h.position.z === 2.7);
    expect(dessus?.ancre).toEqual(v3(2, 1.5, 0));
    // La vue dessine ces 26 poignées (3 traits chacune) et la boîte (12 traits).
    const p = partie(machineEchelle, m, toutSelectionner(m));
    expect(p.vue().apercu.lignes).toHaveLength(26 * 3 + 12);
  });

  it("consignes : sans sélection, avec sélection, coin, face, depuis le centre", () => {
    const { m, ids } = sel(4, 3, 2.7);
    expect(partie(machineEchelle, m).vue().consigne).toBe(etape("echelle", 0).consigne);
    const p = partie(machineEchelle, m, ids);
    expect(p.vue().consigne).toBe(etape("echelle", 1).consigne);
    p.jouer(clicVers(v3(4, 3, 2.7), DEPUIS));
    expect(p.vue().consigne).toBe(etape("echelle", 2).consigne);
    expect(p.vue().mesures?.libelle).toBe("Échelle");
    const q = partie(machineEchelle, m, ids).jouer(clicVers(v3(2, 1.5, 2.7), DEPUIS));
    expect(q.vue().consigne).toBe(etape("echelle", 3).consigne);
    q.jouer(touche("Ctrl"));
    expect(q.vue().consigne).toBe(etape("echelle", 4).consigne);
  });

  it("CA-ECH-1 : boîte 4 × 3 × 2,7, coin, 2 → 8 × 6 × 5,4, coin opposé fixe", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(clicVers(v3(4, 3, 2.7), DEPUIS), saisie("2"));
    const e = emprise(p.modele);
    expect([e.min.x, e.min.y, e.min.z, e.max.x, e.max.y, e.max.z]).toEqual([0, 0, 0, 8, 6, 5.4].map((v) => expect.closeTo(v, 9)));
    expect(contientPoint(sommets(p.modele), v3(0, 0, 0))).toBe(true);
    expect(p.operations).toEqual(["Échelle"]);
    expect(p.selection.length).toBeGreaterThan(0); // sélection et poignées gardées
  });

  it("CA-ECH-2 : poignée bleue du dessus, 3m → hauteur 3 exactement, base fixe", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(clicVers(v3(2, 1.5, 2.7), DEPUIS), saisie("3m"));
    const e = emprise(p.modele);
    expect(e.max.z).toBeCloseTo(3, 9);
    expect(e.min.z).toBeCloseTo(0, 9);
    expect(e.max.x).toBeCloseTo(4, 9); // non uniforme : x et y inchangés
    expect(e.max.y).toBeCloseTo(3, 9);
  });

  it("CA-ECH-3 : Ctrl, poignée bleue, 2 → hauteur doublée, centre fixe", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(touche("Ctrl"), clicVers(v3(2, 1.5, 2.7), DEPUIS), saisie("2"));
    const e = emprise(p.modele);
    expect(e.max.z - e.min.z).toBeCloseTo(5.4, 9);
    expect((e.max.z + e.min.z) / 2).toBeCloseTo(1.35, 9);
  });

  it("Maj inverse le mode : poignée de coin non uniforme avec facteurs par axe « 2;3;4 »", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(touche("Maj"), clicVers(v3(4, 3, 2.7), DEPUIS), saisie("2;3;4"));
    const e = emprise(p.modele);
    expect([e.max.x, e.max.y, e.max.z]).toEqual([expect.closeTo(8, 9), expect.closeTo(9, 9), expect.closeTo(10.8, 9)]);
  });

  it("facteur au curseur : poignée de face → facteur de la position du curseur", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(clicVers(v3(2, 1.5, 2.7)), survolVers(v3(2, 1.5, 5.4), v3(1, 0, 0)));
    expect(p.vue().mesures?.valeur).toBe("2.00");
    p.jouer(clicVers(v3(2, 1.5, 5.4), v3(1, 0, 0)));
    expect(emprise(p.modele).max.z).toBeCloseTo(5.4, 6);
  });

  it("facteur nul ou saisie invalide : message, rien d'appliqué ; Échap vide la sélection au repos", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(clicVers(v3(4, 3, 2.7), DEPUIS), saisie("0"));
    expect(p.historique).toHaveLength(1);
    expect(p.vue().erreur).not.toBeNull();
    const q = partie(machineEchelle, m, ids).jouer({ genre: "echap" });
    expect(q.selection).toEqual([]);
  });

  it("correction après coup : un facteur unique remplace la dernière mise à l'échelle", () => {
    const { m, ids } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m, ids).jouer(clicVers(v3(4, 3, 2.7), DEPUIS), saisie("2"), saisie("3"));
    expect(p.historique).toHaveLength(2);
    expect(emprise(p.modele).max.x).toBeCloseTo(12, 9);
  });

  it("sans sélection, un clic choisit l'objet puis les poignées apparaissent", () => {
    const { m } = sel(4, 3, 2.7);
    const p = partie(machineEchelle, m).jouer(clicVers(v3(2, 1.5, 2.7)));
    expect(p.selection.length).toBeGreaterThan(0);
  });
});

describe("Échelle — sélection plate", () => {
  it("une face au sol n'a que 8 poignées : 4 coins (uniformes, x et y) et 4 milieux (un axe), aucune sur z", () => {
    const hs = poignees({ min: v3(0, 0, 0), max: v3(4, 3, 0), centre: v3(2, 1.5, 0) });
    expect(hs).toHaveLength(8);
    expect(hs.filter((h) => h.genre === "coin")).toHaveLength(4);
    expect(hs.filter((h) => h.genre === "face")).toHaveLength(4);
    expect(hs.every((h) => !h.axes.includes("z"))).toBe(true);
    const milieu = hs.find((h) => h.position.x === 4 && h.position.y === 1.5);
    expect(milieu?.axes).toEqual(["x"]);
    expect(milieu?.ancre).toEqual(v3(0, 1.5, 0));
  });
  it("face au sol : poignée du milieu du bord droit + « 10m » → largeur 10, hauteur inchangée", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const ids = Object.keys(m.racine.faces);
    const p = partie(machineEchelle, m, ids).jouer(clicVers(v3(4, 1.5, 0)), survolVers(v3(6, 1.5, 0)), saisie("10m"));
    const e = emprise(p.modele);
    expect(e.max.x).toBeCloseTo(10, 6);
    expect(e.max.y).toBeCloseTo(3, 6);
    expect(p.operations).toHaveLength(1);
  });
});
