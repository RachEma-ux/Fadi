/**
 * EX-053 (cas négatif) — une accélération ne change pas les règles de classement et de départage : avec des égalités
 * de distance (extrémités confondues, intersections au même point, points symétriques autour du pointeur), l'index
 * incrémental construit dans des ordres d'insertion permutés rend exactement les candidats, dans le même ordre, que
 * le parcours linéaire de référence ; le premier candidat (celui qui est retenu) suit l'ordre du document.
 */
import { describe, expect, it } from "vitest";
import type { StudioShape } from "@parcours/atelier-model";
import { candidatsObjets, indexLineaire, MODES_ACCROCHAGE, suiviAccrochage, type ReglagesAccrochage } from "./accrochage";

const reglages: ReglagesAccrochage = { objets: true, modes: new Set(MODES_ACCROCHAGE), orthogonal: false, polaire: false, pasPolaire: 45 };
// Égalités voulues : l1, l2, l3 partent du même point (0,0) ; c1 et c2 sont deux cercles de même rayon symétriques ;
// r1 a un milieu de côté à la même distance que des extrémités.
const objets: StudioShape[] = [
  { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
  { id: "l2", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 2 } },
  { id: "l3", type: "line", start: { x: 0, y: 0 }, end: { x: -2, y: -2 } },
  { id: "c1", type: "circle", center: { x: 1, y: 1 }, radius: 1 },
  { id: "c2", type: "circle", center: { x: -1, y: 1 }, radius: 1 },
  { id: "r1", type: "rectangle", origin: { x: -1, y: -1 }, width: 2, height: 1 },
];

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

describe("départage identique quel que soit l'ordre de l'index (EX-053)", () => {
  it("toutes les permutations d'insertion dans l'index incrémental : mêmes candidats, même ordre, même retenu que l'oracle linéaire", () => {
    const oracle = indexLineaire(objets);
    const requetes = [
      { curseur: { x: 0, y: 0 }, tolerance: 1.5, base: null },
      { curseur: { x: 0, y: 1 }, tolerance: 1.2, base: { x: 0, y: -1 } },
      { curseur: { x: 0.01, y: 0.01 }, tolerance: 0.5, base: null },
      { curseur: { x: 0, y: -0.5 }, tolerance: 1, base: { x: 3, y: 3 } },
    ];
    const attendus = requetes.map((q) => candidatsObjets(oracle, q, reglages));
    // Des égalités existent vraiment : au moins deux candidats du même genre à la même distance.
    expect(attendus[0]!.filter((c) => c.genre === "extremite" && c.distance === 0).length).toBeGreaterThanOrEqual(3);
    expect(attendus[0]![0]!.objets).toEqual(["l1"]);
    let n = 0;
    for (const ordre of permutations(objets)) {
      const suivi = suiviAccrochage(0);
      // L'index est rempli dans l'ordre permuté (une forme après l'autre), puis amené à l'ordre du document.
      for (let k = 1; k <= ordre.length; k++) suivi.indexer(ordre.slice(0, k));
      const idx = suivi.indexer(objets);
      expect(suivi.dernierBilan!.inseres).toBe(0);
      requetes.forEach((q, i) => expect(candidatsObjets(idx, q, reglages), `ordre ${ordre.map((o) => o.id).join(",")}`).toEqual(attendus[i]));
      n += 1;
    }
    expect(n).toBe(720);
  });
});
