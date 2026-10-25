/**
 * Invitations de projet liées à une participation — lectures et écritures sur base (Issue #262, phase 3, OP-D2 a).
 * Règles pures : `project-invitations.ts` et `security/invitation-rules.ts` (`participationRefusal`).
 *
 * Contrats publics utiles aux autres phases :
 *   - `resolveInvitationTarget(q, projectId, email, participationId?)` : la participation que vise une invitation (membre
 *     actuel, contact existant de l'annuaire, ou fiche à créer) et le motif bloquant éventuel ;
 *   - `createProjectInvitation(tx, input)` : envoi (ou renvoi, sans doublon) — fiche et participation `contact` créées si
 *     besoin, rôles proposés et échéances enregistrés, AUCUN droit accordé ;
 *   - `previewProjectInvitation(q, input)` : l'accès résultant, sans rien écrire ;
 *   - `projectParticipationRefusal(tx, inv, userId)` : revalidation propre à l'acceptation (mauvaise fiche, participation
 *     suspendue ou terminée, accès déjà expiré, rôles) ;
 *   - `activateProjectParticipation(tx, inv, userId, ip)` : liaison du compte vérifié à la fiche, participation `active`,
 *     rôles proposés, échéance d'accès — idempotente ;
 *   - `pendingProjectInvitationsFor(email)` : invitations en attente du compte (notification dans l'application) ;
 *   - `acceptInvitationById(user, id, ip)` / `declineInvitationById(user, id, ip)` : acceptation depuis la notification.
 *
 * Représentant mandaté (reliquat de la phase 5) : une invitation peut partir d'un mandat (`mandateId`, routes
 * `/members/mandates/:mandateId`) ; l'acceptation exige que le mandat soit encore actif (`mandate_ended`) et la
 * participation activée porte alors la partie représentée (l'organisation du mandat).
 *
 * Pont : l'accès de base (Lecteur / Concepteur) passe toujours par la ligne `project_members` que le miroir
 * `op_sync_access` traduit en participation active et rôle `acces` (voir phase-3.md, « Pont conservé ») ; les autres rôles
 * proposés sont posés avec l'origine `attribution`, l'échéance d'accès sur la participation.
 */
import { and, asc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  invitations, organizationMandates, organizations, people, projectMembers, projectParticipations, projectRoleAssignments, projects, studioObservations, studioObservationTasks,
  studioStudies, studioVariants, users, type ProposedRole,
} from "../db/schema.js";
import { audit } from "./audit.js";
import { newId } from "./ids.js";
import { randomToken, sha256Hex } from "./security/tokens.js";
import { invitationRefusal, INVITATION_REFUSAL_MESSAGE, participationRefusal, type InvitationRefusal, type ParticipationRefusal } from "./security/invitation-rules.js";
import { normalizeEmail } from "./participants.js";
import {
  memberChangeProblem, narrowScopes, previewWarnings, projectRoleFor, proposedRolesFrom, proposedRolesValid, resultingAccess, rolesToAttribute, targetRefusal,
  type InvitationPreview, type InvitationTarget,
} from "./project-invitations.js";
import type { Tx } from "./step-rows.js";
import { porteeInconnue } from "./portees-db.js";
import { mandateStillValidFor, representedOrganizationOfMandate } from "./mandate-invitations-db.js";
import type { TypePortee } from "@parcours/domain-model";

type Querier = Pick<typeof db, "select">;
type InvitationRow = typeof invitations.$inferSelect;

export interface ResolvedTarget {
  target: InvitationTarget;
  account: { id: string; status: string } | null;
  /** Motif bloquant (409) ; null si l'invitation peut partir. */
  blocking: string | null;
  /** 404 : la participation choisie n'est pas du projet. */
  notFound?: boolean;
}

/** Compte de cette adresse (comparaison sans casse). */
export async function accountByEmail(q: Querier, email: string): Promise<{ id: string; status: string } | null> {
  const [a] = await q.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${normalizeEmail(email)}`).limit(1);
  return a ?? null;
}

/**
 * Participation visée par une invitation de cette adresse dans ce projet, sans rien écrire. Ordre : la fiche choisie
 * dans l'annuaire ; sinon la participation en cours du compte de cette adresse ; sinon un contact du projet portant
 * cette adresse professionnelle (aucun doublon dans l'annuaire) ; sinon une fiche à créer à l'envoi.
 */
export async function resolveInvitationTarget(q: Querier, projectId: string, email: string, participationId?: string | null): Promise<ResolvedTarget> {
  const account = await accountByEmail(q, email);
  const accountId = account && account.status !== "closed" ? account.id : null;
  if (accountId) {
    const [member] = await q.select({ userId: projectMembers.userId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, accountId))).limit(1);
    if (member) {
      const [p] = await q.select({ id: projectParticipations.id }).from(projectParticipations).innerJoin(people, eq(people.id, projectParticipations.personId))
        .where(and(eq(projectParticipations.projectId, projectId), eq(people.userId, accountId), ne(projectParticipations.status, "terminee"))).limit(1);
      return { target: { kind: "membre", participationId: p?.id ?? null }, account, blocking: null };
    }
  }
  if (participationId) {
    const [row] = await q.select({ id: projectParticipations.id, status: projectParticipations.status, personId: projectParticipations.personId, userId: people.userId })
      .from(projectParticipations).leftJoin(people, eq(people.id, projectParticipations.personId))
      .where(and(eq(projectParticipations.id, participationId), eq(projectParticipations.projectId, projectId))).limit(1);
    if (!row) return { target: { kind: "nouvelle-fiche" }, account, blocking: "Participation introuvable dans ce projet.", notFound: true };
    const refusal = targetRefusal({ status: row.status, personUserId: row.userId ?? null, accountId, isOrganization: !row.personId });
    if (refusal) return { target: { kind: "nouvelle-fiche" }, account, blocking: refusal };
    return { target: { kind: "participation", participationId: row.id, status: row.status === "active" ? "active" : "contact" }, account, blocking: null };
  }
  if (accountId) {
    const [p] = await q.select({ id: projectParticipations.id, status: projectParticipations.status }).from(projectParticipations)
      .innerJoin(people, eq(people.id, projectParticipations.personId))
      .where(and(eq(projectParticipations.projectId, projectId), eq(people.userId, accountId), ne(projectParticipations.status, "terminee"))).limit(1);
    if (p) {
      const refusal = targetRefusal({ status: p.status, personUserId: accountId, accountId, isOrganization: false });
      if (refusal) return { target: { kind: "nouvelle-fiche" }, account, blocking: refusal };
      // Contact, ou participation active sans ligne de partage (revue externe de la phase 4 : aucun rôle de projet, donc
      // aucun accès) : l'invitation vise cette participation ; seule son acceptation donnera un rôle de projet.
      return { target: { kind: "participation", participationId: p.id, status: p.status === "active" ? "active" : "contact" }, account, blocking: null };
    }
  }
  const [contact] = await q.select({ id: projectParticipations.id }).from(projectParticipations).innerJoin(people, eq(people.id, projectParticipations.personId))
    .where(and(eq(projectParticipations.projectId, projectId), eq(projectParticipations.status, "contact"), isNull(people.userId), isNull(people.erasedAt),
      sql`lower(${people.workEmail}) = ${normalizeEmail(email)}`))
    .orderBy(asc(projectParticipations.createdAt)).limit(1);
  if (contact) return { target: { kind: "participation", participationId: contact.id, status: "contact" }, account, blocking: null };
  return { target: { kind: "nouvelle-fiche" }, account, blocking: null };
}

/**
 * Portées étroites proposées : l'élément désigné (étude, variante, révision, documents) doit exister dans CE projet
 * (même contrôle que l'attribution directe, `porteeInconnue`). Motif du premier refus, ou null.
 */
export async function proposedScopesProblem(q: Querier, projectId: string, roles: readonly ProposedRole[]): Promise<string | null> {
  for (const r of roles) {
    if (r.scopeType === "projet") continue;
    const problem = await porteeInconnue(q as never, projectId, r.scopeType as TypePortee, r.scopeId);
    if (problem) return `${r.scopeType} ${r.scopeId ?? ""} : ${problem}`;
  }
  return null;
}

/** Invitation de projet en attente (non échue) pour cette adresse. */
async function pendingFor(q: Querier, projectId: string, email: string) {
  const [row] = await q.select({ id: invitations.id, expiresAt: invitations.expiresAt }).from(invitations)
    .where(and(eq(invitations.projectId, projectId), eq(invitations.purpose, "project_participation"), eq(invitations.status, "pending"),
      gt(invitations.expiresAt, new Date()), sql`lower(${invitations.email}) = ${normalizeEmail(email)}`)).limit(1);
  return row ?? null;
}

export interface InvitationDraft {
  projectId: string;
  email: string;
  roles: ProposedRole[];
  invitationExpiresAt: Date;
  accessExpiresAt: Date | null;
  participationId?: string | null | undefined;
  /** Invitation d'un représentant mandaté (reliquat de la phase 5) : le mandat d'où elle part. */
  mandateId?: string | null | undefined;
}

/** Aperçu de l'accès résultant, avant envoi : rien n'est écrit. */
export async function previewProjectInvitation(q: Querier, d: InvitationDraft, now = new Date()): Promise<InvitationPreview> {
  const resolved = await resolveInvitationTarget(q, d.projectId, d.email, d.participationId);
  const pending = resolved.target.kind === "membre" ? null : await pendingFor(q, d.projectId, d.email);
  const baseRole = projectRoleFor(d.roles);
  return {
    email: normalizeEmail(d.email), accountExists: !!resolved.account && resolved.account.status !== "closed", target: resolved.target,
    pendingInvitation: pending ? { id: pending.id, expiresAt: pending.expiresAt.toISOString() } : null,
    roles: d.roles, baseRole, access: resultingAccess(d.roles, { now }), narrowScopes: narrowScopes(d.roles),
    invitationExpiresAt: d.invitationExpiresAt.toISOString(), accessExpiresAt: d.accessExpiresAt?.toISOString() ?? null,
    warnings: previewWarnings({ roles: d.roles, invitationExpiresAt: d.invitationExpiresAt, accessExpiresAt: d.accessExpiresAt, target: resolved.target }),
    blocking: resolved.blocking
      ?? (resolved.target.kind === "membre" ? memberChangeProblem(d.roles, d.accessExpiresAt) : null)
      ?? await proposedScopesProblem(q, d.projectId, d.roles),
  };
}

export interface CreatedProjectInvitation { invitation: InvitationRow; token: string; resent: boolean; participationId: string }

/**
 * Envoi d'une invitation de projet : la participation visée est trouvée ou créée (`contact`, aucun droit), puis
 * l'invitation en attente pour la même adresse et le même projet est renouvelée (nouveau jeton, nouvelles échéances,
 * rôles et fiche mis à jour) ou créée. L'appelant a vérifié l'autorité (propriétaire) et l'absence de motif bloquant.
 */
export async function createProjectInvitation(tx: Tx, d: InvitationDraft & { invitedBy: string; displayName?: string | null | undefined; ip?: string | null }): Promise<CreatedProjectInvitation> {
  const email = normalizeEmail(d.email);
  const resolved = await resolveInvitationTarget(tx, d.projectId, email, d.participationId);
  let participationId: string;
  if (resolved.target.kind === "participation" || (resolved.target.kind === "membre" && resolved.target.participationId)) {
    participationId = (resolved.target as { participationId: string }).participationId;
  } else {
    participationId = await createContactParticipation(tx, { projectId: d.projectId, email, account: resolved.account, displayName: d.displayName ?? null, by: d.invitedBy, ip: d.ip ?? null });
  }
  const token = randomToken();
  const baseRole = projectRoleFor(d.roles);
  // Les invitations échues sont marquées « expirées » avant de chercher celle à renouveler (règle de renvoi UM-3).
  await tx.update(invitations).set({ status: "expired" })
    .where(and(eq(invitations.status, "pending"), sql`${invitations.expiresAt} <= now()`, sql`lower(${invitations.email}) = ${email}`));
  const [existing] = await tx.select().from(invitations).where(and(
    sql`lower(${invitations.email}) = ${email}`, eq(invitations.purpose, "project_participation"), eq(invitations.status, "pending"), eq(invitations.projectId, d.projectId),
  )).limit(1).for("update");
  const values = {
    tokenHash: sha256Hex(token), expiresAt: d.invitationExpiresAt, accessExpiresAt: d.accessExpiresAt, projectRole: baseRole, invitedBy: d.invitedBy,
    participationId, proposedRoles: d.roles, mandateId: d.mandateId ?? null,
  };
  const represented = d.mandateId ? await representedOrganizationOfMandate(tx, d.mandateId) : null;
  const meta = {
    purpose: "project_participation", projectId: d.projectId, participationId, role: baseRole, roles: d.roles.map(roleLabel), accessExpiresAt: d.accessExpiresAt?.toISOString() ?? null, invitationExpiresAt: d.invitationExpiresAt.toISOString(),
    ...(d.mandateId ? { mandateId: d.mandateId, representedOrganizationId: represented?.id ?? null, via: "mandat" } : {}),
  };
  if (existing) {
    const [row] = await tx.update(invitations).set(values).where(eq(invitations.id, existing.id)).returning();
    await audit(tx, { actorId: d.invitedBy, action: "invitation.resent", target: { type: "invitation", id: existing.id }, metadata: meta, ip: d.ip ?? null });
    return { invitation: row!, token, resent: true, participationId };
  }
  const [row] = await tx.insert(invitations).values({ id: newId("inv"), purpose: "project_participation", email, projectId: d.projectId, ...values }).returning();
  await audit(tx, { actorId: d.invitedBy, action: "invitation.created", target: { type: "invitation", id: row!.id }, metadata: meta, ip: d.ip ?? null });
  return { invitation: row!, token, resent: false, participationId };
}

const roleLabel = (r: ProposedRole) => (r.scopeType === "projet" ? r.role : `${r.role}/${r.scopeType}:${r.scopeId}`);

/**
 * Fiche à créer à l'envoi : pour un compte existant, sa propre personne (créée au besoin, comme le fait le miroir) ;
 * pour une adresse sans compte, un contact sans compte (nom saisi, sinon l'adresse) dont l'e-mail professionnel est
 * l'adresse invitée. La participation naît `contact` : aucun droit tant que l'invitation n'est pas acceptée.
 */
async function createContactParticipation(tx: Tx, i: { projectId: string; email: string; account: { id: string; status: string } | null; displayName: string | null; by: string; ip: string | null }): Promise<string> {
  let personId: string;
  let created = false;
  if (i.account && i.account.status !== "closed") {
    await tx.insert(people).values({ id: newId("per"), userId: i.account.id }).onConflictDoNothing();
    const [p] = await tx.select({ id: people.id }).from(people).where(eq(people.userId, i.account.id)).limit(1);
    personId = p!.id;
  } else {
    personId = newId("per");
    await tx.insert(people).values({ id: personId, displayName: (i.displayName ?? "").trim() || i.email, workEmail: i.email, createdBy: i.by });
    created = true;
  }
  const id = newId("ppa");
  await tx.insert(projectParticipations).values({ id, projectId: i.projectId, personId, status: "contact", createdBy: i.by });
  const target = { type: "project" as const, id: i.projectId };
  if (created) await audit(tx, { actorId: i.by, action: "person.contact_created", target, metadata: { personId, participationId: id, via: "invitation" }, ip: i.ip });
  await audit(tx, { actorId: i.by, action: "participation.created", target, metadata: { participationId: id, personId, status: "contact", via: "invitation" }, ip: i.ip });
  return id;
}

/** Participation en cours (non terminée) du compte dans le projet, sous verrou. */
async function currentParticipationOf(tx: Tx | typeof db, projectId: string, userId: string) {
  const [row] = await tx.select({ id: projectParticipations.id, status: projectParticipations.status, personId: projectParticipations.personId })
    .from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"),
      sql`${projectParticipations.personId} IN (SELECT id FROM people WHERE user_id = ${userId})`))
    .limit(1).for("update");
  return row ?? null;
}

/** Rôles proposés d'une invitation ; une invitation antérieure à la phase 3 propose son seul rôle de partage. */
export function rolesOf(inv: Pick<InvitationRow, "proposedRoles" | "projectRole">): ProposedRole[] {
  if (inv.proposedRoles?.length) return inv.proposedRoles;
  return proposedRolesFrom({ legacyRole: inv.projectRole ?? "lecteur" }).roles;
}

/**
 * Revalidation propre à l'acceptation d'une invitation de projet (après les refus communs d'`invitationRefusal`) :
 * fiche liée à un autre compte, participation suspendue ou terminée depuis l'envoi (la sienne, ou celle du compte qui
 * accepte et qu'elle rejoindrait), échéance d'accès passée, rôles devenus invalides. `userId` null : compte créé par
 * l'acceptation.
 */
export async function projectParticipationRefusal(tx: Tx | typeof db, inv: InvitationRow, userId: string | null, opts: { identityKnown?: boolean; now?: Date } = {}): Promise<ParticipationRefusal | null> {
  const now = opts.now ?? new Date();
  if (inv.purpose !== "project_participation" || !inv.projectId) return null;
  let personUserId: string | null = null;
  let status: "contact" | "active" | "suspendue" | "terminee" | null = null;
  if (inv.participationId) {
    const [t] = await tx.select({ status: projectParticipations.status, userId: people.userId }).from(projectParticipations)
      .leftJoin(people, eq(people.id, projectParticipations.personId)).where(eq(projectParticipations.id, inv.participationId)).limit(1);
    if (t) { personUserId = t.userId ?? null; status = t.status; }
  }
  if (userId && status !== "terminee" && status !== "suspendue") {
    const own = await currentParticipationOf(tx, inv.projectId, userId);
    if (own?.status === "suspendue") status = "suspendue";
  }
  // Lecture du lien sans session (`identityKnown: false`) : qui acceptera n'est pas encore connu.
  if (opts.identityKnown === false) personUserId = null;
  // Revalidation de la portée : un élément désigné supprimé depuis l'envoi rend les rôles proposés inattribuables.
  const rolesValid = proposedRolesValid(rolesOf(inv)) && !(await proposedScopesProblem(tx, inv.projectId, rolesOf(inv)));
  // Représentant mandaté : le mandat doit être encore actif et son organisation partie au projet (reliquat de la phase 5).
  const mandateActive = inv.mandateId ? await mandateStillValidFor(tx, inv.mandateId, inv.projectId) : null;
  return participationRefusal({ personUserId, acceptingUserId: userId, participationStatus: status, accessExpiresAt: inv.accessExpiresAt ?? null, rolesValid, mandateActive, now });
}

/**
 * Activation d'une invitation de projet acceptée (déjà revalidée) : idempotente — rejouée, elle ne crée ni personne,
 * ni participation, ni rôle en double (index uniques, `ON CONFLICT DO NOTHING`).
 *  1. la fiche visée est liée au compte vérifié : contact sans compte lié au compte (s'il n'a pas encore de personne),
 *     sinon la participation rejoint la personne du compte (ou, s'il en a déjà une dans le projet, cette dernière est
 *     gardée et la fiche de l'invitation est close comme remplacée) ;
 *  2. l'accès de base passe par le pont (`project_members`, rôle le plus large conservé), que le miroir traduit en
 *     participation `active` et rôle `acces` ;
 *  3. les autres rôles proposés sont posés (origine `attribution`, attribués par l'invitant), l'échéance d'accès est
 *     recopiée sur une participation qui vient de devenir active.
 */
export async function activateProjectParticipation(tx: Tx, inv: InvitationRow, userId: string, ip: string | null): Promise<{ participationId: string | null }> {
  if (!inv.projectId) return { participationId: null };
  const [project] = await tx.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, inv.projectId)).limit(1);
  if (!project || project.ownerId === userId) return { participationId: null };
  const target = { type: "project" as const, id: inv.projectId };
  const roles = rolesOf(inv);
  const baseRole = inv.projectRole ?? projectRoleFor(roles);
  if (inv.participationId) {
    const [t] = await tx.select({ id: projectParticipations.id, personId: projectParticipations.personId, status: projectParticipations.status, startsOn: projectParticipations.startsOn, userId: people.userId })
      .from(projectParticipations).leftJoin(people, eq(people.id, projectParticipations.personId))
      .where(eq(projectParticipations.id, inv.participationId)).limit(1).for("update", { of: projectParticipations });
    if (t && t.personId && !t.userId) {
      const [own] = await tx.select({ id: people.id }).from(people).where(eq(people.userId, userId)).limit(1);
      if (!own) {
        await tx.update(people).set({ userId, updatedAt: new Date() }).where(and(eq(people.id, t.personId), isNull(people.userId)));
        await audit(tx, { actorId: userId, action: "participation.linked", target, metadata: { participationId: t.id, personId: t.personId, memberId: userId, link: "fiche" }, ip });
      } else {
        const current = await currentParticipationOf(tx, inv.projectId, userId);
        if (!current) {
          await tx.update(projectParticipations).set({ personId: own.id, updatedAt: new Date() }).where(eq(projectParticipations.id, t.id));
          await audit(tx, { actorId: userId, action: "participation.linked", target, metadata: { participationId: t.id, personId: own.id, contactPersonId: t.personId, memberId: userId, link: "participation" }, ip });
        } else if (current.id !== t.id && t.status === "contact") {
          await tx.update(projectParticipations).set({ status: "terminee", endsOn: sql`greatest(current_date, coalesce(${projectParticipations.startsOn}, current_date))`, updatedAt: new Date() })
            .where(eq(projectParticipations.id, t.id));
          await audit(tx, { actorId: userId, action: "participation.status_changed", target, metadata: { participationId: t.id, memberId: userId, statusBefore: "contact", statusAfter: "terminee", reason: "remplacee", replacedBy: current.id }, ip });
        }
      }
    }
  }
  // « Déjà membre » = une ligne de partage existait (accès de projet) ; une participation active SANS rôle de projet (revue
  // externe, phase 4) n'ouvrait rien : l'acceptation est alors une arrivée (échéance recopiée, ajout journalisé).
  const [memberBefore] = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, inv.projectId), eq(projectMembers.userId, userId))).limit(1);
  const wasActive = !!memberBefore;
  const [inviter] = inv.invitedBy ? await tx.select({ email: users.email }).from(users).where(eq(users.id, inv.invitedBy)).limit(1) : [];
  await tx.insert(projectMembers).values({ projectId: inv.projectId, userId, role: baseRole, invitedBy: inviter?.email ?? "", canExport: false })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role: sql`CASE WHEN ${projectMembers.role} = 'editeur' THEN 'editeur' ELSE excluded.role END` },
    });
  const part = await currentParticipationOf(tx, inv.projectId, userId);
  if (!part) return { participationId: null };
  if (!wasActive && part.status === "active") {
    await tx.update(projectParticipations).set({ accessExpiresAt: inv.accessExpiresAt ?? null, updatedAt: new Date() }).where(eq(projectParticipations.id, part.id));
    // Même entrée qu'un ajout de membre (écart E3), désormais au moment de l'acceptation et par la voie de l'invitation.
    await audit(tx, { actorId: userId, action: "project.member.added", target, metadata: { memberId: userId, role: baseRole, canExport: baseRole === "editeur", via: "invitation" }, ip });
  }
  // Représentant mandaté (reliquat de la phase 5) : la participation porte la partie représentée — l'organisation du
  // mandat —, sans écraser une autre partie déjà enregistrée (l'envoi l'a refusé ; elle aurait pu changer depuis).
  if (inv.mandateId) {
    const represented = await representedOrganizationOfMandate(tx, inv.mandateId);
    if (represented) {
      const set = await tx.update(projectParticipations).set({ representedOrganizationId: represented.id, updatedAt: new Date() })
        .where(and(eq(projectParticipations.id, part.id), sql`${projectParticipations.representedOrganizationId} IS NULL`)).returning({ id: projectParticipations.id });
      if (set.length) await audit(tx, { actorId: userId, action: "participation.representation_recorded", target, metadata: { participationId: part.id, memberId: userId, mandateId: inv.mandateId, representedOrganizationId: represented.id, via: "invitation" }, ip });
    }
  }
  for (const r of rolesToAttribute(roles, baseRole)) {
    const id = newId("pra");
    const inserted = await tx.insert(projectRoleAssignments).values({ id, participationId: part.id, role: r.role, scopeType: r.scopeType, scopeId: r.scopeId, origin: "attribution", grantedBy: inv.invitedBy })
      .onConflictDoNothing().returning({ id: projectRoleAssignments.id });
    if (inserted.length) await audit(tx, { actorId: userId, action: "participation.role_assigned", target, metadata: { participationId: part.id, memberId: userId, roleId: id, role: r.role, scopeType: r.scopeType, scopeId: r.scopeId, via: "invitation" }, ip });
  }
  await audit(tx, {
    actorId: userId, action: "participation.activated", target,
    metadata: { participationId: part.id, memberId: userId, role: baseRole, roles: roles.map(roleLabel), wasActive, statusAfter: part.status, accessExpiresAt: wasActive ? null : inv.accessExpiresAt?.toISOString() ?? null, via: "invitation" },
    ip,
  });
  return { participationId: part.id };
}

/** Travail en attente du compte dans le projet (entrée dans le bon espace après acceptation). */
export async function pendingWorkFor(q: Querier, projectId: string, userId: string): Promise<{ openObservations: number; openTasks: number }> {
  const [o] = await q.select({ n: sql<number>`count(*)::int` }).from(studioObservations)
    .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId)).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
    .where(and(eq(studioStudies.projectId, projectId), eq(studioObservations.responsableId, userId), ne(studioObservations.statut, "cloturee")));
  const [t] = await q.select({ n: sql<number>`count(*)::int` }).from(studioObservationTasks)
    .innerJoin(studioObservations, eq(studioObservations.commentId, studioObservationTasks.observationId))
    .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId)).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
    .where(and(eq(studioStudies.projectId, projectId), eq(studioObservationTasks.assigneeId, userId), eq(studioObservationTasks.statut, "a-faire")));
  return { openObservations: o?.n ?? 0, openTasks: t?.n ?? 0 };
}

export interface ReceivedInvitation {
  id: string; projectId: string; projectCode: string; projectName: string; invitedBy: string; baseRole: "lecteur" | "editeur";
  roles: ProposedRole[]; createdAt: string; expiresAt: string; accessExpiresAt: string | null;
  /** Invitation d'un représentant mandaté : l'organisation que la participation représentera. */
  representedOrganizationName: string | null;
}

/** Invitations de projet en attente (non échues) adressées à ce compte : jamais le jeton. */
export async function pendingProjectInvitationsFor(email: string, q: Querier = db): Promise<ReceivedInvitation[]> {
  const rows = await q.select({ inv: invitations, code: projects.code, name: projects.name, inviterEmail: users.email, inviterName: users.displayName, represented: organizations.name })
    .from(invitations).innerJoin(projects, eq(projects.id, invitations.projectId)).leftJoin(users, eq(users.id, invitations.invitedBy))
    .leftJoin(organizationMandates, eq(organizationMandates.id, invitations.mandateId)).leftJoin(organizations, eq(organizations.id, organizationMandates.organizationId))
    .where(and(eq(invitations.purpose, "project_participation"), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date()),
      sql`lower(${invitations.email}) = ${normalizeEmail(email)}`))
    .orderBy(asc(invitations.createdAt));
  return rows.map((r) => ({
    id: r.inv.id, projectId: r.inv.projectId!, projectCode: r.code, projectName: r.name, invitedBy: r.inviterName || r.inviterEmail || "",
    baseRole: r.inv.projectRole ?? "lecteur", roles: rolesOf(r.inv), createdAt: r.inv.createdAt.toISOString(), expiresAt: r.inv.expiresAt.toISOString(),
    accessExpiresAt: r.inv.accessExpiresAt?.toISOString() ?? null, representedOrganizationName: r.represented ?? null,
  }));
}

export type AcceptOutcome =
  | { ok: true; projectId: string; participationId: string | null; pendingWork: { openObservations: number; openTasks: number }; replay: boolean }
  | { ok: false; refusal: InvitationRefusal; status: number; message: string };

interface SessionUser { id: string; email: string; status: string; emailVerified?: boolean | undefined }

/**
 * Acceptation d'une invitation de projet par son identifiant, par le compte connecté (depuis la notification ou la
 * liste « Invitations reçues ») : mêmes refus que le lien, plus la revalidation propre à la participation. Double
 * soumission : la même personne obtient le même résultat, sans nouvel effet ; une interruption annule la transaction.
 */
export async function acceptInvitationById(
  user: SessionUser, id: string, ip: string | null,
  deps: { activate: (tx: Tx, inv: InvitationRow) => Promise<void>; inviterStillAuthorized: (inv: InvitationRow, tx: Tx) => Promise<boolean> },
): Promise<AcceptOutcome> {
  const result = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations).where(and(eq(invitations.id, id), eq(invitations.purpose, "project_participation"))).limit(1).for("update");
    if (!inv) return { ok: false as const, refusal: "not_found" as InvitationRefusal };
    // Une invitation d'une autre adresse n'est pas révélée (404), comme un identifiant inconnu.
    if (normalizeEmail(inv.email) !== normalizeEmail(user.email)) return { ok: false as const, refusal: "not_found" as InvitationRefusal };
    if (!user.emailVerified && inv.status === "pending") return { ok: false as const, refusal: "email_unverified" as InvitationRefusal };
    const refusal =invitationRefusal(inv, { email: user.email, status: user.status }, await deps.inviterStillAuthorized(inv, tx), new Date()) ?? await projectParticipationRefusal(tx, inv, user.id);
    if (refusal) {
      if (refusal === "already_accepted" && inv.acceptedUserId === user.id) return { ok: true as const, inv, replay: true };
      await audit(tx, { actorId: user.id, action: "invitation.refused", target: { type: "invitation", id: inv.id }, metadata: { reason: refusal, projectId: inv.projectId }, ip });
      return { ok: false as const, refusal };
    }
    await deps.activate(tx, inv);
    return { ok: true as const, inv, replay: false };
  });
  if (!result.ok) return { ok: false, refusal: result.refusal, status: refusalStatus(result.refusal), message: INVITATION_REFUSAL_MESSAGE[result.refusal] };
  const projectId = result.inv.projectId!;
  const [part] = await db.select({ id: projectParticipations.id }).from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"), sql`${projectParticipations.personId} IN (SELECT id FROM people WHERE user_id = ${user.id})`)).limit(1);
  return { ok: true, projectId, participationId: part?.id ?? null, pendingWork: await pendingWorkFor(db, projectId, user.id), replay: result.replay };
}

/** Statut HTTP d'un refus d'acceptation : 404 introuvable, 403 mauvaise identité, 409 sinon. */
export function refusalStatus(r: InvitationRefusal): number {
  if (r === "not_found") return 404;
  if (r === "wrong_account" || r === "wrong_person" || r === "email_unverified") return 403;
  return 409;
}

/** Refus d'une invitation de projet par le compte visé, depuis la notification : aucun accès n'est donné. */
export async function declineInvitationById(user: SessionUser, id: string, ip: string | null): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx.update(invitations).set({ status: "declined", respondedAt: new Date() })
      .where(and(eq(invitations.id, id), eq(invitations.purpose, "project_participation"), eq(invitations.status, "pending"), sql`lower(${invitations.email}) = ${normalizeEmail(user.email)}`))
      .returning({ id: invitations.id, projectId: invitations.projectId });
    if (!rows.length) return false;
    await audit(tx, { actorId: user.id, action: "invitation.declined", target: { type: "invitation", id }, metadata: { projectId: rows[0]!.projectId }, ip });
    return true;
  });
}
