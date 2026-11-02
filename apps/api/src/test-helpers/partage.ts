/**
 * Aide des suites DB-3 (Issue #262, phase 3, OP-D2 a) : il n'existe plus d'ajout direct d'un compte existant à un projet.
 * `partager` envoie l'invitation par la vraie route (`POST /projects/:id/members`), puis la fait accepter par le compte
 * visé avec la logique d'acceptation du serveur (mêmes refus, même activation : `invitationRefusal`,
 * `projectParticipationRefusal`, `activateInvitation`), sans passer par sa boîte de courriel ni sa session. Le résultat
 * reprend la forme de l'ancien ajout direct : 201 et la vue du membre. Toute autre réponse (adresse sans compte → 202 en
 * attente, membre existant → 200, refus 4xx) est rendue telle quelle. Jamais importé par le serveur.
 *
 * Lot OP-PONT : `project_members` est une vue de compatibilité en lecture. Une suite qui posait un partage par SQL direct
 * (projet inséré en base, situation simulée) emploie `partagerEnBase` / `retirerPartageEnBase` / `exportAccordeEnBase`,
 * qui écrivent la participation et le rôle `acces` par la logique du serveur (`lib/project-access-db.ts`).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { invitations, projects, users } from "../db/schema.js";
import { activateInvitation, invitationRefusal, inviterStillAuthorized, projectParticipationRefusal } from "../lib/invitations.js";
import { ensureOwnerParticipation, grantShare, revokeShare } from "../lib/project-access-db.js";

interface Agent {
  post(url: string): { send(body: unknown): PromiseLike<{ status: number; body: any }> };
  get(url: string): PromiseLike<{ status: number; body: any }>;
}

/** Acceptation d'une invitation en attente par le compte de son adresse ; null si acceptée, sinon le motif du refus. */
export async function accepterEnBase(invitationId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations).where(and(eq(invitations.id, invitationId), eq(invitations.status, "pending"))).limit(1).for("update");
    if (!inv) return "not_found";
    const [user] = await tx.select().from(users).where(sql`lower(${users.email}) = lower(${inv.email})`).limit(1);
    if (!user) return "no_account";
    const refusal = invitationRefusal(inv, { email: user.email, status: user.status }, await inviterStillAuthorized(inv, tx), new Date())
      ?? await projectParticipationRefusal(tx, inv, user.id);
    if (refusal) return refusal;
    await activateInvitation(tx, inv, user.id, null);
    return null;
  });
}

export async function partager(owner: Agent, projectId: string, email: string, role: string): Promise<{ status: number; body: any }> {
  const sent = await owner.post(`/projects/${projectId}/members`).send({ email, role });
  if (sent.status !== 202 || !sent.body?.accountExists) return sent;
  const refusal = await accepterEnBase(sent.body.invitation.id);
  if (refusal) return { status: 409, body: { error: refusal } };
  const wanted = email.trim().toLowerCase();
  const member = ((await owner.get(`/projects/${projectId}/members`)).body?.members ?? []).find((m: { email: string }) => m.email.toLowerCase() === wanted);
  return { status: 201, body: member };
}

/** Partage posé directement en base par la logique du serveur (participation, rôle `acces`, export accordé). */
export async function partagerEnBase(projectId: string, userId: string, role: "lecteur" | "editeur", opts: { canExport?: boolean | null; invitedBy?: string } = {}): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    if (p) await ensureOwnerParticipation(tx, projectId, p.ownerId);
    await grantShare(tx, { projectId, userId, role, canExport: opts.canExport, invitedBy: opts.invitedBy ?? "test", mode: "set" });
  });
}

/** Partage retiré directement en base (participation terminée), comme un retrait par le propriétaire. */
export async function retirerPartageEnBase(projectId: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => !!(await revokeShare(tx, projectId, userId)));
}

/** Export accordé (ou retiré) à un lecteur, écrit sur sa participation en cours — l'ancien `project_members.can_export`. */
export async function exportAccordeEnBase(projectId: string, userId: string, value: boolean): Promise<void> {
  await db.execute(sql`UPDATE project_participations SET can_export = ${value} WHERE project_id = ${projectId} AND status <> 'terminee'
    AND person_id IN (SELECT id FROM people WHERE user_id = ${userId})`);
}
