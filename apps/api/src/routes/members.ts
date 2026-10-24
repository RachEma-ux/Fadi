/**
 * Module Collaboration — partage du projet. Monté sous `/projects/:projectId/members`.
 *
 *   GET    /          → { owner, you, members } : le propriétaire, votre rôle, les personnes invitées (tout lecteur)
 *   POST   /          { email, role } → 201 : partage (ou changement de rôle) d'un compte existant ; 202 : invitation
 *                      nominative d'une adresse sans compte (UM-3, lien à copier si le courriel n'a pas pu partir) — propriétaire seulement
 *   DELETE /invitations/:invitationId → 204 : annulation d'une invitation en attente — propriétaire seulement
 *   PATCH  /:userId   { role } → le rôle d'un membre — propriétaire seulement
 *   DELETE /:userId   → 204 : retrait d'un membre par le propriétaire, ou départ du membre lui-même
 *   POST   /:userId/propriete → transfert de la propriété à ce membre (propriétaire seulement) : l'ancien propriétaire
 *                      devient éditeur, le nouveau quitte la liste des membres ; rien d'autre ne change (réservation, données)
 *
 * Rôles (`lib/owned-project.ts`) : `lecteur` lit tout et commente ;
 * `editeur` lit, commente et modifie (saisies, arbitrages, programme,
 * Atelier, sources…) ; le propriétaire seul partage, retire et supprime le
 * projet. Chaque droit est vérifié par le serveur à chaque requête : le
 * partage ne crée aucune copie, les membres travaillent sur le même projet
 * et le contrôle de concurrence (409) s'applique entre eux comme entre deux
 * appareils d'un même compte.
 *
 * Un compte existant est ajouté directement (comportement accepté, écart UM-8) ; une adresse sans compte reçoit
 * une invitation par courriel (D-1) : aucun compte n'est créé tant que la personne n'a pas accepté.
 */
import { Router } from "express";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { invitations, projectMembers, projects, users } from "../db/schema.js";
import { audit, clientIp } from "../lib/audit.js";
import { formatDate, mailLocale, PUBLIC_PATHS, publicLink, sendAccountMail } from "../lib/account.js";
import { createOrRenewInvitation, invitationView } from "../lib/invitations.js";
import { requireAuth } from "../middleware/require-auth.js";
import { projectOr404, type ProjectRole } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";

export const membersRouter = Router({ mergeParams: true });
membersRouter.use(requireAuth);

export interface MemberView {
  userId: string;
  email: string;
  role: "lecteur" | "editeur";
  invitedBy: string;
  createdAt: string;
}

export const ROLE_LABEL: Record<ProjectRole, string> = {
  proprietaire: "propriétaire",
  editeur: "éditeur",
  lecteur: "lecteur",
  support: "accès support (lecture seule)",
};

const roleSchema = z.enum(["lecteur", "editeur"]);
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email("Adresse invalide").max(254), role: roleSchema });
const roleBody = z.object({ role: roleSchema });

/** Les membres d'un projet (hors propriétaire), avec leur adresse, par date d'invitation. */
export async function listMembers(projectId: string): Promise<MemberView[]> {
  const rows = await db
    .select({ userId: projectMembers.userId, email: users.email, role: projectMembers.role, invitedBy: projectMembers.invitedBy, createdAt: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt), asc(users.email));
  return rows.map((r) => ({ userId: r.userId, email: r.email, role: r.role, invitedBy: r.invitedBy, createdAt: r.createdAt.toISOString() }));
}

export async function ownerEmailOf(ownerId: string): Promise<string> {
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  return owner?.email ?? "";
}

/** Invitations du projet en attente (propriétaire seulement) : adresse, rôle, échéance — jamais le jeton. */
async function pendingInvitations(projectId: string) {
  const rows = await db.select().from(invitations)
    .where(and(eq(invitations.projectId, projectId), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
    .orderBy(asc(invitations.createdAt));
  return rows.map((r) => invitationView(r));
}

membersRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  res.json({
    owner: { userId: project.ownerId, email: await ownerEmailOf(project.ownerId) }, you: { userId: req.user!.id, role: project.role }, members: await listMembers(project.id),
    ...(project.role === "proprietaire" ? { invitations: await pendingInvitations(project.id) } : {}),
  });
});

/** Annulation d'une invitation en attente par le propriétaire : le lien ne donne plus rien. */
membersRouter.delete("/invitations/:invitationId", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const id = req.params["invitationId"] as string;
  const done = await db.transaction(async (tx) => {
    const rows = await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() })
      .where(and(eq(invitations.id, id), eq(invitations.projectId, project.id), eq(invitations.status, "pending"))).returning({ id: invitations.id });
    if (rows.length) await audit(tx, { actorId: req.user!.id, action: "invitation.cancelled", target: { type: "invitation", id }, metadata: { projectId: project.id }, ip: clientIp(req) });
    return rows.length > 0;
  });
  if (!done) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

membersRouter.post("/", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const [account] = await db.select({ id: users.id, email: users.email, status: users.status }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!account) {
    // Adresse sans compte (UM-3) : une invitation nominative (projet + rôle), jamais un compte créé d'office. Sans envoi
    // possible (quota, transport absent), le lien est rendu au propriétaire pour qu'il le transmette (D-1).
    const locale = mailLocale(req);
    const result = await db.transaction(async (tx) => {
      const created = await createOrRenewInvitation(tx, { purpose: "project_participation", email: parsed.data.email, projectId: project.id, projectRole: parsed.data.role, invitedBy: req.user!.id, ip: clientIp(req) });
      const link = publicLink(PUBLIC_PATHS.invitation, created.token);
      const mail = await sendAccountMail(parsed.data.email, "invitation", {
        link, projectName: `${project.code} — ${project.name}`, role: ROLE_LABEL[parsed.data.role], expiresAt: formatDate(created.invitation.expiresAt, locale),
      }, locale, tx);
      return { ...created, link, mail };
    });
    res.status(202).json({
      invitation: invitationView(result.invitation, { projectName: `${project.code} — ${project.name}` }), resent: result.resent,
      mail: { queued: result.mail.queued, reason: result.mail.reason, ...(result.mail.queued ? {} : { link: result.link }) },
    });
    return;
  }
  if (account.status === "closed") {
    res.status(404).json({ error: "user_not_found", message: "Aucun compte actif n’a cette adresse." });
    return;
  }
  if (account.id === project.ownerId) {
    res.status(422).json({ error: "sharing_rule", message: "Le propriétaire du projet a déjà tous les droits." });
    return;
  }
  const [row] = await db
    .insert(projectMembers)
    .values({ projectId: project.id, userId: account.id, role: parsed.data.role, invitedBy: req.user!.email })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: parsed.data.role } })
    .returning();
  res.status(201).json({ userId: account.id, email: account.email, role: row!.role, invitedBy: row!.invitedBy, createdAt: row!.createdAt.toISOString() } satisfies MemberView);
});

membersRouter.patch("/:userId", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const parsed = roleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const userId = req.params["userId"] as string;
  const [row] = await db
    .update(projectMembers)
    .set({ role: parsed.data.role })
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  res.json({ userId, email: account?.email ?? "", role: row.role, invitedBy: row.invitedBy, createdAt: row.createdAt.toISOString() } satisfies MemberView);
});

membersRouter.delete("/:userId", async (req, res) => {
  const userId = req.params["userId"] as string;
  // Un membre peut quitter le projet lui-même ; retirer quelqu'un d'autre est réservé au propriétaire.
  const project = await projectOr404(req, res, userId === req.user!.id ? "read" : "owner");
  if (!project) return;
  const deleted = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
    .returning({ userId: projectMembers.userId });
  if (!deleted.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});

/**
 * Transfert de propriété : le membre désigné devient propriétaire (il partage,
 * libère et supprime désormais), l'ancien propriétaire reste éditeur. Le
 * projet, ses données, ses membres et une éventuelle réservation d'édition
 * ne changent pas ; la provenance et l'historique non plus.
 */
membersRouter.post("/:userId/propriete", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const userId = req.params["userId"] as string;
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const [member] = await tx
      .select({ userId: projectMembers.userId, email: users.email })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .limit(1);
    if (!member) return null;
    // Ordre voulu : chacun garde un accès à chaque écriture, sa participation au projet (miroir tenu par déclencheurs,
    // init.sql) continue sans interruption.
    await tx.insert(projectMembers).values({ projectId: project.id, userId: project.ownerId, role: "editeur", invitedBy: member.email });
    await tx.update(projects).set({ ownerId: userId, updatedAt: new Date() }).where(eq(projects.id, project.id));
    await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
    return member;
  });
  if (!result) {
    res.status(404).json({ error: "not_found", message: "La propriété ne peut être transférée qu'à un membre du projet : invitez d'abord ce compte." });
    return;
  }
  res.json({ owner: { userId: result.userId, email: result.email }, you: { userId: req.user!.id, role: "editeur" as ProjectRole }, members: await listMembers(project.id) });
});
