/**
 * Accès support (D-2, UM-4) — monté sous `/projects/:projectId/support-grants`.
 *
 *   GET    /             propriétaire : accès accordés (actifs et historique) et administrateurs éligibles ;
 *                        administrateur bénéficiaire d'un accès actif : son propre accès (bandeau « Accès support jusqu'au … »)
 *   POST   /             propriétaire : { adminId, hours (1–72), purpose } → accès en lecture seule
 *   DELETE /:grantId     propriétaire : révocation immédiate
 *
 * L'accès donne le rôle `support` (lib/owned-project.ts) : lecture seule, ni commentaire, ni écriture, ni export ou
 * téléchargement — refusés par le besoin déclaré de chaque route (`export`, `write`…) et, en plus, par `supportReadOnlyGuard`. Chaque accord, révocation et ouverture du projet est journalisé.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { auditLog, projectSupportGrants, users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { activeSupportGrant, projectOr404, SUPPORT_NO_EXPORT, SUPPORT_READ_ONLY } from "../lib/owned-project.js";
import { audit, clientIp } from "../lib/audit.js";
import { newId } from "../lib/ids.js";
import { EXPORT_PATH, supportTarget } from "../lib/support-path.js";

export const supportGrantsRouter = Router({ mergeParams: true });
supportGrantsRouter.use(requireAuth);

export const SUPPORT_MAX_HOURS = 72;

const grantView = (g: typeof projectSupportGrants.$inferSelect, admin?: { email: string; displayName: string | null }, lastAccessAt?: Date | null) => ({
  id: g.id, adminId: g.adminId, adminEmail: admin?.email ?? null, adminName: admin?.displayName ?? null, purpose: g.purpose,
  grantedAt: g.grantedAt.toISOString(), expiresAt: g.expiresAt.toISOString(), revokedAt: g.revokedAt?.toISOString() ?? null,
  active: !g.revokedAt && g.expiresAt.getTime() > Date.now(), lastAccessAt: lastAccessAt?.toISOString() ?? null,
});

supportGrantsRouter.get("/", async (req, res) => {
  const projectId = (req.params as Record<string, string>)["projectId"] ?? "";
  const mine = await activeSupportGrant(projectId, req.user!.id);
  if (mine) {
    const [g] = await db.select().from(projectSupportGrants).where(eq(projectSupportGrants.id, mine.id)).limit(1);
    res.json({ you: "support", grant: grantView(g!) });
    return;
  }
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const rows = await db.select({ grant: projectSupportGrants, email: users.email, displayName: users.displayName })
    .from(projectSupportGrants).innerJoin(users, eq(users.id, projectSupportGrants.adminId))
    .where(eq(projectSupportGrants.projectId, project.id)).orderBy(desc(projectSupportGrants.grantedAt)).limit(100);
  const access = await db.select({ grantId: sql<string>`${auditLog.metadata}->>'grantId'`, at: sql<Date>`max(${auditLog.createdAt})` })
    .from(auditLog).where(and(eq(auditLog.action, "support.accessed"), eq(auditLog.targetType, "project"), eq(auditLog.targetId, project.id)))
    .groupBy(sql`${auditLog.metadata}->>'grantId'`);
  const last = new Map(access.map((a) => [a.grantId, a.at ? new Date(a.at) : null]));
  const admins = await db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users)
    .where(and(eq(users.platformRole, "admin"), eq(users.status, "active"), isNull(users.deletionRequestedAt))).orderBy(users.email);
  res.json({ you: "owner", grants: rows.map((r) => grantView(r.grant, r, last.get(r.grant.id) ?? null)), admins, maxHours: SUPPORT_MAX_HOURS });
});

const grantSchema = z.object({ adminId: z.string().min(1).max(100), hours: z.number().int().min(1).max(SUPPORT_MAX_HOURS), purpose: z.string().trim().min(3).max(500) });

supportGrantsRouter.post("/", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", message: `Choisissez un administrateur, une durée de 1 à ${SUPPORT_MAX_HOURS} heures et un motif.` });
    return;
  }
  const [admin] = await db.select().from(users).where(and(eq(users.id, parsed.data.adminId), eq(users.platformRole, "admin"), eq(users.status, "active"), isNull(users.deletionRequestedAt))).limit(1);
  if (!admin) {
    res.status(422).json({ error: "not_an_admin", message: "Seul un administrateur actif de la plateforme peut recevoir un accès support." });
    return;
  }
  if (admin.id === req.user!.id) {
    res.status(422).json({ error: "self_grant", message: "Vous avez déjà tous les droits sur ce projet." });
    return;
  }
  const now = new Date();
  const grant = await db.transaction(async (tx) => {
    const [g] = await tx.insert(projectSupportGrants).values({
      id: newId("sup"), projectId: project.id, adminId: admin.id, grantedBy: req.user!.id, purpose: parsed.data.purpose,
      grantedAt: now, expiresAt: new Date(now.getTime() + parsed.data.hours * 3_600_000),
    }).returning();
    await audit(tx, { actorId: req.user!.id, action: "support.granted", target: { type: "project", id: project.id }, metadata: { grantId: g!.id, adminId: admin.id, hours: parsed.data.hours }, ip: clientIp(req) });
    return g!;
  });
  res.status(201).json({ grant: grantView(grant, admin) });
});

supportGrantsRouter.delete("/:grantId", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const id = req.params["grantId"] as string;
  const done = await db.transaction(async (tx) => {
    const rows = await tx.update(projectSupportGrants).set({ revokedAt: new Date(), revokedBy: req.user!.id })
      .where(and(eq(projectSupportGrants.id, id), eq(projectSupportGrants.projectId, project.id), isNull(projectSupportGrants.revokedAt), gt(projectSupportGrants.expiresAt, new Date())))
      .returning({ id: projectSupportGrants.id });
    if (rows.length) await audit(tx, { actorId: req.user!.id, action: "support.revoked", target: { type: "project", id: project.id }, metadata: { grantId: id }, ip: clientIp(req) });
    return rows.length > 0;
  });
  if (!done) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

/**
 * Garde de l'accès support, montée sur `/projects` avant les sous-routeurs : un administrateur qui n'est ni propriétaire
 * ni membre mais dispose d'un accès actif ne peut que lire (GET, HEAD), jamais exporter ; chaque lecture est journalisée.
 * Le projet est résolu comme le fait le routeur (identifiant décodé) ; les routes déclarent en plus leur besoin (`read`,
 * `export`, `write`…), qui refuse l'accès support même si cette garde laissait passer un chemin.
 */
export async function supportReadOnlyGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  const target = user && user.platformRole === "admin" ? supportTarget(req.path) : null;
  if (!user || !target) { next(); return; }
  const { projectId, sub } = target;
  const rows = await db.execute(sql`SELECT (owner_id = ${user.id}) AS owner, EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = ${projectId} AND m.user_id = ${user.id}) AS member FROM projects WHERE id = ${projectId}`);
  const row = rows.rows[0] as { owner?: boolean; member?: boolean } | undefined;
  if (!row || row.owner || row.member) { next(); return; }
  const grant = await activeSupportGrant(projectId, user.id);
  if (!grant) { next(); return; }
  if (req.method !== "GET" && req.method !== "HEAD" && sub !== "/support-grants") {
    res.status(403).json(SUPPORT_READ_ONLY);
    return;
  }
  if (EXPORT_PATH.test(sub)) {
    res.status(403).json(SUPPORT_NO_EXPORT);
    return;
  }
  // Chaque lecture est journalisée (D-2) : le propriétaire voit qui a consulté quoi, et quand.
  await audit(db, { actorId: user.id, action: "support.accessed", target: { type: "project", id: projectId }, metadata: { grantId: grant.id, path: `/${projectId}${sub}`.slice(0, 200) }, ip: clientIp(req) });
  next();
}
