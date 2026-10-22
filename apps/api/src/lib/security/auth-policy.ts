/**
 * Politiques d'authentification — fonctions pures (D-6, plan phase 2).
 *
 * - Sessions : échéance glissante (inactivité) bornée par un plafond absolu ; utilisateur 30 j / 30 j, administrateur
 *   1 h d'inactivité / 24 h au plus. Étape « double authentification attendue » : 5 min.
 * - Verrouillage progressif : à partir de 5 échecs consécutifs, 1 min, puis doublé à chaque échec, plafonné à 1 h.
 * - Connexion : seul un compte `active`, non verrouillé et sans suppression demandée peut ouvrir une session.
 */
import type { AccountStatus, PlatformRole } from "../../db/schema.js";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export const SESSION_LIMITS: Record<PlatformRole, { idleMs: number; absoluteMs: number }> = {
  user: { idleMs: 30 * DAY, absoluteMs: 30 * DAY },
  admin: { idleMs: 1 * HOUR, absoluteMs: 24 * HOUR },
};
export const MFA_PENDING_MS = 5 * MIN;
/** Une écriture de `last_seen_at` au plus par minute et par session. */
export const SESSION_TOUCH_MS = MIN;

export interface SessionTimes { createdAt: Date; expiresAt: Date; absoluteExpiresAt: Date | null; lastSeenAt: Date | null; revokedAt: Date | null }

export function newSessionTimes(role: PlatformRole, now: Date): { expiresAt: Date; absoluteExpiresAt: Date } {
  const l = SESSION_LIMITS[role];
  return { expiresAt: new Date(now.getTime() + l.idleMs), absoluteExpiresAt: new Date(now.getTime() + l.absoluteMs) };
}

/** Session encore valable maintenant, pour ce rôle (le rôle courant fait foi : une promotion resserre les limites). */
export function sessionValid(s: SessionTimes, role: PlatformRole, now: Date): boolean {
  if (s.revokedAt) return false;
  const t = now.getTime();
  const l = SESSION_LIMITS[role];
  const absolute = Math.min(s.absoluteExpiresAt?.getTime() ?? s.expiresAt.getTime(), s.createdAt.getTime() + l.absoluteMs);
  const idle = Math.min(s.expiresAt.getTime(), (s.lastSeenAt ?? s.createdAt).getTime() + l.idleMs);
  return t < absolute && t < idle;
}

/** Nouvelle échéance glissante après activité (jamais au-delà du plafond absolu). */
export function slideExpiry(s: SessionTimes, role: PlatformRole, now: Date): Date {
  const absolute = Math.min(s.absoluteExpiresAt?.getTime() ?? Infinity, s.createdAt.getTime() + SESSION_LIMITS[role].absoluteMs);
  return new Date(Math.min(now.getTime() + SESSION_LIMITS[role].idleMs, absolute));
}

export const LOCK_THRESHOLD = 5;
export const LOCK_BASE_MS = MIN;
export const LOCK_MAX_MS = HOUR;

/** Durée du verrouillage après `failures` échecs consécutifs (0 sous le seuil). */
export function lockDurationMs(failures: number): number {
  if (failures < LOCK_THRESHOLD) return 0;
  return Math.min(LOCK_BASE_MS * 2 ** (failures - LOCK_THRESHOLD), LOCK_MAX_MS);
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return !!lockedUntil && lockedUntil.getTime() > now.getTime();
}

export type LoginBlock = "suspended" | "closed" | "locked" | "deletion_pending";

export function loginBlock(u: { status: AccountStatus; lockedUntil: Date | null; deletionRequestedAt: Date | null }, now: Date): LoginBlock | null {
  if (u.status === "closed") return "closed";
  if (u.status === "suspended") return "suspended";
  if (u.deletionRequestedAt) return "deletion_pending";
  if (isLocked(u.lockedUntil, now)) return "locked";
  return null;
}

/** Statut affiché : « verrouillé » est dérivé (UM-2), jamais stocké. */
export function displayStatus(u: { status: AccountStatus; lockedUntil: Date | null; deletionRequestedAt: Date | null }, now: Date): AccountStatus | "locked" | "deletion_pending" {
  if (u.status !== "active") return u.status;
  if (u.deletionRequestedAt) return "deletion_pending";
  return isLocked(u.lockedUntil, now) ? "locked" : "active";
}
