/**
 * Revue externe (phase 4, Issue #262) — client des routes `/reviews` (destinataire) et `/projects/:id/reviews` (équipe).
 * Le serveur fait seul autorité : les actions affichées sont celles qu'il déclare permises (`me.actions`), revérifiées
 * à chaque requête.
 */
import { apiRequest, type ControleApprobation } from "./api";

export type ReviewAction = "consulter" | "commenter" | "joindre" | "telecharger" | "exporter" | "repondre" | "recontroler" | "approuver" | "refuser";
export type ReviewPackageStatus = "brouillon" | "partage" | "clos" | "remplace";
export type ReviewAssignmentStatus = "en-attente" | "en-cours" | "terminee" | "annulee" | "remplacee";
export type ReviewResponsibility = "relecture" | "approbation";
export type DocumentFormat = "svg" | "dxf" | "ifc" | "pdf";

export interface ReviewFile { format: DocumentFormat; fileName: string; mime: string; size: number; sha256: string }
export interface ReviewFinding {
  id: string; packageVersion: number | null; body: string; author: string; mine?: boolean; statut: string; revisionId: string;
  document: { format: string; sha256: string | null } | null; location?: string | null; objectIds: string[];
  correctionRevisionId: string | null; recontroleRevisionId: string | null; createdAt: string;
  attachments: { name: string; mime: string; size: number; sha256: string }[];
  replies: { id: string; body: string; author: string; mine?: boolean; createdAt: string }[];
}
export interface MyReviewSummary {
  id: string; title: string; version: number; status: ReviewPackageStatus; dueOn: string | null; projectLabel: string; responsibilities: ReviewResponsibility[];
  assignmentStatuses: ReviewAssignmentStatus[]; accessExpiresAt: string; publicationWorkStatus: string; actions: ReviewAction[]; sharedAt: string | null;
}
export interface MyReview {
  package: {
    id: string; title: string; version: number; status: ReviewPackageStatus; purpose: string; expectedResponse: string; questions: string[]; dueOn: string | null; overdue: boolean;
    projectLabel: string; coordinator: string; supersedes: { id: string; version: number } | null; replacedBy: string | null; sharedAt: string | null;
    revisionId: string; documentHash: string; manifestHash: string; files: ReviewFile[];
  };
  /** `approvedSelfControl` (OP-6) : approbation de ce paquet marquée auto-contrôle ; null si non approuvée ou avant le lot. */
  publication: { workStatus: string; diffusionStatus: string; matchesPackage: boolean; approvedAt: string | null; approvedSelfControl?: boolean | null };
  decisionBlock: string | null;
  me: {
    assignments: { id: string; responsibility: ReviewResponsibility; status: ReviewAssignmentStatus; result: string | null; responseNote: string | null; respondedAt: string | null; accessExpiresAt: string;
      permissions: { view: true; comment: boolean; attach: boolean; download: boolean; export: boolean } }[];
    actions: ReviewAction[];
  };
  findings: ReviewFinding[];
}

export interface FollowUp {
  recipients: number; awaiting: number; responses: { constats: number; satisfaisante: number }; openFindings: number; overdue: number;
  blockedDecision: string | null; approved: boolean;
}
export interface TeamPackageSummary {
  id: string; lineageId: string; version: number; title: string; status: ReviewPackageStatus; dueOn: string | null; publicationId: string; studyId: string; variantId: string;
  supersedes: string | null; replacedBy: string | null; sharedAt: string | null; createdAt: string; followUp: FollowUp;
  publication: { title: string; workStatus: string; diffusionStatus: string; freshness: string; manifestHash: string | null; revisionId: string; approvedSelfControl?: boolean | null } | null;
}
export interface TeamAssignment {
  id: string; responsibility: ReviewResponsibility; status: ReviewAssignmentStatus; result: string | null; responseNote: string | null; respondedAt: string | null;
  permissions: { view: true; comment: boolean; attach: boolean; download: boolean; export: boolean }; accessExpiresAt: string; accepted: boolean;
  revoked: { at: string; reason: string | null } | null; recipient: { personId: string; name: string; email: string | null };
  invitation: { status: string; expiresAt: string } | null; overdue: boolean; carriedFrom: string | null;
}
export interface TeamPackageDetail {
  canSend: boolean; canSeeContacts: boolean;
  package: TeamPackageSummary & { purpose: string; expectedResponse: string; questions: string[]; coordinator: { id: string; label: string | null }; correctionsOwner: { id: string; label: string | null };
    revisionId: string | null; manifestHash: string | null; files: ReviewFile[]; closedAt: string | null; closeReason: string | null };
  versions: { id: string; version: number; status: ReviewPackageStatus; sharedAt: string | null; manifestHash: string | null; revisionId: string | null }[];
  assignments: TeamAssignment[];
  findings: (ReviewFinding & { packageId: string; responsable: string | null })[];
  internalNotes: { id: string; body: string; author: string | null; createdAt: string }[];
}
export interface AccessPreview {
  responsibility: ReviewResponsibility; scope: "paquet"; projectAccess: "aucun"; organizationMembership: "aucune"; permitted: ReviewAction[]; notPermitted: ReviewAction[];
  accessExpiresAt: string; invitationExpiresAt: string; dueOn: string | null;
}
export interface InvitationMail { assignmentId: string; queued: boolean; reason: string | null; link?: string }
export interface AssignmentInput { email: string; displayName?: string; responsibility: ReviewResponsibility; permissions?: { comment?: boolean; attach?: boolean; download?: boolean; export?: boolean }; accessExpiresAt?: string }

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const team = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/reviews`;
const mine = (id: string) => `/reviews/${encodeURIComponent(id)}`;

export const revuesApi = {
  // Destinataire
  list: () => apiRequest<{ reviews: MyReviewSummary[] }>("/reviews"),
  get: (id: string) => apiRequest<MyReview>(mine(id)),
  fileUrl: (id: string, format: DocumentFormat, download = false) => `${mine(id)}/files/${format}${download ? "?download=1" : ""}`,
  reportUrl: (id: string) => `${mine(id)}/report`,
  addFinding: (id: string, body: { body: string; document?: DocumentFormat; location?: string; attachments?: { name: string; mime: string; contentBase64: string }[] }) => apiRequest<{ id: string }>(`${mine(id)}/findings`, json("POST", body)),
  reply: (id: string, findingId: string, body: string) => apiRequest<{ id: string }>(`${mine(id)}/findings/${encodeURIComponent(findingId)}/replies`, json("POST", { body })),
  recheck: (id: string, findingId: string, outcome: "levee" | "maintenue", note?: string) => apiRequest<{ statut: string }>(`${mine(id)}/findings/${encodeURIComponent(findingId)}/recheck`, json("POST", { outcome, ...(note ? { note } : {}) })),
  respond: (id: string, result: "constats" | "satisfaisante", note?: string) => apiRequest<{ result: string }>(`${mine(id)}/response`, json("POST", { result, ...(note ? { note } : {}) })),
  approve: (id: string, manifestHash: string, comment?: string) => apiRequest<{ decision: string }>(`${mine(id)}/approve`, json("POST", { manifestHash, ...(comment ? { comment } : {}) })),
  refuse: (id: string, comment: string) => apiRequest<{ decision: string }>(`${mine(id)}/refuse`, json("POST", { comment })),
  /** OP-6 : aperçu de l'auto-contrôle de l'approbateur nommé avant sa décision. */
  approvalCheck: (id: string) => apiRequest<ControleApprobation>(`${mine(id)}/controle-approbation`),
  // Équipe
  teamList: (projectId: string) => apiRequest<{ canSend: boolean; packages: TeamPackageSummary[] }>(team(projectId)),
  teamGet: (projectId: string, id: string) => apiRequest<TeamPackageDetail>(`${team(projectId)}/${encodeURIComponent(id)}`),
  teamCreate: (projectId: string, body: { publicationId: string; purpose: string; expectedResponse: string; title?: string; questions?: string[]; dueOn?: string | null }) => apiRequest<TeamPackageDetail>(team(projectId), json("POST", body)),
  teamPreview: (projectId: string, id: string, body: AssignmentInput) => apiRequest<{ preview: AccessPreview }>(`${team(projectId)}/${encodeURIComponent(id)}/assignments/preview`, json("POST", body)),
  teamAssign: (projectId: string, id: string, body: AssignmentInput) => apiRequest<{ assignmentId: string; mail: InvitationMail | null }>(`${team(projectId)}/${encodeURIComponent(id)}/assignments`, json("POST", body)),
  teamShare: (projectId: string, id: string) => apiRequest<{ invitations: InvitationMail[] }>(`${team(projectId)}/${encodeURIComponent(id)}/share`, json("POST")),
  teamRevoke: (projectId: string, id: string, assignmentId: string, reason: string) => apiRequest<{ revoked: boolean }>(`${team(projectId)}/${encodeURIComponent(id)}/assignments/${encodeURIComponent(assignmentId)}/revoke`, json("POST", { reason })),
  teamVersion: (projectId: string, id: string) => apiRequest<{ id: string; version: number }>(`${team(projectId)}/${encodeURIComponent(id)}/versions`, json("POST", {})),
  teamNote: (projectId: string, id: string, body: string) => apiRequest<{ id: string }>(`${team(projectId)}/${encodeURIComponent(id)}/notes`, json("POST", { body })),
  teamReply: (projectId: string, id: string, findingId: string, body: string) => apiRequest<{ id: string }>(`${team(projectId)}/${encodeURIComponent(id)}/findings/${encodeURIComponent(findingId)}/replies`, json("POST", { body })),
};

/** Libellés (français, traduits à l'affichage). */
export const STATUT_PAQUET: Record<ReviewPackageStatus, string> = { brouillon: "Brouillon", partage: "Partagé", clos: "Clos", remplace: "Remplacé" };
export const STATUT_AFFECTATION: Record<ReviewAssignmentStatus, string> = { "en-attente": "En attente de réponse", "en-cours": "En cours", terminee: "Terminée", annulee: "Annulée", remplacee: "Remplacée" };
export const RESPONSABILITE: Record<ReviewResponsibility, string> = { relecture: "Relecture", approbation: "Approbation" };
export const ACTION_REVUE: Record<ReviewAction, string> = {
  consulter: "Consulter", commenter: "Commenter", joindre: "Joindre des pièces", telecharger: "Télécharger", exporter: "Exporter le rapport",
  repondre: "Répondre", recontroler: "Recontrôler", approuver: "Approuver", refuser: "Refuser",
};
export const STATUT_TRAVAIL: Record<string, string> = { brouillon: "Brouillon", "en-revue": "Soumis pour vérification", approuve: "Approuvé", refuse: "Refusé" };
export const STATUT_CONSTAT: Record<string, string> = { ouverte: "Ouvert", corrigee: "Déclaré corrigé", recontrolee: "Recontrôlé", cloturee: "Clôturé", rouverte: "Rouvert" };
export const BLOCAGE: Record<string, string> = {
  paquet_non_partage: "Paquet non partagé", publication_changee: "La publication a changé depuis ce paquet", publication_non_en_revue: "Publication non soumise pour vérification",
  publication_diffusee: "Publication déjà diffusée", constats_ouverts: "Constats ouverts",
};
