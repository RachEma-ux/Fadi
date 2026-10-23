/**
 * Accès plateforme (docs/workstreams/users-management, phase 3) — à côté de `projectOr404`, jamais mélangé avec lui.
 *
 * `requirePlatformRole("admin")` : échec fermé et non-divulgation — une route `/admin/*` répond **404** à toute personne
 * qui n'est pas administrateur actif (anonyme, utilisateur, suspendu), comme un projet inaccessible ; l'administration
 * entière répond 404 tant que `FADI_ADMIN_ENABLED` n'est pas `true` (drapeau, défaut `false`). Un administrateur sans
 * double authentification active reçoit 403 `mfa_required` (D-6) et est envoyé à l'enrôlement. Un administrateur dont le
 * TOTP est actif mais dont **la session** n'a pas prouvé le code (session ouverte au mot de passe avant l'activation,
 * session antérieure à l'assurance de session) reçoit 403 `mfa_session_required` : l'enrôlement du compte ne rehausse
 * jamais une session existante (revue de sécurité de la PR #255).
 * Le rôle administrateur ne change rien au résultat de `projectOr404` (D-2) : seul un accès support accordé par le
 * propriétaire ouvre un projet, en lecture.
 */
import type { NextFunction, Request, Response } from "express";
import type { PlatformRole } from "../db/schema.js";

export const adminEnabled = (env: Record<string, string | undefined> = process.env) => env["FADI_ADMIN_ENABLED"] === "true";

export type PlatformRefusal =
  | { status: 404; body: { error: "not_found" } }
  | { status: 403; body: { error: "mfa_required" | "mfa_session_required"; message: string } };

/** Décision pure. */
export function platformRefusal(
  user: { platformRole: PlatformRole; status: string; mfaEnabled: boolean; mfaVerified: boolean } | undefined,
  role: PlatformRole,
  enabled: boolean,
): PlatformRefusal | null {
  if (!enabled || !user || user.status !== "active" || user.platformRole !== role) return { status: 404, body: { error: "not_found" } };
  if (role === "admin" && !user.mfaEnabled) {
    return { status: 403, body: { error: "mfa_required", message: "La double authentification est obligatoire pour l'administration : activez-la dans Mon compte." } };
  }
  if (role === "admin" && !user.mfaVerified) {
    return { status: 403, body: { error: "mfa_session_required", message: "Cette session n'a pas été ouverte avec votre code de double authentification : déconnectez-vous, puis reconnectez-vous avec votre code." } };
  }
  return null;
}

export function requirePlatformRole(role: PlatformRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const refusal = platformRefusal(req.user, role, adminEnabled());
    if (refusal) {
      res.status(refusal.status).json(refusal.body);
      return;
    }
    next();
  };
}

/**
 * Garde du dernier administrateur (décision pure, appelée sous verrou transactionnel des administrateurs actifs) : une
 * action qui retire le rôle, suspend ou supprime le dernier administrateur actif est refusée.
 */
export function removesLastAdmin(activeAdminIds: readonly string[], targetId: string): boolean {
  return activeAdminIds.includes(targetId) && activeAdminIds.length <= 1;
}
