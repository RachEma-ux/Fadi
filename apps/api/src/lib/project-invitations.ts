/**
 * Invitations de projet liées à une participation — règles pures de la phase 3 (Issue #262, PLAN.md « Invitations
 * acceptées liées à une participation », OP-D2 a). Aucune base, aucun réseau, aucun DOM ; testées par
 * `project-invitations.test.ts`.
 *
 * - Rôles proposés par portée : au moins un rôle de portée `projet` (sans lui, l'acceptation ne donnerait rien — la
 *   participation sans rôle de projet n'ouvre pas le projet) ; l'ancienne forme `{ role: lecteur | editeur }` reste acceptée
 *   (Lecteur, Concepteur).
 * - Accès de base porté par le pont `project_members` (lecteur / éditeur), rôles complémentaires d'origine
 *   `attribution` : leur somme décrit exactement l'accès que `deriveAccess` (donc la vue) donnera à l'acceptation.
 * - Échéances indépendantes : celle de l'invitation (1 à 30 jours) et celle de l'accès (facultative, future).
 */
import type { ProjectBusinessRole, ProposedRole, RoleScopeType } from "../db/schema.js";
import { ACCESS_ROLE_MIRROR, roleAssignmentProblems } from "./participations.js";
import { deriveAccess, type DerivedAccess } from "./participants.js";

export const INVITATION_DAYS = { min: 1, max: 30, default: 7 } as const;
export const MAX_PROPOSED_ROLES = 12;
const DAY_MS = 24 * 3600 * 1000;

export interface RoleDraft { role: string; scopeType?: string | null | undefined; scopeId?: string | null | undefined }

/**
 * Rôles proposés, normalisés (portée projet par défaut, sans doublon) et leurs motifs de refus. `legacyRole` est la
 * forme historique du partage (`lecteur` → Lecteur, `editeur` → Concepteur, portée projet), utilisée sans `roles`.
 */
export function proposedRolesFrom(input: { roles?: readonly RoleDraft[] | undefined; legacyRole?: "lecteur" | "editeur" | undefined }): { roles: ProposedRole[]; problems: string[] } {
  const drafts: RoleDraft[] = input.roles?.length ? [...input.roles] : input.legacyRole ? [{ role: ACCESS_ROLE_MIRROR[input.legacyRole]!, scopeType: "projet" }] : [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const roles: ProposedRole[] = [];
  if (drafts.length > MAX_PROPOSED_ROLES) problems.push(`rôles : ${MAX_PROPOSED_ROLES} au plus`);
  for (const d of drafts.slice(0, MAX_PROPOSED_ROLES)) {
    const scopeType = (d.scopeType ?? "projet") || "projet";
    const scopeId = scopeType === "projet" ? null : (d.scopeId ?? "").trim() || null;
    const p = roleAssignmentProblems({ role: d.role, scopeType, scopeId });
    if (p.length) { problems.push(...p); continue; }
    const key = `${d.role}|${scopeType}|${scopeId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    roles.push({ role: d.role as ProjectBusinessRole, scopeType: scopeType as RoleScopeType, scopeId });
  }
  if (!drafts.length) problems.push("rôles : au moins un rôle proposé");
  else if (!roles.some((r) => r.scopeType === "projet")) problems.push("rôles : au moins un rôle de portée projet (sans lui, une participation n’ouvre pas le projet)");
  return { roles, problems };
}

/** Les rôles proposés sont-ils encore attribuables (revalidation à l'acceptation) ? */
export function proposedRolesValid(roles: readonly ProposedRole[] | null | undefined): boolean {
  if (!roles?.length) return false;
  return roles.every((r) => roleAssignmentProblems(r).length === 0) && roles.some((r) => r.scopeType === "projet");
}

/** Accès de base porté par le pont du partage : `editeur` si Concepteur à la portée projet, sinon `lecteur`. */
export function projectRoleFor(roles: readonly ProposedRole[]): "lecteur" | "editeur" {
  return roles.some((r) => r.role === "concepteur" && r.scopeType === "projet") ? "editeur" : "lecteur";
}

/** Rôles à poser avec l'origine `attribution` : tous sauf celui que le pont pose déjà (origine `acces`). */
export function rolesToAttribute(roles: readonly ProposedRole[], baseRole: "lecteur" | "editeur"): ProposedRole[] {
  const mirror = ACCESS_ROLE_MIRROR[baseRole];
  return roles.filter((r) => !(r.scopeType === "projet" && r.role === mirror));
}

/**
 * Compte déjà membre : l'envoi ne change que son rôle de partage (Lecteur ou Concepteur à la portée projet). Des rôles
 * complémentaires ou une échéance d'accès ne seraient pas appliqués : refus explicite plutôt qu'un aperçu trompeur
 * (les rôles s'attribuent depuis « Équipe et participants », l'échéance depuis la ligne du membre).
 */
export function memberChangeProblem(roles: readonly ProposedRole[], accessExpiresAt: Date | null): string | null {
  const extra = rolesToAttribute(roles, projectRoleFor(roles));
  if (!extra.length && !accessExpiresAt) return null;
  return "Ce compte a déjà accès au projet : seul son rôle de partage (Lecteur ou Concepteur) se change ici. Attribuez les autres rôles depuis « Équipe et participants » et l’échéance d’accès depuis la ligne du membre.";
}

/** Rôles de portée étroite : enregistrés et affichés, sans droit (phase 2, échec fermé). */
export const narrowScopes = (roles: readonly ProposedRole[]): ProposedRole[] => roles.filter((r) => r.scopeType !== "projet");

/** Accès que l'acceptation donnera (rôles proposés + rôle du pont), décrit par la même règle que la vue. */
export function resultingAccess(roles: readonly ProposedRole[], opts: { canExport?: boolean; accessExpiresAt?: Date | null; now?: Date } = {}): DerivedAccess | null {
  const now = opts.now ?? new Date();
  const base = projectRoleFor(roles);
  const all = [...roles, { role: ACCESS_ROLE_MIRROR[base]!, scopeType: "projet" as const, scopeId: null }];
  return deriveAccess({
    isOwner: false, hasAccount: true,
    participation: { status: "active", startsOn: null, canExport: base === "lecteur" && (opts.canExport ?? false), accessExpiresAt: opts.accessExpiresAt ?? null },
    roles: all, today: now.toISOString().slice(0, 10), now,
  });
}

/** Échéance de l'invitation : `days` jours (1 à 30, 7 par défaut) après `now`. */
export function invitationExpiry(now: Date, days?: number | null): Date {
  const d = Math.round(days ?? INVITATION_DAYS.default);
  const bounded = Math.min(INVITATION_DAYS.max, Math.max(INVITATION_DAYS.min, Number.isFinite(d) ? d : INVITATION_DAYS.default));
  return new Date(now.getTime() + bounded * DAY_MS);
}

/**
 * Échéance d'accès lue d'une saisie : date seule (AAAA-MM-JJ, l'accès court jusqu'à la fin de cette journée UTC) ou
 * date-heure ISO. Refusée si illisible ou déjà passée. Elle est indépendante de l'échéance de l'invitation : un accès
 * qui expire avant l'échéance de l'invitation est permis, l'aperçu le signale.
 */
export function parseAccessExpiry(raw: string | null | undefined, now: Date): { value: Date | null; problem: string | null } {
  if (raw === null || raw === undefined || raw === "") return { value: null, problem: null };
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59.999Z`) : new Date(raw);
  if (Number.isNaN(value.getTime())) return { value: null, problem: "échéance d'accès : date illisible" };
  if (value.getTime() <= now.getTime()) return { value: null, problem: "échéance d'accès : la date est déjà passée" };
  return { value, problem: null };
}

export type InvitationTarget =
  | { kind: "membre"; participationId: string | null }
  | { kind: "participation"; participationId: string; status: "contact" | "active" }
  | { kind: "nouvelle-fiche" };

/**
 * Refus à l'envoi selon la participation trouvée pour cette adresse dans le projet : une participation suspendue se
 * réactive depuis « Équipe et participants » (une invitation ne la réactiverait pas) ; une fiche choisie dans l'annuaire
 * doit être un contact du projet, non lié à un autre compte que celui de l'adresse.
 */
export function targetRefusal(p: { status: "contact" | "active" | "suspendue" | "terminee"; personUserId: string | null; accountId: string | null; isOrganization: boolean }): string | null {
  if (p.isOrganization) return "Une organisation agit par ses représentants : invitez une personne.";
  if (p.status === "terminee") return "Cette participation est terminée : ouvrez une nouvelle participation avant d'inviter.";
  if (p.status === "suspendue") return "Cette participation est suspendue : réactivez-la depuis « Équipe et participants » (une invitation ne la réactive pas).";
  if (p.personUserId && p.personUserId !== p.accountId) return "Cette fiche est liée à un autre compte que celui de cette adresse.";
  return null;
}

export interface InvitationPreview {
  email: string;
  accountExists: boolean;
  target: InvitationTarget;
  /** Une invitation déjà en attente pour cette adresse : elle sera renvoyée (même invitation, nouveau lien), sans doublon. */
  pendingInvitation: { id: string; expiresAt: string } | null;
  roles: ProposedRole[];
  baseRole: "lecteur" | "editeur";
  access: DerivedAccess | null;
  narrowScopes: ProposedRole[];
  invitationExpiresAt: string;
  accessExpiresAt: string | null;
  /** Remarques sans blocage (accès expirant avant l'invitation, portées sans droit). */
  warnings: string[];
  /** Motif bloquant (rien ne sera envoyé) ; null si l'envoi est possible. */
  blocking: string | null;
}

/** Remarques de l'aperçu, sans blocage. */
export function previewWarnings(i: { roles: readonly ProposedRole[]; invitationExpiresAt: Date; accessExpiresAt: Date | null; target: InvitationTarget }): string[] {
  const w: string[] = [];
  if (i.target.kind === "membre") w.push("Ce compte a déjà accès au projet : son rôle sera changé directement, sans invitation.");
  if (i.accessExpiresAt && i.accessExpiresAt.getTime() < i.invitationExpiresAt.getTime()) w.push("L'accès expire avant l'invitation : une acceptation tardive serait refusée.");
  if (narrowScopes(i.roles).length) w.push("Les rôles de portée étude, variante, révision ou documents ne valent que pour l’élément désigné, pas pour le projet entier.");
  return w;
}
