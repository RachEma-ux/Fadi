// Relecture #496 : un maillage importé fermé avec une jonction en T reste un solide (comme avec ajouterTriangles).
import { describe, expect, it } from "vitest";
import { construireMaillageImporte, estSolide, modeleVide, poserMaillagesImportes } from "./geometrie-libre.js";
import { type Vec3, v3 } from "./vecteur.js";

type T = readonly [Vec3, Vec3, Vec3];

function cube(scinder: boolean): T[] {
  const P = (x: number, y: number, z: number) => v3(x, y, z);
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): T[] => [
    [a, b, c],
    [a, c, d],
  ];
  const t: T[] = [
    ...quad(P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)),
    ...quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)),
    ...quad(P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)),
    ...quad(P(1, 1, 0), P(0, 1, 0), P(0, 1, 1), P(1, 1, 1)),
    ...quad(P(0, 1, 0), P(0, 0, 0), P(0, 0, 1), P(0, 1, 1)),
  ];
  const [a, b, c, d] = [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)];
  t.push([a, b, c]);
  if (scinder) {
    // Un seul côté de la diagonale a–c est subdivisé en son milieu : jonction en T.
    const m = P(0.5, 0.5, 1);
    t.push([a, m, d], [m, c, d]);
  } else t.push([a, c, d]);
  return t;
}

describe("import hors du fil : jonctions en T", () => {
  for (const scinder of [false, true])
    it(`cube de ${scinder ? 13 : 12} triangles : six faces, solide`, () => {
      const x = construireMaillageImporte("cube", cube(scinder));
      expect(Object.keys(x.contenu.faces).length).toBe(6);
      const r = poserMaillagesImportes(modeleVide(), [x]);
      expect(estSolide(r.modele, r.occurrences[0]!)).toBe(true);
    });
});
