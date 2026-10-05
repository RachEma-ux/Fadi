import { describe, expect, it } from "vitest";
import { verifierModele } from "../archive.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { genererVue, type ParamsVue } from "../documents/vues.js";
import { dxfNiveau } from "../echanges/plan.js";
import { distance, pointsPolyligne } from "../geometrie.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } },
    { type: "esquisse.rectangle", params: { id: "rect", niveauId: "n0", points: [pt(0, 0), pt(4, 3)] } },
    { type: "esquisse.polyligne", params: { id: "pl", niveauId: "n0", points: [pt(0, 10), pt(4, 10), pt(4, 14)] } },
    { type: "vue.creer", params: { id: "v", type: "plan", titre: "Rez", echelle: 50, niveauId: "n0" } },
  ])).etat;
const E = (e: ModeleAtelier, id: string) => (e.objets[id] as Occurrence<"esquisse">).params;

describe("segments en arc dans une polyligne (D-063)", () => {
  it("rectangle à coins arrondis : polyligne fermée de 8 sommets, 4 arcs de 90° (renflement tan 22,5°) ; inverse exact", () => {
    const e = base();
    const r = appliquerLot(e, lot([{ type: "esquisse.arrondirSommets", params: { id: "rect", rayon: m(0.5) } }], "a"));
    const q = E(r.etat, "rect");
    expect(q).toMatchObject({ forme: "polyligne", ferme: true });
    expect(q.points).toHaveLength(8);
    expect(q.renflements!.filter((b) => b !== 0).map((b) => b.toFixed(6))).toEqual(Array(4).fill(Math.tan(Math.PI / 8).toFixed(6)));
    // Tous les points discrétisés restent dans le rectangle et à ≥ 0,5 m du coin.
    const d = pointsPolyligne(q.points, true, q.renflements);
    expect(d.every((p) => p.x >= -1e-9 && p.x <= 4 + 1e-9 && p.y >= -1e-9 && p.y <= 3 + 1e-9)).toBe(true);
    expect(Math.min(...d.map((p) => distance(p, pt(0, 0))))).toBeCloseTo(0.5 * Math.SQRT2 - 0.5, 3);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(verifierModele(JSON.parse(JSON.stringify(r.etat))).ok).toBe(true);
  });

  it("polyligne ouverte : seul le sommet intérieur s'arrondit ; virage à droite = renflement négatif", () => {
    const r = appliquerLot(base(), lot([{ type: "esquisse.arrondirSommets", params: { id: "pl", rayon: m(1) } }], "o")).etat;
    const q = E(r, "pl");
    expect(q.points).toEqual([pt(0, 10), pt(3, 10), pt(4, 11), pt(4, 14)]);
    expect(q.renflements![1]).toBeCloseTo(Math.tan(Math.PI / 8), 9);
    const droite = appliquerLot(base(), lot([{ type: "esquisse.polyligne", params: { id: "d", niveauId: "n0", points: [pt(0, 0), pt(4, 0), pt(4, -4)] } }, { type: "esquisse.arrondirSommets", params: { id: "d", rayon: m(1) } }], "d")).etat;
    expect(E(droite, "d").renflements![1]).toBeCloseTo(-Math.tan(Math.PI / 8), 9);
  });

  it("refus : rayon trop grand, extrémité ouverte visée, renflements incohérents ; miroir inverse les arcs", () => {
    const e = base();
    expect(() => appliquerLot(e, lot([{ type: "esquisse.arrondirSommets", params: { id: "rect", rayon: m(2) } }]))).toThrow(/rayon trop grand/);
    expect(() => appliquerLot(e, lot([{ type: "esquisse.arrondirSommets", params: { id: "pl", rayon: m(1), sommets: [0] } }]))).toThrow(/extrémité/);
    expect(() => appliquerLot(e, lot([{ type: "esquisse.modifier", params: { id: "pl", params: { renflements: [0.5] } } }]))).toThrow(/renflements/);
    const r = appliquerLot(e, lot([{ type: "esquisse.arrondirSommets", params: { id: "pl", rayon: m(1) } }, { type: "transformer.miroir", params: { a: pt(0, 0), b: pt(0, 1) }, cibles: ["pl"] }], "mi")).etat;
    expect(E(r, "pl").renflements![1]).toBeCloseTo(-Math.tan(Math.PI / 8), 9);
  });

  it("décomposer : lignes et arcs ; vues et DXF : arcs dessinés (renflement DXF porté) ; conversion en polyligne droite", () => {
    const e = appliquerLot(base(), lot([{ type: "esquisse.arrondirSommets", params: { id: "pl", rayon: m(1) } }], "a")).etat;
    const vue = genererVue(e, e.definitions["v"]!.params as unknown as ParamsVue, "v");
    const poly = vue.primitives.find((p) => p.type === "poly" && (p as { objetId?: string }).objetId === "pl") as { points: unknown[] } | undefined;
    expect(poly!.points.length).toBeGreaterThan(4);
    expect(dxfNiveau(e, "n0")).toMatch(/\s42\r?\n\s*0\.41421/);
    const d = appliquerLot(e, lot([{ type: "transformer.decomposer", params: {}, cibles: ["pl"] }], "dec"));
    const formes = d.effets.crees.map((id) => E(d.etat, id).forme);
    expect(formes).toEqual(["ligne", "arc", "ligne"]);
    const arc = E(d.etat, d.effets.crees[1]!);
    expect(arc.centre).toMatchObject({ x: 3, y: 11 });
    expect(arc.rayon!.value).toBeCloseTo(1, 9);
    expect([arc.angleDebut!.value, arc.angleFin!.value]).toEqual([-90, 0]);
    const c = appliquerLot(e, lot([{ type: "esquisse.convertir", params: { id: "pl", forme: "polyligne", segments: 4 } }], "c")).etat;
    expect(E(c, "pl").points).toHaveLength(4 + 3);
    expect("renflements" in E(c, "pl")).toBe(false);
  });
});
