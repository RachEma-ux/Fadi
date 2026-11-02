import { describe, expect, it } from "vitest";
import { constructionTuiles, correspond, etagTuile, type CleTuile } from "./cache-tuiles.js";

const cle: CleTuile = { genre: "objets", versionId: "gdver_1", empreinte: "a".repeat(64), coucheId: "gdcou_1", z: 8, x: 122, y: 102, variante: "" };

describe("validation HTTP des tuiles (BD-8.4, constat B2)", () => {
  it("ETag stable pour une même version, tuile, variante et construction ; différent dès qu'un élément change", () => {
    const e = etagTuile(cle, "abc1234");
    expect(e).toMatch(/^"[A-Za-z0-9_-]{32}"$/);
    expect(etagTuile({ ...cle }, "abc1234")).toBe(e);
    for (const autre of [{ ...cle, versionId: "gdver_2" }, { ...cle, empreinte: "b".repeat(64) }, { ...cle, z: 9 }, { ...cle, x: 123 }, { ...cle, y: 103 }, { ...cle, variante: "regrouper" }, { ...cle, genre: "etiquettes" as const }, { ...cle, coucheId: "gdcou_2" }]) {
      expect(etagTuile(autre, "abc1234")).not.toBe(e);
    }
    expect(etagTuile(cle, "def5678")).not.toBe(e);
  });
  it("construction : commit de l'image, sinon une valeur propre au processus (jamais partagée entre constructions)", () => {
    expect(constructionTuiles({ FADI_COMMIT: "ABCDEF1" })).toBe("abcdef1");
    expect(constructionTuiles({ FADI_COMMIT: "main" })).toMatch(/^processus-[0-9a-f]{16}$/);
    expect(constructionTuiles({})).toBe(constructionTuiles({ FADI_COMMIT: "" }));
  });
  it("If-None-Match : liste, joker et préfixe faible reconnus ; absent ou différent → recalcul", () => {
    const e = etagTuile(cle, "abc1234");
    expect(correspond(undefined, e)).toBe(false);
    expect(correspond('"autre"', e)).toBe(false);
    expect(correspond(e, e)).toBe(true);
    expect(correspond(`"x", W/${e}`, e)).toBe(true);
    expect(correspond("*", e)).toBe(true);
  });
});
