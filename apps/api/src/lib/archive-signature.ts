/**
 * Signature des archives de projet (décision du développeur principal, risque d'archive falsifiée) — logique PURE.
 * HMAC-SHA256 de l'empreinte globale du manifeste Studio (qui couvre les lignes, les comptes cités, le projet et le
 * propriétaire d'origine) avec une clé du serveur : `ARCHIVE_SIGNING_KEY`, sinon une clé propre à la base
 * (`archive_signing_keys`, `archive-signing-key.ts`). L'archive porte l'algorithme, l'identifiant de clé et la valeur ;
 * jamais la clé. L'identifiant de clé est une empreinte tronquée et préfixée de la clé : il ne permet pas de la retrouver.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ARCHIVE_SIGNATURE_ALGORITHM = "HMAC-SHA256";
export type ArchiveKeyOrigin = "env" | "db";
export interface ArchiveSigningKey { id: string; secret: string }
export interface ArchiveSignature { algorithm: typeof ARCHIVE_SIGNATURE_ALGORITHM; keyId: string; value: string }
/** Confiance accordée à une archive : seule `verifiee` (clé de ce serveur, valeur exacte) conserve les auteurs. */
export type ArchiveTrust = "verifiee" | "absente" | "inconnue" | "invalide";

/** Identifiant public d'une clé : origine et 16 caractères d'une empreinte séparée de celle de la signature. */
export function archiveKeyId(origin: ArchiveKeyOrigin, secret: string): string {
  return `${origin}-${createHash("sha256").update(`fadi-archive-key-id/1|${secret}`).digest("hex").slice(0, 16)}`;
}
export function archiveSigningKey(origin: ArchiveKeyOrigin, secret: string): ArchiveSigningKey {
  return { id: archiveKeyId(origin, secret), secret };
}

const hmac = (secret: string, manifestHash: string) => createHmac("sha256", secret).update(manifestHash).digest("hex");

export function signManifestHash(key: ArchiveSigningKey, manifestHash: string): ArchiveSignature {
  return { algorithm: ARCHIVE_SIGNATURE_ALGORITHM, keyId: key.id, value: hmac(key.secret, manifestHash) };
}

/** Vérifie une signature relue (forme quelconque) contre les clés de ce serveur. */
export function verifyArchiveSignature(signature: unknown, manifestHash: string, keys: readonly ArchiveSigningKey[]): ArchiveTrust {
  if (signature === null || signature === undefined) return "absente";
  if (typeof signature !== "object" || Array.isArray(signature)) return "invalide";
  const s = signature as Record<string, unknown>;
  if (s["algorithm"] !== ARCHIVE_SIGNATURE_ALGORITHM || typeof s["keyId"] !== "string" || typeof s["value"] !== "string" || !/^[0-9a-f]{64}$/.test(s["value"])) return "invalide";
  const key = keys.find((k) => k.id === s["keyId"]);
  if (!key) return "inconnue";
  const expected = Buffer.from(hmac(key.secret, manifestHash), "hex");
  const given = Buffer.from(s["value"], "hex");
  return expected.length === given.length && timingSafeEqual(expected, given) ? "verifiee" : "invalide";
}
