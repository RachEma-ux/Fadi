/**
 * Organisations, participation et revue externe — règles pures de la phase 2 (Issue #262, PLAN.md « Participants et
 * équipe ») : aucune base, aucun réseau, aucun DOM. Testées par `participants.test.ts`.
 *
 * - `deriveAccess` : la décision d'accès dérivée des participations et des rôles par portée (OP-D3 c). Elle décrit
 *   exactement la vue SQL `project_effective_access` (init.sql), seule source lue par le serveur — le test DB-3 compare
 *   les deux sur une base réelle.
 * - Contacts sans compte (OP-D9) : champs, coordonnées visibles des seuls responsables du projet, effacement (sur
 *   demande, ou 2 ans après la clôture de tous les projets où le contact participe — OP-2, réserve juridique déclarée).
 * - Recherche d'existant avant création : aucune fusion automatique, renvoi vers la fiche existante.
 */
import type { ParticipationStatus, ProjectBusinessRole, RoleScopeType, TeamResponsibility } from "../db/schema.js";

export type DerivedRole = "proprietaire" | "editeur" | "lecteur";

export interface DerivedAccess {
  role: DerivedRole;
  canExport: boolean;
  canApprove: boolean;
  canPublish: boolean;
}

export interface AccessInput {
  isOwner: boolean;
  /** La personne de la participation est liée à un compte vérifié (un contact sans compte n'a jamais d'accès). */
  hasAccount: boolean;
  participation: { status: ParticipationStatus; startsOn: string | null; canExport: boolean; accessExpiresAt?: Date | null | undefined } | null;
  roles: readonly { role: ProjectBusinessRole; scopeType: RoleScopeType }[];
  /** Date du jour (AAAA-MM-JJ) : une participation qui n'a pas commencé ne donne rien. */
  today: string;
  /** Instant de la décision (phase 3) : une échéance d'accès passée ne donne plus rien. Par défaut : maintenant. */
  now?: Date | undefined;
}

/**
 * Le propriétaire a tous les droits. Sinon, il faut une participation `active`, commencée, d'une personne liée à un
 * compte, et au moins un rôle métier de portée `projet` : une participation sans rôle de projet (« revue seule » de la
 * phase 4), suspendue, terminée ou un simple contact ne donne rien. Concepteur → modifier (`editeur`) ; Lecteur,
 * Relecteur, Coordinateur, Approbateur, Diffuseur → lire et commenter (`lecteur`) ; Approbateur → approbation Studio ;
 * Diffuseur → diffusion Studio ; export : Concepteur, ou export accordé. Les portées plus étroites (étude, variante,
 * révision, documents) sont enregistrées mais ne donnent encore aucun droit (échec fermé : aucune route ne les évalue).
 */
export function deriveAccess(input: AccessInput): DerivedAccess | null {
  if (input.isOwner) return { role: "proprietaire", canExport: true, canApprove: true, canPublish: true };
  const p = input.participation;
  if (!input.hasAccount || !p || p.status !== "active") return null;
  if (p.startsOn && p.startsOn > input.today) return null;
  // Phase 3 : l'échéance d'accès recopiée de l'invitation acceptée (indépendante de celle de l'invitation).
  if (p.accessExpiresAt && p.accessExpiresAt.getTime() <= (input.now ?? new Date()).getTime()) return null;
  const roles = new Set(input.roles.filter((r) => r.scopeType === "projet").map((r) => r.role));
  if (!roles.size) return null;
  const designer = roles.has("concepteur");
  return { role: designer ? "editeur" : "lecteur", canExport: designer || p.canExport, canApprove: roles.has("approbateur"), canPublish: roles.has("diffuseur") };
}

/** Capacités lisibles par l'interface : ce que chaque rôle métier de portée projet donne (concept, partie 2). */
export const ROLE_CAPABILITIES: Readonly<Record<ProjectBusinessRole, readonly string[]>> = Object.freeze({
  lecteur: ["lire", "commenter"],
  concepteur: ["lire", "commenter", "modifier", "exporter"],
  relecteur: ["lire", "commenter", "constater"],
  coordinateur: ["lire", "commenter", "coordonner"],
  approbateur: ["lire", "commenter", "approuver"],
  diffuseur: ["lire", "commenter", "diffuser"],
});

// ---------------------------------------------------------------------------
// Contacts sans compte (OP-D9).

export const CONTACT_LIMITS = { name: 200, jobTitle: 200, email: 254, phone: 40, businessRole: 200, organization: 200 } as const;
/** Nom d'un contact effacé (donnée du projet : jamais traduite en base ; l'interface l'affiche selon `erasedAt`). */
export const ERASED_CONTACT_NAME = "Contact effacé";
/** OP-2 : un contact sans compte est effacé 2 ans après la clôture du dernier projet où il participe. */
export const CONTACT_RETENTION_YEARS = 2;

export interface ContactDraft {
  displayName?: string | null | undefined;
  jobTitle?: string | null | undefined;
  workEmail?: string | null | undefined;
  workPhone?: string | null | undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+().\-\s]{3,40}$/;

/** Motifs de refus d'un contact : nom requis, adresse et téléphone professionnels bien formés s'ils sont donnés. */
export function contactProblems(c: ContactDraft, { requireName = true } = {}): string[] {
  const problems: string[] = [];
  const name = (c.displayName ?? "").trim();
  if (requireName && !name) problems.push("nom : requis pour un contact sans compte");
  if (name.length > CONTACT_LIMITS.name) problems.push("nom : 200 caractères au plus");
  if ((c.jobTitle ?? "").trim().length > CONTACT_LIMITS.jobTitle) problems.push("fonction : 200 caractères au plus");
  const email = (c.workEmail ?? "").trim();
  if (email && (email.length > CONTACT_LIMITS.email || !EMAIL.test(email))) problems.push("e-mail professionnel : adresse invalide");
  const phone = (c.workPhone ?? "").trim();
  if (phone && !PHONE.test(phone)) problems.push("téléphone professionnel : chiffres, espaces et + ( ) . - seulement");
  return problems;
}

/** Comparaison des noms pour la recherche d'existant : casse, accents et espaces ignorés. Jamais une fusion. */
export function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Coordonnées par audience (OP-D9) : adresse et téléphone professionnels pour les seuls responsables du projet. */
export function contactDetailsFor<T extends { workEmail: string | null; workPhone: string | null }>(person: T, responsible: boolean): T {
  return responsible ? person : { ...person, workEmail: null, workPhone: null };
}

/**
 * Effacement automatique dû (OP-2) : contact sans compte, pas encore effacé, et soit sans aucune participation (projet
 * supprimé), soit dont TOUS les projets sont clos depuis au moins 2 ans. Un seul projet ouvert le conserve.
 */
export function contactRetentionDue(input: { hasAccount: boolean; erasedAt: Date | null; projectsClosedAt: readonly (Date | null)[] }, now: Date): boolean {
  if (input.hasAccount || input.erasedAt) return false;
  if (!input.projectsClosedAt.length) return true;
  if (input.projectsClosedAt.some((d) => d === null)) return false;
  const last = Math.max(...input.projectsClosedAt.map((d) => d!.getTime()));
  const due = new Date(last);
  due.setUTCFullYear(due.getUTCFullYear() + CONTACT_RETENTION_YEARS);
  return due.getTime() <= now.getTime();
}

// ---------------------------------------------------------------------------
// Statuts et impact d'une suspension ou d'une fin (concept, partie 3 « Delegate responsibility and end participation »).

export type StatusChange = "suspendre" | "reactiver" | "terminer";
export const STATUS_TARGET: Readonly<Record<StatusChange, ParticipationStatus>> = Object.freeze({ suspendre: "suspendue", reactiver: "active", terminer: "terminee" });

/**
 * Refus d'un changement de statut demandé par l'API (au-delà de la machine d'états `canTransition`) : le propriétaire
 * reste participant (transférer d'abord la propriété) ; un contact ne devient actif que par un accès (partage ou
 * invitation acceptée), jamais par « réactiver ».
 */
export function statusChangeRefusal(change: StatusChange, p: { status: ParticipationStatus; isOwner: boolean }): string | null {
  if (p.isOwner) return "Le propriétaire du projet ne peut être suspendu ni retiré : transférez d'abord la propriété.";
  if (change === "reactiver" && p.status !== "suspendue") return "Seule une participation suspendue se réactive ; un contact reçoit un accès par le partage ou une invitation acceptée.";
  if (change === "suspendre" && p.status !== "active") return "Seule une participation active se suspend.";
  if (change === "terminer" && p.status === "terminee") return "Cette participation est déjà terminée.";
  return null;
}

export interface ImpactInput {
  change: StatusChange;
  access: DerivedAccess | null;
  roles: readonly { role: ProjectBusinessRole; scopeType: RoleScopeType; scopeId: string | null; origin: "acces" | "attribution" }[];
  pendingInvitations: number;
  openObservations: number;
  openTasks: number;
  holdsEditingLock: boolean;
  responsibilities: readonly TeamResponsibility[];
}

export interface Impact {
  change: StatusChange;
  /** L'accès cesse (suspendre, terminer) ou revient (réactiver) à la requête suivante. */
  accessWithdrawn: boolean;
  accessRestored: boolean;
  access: DerivedAccess | null;
  roles: ImpactInput["roles"];
  pendingInvitations: number;
  /** Invitations en attente annulées par la fin de participation (un lien accepté rendrait l'accès retiré). */
  invitationsCancelled: number;
  openObservations: number;
  openTasks: number;
  editingLockReleased: boolean;
  responsibilities: readonly TeamResponsibility[];
  /** Les rôles attribués d'une participation terminée restent dans son historique ; un retour ne les restaure pas. */
  rolesKeptAsHistory: boolean;
}

/** Aperçu de l'impact avant confirmation : droits, invitations, travaux affectés et responsabilités administratives. */
export function participationImpact(i: ImpactInput): Impact {
  const ending = i.change === "terminer";
  const withdrawing = i.change !== "reactiver";
  return {
    change: i.change,
    accessWithdrawn: withdrawing && i.access !== null,
    accessRestored: i.change === "reactiver",
    access: i.access,
    roles: i.roles,
    pendingInvitations: i.pendingInvitations,
    invitationsCancelled: ending ? i.pendingInvitations : 0,
    openObservations: i.openObservations,
    openTasks: i.openTasks,
    editingLockReleased: withdrawing && i.holdsEditingLock,
    responsibilities: i.responsibilities,
    rolesKeptAsHistory: ending && i.roles.some((r) => r.origin === "attribution"),
  };
}

/** Rôle par portée attribuable : jamais au propriétaire ni sans compte lié (un contact ou une organisation n'agit pas). */
export function roleAssignmentRefusal(p: { isOwner: boolean; hasAccount: boolean; isOrganization: boolean; status: ParticipationStatus }): string | null {
  if (p.status === "terminee") return "Participation terminée : son historique est figé ; ouvrez une nouvelle participation.";
  if (p.isOwner) return "Le propriétaire du projet a déjà tous les droits.";
  if (p.isOrganization) return "Une organisation agit par ses représentants : attribuez le rôle à une personne.";
  if (!p.hasAccount) return "Contact sans compte : aucun rôle tant qu'il n'a pas accepté une invitation (aucune invitation implicite).";
  return null;
}
