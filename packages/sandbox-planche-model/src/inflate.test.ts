import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inflerSync } from "./inflate.js";

describe("Décompression deflate (FlateDecode)", () => {
  it("zlib et deflate brut, blocs stockés, fixes et dynamiques, répétitions longues ; flux malformé refusé", () => {
    let graine = 7;
    const hasard = () => (graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const textes = [
      new Uint8Array(0),
      Buffer.from("0 0 m 72 0 l S\n".repeat(500), "latin1"),
      Uint8Array.from({ length: 70000 }, () => Math.floor(hasard() * 256)),
      Uint8Array.from({ length: 50000 }, (_, i) => (i % 7 === 0 ? Math.floor(hasard() * 4) : 65)),
    ];
    for (const t of textes) {
      for (const niveau of [0, 1, 9]) {
        expect(Buffer.from(inflerSync(new Uint8Array(deflateSync(t, { level: niveau })))!)).toEqual(Buffer.from(t));
        expect(Buffer.from(inflerSync(new Uint8Array(deflateRawSync(t, { level: niveau })))!)).toEqual(Buffer.from(t));
      }
    }
    expect(inflerSync(Uint8Array.from([0x78, 0x9c, 0xff, 0xff]))).toBeNull();
  });

  it("borne de taille : contrôlée avant toute croissance, y compris sur un flux tronqué", () => {
    const grand = new Uint8Array(deflateSync(Buffer.alloc(1_000_000, 65)));
    expect(inflerSync(grand, 100)).toBeNull();
    expect(inflerSync(grand.subarray(0, grand.length - 5), 100)).toBeNull();
    expect(inflerSync(grand, 1_000_000)!.length).toBe(1_000_000);
    expect(inflerSync(new Uint8Array(deflateSync(Buffer.from("abc"))), 3)!.length).toBe(3);
  });
});
