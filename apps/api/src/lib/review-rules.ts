/**
 * Revue externe (Issue #262, phase 4 ; concept, partie 4) — règles pures : aucune base, aucun réseau, aucun DOM.
 *
 * Paquet de revue (`review_packages`) : sélection nommée et stable d'une publication Studio candidate (OP-D5 a). Il est
 * préparé en `brouillon`, figé au `partage` (manifeste, empreintes et fichiers copiés), puis `clos` ou `remplace` par une
 * nouvelle version qui le désigne. Un paquet partagé ne se réécrit jamais (déclencheur SQL et `PACKAGE_TRANSITIONS`).
 *
 * Affectation (`review_assignments`) : destinataire nommé, responsabilité distincte — `relecture` ou `approbation`
 * (OP-D7 a : un externe approuve seulement par une affectation d'approbation explicite et nominative) —, permissions
 * explicites (OP-D8 a : consulter et commenter par défaut ; joindre, télécharger et exporter seulement si accordés),
 * expiration d'accès, statut (`en-attente`, `en-cours`, `terminee`, `annulee`, `remplacee`) et résultat d'une relecture
 * (`constats` ou `satisfaisante` pour la portée). La fin d'une relecture n'établit pas l'approbation du paquet ; une
 * échéance dépassée, une absence ou une réponse manquante ne valent jamais accord.
 *
 * Trois dates indépendantes, aux effets distincts : l'expiration de l'invitation (jusqu'à quand l'accepter),
 * l'expiration de l'accès (jusqu'à quand l'accès accepté vaut) et l'échéance de réponse (quand la réponse est attendue).
 */
import type { ReviewAssignmentStatus, ReviewPackageStatus, ReviewResponsibility, ReviewResult } from "../db/schema.js";

export type { ReviewAssignmentStatus, ReviewPackageStatus, ReviewResponsibility, ReviewResult };

export const REVIEW_PACKAGE_STATUSES: readonly ReviewPackageStatus[] = ["brouillon", "partage", "clos", "remplace"];
export const REVIEW_ASSIGNMENT_STATUSES: readonly ReviewAssignmentStatus[] = ["en-attente", "en-cours", "terminee", "annulee", "remplacee"];
export const REVIEW_RESPONSIBILITIES: readonly ReviewResponsibility[] = ["relecture", "approbation"];
export const REVIEW_RESULTS: readonly ReviewResult[] = ["constats", "satisfaisante"];

/** Transitions d'un paquet (les mêmes que le déclencheur `review_package_guard`, init.sql). */
export const PACKAGE_TRANSITIONS: Readonly<Record<ReviewPackageStatus, readonly ReviewPackageStatus[]>> = Object.freeze({
  brouillon: ["partage"],
  partage: ["clos", "remplace"],
  clos: ["remplace"],
  remplace: [],
});
export function packageTransitionAllowed(from: ReviewPackageStatus, to: ReviewPackageStatus): boolean {
  return PACKAGE_TRANSITIONS[from].includes(to);
}

/** Transitions d'une affectation : rien ne revient en arrière ; une affectation annulée ou remplacée est définitive. */
export const ASSIGNMENT_TRANSITIONS: Readonly<Record<ReviewAssignmentStatus, readonly ReviewAssignmentStatus[]>> = Object.freeze({
  "en-attente": ["en-cours", "terminee", "annulee", "remplacee"],
  "en-cours": ["terminee", "annulee", "remplacee"],
  terminee: ["remplacee"],
  annulee: [],
  remplacee: [],
});
export function assignmentTransitionAllowed(from: ReviewAssignmentStatus, to: ReviewAssignmentStatus): boolean {
  return ASSIGNMENT_TRANSITIONS[from].includes(to);
}
/** Une affectation encore attendue (ni terminée, ni annulée, ni remplacée). */
export const isOpenAssignment = (status: ReviewAssignmentStatus): boolean => status === "en-attente" || status === "en-cours";

// ---------------------------------------------------------------------------------------------------------------------
// Permissions (OP-D8 a)

export interface ReviewPermissions { view: true; comment: boolean; attach: boolean; download: boolean; export: boolean }
/** Défauts : consulter et commenter ; joindre, télécharger et exporter seulement si accordés explicitement. */
export const DEFAULT_REVIEW_PERMISSIONS: Readonly<ReviewPermissions> = Object.freeze({ view: true, comment: true, attach: false, download: false, export: false });
export function permissionsOf(input: Partial<Omit<ReviewPermissions, "view">> | undefined): ReviewPermissions {
  const p = { ...DEFAULT_REVIEW_PERMISSIONS, ...(input ?? {}) };
  // Joindre une pièce suppose de pouvoir écrire un constat.
  return { view: true, comment: p.comment, attach: p.comment && p.attach, download: p.download, export: p.export };
}

/** Durée d'accès par défaut (déclarée, modifiable à l'invitation) et durée maximale. */
export const DEFAULT_ACCESS_DAYS = 30;
export const MAX_ACCESS_DAYS = 365;
const DAY = 24 * 3600 * 1000;

/** Expiration d'accès admise : dans le futur, au plus `MAX_ACCESS_DAYS` jours. */
export function accessExpiryProblem(accessExpiresAt: Date, now: Date): string | null {
  if (Number.isNaN(accessExpiresAt.getTime())) return "Date d'expiration de l'accès invalide.";
  if (accessExpiresAt.getTime() <= now.getTime()) return "L'expiration de l'accès doit être dans le futur.";
  if (accessExpiresAt.getTime() > now.getTime() + MAX_ACCESS_DAYS * DAY) return `L'accès d'un destinataire externe dure au plus ${MAX_ACCESS_DAYS} jours.`;
  return null;
}
export const defaultAccessExpiry = (now: Date): Date => new Date(now.getTime() + DEFAULT_ACCESS_DAYS * DAY);

// ---------------------------------------------------------------------------------------------------------------------
// Accès borné au paquet : jamais un rôle de projet

export interface AssignmentState {
  responsibility: ReviewResponsibility;
  status: ReviewAssignmentStatus;
  revokedAt: Date | null;
  accessExpiresAt: Date;
  permissions: ReviewPermissions;
}

export type ReviewAccessRefusal = "revoked" | "cancelled" | "expired" | "participation_inactive" | "account_inactive" | "not_shared" | "not_accepted";

/**
 * Refus d'accès d'une affectation, ou null. Ordre : compte, participation (suspendue ou terminée : tout accès de revue
 * cesse), invitation non acceptée, révocation, annulation, expiration, paquet non partagé. Tout refus vaut 404 aux routes
 * de revue (rien n'est révélé). Une affectation remplacée ou terminée garde la consultation de son paquet (historique),
 * sans action nouvelle (`reviewActions`).
 */
export function reviewAccessRefusal(a: AssignmentState & { accepted: boolean }, ctx: { packageStatus: ReviewPackageStatus; participationStatus: string; accountStatus: string; now: Date }): ReviewAccessRefusal | null {
  if (ctx.accountStatus !== "active") return "account_inactive";
  if (ctx.participationStatus !== "active") return "participation_inactive";
  if (!a.accepted) return "not_accepted";
  if (a.revokedAt) return "revoked";
  if (a.status === "annulee") return "cancelled";
  if (a.accessExpiresAt.getTime() <= ctx.now.getTime()) return "expired";
  if (ctx.packageStatus === "brouillon") return "not_shared";
  return null;
}

export type ReviewAction = "consulter" | "commenter" | "joindre" | "telecharger" | "exporter" | "repondre" | "recontroler" | "approuver" | "refuser";
export const REVIEW_ACTIONS: readonly ReviewAction[] = ["consulter", "commenter", "joindre", "telecharger", "exporter", "repondre", "recontroler", "approuver", "refuser"];

export interface DecisionContext {
  /** Statut de travail de la publication Studio source (transitions Studio existantes). */
  publicationWorkStatus: "brouillon" | "en-revue" | "approuve" | "refuse";
  publicationDiffusionStatus: "non-diffuse" | "diffuse" | "retire" | "remplace";
  /** Le manifeste courant de la publication est-il celui figé dans le paquet ? */
  publicationMatchesPackage: boolean;
}

/** Motif pour lequel une décision d'approbation ne peut pas être prise maintenant (null : elle le peut). */
export type DecisionBlock = "paquet_non_partage" | "publication_changee" | "publication_non_en_revue" | "publication_diffusee";
export function decisionBlock(packageStatus: ReviewPackageStatus, d: DecisionContext): DecisionBlock | null {
  if (packageStatus !== "partage") return "paquet_non_partage";
  if (d.publicationDiffusionStatus !== "non-diffuse") return "publication_diffusee";
  if (!d.publicationMatchesPackage) return "publication_changee";
  if (d.publicationWorkStatus !== "en-revue") return "publication_non_en_revue";
  return null;
}

/**
 * Actions permises maintenant à un destinataire, d'après ses affectations valides sur ce paquet. Consulter : toujours
 * (accès vérifié avant). Écrire (constat, réponse, recontrôle) : paquet partagé, affectation attendue, permission. Une
 * approbation exige une affectation `approbation` attendue et une décision non bloquée ; un relecteur seul n'approuve
 * jamais et ne diffuse jamais (la diffusion n'est pas une action de revue).
 */
export function reviewActions(assignments: readonly AssignmentState[], packageStatus: ReviewPackageStatus, decision: DecisionContext): ReviewAction[] {
  const out = new Set<ReviewAction>(["consulter"]);
  const open = assignments.filter((a) => isOpenAssignment(a.status));
  const writable = packageStatus === "partage";
  if (assignments.some((a) => a.permissions.download)) out.add("telecharger");
  if (assignments.some((a) => a.permissions.export)) out.add("exporter");
  if (writable && open.some((a) => a.permissions.comment)) {
    out.add("commenter");
    out.add("recontroler");
    if (open.some((a) => a.permissions.attach)) out.add("joindre");
  }
  if (writable && open.some((a) => a.responsibility === "relecture")) out.add("repondre");
  if (open.some((a) => a.responsibility === "approbation") && decisionBlock(packageStatus, decision) === null) {
    out.add("approuver");
    out.add("refuser");
  }
  return REVIEW_ACTIONS.filter((a) => out.has(a));
}

/** Réponse d'une relecture : « satisfaisante pour la portée » refusée tant que des constats de cette personne restent ouverts. */
export function responseRefusal(result: ReviewResult, ownOpenFindings: number): { status: number; body: Record<string, unknown> } | null {
  if (result === "satisfaisante" && ownOpenFindings > 0) {
    return { status: 409, body: { error: "findings_open", count: ownOpenFindings, message: "Vos constats ne sont pas tous levés : répondez « constats », ou recontrôlez-les d'abord." } };
  }
  return null;
}

/** Statuts d'observation encore ouverts (non recontrôlés ni clôturés) pour le suivi et la réponse. */
export const OPEN_FINDING_STATUSES = ["ouverte", "rouverte", "corrigee"] as const;
export const isOpenFinding = (statut: string): boolean => (OPEN_FINDING_STATUSES as readonly string[]).includes(statut);

// ---------------------------------------------------------------------------------------------------------------------
// Suivi de l'équipe : échéance, retards, décisions bloquées

/** Date du jour (AAAA-MM-JJ, UTC) : l'échéance est une date, comparée au jour. */
export const todayOf = (now: Date): string => now.toISOString().slice(0, 10);

/** Réponse en retard : échéance passée et affectation toujours attendue. Un retard n'est jamais un accord. */
export function isOverdue(dueOn: string | null, status: ReviewAssignmentStatus, now: Date): boolean {
  return dueOn !== null && dueOn < todayOf(now) && isOpenAssignment(status);
}

export interface FollowUpInput {
  packageStatus: ReviewPackageStatus;
  dueOn: string | null;
  assignments: readonly { responsibility: ReviewResponsibility; status: ReviewAssignmentStatus; result: ReviewResult | null }[];
  findings: readonly { statut: string }[];
  decision: DecisionContext;
  now: Date;
}
export interface FollowUp {
  recipients: number;
  awaiting: number;
  responses: { constats: number; satisfaisante: number };
  openFindings: number;
  overdue: number;
  /** Décision d'approbation attendue mais bloquée, avec son motif ; null si aucune n'est bloquée. */
  blockedDecision: DecisionBlock | "constats_ouverts" | null;
  /** Une approbation est-elle enregistrée par les transitions Studio (jamais déduite d'un silence ou d'un retard) ? */
  approved: boolean;
}
export function followUp(i: FollowUpInput): FollowUp {
  const current = i.assignments.filter((a) => a.status !== "annulee" && a.status !== "remplacee");
  const openFindings = i.findings.filter((f) => isOpenFinding(f.statut)).length;
  const approverWaiting = current.some((a) => a.responsibility === "approbation" && isOpenAssignment(a.status));
  const block = approverWaiting ? decisionBlock(i.packageStatus, i.decision) : null;
  return {
    recipients: current.length,
    awaiting: current.filter((a) => isOpenAssignment(a.status)).length,
    responses: {
      constats: current.filter((a) => a.result === "constats").length,
      satisfaisante: current.filter((a) => a.result === "satisfaisante").length,
    },
    openFindings,
    overdue: current.filter((a) => isOverdue(i.dueOn, a.status, i.now)).length,
    blockedDecision: block ?? (approverWaiting && openFindings > 0 ? "constats_ouverts" : null),
    approved: i.decision.publicationWorkStatus === "approuve" && i.decision.publicationMatchesPackage,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Aperçu de l'accès résultant (avant l'invitation)

export interface AccessPreview {
  responsibility: ReviewResponsibility;
  scope: "paquet";
  projectAccess: "aucun";
  organizationMembership: "aucune";
  permitted: ReviewAction[];
  notPermitted: ReviewAction[];
  accessExpiresAt: string;
  invitationExpiresAt: string;
  dueOn: string | null;
}
/** Ce que le destinataire pourra faire : le paquet seul, aucun accès au projet, aucune adhésion à l'organisation. */
export function previewAccess(input: { responsibility: ReviewResponsibility; permissions: ReviewPermissions; accessExpiresAt: Date; invitationExpiresAt: Date; dueOn: string | null }): AccessPreview {
  const state: AssignmentState = { responsibility: input.responsibility, status: "en-attente", revokedAt: null, accessExpiresAt: input.accessExpiresAt, permissions: input.permissions };
  const permitted = reviewActions([state], "partage", { publicationWorkStatus: "en-revue", publicationDiffusionStatus: "non-diffuse", publicationMatchesPackage: true });
  return {
    responsibility: input.responsibility, scope: "paquet", projectAccess: "aucun", organizationMembership: "aucune",
    permitted, notPermitted: REVIEW_ACTIONS.filter((a) => !permitted.includes(a)),
    accessExpiresAt: input.accessExpiresAt.toISOString(), invitationExpiresAt: input.invitationExpiresAt.toISOString(), dueOn: input.dueOn,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fichiers figés et pièces jointes

/** Consulter (affichage dans le navigateur) : SVG et PDF seulement ; DXF et IFC ne se lisent que téléchargés. */
export const INLINE_FORMATS = ["svg", "pdf"] as const;
export type FileDelivery = { ok: true; disposition: "inline" | "attachment" } | { ok: false; status: 403; reason: "download_not_granted" };
export function fileDelivery(format: string, wantsDownload: boolean, actions: readonly ReviewAction[]): FileDelivery {
  const inline = (INLINE_FORMATS as readonly string[]).includes(format);
  if (!wantsDownload && inline) return { ok: true, disposition: "inline" };
  return actions.includes("telecharger") ? { ok: true, disposition: "attachment" } : { ok: false, status: 403, reason: "download_not_granted" };
}

/** Pièces jointes admises : PDF, PNG, JPEG ; 2 Mo au plus chacune, 5 par constat. */
export const ATTACHMENT_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;
/** Le contenu correspond-il au type déclaré (signature des premiers octets) ? */
export function attachmentProblem(mime: string, bytes: Uint8Array): string | null {
  if (!(ATTACHMENT_MIMES as readonly string[]).includes(mime)) return "Type de pièce jointe non admis (PDF, PNG ou JPEG).";
  if (bytes.byteLength === 0) return "Pièce jointe vide.";
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) return "Pièce jointe trop volumineuse (2 Mo au plus).";
  const head = (n: number) => [...bytes.subarray(0, n)];
  const signature: Record<string, number[]> = { "application/pdf": [0x25, 0x50, 0x44, 0x46], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/jpeg": [0xff, 0xd8, 0xff] };
  const sig = signature[mime]!;
  return head(sig.length).every((b, i) => b === sig[i]) ? null : "Le contenu de la pièce jointe ne correspond pas à son type.";
}
/** Nom de fichier sûr pour un en-tête Content-Disposition (ASCII, sans guillemet ni séparateur de chemin). */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\/;:*?<>|]/g, "_").trim().slice(0, 120);
  return cleaned || "piece-jointe";
}

// ---------------------------------------------------------------------------------------------------------------------
// Courriels (OP-D12)

/**
 * L'ouverture de la revue externe en production exige un envoi de courriels configuré (SMTP) : sans lui, l'invitation
 * d'un destinataire externe est refusée (503 `mail_required`). Hors production (préproduction comprise selon sa
 * configuration), un destinataire de domaine réservé aux essais reçoit le lien affiché, jamais un envoi.
 */
export function reviewMailGate(input: { production: boolean; transport: "smtp" | "console" | "disabled" }): "mail_required" | null {
  return input.production && input.transport !== "smtp" ? "mail_required" : null;
}
