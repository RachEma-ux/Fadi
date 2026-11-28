/**
 * Décompression deflate (FlateDecode des PDF, méthode 8 des ZIP). Depuis la décision « 3 A » (28.11.2026), elle passe par
 * DecompressionStream (`compression.ts`) ; ces contrôles, écrits pour l'ancien `inflate.ts`, s'appliquent au nouveau.
 */
import { deflateRawSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { compresser, decompresser } from "./compression.js";

describe("Décompression deflate (FlateDecode)", () => {
  it("zlib et deflate brut, blocs stockés, fixes et dynamiques, répétitions longues ; flux malformé refusé", async () => {
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
        expect(Buffer.from((await decompresser(new Uint8Array(deflateSync(t, { level: niveau })), "deflate"))!)).toEqual(Buffer.from(t));
        expect(Buffer.from((await decompresser(new Uint8Array(deflateRawSync(t, { level: niveau })), "deflate-raw"))!)).toEqual(Buffer.from(t));
      }
    }
    expect(await decompresser(Uint8Array.from([0x78, 0x9c, 0xff, 0xff]), "deflate")).toBeNull();
  });

  it("borne de taille : contrôlée pendant la lecture, y compris sur un flux tronqué", async () => {
    const grand = new Uint8Array(deflateSync(Buffer.alloc(1_000_000, 65)));
    expect(await decompresser(grand, "deflate", 100)).toBeNull();
    expect(await decompresser(grand.subarray(0, grand.length - 5), "deflate", 100)).toBeNull();
    expect((await decompresser(grand, "deflate", 1_000_000))!.length).toBe(1_000_000);
    expect((await decompresser(new Uint8Array(deflateSync(Buffer.from("abc"))), "deflate", 3))!.length).toBe(3);
  });

  it("aller-retour par les flux du navigateur : compresser puis décompresser rend les octets", async () => {
    const t = Buffer.from("IFCWALL('0W000000000000000000a1');\n".repeat(200), "latin1");
    const c = await compresser(new Uint8Array(t));
    expect(c.length).toBeLessThan(t.length);
    expect(Buffer.from((await decompresser(c))!)).toEqual(t);
  });
});
