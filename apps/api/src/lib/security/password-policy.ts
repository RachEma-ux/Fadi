/**
 * Politique de mot de passe (D-6, NIST SP 800-63B) — fonction pure.
 *
 * 12 caractères au moins, 128 au plus, aucune règle de composition, aucune expiration périodique ; refus des mots de
 * passe courants ou compromis d'une liste embarquée et versionnée (`data/security/common-passwords.txt`, aucun appel
 * réseau) et des mots de passe qui reprennent l'adresse du compte.
 */
import { readFileSync } from "node:fs";
import { dataFileUrl } from "../../runtime-paths.js";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordRefusal = "too_short" | "too_long" | "common" | "contains_email";

let common: ReadonlySet<string> | null = null;
/** Liste chargée une fois ; les lignes `#` sont l'en-tête de provenance. */
export function commonPasswords(): ReadonlySet<string> {
  if (!common) {
    const text = readFileSync(dataFileUrl("security/common-passwords.txt"), "utf8");
    common = new Set(text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  }
  return common;
}

/** Longueur en caractères affichés (points de code), pas en unités UTF-16. */
const length = (s: string) => [...s].length;

export function checkPassword(password: string, context: { email?: string | null | undefined } = {}): PasswordRefusal | null {
  const n = length(password);
  if (n < PASSWORD_MIN) return "too_short";
  if (n > PASSWORD_MAX) return "too_long";
  const lower = password.toLowerCase();
  if (commonPasswords().has(lower)) return "common";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "contains_email";
  return null;
}

export const PASSWORD_REFUSAL_MESSAGE: Record<PasswordRefusal, string> = {
  too_short: `Le mot de passe doit compter au moins ${PASSWORD_MIN} caractères.`,
  too_long: `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX} caractères.`,
  common: "Ce mot de passe figure dans une liste de mots de passe courants ou compromis : choisissez-en un autre.",
  contains_email: "Le mot de passe ne doit pas reprendre votre adresse e-mail.",
};
