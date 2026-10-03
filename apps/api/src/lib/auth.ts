import { hash, verify } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours
export const SESSION_COOKIE = "fadi_session";

const ARGON2_OPTIONS = {
  // OWASP-recommended baseline for Argon2id (2025/2026 guidance).
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

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

export interface SessionUser {
  id: string;
  email: string;
  /** Nom affiché choisi dans Paramètres ; null tant que rien n'est saisi. */
  displayName: string | null;
}

/** Crée une session serveur et renvoie son identifiant (à poser en cookie httpOnly). */
export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Résout une session en utilisateur. Une session expirée est traitée comme
 * absente (et nettoyée) plutôt que de laisser l'appelant décider — un appel
 * API ne doit jamais avoir à réimplémenter la logique d'expiration.
 */
export async function resolveSession(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const rows = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt, email: users.email, id: users.id, displayName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await destroySession(sessionId);
    return null;
  }
  return { id: row.id, email: row.email, displayName: row.displayName ?? null };
}
