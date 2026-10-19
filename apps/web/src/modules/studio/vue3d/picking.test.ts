/**
 * Tables de désignation (C.2-02) et désignation sans identifiant périmé (C.2-03).
 */
import { describe, expect, it } from "vitest";
import { designer, idImpact, tablePicking } from "./picking";

describe("table de désignation d'un lot", () => {
  it("triangle du lot → identifiant Studio, objets sans triangle ignorés, bornes", () => {
    const t = tablePicking("3:abc", [{ id: "a", triangles: 2 }, { id: "vide", triangles: 0 }, { id: "b", triangles: 3 }, { id: "c", triangles: 1 }, { id: "fin", triangles: 0 }]);
    expect(t.triangles).toBe(6);
    expect([0, 1, 2, 3, 4, 5].map((i) => t.resoudre(i))).toEqual(["a", "a", "b", "b", "b", "c"]);
    expect([-1, 6, 1.5, Number.NaN].map((i) => t.resoudre(i))).toEqual([null, null, null, null]);
    expect(t.plage("b")).toEqual([2, 5]);
    expect(t.plage("vide")).toEqual([2, 2]);
    expect(t.plage("absent")).toBeNull();
    expect(t.version).toBe("3:abc");
  });

  it("propriété : chaque triangle se résout vers l'objet dont la plage le contient", () => {
    let graine = 7;
    const r = () => { graine = (graine * 1103515245 + 12345) % 2 ** 31; return graine / 2 ** 31; };
    for (let k = 0; k < 20; k++) {
      const membres = Array.from({ length: 1 + Math.floor(r() * 200) }, (_, i) => ({ id: `o${i}`, triangles: Math.floor(r() * 12) }));
      const t = tablePicking("v", membres);
      let n = 0;
      for (const m of membres) for (let i = 0; i < m.triangles; i++) expect(t.resoudre(n++)).toBe(m.id);
    }
  });
});

describe("désignation d'un clic", () => {
  const lot = tablePicking("v", [{ id: "m1", triangles: 4 }, { id: "m2", triangles: 4 }]);
  it("résout par la table du lot ou par l'identifiant, du plus proche au plus lointain", () => {
    expect(idImpact({ distance: 1, table: lot, triangle: 5 })).toBe("m2");
    expect(idImpact({ distance: 1, id: "b1" })).toBe("b1");
    expect(idImpact({ distance: 1 })).toBeNull();
    expect(designer([{ distance: 5, id: "b1" }, { distance: 2, table: lot, triangle: 1 }], () => true)).toEqual({ id: "m1", distance: 2 });
  });
  it("objet supprimé : jamais désigné ; l'objet derrière l'est, sinon rien", () => {
    const presents = new Set(["m2", "b1"]);
    // Le maillage affiché porte encore m1 (supprimé du document) devant m2.
    expect(designer([{ distance: 2, table: lot, triangle: 0 }, { distance: 3, table: lot, triangle: 6 }], (id) => presents.has(id))).toEqual({ id: "m2", distance: 3 });
    expect(designer([{ distance: 2, table: lot, triangle: 0 }], (id) => presents.has(id))).toBeNull();
    expect(designer([], () => true)).toBeNull();
  });
});
