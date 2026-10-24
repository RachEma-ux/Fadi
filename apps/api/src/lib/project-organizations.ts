/**
 * Organisations côté projet (Issue #262, reliquat de la phase 5 ; OP-D1 a) : la **partie propriétaire déclarée**
 * (`projects.organization_id`) et les **organisations parties** (participations d'organisation non terminées), avec
 * leurs représentants mandatés en cours (mandats `actif`, acceptés par le représentant).
 *
 * Lecture seule, pour tout lecteur du projet. Rien ici ne décide d'un accès : `loadProjectAccess` ne lit aucune de ces
 * tables, la personne propriétaire (`projects.owner_id`) reste le gardien du projet (OP-D1 a).
 *
 * Données exposées : identité de l'organisation (`id`, `name`, `kind`, `status`) — jamais ses coordonnées (`details`,
 * réservées à son espace) ; nom d'affichage des représentants — jamais leur adresse. Une organisation suspendue ou
 * close reste affichée avec son statut (jamais masquée).
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  organizationMandates, organizationMemberships, organizations, people, projectParticipations, projects, users,
  type OrganizationStatus, type ParticipationStatus, type TeamResponsibility,
} from "../db/schema.js";
import { shapeProjectOrganizations, type ProjectOrganizationsView } from "./project-organizations-view.js";

type Querier = Pick<typeof db, "select">;

export type { ProjectOrganizationsView } from "./project-organizations-view.js";

/**
 * La partie propriétaire déclarée seule (`{ id, name, kind, status }`), pour l'en-tête du projet ; null sans déclaration.
 * Avec `viewerId`, `youAreMember` dit si le lecteur y a une adhésion non terminée (renvoi vers l'espace d'organisation).
 */
export async function owningOrganizationOf(organizationId: string | null, viewerId?: string, q: Querier = db) {
  if (!organizationId) return null;
  const [org] = await q.select({ id: organizations.id, name: organizations.name, kind: organizations.kind, status: organizations.status })
    .from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return null;
  const identity = { ...org, status: org.status as OrganizationStatus };
  if (viewerId === undefined) return identity;
  return { ...identity, youAreMember: (await memberOrganizations(viewerId, [org.id], q)).length > 0 };
}

/** Parmi `orgIds`, celles où le compte a une adhésion non terminée. */
async function memberOrganizations(viewerId: string, orgIds: string[], q: Querier): Promise<string[]> {
  if (!orgIds.length) return [];
  const rows = await q.select({ organizationId: organizationMemberships.organizationId }).from(organizationMemberships)
    .innerJoin(people, eq(people.id, organizationMemberships.personId))
    .where(and(eq(people.userId, viewerId), inArray(organizationMemberships.organizationId, orgIds), ne(organizationMemberships.status, "terminee")));
  return rows.map((r) => r.organizationId);
}

/** Partie propriétaire, organisations parties et représentants mandatés en cours, vus par `viewerId`. */
export async function projectOrganizations(projectId: string, viewerId: string, q: Querier = db): Promise<ProjectOrganizationsView> {
  const [project] = await q.select({ ownerId: projects.ownerId, organizationId: projects.organizationId, ownerName: users.displayName })
    .from(projects).leftJoin(users, eq(users.id, projects.ownerId)).where(eq(projects.id, projectId)).limit(1);
  if (!project) return shapeProjectOrganizations({ owner: null, ownerPersonName: null, ownerUserId: null, parties: [], mandates: [], memberOf: [] });
  const [ownerPerson] = project.ownerId
    ? await q.select({ displayName: people.displayName }).from(people).where(eq(people.userId, project.ownerId)).limit(1)
    : [];
  const owner = await owningOrganizationOf(project.organizationId, undefined, q);
  const parties = await q.select({
    participationId: projectParticipations.id, status: projectParticipations.status, businessRole: projectParticipations.businessRole,
    responsibilities: projectParticipations.responsibilities, startsOn: projectParticipations.startsOn,
    org: { id: organizations.id, name: organizations.name, kind: organizations.kind, status: organizations.status },
  }).from(projectParticipations)
    .innerJoin(organizations, eq(organizations.id, projectParticipations.organizationId))
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee")))
    .orderBy(projectParticipations.createdAt, projectParticipations.id);
  const mandates = await q.select({
    id: organizationMandates.id, organizationId: organizationMandates.organizationId, participationId: organizationMandates.participationId,
    responsibilities: organizationMandates.responsibilities, startsOn: organizationMandates.startsOn,
    accountName: users.displayName, personName: people.displayName,
  }).from(organizationMandates)
    .innerJoin(organizationMemberships, eq(organizationMemberships.id, organizationMandates.membershipId))
    .innerJoin(people, eq(people.id, organizationMemberships.personId))
    .leftJoin(users, eq(users.id, people.userId))
    .where(and(eq(organizationMandates.projectId, projectId), eq(organizationMandates.status, "actif")))
    .orderBy(organizationMandates.proposedAt, organizationMandates.id);
  const orgIds = [...new Set([...(owner ? [owner.id] : []), ...parties.map((p) => p.org.id)])];
  const memberOf = await memberOrganizations(viewerId, orgIds, q);
  return shapeProjectOrganizations({
    owner,
    ownerUserId: project.ownerId,
    ownerPersonName: project.ownerName || ownerPerson?.displayName || null,
    parties: parties.map((p) => ({
      participationId: p.participationId, status: p.status as ParticipationStatus, businessRole: p.businessRole,
      responsibilities: p.responsibilities as TeamResponsibility[], startsOn: p.startsOn,
      org: { ...p.org, status: p.org.status as OrganizationStatus },
    })),
    mandates: mandates.map((m) => ({ ...m, responsibilities: m.responsibilities as TeamResponsibility[] })),
    memberOf,
  });
}
