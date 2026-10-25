/**
 * Représentant mandaté → invitation de projet (Issue #262, reliquat de la phase 5) — lectures sur base.
 * Règles pures : `mandate-invitations.ts`. Aucune lecture ici ne décide d'un accès : un mandat n'en donne aucun, seule
 * l'acceptation d'une invitation de projet par l'identité visée en ouvre un (phase 3).
 *
 * Contrats publics :
 *   - `mandateInvitationTarget(q, project, mandateId)` : le représentant d'un mandat et le refus éventuel (404 / 409 / 422) ;
 *   - `mandateStillValidFor(q, mandateId)` : revalidation à l'acceptation (mandat actif, organisation partie et active) ;
 *   - `representedOrganizationOfMandate(q, mandateId)` : l'organisation que représentera la participation ;
 *   - `projectSideOfMandates(q, mandates)` : état côté projet de chaque mandat (espace d'organisation, lecture seule) ;
 *   - `endedMandatesOfProject(q, projectId)` : marques « mandat terminé » de l'annuaire du projet ;
 *   - `endedMandateNoticesFor(ownerId, since)` : notifications calculées du propriétaire (mandat terminé, participation
 *     conservée, à revoir).
 */
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  invitations, organizationMandates, organizationMemberships, organizations, people, projectEffectiveAccess, projectParticipations, projects, users,
  type MandateStatus, type MembershipStatus, type OrganizationStatus, type ParticipationStatus,
} from "../db/schema.js";
import { endedMandateMarks, mandateInvitationRefusal, mandateProjectSide, mandateStillValid, type EndedMandateMark, type MandateInvitationRefusal, type MandateProjectSide } from "./mandate-invitations.js";

type Querier = Pick<typeof db, "select">;

export interface MandateRepresentative {
  mandateId: string;
  organization: { id: string; name: string };
  /** Compte du représentant ; l'adresse ne sert qu'à l'envoi (jamais rendue par la vue de l'annuaire). */
  userId: string;
  email: string;
  name: string | null;
}

/** Le représentant d'un mandat de ce projet, prêt à être invité, ou le motif du refus. */
export async function mandateInvitationTarget(q: Querier, project: { id: string; ownerId: string }, mandateId: string): Promise<{ ok: true; rep: MandateRepresentative } | { ok: false; refusal: MandateInvitationRefusal }> {
  const [row] = await q.select({
    m: { id: organizationMandates.id, projectId: organizationMandates.projectId, status: organizationMandates.status, organizationId: organizationMandates.organizationId },
    membershipStatus: organizationMemberships.status, personId: people.id, personName: people.displayName,
    userId: users.id, email: users.email, accountStatus: users.status, accountName: users.displayName,
    orgName: organizations.name, orgStatus: organizations.status,
  }).from(organizationMandates)
    .innerJoin(organizations, eq(organizations.id, organizationMandates.organizationId))
    .leftJoin(organizationMemberships, eq(organizationMemberships.id, organizationMandates.membershipId))
    .leftJoin(people, eq(people.id, organizationMemberships.personId))
    .leftJoin(users, eq(users.id, people.userId))
    .where(eq(organizationMandates.id, mandateId)).limit(1);
  const [party] = row ? await q.select({ status: projectParticipations.status }).from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, project.id), eq(projectParticipations.organizationId, row.m.organizationId), ne(projectParticipations.status, "terminee"))).limit(1) : [];
  let current: { status: ParticipationStatus; hasProjectAccess: boolean; representedOrganizationId: string | null } | null = null;
  if (row?.userId) {
    const [c] = await q.select({ status: projectParticipations.status, representedOrganizationId: projectParticipations.representedOrganizationId }).from(projectParticipations)
      .innerJoin(people, eq(people.id, projectParticipations.personId))
      .where(and(eq(projectParticipations.projectId, project.id), eq(people.userId, row.userId), ne(projectParticipations.status, "terminee"))).limit(1);
    const [access] = await q.select({ userId: projectEffectiveAccess.userId }).from(projectEffectiveAccess)
      .where(and(eq(projectEffectiveAccess.projectId, project.id), eq(projectEffectiveAccess.userId, row.userId))).limit(1);
    if (c) current = { status: c.status as ParticipationStatus, hasProjectAccess: !!access, representedOrganizationId: c.representedOrganizationId };
    else if (access) current = { status: "active", hasProjectAccess: true, representedOrganizationId: null };
  }
  const refusal = mandateInvitationRefusal({
    projectId: project.id, ownerId: project.ownerId,
    mandate: row ? { projectId: row.m.projectId, status: row.m.status as MandateStatus, organizationId: row.m.organizationId } : null,
    partyStatus: (party?.status as ParticipationStatus | undefined) ?? null,
    organizationStatus: (row?.orgStatus as OrganizationStatus | undefined) ?? null,
    membershipStatus: (row?.membershipStatus as MembershipStatus | null | undefined) ?? null,
    representative: row ? { userId: row.userId ?? null, accountStatus: row.accountStatus ?? null } : null,
    current,
  });
  if (refusal) return { ok: false, refusal };
  return { ok: true, rep: { mandateId: row!.m.id, organization: { id: row!.m.organizationId, name: row!.orgName }, userId: row!.userId!, email: row!.email!, name: row!.accountName || row!.personName || null } };
}

/** Revalidation à l'acceptation : le mandat est toujours actif, son organisation partie au projet et active. */
export async function mandateStillValidFor(q: Querier, mandateId: string, projectId: string): Promise<boolean> {
  const [m] = await q.select({ status: organizationMandates.status, organizationId: organizationMandates.organizationId, projectId: organizationMandates.projectId, orgStatus: organizations.status })
    .from(organizationMandates).innerJoin(organizations, eq(organizations.id, organizationMandates.organizationId))
    .where(eq(organizationMandates.id, mandateId)).limit(1);
  if (!m || m.projectId !== projectId) return false;
  const [party] = await q.select({ status: projectParticipations.status }).from(projectParticipations)
    .where(and(eq(projectParticipations.projectId, projectId), eq(projectParticipations.organizationId, m.organizationId), ne(projectParticipations.status, "terminee"))).limit(1);
  return mandateStillValid({ mandateStatus: m.status as MandateStatus, partyStatus: (party?.status as ParticipationStatus | undefined) ?? null, organizationStatus: m.orgStatus as OrganizationStatus });
}

/** L'organisation d'un mandat (partie représentée par la participation créée), ou null. */
export async function representedOrganizationOfMandate(q: Querier, mandateId: string | null | undefined): Promise<{ id: string; name: string } | null> {
  if (!mandateId) return null;
  const [o] = await q.select({ id: organizations.id, name: organizations.name }).from(organizationMandates)
    .innerJoin(organizations, eq(organizations.id, organizationMandates.organizationId)).where(eq(organizationMandates.id, mandateId)).limit(1);
  return o ?? null;
}

/**
 * État côté projet de chaque mandat (participation active avec accès, invitation en attente, participation terminée, ou
 * non invité), pour l'espace d'organisation — lecture seule. `userId` null : représentant sans compte, « non invité ».
 */
export async function projectSideOfMandates(q: Querier, mandates: readonly { mandateId: string; projectId: string; personId: string; userId: string | null }[]): Promise<Map<string, MandateProjectSide>> {
  const out = new Map<string, MandateProjectSide>();
  if (!mandates.length) return out;
  const projectIds = [...new Set(mandates.map((m) => m.projectId))];
  const personIds = [...new Set(mandates.map((m) => m.personId))];
  const userIds = [...new Set(mandates.map((m) => m.userId).filter((u): u is string => !!u))];
  const parts = await q.select({ projectId: projectParticipations.projectId, personId: projectParticipations.personId, status: projectParticipations.status })
    .from(projectParticipations).where(and(inArray(projectParticipations.projectId, projectIds), inArray(projectParticipations.personId, personIds)));
  const access = userIds.length ? await q.select({ projectId: projectEffectiveAccess.projectId, userId: projectEffectiveAccess.userId }).from(projectEffectiveAccess)
    .where(and(inArray(projectEffectiveAccess.projectId, projectIds), inArray(projectEffectiveAccess.userId, userIds))) : [];
  const pending = userIds.length ? await q.select({ projectId: invitations.projectId, userId: users.id }).from(invitations)
    .innerJoin(users, sql`lower(${users.email}) = lower(${invitations.email})`)
    .where(and(eq(invitations.purpose, "project_participation"), eq(invitations.status, "pending"), gt(invitations.expiresAt, new Date()),
      inArray(invitations.projectId, projectIds), inArray(users.id, userIds))) : [];
  for (const m of mandates) {
    const hasAccess = !!m.userId && access.some((a) => a.projectId === m.projectId && a.userId === m.userId);
    out.set(m.mandateId, mandateProjectSide({
      participations: parts.filter((p) => p.projectId === m.projectId && p.personId === m.personId).map((p) => ({ status: p.status as ParticipationStatus, hasProjectAccess: hasAccess })),
      pendingInvitation: !!m.userId && pending.some((p) => p.projectId === m.projectId && p.userId === m.userId),
    }));
  }
  return out;
}

export interface EndedRepresentativeView extends EndedMandateMark { organizationId: string; name: string | null }

/** Marques « mandat terminé » de l'annuaire du projet (participation conservée, à revoir), toutes organisations. */
export async function endedMandatesOfProject(q: Querier, projectId: string): Promise<EndedRepresentativeView[]> {
  const parts = await q.select({
    id: projectParticipations.id, personId: projectParticipations.personId, status: projectParticipations.status,
    representedOrganizationId: projectParticipations.representedOrganizationId, personName: people.displayName, accountName: users.displayName,
  }).from(projectParticipations).innerJoin(people, eq(people.id, projectParticipations.personId)).leftJoin(users, eq(users.id, people.userId))
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"), sql`${projectParticipations.representedOrganizationId} IS NOT NULL`));
  if (!parts.length) return [];
  const mandates = await q.select({
    id: organizationMandates.id, organizationId: organizationMandates.organizationId, personId: organizationMemberships.personId, status: organizationMandates.status,
    endsOn: organizationMandates.endsOn, endReason: organizationMandates.endReason, endedAt: organizationMandates.endedAt,
  }).from(organizationMandates).innerJoin(organizationMemberships, eq(organizationMemberships.id, organizationMandates.membershipId))
    .where(eq(organizationMandates.projectId, projectId));
  const orgIds = [...new Set(parts.map((p) => p.representedOrganizationId!))];
  return orgIds.flatMap((organizationId) => endedMandateMarks({
    organizationId,
    participations: parts.map((p) => ({ id: p.id, personId: p.personId, status: p.status as ParticipationStatus, representedOrganizationId: p.representedOrganizationId })),
    mandates: mandates.map((m) => ({ ...m, status: m.status as MandateStatus })),
  }).map((mark) => {
    const p = parts.find((x) => x.id === mark.participationId)!;
    return { ...mark, organizationId, name: p.accountName || p.personName || null };
  }));
}

export interface EndedMandateNotice {
  mandateId: string; participationId: string; endedAt: string; endReason: string | null;
  projectId: string; projectCode: string; projectName: string; organizationName: string; representativeName: string | null;
}

/**
 * Notifications calculées du propriétaire (aucune table) : un mandat terminé depuis `since` (fin, renonciation,
 * remplacement, départ, clôture) dont le représentant garde une participation en cours qui représente l'organisation —
 * elle n'est pas terminée d'office, le propriétaire la revoit. Disparaît dès qu'un nouveau mandat actif le reprend ou que
 * la participation est terminée.
 */
export async function endedMandateNoticesFor(ownerId: string, since: Date, q: Querier = db): Promise<EndedMandateNotice[]> {
  const owned = await q.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(eq(projects.ownerId, ownerId));
  if (!owned.length) return [];
  const ended = await q.select({
    id: organizationMandates.id, projectId: organizationMandates.projectId, organizationId: organizationMandates.organizationId, personId: organizationMemberships.personId,
    endedAt: organizationMandates.endedAt, endReason: organizationMandates.endReason, orgName: organizations.name,
  }).from(organizationMandates).innerJoin(organizationMemberships, eq(organizationMemberships.id, organizationMandates.membershipId))
    .innerJoin(organizations, eq(organizations.id, organizationMandates.organizationId))
    .where(and(inArray(organizationMandates.projectId, owned.map((p) => p.id)), eq(organizationMandates.status, "termine"), gt(organizationMandates.endedAt, since)));
  if (!ended.length) return [];
  const notices: EndedMandateNotice[] = [];
  for (const projectId of [...new Set(ended.map((e) => e.projectId))]) {
    const marks = await endedMandatesOfProject(q, projectId);
    const project = owned.find((p) => p.id === projectId)!;
    for (const mark of marks) {
      const e = ended.find((x) => x.id === mark.mandateId);
      if (!e?.endedAt) continue;
      notices.push({
        mandateId: e.id, participationId: mark.participationId, endedAt: e.endedAt.toISOString(), endReason: e.endReason,
        projectId, projectCode: project.code, projectName: project.name, organizationName: e.orgName, representativeName: mark.name,
      });
    }
  }
  return notices;
}
