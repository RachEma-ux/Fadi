/**
 * Aide des suites DB-3 (Issue #262, phase 3, OP-D2 a) : il n'existe plus d'ajout direct d'un compte existant à un projet.
 * `partager` envoie l'invitation par la vraie route (`POST /projects/:id/members`), puis la fait accepter par le compte
 * visé avec la logique d'acceptation du serveur (mêmes refus, même activation : `invitationRefusal`,
 * `projectParticipationRefusal`, `activateInvitation`), sans passer par sa boîte de courriel ni sa session. Le résultat
 * reprend la forme de l'ancien ajout direct : 201 et la vue du membre. Toute autre réponse (adresse sans compte → 202 en
 * attente, membre existant → 200, refus 4xx) est rendue telle quelle. Jamais importé par le serveur.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { invitations, users } from "../db/schema.js";
import { activateInvitation, invitationRefusal, inviterStillAuthorized, projectParticipationRefusal } from "../lib/invitations.js";

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
