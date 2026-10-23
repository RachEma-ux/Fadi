/** Jetons opaques (32 octets aléatoires) : seul leur SHA-256 est stocké ; comparaison par empreinte, jamais en clair. */
import { createHash, randomBytes } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Codes de secours : 10 caractères lisibles (sans 0/O/1/I), groupés `xxxxx-xxxxx`. */
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function recoveryCode(): string {
  const bytes = randomBytes(10);
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}
export const normalizeRecoveryCode = (code: string) => code.trim().toLowerCase().replace(/[\s-]/g, "");
export const RECOVERY_CODE_COUNT = 10;
