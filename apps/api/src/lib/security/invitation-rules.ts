/** Règles pures d'acceptation d'une invitation (UM-3) — testables sans base. */
import type { InvitationStatus } from "../../db/schema.js";

type InvitationRow = { status: InvitationStatus; expiresAt: Date; email: string };

export type InvitationRefusal = "not_found" | "expired" | "already_accepted" | "declined" | "cancelled" | "wrong_account" | "inviter_not_authorized" | "account_inactive";

/** Décision pure : l'invitation peut-elle être acceptée par ce compte, maintenant ? */
export function invitationRefusal(
  inv: InvitationRow | null,
  account: { email: string; status: string } | null,
  inviterAuthorized: boolean,
  now: Date,
): InvitationRefusal | null {
  if (!inv) return "not_found";
  const terminal: Partial<Record<InvitationStatus, InvitationRefusal>> = { accepted: "already_accepted", declined: "declined", cancelled: "cancelled", expired: "expired" };
  if (terminal[inv.status]) return terminal[inv.status]!;
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  if (account && account.email.toLowerCase() !== inv.email.toLowerCase()) return "wrong_account";
  if (account && account.status !== "active") return "account_inactive";
  if (!inviterAuthorized) return "inviter_not_authorized";
  return null;
}

export const INVITATION_REFUSAL_MESSAGE: Record<InvitationRefusal, string> = {
  not_found: "Invitation introuvable : le lien est incomplet ou a été remplacé par un envoi plus récent.",
  expired: "Cette invitation a expiré : demandez une nouvelle invitation.",
  already_accepted: "Cette invitation a déjà été acceptée.",
  declined: "Cette invitation a été déclinée : une nouvelle invitation est nécessaire.",
  cancelled: "Cette invitation a été annulée par son auteur.",
  wrong_account: "Cette invitation est destinée à une autre adresse : connectez-vous avec le compte invité.",
  inviter_not_authorized: "La personne qui vous a invité·e n'a plus l'autorité nécessaire : demandez une nouvelle invitation.",
  account_inactive: "Ce compte n'est pas actif.",
};

