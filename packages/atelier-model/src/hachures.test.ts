import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { lignesHachure, motifHachure } from "./hachures.js";
import { modeleVide } from "./modele.js";
import { pt } from "./unites.js";

const carre = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)];

describe("motifs de hachure (D-072, DA-01-11)", () => {
  it("traits horizontaux au pas, ancrés sur l'origine, découpés par le contour et ses trous", () => {
    const l = lignesHachure([carre], 0, 2.5);
    expect(l.map(([a]) => a.y)).toEqual([2.5, 5, 7.5]); // y = 0 et 10 sont sur le bord (aucune longueur)
    expect(l.every(([a, b]) => Math.abs(b.x - a.x) === 10)).toBe(true);
    const trou = [pt(4, 4), pt(6, 4), pt(6, 6), pt(4, 6)];
    const avecTrou = lignesHachure([carre, trou], 0, 5);
    expect(avecTrou.map(([a, b]) => [a.x, b.x])).toEqual([[0, 4], [6, 10]]);
    expect(lignesHachure([carre], 45, 1).length).toBeGreaterThan(10);
    expect(motifHachure("xyz")).toMatchObject({ id: "diagonale", connu: false });
    expect(motifHachure(null)).toMatchObject({ id: "diagonale", connu: true });
  });

  it("dans une vue 1:50, le pas papier de 2 mm devient 0,1 m ; motif inconnu signalé", () => {
    const lot = (commands: unknown[], id: string) => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands: commands as never });
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
      { type: "esquisse.hachure", params: { id: "h", niveauId: "n0", points: [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)], motif: "horizontale" } },
      { type: "esquisse.hachure", params: { id: "x", niveauId: "n0", points: [pt(5, 0), pt(6, 0), pt(6, 1), pt(5, 1)], motif: "ANSI31" } },
      { type: "vue.creer", params: { id: "v", type: "plan", titre: "Rez", echelle: 50, niveauId: "n0" } },
    ], "a")).etat;
    const g = genererVue(e, e.definitions["v"]!.params as unknown as ParamsVue, "v");
    const traits = g.primitives.filter((p) => p.type === "ligne" && (p as { objetId?: string }).objetId === "h");
    expect(traits).toHaveLength(9); // y = 0,1 … 0,9
    expect(g.avertissements.some((a) => /ANSI31/.test(a))).toBe(true);
  });
});

describe("hachures associatives et motif de points (D-092)", () => {
  it("la hachure liée suit le contour de sa dalle ; source supprimée : lien perdu ; points dans une vue", () => {
    const lot = (commands: unknown[], id: string) => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands: commands as never });
    const e = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
      { type: "dalle.creer", params: { id: "d", niveauId: "n0", contour: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)], trous: [], epaisseur: { value: 0.2, unit: "m" } } },
      { type: "esquisse.hachure", params: { id: "h", niveauId: "n0", points: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)], sourceId: "d", motif: "points" } },
      { type: "vue.creer", params: { id: "v", type: "plan", titre: "Rez", echelle: 50, niveauId: "n0" } },
    ], "a")).etat;
    const r = appliquerLot(e, lot([{ type: "transformer.deplacer", params: { dx: 10, dy: 0 }, cibles: ["d"] }], "m"));
    expect((r.etat.objets["h"]!.params as { points: { x: number }[] }).points[0]!.x).toBe(10);
    expect(appliquerLot(r.etat, lot([r.inverse], "i")).etat).toEqual(e);
    const s = appliquerLot(e, lot([{ type: "objet.supprimer", params: { id: "d" } }], "s")).etat;
    expect("sourceId" in s.objets["h"]!.params).toBe(false);
    const g = genererVue(e, e.definitions["v"]!.params as unknown as ParamsVue, "v");
    expect(g.primitives.filter((p) => p.type === "cercle" && (p as { objetId?: string }).objetId === "h").length).toBeGreaterThan(100);
    expect(() => appliquerLot(e, lot([{ type: "esquisse.hachure", params: { niveauId: "n0", points: [pt(0, 0), pt(1, 0), pt(1, 1)], sourceId: "zz" } }], "x"))).toThrow(/inconnu/);
  });
});
