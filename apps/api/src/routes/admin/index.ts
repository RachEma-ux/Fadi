/**
 * Administration de la plateforme — comptes seulement (D-2 : jamais le contenu des projets). Monté sur `/admin` derrière
 * `requirePlatformRole("admin")` : 404 pour toute personne qui n'est pas administrateur actif, 404 partout tant que
 * `FADI_ADMIN_ENABLED` n'est pas `true`, 403 `mfa_required` pour un administrateur sans double authentification.
 *
 *   GET    /admin/users                      tableau paginé : recherche `q`, filtres `status`, `role`
 *   GET    /admin/users/:id                  fiche : projets (rôles), sessions, accès support, historique d'audit
 *   PATCH  /admin/users/:id/role             { role: "user" | "admin" }
 *   POST   /admin/users/:id/suspend          sessions révoquées, réservations d'édition libérées
 *   POST   /admin/users/:id/reactivate
 *   POST   /admin/users/:id/revoke-sessions
 *   DELETE /admin/users/:id                  suppression programmée (D-5), refusée s'il possède des projets partagés
 *   POST   /admin/users/invitations          { email } → invitation à créer un compte (UM-3)
 *   GET    /admin/invitations · DELETE /admin/invitations/:id
 *
 * Garde-fous : jamais sur soi-même (rôle, suspension, suppression) ; jamais le dernier administrateur actif (vérifié
 * sous le verrou d'éligibilité `lockAdminEligibility`, dans la transaction même de la mutation) ; chaque action journalisée dans `audit_log`. Les mutations ne sont jamais mises en
 * file hors ligne par le client.
 */
import { Router, type Request, type Response } from "express";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { auditLog, invitations, projectMembers, projectSupportGrants, projects, sessions, users } from "../../db/schema.js";
import { removesLastAdmin, requirePlatformRole } from "../../lib/platform-access.js";
import { revokeUserSessions } from "../../lib/auth.js";
import { audit, clientIp } from "../../lib/audit.js";
import { displayStatus } from "../../lib/security/auth-policy.js";
import { assertTransition, AccountTransitionRefused } from "../../lib/security/account-state.js";
import { formatDate, mailLocale, PUBLIC_PATHS, publicLink, sendAccountMail } from "../../lib/account.js";
import { createOrRenewInvitation, invitationView } from "../../lib/invitations.js";
import { scheduleDeletion } from "../auth.js";
import { lockAdminEligibility } from "../../lib/admin-eligibility.js";

export const adminRouter = Router();
// Pas de `requireAuth` (401) : une personne anonyme reçoit le même 404 que tout non-administrateur.
adminRouter.use(requirePlatformRole("admin"));

const notFound = (res: Response) => res.status(404).json({ error: "not_found" });

const listSchema = z.object({
  q: z.string().trim().max(254).optional(),
  status: z.enum(["active", "suspended", "closed", "locked", "deletion_pending"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

function userView(u: typeof users.$inferSelect, projectsCount: number) {
  return {
    id: u.id, email: u.email, displayName: u.displayName, platformRole: u.platformRole, status: displayStatus(u, new Date()),
    createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null, emailVerified: !!u.emailVerifiedAt,
    mfaEnabled: !!u.totpEnabledAt, deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null, projectsCount,
  };
}

adminRouter.get("/users", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const { q, status, role, page, pageSize } = parsed.data;
  const filters: SQL[] = [];
  if (q) filters.push(or(ilike(users.email, `%${q.replace(/[%_\\]/g, "\\$&")}%`), ilike(users.displayName, `%${q.replace(/[%_\\]/g, "\\$&")}%`))!);
  if (role) filters.push(eq(users.platformRole, role));
  if (status === "locked") filters.push(eq(users.status, "active"), isNull(users.deletionRequestedAt), gt(users.lockedUntil, new Date()));
  else if (status === "deletion_pending") filters.push(sql`${users.deletionRequestedAt} IS NOT NULL`, inArray(users.status, ["active", "suspended"]));
  else if (status === "active") filters.push(eq(users.status, "active"), isNull(users.deletionRequestedAt), or(isNull(users.lockedUntil), sql`${users.lockedUntil} <= now()`)!);
  else if (status) filters.push(eq(users.status, status));
  const where = filters.length ? and(...filters) : undefined;
  const [total] = await db.select({ n: count() }).from(users).where(where);
  const rows = await db.select().from(users).where(where).orderBy(asc(users.email)).limit(pageSize).offset((page - 1) * pageSize);
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const owned = await db.select({ id: projects.ownerId, n: count() }).from(projects).where(inArray(projects.ownerId, ids)).groupBy(projects.ownerId);
    const member = await db.select({ id: projectMembers.userId, n: count() }).from(projectMembers).where(inArray(projectMembers.userId, ids)).groupBy(projectMembers.userId);
    for (const r of [...owned, ...member]) counts.set(r.id, (counts.get(r.id) ?? 0) + Number(r.n));
  }
  res.json({ users: rows.map((u) => userView(u, counts.get(u.id) ?? 0)), total: Number(total?.n ?? 0), page, pageSize });
});

adminRouter.get("/users/:userId", async (req, res) => {
  const id = req.params["userId"] as string;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) return void notFound(res);
  // Projets : identité et rôle seulement — jamais leur contenu (D-2).
  const owned = await db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(eq(projects.ownerId, id));
  const member = await db.select({ id: projects.id, code: projects.code, name: projects.name, role: projectMembers.role })
    .from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId)).where(eq(projectMembers.userId, id));
  const openSessions = await db.select().from(sessions)
    .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt), eq(sessions.mfaPending, false), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  const grants = await db.select({ id: projectSupportGrants.id, projectId: projectSupportGrants.projectId, code: projects.code, expiresAt: projectSupportGrants.expiresAt, revokedAt: projectSupportGrants.revokedAt, purpose: projectSupportGrants.purpose })
    .from(projectSupportGrants).innerJoin(projects, eq(projects.id, projectSupportGrants.projectId)).where(eq(projectSupportGrants.adminId, id)).orderBy(desc(projectSupportGrants.grantedAt)).limit(50);
  const history = await db.select().from(auditLog)
    .where(or(eq(auditLog.actorId, id), and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, id))))
    .orderBy(desc(auditLog.id)).limit(100);
  res.json({
    user: userView(u, owned.length + member.length),
    projects: [...owned.map((p) => ({ ...p, role: "proprietaire" as const })), ...member],
    sessions: openSessions.map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), lastSeenAt: (s.lastSeenAt ?? s.createdAt).toISOString(), userAgent: s.userAgent, ip: s.ip })),
    supportGrants: grants.map((g) => ({ ...g, expiresAt: g.expiresAt.toISOString(), revokedAt: g.revokedAt?.toISOString() ?? null })),
    audit: history.map((a) => ({ id: a.id, action: a.action, actorId: a.actorId, targetType: a.targetType, targetId: a.targetId, metadata: a.metadata, ip: a.ip, createdAt: a.createdAt.toISOString() })),
  });
});

function refuseSelf(req: Request, res: Response, id: string): boolean {
  if (id !== req.user!.id) return false;
  res.status(422).json({ error: "self_action", message: "Action impossible sur votre propre compte depuis l'administration." });
  return true;
}
const lastAdmin = (res: Response) => res.status(409).json({ error: "last_admin", message: "Impossible : c'est le dernier administrateur actif de la plateforme." });

adminRouter.patch("/users/:userId/role", async (req, res) => {
  const id = req.params["userId"] as string;
  const parsed = z.object({ role: z.enum(["user", "admin"]) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_input" });
  if (refuseSelf(req, res, id)) return;
  const outcome = await db.transaction(async (tx) => {
    const admins = await lockAdminEligibility(tx);
    const [u] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    if (!u || u.status === "closed") return "not_found" as const;
    if (u.platformRole === parsed.data.role) return u;
    if (parsed.data.role === "user" && removesLastAdmin(admins, id)) return "last_admin" as const;
    const [updated] = await tx.update(users).set({ platformRole: parsed.data.role }).where(eq(users.id, id)).returning();
    // Un changement de rôle ferme les sessions ouvertes : la nouvelle session suit les limites du nouveau rôle.
    await revokeUserSessions(id, null, tx);
    await audit(tx, { actorId: req.user!.id, action: "admin.user.role_changed", target: { type: "user", id }, metadata: { from: u.platformRole, to: parsed.data.role }, ip: clientIp(req) });
    return updated!;
  });
  if (outcome === "not_found") return void notFound(res);
  if (outcome === "last_admin") return void lastAdmin(res);
  res.json({ user: userView(outcome, 0) });
});

adminRouter.post("/users/:userId/suspend", async (req, res) => {
  const id = req.params["userId"] as string;
  if (refuseSelf(req, res, id)) return;
  const locale = mailLocale(req);
  const outcome = await db.transaction(async (tx) => {
    const admins = await lockAdminEligibility(tx);
    const [u] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    if (!u) return "not_found" as const;
    try { assertTransition(u.status, "suspended"); } catch (e) { if (e instanceof AccountTransitionRefused) return "transition" as const; throw e; }
    if (removesLastAdmin(admins, id)) return "last_admin" as const;
    const [updated] = await tx.update(users).set({ status: "suspended" }).where(eq(users.id, id)).returning();
    const revoked = await revokeUserSessions(id, null, tx);
    // Réservations d'édition (« un seul éditeur actif ») détenues : libérées, le projet redevient modifiable par les autres.
    const released = await tx.execute(sql`UPDATE projects SET editing_lock = NULL WHERE editing_lock->>'userId' = ${id} RETURNING id`);
    await audit(tx, { actorId: req.user!.id, action: "admin.user.suspended", target: { type: "user", id }, metadata: { revokedSessions: revoked, releasedLocks: released.rows.length }, ip: clientIp(req) });
    await sendAccountMail(u.email, "account_suspended", {}, locale, tx);
    return updated!;
  });
  if (outcome === "not_found") return void notFound(res);
  if (outcome === "last_admin") return void lastAdmin(res);
  if (outcome === "transition") return void res.status(409).json({ error: "invalid_transition", message: "Ce compte ne peut pas être suspendu dans son état actuel." });
  res.json({ user: userView(outcome, 0) });
});

adminRouter.post("/users/:userId/reactivate", async (req, res) => {
  const id = req.params["userId"] as string;
  if (refuseSelf(req, res, id)) return;
  const outcome = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    if (!u) return "not_found" as const;
    if (u.status === "active" && u.lockedUntil && u.lockedUntil > new Date()) {
      // Compte verrouillé (dérivé) : la réactivation lève le verrouillage.
      const [updated] = await tx.update(users).set({ lockedUntil: null, failedLoginCount: 0 }).where(eq(users.id, id)).returning();
      await audit(tx, { actorId: req.user!.id, action: "admin.user.reactivated", target: { type: "user", id }, metadata: { unlocked: true }, ip: clientIp(req) });
      return updated!;
    }
    try { assertTransition(u.status, "active"); } catch (e) { if (e instanceof AccountTransitionRefused) return "transition" as const; throw e; }
    const [updated] = await tx.update(users).set({ status: "active", lockedUntil: null, failedLoginCount: 0 }).where(eq(users.id, id)).returning();
    await audit(tx, { actorId: req.user!.id, action: "admin.user.reactivated", target: { type: "user", id }, ip: clientIp(req) });
    return updated!;
  });
  if (outcome === "not_found") return void notFound(res);
  if (outcome === "transition") return void res.status(409).json({ error: "invalid_transition", message: "Ce compte ne peut pas être réactivé dans son état actuel." });
  res.json({ user: userView(outcome, 0) });
});

adminRouter.post("/users/:userId/revoke-sessions", async (req, res) => {
  const id = req.params["userId"] as string;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (!u) return void notFound(res);
  const n = await db.transaction(async (tx) => {
    const revoked = await revokeUserSessions(id, id === req.user!.id ? req.user!.sessionId : null, tx);
    await audit(tx, { actorId: req.user!.id, action: "admin.user.sessions_revoked", target: { type: "user", id }, metadata: { count: revoked }, ip: clientIp(req) });
    return revoked;
  });
  res.json({ revoked: n });
});

adminRouter.delete("/users/:userId", async (req, res) => {
  const id = req.params["userId"] as string;
  if (refuseSelf(req, res, id)) return;
  // Contrôles et mutation dans la même transaction, sous le verrou d'éligibilité des administrateurs (scheduleDeletion).
  const scheduled = await scheduleDeletion(id, req.user!.id, req, "admin.user.deletion_requested");
  if ("refusal" in scheduled) {
    if (scheduled.refusal === "not_found") return void notFound(res);
    if (scheduled.refusal === "last_admin") return void lastAdmin(res);
    if (scheduled.refusal === "owns_shared_projects") {
      res.status(409).json({ error: "owns_shared_projects", message: "Ce compte possède des projets partagés : leur propriété doit d'abord être transférée à un de leurs membres.", projects: scheduled.projects });
      return;
    }
    return void res.status(409).json({ error: "deletion_already_requested" });
  }
  res.status(202).json({ deletionAt: scheduled.deletionAt.toISOString(), mail: { queued: scheduled.mail.queued } });
});

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), locale: z.enum(["fr", "en"]).optional() });

adminRouter.post("/users/invitations", async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_input", message: "Adresse invalide." });
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) return void res.status(409).json({ error: "account_exists", message: "Un compte existe déjà pour cette adresse.", userId: existing.id });
  const locale = mailLocale(req, parsed.data.locale);
  const result = await db.transaction(async (tx) => {
    const created = await createOrRenewInvitation(tx, { purpose: "platform_account", email: parsed.data.email, invitedBy: req.user!.id, ip: clientIp(req) });
    const link = publicLink(PUBLIC_PATHS.invitation, created.token);
    const mail = await sendAccountMail(parsed.data.email, "invitation", { link, expiresAt: formatDate(created.invitation.expiresAt, locale) }, locale, tx);
    return { ...created, link, mail };
  });
  // Repli déclaré (D-1) : sans envoi, l'administrateur reçoit le lien à transmettre lui-même.
  res.status(result.resent ? 200 : 201).json({
    invitation: invitationView(result.invitation), resent: result.resent,
    mail: { queued: result.mail.queued, reason: result.mail.reason, ...(result.mail.queued ? {} : { link: result.link }) },
  });
});

adminRouter.get("/invitations", async (req, res) => {
  const status = z.enum(["pending", "accepted", "declined", "expired", "cancelled"]).optional().safeParse(req.query["status"]);
  const rows = await db.select().from(invitations).where(status.success && status.data ? eq(invitations.status, status.data) : undefined).orderBy(desc(invitations.createdAt)).limit(200);
  res.json({ invitations: rows.map((r) => invitationView(r)) });
});

adminRouter.delete("/invitations/:invitationId", async (req, res) => {
  const id = req.params["invitationId"] as string;
  const done = await db.transaction(async (tx) => {
    const rows = await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() }).where(and(eq(invitations.id, id), eq(invitations.status, "pending"))).returning({ id: invitations.id });
    if (rows.length) await audit(tx, { actorId: req.user!.id, action: "invitation.cancelled", target: { type: "invitation", id }, ip: clientIp(req) });
    return rows.length > 0;
  });
  if (!done) return void notFound(res);
  res.status(204).end();
});
