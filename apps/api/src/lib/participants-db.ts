/**
 * Participants et équipe — lectures et écritures sur base (Issue #262, phase 2). Les règles sont pures
 * (`participants.ts`) ; la décision d'accès vient de la seule vue `project_effective_access`.
 *
 * Contrats publics utiles aux autres phases :
 *   - `listParticipants(projectId, { responsible })` : l'annuaire (personnes avec ou sans compte, organisations), états du
 *     compte, de la participation et des invitations en attente, rôles par portée, accès effectif ;
 *   - `participationImpact…` via `impactOf(projectId, participationId, change)` ;
 *   - `eraseContactIn(tx, personId, by)` : effacement d'un contact sans compte (demande ou conservation, OP-2) ;
 *   - `runContactRetentionJob(now)` : tâche périodique (2 ans après la clôture de tous les projets du contact).
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  invitations, organizations, people, projectEffectiveAccess, projectMembers, projectParticipations, projectRoleAssignments, projects,
  studioObservations, studioObservationTasks, studioStudies, studioVariants, users,
  type ParticipationStatus, type ProjectBusinessRole, type RoleScopeType, type TeamResponsibility,
} from "../db/schema.js";
import { audit } from "./audit.js";
import type { Tx } from "./step-rows.js";
import {
  contactDetailsFor, contactRetentionDue, ERASED_CONTACT_NAME, normalizeEmail, participationImpact,
  type DerivedAccess, type Impact, type StatusChange,
} from "./participants.js";

type Querier = Pick<typeof db, "select">;

export interface RoleView { id: string; role: ProjectBusinessRole; scopeType: RoleScopeType; scopeId: string | null; origin: "acces" | "attribution"; createdAt: string }
export interface PendingInvitationView { id: string; email: string; projectRole: "lecteur" | "editeur" | null; expiresAt: string }

export interface ParticipantView {
  id: string;
  kind: "personne" | "organisation";
  status: ParticipationStatus;
  isOwner: boolean;
  isYou: boolean;
  person: null | {
    id: string;
    displayName: string | null;
    jobTitle: string | null;
    /** Coordonnées professionnelles : null pour qui n'est pas responsable du projet (OP-D9). */
    workEmail: string | null;
    workPhone: string | null;
    erased: boolean;
    account: null | { userId: string; email: string; displayName: string | null; status: "active" | "suspended" | "closed" };
  };
  organization: null | { id: string; name: string; kind: string | null; status: string };
  representedOrganization: null | { id: string; name: string };
  businessRole: string | null;
  responsibilities: TeamResponsibility[];
  startsOn: string | null;
  endsOn: string | null;
  canExport: boolean;
  roles: RoleView[];
  /** Accès effectif lu de la seule source (`project_effective_access`) ; null sans accès. */
  access: DerivedAccess | null;
  /** Invitations en attente pour l'adresse du compte ou l'e-mail du contact (responsables seulement ; sinon 0). */
  pendingInvitations: number;
  createdAt: string;
}

/** L'annuaire complet du projet, participations terminées comprises (historique), du plus ancien au plus récent. */
export async function listParticipants(projectId: string, opts: { responsible: boolean; youId: string }, q: Querier = db): Promise<{ participants: ParticipantView[]; invitations: PendingInvitationView[] }> {
  const rows = await q
    .select({ p: projectParticipations, pe: people, u: { id: users.id, email: users.email, displayName: users.displayName, status: users.status }, org: organizations, ownerId: projects.ownerId })
    .from(projectParticipations)
    .innerJoin(projects, eq(projects.id, projectParticipations.projectId))
    .leftJoin(people, eq(people.id, projectParticipations.personId))
    .leftJoin(users, eq(users.id, people.userId))
    .leftJoin(organizations, eq(organizations.id, projectParticipations.organizationId))
    .where(eq(projectParticipations.projectId, projectId))
    .orderBy(projectParticipations.createdAt, projectParticipations.id);
  const ids = rows.map((r) => r.p.id);
  const roles = ids.length ? await q.select().from(projectRoleAssignments).where(inArray(projectRoleAssignments.participationId, ids)).orderBy(projectRoleAssignments.createdAt) : [];
  const repIds = [...new Set(rows.map((r) => r.p.representedOrganizationId).filter((x): x is string => Boolean(x)))];
  const reps = repIds.length ? await q.select({ id: organizations.id, name: organizations.name }).from(organizations).where(inArray(organizations.id, repIds)) : [];
  const access = await q.select().from(projectEffectiveAccess).where(eq(projectEffectiveAccess.projectId, projectId));
  const pending = opts.responsible
    ? await q.select().from(invitations).where(and(eq(invitations.projectId, projectId), eq(invitations.status, "pending"), sql`${invitations.expiresAt} > now()`))
    : [];
  const pendingFor = (addresses: (string | null | undefined)[]) => {
    const set = new Set(addresses.filter((a): a is string => Boolean(a)).map(normalizeEmail));
    return pending.filter((i) => set.has(normalizeEmail(i.email))).length;
  };
  const participants = rows.map((r): ParticipantView => {
    const own = roles.filter((x) => x.participationId === r.p.id);
    const userId = r.pe?.userId ?? null;
    const current = r.p.status === "active" && userId ? access.find((a) => a.userId === userId) : undefined;
    const person = r.pe ? contactDetailsFor({
      id: r.pe.id, displayName: r.pe.displayName, jobTitle: r.pe.jobTitle, workEmail: r.pe.workEmail, workPhone: r.pe.workPhone, erased: r.pe.erasedAt !== null,
      account: r.u?.id ? { userId: r.u.id, email: r.u.email, displayName: r.u.displayName, status: r.u.status } : null,
    }, opts.responsible) : null;
    return {
      id: r.p.id, kind: r.pe ? "personne" : "organisation", status: r.p.status, isOwner: userId !== null && userId === r.ownerId && r.p.status !== "terminee", isYou: userId === opts.youId,
      person, organization: r.org ? { id: r.org.id, name: r.org.name, kind: r.org.kind, status: r.org.status } : null,
      representedOrganization: reps.find((o) => o.id === r.p.representedOrganizationId) ?? null,
      businessRole: r.p.businessRole, responsibilities: r.p.responsibilities, startsOn: r.p.startsOn, endsOn: r.p.endsOn, canExport: r.p.canExport,
      roles: own.map((x) => ({ id: x.id, role: x.role, scopeType: x.scopeType, scopeId: x.scopeId, origin: x.origin, createdAt: x.createdAt.toISOString() })),
      access: current ? { role: current.role, canExport: current.canExport, canApprove: current.canApprove, canPublish: current.canPublish } : null,
      pendingInvitations: opts.responsible && r.p.status !== "terminee" ? pendingFor([r.u?.email, r.pe?.workEmail]) : 0,
      createdAt: r.p.createdAt.toISOString(),
    };
  });
  return { participants, invitations: pending.map((i) => ({ id: i.id, email: i.email, projectRole: i.projectRole, expiresAt: i.expiresAt.toISOString() })) };
}

/** Participation du projet sous verrou (FOR UPDATE), avec sa personne et le propriétaire du projet. */
export async function lockedParticipation(tx: Tx, projectId: string, participationId: string) {
  const [row] = await tx
    .select({ p: projectParticipations, pe: people, ownerId: projects.ownerId, accountEmail: users.email })
    .from(projectParticipations)
    .innerJoin(projects, eq(projects.id, projectParticipations.projectId))
    .leftJoin(people, eq(people.id, projectParticipations.personId))
    .leftJoin(users, eq(users.id, people.userId))
    .where(and(eq(projectParticipations.id, participationId), eq(projectParticipations.projectId, projectId)))
    .limit(1)
    .for("update", { of: projectParticipations });
  if (!row) return null;
  const userId = row.pe?.userId ?? null;
  return { ...row, userId, isOwner: userId !== null && userId === row.ownerId };
}

/** Invitations en attente du projet pour ces adresses (compte, e-mail du contact). */
async function pendingInvitationIds(q: Querier, projectId: string, addresses: (string | null | undefined)[]): Promise<string[]> {
  const list = [...new Set(addresses.filter((a): a is string => Boolean(a)).map(normalizeEmail))];
  if (!list.length) return [];
  const rows = await q.select({ id: invitations.id }).from(invitations)
    .where(and(eq(invitations.projectId, projectId), eq(invitations.status, "pending"), sql`${invitations.expiresAt} > now()`, inArray(sql`lower(${invitations.email})`, list)));
  return rows.map((r) => r.id);
}

/** Aperçu de l'impact (concept, partie 3) : droits, invitations en attente, travaux affectés, réservation d'édition. */
export async function impactOf(q: Querier, projectId: string, participationId: string, change: StatusChange): Promise<Impact | null> {
  const [row] = await q
    .select({ p: projectParticipations, userId: people.userId, workEmail: people.workEmail, accountEmail: users.email, lock: projects.editingLock })
    .from(projectParticipations)
    .innerJoin(projects, eq(projects.id, projectParticipations.projectId))
    .leftJoin(people, eq(people.id, projectParticipations.personId))
    .leftJoin(users, eq(users.id, people.userId))
    .where(and(eq(projectParticipations.id, participationId), eq(projectParticipations.projectId, projectId)))
    .limit(1);
  if (!row) return null;
  const roles = await q.select().from(projectRoleAssignments).where(eq(projectRoleAssignments.participationId, participationId));
  const userId = row.userId;
  const [access] = userId && row.p.status === "active"
    ? await q.select().from(projectEffectiveAccess).where(and(eq(projectEffectiveAccess.projectId, projectId), eq(projectEffectiveAccess.userId, userId)))
    : [];
  let openObservations = 0, openTasks = 0;
  if (userId) {
    const [o] = await q.select({ n: sql<number>`count(*)::int` }).from(studioObservations)
      .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId)).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
      .where(and(eq(studioStudies.projectId, projectId), eq(studioObservations.responsableId, userId), ne(studioObservations.statut, "cloturee")));
    const [t] = await q.select({ n: sql<number>`count(*)::int` }).from(studioObservationTasks)
      .innerJoin(studioObservations, eq(studioObservations.commentId, studioObservationTasks.observationId))
      .innerJoin(studioVariants, eq(studioVariants.id, studioObservations.variantId)).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
      .where(and(eq(studioStudies.projectId, projectId), eq(studioObservationTasks.assigneeId, userId), eq(studioObservationTasks.statut, "a-faire")));
    openObservations = o?.n ?? 0;
    openTasks = t?.n ?? 0;
  }
  const lock = row.lock;
  return participationImpact({
    change,
    access: access ? { role: access.role, canExport: access.canExport, canApprove: access.canApprove, canPublish: access.canPublish } : null,
    roles: roles.map((r) => ({ role: r.role, scopeType: r.scopeType, scopeId: r.scopeId, origin: r.origin })),
    pendingInvitations: (await pendingInvitationIds(q, projectId, [row.accountEmail, row.workEmail])).length,
    openObservations, openTasks,
    holdsEditingLock: Boolean(userId && lock && lock.userId === userId && new Date(lock.expiresAt).getTime() > Date.now()),
    responsibilities: row.p.responsibilities,
  });
}

/**
 * Change le statut d'une participation dans la transaction de l'appelant. Suspendre ou terminer retire l'accès dérivé à
 * la requête suivante (la vue ne retient qu'une participation active) et libère la réservation d'édition du compte ;
 * terminer retire aussi la ligne de partage (aucun pont ne rouvrirait l'accès) et annule les invitations en attente pour
 * ses adresses. Réactiver rend l'accès des rôles toujours portés. Renvoie le nombre d'invitations annulées.
 */
export async function applyStatusChange(tx: Tx, input: { projectId: string; participationId: string; userId: string | null; accountEmail: string | null; workEmail: string | null; to: ParticipationStatus; endsOn?: string | null }): Promise<{ invitationsCancelled: number }> {
  if (input.to === "terminee") {
    await tx.update(projectParticipations).set({ status: "terminee", endsOn: sql`greatest(coalesce(${input.endsOn ?? null}::date, current_date), coalesce(${projectParticipations.startsOn}, current_date))` , updatedAt: new Date() })
      .where(eq(projectParticipations.id, input.participationId));
  } else {
    await tx.update(projectParticipations).set({ status: input.to, updatedAt: new Date() }).where(eq(projectParticipations.id, input.participationId));
  }
  if (input.to !== "active" && input.userId) {
    await tx.execute(sql`UPDATE projects SET editing_lock = NULL WHERE id = ${input.projectId} AND editing_lock->>'userId' = ${input.userId}`);
  }
  let invitationsCancelled = 0;
  if (input.to === "terminee") {
    if (input.userId) await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
    const ids = await pendingInvitationIds(tx, input.projectId, [input.accountEmail, input.workEmail]);
    if (ids.length) await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() }).where(inArray(invitations.id, ids));
    invitationsCancelled = ids.length;
  }
  return { invitationsCancelled };
}

export type ErasedBy = { actorId: string; via: "demande"; ip: string | null } | { actorId: null; via: "conservation"; ip: null };

/**
 * Efface un contact sans compte (OP-D9, OP-2) : nom remplacé, fonction et coordonnées supprimées, participations en
 * cours terminées, invitations en attente pour son ancienne adresse annulées ; la fiche et les participations restent
 * comme trace sans donnée personnelle. Une entrée de journal par projet concerné (sans adresse). Renvoie false si la
 * personne a un compte, est inconnue ou déjà effacée.
 */
export async function eraseContactIn(tx: Tx, personId: string, by: ErasedBy): Promise<boolean> {
  const [person] = await tx.select().from(people).where(eq(people.id, personId)).limit(1).for("update");
  if (!person || person.userId || person.erasedAt) return false;
  const parts = await tx.select({ id: projectParticipations.id, projectId: projectParticipations.projectId, status: projectParticipations.status })
    .from(projectParticipations).where(eq(projectParticipations.personId, personId)).for("update");
  await tx.update(people).set({ displayName: ERASED_CONTACT_NAME, jobTitle: null, workEmail: null, workPhone: null, erasedAt: new Date(), updatedAt: new Date() }).where(eq(people.id, personId));
  let cancelled = 0;
  for (const p of parts) {
    if (p.status !== "terminee") {
      await applyStatusChange(tx, { projectId: p.projectId, participationId: p.id, userId: null, accountEmail: null, workEmail: null, to: "terminee" });
    }
    const ids = await pendingInvitationIds(tx, p.projectId, [person.workEmail]);
    if (ids.length) await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() }).where(inArray(invitations.id, ids));
    cancelled += ids.length;
  }
  const projectIds = [...new Set(parts.map((p) => p.projectId))];
  for (const projectId of projectIds) {
    await audit(tx, { actorId: by.actorId, action: "person.contact_erased", target: { type: "project", id: projectId }, metadata: { personId, via: by.via, invitationsCancelled: cancelled }, ip: by.ip });
  }
  if (!projectIds.length) await audit(tx, { actorId: by.actorId, action: "person.contact_erased", target: { type: "person", id: personId }, metadata: { personId, via: by.via }, ip: by.ip });
  return true;
}

/**
 * Tâche périodique (OP-2) : efface chaque contact sans compte dont tous les projets sont clos depuis 2 ans au moins, ou
 * qui n'a plus aucune participation (projet supprimé). `now` est injectable (horloge simulée des recettes).
 */
export async function runContactRetentionJob(now = new Date()): Promise<{ erased: number }> {
  const contacts = await db
    .select({ id: people.id, closedAt: projects.closedAt, participationId: projectParticipations.id })
    .from(people)
    .leftJoin(projectParticipations, eq(projectParticipations.personId, people.id))
    .leftJoin(projects, eq(projects.id, projectParticipations.projectId))
    .where(and(isNull(people.userId), isNull(people.erasedAt)));
  const byPerson = new Map<string, (Date | null)[]>();
  for (const c of contacts) {
    const list = byPerson.get(c.id) ?? [];
    if (c.participationId) list.push(c.closedAt);
    byPerson.set(c.id, list);
  }
  let erased = 0;
  for (const [id, closed] of byPerson) {
    if (!contactRetentionDue({ hasAccount: false, erasedAt: null, projectsClosedAt: closed }, now)) continue;
    if (await db.transaction((tx) => eraseContactIn(tx, id, { actorId: null, via: "conservation", ip: null }))) erased++;
  }
  return { erased };
}

/** Organisations visibles d'un responsable de gestion : créées par lui, ou présentes dans un projet qu'il possède. */
export function visibleOrganizationsCondition(actorId: string) {
  return sql`(${organizations.createdBy} = ${actorId} OR ${organizations.id} IN (
    SELECT coalesce(pp.organization_id, pp.represented_organization_id) FROM project_participations pp JOIN projects pr ON pr.id = pp.project_id
     WHERE pr.owner_id = ${actorId} AND coalesce(pp.organization_id, pp.represented_organization_id) IS NOT NULL
    UNION SELECT pp.represented_organization_id FROM project_participations pp JOIN projects pr ON pr.id = pp.project_id
     WHERE pr.owner_id = ${actorId} AND pp.represented_organization_id IS NOT NULL))`;
}

/** Personnes visibles : créées par lui, ou participant à un projet qu'il possède (jamais l'annuaire d'un autre). */
export function visiblePeopleCondition(actorId: string) {
  return sql`(${people.createdBy} = ${actorId} OR ${people.id} IN (
    SELECT pp.person_id FROM project_participations pp JOIN projects pr ON pr.id = pp.project_id
     WHERE pr.owner_id = ${actorId} AND pp.person_id IS NOT NULL))`;
}

