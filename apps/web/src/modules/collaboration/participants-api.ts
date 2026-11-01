/**
 * Participants et équipe (Issue #262, phase 2) — client des routes `/projects/:projectId/participants` (apps/api,
 * `routes/participants.ts`). Le serveur vérifie chaque droit ; l'interface ne fait qu'afficher ce qu'il renvoie.
 */
import { request } from "../../lib/api";

export type ParticipationStatus = "contact" | "active" | "suspendue" | "terminee";
export type BusinessRole = "lecteur" | "concepteur" | "relecteur" | "coordinateur" | "approbateur" | "diffuseur";
export type RoleScope = "projet" | "etude" | "variante" | "revision" | "documents";
export type Responsibility = "diriger" | "produire" | "coordonner" | "verifier" | "approuver" | "diffuser";
export type StatusChange = "suspendre" | "reactiver" | "terminer";

export const BUSINESS_ROLES: readonly BusinessRole[] = ["lecteur", "concepteur", "relecteur", "coordinateur", "approbateur", "diffuseur"];
export const ROLE_SCOPES: readonly RoleScope[] = ["projet", "etude", "variante", "revision", "documents"];
export const RESPONSIBILITIES: readonly Responsibility[] = ["diriger", "produire", "coordonner", "verifier", "approuver", "diffuser"];
/** Libellés des rôles métier et des portées (phase 3 : formulaire d'invitation, invitations reçues). */
export const BUSINESS_ROLE_LABEL: Readonly<Record<BusinessRole, string>> = { lecteur: "Lecteur", concepteur: "Concepteur", relecteur: "Relecteur", coordinateur: "Coordinateur", approbateur: "Approbateur", diffuseur: "Diffuseur" };
export const SCOPE_LABEL: Readonly<Record<RoleScope, string>> = { projet: "Projet", etude: "Étude", variante: "Variante", revision: "Révision", documents: "Documents" };
/** « Lecteur · Approbateur — Étude : E-1 » : rôles proposés lisibles (séparateurs traduits morceau par morceau). */
export function rolesLisibles(roles: readonly { role: BusinessRole; scopeType: RoleScope; scopeId: string | null }[]): string {
  return roles.map((r) => (r.scopeType === "projet" ? BUSINESS_ROLE_LABEL[r.role] : `${BUSINESS_ROLE_LABEL[r.role]} — ${SCOPE_LABEL[r.scopeType]} : ${r.scopeId ?? ""}`)).join(" · ");
}

export interface DerivedAccess { role: "proprietaire" | "editeur" | "lecteur"; canExport: boolean; canApprove: boolean; canPublish: boolean }
export interface RoleView { id: string; role: BusinessRole; scopeType: RoleScope; scopeId: string | null; origin: "acces" | "attribution"; createdAt: string }

export interface Participant {
  id: string;
  kind: "personne" | "organisation";
  status: ParticipationStatus;
  isOwner: boolean;
  isYou: boolean;
  person: null | {
    id: string; displayName: string | null; jobTitle: string | null; workEmail: string | null; workPhone: string | null; erased: boolean;
    account: null | { userId: string; email: string; displayName: string | null; status: "active" | "suspended" | "closed" };
  };
  organization: null | { id: string; name: string; kind: string | null; status: string };
  representedOrganization: null | { id: string; name: string };
  businessRole: string | null;
  responsibilities: Responsibility[];
  startsOn: string | null;
  endsOn: string | null;
  canExport: boolean;
  roles: RoleView[];
  access: DerivedAccess | null;
  pendingInvitations: number;
  createdAt: string;
}

export type OrganizationStatus = "active" | "suspendue" | "close";
/** État côté projet d'un mandat de représentant (reliquat de la phase 5). */
export type MandateProjectSide = "non_invite" | "invitation_en_attente" | "participation_active" | "terminee";
export interface OrganizationIdentity { id: string; name: string; kind: string | null; status: OrganizationStatus }

/** Partie propriétaire déclarée et organisations parties (phase 5, OP-D1 a) : lecture seule, aucun droit. */
export interface ProjectOrganizations {
  owner: null | (OrganizationIdentity & { youAreMember: boolean; isParty: boolean });
  ownerPerson: { userId: string | null; name: string | null };
  ownerGrantsAccess: false;
  parties: (OrganizationIdentity & {
    participationId: string; participationStatus: ParticipationStatus; businessRole: string | null; responsibilities: Responsibility[];
    startsOn: string | null; youAreMember: boolean;
    representatives: {
      mandateId: string; name: string | null; responsibilities: Responsibility[]; startsOn: string | null;
      /** Reliquat de la phase 5 — propriétaire seul (null sinon) : état côté projet du représentant. */
      projectSide: MandateProjectSide | null;
      /** Le propriétaire peut lui envoyer une invitation de projet. */
      invitable: boolean;
    }[];
    /** « Mandat terminé » : participation du représentant conservée, à revoir (jamais terminée d'office). */
    endedRepresentatives: { participationId: string; mandateId: string; name: string | null; endsOn: string | null; endReason: string | null }[];
  })[];
}

export interface ParticipantsView {
  project: { id: string; closedAt: string | null };
  you: { userId: string; role: string; responsible: boolean; canManage: boolean; canErase: boolean };
  participants: Participant[];
  organizations: ProjectOrganizations;
  invitations?: { id: string; email: string; projectRole: string | null; expiresAt: string }[];
}

export interface ExistingMatches {
  people: { id: string; displayName: string | null; jobTitle: string | null; hasAccount: boolean; participationId: string | null; participationStatus: ParticipationStatus | null }[];
  organizations: { id: string; name: string; kind: string | null; status: string; participationId: string | null; participationStatus: ParticipationStatus | null }[];
  accountExists: boolean;
}

export interface Impact {
  change: StatusChange;
  accessWithdrawn: boolean;
  accessRestored: boolean;
  access: DerivedAccess | null;
  roles: { role: BusinessRole; scopeType: RoleScope; scopeId: string | null; origin: "acces" | "attribution" }[];
  pendingInvitations: number;
  invitationsCancelled: number;
  openObservations: number;
  openTasks: number;
  editingLockReleased: boolean;
  responsibilities: Responsibility[];
  rolesKeptAsHistory: boolean;
}

export type ContactInput =
  | { kind: "personne"; personId?: string; displayName?: string | null; jobTitle?: string | null; workEmail?: string | null; workPhone?: string | null; representedOrganizationId?: string | null; representedOrganizationName?: string | null; businessRole?: string | null; responsibilities?: Responsibility[]; confirmDistinct?: boolean }
  | { kind: "organisation"; organizationId?: string; name?: string | null; orgKind?: string | null; businessRole?: string | null; responsibilities?: Responsibility[]; confirmDistinct?: boolean };

export type ParticipationPatch = Partial<{ businessRole: string | null; representedOrganizationId: string | null; representedOrganizationName: string | null; responsibilities: Responsibility[]; startsOn: string | null; displayName: string | null; jobTitle: string | null; workEmail: string | null; workPhone: string | null; confirmDistinct: boolean }>;

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/participants`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const participantsApi = {
  list: (projectId: string) => request<ParticipantsView>(base(projectId)),
  search: (projectId: string, q: string, email = "") => request<ExistingMatches>(`${base(projectId)}/search?q=${encodeURIComponent(q)}&email=${encodeURIComponent(email)}`),
  createContact: (projectId: string, input: ContactInput) => request<{ id: string }>(`${base(projectId)}/contacts`, json("POST", input)),
  update: (projectId: string, id: string, patch: ParticipationPatch) => request<{ id: string }>(`${base(projectId)}/${encodeURIComponent(id)}`, json("PATCH", patch)),
  assignRole: (projectId: string, id: string, role: BusinessRole, scopeType: RoleScope, scopeId: string | null) => request<RoleView>(`${base(projectId)}/${encodeURIComponent(id)}/roles`, json("POST", { role, scopeType, scopeId })),
  removeRole: (projectId: string, id: string, roleId: string) => request<{ removed: string }>(`${base(projectId)}/${encodeURIComponent(id)}/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }),
  impact: (projectId: string, id: string, change: StatusChange) => request<Impact>(`${base(projectId)}/${encodeURIComponent(id)}/impact?change=${change}`),
  setStatus: (projectId: string, id: string, change: StatusChange) => request<{ status: ParticipationStatus }>(`${base(projectId)}/${encodeURIComponent(id)}/status`, json("POST", { change })),
  returnParticipant: (projectId: string, id: string) => request<{ id: string }>(`${base(projectId)}/${encodeURIComponent(id)}/return`, { method: "POST" }),
  erase: (projectId: string, id: string) => request<{ erased: boolean }>(`${base(projectId)}/${encodeURIComponent(id)}/erase`, { method: "POST" }),
  setClosure: (projectId: string, closed: boolean) => request<{ closedAt: string | null }>(`${base(projectId)}/closure`, json("PUT", { closed })),
};
