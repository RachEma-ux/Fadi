/**
 * Module Collaboration — partage du projet. Monté sous `/projects/:projectId/members`.
 *
 *   GET    /          → { owner, you, members } : le propriétaire, votre rôle, les personnes invitées (tout lecteur)
 *   POST   /          { email, role } → 201 : partage (ou changement de rôle) d'un compte existant ; 202 : invitation
 *                      nominative d'une adresse sans compte (UM-3, lien à copier si le courriel n'a pas pu partir) — propriétaire seulement
 *   DELETE /invitations/:invitationId → 204 : annulation d'une invitation en attente — propriétaire seulement
 *   PATCH  /:userId   { role?, canExport?, approbateur?, diffuseur?, gardien? } → le rôle d'un membre, l'export accordé
 *                      ou retiré à un lecteur (E2), les affectations d'Approbateur et de Diffuseur (E5) et la
 *                      responsabilité déclarée de gardien du contenu (E10) — propriétaire seulement
 *   DELETE /:userId   → 204 : retrait d'un membre par le propriétaire, ou départ du membre lui-même ; libère sa réservation
 *                      d'édition et ses verrous fins (E6)
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
 *
 * Export (écart E2, tranche CR-D4) : un nouveau lecteur n'exporte pas ; le propriétaire le lui accorde ou le retire
 * (`canExport`). Un lecteur antérieur à cette règle le garde ; un éditeur rétrogradé lecteur redevient un nouveau
 * lecteur (sans export). Journal (écart E3) : chaque ajout, changement de rôle ou d'export, retrait, départ et transfert
 * de propriété écrit son entrée `admin.audit_log` dans la transaction de l'action — acteur, projet (cible), membre visé,
 * rôle et export avant → après ; jamais d'adresse.
 *
 * Affectations (écarts E5 et E10, `lib/affectations.ts`) : Approbateur et Diffuseur sont deux affectations distinctes
 * qu'une même personne peut tenir ensemble (CR-D2 a) ; elles ouvrent l'approbation et la diffusion Studio, rien d'autre.
 * Gardien du contenu : responsabilité déclarée, sans droit. Chaque changement est journalisé
 * (`project.member.assignment_changed`). Fin de participation (E6, CR-D7 a) : le retrait et le départ libèrent la
 * réservation d'édition et les verrous fins du membre dans la même transaction ; les observations et tâches qu'il portait
 * restent à lui, listées au propriétaire (`aReattribuer`) pour une réattribution explicite dans Studio.
 */
import { Router, type Request } from "express";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { invitations, projectMembers, projects, users } from "../db/schema.js";
import type { Tx } from "../lib/step-rows.js";
import { audit, clientIp } from "../lib/audit.js";
import { formatDate, mailLocale, PUBLIC_PATHS, publicLink, sendAccountMail } from "../lib/account.js";
import { createOrRenewInvitation, invitationView } from "../lib/invitations.js";
import { requireAuth } from "../middleware/require-auth.js";
import { projectOr404, type ProjectRole } from "../lib/owned-project.js";
import { affectationsDuProjet, aReattribuer, AUCUNE_AFFECTATION, changerAffectation, libererReservations, type AffectationMembre, type AffectationsDuMembre } from "../lib/affectations.js";
import { lockProject } from "../lib/step-rows.js";

export const membersRouter = Router({ mergeParams: true });
membersRouter.use(requireAuth);

export interface MemberView {
  userId: string;
  email: string;
  role: "lecteur" | "editeur";
  /** Le membre peut exporter : toujours pour un éditeur ; pour un lecteur, si le propriétaire l'a accordé (E2). */
  canExport: boolean;
  /** Affectations explicites (E5) et responsabilité déclarée de gardien du contenu (E10). */
  affectations: AffectationsDuMembre;
  invitedBy: string;
  createdAt: string;
}

type MemberRole = MemberView["role"];

/** Export effectif d'un membre : un éditeur exporte toujours ; NULL (archive antérieure à la colonne) = TRUE. */
export const memberExports = (role: MemberRole, canExport: boolean | null): boolean => role === "editeur" || (canExport ?? true);

export const ROLE_LABEL: Record<ProjectRole, string> = {
  proprietaire: "propriétaire",
  editeur: "éditeur",
  lecteur: "lecteur",
  support: "accès support (lecture seule)",
};

const roleSchema = z.enum(["lecteur", "editeur"]);
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email("Adresse invalide").max(254), role: roleSchema });
const memberBody = z.object({
  role: roleSchema.optional(), canExport: z.boolean().optional(),
  approbateur: z.boolean().optional(), diffuseur: z.boolean().optional(), gardien: z.boolean().optional(),
}).strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "role, canExport, approbateur, diffuseur ou gardien attendu" });
const AFFECTATION_KEYS = ["approbateur", "diffuseur", "gardien"] as const satisfies readonly AffectationMembre[];

/** Les membres d'un projet (hors propriétaire), avec leur adresse, par date d'invitation. */
export async function listMembers(projectId: string): Promise<MemberView[]> {
  const rows = await db
    .select({ userId: projectMembers.userId, email: users.email, role: projectMembers.role, canExport: projectMembers.canExport, invitedBy: projectMembers.invitedBy, createdAt: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt), asc(users.email));
  const affectations = await affectationsDuProjet(db, projectId);
  return rows.map((r) => ({
    userId: r.userId, email: r.email, role: r.role, canExport: memberExports(r.role, r.canExport), affectations: affectations.get(r.userId) ?? AUCUNE_AFFECTATION,
    invitedBy: r.invitedBy, createdAt: r.createdAt.toISOString(),
  }));
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
    ...(project.role === "proprietaire" ? { invitations: await pendingInvitations(project.id), aReattribuer: await aReattribuer(db, project.id) } : {}),
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
  const row = await db.transaction(async (tx) => {
    const [before] = await lockedMember(tx, project.id, account.id);
    if (!before) {
      const [created] = await tx.insert(projectMembers).values({ projectId: project.id, userId: account.id, role: parsed.data.role, invitedBy: req.user!.email, canExport: false }).returning();
      await audit(tx, { actorId: req.user!.id, action: "project.member.added", target: { type: "project", id: project.id }, metadata: { memberId: account.id, role: created!.role, canExport: memberExports(created!.role, created!.canExport), via: "compte-existant" }, ip: clientIp(req) });
      return created!;
    }
    return changeMember(tx, req, project.id, before, { role: parsed.data.role });
  });
  res.status(201).json({
    userId: account.id, email: account.email, role: row.role, canExport: memberExports(row.role, row.canExport),
    affectations: (await affectationsDuProjet(db, project.id)).get(account.id) ?? AUCUNE_AFFECTATION, invitedBy: row.invitedBy, createdAt: row.createdAt.toISOString(),
  } satisfies MemberView);
});

type MemberRow = typeof projectMembers.$inferSelect;

class MissingParticipation extends Error {}

/** Ligne du membre verrouillée (FOR UPDATE) : deux changements concurrents ne journalisent pas le même « avant ». */
function lockedMember(tx: Tx, projectId: string, userId: string) {
  return tx.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1).for("update");
}

/**
 * Changement de rôle et / ou d'export d'un membre existant, journalisé dans la même transaction (une entrée par nature
 * de changement ; aucune quand rien ne change). Un éditeur rétrogradé lecteur n'exporte plus tant que le propriétaire ne
 * le lui accorde pas.
 */
async function changeMember(tx: Tx, req: Request, projectId: string, before: MemberRow, next: { role?: MemberRole | undefined; canExport?: boolean | undefined }): Promise<MemberRow> {
  const role = next.role ?? before.role;
  const exportsBefore = memberExports(before.role, before.canExport);
  const canExport = next.canExport ?? (before.role === "editeur" && role === "lecteur" ? false : exportsBefore);
  const [row] = await tx.update(projectMembers).set({ role, canExport })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, before.userId))).returning();
  const exportsAfter = memberExports(row!.role, row!.canExport);
  const target = { type: "project" as const, id: projectId };
  if (role !== before.role) {
    await audit(tx, { actorId: req.user!.id, action: "project.member.role_changed", target, metadata: { memberId: before.userId, roleBefore: before.role, roleAfter: role, canExportBefore: exportsBefore, canExportAfter: exportsAfter }, ip: clientIp(req) });
  } else if (exportsAfter !== exportsBefore) {
    await audit(tx, { actorId: req.user!.id, action: "project.member.export_changed", target, metadata: { memberId: before.userId, role, canExportBefore: exportsBefore, canExportAfter: exportsAfter }, ip: clientIp(req) });
  }
  return row!;
}

membersRouter.patch("/:userId", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const parsed = memberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const userId = req.params["userId"] as string;
  const outcome = await db.transaction(async (tx) => {
    const [before] = await lockedMember(tx, project.id, userId);
    if (!before) return { status: 404 as const };
    if (parsed.data.canExport !== undefined && (parsed.data.role ?? before.role) === "editeur") return { status: 422 as const };
    const { approbateur: _a, diffuseur: _d, gardien: _g, ...access } = parsed.data;
    const row = access.role !== undefined || access.canExport !== undefined ? await changeMember(tx, req, project.id, before, access) : before;
    for (const key of AFFECTATION_KEYS) {
      const valeur = parsed.data[key];
      if (valeur === undefined) continue;
      const change = await changerAffectation(tx, project.id, userId, key, valeur, req.user!.id);
      // Participation active absente (miroir rompu) : refus, la transaction est annulée.
      if (!change) throw new MissingParticipation();
      if (change.avant !== change.apres) {
        await audit(tx, { actorId: req.user!.id, action: "project.member.assignment_changed", target: { type: "project", id: project.id }, metadata: { memberId: userId, assignment: key, before: change.avant, after: change.apres }, ip: clientIp(req) });
      }
    }
    return { status: 200 as const, row };
  }).catch((e: unknown) => {
    if (e instanceof MissingParticipation) return { status: 409 as const };
    throw e;
  });
  if (outcome.status === 409) {
    res.status(409).json({ error: "participation_missing", message: "Ce membre n'a pas de participation active au projet : rechargez la liste des membres." });
    return;
  }
  if (outcome.status === 404) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (outcome.status === 422) {
    res.status(422).json({ error: "sharing_rule", message: "Un éditeur exporte toujours : le droit d'export ne s'accorde ou ne se retire qu'à un lecteur." });
    return;
  }
  const row = outcome.row;
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  res.json({
    userId, email: account?.email ?? "", role: row.role, canExport: memberExports(row.role, row.canExport),
    affectations: (await affectationsDuProjet(db, project.id)).get(userId) ?? AUCUNE_AFFECTATION, invitedBy: row.invitedBy, createdAt: row.createdAt.toISOString(),
  } satisfies MemberView);
});

membersRouter.delete("/:userId", async (req, res) => {
  const userId = req.params["userId"] as string;
  // Un membre peut quitter le projet lui-même ; retirer quelqu'un d'autre est réservé au propriétaire.
  const project = await projectOr404(req, res, userId === req.user!.id ? "read" : "owner");
  if (!project) return;
  const deleted = await db.transaction(async (tx) => {
    // Ordre des verrous des écritures Studio (`lockedAccess` : projet, puis ligne du membre) : le projet d'abord, sinon
    // la libération de la réservation (UPDATE projects) pourrait s'interbloquer avec une écriture concurrente du membre.
    await lockProject(tx, project.id);
    const rows = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId, role: projectMembers.role, canExport: projectMembers.canExport });
    const [gone] = rows;
    if (gone) {
      // Fin de participation (E6) : réservation d'édition et verrous fins libérés dans la même transaction.
      const released = await libererReservations(tx, project.id, userId, req.user!.id);
      await audit(tx, {
        actorId: req.user!.id, action: userId === req.user!.id ? "project.member.left" : "project.member.removed", target: { type: "project", id: project.id },
        metadata: { memberId: userId, roleBefore: gone.role, canExportBefore: memberExports(gone.role, gone.canExport), releasedEditingLock: released.reservationEdition, releasedFineLocks: released.verrous }, ip: clientIp(req),
      });
    }
    return rows;
  });
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
      .select({ userId: projectMembers.userId, email: users.email, role: projectMembers.role })
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
    await audit(tx, {
      actorId: req.user!.id, action: "project.ownership.transferred", target: { type: "project", id: project.id },
      metadata: { memberId: userId, fromOwnerId: project.ownerId, toOwnerId: userId, roleBefore: member.role, roleAfter: "proprietaire", previousOwnerRoleAfter: "editeur" }, ip: clientIp(req),
    });
    return member;
  });
  if (!result) {
    res.status(404).json({ error: "not_found", message: "La propriété ne peut être transférée qu'à un membre du projet : invitez d'abord ce compte." });
    return;
  }
  res.json({ owner: { userId: result.userId, email: result.email }, you: { userId: req.user!.id, role: "editeur" as ProjectRole }, members: await listMembers(project.id) });
});
