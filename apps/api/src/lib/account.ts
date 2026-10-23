/**
 * Outils du cycle de vie des comptes (docs/workstreams/users-management, phase 4) : jetons de compte à usage unique,
 * liens publics (jeton dans le fragment `#jeton=…`, jamais envoyé au serveur ni journalisé par un relais), langue des
 * courriels, envoi par la file.
 */
import type { Request } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { accountTokens, type AccountTokenPurpose } from "../db/schema.js";
import { newId } from "./ids.js";
import { enqueueMail, type EnqueueResult } from "./mailer/outbox.js";
import { mailRuntime, type MailLocale, type MailTemplate } from "./mailer/index.js";
import { randomToken, sha256Hex } from "./security/tokens.js";

const HOUR = 3_600_000;
export const TOKEN_TTL_MS: Record<AccountTokenPurpose, number> = {
  verify_email: 24 * HOUR,
  reset_password: 1 * HOUR,
  cancel_deletion: 30 * 24 * HOUR,
};
export const INVITATION_TTL_MS = 7 * 24 * HOUR;
export const DELETION_GRACE_MS = 30 * 24 * HOUR;

/** Pages publiques du client (apps/web, route `/compte/*`). */
export const PUBLIC_PATHS = {
  invitation: "/compte/invitation",
  verify_email: "/compte/verifier-email",
  reset_password: "/compte/reinitialiser",
  cancel_deletion: "/compte/annuler-suppression",
} as const;

export function publicLink(path: string, token: string): string {
  return `${mailRuntime().config.publicUrl}${path}#jeton=${encodeURIComponent(token)}`;
}

/** Langue des courriels : `fr` sauf préférence explicite pour l'anglais (corps `locale`, sinon `Accept-Language`). */
export function mailLocale(req: Request, explicit?: unknown): MailLocale {
  if (explicit === "en" || explicit === "fr") return explicit;
  const header = req.get("accept-language") ?? "";
  return /^en\b/i.test(header.trim()) ? "en" : "fr";
}

type Executor = Pick<typeof db, "insert" | "update" | "select">;

/** Émet un jeton de compte (les jetons encore valides du même usage sont invalidés). Renvoie le jeton brut, à n'envoyer que par courriel. */
export async function issueAccountToken(userId: string, purpose: AccountTokenPurpose, executor: Executor = db): Promise<string> {
  await executor.update(accountTokens).set({ usedAt: new Date() })
    .where(and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt)));
  const token = randomToken();
  await executor.insert(accountTokens).values({
    id: newId("tok"), userId, purpose, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/** Consomme un jeton (usage unique, atomique) ; renvoie le compte, ou null si inconnu, expiré, déjà utilisé ou d'un autre usage. */
export async function consumeAccountToken(token: string, purpose: AccountTokenPurpose, executor: Pick<typeof db, "update"> = db): Promise<string | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const rows = await executor.update(accountTokens).set({ usedAt: new Date() })
    .where(and(eq(accountTokens.tokenHash, sha256Hex(token)), eq(accountTokens.purpose, purpose), isNull(accountTokens.usedAt), gt(accountTokens.expiresAt, new Date())))
    .returning({ userId: accountTokens.userId });
  return rows[0]?.userId ?? null;
}

export async function sendAccountMail(to: string, template: MailTemplate, data: Record<string, string | undefined>, locale: MailLocale, executor?: Executor): Promise<EnqueueResult> {
  return enqueueMail({ to, template, data, locale }, executor);
}

export const formatDate = (d: Date, locale: MailLocale) =>
  d.toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: process.env["FADI_TZ"] ?? "Europe/Paris" });
