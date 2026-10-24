/**
 * Journal d'audit de la gestion des comptes (table `audit_log`, append-only : ni UPDATE ni DELETE, déclencheurs SQL).
 *
 * Appelé avec la transaction de l'action tracée (`audit(tx, …)`) : l'entrée et l'action sont validées ou annulées
 * ensemble. Aucune adresse e-mail, aucun mot de passe, jeton ou code n'y est jamais écrit (D-5 : l'anonymisation
 * n'a rien à effacer ici) ; une adresse inconnue est tracée par son empreinte (`emailHash`).
 */
import { createHash } from "node:crypto";
import type { Request } from "express";
import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export type AuditAction =
  | "auth.login.succeeded"
  | "auth.login.failed"
  | "auth.login.locked"
  | "auth.login.mfa_failed"
  | "auth.logout"
  | "auth.password.changed"
  | "auth.password.reset_requested"
  | "auth.password.reset"
  | "auth.sessions.revoked"
  | "auth.mfa.enabled"
  | "auth.mfa.disabled"
  | "auth.mfa.recovery_used"
  | "auth.email.verified"
  | "auth.register"
  | "account.activated"
  | "account.export"
  | "account.deletion.requested"
  | "account.deletion.cancelled"
  | "account.anonymized"
  | "admin.user.role_changed"
  | "admin.user.suspended"
  | "admin.user.reactivated"
  | "admin.user.sessions_revoked"
  | "admin.user.deletion_requested"
  | "admin.user.deletion_cancelled"
  | "admin.user.anonymized_now"
  | "admin.user.promoted_by_script"
  | "invitation.created"
  | "invitation.resent"
  | "invitation.cancelled"
  | "invitation.accepted"
  | "invitation.declined"
  | "invitation.refused"
  | "support.granted"
  | "support.revoked"
  | "support.accessed"
  // Changements d'accès à un projet (écart E3, 2026-10-24) : cible = le projet ; métadonnées = membre visé, rôle et
  // export avant / après — jamais d'adresse.
  | "project.member.added"
  | "project.member.role_changed"
  | "project.member.export_changed"
  | "project.member.removed"
  | "project.member.left"
  | "project.ownership.transferred"
  // Audience d'un fil changée par son auteur ou le propriétaire (écart E1) : cible = le projet.
  | "comment.audience_changed"
  // Organisations (phase 5, Issue #262) : cible = l'organisation ; métadonnées = identifiants (adhésion, groupe, gabarit,
  // mandat, projet), rôles et statuts avant / après — jamais d'adresse ni de nom de personne.
  | "organization.created"
  | "organization.updated"
  | "organization.status_changed"
  | "organization.membership.created"
  | "organization.membership.changed"
  | "organization.membership.ended"
  | "organization.group.created"
  | "organization.group.updated"
  | "organization.group.member_added"
  | "organization.group.member_removed"
  | "organization.template.created"
  | "organization.template.version_created"
  | "organization.template.applied"
  | "organization.mandate.proposed"
  | "organization.mandate.accepted"
  | "organization.mandate.declined"
  | "organization.mandate.cancelled"
  | "organization.mandate.ended"
  | "organization.project.participation_recorded"
  | "organization.project.owner_declared"
  | "mail.quota_exceeded";

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  target?: { type: "user" | "project" | "invitation" | "support_grant" | "session" | "mail" | "organization"; id: string } | undefined;
  metadata?: Record<string, unknown> | undefined;
  ip?: string | null | undefined;
}

type Executor = Pick<typeof db, "insert">;

const FORBIDDEN_KEYS = /^(email|password|token|code|secret)$/i;

/** Garde-fou : une clé sensible dans les métadonnées est une erreur de programmation, jamais écrite. */
export function sanitizeAuditMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_KEYS.test(key)) throw new Error(`audit: clé interdite dans les métadonnées (${key})`);
  }
  return metadata;
}

export function emailHash(email: string): string {
  return createHash("sha256").update(`fadi-audit:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

export async function audit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.target?.type ?? null,
    targetId: entry.target?.id ?? null,
    metadata: sanitizeAuditMetadata(entry.metadata),
    ip: entry.ip ?? null,
  });
}

/** Adresse du client telle qu'Express la résout (`trust proxy` réglé par `TRUST_PROXY`). */
export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
