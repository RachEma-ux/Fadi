/**
 * Client API · Collaboration — rôles du partage, membres, commentaires, journal, réservation d'édition.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */

import { request } from "./http";

export interface EditingLock {
  userId: string;
  email: string;
  since: string;
  expiresAt: string;
}

/** Rôles du partage (`lib/owned-project.ts` de l'API) : lecteur lit et commente, éditeur modifie, propriétaire partage et supprime. */
export type ProjectRole = "proprietaire" | "editeur" | "lecteur";
export type MemberRole = Exclude<ProjectRole, "proprietaire">;

export const ROLE_LABEL: Record<ProjectRole, string> = { proprietaire: "propriétaire", editeur: "éditeur", lecteur: "lecteur" };

/** Le rôle permet-il de modifier le projet ? (`undefined` = projet lu avant le partage : propriétaire.) */
export function canWrite(role: ProjectRole | undefined): boolean {
  return role === undefined || role === "proprietaire" || role === "editeur";
}

export interface ProjectMember {
  userId: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  createdAt: string;
}

export interface MembersView {
  owner: { userId: string; email: string };
  you: { userId: string; role: ProjectRole };
  members: ProjectMember[];
}

/** Module Collaboration. */
export interface ProjectComment {
  id: string;
  stepNumber: number | null;
  /** Réponse en fil : le commentaire d'origine ; null au premier niveau. */
  parentId: string | null;
  authorEmail: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface RevisionEvent {
  at: string;
  kind: string;
  label: string;
  detail: string;
  stepNumber: number | null;
  revision: number | null;
}

export interface CollaborationView {
  access: { ownerEmail: string; you: string; role: ProjectRole; members: ProjectMember[]; lock: EditingLock | null; sharing: { available: boolean; reason: string } };
  sync: { modelRevision: number; nativeKeys: number; lastModelWrite: string | null; offline: { available: boolean; reason: string } };
  journal: RevisionEvent[];
  comments: ProjectComment[];
}

export const collaborationApi = {
  getCollaboration: (projectId: string) => request<CollaborationView>(`/projects/${projectId}/collaboration`),
  listComments: (projectId: string, stepNumber: number | null) => request<ProjectComment[]>(`/projects/${projectId}/collaboration/comments${stepNumber === null ? "" : `?step=${stepNumber}`}`),
  addComment: (projectId: string, body: string, stepNumber: number | null, parentId: string | null = null) =>
    request<ProjectComment>(`/projects/${projectId}/collaboration/comments`, { method: "POST", body: JSON.stringify({ body, stepNumber, parentId }) }),
  deleteComment: (projectId: string, commentId: string) => request<void>(`/projects/${projectId}/collaboration/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" }),
  /** Partage : membres et rôles (propriétaire seulement pour inviter, changer, retirer ; un membre peut se retirer lui-même). */
  listMembers: (projectId: string) => request<MembersView>(`/projects/${projectId}/members`),
  inviteMember: (projectId: string, email: string, role: MemberRole) => request<ProjectMember>(`/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  setMemberRole: (projectId: string, userId: string, role: MemberRole) => request<ProjectMember>(`/projects/${projectId}/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (projectId: string, userId: string) => request<void>(`/projects/${projectId}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  /** Transfert de propriété à un membre (propriétaire seulement) : vous restez éditeur. */
  transferOwnership: (projectId: string, userId: string) => request<MembersView>(`/projects/${projectId}/members/${encodeURIComponent(userId)}/propriete`, { method: "POST" }),
  /** Verrou d'édition optionnel : réserver / prolonger (423 si quelqu'un d'autre le détient), rendre la main (ou libérer, propriétaire). */
  getLock: (projectId: string) => request<{ lock: EditingLock | null; yours: boolean }>(`/projects/${projectId}/lock`),
  reserveEditing: (projectId: string) => request<{ lock: EditingLock; yours: true }>(`/projects/${projectId}/lock`, { method: "PUT" }),
  releaseEditing: (projectId: string) => request<void>(`/projects/${projectId}/lock`, { method: "DELETE" }),
};
