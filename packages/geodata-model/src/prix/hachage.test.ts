import { describe, expect, it } from "vitest";
import { empreinteCanonique, encoderUtf8, jsonCanonique, sha256Hex } from "./hachage.js";

describe("SHA-256 pur (PRX12)", () => {
  it("vecteurs de référence FIPS 180-4 (chaîne vide, « abc »)", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("message de plusieurs blocs et texte non ASCII (UTF-8, paire de substitution) identiques à sha256sum", () => {
    expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
    expect(sha256Hex("Écart à 3,3M DH — 😀")).toBe("0c16a6cbecfe587fce97c7d2e832d3db39529fcd669314d5be7abd87d1cead58");
  });

  it("encodage UTF-8 : 1 à 4 octets par caractère", () => {
    expect([...encoderUtf8("aé€😀")]).toEqual([0x61, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
  });
});

describe("JSON canonique", () => {
  it("clés triées, undefined omis : l'ordre d'insertion ne change pas l'empreinte", () => {
    expect(jsonCanonique({ b: 1, a: [1, "x", null], c: undefined })).toBe('{"a":[1,"x",null],"b":1}');
    expect(empreinteCanonique({ x: 1, y: { b: 2, a: 1 } })).toBe(empreinteCanonique({ y: { a: 1, b: 2 }, x: 1 }));
  });

  it("refuse un nombre non fini (une absence s'écrit null, jamais NaN)", () => {
    expect(() => jsonCanonique({ v: Number.NaN })).toThrow(RangeError);
  });
});
