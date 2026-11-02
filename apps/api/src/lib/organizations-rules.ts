/**
 * Organisations — règles pures de la phase 5 (Issue #262, concept partie 5 ; aucune base, testables sans PostgreSQL).
 *
 * - Une adhésion (organisation × personne liée à un compte vérifié) porte un rôle d'organisation (administrateur /
 *   membre), une fonction déclarée en saisie libre (OP-D4 b), une période et un statut (active, suspendue, terminée).
 *   Elle ne donne AUCUN droit de projet : membership ≠ participation (concept parties 1 et 5).
 * - Un groupe sert à sélectionner des personnes ; il n'ouvre rien.
 * - Administration déléguée : seuls les administrateurs ACTIFS d'une organisation ACTIVE la gèrent ; le rôle
 *   d'administrateur de la plateforme n'y donne rien (même logique que D-2).
 * - Gabarit : versions immuables ; appliquer une version à un projet ajoute des fiches « contact » (aucun accès) et ne
 *   modifie jamais une participation existante.
 * - Mandat de représentation : proposé par un administrateur, accepté par le représentant lui-même ; un remplacement est
 *   un nouveau mandat accepté, jamais une substitution d'office.
 */
import type { MandateStatus, MembershipStatus, OrganizationRole, OrganizationStatus, ProjectBusinessRole, TeamResponsibility } from "../db/schema.js";
import { BUSINESS_ROLES, TEAM_RESPONSIBILITIES } from "./participations.js";

export const ORGANIZATION_ROLES: readonly OrganizationRole[] = ["administrateur", "membre"];
export const ORGANIZATION_STATUSES: readonly OrganizationStatus[] = ["active", "suspendue", "close"];
export const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ["active", "suspendue", "terminee"];
export const MANDATE_STATUSES: readonly MandateStatus[] = ["propose", "actif", "refuse", "annule", "termine"];

const MEMBERSHIP_TRANSITIONS: Readonly<Record<MembershipStatus, readonly MembershipStatus[]>> = {
  active: ["suspendue", "terminee"],
  suspendue: ["active", "terminee"],
  // Un départ est définitif : un retour ouvre une nouvelle adhésion (nouvelle période, concept partie 3).
  terminee: [],
};
export const canMembershipTransition = (from: MembershipStatus, to: MembershipStatus) => MEMBERSHIP_TRANSITIONS[from].includes(to);

const ORGANIZATION_TRANSITIONS: Readonly<Record<OrganizationStatus, readonly OrganizationStatus[]>> = {
  active: ["suspendue", "close"],
  suspendue: ["active", "close"],
  // La clôture termine les adhésions et les mandats : elle est définitive (déclencheur SQL `op_org_status_change`).
  close: [],
};
export const canOrganizationTransition = (from: OrganizationStatus, to: OrganizationStatus) => ORGANIZATION_TRANSITIONS[from].includes(to);

const MANDATE_TRANSITIONS: Readonly<Record<MandateStatus, readonly MandateStatus[]>> = {
  propose: ["actif", "refuse", "annule"],
  actif: ["termine"],
  refuse: [],
  annule: [],
  termine: [],
};
export const canMandateTransition = (from: MandateStatus, to: MandateStatus) => MANDATE_TRANSITIONS[from].includes(to);

/** Ce que la personne connectée peut faire dans l'organisation, d'après SA seule adhésion (jamais son rôle plateforme). */
export interface OrganizationCapabilities {
  /** Fiche résumée (nom, statut, sa propre période) : toute adhésion, même terminée. */
  summary: boolean;
  /** Annuaire interne, groupes, gabarits, projets : adhésion active. */
  read: boolean;
  /** Adhésions, groupes, gabarits, invitations, mandats : administrateur actif d'une organisation active. */
  manage: boolean;
  /** Suspendre, réactiver ou clore l'organisation : administrateur actif, organisation active ou suspendue. */
  changeStatus: boolean;
  /** Motif de refus d'une gestion, quand `manage` est faux alors que l'adhésion existe. */
  refusal: OrganizationRefusal | null;
}

export type OrganizationRefusal = "not_member" | "membership_suspended" | "membership_ended" | "not_admin" | "organization_suspended" | "organization_closed";

export const ORGANIZATION_REFUSAL_MESSAGE: Record<OrganizationRefusal, string> = {
  not_member: "Vous n’êtes pas membre de cette organisation.",
  membership_suspended: "Votre adhésion à cette organisation est suspendue.",
  membership_ended: "Votre adhésion à cette organisation a pris fin.",
  not_admin: "Réservé aux administrateurs de l’organisation.",
  organization_suspended: "Organisation suspendue : seules la réactivation et la clôture restent possibles.",
  organization_closed: "Organisation close : plus aucune opération n’est possible.",
};

export function organizationCapabilities(
  org: { status: OrganizationStatus },
  membership: { role: OrganizationRole; status: MembershipStatus } | null,
): OrganizationCapabilities {
  const none = (refusal: OrganizationRefusal, summary = false): OrganizationCapabilities => ({ summary, read: false, manage: false, changeStatus: false, refusal });
  if (!membership) return none("not_member");
  if (membership.status === "terminee") return none(org.status === "close" ? "organization_closed" : "membership_ended", true);
  if (membership.status === "suspendue") return none("membership_suspended", true);
  const admin = membership.role === "administrateur";
  if (org.status === "close") return none("organization_closed", true);
  if (org.status === "suspendue") return { summary: true, read: true, manage: false, changeStatus: admin, refusal: admin ? "organization_suspended" : "not_admin" };
  return { summary: true, read: true, manage: admin, changeStatus: admin, refusal: admin ? null : "not_admin" };
}

/**
 * Garde du dernier administrateur : retirer le rôle, suspendre ou terminer l'adhésion du dernier administrateur actif
 * laisserait l'organisation sans continuité administrative (concept partie 2) — refusé ; la clôture reste possible.
 */
export function removesLastOrganizationAdmin(activeAdminMembershipIds: readonly string[], targetMembershipId: string): boolean {
  return activeAdminMembershipIds.includes(targetMembershipId) && activeAdminMembershipIds.length <= 1;
}

// --- Gabarits -----------------------------------------------------------------------------------------------------

/** Une ligne d'équipe proposée par un gabarit : intitulé et rôle métier en saisie libre (OP-D4 b). */
export interface TemplateEntry {
  label: string;
  businessRole?: string | null;
  responsibilities: TeamResponsibility[];
  /** Rôles proposés, portée projet : affichés à l'application, JAMAIS accordés par elle (accès explicites). */
  proposedRoles: ProjectBusinessRole[];
  /** Groupe de l'organisation où choisir la personne (aide à la sélection, aucun droit). */
  groupId?: string | null;
}

export const TEMPLATE_MAX_ENTRIES = 50;

export function templateEntriesProblems(entries: unknown): string[] {
  if (!Array.isArray(entries)) return ["lignes : une liste est attendue"];
  const problems: string[] = [];
  if (entries.length === 0) problems.push("lignes : au moins une ligne d’équipe");
  if (entries.length > TEMPLATE_MAX_ENTRIES) problems.push(`lignes : ${TEMPLATE_MAX_ENTRIES} au plus`);
  entries.forEach((raw, i) => {
    const e = raw as Partial<TemplateEntry> | null;
    const n = i + 1;
    if (!e || typeof e !== "object") { problems.push(`ligne ${n} : objet attendu`); return; }
    if (typeof e.label !== "string" || !e.label.trim() || e.label.length > 120) problems.push(`ligne ${n} : intitulé requis (120 caractères au plus)`);
    if (e.businessRole != null && (typeof e.businessRole !== "string" || e.businessRole.length > 120)) problems.push(`ligne ${n} : rôle métier de 120 caractères au plus`);
    if (!Array.isArray(e.responsibilities) || e.responsibilities.some((r) => !(TEAM_RESPONSIBILITIES as readonly string[]).includes(r))) problems.push(`ligne ${n} : responsabilités inconnues`);
    else if (new Set(e.responsibilities).size !== e.responsibilities.length) problems.push(`ligne ${n} : responsabilité en double`);
    if (!Array.isArray(e.proposedRoles) || e.proposedRoles.some((r) => !(BUSINESS_ROLES as readonly string[]).includes(r))) problems.push(`ligne ${n} : rôles proposés inconnus`);
    if (e.groupId != null && typeof e.groupId !== "string") problems.push(`ligne ${n} : groupe invalide`);
  });
  return problems;
}

/** Normalise une ligne validée (intitulés rognés, listes sans doublon, champs absents à null). */
export function normalizeTemplateEntry(e: TemplateEntry): TemplateEntry {
  return {
    label: e.label.trim(),
    businessRole: e.businessRole?.trim() || null,
    responsibilities: [...new Set(e.responsibilities)],
    proposedRoles: [...new Set(e.proposedRoles)],
    groupId: e.groupId || null,
  };
}

export type ApplicationOutcome = "creer" | "deja-present" | "non-attribue" | "non-eligible";

export interface ApplicationLine {
  index: number;
  label: string;
  personId: string | null;
  outcome: ApplicationOutcome;
  businessRole: string | null;
  responsibilities: TeamResponsibility[];
  /** Rôles proposés : à accorder explicitement par le projet (invitation, affectation) ; jamais accordés ici. */
  proposedRoles: ProjectBusinessRole[];
}

/**
 * Plan d'application d'une version de gabarit à un projet (aperçu, puis confirmation) :
 * - une ligne sans personne choisie est ignorée (« non attribuée ») — une personne nommée est toujours choisie ;
 * - une personne qui n'est pas membre actif de l'organisation est refusée (« non éligible ») ;
 * - une personne déjà participante (participation non terminée) est laissée telle quelle (« déjà présente ») : aucune
 *   application ne modifie une participation existante ;
 * - sinon une fiche contact est créée (aucun accès).
 * Une même personne choisie pour deux lignes n'est créée qu'une fois (la première ligne ; les suivantes « déjà présente »).
 */
export function planTemplateApplication(
  entries: readonly TemplateEntry[],
  assignments: Readonly<Record<string, string | null | undefined>>,
  eligiblePersonIds: ReadonlySet<string>,
  currentParticipantPersonIds: ReadonlySet<string>,
): ApplicationLine[] {
  const created = new Set<string>();
  return entries.map((e, index) => {
    const personId = assignments[String(index)] || null;
    let outcome: ApplicationOutcome;
    if (!personId) outcome = "non-attribue";
    else if (!eligiblePersonIds.has(personId)) outcome = "non-eligible";
    else if (currentParticipantPersonIds.has(personId) || created.has(personId)) outcome = "deja-present";
    else { outcome = "creer"; created.add(personId); }
    return { index, label: e.label, personId, outcome, businessRole: e.businessRole ?? null, responsibilities: [...e.responsibilities], proposedRoles: [...e.proposedRoles] };
  });
}

// --- Mandats ------------------------------------------------------------------------------------------------------

export type MandateRefusal = "not_found" | "not_pending" | "not_representative" | "membership_inactive" | "organization_inactive" | "participation_ended" | "replaced_changed";

export const MANDATE_REFUSAL_MESSAGE: Record<MandateRefusal, string> = {
  not_found: "Mandat introuvable.",
  not_pending: "Ce mandat n’est plus en attente de réponse.",
  not_representative: "Seul le représentant proposé peut répondre à ce mandat.",
  membership_inactive: "L’adhésion du représentant n’est plus active : le mandat ne peut pas être accepté.",
  organization_inactive: "L’organisation n’est plus active : le mandat ne peut pas être accepté.",
  participation_ended: "L’organisation n’est plus partie à ce projet : le mandat ne peut pas être accepté.",
  replaced_changed: "Le mandat à remplacer a changé depuis la proposition : un administrateur doit proposer à nouveau.",
};

/**
 * Le représentant peut-il accepter ce mandat, maintenant ? Revalidation à l'acceptation (concept v2.2 : « recheck
 * current authority ») : adhésion active, organisation active, participation de l'organisation non terminée, et le
 * mandat remplacé toujours actif s'il y en a un.
 */
export function mandateAcceptRefusal(input: {
  mandate: { status: MandateStatus; personId: string } | null;
  viewerPersonId: string | null;
  membershipStatus: MembershipStatus | null;
  organizationStatus: OrganizationStatus | null;
  participationStatus: string | null;
  replaced: { status: MandateStatus } | null | undefined;
}): MandateRefusal | null {
  const { mandate } = input;
  if (!mandate) return "not_found";
  if (!input.viewerPersonId || input.viewerPersonId !== mandate.personId) return "not_representative";
  if (mandate.status !== "propose") return "not_pending";
  if (input.membershipStatus !== "active") return "membership_inactive";
  if (input.organizationStatus !== "active") return "organization_inactive";
  if (!input.participationStatus || input.participationStatus === "terminee") return "participation_ended";
  if (input.replaced !== undefined && input.replaced !== null && input.replaced.status !== "actif") return "replaced_changed";
  return null;
}

/**
 * Responsabilités proposées pour un mandat : celles fournies, sinon celles du mandat remplacé (un remplaçant reprend
 * les responsabilités par un mandat explicite, concept partie 5) — jamais les décisions déjà enregistrées.
 */
export function mandateResponsibilities(given: readonly TeamResponsibility[] | undefined, replaced: { responsibilities: readonly TeamResponsibility[] } | null): TeamResponsibility[] {
  return [...new Set(given ?? replaced?.responsibilities ?? [])];
}

// --- Invitations d'adhésion ---------------------------------------------------------------------------------------

/** L'invitant est-il encore habilité ? Administrateur actif d'une organisation active (revalidé à l'acceptation). */
export function organizationInviterAuthorized(
  org: { status: OrganizationStatus } | null,
  inviterMembership: { role: OrganizationRole; status: MembershipStatus } | null,
  inviterAccount: { status: string; deletionRequested: boolean } | null,
): boolean {
  if (!org || !inviterAccount || inviterAccount.status !== "active" || inviterAccount.deletionRequested) return false;
  return organizationCapabilities(org, inviterMembership).manage;
}
