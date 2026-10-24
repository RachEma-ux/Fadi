/**
 * Administration de la plateforme — comptes seulement (D-2 : jamais le contenu des projets). Monté sur `/admin` derrière
 * `requirePlatformRole("admin")` : 404 pour toute personne qui n'est pas administrateur actif, 404 partout tant que
 * `FADI_ADMIN_ENABLED` n'est pas `true`, 403 `mfa_required` pour un administrateur sans double authentification.
 *
 *   GET    /admin/users                      tableau paginé : recherche `q`, filtres `status`, `role`, `hideTest`
 *                                            (`true` : comptes de test des recettes masqués, domaines réservés, UM-31)
 *   GET    /admin/users/:id                  fiche : projets (rôles), sessions, accès support, historique d'audit
 *   PATCH  /admin/users/:id/role             { role: "user" | "admin" }
 *   POST   /admin/users/:id/suspend          sessions révoquées, réservations d'édition libérées
 *   POST   /admin/users/:id/reactivate
 *   POST   /admin/users/:id/revoke-sessions
 *   DELETE /admin/users/:id                  suppression programmée (D-5), refusée s'il possède des projets partagés
 *   GET    /admin/trash                      corbeille (UM-27) : comptes en suppression programmée, date d'anonymisation, demandeur
 *   POST   /admin/users/:id/restore          « Restaurer » : annule la suppression (voie du lien d'annulation), statut antérieur
 *   POST   /admin/users/:id/anonymize        { confirmEmail } « Anonymiser maintenant » : compte de la corbeille seulement,
 *                                            même anonymisation que la tâche des 30 jours (`anonymiseAccountIn`), irréversible
 *   POST   /admin/users/invitations          { email } → invitation à créer un compte (UM-3)
 *   GET    /admin/audit                      journal d'activité en lecture seule (routes/admin/journal.ts, phase 3 bis)
 *   GET    /admin/invitations                filtres `status`, `hideTest` (UM-31) · DELETE /admin/invitations/:id
 *   « Renvoyer » une invitation de compte = POST /admin/users/invitations sur la même adresse : nouveau jeton (seule
 *   son empreinte est stockée), l'ancien lien cesse de fonctionner ; le lien en clair n'est rendu qu'une fois.
 *
 * Garde-fous : jamais sur soi-même (rôle, suspension, suppression) ; jamais le dernier administrateur actif (vérifié
 * sous le verrou d'éligibilité `lockAdminEligibility`, dans la transaction même de la mutation) ; chaque action journalisée dans `audit_log`. Les mutations ne sont jamais mises en
 * file hors ligne par le client.
 */
import { Router, type Request, type Response } from "express";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
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
import { cancelScheduledDeletion, deletionMail, scheduleDeletion, sharedOwnedProjects } from "../auth.js";
import { lockAdminEligibility } from "../../lib/admin-eligibility.js";
import { anonymiseAccountIn } from "../../lib/account-jobs.js";
import { RESERVED_ADDRESS_PATTERN } from "../../lib/mailer/quota.js";
import { adminJournalRouter } from "./journal.js";
import { anonymisationAt, anonymiseNowRefusal, deletionRequester, DELETION_GRACE_DAYS, type AnonymiseNowRefusal } from "../../lib/security/deletion.js";

export const adminRouter = Router();
// Pas de `requireAuth` (401) : une personne anonyme reçoit le même 404 que tout non-administrateur.
adminRouter.use(requirePlatformRole("admin"));
// Journal d'activité en lecture seule (phase 3 bis) : GET /admin/audit, derrière la même garde.
adminRouter.use(adminJournalRouter);

const notFound = (res: Response) => res.status(404).json({ error: "not_found" });

/** `hideTest=true` : adresses de domaine réservé (comptes des recettes automatiques) écartées en SQL ; rien n'est supprimé. */
const hideTestSchema = z.enum(["true", "false"]).optional().transform((v) => v === "true");
const notReserved = (column: typeof users.email | typeof invitations.email) => sql`${column} !~* ${RESERVED_ADDRESS_PATTERN}`;

const listSchema = z.object({
  q: z.string().trim().max(254).optional(),
  status: z.enum(["active", "suspended", "closed", "locked", "deletion_pending"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  hideTest: hideTestSchema,
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
  const { q, status, role, page, pageSize, hideTest } = parsed.data;
  const filters: SQL[] = [];
  if (hideTest) filters.push(notReserved(users.email));
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
  // Sans courriel en file, l'administrateur reçoit le lien d'annulation à transmettre lui-même (D-1, comme les invitations).
  res.status(202).json({ deletionAt: scheduled.deletionAt.toISOString(), mail: deletionMail(scheduled) });
});

// ----- Corbeille (UM-27, amendement de D-5) -----
// Elle ne contient que les comptes en suppression programmée, donc encore restaurables. Un compte anonymisé n'y figure
// pas : l'anonymisation est irréversible, il ne reste rien à restaurer ; sa trace est le statut « fermé (anonymisé) » du
// tableau des comptes et l'entrée du journal d'audit.

adminRouter.get("/trash", async (_req, res) => {
  const rows = await db.select().from(users)
    .where(and(isNotNull(users.deletionRequestedAt), inArray(users.status, ["active", "suspended"])))
    .orderBy(asc(users.deletionRequestedAt)).limit(500);
  const ids = rows.map((r) => r.id);
  // Demandeur : la dernière entrée du journal qui a programmé la suppression (titulaire ou administrateur).
  const requests = ids.length ? await db.selectDistinctOn([auditLog.targetId], { targetId: auditLog.targetId, action: auditLog.action, actorId: auditLog.actorId })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, "user"), inArray(auditLog.targetId, ids), inArray(auditLog.action, ["account.deletion.requested", "admin.user.deletion_requested"])))
    .orderBy(auditLog.targetId, desc(auditLog.id)) : [];
  const actorIds = [...new Set(requests.map((r) => r.actorId).filter((a): a is string => !!a))];
  const actors = new Map((actorIds.length ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, actorIds)) : []).map((a) => [a.id, a.email]));
  const byTarget = new Map(requests.map((r) => [r.targetId, r]));
  // Projets partagés possédés : ils bloquent l'anonymisation (tâche des 30 jours comme « Anonymiser maintenant »).
  const shared = new Map<string, number>();
  if (ids.length) {
    const owned = await db.selectDistinct({ id: projects.id, ownerId: projects.ownerId }).from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id)).where(inArray(projects.ownerId, ids));
    for (const p of owned) shared.set(p.ownerId, (shared.get(p.ownerId) ?? 0) + 1);
  }
  res.json({
    graceDays: DELETION_GRACE_DAYS,
    items: rows.map((u) => {
      const r = byTarget.get(u.id);
      const kind = deletionRequester(r?.action);
      return {
        id: u.id, email: u.email, displayName: u.displayName, platformRole: u.platformRole, status: u.status,
        deletionRequestedAt: u.deletionRequestedAt!.toISOString(), anonymisationAt: anonymisationAt(u.deletionRequestedAt!).toISOString(),
        requestedBy: kind ? { kind, actorId: r!.actorId, actorEmail: r!.actorId ? actors.get(r!.actorId) ?? null : null } : null,
        sharedProjects: shared.get(u.id) ?? 0,
      };
    }),
  });
});

adminRouter.post("/users/:userId/restore", async (req, res) => {
  const id = req.params["userId"] as string;
  if (refuseSelf(req, res, id)) return;
  const outcome = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    if (!u) return "not_found" as const;
    if (u.status === "closed") return "already_anonymized" as const;
    // Même voie que le lien d'annulation reçu par courriel ; le statut stocké (actif ou suspendu) est rétabli tel quel.
    if (!(await cancelScheduledDeletion(tx, id))) return "not_in_trash" as const;
    await audit(tx, { actorId: req.user!.id, action: "admin.user.deletion_cancelled", target: { type: "user", id }, metadata: { status: u.status }, ip: clientIp(req) });
    return { ...u, deletionRequestedAt: null };
  });
  if (outcome === "not_found") return void notFound(res);
  if (outcome === "already_anonymized") return void res.status(409).json({ error: "already_anonymized", message: "Ce compte est déjà anonymisé : l’anonymisation est irréversible." });
  if (outcome === "not_in_trash") return void res.status(409).json({ error: "not_in_trash", message: "Ce compte n’est pas dans la corbeille : aucune suppression n’est programmée." });
  res.json({ user: userView(outcome, 0) });
});

const anonymizeSchema = z.object({ confirmEmail: z.string().trim().min(1).max(254) });
const ANONYMIZE_REFUSAL: Record<Exclude<AnonymiseNowRefusal, "not_found" | "owns_shared_projects">, { status: number; message: string }> = {
  already_anonymized: { status: 409, message: "Ce compte est déjà anonymisé." },
  not_in_trash: { status: 409, message: "Seul un compte de la corbeille (suppression programmée) peut être anonymisé maintenant." },
  confirmation_mismatch: { status: 422, message: "L’adresse saisie ne correspond pas à celle du compte : rien n’a été anonymisé." },
  last_admin: { status: 409, message: "Impossible : c'est le dernier administrateur actif de la plateforme." },
};

adminRouter.post("/users/:userId/anonymize", async (req, res) => {
  const id = req.params["userId"] as string;
  const parsed = anonymizeSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_input", message: "Saisissez l’adresse du compte pour confirmer." });
  if (refuseSelf(req, res, id)) return;
  // Sous le verrou d'éligibilité des administrateurs, comme toute opération qui peut retirer un administrateur ; puis
  // la ligne du compte verrouillée : deux demandes simultanées (ou la tâche des 30 jours) se suivent, la seconde voit
  // un compte déjà anonymisé.
  const outcome = await db.transaction(async (tx) => {
    const admins = await lockAdminEligibility(tx);
    const [u] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    const shared = u && u.status !== "closed" ? await sharedOwnedProjects(id, tx) : [];
    const refusal = anonymiseNowRefusal({
      status: u?.status ?? null, deletionRequestedAt: u?.deletionRequestedAt ?? null, email: u?.email ?? null, confirmEmail: parsed.data.confirmEmail,
      sharedProjects: shared.length, removesLastAdmin: removesLastAdmin(admins, id),
    });
    if (refusal) return { refusal, projects: shared };
    // Exactement l'anonymisation de la tâche des 30 jours ; seule l'entrée du journal nomme l'administrateur.
    if (!(await anonymiseAccountIn(tx, id, { actorId: req.user!.id, action: "admin.user.anonymized_now", ip: clientIp(req) }))) return { refusal: "not_in_trash" as const, projects: [] };
    return { anonymized: id };
  });
  if ("anonymized" in outcome) return void res.json({ anonymized: true, userId: outcome.anonymized });
  if (outcome.refusal === "not_found") return void notFound(res);
  if (outcome.refusal === "owns_shared_projects") {
    res.status(409).json({ error: "owns_shared_projects", message: "Ce compte possède des projets partagés : leur propriété doit d'abord être transférée à un de leurs membres.", projects: outcome.projects });
    return;
  }
  const r = ANONYMIZE_REFUSAL[outcome.refusal];
  res.status(r.status).json({ error: outcome.refusal, message: r.message });
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
  const hideTest = hideTestSchema.safeParse(req.query["hideTest"]);
  if (!hideTest.success) return void res.status(400).json({ error: "invalid_input" });
  const filters: SQL[] = [];
  if (status.success && status.data) filters.push(eq(invitations.status, status.data));
  if (hideTest.data) filters.push(notReserved(invitations.email));
  const rows = await db.select().from(invitations).where(filters.length ? and(...filters) : undefined).orderBy(desc(invitations.createdAt)).limit(200);
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
