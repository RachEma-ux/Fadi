import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { archiveKeyId, archiveSigningKey, signManifestHash, verifyArchiveSignature } from "./archive-signature.js";

const hash = "a".repeat(64);
const env = archiveSigningKey("env", "cle-de-recette-suffisamment-longue");
const db = archiveSigningKey("db", "f".repeat(64));

describe("signature des archives (logique pure)", () => {
  it("HMAC-SHA256 de l'empreinte du manifeste, identifiant de clé public sans la clé", () => {
    const s = signManifestHash(env, hash);
    expect(s).toEqual({ algorithm: "HMAC-SHA256", keyId: env.id, value: createHmac("sha256", "cle-de-recette-suffisamment-longue").update(hash).digest("hex") });
    expect(env.id).toMatch(/^env-[0-9a-f]{16}$/);
    expect(db.id).toMatch(/^db-[0-9a-f]{16}$/);
    expect(JSON.stringify(s)).not.toContain("cle-de-recette");
    expect(archiveKeyId("env", "x")).not.toBe(archiveKeyId("db", "x"));
    expect(archiveKeyId("env", "x")).toBe(archiveKeyId("env", "x"));
  });

  it("vérifiée seulement avec une clé de ce serveur et la valeur exacte", () => {
    const s = signManifestHash(env, hash);
    expect(verifyArchiveSignature(s, hash, [db, env])).toBe("verifiee");
    expect(verifyArchiveSignature(signManifestHash(db, hash), hash, [db])).toBe("verifiee");
  });

  it("absente, inconnue ou invalide : jamais vérifiée", () => {
    const s = signManifestHash(env, hash);
    expect(verifyArchiveSignature(undefined, hash, [env])).toBe("absente");
    expect(verifyArchiveSignature(null, hash, [env])).toBe("absente");
    expect(verifyArchiveSignature(s, hash, [db])).toBe("inconnue");
    expect(verifyArchiveSignature(s, hash, [])).toBe("inconnue");
    expect(verifyArchiveSignature(s, "b".repeat(64), [env])).toBe("invalide");
    expect(verifyArchiveSignature({ ...s, value: "0".repeat(64) }, hash, [env])).toBe("invalide");
    expect(verifyArchiveSignature({ ...s, value: "court" }, hash, [env])).toBe("invalide");
    expect(verifyArchiveSignature({ ...s, algorithm: "SHA-1" }, hash, [env])).toBe("invalide");
    expect(verifyArchiveSignature("signature", hash, [env])).toBe("invalide");
    expect(verifyArchiveSignature([s], hash, [env])).toBe("invalide");
  });
});
