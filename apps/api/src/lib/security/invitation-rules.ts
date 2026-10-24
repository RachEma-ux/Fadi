/** Règles pures d'acceptation d'une invitation (UM-3) — testables sans base. */
import type { InvitationStatus } from "../../db/schema.js";

type InvitationRow = { status: InvitationStatus; expiresAt: Date; email: string };

export type InvitationRefusal =
  | "not_found" | "expired" | "already_accepted" | "declined" | "cancelled" | "wrong_account" | "inviter_not_authorized" | "account_inactive"
  // Revue externe (phase 4) : la personne visée est déjà liée à un autre compte.
  | "identity_conflict"
  // Invitation de projet liée à une participation (Issue #262, phase 3) : revalidation à l'acceptation.
  | ParticipationRefusal
  // Acceptation depuis la notification (sans le lien du courriel) : l'adresse du compte doit être vérifiée, sinon rien
  // ne prouve que la personne connectée détient la boîte de l'adresse invitée.
  | "email_unverified";

/**
 * Refus propres à une invitation de projet (phase 3), décidés à l'acceptation après les refus communs :
 * - `wrong_person` : la fiche visée est déjà liée à un AUTRE compte (mauvaise identité) ;
 * - `participation_unavailable` : la participation visée a été suspendue ou terminée depuis l'envoi ;
 * - `access_expired` : l'échéance d'accès proposée est déjà passée ;
 * - `roles_invalid` : les rôles proposés ne sont plus attribuables (aucun rôle de portée projet, rôle ou portée inconnus).
 */
export type ParticipationRefusal = "wrong_person" | "participation_unavailable" | "access_expired" | "roles_invalid";

/** Décision pure des refus propres à une invitation de projet liée à une participation. */
export function participationRefusal(input: {
  /** Compte lié à la fiche visée (null : contact sans compte). */
  personUserId: string | null;
  /** Compte qui accepte (null : compte créé par l'acceptation, `POST /auth/activate`). */
  acceptingUserId: string | null;
  participationStatus: "contact" | "active" | "suspendue" | "terminee" | null;
  accessExpiresAt: Date | null;
  rolesValid: boolean;
  now: Date;
}): ParticipationRefusal | null {
  if (input.personUserId && input.personUserId !== input.acceptingUserId) return "wrong_person";
  if (input.participationStatus === "suspendue" || input.participationStatus === "terminee") return "participation_unavailable";
  if (input.accessExpiresAt && input.accessExpiresAt.getTime() <= input.now.getTime()) return "access_expired";
  if (!input.rolesValid) return "roles_invalid";
  return null;
}

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
  identity_conflict: "Cette invitation de revue vise une personne déjà liée à un autre compte : demandez une nouvelle invitation.",
  wrong_person: "Cette invitation vise une fiche déjà liée à un autre compte : demandez une nouvelle invitation.",
  participation_unavailable: "La participation visée a été suspendue ou terminée depuis l'envoi : demandez une nouvelle invitation.",
  access_expired: "L'accès proposé par cette invitation a déjà expiré : demandez une nouvelle invitation.",
  roles_invalid: "Les rôles proposés par cette invitation ne sont plus attribuables : demandez une nouvelle invitation.",
  email_unverified: "Votre adresse n'est pas encore vérifiée : acceptez depuis le lien reçu par courriel, ou vérifiez d'abord votre adresse.",
};

