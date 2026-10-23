/**
 * Chiffrement des secrets stockés (secret TOTP, D-6) : AES-256-GCM, clé `FADI_ENCRYPTION_KEY` (32 octets en base64,
 * `openssl rand -base64 32`) lue dans l'environnement, jamais en base ni dans le dépôt. Sans clé valide, rien n'est
 * chiffré : l'appelant refuse l'opération (limite déclarée, jamais simulée).
 * Format : `v1.<iv base64url>.<tag base64url>.<chiffré base64url>`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class EncryptionUnavailable extends Error {
  constructor() { super("FADI_ENCRYPTION_KEY absente ou invalide (32 octets en base64)"); this.name = "EncryptionUnavailable"; }
}

export function encryptionKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env["FADI_ENCRYPTION_KEY"];
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function sealSecret(plain: string, key = encryptionKey()): string {
  if (!key) throw new EncryptionUnavailable();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function openSecret(sealed: string, key = encryptionKey()): string {
  if (!key) throw new EncryptionUnavailable();
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data === undefined) throw new Error("secret scellé illisible");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
