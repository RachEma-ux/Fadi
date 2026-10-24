/**
 * Organisations — accès à la base de la phase 5 (Issue #262, concept partie 5). Règles pures : `organizations-rules.ts`.
 *
 * - L'adhésion de la personne connectée décide seule de ce qu'elle peut faire dans une organisation ; le rôle
 *   d'administrateur de la plateforme n'y entre jamais (même logique que D-2).
 * - Invitation de finalité `organization_membership` (V22-02) : créée par un administrateur actif ; acceptée par
 *   l'identité visée (règles communes `invitationRefusal`), elle crée l'adhésion — idempotente, l'invitant revalidé.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { invitations, organizationMemberships, organizations, people, users, type OrganizationRole } from "../db/schema.js";
import { INVITATION_TTL_MS } from "./account.js";
import { audit } from "./audit.js";
import { newId } from "./ids.js";
import { organizationCapabilities, organizationInviterAuthorized, type OrganizationCapabilities } from "./organizations-rules.js";
import { randomToken, sha256Hex } from "./security/tokens.js";
import type { Tx } from "./step-rows.js";

type Executor = Pick<typeof db, "select">;
type OrganizationRow = typeof organizations.$inferSelect;
type MembershipRow = typeof organizationMemberships.$inferSelect;
type InvitationRow = typeof invitations.$inferSelect;

/** La personne liée au compte (créée si besoin : liaison vérifiée, c'est le compte lui-même). */
export async function ensurePersonForUser(tx: Tx, userId: string): Promise<string> {
  await tx.insert(people).values({ id: newId("per"), userId, createdBy: userId })
    .onConflictDoNothing({ target: people.userId, where: sql.raw("user_id IS NOT NULL") });
  const [row] = await tx.select({ id: people.id }).from(people).where(eq(people.userId, userId)).limit(1);
  return row!.id;
}

export async function personIdOfUser(userId: string, executor: Executor = db): Promise<string | null> {
  const [row] = await executor.select({ id: people.id }).from(people).where(eq(people.userId, userId)).limit(1);
  return row?.id ?? null;
}

/** L'adhésion courante (non terminée) de la personne, sinon la plus récente terminée ; null si jamais membre. */
export async function membershipOf(organizationId: string, userId: string, executor: Executor = db): Promise<MembershipRow | null> {
  const rows = await executor.select({ m: organizationMemberships }).from(organizationMemberships)
    .innerJoin(people, eq(people.id, organizationMemberships.personId))
    .where(and(eq(organizationMemberships.organizationId, organizationId), eq(people.userId, userId)))
    .orderBy(sql`(${organizationMemberships.status} = 'terminee')`, desc(organizationMemberships.startsOn), desc(organizationMemberships.createdAt))
    .limit(1);
  return rows[0]?.m ?? null;
}

export interface OrganizationAccess { org: OrganizationRow; membership: MembershipRow | null; can: OrganizationCapabilities }

/** L'organisation et ce que le compte peut y faire ; null si elle n'existe pas ou si le compte n'y a jamais adhéré. */
export async function loadOrganizationAccess(organizationId: string, userId: string, executor: Executor = db): Promise<OrganizationAccess | null> {
  const [org] = await executor.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return null;
  const membership = await membershipOf(organizationId, userId, executor);
  if (!membership) return null;
  return { org, membership, can: organizationCapabilities(org, membership) };
}

/** Identifiants des adhésions administrateur actives (sous verrou, garde du dernier administrateur). */
export async function lockActiveAdmins(tx: Tx, organizationId: string): Promise<string[]> {
  const rows = await tx.select({ id: organizationMemberships.id }).from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.role, "administrateur"), eq(organizationMemberships.status, "active")))
    .for("update");
  return rows.map((r) => r.id);
}

// --- Invitations d'adhésion (finalité `organization_membership`) ------------------------------------------------

export interface CreatedOrganizationInvitation { invitation: InvitationRow; token: string; resent: boolean }

/**
 * Crée l'invitation, ou renouvelle celle déjà en attente pour la même adresse et la même organisation (règle visible :
 * nouveau jeton, nouvelle échéance, rôle et fonction mis à jour ; aucun doublon). Ne crée ni compte ni adhésion.
 */
export async function createOrRenewOrganizationInvitation(
  tx: Tx,
  input: { email: string; organizationId: string; role: OrganizationRole; jobTitle: string | null; invitedBy: string; ip?: string | null },
): Promise<CreatedOrganizationInvitation> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await tx.update(invitations).set({ status: "expired" })
    .where(and(eq(invitations.status, "pending"), sql`${invitations.expiresAt} <= now()`, eq(invitations.email, input.email)));
  const [existing] = await tx.select().from(invitations).where(and(
    eq(invitations.email, input.email), eq(invitations.purpose, "organization_membership"), eq(invitations.status, "pending"),
    eq(invitations.organizationId, input.organizationId),
  )).limit(1).for("update");
  const meta = { purpose: "organization_membership", organizationId: input.organizationId, role: input.role };
  if (existing) {
    const [row] = await tx.update(invitations).set({ tokenHash: sha256Hex(token), expiresAt, organizationRole: input.role, organizationJobTitle: input.jobTitle, invitedBy: input.invitedBy })
      .where(eq(invitations.id, existing.id)).returning();
    await audit(tx, { actorId: input.invitedBy, action: "invitation.resent", target: { type: "invitation", id: existing.id }, metadata: meta, ip: input.ip });
    return { invitation: row!, token, resent: true };
  }
  const [row] = await tx.insert(invitations).values({
    id: newId("inv"), purpose: "organization_membership", email: input.email, tokenHash: sha256Hex(token),
    organizationId: input.organizationId, organizationRole: input.role, organizationJobTitle: input.jobTitle, invitedBy: input.invitedBy, expiresAt,
  }).returning();
  await audit(tx, { actorId: input.invitedBy, action: "invitation.created", target: { type: "invitation", id: row!.id }, metadata: meta, ip: input.ip });
  return { invitation: row!, token, resent: false };
}

/** L'invitant d'une invitation d'adhésion est-il toujours administrateur actif d'une organisation active ? */
export async function organizationInviterStillAuthorized(inv: Pick<InvitationRow, "invitedBy" | "organizationId">, executor: Executor = db): Promise<boolean> {
  if (!inv.invitedBy || !inv.organizationId) return false;
  const [account] = await executor.select({ status: users.status, deletion: users.deletionRequestedAt }).from(users).where(eq(users.id, inv.invitedBy)).limit(1);
  const [org] = await executor.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, inv.organizationId)).limit(1);
  const membership = await membershipOf(inv.organizationId, inv.invitedBy, executor);
  return organizationInviterAuthorized(org ?? null, membership, account ? { status: account.status, deletionRequested: !!account.deletion } : null);
}

/**
 * Activation d'une invitation d'adhésion acceptée (déjà vérifiée par `invitationRefusal`) : la personne liée au compte
 * reçoit une adhésion active au rôle et à la fonction proposés. Idempotente : une adhésion déjà active ou suspendue est
 * conservée telle quelle (jamais rétrogradée ni réactivée d'office) ; une adhésion terminée laisse place à une nouvelle
 * période.
 */
export async function activateOrganizationMembership(tx: Tx, inv: InvitationRow, userId: string, ip: string | null): Promise<void> {
  if (inv.purpose !== "organization_membership" || !inv.organizationId || !inv.organizationRole) return;
  const personId = await ensurePersonForUser(tx, userId);
  const [current] = await tx.select().from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, inv.organizationId), eq(organizationMemberships.personId, personId), ne(organizationMemberships.status, "terminee")))
    .limit(1).for("update");
  if (current) return;
  const id = newId("orm");
  await tx.insert(organizationMemberships).values({
    id, organizationId: inv.organizationId, personId, role: inv.organizationRole, jobTitle: inv.organizationJobTitle, status: "active",
    invitationId: inv.id, createdBy: inv.invitedBy,
  });
  await audit(tx, { actorId: userId, action: "organization.membership.created", target: { type: "organization", id: inv.organizationId }, metadata: { membershipId: id, role: inv.organizationRole, via: "invitation", invitationId: inv.id }, ip });
}

export async function organizationNameOf(id: string | null, executor: Executor = db): Promise<string | null> {
  if (!id) return null;
  const [row] = await executor.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, id)).limit(1);
  return row?.name ?? null;
}
