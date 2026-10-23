/**
 * Organisations, participation et revue externe — règles pures de la phase 1 (Issue #262, PLAN.md).
 *
 * Une participation lie une personne (compte vérifié ou contact sans compte) OU une organisation à un projet, pour une
 * période ; l'annuaire des participants et l'équipe en sont deux vues (concept, partie 1). Les rôles métier par portée
 * (OP-D3 c) reprennent les six rôles du concept (partie 2). Jusqu'à la phase 2, l'accès reste porté par
 * `projects.owner_id` et `project_members` : `ACCESS_ROLE_MIRROR` décrit le miroir tenu par les déclencheurs SQL
 * (`op_sync_access`, init.sql) — les deux doivent rester identiques (test).
 */
import type { ParticipationStatus, ProjectBusinessRole, RoleScopeType, TeamResponsibility } from "../db/schema.js";

export const BUSINESS_ROLES: readonly ProjectBusinessRole[] = ["lecteur", "concepteur", "relecteur", "coordinateur", "approbateur", "diffuseur"];
export const ROLE_SCOPES: readonly RoleScopeType[] = ["projet", "etude", "variante", "revision", "documents"];
/** Le concept : qui dirige, produit, coordonne, vérifie, approuve et diffuse. */
export const TEAM_RESPONSIBILITIES: readonly TeamResponsibility[] = ["diriger", "produire", "coordonner", "verifier", "approuver", "diffuser"];
export const PARTICIPATION_STATUSES: readonly ParticipationStatus[] = ["contact", "active", "suspendue", "terminee"];

/** Accès actuel → rôle métier miroir (portée projet, origine `acces`) ; le propriétaire n'a pas de rôle miroir. */
export const ACCESS_ROLE_MIRROR: Readonly<Record<"proprietaire" | "editeur" | "lecteur", ProjectBusinessRole | null>> = {
  proprietaire: null,
  editeur: "concepteur",
  lecteur: "lecteur",
};

/**
 * Transitions permises. Une participation terminée ne revit pas : un retour ouvre une nouvelle participation (nouvelle
 * période, anciens droits réévalués, jamais restaurés d'office — concept, partie 3).
 */
const TRANSITIONS: Readonly<Record<ParticipationStatus, readonly ParticipationStatus[]>> = {
  contact: ["active", "terminee"],
  active: ["suspendue", "terminee"],
  suspendue: ["active", "terminee"],
  terminee: [],
};

export function canTransition(from: ParticipationStatus, to: ParticipationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface ParticipationDraft {
  personId?: string | null;
  organizationId?: string | null;
  status: ParticipationStatus;
  responsibilities?: readonly string[];
  startsOn?: string | null;
  endsOn?: string | null;
}

/** Motifs de refus d'une participation, les mêmes que les contraintes SQL (`project_participations_*_check`). */
export function participationProblems(p: ParticipationDraft): string[] {
  const problems: string[] = [];
  if (!p.personId === !p.organizationId) problems.push("partie : une personne ou une organisation, exactement une");
  if (!PARTICIPATION_STATUSES.includes(p.status)) problems.push(`statut inconnu : ${p.status}`);
  for (const r of p.responsibilities ?? []) {
    if (!(TEAM_RESPONSIBILITIES as readonly string[]).includes(r)) problems.push(`responsabilité inconnue : ${r}`);
  }
  if (p.startsOn && p.endsOn && p.endsOn < p.startsOn) problems.push("période : la fin précède le début");
  if ((p.status === "terminee") !== Boolean(p.endsOn)) problems.push("une participation terminée, et elle seule, a une date de fin");
  return problems;
}

export interface RoleAssignmentDraft {
  role: string;
  scopeType: string;
  scopeId?: string | null;
}

/** Motifs de refus d'un rôle par portée : rôle et portée connus, identifiant exigé hors de la portée projet. */
export function roleAssignmentProblems(a: RoleAssignmentDraft): string[] {
  const problems: string[] = [];
  if (!(BUSINESS_ROLES as readonly string[]).includes(a.role)) problems.push(`rôle inconnu : ${a.role}`);
  if (!(ROLE_SCOPES as readonly string[]).includes(a.scopeType)) problems.push(`portée inconnue : ${a.scopeType}`);
  if ((a.scopeType === "projet") !== !a.scopeId) problems.push("portée : un identifiant pour une étude, une variante, une révision ou des documents ; aucun pour le projet");
  return problems;
}

/** Une personne contact sans compte doit porter un nom ; un compte garde l'identité de son compte. */
export function personProblems(p: { userId?: string | null; displayName?: string | null }): string[] {
  return p.userId || (p.displayName ?? "").trim() ? [] : ["contact sans compte : un nom est requis"];
}
