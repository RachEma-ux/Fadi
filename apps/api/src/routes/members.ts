/**
 * Module Collaboration — partage du projet. Monté sous `/projects/:projectId/members`.
 *
 *   GET    /          → { owner, you, members } : le propriétaire, votre rôle, les personnes invitées (tout lecteur)
 *   POST   /preview   { email, role | roles, participationId?, displayName?, accessExpiresAt?, invitationDays? } → aperçu de
 *                      l'accès résultant, sans rien écrire (phase 3) — propriétaire seulement
 *   POST   /          (même corps) → 202 : invitation nominative à accepter par l'identité visée, compte existant compris
 *                      (OP-D2 a, fin de l'ajout direct UM-8 ; lien à copier si le courriel n'a pas pu partir) ; 200 :
 *                      changement du rôle d'un compte déjà membre ; 409 `invitation_rule` (participation suspendue…) —
 *                      propriétaire seulement
 *   DELETE /invitations/:invitationId → 204 : annulation d'une invitation en attente — propriétaire seulement
 *   PATCH  /:userId   { role?, canExport?, accessExpiresAt? } → le rôle d'un membre, l'export accordé ou retiré à un lecteur
 *                      (E2), l'échéance de son accès (phase 3, null = sans échéance) —
 *                      propriétaire seulement
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
 * Phase 2 de l'Issue #262 (OP-D3 c) : ces écritures restent l'interface du partage, mais la DÉCISION d'accès se lit dans
 * la vue `project_effective_access` (participations actives et rôles par portée) ; le miroir par déclencheurs
 * (`op_sync_access`, init.sql) en tire la participation, le rôle `acces` (lecteur → Lecteur, editeur → Concepteur) et
 * l'export accordé. Une participation suspendue depuis « Équipe et participants » le reste quoi qu'écrive ce routeur.
 *
 * Phase 3 (OP-D2 a) : plus aucun ajout direct. Toute adresse reçoit une invitation liée à une participation (contact de
 * l'annuaire, ou fiche créée à l'envoi), avec ses rôles par portée et deux échéances indépendantes (invitation, accès) ;
 * un compte existant la voit aussi dans ses notifications. Rien n'est accordé avant l'acceptation par l'identité visée
 * (lib/project-invitations-db.ts) ; aucun compte n'est créé tant que la personne n'a pas accepté (D-1).
 *
 * Export (écart E2, tranche CR-D4) : un nouveau lecteur n'exporte pas ; le propriétaire le lui accorde ou le retire
 * (`canExport`). Un lecteur antérieur à cette règle le garde ; un éditeur rétrogradé lecteur redevient un nouveau
 * lecteur (sans export). Journal (écart E3) : chaque ajout, changement de rôle ou d'export, retrait, départ et transfert
 * de propriété écrit son entrée `admin.audit_log` dans la transaction de l'action — acteur, projet (cible), membre visé,
 * rôle et export avant → après ; jamais d'adresse.
 */
import { Router, type Request } from "express";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { invitations, people, projectMembers, projectParticipations, projects, users } from "../db/schema.js";
import type { Tx } from "../lib/step-rows.js";
import { audit, clientIp } from "../lib/audit.js";
import { formatDate, mailLocale, PUBLIC_PATHS, publicLink, sendAccountMail } from "../lib/account.js";
import { invitationView } from "../lib/invitations.js";
import { accountByEmail, createProjectInvitation, previewProjectInvitation, resolveInvitationTarget } from "../lib/project-invitations-db.js";
import { invitationExpiry, parseAccessExpiry, projectRoleFor, proposedRolesFrom } from "../lib/project-invitations.js";
import { requireAuth } from "../middleware/require-auth.js";
import { projectOr404, type ProjectRole } from "../lib/owned-project.js";
import { lockProject } from "../lib/step-rows.js";

export const membersRouter = Router({ mergeParams: true });
membersRouter.use(requireAuth);

export interface MemberView {
  userId: string;
  email: string;
  role: "lecteur" | "editeur";
  /** Le membre peut exporter : toujours pour un éditeur ; pour un lecteur, si le propriétaire l'a accordé (E2). */
  canExport: boolean;
  invitedBy: string;
  createdAt: string;
  /** Échéance d'accès (phase 3) ; `accessExpired` : passée, le membre n'a plus aucun accès. */
  accessExpiresAt?: string | null;
  accessExpired?: boolean;
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
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse invalide").max(254),
  /** Forme historique : `lecteur` → Lecteur, `editeur` → Concepteur (portée projet). */
  role: roleSchema.optional(),
  /** Rôles proposés par portée (phase 3) ; au moins un de portée projet. */
  roles: z.array(z.object({ role: z.string().max(40), scopeType: z.string().max(40).nullable().optional(), scopeId: z.string().trim().max(120).nullable().optional() })).max(24).optional(),
  /** Participation visée choisie dans l'annuaire (contact du projet) ; sinon trouvée par l'adresse ou créée. */
  participationId: z.string().max(80).nullable().optional(),
  /** Nom d'une fiche créée pour une adresse sans compte (sinon l'adresse). */
  displayName: z.string().trim().max(200).nullable().optional(),
  /** Échéance de l'accès (AAAA-MM-JJ ou date-heure ISO), indépendante de celle de l'invitation. */
  accessExpiresAt: z.string().max(40).nullable().optional(),
  /** Validité de l'invitation, en jours (1 à 30, 7 par défaut). */
  invitationDays: z.number().int().min(1).max(30).optional(),
}).refine((v) => v.role !== undefined || (v.roles?.length ?? 0) > 0, { message: "role ou roles attendu" });
const memberBody = z.object({ role: roleSchema.optional(), canExport: z.boolean().optional(), accessExpiresAt: z.string().max(40).nullable().optional() }).strict()
  .refine((v) => v.role !== undefined || v.canExport !== undefined || v.accessExpiresAt !== undefined, { message: "role, canExport ou accessExpiresAt attendu" });

/** Les membres d'un projet (hors propriétaire), avec leur adresse, par date d'invitation. */
export async function listMembers(projectId: string): Promise<MemberView[]> {
  const rows = await db
    .select({ userId: projectMembers.userId, email: users.email, role: projectMembers.role, canExport: projectMembers.canExport, invitedBy: projectMembers.invitedBy, createdAt: projectMembers.createdAt })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.createdAt), asc(users.email));
  // Échéance d'accès (phase 3) portée par la participation en cours : passée, le membre reste listé mais n'a plus d'accès.
  const expiries = rows.length ? await db.select({ userId: people.userId, accessExpiresAt: projectParticipations.accessExpiresAt })
    .from(projectParticipations).innerJoin(people, eq(people.id, projectParticipations.personId))
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"), inArray(people.userId, rows.map((r) => r.userId)))) : [];
  const now = Date.now();
  return rows.map((r) => {
    const exp = expiries.find((e) => e.userId === r.userId)?.accessExpiresAt ?? null;
    return {
      userId: r.userId, email: r.email, role: r.role, canExport: memberExports(r.role, r.canExport), invitedBy: r.invitedBy, createdAt: r.createdAt.toISOString(),
      accessExpiresAt: exp?.toISOString() ?? null, accessExpired: !!exp && exp.getTime() <= now,
    };
  });
}

export async function ownerEmailOf(ownerId: string): Promise<string> {
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ownerId)).limit(1);
  return owner?.email ?? "";
}

/** Invitations du projet en attente (propriétaire seulement) : adresse, rôle, échéance — jamais le jeton. */
async function pendingInvitations(projectId: string) {
  const rows = await db.select({ inv: invitations, accountId: users.id }).from(invitations)
    .leftJoin(users, sql`lower(${users.email}) = lower(${invitations.email}) AND ${users.status} <> 'closed'`)
    .where(and(eq(invitations.projectId, projectId), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date())))
    .orderBy(asc(invitations.createdAt));
  // État distinct (phase 3) : un compte existant doit accepter (lien ou notification) ; une adresse sans compte doit
  // d'abord créer son compte depuis le lien.
  return rows.map((r) => ({ ...invitationView(r.inv), awaiting: r.accountId ? "acceptation" as const : "creation-compte" as const }));
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

/** Saisie d'une invitation lue et contrôlée (envoi et aperçu) ; `problems` non vide = 400. */
function readInvitation(body: unknown, now = new Date()) {
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return { ok: false as const, problems: ["saisie invalide"], details: parsed.error.flatten() as unknown };
  const { roles, problems } = proposedRolesFrom({ roles: parsed.data.roles, legacyRole: parsed.data.role });
  const access = parseAccessExpiry(parsed.data.accessExpiresAt ?? null, now);
  if (access.problem) problems.push(access.problem);
  if (problems.length) return { ok: false as const, problems, details: null as unknown };
  return {
    ok: true as const, email: parsed.data.email, roles, participationId: parsed.data.participationId ?? null, displayName: parsed.data.displayName ?? null,
    invitationExpiresAt: invitationExpiry(now, parsed.data.invitationDays), accessExpiresAt: access.value,
  };
}

/**
 * Aperçu de l'accès résultant, avant envoi (phase 3) : participation visée (membre, contact existant de l'annuaire,
 * fiche à créer), invitation déjà en attente (elle sera renvoyée, sans doublon), droits que donnera l'acceptation,
 * échéances, remarques et motif bloquant. Rien n'est écrit.
 */
membersRouter.post("/preview", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const input = readInvitation(req.body);
  if (!input.ok) {
    res.status(400).json({ error: "invalid_input", message: input.problems.join(" ; "), problems: input.problems, details: input.details });
    return;
  }
  const preview = await previewProjectInvitation(db, { projectId: project.id, ...input });
  const account = preview.accountExists ? await accountByEmail(db, input.email) : null;
  const blocking = account?.id === project.ownerId ? "Le propriétaire du projet a déjà tous les droits." : preview.blocking;
  res.json({ preview: { ...preview, blocking } });
});

/**
 * Invitation (OP-D2 a, fin de l'ajout direct UM-8) : toute adresse — compte existant compris — reçoit une invitation
 * nominative (202) à accepter par l'identité visée (lien du courriel, ou notification dans l'application pour un compte
 * existant) ; rien n'est accordé avant. Seul un compte déjà membre voit son rôle changé directement (200). Sans envoi
 * possible (quota, transport absent), le lien est rendu au propriétaire pour qu'il le transmette (D-1).
 */
membersRouter.post("/", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  const input = readInvitation(req.body);
  if (!input.ok) {
    res.status(400).json({ error: "invalid_input", message: input.problems.join(" ; "), problems: input.problems, details: input.details });
    return;
  }
  const account = await accountByEmail(db, input.email);
  if (account?.status === "closed") {
    res.status(404).json({ error: "user_not_found", message: "Aucun compte actif n’a cette adresse." });
    return;
  }
  if (account && account.id === project.ownerId) {
    res.status(422).json({ error: "sharing_rule", message: "Le propriétaire du projet a déjà tous les droits." });
    return;
  }
  const resolved = await resolveInvitationTarget(db, project.id, input.email, input.participationId);
  if (resolved.notFound) {
    res.status(404).json({ error: "participation_not_found", message: resolved.blocking });
    return;
  }
  if (resolved.blocking) {
    res.status(409).json({ error: "invitation_rule", message: resolved.blocking });
    return;
  }
  if (resolved.target.kind === "membre" && account) {
    // Déjà membre : changement du rôle de partage, sans invitation (le changement de rôle d'un membre reste direct).
    const role = projectRoleFor(input.roles);
    const outcome = await db.transaction(async (tx) => {
      const [before] = await lockedMember(tx, project.id, account.id);
      return before ? changeMember(tx, req, project.id, before, { role }) : null;
    });
    if (outcome) {
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, account.id)).limit(1);
      res.status(200).json({ userId: account.id, email: u?.email ?? input.email, role: outcome.role, canExport: memberExports(outcome.role, outcome.canExport), invitedBy: outcome.invitedBy, createdAt: outcome.createdAt.toISOString() } satisfies MemberView);
      return;
    }
  }
  const locale = mailLocale(req);
  const projectName = `${project.code} — ${project.name}`;
  const result = await db.transaction(async (tx) => {
    await lockProject(tx, project.id);
    const created = await createProjectInvitation(tx, { projectId: project.id, ...input, invitedBy: req.user!.id, ip: clientIp(req) });
    const link = publicLink(PUBLIC_PATHS.invitation, created.token);
    const mail = await sendAccountMail(input.email, "invitation", {
      link, projectName, role: ROLE_LABEL[created.invitation.projectRole ?? "lecteur"], expiresAt: formatDate(created.invitation.expiresAt, locale),
    }, locale, tx);
    return { ...created, link, mail };
  });
  res.status(202).json({
    invitation: invitationView(result.invitation, { projectName }), resent: result.resent, accountExists: !!account, participationId: result.participationId,
    mail: { queued: result.mail.queued, reason: result.mail.reason, ...(result.mail.queued ? {} : { link: result.link }) },
  });
});

type MemberRow = typeof projectMembers.$inferSelect;

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
  const expiry = parsed.data.accessExpiresAt === undefined ? null : parseAccessExpiry(parsed.data.accessExpiresAt, new Date());
  if (expiry?.problem) {
    res.status(400).json({ error: "invalid_input", message: expiry.problem });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [before] = await lockedMember(tx, project.id, userId);
    if (!before) return { status: 404 as const };
    if (parsed.data.canExport !== undefined && (parsed.data.role ?? before.role) === "editeur") return { status: 422 as const };
    const row = parsed.data.role !== undefined || parsed.data.canExport !== undefined ? await changeMember(tx, req, project.id, before, parsed.data) : before;
    if (expiry) {
      // Échéance d'accès (phase 3) : prolongée, avancée ou retirée par le propriétaire sur la participation en cours.
      const changed = await tx.update(projectParticipations).set({ accessExpiresAt: expiry.value, updatedAt: new Date() })
        .where(and(eq(projectParticipations.projectId, project.id), ne(projectParticipations.status, "terminee"),
          sql`${projectParticipations.personId} IN (SELECT id FROM people WHERE user_id = ${userId})`,
          sql`${projectParticipations.accessExpiresAt} IS DISTINCT FROM ${expiry.value?.toISOString() ?? null}::timestamptz`))
        .returning({ id: projectParticipations.id });
      if (changed.length) await audit(tx, { actorId: req.user!.id, action: "participation.access_expiry_changed", target: { type: "project", id: project.id }, metadata: { participationId: changed[0]!.id, memberId: userId, accessExpiresAt: expiry.value?.toISOString() ?? null }, ip: clientIp(req) });
    }
    return { status: 200 as const, row };
  });
  if (outcome.status === 404) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (outcome.status === 422) {
    res.status(422).json({ error: "sharing_rule", message: "Un éditeur exporte toujours : le droit d'export ne s'accorde ou ne se retire qu'à un lecteur." });
    return;
  }
  const member = (await listMembers(project.id)).find((m) => m.userId === userId);
  res.json(member satisfies MemberView | undefined);
});

membersRouter.delete("/:userId", async (req, res) => {
  const userId = req.params["userId"] as string;
  // Un membre peut quitter le projet lui-même ; retirer quelqu'un d'autre est réservé au propriétaire.
  const project = await projectOr404(req, res, userId === req.user!.id ? "read" : "owner");
  if (!project) return;
  const deleted = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId, role: projectMembers.role, canExport: projectMembers.canExport });
    const [gone] = rows;
    if (gone) {
      await audit(tx, {
        actorId: req.user!.id, action: userId === req.user!.id ? "project.member.left" : "project.member.removed", target: { type: "project", id: project.id },
        metadata: { memberId: userId, roleBefore: gone.role, canExportBefore: memberExports(gone.role, gone.canExport) }, ip: clientIp(req),
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
