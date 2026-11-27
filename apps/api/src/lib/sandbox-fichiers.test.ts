/** Contrôle des octets reçus pour l'archive d'un fichier d'extension (protocole 1.2) : pur, sans base. */
import { describe, expect, it } from "vitest";
import { BORNES_ARCHIVE, lireOctetsArchive } from "./sandbox-fichiers.js";

const b64 = (b: Buffer | string) => (typeof b === "string" ? Buffer.from(b, "utf8") : b).toString("base64");

describe("octets d'un fichier archivé", () => {
  it("rend les octets tels quels, marque d'ordre UTF-8 comprise", () => {
    const avecMarque = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    const lu = lireOctetsArchive(b64(avecMarque));
    expect(lu.ok && lu.octets.equals(avecMarque)).toBe(true);
  });

  it("refuse ce qui n'est pas de la base 64 stricte ou pas du texte UTF-8 (400)", () => {
    for (const v of [3, null, "abc", "pas du base 64 !", b64(Buffer.from([0xff, 0xfe, 0x00]))]) expect(lireOctetsArchive(v)).toMatchObject({ ok: false, statut: 400 });
  });

  it("bornes : 200 000 caractères et 800 000 octets au plus (413) ; 150 000 « é » passent", () => {
    expect(lireOctetsArchive(b64("x".repeat(BORNES_ARCHIVE.texte))).ok).toBe(true);
    expect(lireOctetsArchive(b64("x".repeat(BORNES_ARCHIVE.texte + 1)))).toMatchObject({ ok: false, statut: 413 });
    expect(lireOctetsArchive(b64("é".repeat(150_000))).ok).toBe(true);
    expect(lireOctetsArchive(b64(Buffer.alloc(BORNES_ARCHIVE.octets + 3, 0x20)))).toMatchObject({ ok: false, statut: 413 });
  });
});
