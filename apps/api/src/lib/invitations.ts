/**
 * Invitations (UM-3, concept v2.2 « An invitation is a proposal, not a grant »).
 *
 * - Créer une invitation ne crée ni compte ni accès ; une seule invitation en attente par (adresse, finalité, projet) :
 *   la renvoyer remplace son jeton et son échéance (règle visible, aucun doublon).
 * - Accepter exige : invitation en attente et non expirée, compte dont l'adresse **est** celle de l'invitation (un lien
 *   transféré ne transfère aucune autorité), invitant **toujours** habilité (propriétaire actif du projet, ou
 *   administrateur actif) — sinon refus, sans activation. L'activation est idempotente.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { invitations, projects, users, type InvitationPurpose, type InvitationStatus, type ProposedRole } from "../db/schema.js";
import { audit } from "./audit.js";
import { newId } from "./ids.js";
import { INVITATION_TTL_MS } from "./account.js";
import { randomToken, sha256Hex } from "./security/tokens.js";
import { activateOrganizationMembership, organizationInviterStillAuthorized } from "./organizations.js";
import { activateProjectParticipation, projectParticipationRefusal, rolesOf } from "./project-invitations-db.js";

export { projectParticipationRefusal };

type InvitationRow = typeof invitations.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { invitationRefusal, INVITATION_REFUSAL_MESSAGE, type InvitationRefusal } from "./security/invitation-rules.js";

export async function findInvitationByToken(token: string, executor: Pick<typeof db, "select"> = db): Promise<InvitationRow | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const rows = await executor.select().from(invitations).where(eq(invitations.tokenHash, sha256Hex(token))).limit(1);
  return rows[0] ?? null;
}

/** L'invitant a-t-il encore l'autorité de cette invitation ? */
export async function inviterStillAuthorized(inv: Pick<InvitationRow, "purpose" | "invitedBy" | "projectId" | "grantPlatformRole" | "organizationId">, executor: Pick<typeof db, "select"> = db): Promise<boolean> {
  // Invitation d'amorçage (script opérateur `create-admin.mjs`) : l'autorité est celle de l'exploitant du serveur.
  if (!inv.invitedBy) return inv.purpose === "platform_account" && inv.grantPlatformRole === "admin";
  // Adhésion à une organisation (phase 5) : administrateur actif d'une organisation active, jamais le rôle plateforme.
  if (inv.purpose === "organization_membership") return organizationInviterStillAuthorized(inv, executor);
  const [inviter] = await executor.select({ status: users.status, role: users.platformRole, deletion: users.deletionRequestedAt }).from(users).where(eq(users.id, inv.invitedBy)).limit(1);
  if (!inviter || inviter.status !== "active" || inviter.deletion) return false;
  if (inv.purpose === "platform_account") return inviter.role === "admin";
  const [project] = await executor.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, inv.projectId ?? "")).limit(1);
  return project?.ownerId === inv.invitedBy;
}

export interface CreatedInvitation { invitation: InvitationRow; token: string; resent: boolean }

/** Crée l'invitation, ou renouvelle celle déjà en attente pour la même adresse / finalité / projet. */
export async function createOrRenewInvitation(
  tx: Tx,
  input: { purpose: InvitationPurpose; email: string; projectId?: string | null; projectRole?: "lecteur" | "editeur" | null; invitedBy: string; ip?: string | null },
): Promise<CreatedInvitation> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  // Les invitations échues sont marquées « expirées » avant de chercher celle à renouveler.
  await tx.update(invitations).set({ status: "expired" })
    .where(and(eq(invitations.status, "pending"), sql`${invitations.expiresAt} <= now()`, eq(invitations.email, input.email)));
  const [existing] = await tx.select().from(invitations).where(and(
    eq(invitations.email, input.email), eq(invitations.purpose, input.purpose), eq(invitations.status, "pending"),
    sql`coalesce(${invitations.projectId}, '') = ${input.projectId ?? ""}`,
  )).limit(1).for("update");
  if (existing) {
    const [row] = await tx.update(invitations).set({ tokenHash: sha256Hex(token), expiresAt, projectRole: input.projectRole ?? existing.projectRole, invitedBy: input.invitedBy })
      .where(eq(invitations.id, existing.id)).returning();
    await audit(tx, { actorId: input.invitedBy, action: "invitation.resent", target: { type: "invitation", id: existing.id }, metadata: { purpose: input.purpose, projectId: input.projectId ?? null }, ip: input.ip });
    return { invitation: row!, token, resent: true };
  }
  const [row] = await tx.insert(invitations).values({
    id: newId("inv"), purpose: input.purpose, email: input.email, tokenHash: sha256Hex(token),
    projectId: input.projectId ?? null, projectRole: input.projectRole ?? null, invitedBy: input.invitedBy, expiresAt,
  }).returning();
  await audit(tx, { actorId: input.invitedBy, action: "invitation.created", target: { type: "invitation", id: row!.id }, metadata: { purpose: input.purpose, projectId: input.projectId ?? null, role: input.projectRole ?? null }, ip: input.ip });
  return { invitation: row!, token, resent: false };
}

/**
 * Active l'invitation pour le compte (déjà vérifié par `invitationRefusal`) : rattachement au projet si besoin
 * (idempotent : un membre existant garde le rôle le plus large), invitation marquée acceptée.
 */
export async function activateInvitation(tx: Tx, inv: InvitationRow, userId: string, ip: string | null): Promise<void> {
  // Finalité `organization_membership` (phase 5) : branche distincte, l'adhésion naît de l'acceptation.
  if (inv.purpose === "organization_membership") await activateOrganizationMembership(tx, inv, userId, ip);
  // Finalité `project_participation` (Issue #262, phase 3) : liaison du compte à la fiche visée, participation active,
  // rôles proposés et échéance d'accès (lib/project-invitations-db.ts) ; un membre existant garde le rôle le plus large.
  if (inv.purpose === "project_participation" && inv.projectId && inv.projectRole) await activateProjectParticipation(tx, inv, userId, ip);
  await tx.update(invitations).set({ status: "accepted", respondedAt: new Date(), acceptedUserId: userId }).where(eq(invitations.id, inv.id));
  await audit(tx, { actorId: userId, action: "invitation.accepted", target: { type: "invitation", id: inv.id }, metadata: { purpose: inv.purpose, projectId: inv.projectId, ...(inv.organizationId ? { organizationId: inv.organizationId } : {}) }, ip });
}

/** Vue publique d'une invitation (à qui présente le jeton) : jamais le jeton ni l'empreinte. */
export interface InvitationView {
  id: string; purpose: InvitationPurpose; email: string; status: InvitationStatus; expiresAt: string; accessExpiresAt: string | null;
  createdAt: string; projectId: string | null; projectName: string | null; projectRole: "lecteur" | "editeur" | null; invitedBy: string;
  /** Finalité `organization_membership` (phase 5) : organisation, rôle et fonction proposés. */
  organizationId: string | null; organizationName: string | null; organizationRole: "administrateur" | "membre" | null; organizationJobTitle: string | null;
  /** Finalité `project_participation` (phase 3) : participation visée et rôles proposés par portée. */
  participationId: string | null; roles: ProposedRole[] | null;
}

export function invitationView(inv: InvitationRow, extra: { projectName?: string | null; inviterName?: string; organizationName?: string | null } = {}): InvitationView {
  const expired = inv.status === "pending" && inv.expiresAt.getTime() <= Date.now();
  return {
    id: inv.id, purpose: inv.purpose, email: inv.email, status: expired ? "expired" : inv.status,
    expiresAt: inv.expiresAt.toISOString(), accessExpiresAt: inv.accessExpiresAt?.toISOString() ?? null, createdAt: inv.createdAt.toISOString(),
    projectId: inv.projectId, projectName: extra.projectName ?? null, projectRole: inv.projectRole ?? null, invitedBy: extra.inviterName ?? "",
    organizationId: inv.organizationId ?? null, organizationName: extra.organizationName ?? null, organizationRole: inv.organizationRole ?? null,
    organizationJobTitle: inv.organizationJobTitle ?? null,
    participationId: inv.participationId ?? null, roles: inv.purpose === "project_participation" ? rolesOf(inv) : null,
  };
}
