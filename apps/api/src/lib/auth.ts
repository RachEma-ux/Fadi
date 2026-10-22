import { hash, verify } from "@node-rs/argon2";
import type { Request, Response } from "express";
import { serialize } from "cookie";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users, type AccountStatus, type PlatformRole } from "../db/schema.js";
import { newId } from "./ids.js";
import { MFA_PENDING_MS, newSessionTimes, SESSION_TOUCH_MS, sessionValid, slideExpiry } from "./security/auth-policy.js";
import { randomToken, sha256Hex } from "./security/tokens.js";

/**
 * Sessions serveur (docs/workstreams/users-management, phase 2).
 *
 * Le cookie porte un jeton aléatoire de 32 octets ; la base n'en garde que l'empreinte SHA-256 (`sessions.token_hash`).
 * Nom `__Host-fadi_sid` en production (exige `Secure`, `Path=/`, aucun `Domain`), `fadi_sid` en développement sur
 * http://localhost (UM-6). L'ancien cookie `fadi_session` est encore lu, puis remplacé (aucune déconnexion au déploiement).
 * Chaque requête relit la session et le compte : session révoquée, expirée (inactivité ou plafond absolu selon le rôle),
 * compte suspendu, fermé ou en suppression = non authentifié.
 */
const isProduction = () => process.env["NODE_ENV"] === "production";
export const SESSION_COOKIE_SECURE = "__Host-fadi_sid";
export const SESSION_COOKIE_DEV = "fadi_sid";
export const LEGACY_SESSION_COOKIE = "fadi_session";
export const sessionCookieName = () => (isProduction() ? SESSION_COOKIE_SECURE : SESSION_COOKIE_DEV);
/** Compatibilité des imports historiques (nom courant du cookie de session). */
export const SESSION_COOKIE = sessionCookieName();

const ARGON2_OPTIONS = {
  // OWASP-recommended baseline for Argon2id (2025/2026 guidance).
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
/** Préfixe d'un hachage aux paramètres courants ; tout autre préfixe est réhaché à la prochaine connexion réussie. */
const CURRENT_HASH_PREFIX = `$argon2id$v=19$m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}$`;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password, ARGON2_OPTIONS);
  } catch {
    // A malformed stored hash must never throw into the caller's control flow.
    return false;
  }
}

export function needsRehash(hashValue: string): boolean {
  return !hashValue.startsWith(CURRENT_HASH_PREFIX);
}

let dummyHash: Promise<string> | null = null;
/** Vérification factice (compte inconnu) : même coût qu'une vraie vérification, pour un temps de réponse constant. */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("fadi-dummy-password-for-constant-time");
  await verifyPassword(await dummyHash, password);
}

export interface SessionUser {
  id: string;
  email: string;
  /** Nom affiché choisi dans Paramètres ; null tant que rien n'est saisi. */
  displayName: string | null;
  platformRole: PlatformRole;
  status: AccountStatus;
  mfaEnabled: boolean;
  emailVerified: boolean;
  /** Identifiant interne de la session courante (jamais le jeton). */
  sessionId: string;
}

export interface CreatedSession { id: string; token: string; expiresAt: Date; absoluteExpiresAt: Date }

/** Crée une session serveur ; seul le jeton renvoyé va dans le cookie, la base n'en garde que l'empreinte. */
export async function createSession(
  userId: string,
  role: PlatformRole,
  context: { userAgent?: string | null; ip?: string | null; mfaPending?: boolean } = {},
  executor: Pick<typeof db, "insert"> = db,
): Promise<CreatedSession> {
  const now = new Date();
  const token = randomToken();
  const id = newId("ses");
  const times = context.mfaPending
    ? { expiresAt: new Date(now.getTime() + MFA_PENDING_MS), absoluteExpiresAt: new Date(now.getTime() + MFA_PENDING_MS) }
    : newSessionTimes(role, now);
  await executor.insert(sessions).values({
    id,
    userId,
    createdAt: now,
    tokenHash: sha256Hex(token),
    expiresAt: times.expiresAt,
    absoluteExpiresAt: times.absoluteExpiresAt,
    lastSeenAt: now,
    userAgent: context.userAgent?.slice(0, 300) ?? null,
    ip: context.ip ?? null,
    mfaPending: !!context.mfaPending,
  });
  return { id, token, ...times };
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Révoque toutes les sessions du compte, sauf `exceptSessionId` ; renvoie le nombre de sessions révoquées. */
export async function revokeUserSessions(userId: string, exceptSessionId: string | null = null, executor: Pick<typeof db, "update"> = db): Promise<number> {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  const rows = await executor.update(sessions).set({ revokedAt: new Date() }).where(where).returning({ id: sessions.id });
  return rows.length;
}

/** Le jeton de session présenté par le client (cookie courant, sinon l'ancien `fadi_session`). */
export function sessionTokenFrom(cookies: Record<string, string | undefined>): { token: string; legacy: boolean } | null {
  const current = cookies[SESSION_COOKIE_SECURE] ?? cookies[SESSION_COOKIE_DEV];
  if (current) return { token: current, legacy: false };
  const legacy = cookies[LEGACY_SESSION_COOKIE];
  return legacy ? { token: legacy, legacy: true } : null;
}

type SessionRow = typeof sessions.$inferSelect;
type UserRow = typeof users.$inferSelect;

async function loadSession(token: string): Promise<{ session: SessionRow; user: UserRow } | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256Hex(token)))
    .limit(1);
  return rows[0] ?? null;
}

export function toSessionUser(user: UserRow, sessionId: string): SessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    platformRole: user.platformRole,
    status: user.status,
    mfaEnabled: !!user.totpEnabledAt,
    emailVerified: !!user.emailVerifiedAt,
    sessionId,
  };
}

/**
 * Résout un jeton en utilisateur. Une session révoquée, expirée, en attente de double authentification, ou d'un compte
 * qui n'est plus actif est traitée comme absente — un appel API ne doit jamais réimplémenter ces règles.
 */
export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await loadSession(token);
  if (!row || row.session.mfaPending) return null;
  const { session, user } = row;
  const now = new Date();
  if (user.status !== "active" || user.deletionRequestedAt) return null;
  if (!sessionValid({ ...session, absoluteExpiresAt: session.absoluteExpiresAt }, user.platformRole, now)) return null;
  // Échéance glissante, écrite au plus une fois par minute.
  if (!session.lastSeenAt || now.getTime() - session.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
    await db.update(sessions).set({ lastSeenAt: now, expiresAt: slideExpiry(session, user.platformRole, now) }).where(eq(sessions.id, session.id));
  }
  return toSessionUser(user, session.id);
}

/** Session « mot de passe vérifié, code attendu » (5 min) : renvoie le compte si elle est encore valable. */
export async function resolvePendingMfa(token: string | undefined): Promise<{ session: SessionRow; user: UserRow } | null> {
  if (!token) return null;
  const row = await loadSession(token);
  if (!row || !row.session.mfaPending || row.session.revokedAt) return null;
  if (row.session.expiresAt.getTime() <= Date.now()) return null;
  if (row.user.status !== "active" || row.user.deletionRequestedAt) return null;
  return row;
}

function cookieOptions(expires: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: isProduction(), path: "/", expires };
}

/** Pose le cookie de session (expiration = plafond absolu) et efface l'ancien nom. */
export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.append("Set-Cookie", serialize(sessionCookieName(), token, cookieOptions(expiresAt)));
  res.append("Set-Cookie", serialize(LEGACY_SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), secure: false }));
}

export function clearSessionCookies(res: Response): void {
  res.append("Set-Cookie", serialize(sessionCookieName(), "", cookieOptions(new Date(0))));
  res.append("Set-Cookie", serialize(LEGACY_SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), secure: false }));
}

export const requestContext = (req: Request) => ({ userAgent: req.get("user-agent") ?? null, ip: req.ip ?? null });
