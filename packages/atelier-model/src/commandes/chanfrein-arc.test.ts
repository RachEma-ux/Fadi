import { describe, expect, it } from "vitest";
import { coinsJointifs } from "../coins-jointifs.js";
import { modeleVide, type Occurrence } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./index.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const E = (e: { objets: Record<string, unknown> }, id: string) => e.objets[id] as Occurrence<"esquisse">;

describe("chanfrein avec un arc (D-094, DA-02-11)", () => {
  const e = appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "Rez", elevation: 0 } },
    { type: "esquisse.ligne", params: { id: "l", niveauId: "n", points: [pt(-5, 0), pt(0, 0)] } },
    { type: "esquisse.arc", params: { id: "a", niveauId: "n", centre: pt(3, 0), rayon: m(3), angleDebut: { value: 90, unit: "deg" }, angleFin: { value: 180, unit: "deg" } } },
    { type: "esquisse.arc", params: { id: "b", niveauId: "n", centre: pt(-3, 0), rayon: m(3), angleDebut: { value: 0, unit: "deg" }, angleFin: { value: 90, unit: "deg" } } },
  ], "b")).etat;

  it("ligne / arc : ligne ramenée de d, arc ramené de d le long de l'arc, segment entre les deux ; inverse exact", () => {
    const r = appliquerLot(e, lot([{ type: "transformer.chanfreiner", params: { id1: "l", id2: "a", distance: m(1) } }], "c"));
    expect(E(r.etat, "l").params.points[1]).toEqual(pt(-1, 0));
    const fin = 180 - (1 / 3) * (180 / Math.PI);
    expect(E(r.etat, "a").params.angleFin!.value).toBeCloseTo(fin, 9);
    expect(E(r.etat, "a").params.angleDebut!.value).toBe(90);
    const seg = Object.values(r.etat.objets).find((o) => o.classe === "esquisse" && !["l", "a", "b"].includes(o.id)) as Occurrence<"esquisse">;
    expect(seg.params.forme).toBe("ligne");
    expect(seg.params.points[0]).toEqual(pt(-1, 0));
    expect(seg.params.points[1]!.x).toBeCloseTo(3 + 3 * Math.cos((fin * Math.PI) / 180), 9);
    expect(seg.params.points[1]!.y).toBeCloseTo(3 * Math.sin((fin * Math.PI) / 180), 9);
    expect(r.effets.crees).toEqual([seg.id]);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("deux arcs : début de l'un et fin de l'autre ramenés ; distance trop grande refusée", () => {
    const r = appliquerLot(e, lot([{ type: "transformer.chanfreiner", params: { id1: "b", id2: "a", distance: m(0.5) } }], "d"));
    // b commence en (0,0) à 0° : son début est l'extrémité au coin, ramené vers 90°.
    expect(E(r.etat, "b").params.angleDebut!.value).toBeCloseTo((0.5 / 3) * (180 / Math.PI), 9);
    expect(E(r.etat, "a").params.angleFin!.value).toBeCloseTo(180 - (0.5 / 3) * (180 / Math.PI), 9);
    expect(() => appliquerLot(e, lot([{ type: "transformer.chanfreiner", params: { id1: "l", id2: "a", distance: m(5) } }], "x"))).toThrow(/trop grande/);
    expect(() => appliquerLot(e, lot([{ type: "transformer.chanfreiner", params: { id1: "l", id2: "a", distance: m(0) } }], "z"))).toThrow();
  });
});

describe("raccord et chanfrein multiples (D-094, DA-02-10)", () => {
  const rect = appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "Rez", elevation: 0 } },
    { type: "esquisse.ligne", params: { id: "l1", niveauId: "n", points: [pt(0, 0), pt(4, 0)] } },
    { type: "esquisse.ligne", params: { id: "l2", niveauId: "n", points: [pt(4, 0), pt(4, 3)] } },
    { type: "esquisse.ligne", params: { id: "l3", niveauId: "n", points: [pt(4, 3), pt(0, 3)] } },
    { type: "esquisse.ligne", params: { id: "l4", niveauId: "n", points: [pt(0, 3), pt(0, 0)] } },
    { type: "esquisse.ligne", params: { id: "seule", niveauId: "n", points: [pt(10, 10), pt(11, 10)] } },
  ], "b")).etat;
  const long = (e: { objets: Record<string, unknown> }, id: string) => { const [a, b] = E(e, id).params.points; return Math.hypot(b!.x - a!.x, b!.y - a!.y); };

  it("coins jointifs d'un contour de quatre lignes ; une ligne isolée n'en donne aucun", () => {
    expect(coinsJointifs(rect, ["l1", "l2", "l3", "l4", "seule"])).toEqual([["l1", "l2"], ["l1", "l4"], ["l2", "l3"], ["l3", "l4"]]);
    expect(coinsJointifs(rect, ["l1", "seule"])).toEqual([]);
  });

  it("quatre raccords dans un lot : quatre arcs, chaque ligne raccourcie de deux fois le rayon ; un seul inverse ; chanfreins", () => {
    const coins = coinsJointifs(rect, ["l1", "l2", "l3", "l4"]);
    const r = appliquerLot(rect, lot(coins.map(([id1, id2]) => ({ type: "transformer.raccorder", params: { id1, id2, rayon: m(0.5) } })), "m"));
    const arcs = Object.values(r.etat.objets).filter((o) => o.classe === "esquisse" && (o as Occurrence<"esquisse">).params.forme === "arc");
    expect(arcs).toHaveLength(4);
    expect(long(r.etat, "l1")).toBeCloseTo(3, 9);
    expect(long(r.etat, "l2")).toBeCloseTo(2, 9);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(rect);
    const c = appliquerLot(rect, lot(coins.map(([id1, id2]) => ({ type: "transformer.chanfreiner", params: { id1, id2, distance: m(0.25) } })), "c"));
    expect(long(c.etat, "l1")).toBeCloseTo(3.5, 9);
    expect(Object.keys(c.etat.objets)).toHaveLength(Object.keys(rect.objets).length + 4);
  });
});
