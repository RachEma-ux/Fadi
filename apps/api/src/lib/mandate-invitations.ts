/**
 * Représentant mandaté → invitation de projet (Issue #262, reliquat de la phase 5) — règles pures, testées hors base.
 *
 * Un mandat (proposé par un administrateur de l'organisation, accepté par le représentant) **ne donne aucun droit** : il
 * identifie le représentant d'une organisation partie au projet. Le propriétaire du projet peut, depuis l'annuaire,
 * envoyer à ce représentant une invitation de projet ordinaire (phase 3 : aperçu, rôles par portée, échéances) ; seule son
 * acceptation par l'identité visée active la participation, qui porte la partie représentée (l'organisation du mandat).
 *
 * Ici : le refus d'une invitation de représentant (motif et statut HTTP), l'état côté projet d'un mandat (lu par
 * l'espace d'organisation), et les marques « mandat terminé » de l'annuaire (participation conservée, à revoir).
 */
import type { MandateStatus, MembershipStatus, OrganizationStatus, ParticipationStatus } from "../db/schema.js";

/** État côté projet d'un mandat, vu de l'espace d'organisation (lecture seule). */
export type MandateProjectSide = "non_invite" | "invitation_en_attente" | "participation_active" | "terminee";

/**
 * L'état côté projet du représentant d'un mandat : une participation active qui ouvre l'accès au projet prime ; sinon une
 * invitation de projet en attente ; sinon une participation terminée (ou suspendue, qui n'ouvre plus rien) ; sinon « non
 * invité ». Un simple contact de l'annuaire, ou une participation active sans rôle de projet (revue externe), reste
 * « non invité ».
 */
export function mandateProjectSide(input: { participations: readonly { status: ParticipationStatus; hasProjectAccess: boolean }[]; pendingInvitation: boolean }): MandateProjectSide {
  if (input.participations.some((p) => p.status === "active" && p.hasProjectAccess)) return "participation_active";
  if (input.pendingInvitation) return "invitation_en_attente";
  if (input.participations.some((p) => p.status === "terminee" || p.status === "suspendue")) return "terminee";
  return "non_invite";
}

export type MandateInvitationRefusalCode =
  | "not_found" | "mandate_inactive" | "organization_not_party" | "organization_inactive" | "membership_inactive"
  | "representative_without_account" | "representative_is_owner" | "already_participant" | "participation_suspended"
  | "represents_other_organization";

export const MANDATE_INVITATION_MESSAGE: Record<MandateInvitationRefusalCode, string> = {
  not_found: "Mandat introuvable dans ce projet.",
  mandate_inactive: "Ce mandat n’est pas actif (proposé, refusé, annulé ou terminé) : seul le représentant d’un mandat en cours peut être invité depuis l’annuaire.",
  organization_not_party: "L’organisation de ce mandat n’est plus partie au projet : enregistrez-la d’abord comme partie.",
  organization_inactive: "L’organisation de ce mandat est suspendue ou close : aucune invitation de son représentant n’est possible.",
  membership_inactive: "L’adhésion du représentant à son organisation n’est plus active.",
  representative_without_account: "Le représentant n’a pas de compte actif : invitez-le par son adresse.",
  representative_is_owner: "Le représentant est le propriétaire du projet : il a déjà tous les droits.",
  already_participant: "Le représentant participe déjà au projet : aucune invitation n’est nécessaire.",
  participation_suspended: "La participation du représentant est suspendue : réactivez-la dans l’annuaire plutôt que de l’inviter.",
  represents_other_organization: "La fiche du représentant dans ce projet représente une autre organisation : corrigez d’abord la partie représentée.",
};

export interface MandateInvitationRefusal { status: 404 | 409 | 422; error: MandateInvitationRefusalCode; message: string }

/**
 * Peut-on inviter au projet le représentant de ce mandat ? (L'appelant a déjà vérifié qu'il est propriétaire : sinon 403
 * par `projectOr404`.) Ordre : mandat du projet, mandat actif, organisation partie et active, adhésion active, compte du
 * représentant, propriétaire, participation actuelle du représentant dans le projet.
 */
export function mandateInvitationRefusal(input: {
  projectId: string;
  ownerId: string;
  mandate: null | { projectId: string; status: MandateStatus; organizationId: string };
  /** Participation de l'organisation dans le projet, celle du mandat (null : introuvable). */
  partyStatus: ParticipationStatus | null;
  organizationStatus: OrganizationStatus | null;
  membershipStatus: MembershipStatus | null;
  representative: null | { userId: string | null; accountStatus: string | null };
  /** Participation en cours (non terminée) du représentant dans le projet. */
  current: null | { status: ParticipationStatus; hasProjectAccess: boolean; representedOrganizationId: string | null };
}): MandateInvitationRefusal | null {
  const refuse = (error: MandateInvitationRefusalCode, status: 404 | 409 | 422 = 409): MandateInvitationRefusal => ({ status, error, message: MANDATE_INVITATION_MESSAGE[error] });
  const m = input.mandate;
  if (!m || m.projectId !== input.projectId) return refuse("not_found", 404);
  if (m.status !== "actif") return refuse("mandate_inactive");
  if (!input.partyStatus || input.partyStatus === "terminee") return refuse("organization_not_party");
  if (input.organizationStatus !== "active") return refuse("organization_inactive");
  if (input.membershipStatus !== "active") return refuse("membership_inactive");
  const rep = input.representative;
  if (!rep?.userId || rep.accountStatus !== "active") return refuse("representative_without_account");
  if (rep.userId === input.ownerId) return refuse("representative_is_owner", 422);
  const c = input.current;
  if (c) {
    if (c.status === "suspendue") return refuse("participation_suspended");
    if (c.status === "active" && c.hasProjectAccess) return refuse("already_participant");
    if (c.representedOrganizationId && c.representedOrganizationId !== m.organizationId) return refuse("represents_other_organization");
  }
  return null;
}

/** L'invitation d'un représentant reste-t-elle acceptable ? Le mandat doit être encore actif et son organisation partie. */
export function mandateStillValid(input: { mandateStatus: MandateStatus | null; partyStatus: ParticipationStatus | null; organizationStatus: OrganizationStatus | null }): boolean {
  return input.mandateStatus === "actif" && !!input.partyStatus && input.partyStatus !== "terminee" && input.organizationStatus === "active";
}

export interface EndedMandateMark {
  participationId: string;
  mandateId: string;
  endsOn: string | null;
  endReason: string | null;
}

/**
 * Marques « mandat terminé » de l'annuaire : une participation en cours qui représente l'organisation, dont la personne a
 * eu un mandat de cette organisation pour ce projet, maintenant terminé, et n'en a plus aucun d'actif. La participation
 * n'est jamais terminée d'office (règle de la phase 5) : elle est signalée, à revoir par le propriétaire.
 */
export function endedMandateMarks(input: {
  organizationId: string;
  participations: readonly { id: string; personId: string | null; status: ParticipationStatus; representedOrganizationId: string | null }[];
  mandates: readonly { id: string; organizationId: string; personId: string; status: MandateStatus; endsOn: string | null; endReason: string | null; endedAt: Date | null }[];
}): EndedMandateMark[] {
  const marks: EndedMandateMark[] = [];
  for (const p of input.participations) {
    if (p.status === "terminee" || !p.personId || p.representedOrganizationId !== input.organizationId) continue;
    const own = input.mandates.filter((m) => m.organizationId === input.organizationId && m.personId === p.personId);
    if (own.some((m) => m.status === "actif")) continue;
    const ended = own.filter((m) => m.status === "termine").sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0))[0];
    if (ended) marks.push({ participationId: p.id, mandateId: ended.id, endsOn: ended.endsOn, endReason: ended.endReason });
  }
  return marks;
}
