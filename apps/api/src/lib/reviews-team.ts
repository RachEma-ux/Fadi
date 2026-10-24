/**
 * Revue externe (phase 4) — côté équipe interne : préparer un paquet depuis une publication Studio candidate, inviter
 * des destinataires nommés (aperçu de l'accès résultant d'abord), partager (copie figée vérifiée), suivre (réponses
 * reçues, constats ouverts, décisions bloquées, retards — une échéance dépassée n'est jamais un accord), répondre aux
 * constats, révoquer, consigner des notes internes, clore, présenter une nouvelle version qui remplace l'ancienne.
 *
 * Droits : suivre = propriétaire, éditeur ou responsable du projet ; expédier (préparer, inviter, partager, révoquer,
 * clore, nouvelle version) = propriétaire ou responsable (`senderAuthorized`). Les coordonnées des destinataires ne sont
 * montrées qu'aux responsables (OP-D9). Le routeur est monté sous `/projects/:projectId/reviews`.
 */
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  invitations, people, projectParticipations, reviewAssignments, reviewPackageNotes, reviewPackages, studioComments, users, volumes,
  type StudioPackageFile,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { audit } from "./audit.js";
import { seesTeam } from "./audience.js";
import { formatDate, INVITATION_TTL_MS, PUBLIC_PATHS, publicLink, sendAccountMail } from "./account.js";
import { newId } from "./ids.js";
import { mailRuntime, type MailLocale } from "./mailer/index.js";
import { loadProjectAccess, type AccessibleProject } from "./owned-project.js";
import { isProjectResponsible } from "./project-responsables.js";
import {
  accessExpiryProblem, defaultAccessExpiry, followUp, isOverdue, permissionsOf, previewAccess, reviewMailGate,
  type DecisionContext, type FollowUp,
} from "./review-rules.js";
import {
  accountLabels, createOrRenewReviewInvitation, findingsOf, lineageOf, packageOfProject, refuse, repliesOf, ReviewError, reviewNotFound, senderAuthorized,
  type AssignmentRow, type PackageRow,
} from "./reviews-core.js";
import { assignable } from "./studio-commentaires.js";
import { StudioRequestError } from "./studio-commands.js";
import { frozenPublicationFiles, publicationReviewState, type PublicationReviewState } from "./studio-publications.js";
import { sha256 } from "./studio-publication-statuts.js";
import { echeanceValide } from "./studio-observations.js";
import { lockProject, type Querier } from "./step-rows.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const dateSchema = z.string().refine(echeanceValide, "date AAAA-MM-JJ");
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
export const reviewPackageCreateSchema = z.object({
  publicationId: idSchema,
  title: text(200).optional(),
  purpose: text(2000),
  expectedResponse: text(2000),
  questions: z.array(text(500)).max(20).optional(),
  coordinatorId: idSchema.optional(),
  correctionsOwnerId: idSchema.optional(),
  dueOn: dateSchema.nullable().optional(),
  requestId: idSchema.optional(),
}).strict();
export const reviewPackageUpdateSchema = z.object({
  title: text(200).optional(), purpose: text(2000).optional(), expectedResponse: text(2000).optional(), questions: z.array(text(500)).max(20).optional(),
  coordinatorId: idSchema.optional(), correctionsOwnerId: idSchema.optional(), dueOn: dateSchema.nullable().optional(),
}).strict();
export const reviewVersionSchema = z.object({
  title: text(200).optional(), purpose: text(2000).optional(), expectedResponse: text(2000).optional(), questions: z.array(text(500)).max(20).optional(),
  dueOn: dateSchema.nullable().optional(),
}).strict();
const permissionsSchema = z.object({ comment: z.boolean().optional(), attach: z.boolean().optional(), download: z.boolean().optional(), export: z.boolean().optional() }).strict();
export const reviewAssignmentSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  displayName: text(120).optional(),
  /** Participation existante du projet (personne déjà connue) ; sinon une fiche contact est créée pour l'adresse. */
  participationId: idSchema.optional(),
  responsibility: z.enum(["relecture", "approbation"]),
  permissions: permissionsSchema.optional(),
  accessExpiresAt: z.string().datetime({ offset: true }).optional(),
}).strict().refine((v) => v.email !== undefined || v.participationId !== undefined, { message: "Adresse ou participation requise." });
export const reviewNoteSchema = z.object({ body: text(4000) }).strict();
export const reviewReasonSchema = z.object({ reason: text(2000) }).strict();
export const reviewReplySchema = z.object({ body: text(4000) }).strict();
export type ReviewPackageCreateInput = z.infer<typeof reviewPackageCreateSchema>;
export type ReviewAssignmentInput = z.infer<typeof reviewAssignmentSchema>;

/** Contexte de l'équipe : 404 sans accès au projet, 403 hors de l'équipe ou sans autorité d'expédition. */
async function teamContext(projectId: string, userId: string, need: "follow" | "send", executor: Pick<typeof db, "select"> = db): Promise<{ access: AccessibleProject; responsible: boolean; sender: boolean }> {
  const access = await loadProjectAccess(projectId, userId, executor);
  if (!access) return reviewNotFound();
  const responsible = access.role === "proprietaire" || (access.role !== "support" && await isProjectResponsible(projectId, userId, executor));
  const sender = access.role !== "support" && (access.role === "proprietaire" || responsible);
  if (need === "follow" && !(seesTeam(access.role) || responsible)) refuse(403, "forbidden", "Les revues externes sont suivies par l'équipe du projet (propriétaire, éditeurs, responsables).");
  if (need === "send" && !sender) refuse(403, "forbidden", "Seuls le propriétaire et les responsables du projet préparent et partagent une revue externe.");
  return { access, responsible, sender };
}

const decisionOf = (pkg: PackageRow, pub: PublicationReviewState | null): DecisionContext => ({
  publicationWorkStatus: pub?.workStatus ?? "brouillon",
  publicationDiffusionStatus: pub?.diffusionStatus ?? "non-diffuse",
  publicationMatchesPackage: !!pub && pkg.manifestHash !== null && pub.manifestHash === pkg.manifestHash,
});

export interface TeamAssignmentView {
  id: string; responsibility: string; status: string; result: string | null; responseNote: string | null; respondedAt: string | null;
  permissions: { view: true; comment: boolean; attach: boolean; download: boolean; export: boolean };
  accessExpiresAt: string; accepted: boolean; revoked: { at: string; reason: string | null } | null;
  recipient: { personId: string; name: string; email: string | null };
  invitation: { status: string; expiresAt: string } | null;
  overdue: boolean; carriedFrom: string | null;
}
export interface TeamPackageSummary {
  id: string; lineageId: string; version: number; title: string; status: string; dueOn: string | null; publicationId: string; studyId: string; variantId: string;
  supersedes: string | null; replacedBy: string | null; sharedAt: string | null; createdAt: string; followUp: FollowUp;
  publication: { title: string; workStatus: string; diffusionStatus: string; freshness: string; manifestHash: string | null; revisionId: string } | null;
}

async function summaries(q: Querier, access: AccessibleProject, rows: PackageRow[]): Promise<TeamPackageSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const assignments = await q.select().from(reviewAssignments).where(inArray(reviewAssignments.packageId, ids));
  const findings = await findingsOf(q, ids);
  const pubs = new Map<string, PublicationReviewState | null>();
  for (const id of [...new Set(rows.map((r) => r.publicationId))]) pubs.set(id, await publicationReviewState(q, access, id, access.id));
  const now = new Date();
  return rows.map((r) => {
    const pub = pubs.get(r.publicationId) ?? null;
    return {
      id: r.id, lineageId: r.lineageId, version: r.version, title: r.title, status: r.status, dueOn: r.dueOn, publicationId: r.publicationId, studyId: r.studyId, variantId: r.variantId,
      supersedes: r.supersedesPackageId, replacedBy: r.replacedByPackageId, sharedAt: r.sharedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      followUp: followUp({ packageStatus: r.status, dueOn: r.dueOn, assignments: assignments.filter((a) => a.packageId === r.id), findings: findings.filter((f) => f.packageId === r.id), decision: decisionOf(r, pub), now }),
      publication: pub ? { title: pub.title, workStatus: pub.workStatus, diffusionStatus: pub.diffusionStatus, freshness: pub.freshness, manifestHash: pub.manifestHash, revisionId: pub.revisionId } : null,
    };
  });
}

/** Paquets de revue du projet, plus récents d'abord, avec leur suivi. */
export async function listProjectReviews(projectId: string, userId: string) {
  const { access, sender } = await teamContext(projectId, userId, "follow");
  const rows = await db.select().from(reviewPackages).where(eq(reviewPackages.projectId, projectId)).orderBy(desc(reviewPackages.createdAt), desc(reviewPackages.id));
  return { canSend: sender, packages: await summaries(db, access, rows) };
}

async function assignmentViews(q: Pick<typeof db, "select">, pkg: PackageRow, rows: AssignmentRow[], showContacts: boolean): Promise<TeamAssignmentView[]> {
  if (!rows.length) return [];
  const persons = await q.select().from(people).where(inArray(people.id, [...new Set(rows.map((a) => a.personId))]));
  const labels = await accountLabels(q, [...rows.map((a) => a.userId), ...persons.map((p) => p.userId)]);
  const invs = await q.select({ id: invitations.id, status: invitations.status, expiresAt: invitations.expiresAt }).from(invitations)
    .where(inArray(invitations.id, rows.map((a) => a.invitationId).filter((x): x is string => !!x)));
  const now = new Date();
  return rows.map((a) => {
    const person = persons.find((p) => p.id === a.personId);
    const account = a.userId ? labels.get(a.userId) : person?.userId ? labels.get(person.userId) : undefined;
    const inv = invs.find((i) => i.id === a.invitationId);
    return {
      id: a.id, responsibility: a.responsibility, status: a.status, result: a.result, responseNote: a.responseNote, respondedAt: a.respondedAt?.toISOString() ?? null,
      permissions: { view: true, comment: a.canComment, attach: a.canAttach, download: a.canDownload, export: a.canExport },
      accessExpiresAt: a.accessExpiresAt.toISOString(), accepted: a.userId !== null,
      revoked: a.revokedAt ? { at: a.revokedAt.toISOString(), reason: a.revokeReason } : null,
      recipient: { personId: a.personId, name: account?.label ?? person?.displayName ?? "—", email: showContacts ? (account?.email ?? person?.workEmail ?? null) : null },
      invitation: inv ? { status: inv.status === "pending" && inv.expiresAt.getTime() <= now.getTime() ? "expired" : inv.status, expiresAt: inv.expiresAt.toISOString() } : null,
      overdue: isOverdue(pkg.dueOn, a.status, now), carriedFrom: a.carriedFromAssignmentId,
    };
  });
}

/** Détail d'un paquet pour l'équipe : identité, copie figée, destinataires, constats (toute la lignée), notes internes, versions. */
export async function readTeamPackage(projectId: string, packageId: string, userId: string) {
  const { access, responsible, sender } = await teamContext(projectId, userId, "follow");
  const pkg = await packageOfProject(db, projectId, packageId);
  const lineage = await lineageOf(db, pkg.lineageId);
  const [summary] = await summaries(db, access, [pkg]);
  const assignments = await db.select().from(reviewAssignments).where(eq(reviewAssignments.packageId, pkg.id)).orderBy(asc(reviewAssignments.createdAt));
  const findings = await findingsOf(db, lineage.map((p) => p.id));
  const replies = await repliesOf(db, findings.map((f) => f.observationId));
  const notes = await db.select().from(reviewPackageNotes).where(eq(reviewPackageNotes.packageId, pkg.id)).orderBy(asc(reviewPackageNotes.createdAt));
  const labels = await accountLabels(db, [pkg.coordinatorId, pkg.correctionsOwnerId, pkg.createdBy, pkg.sharedBy, ...findings.map((f) => f.authorId), ...findings.map((f) => f.responsableId), ...replies.map((r) => r.authorId), ...notes.map((n) => n.authorId)]);
  const who = (id: string | null) => (id ? labels.get(id)?.label ?? "" : null);
  return {
    canSend: sender, canSeeContacts: responsible,
    package: {
      ...summary!, purpose: pkg.purpose, expectedResponse: pkg.expectedResponse, questions: pkg.questions,
      coordinator: { id: pkg.coordinatorId, label: who(pkg.coordinatorId) }, correctionsOwner: { id: pkg.correctionsOwnerId, label: who(pkg.correctionsOwnerId) },
      revisionId: pkg.revisionId, documentHash: pkg.documentHash, manifestHash: pkg.manifestHash, manifest: pkg.manifest, files: pkg.files ?? [],
      sharedBy: who(pkg.sharedBy), closedAt: pkg.closedAt?.toISOString() ?? null, closeReason: pkg.closeReason, replacedAt: pkg.replacedAt?.toISOString() ?? null,
    },
    versions: lineage.map((p) => ({ id: p.id, version: p.version, status: p.status, sharedAt: p.sharedAt?.toISOString() ?? null, manifestHash: p.manifestHash, revisionId: p.revisionId })),
    assignments: await assignmentViews(db, pkg, assignments, responsible),
    findings: findings.map((f) => ({
      id: f.observationId, packageId: f.packageId, packageVersion: lineage.find((p) => p.id === f.packageId)?.version ?? null, body: f.body, author: who(f.authorId), statut: f.statut,
      responsable: who(f.responsableId), revisionId: f.revisionId, document: f.documentFormat ? { format: f.documentFormat, sha256: f.documentSha256 } : null,
      objectIds: f.objectIds, correctionRevisionId: f.correctionRevisionId, recontroleRevisionId: f.recontroleRevisionId, createdAt: f.createdAt.toISOString(),
      attachments: f.attachments.map((x) => ({ name: x.name, mime: x.mime, size: x.size, sha256: x.sha256 })),
      replies: replies.filter((r) => r.parentId === f.observationId).map((r) => ({ id: r.id, body: r.body, author: who(r.authorId), createdAt: r.createdAt.toISOString() })),
    })),
    /** Notes internes : servies à l'équipe seulement, jamais par les routes `/reviews`. */
    internalNotes: notes.map((n) => ({ id: n.id, body: n.body, author: who(n.authorId), createdAt: n.createdAt.toISOString() })),
  };
}

/** Responsable des corrections : propriétaire ou éditeur (désignable comme responsable d'observation Studio). */
async function checkPeople(tx: Tx, access: AccessibleProject, coordinatorId: string, correctionsOwnerId: string): Promise<void> {
  try {
    await assignable(tx, access, correctionsOwnerId);
  } catch (e) {
    if (e instanceof StudioRequestError) refuse(400, "invalid_input", "Le responsable des corrections doit être le propriétaire ou un éditeur du projet.", { code: "corrections_owner_invalid" });
    throw e;
  }
  if (!(await senderAuthorized(access.id, coordinatorId, tx)) && (await loadProjectAccess(access.id, coordinatorId, tx))?.role !== "editeur") {
    refuse(400, "invalid_input", "Le coordinateur doit être le propriétaire, un éditeur ou un responsable du projet.", { code: "coordinator_invalid" });
  }
}

/** Nouveau paquet (brouillon) depuis une publication Studio du projet ; rien n'est figé ni partagé. */
export async function createReviewPackage(projectId: string, userId: string, input: ReviewPackageCreateInput, ip: string | null) {
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const { access } = await teamContext(projectId, userId, "send", tx);
    if (input.requestId) {
      const [previous] = await tx.select().from(reviewPackages).where(and(eq(reviewPackages.projectId, projectId), eq(reviewPackages.requestId, input.requestId))).limit(1);
      if (previous) {
        if (previous.createdBy !== userId || previous.publicationId !== input.publicationId) refuse(409, "request_conflict", "Cet identifiant de requête est déjà utilisé pour un autre paquet.");
        return { id: previous.id, replayed: true };
      }
    }
    const pub = await publicationReviewState(tx, access, input.publicationId, projectId);
    if (!pub) refuse(404, "not_found", "Publication Studio inconnue dans ce projet.");
    if (!pub!.manifest) refuse(409, "manifest_missing", "Cette publication n'a pas de manifeste figé : actualisez-la dans Studio.");
    if (pub!.diffusionStatus !== "non-diffuse") refuse(409, "publication_diffused", "Cette publication est déjà diffusée : la revue porte sur une publication candidate.");
    const coordinatorId = input.coordinatorId ?? userId;
    const correctionsOwnerId = input.correctionsOwnerId ?? userId;
    await checkPeople(tx, access, coordinatorId, correctionsOwnerId);
    const id = newId("rvp");
    await tx.insert(reviewPackages).values({
      id, projectId, publicationId: pub!.id, studyId: pub!.studyId, variantId: pub!.variantId, lineageId: id, version: 1,
      title: input.title ?? pub!.title, purpose: input.purpose, expectedResponse: input.expectedResponse, questions: input.questions ?? [],
      coordinatorId, correctionsOwnerId, dueOn: input.dueOn ?? null, requestId: input.requestId ?? null, createdBy: userId,
    });
    await audit(tx, { actorId: userId, action: "review.package.created", target: { type: "project", id: projectId }, metadata: { projectId, packageId: id, publicationId: pub!.id, version: 1 }, ip });
    return { id, replayed: false };
  });
}

/** Modification d'un brouillon (identité, motif, questions, personnes, échéance) ; l'échéance et les personnes restent modifiables après le partage. */
export async function updateReviewPackage(projectId: string, packageId: string, userId: string, input: z.infer<typeof reviewPackageUpdateSchema>, ip: string | null) {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const { access } = await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId, true);
    const frozenFields = ["title", "purpose", "expectedResponse", "questions"] as const;
    if (pkg.status !== "brouillon" && frozenFields.some((k) => input[k] !== undefined)) {
      refuse(409, "package_frozen", "Un paquet partagé ne se modifie plus : présentez une nouvelle version.");
    }
    if (pkg.status === "remplace") refuse(409, "package_replaced", "Ce paquet est remplacé par une version plus récente.");
    const coordinatorId = input.coordinatorId ?? pkg.coordinatorId;
    const correctionsOwnerId = input.correctionsOwnerId ?? pkg.correctionsOwnerId;
    await checkPeople(tx, access, coordinatorId, correctionsOwnerId);
    await tx.update(reviewPackages).set({
      ...(input.title !== undefined ? { title: input.title } : {}), ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
      ...(input.expectedResponse !== undefined ? { expectedResponse: input.expectedResponse } : {}), ...(input.questions !== undefined ? { questions: input.questions } : {}),
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}), coordinatorId, correctionsOwnerId, updatedAt: new Date(),
    }).where(eq(reviewPackages.id, pkg.id));
    await audit(tx, { actorId: userId, action: "review.package.updated", target: { type: "project", id: projectId }, metadata: { projectId, packageId, fields: Object.keys(input) }, ip });
  });
}

/** Suppression d'un brouillon (jamais d'un paquet partagé : déclencheur `review_package_no_delete`). */
export async function deleteReviewDraft(projectId: string, packageId: string, userId: string, ip: string | null) {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId, true);
    if (pkg.status !== "brouillon") refuse(409, "package_shared", "Un paquet partagé reste conservé : clôturez-le, ou présentez une nouvelle version.");
    await tx.update(invitations).set({ status: "cancelled", respondedAt: new Date() })
      .where(and(eq(invitations.status, "pending"), inArray(invitations.reviewAssignmentId, tx.select({ id: reviewAssignments.id }).from(reviewAssignments).where(eq(reviewAssignments.packageId, pkg.id)))));
    await tx.delete(reviewPackages).where(eq(reviewPackages.id, pkg.id));
    await audit(tx, { actorId: userId, action: "review.package.deleted", target: { type: "project", id: projectId }, metadata: { projectId, packageId }, ip });
  });
}

interface ResolvedRecipient { personId: string; participationId: string; email: string; name: string }

/** Destinataire : participation existante du projet, sinon fiche contact de l'adresse (réutilisée si déjà inscrite comme contact). */
async function resolveRecipient(tx: Tx, projectId: string, input: ReviewAssignmentInput, userId: string): Promise<ResolvedRecipient> {
  if (input.participationId) {
    const [row] = await tx.select({ p: projectParticipations, person: people, userEmail: users.email, userName: users.displayName }).from(projectParticipations)
      .innerJoin(people, eq(people.id, projectParticipations.personId)).leftJoin(users, eq(users.id, people.userId))
      .where(and(eq(projectParticipations.id, input.participationId), eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"))).limit(1);
    if (!row) refuse(404, "not_found", "Participation inconnue dans ce projet.");
    const email = row!.userEmail ?? row!.person.workEmail;
    if (!email) refuse(400, "invalid_input", "Cette personne n'a pas d'adresse : l'invitation nominative est impossible.", { code: "recipient_email_missing" });
    return { personId: row!.person.id, participationId: row!.p.id, email: email!, name: row!.userName || row!.person.displayName || email! };
  }
  const email = input.email!;
  const [contact] = await tx.select({ personId: people.id, participationId: projectParticipations.id, name: people.displayName }).from(projectParticipations)
    .innerJoin(people, eq(people.id, projectParticipations.personId))
    .where(and(eq(projectParticipations.projectId, projectId), ne(projectParticipations.status, "terminee"), sql`${people.userId} IS NULL`, sql`lower(${people.workEmail}) = ${email}`)).limit(1);
  if (contact) return { personId: contact.personId, participationId: contact.participationId, email, name: contact.name ?? email };
  const personId = newId("per");
  const participationId = newId("ppa");
  const name = input.displayName ?? email;
  await tx.insert(people).values({ id: personId, displayName: name, workEmail: email, createdBy: userId });
  await tx.insert(projectParticipations).values({
    id: participationId, projectId, personId, status: "contact", createdBy: userId,
    businessRole: input.responsibility === "approbation" ? "Approbateur externe" : "Relecteur externe",
  });
  await audit(tx, { actorId: userId, action: "review.recipient.recorded", target: { type: "project", id: projectId }, metadata: { projectId, personId, participationId } });
  return { personId, participationId, email, name };
}

/** Aperçu de l'accès que recevra le destinataire (aucune écriture) : le paquet seul, aucun accès au projet. */
export async function previewReviewAssignment(projectId: string, packageId: string, userId: string, input: ReviewAssignmentInput) {
  await teamContext(projectId, userId, "send");
  const pkg = await packageOfProject(db, projectId, packageId);
  const now = new Date();
  const accessExpiresAt = input.accessExpiresAt ? new Date(input.accessExpiresAt) : defaultAccessExpiry(now);
  const problem = accessExpiryProblem(accessExpiresAt, now);
  if (problem) refuse(400, "invalid_input", problem, { code: "access_expiry_invalid" });
  return {
    package: { id: pkg.id, title: pkg.title, version: pkg.version, status: pkg.status },
    recipient: { email: input.email ?? null, participationId: input.participationId ?? null },
    preview: previewAccess({ responsibility: input.responsibility, permissions: permissionsOf(input.permissions), accessExpiresAt, invitationExpiresAt: new Date(now.getTime() + INVITATION_TTL_MS), dueOn: pkg.dueOn }),
  };
}

export interface InvitationMail { assignmentId: string; queued: boolean; reason: string | null; link?: string }

function assertMailAvailable(): void {
  const { mailer } = mailRuntime();
  if (reviewMailGate({ production: process.env["NODE_ENV"] === "production", transport: mailer.transport })) {
    refuse(503, "mail_required", "La revue externe exige un envoi de courriels configuré en production : aucune invitation n'est créée.");
  }
}

async function inviteAssignment(tx: Tx, pkg: PackageRow, projectLabel: string, a: AssignmentRow, email: string, invitedBy: string, ip: string | null, locale: MailLocale): Promise<InvitationMail> {
  const created = await createOrRenewReviewInvitation(tx, { email, assignment: a, invitedBy, ip });
  const link = publicLink(PUBLIC_PATHS.invitation, created.token);
  const mail = await sendAccountMail(email, "invitation", {
    link, reviewPackage: `${pkg.title} (v${pkg.version})`, projectName: projectLabel,
    role: a.responsibility === "approbation" ? (locale === "en" ? "approval" : "approbation") : (locale === "en" ? "review" : "relecture"),
    expiresAt: formatDate(created.invitation.expiresAt, locale), accessExpiresAt: formatDate(a.accessExpiresAt, locale),
  }, locale, tx);
  return { assignmentId: a.id, queued: mail.queued, reason: mail.reason, ...(mail.queued ? {} : { link }) };
}

const emailOfAssignment = async (tx: Tx, a: AssignmentRow): Promise<string | null> => {
  const [row] = await tx.select({ work: people.workEmail, account: users.email }).from(people).leftJoin(users, eq(users.id, people.userId)).where(eq(people.id, a.personId)).limit(1);
  return row?.account ?? row?.work ?? null;
};

/** Ajout d'un destinataire nommé ; si le paquet est déjà partagé, l'invitation part aussitôt (sinon au partage). */
export async function addReviewAssignment(projectId: string, packageId: string, userId: string, input: ReviewAssignmentInput, ip: string | null, locale: MailLocale) {
  assertMailAvailable();
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const { access } = await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId, true);
    if (pkg.status !== "brouillon" && pkg.status !== "partage") refuse(409, "package_not_open", "Ce paquet est clos ou remplacé : invitez sur la version en cours.");
    const now = new Date();
    const accessExpiresAt = input.accessExpiresAt ? new Date(input.accessExpiresAt) : defaultAccessExpiry(now);
    const problem = accessExpiryProblem(accessExpiresAt, now);
    if (problem) refuse(400, "invalid_input", problem, { code: "access_expiry_invalid" });
    const recipient = await resolveRecipient(tx, projectId, input, userId);
    const [owner] = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, recipient.personId), eq(people.userId, access.ownerId))).limit(1);
    if (owner) refuse(422, "review_rule", "Le propriétaire du projet ne se fait pas inviter en revue externe.");
    const [dup] = await tx.select({ id: reviewAssignments.id }).from(reviewAssignments).where(and(
      eq(reviewAssignments.packageId, pkg.id), eq(reviewAssignments.participationId, recipient.participationId), eq(reviewAssignments.responsibility, input.responsibility),
      sql`${reviewAssignments.status} NOT IN ('annulee', 'remplacee')`,
    )).limit(1);
    if (dup) refuse(409, "assignment_exists", "Cette personne a déjà cette responsabilité sur ce paquet.", { assignmentId: dup.id });
    const p = permissionsOf(input.permissions);
    const id = newId("rva");
    const [a] = await tx.insert(reviewAssignments).values({
      id, packageId: pkg.id, projectId, participationId: recipient.participationId, personId: recipient.personId, responsibility: input.responsibility,
      canComment: p.comment, canAttach: p.attach, canDownload: p.download, canExport: p.export, accessExpiresAt, createdBy: userId,
    }).returning();
    await audit(tx, { actorId: userId, action: "review.assignment.created", target: { type: "project", id: projectId }, metadata: { projectId, packageId: pkg.id, assignmentId: id, responsibility: input.responsibility, permissions: p } , ip });
    const mail = pkg.status === "partage" ? await inviteAssignment(tx, pkg, `${access.code} — ${access.name}`, a!, recipient.email, userId, ip, locale) : null;
    return { assignmentId: id, mail };
  });
}

/** Révocation : l'accès de revue cesse aussitôt (404 au destinataire) ; ses constats restent attribués ; l'invitation en attente est annulée. */
export async function revokeReviewAssignment(projectId: string, packageId: string, assignmentId: string, userId: string, reason: string, ip: string | null) {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId);
    const [a] = await tx.select().from(reviewAssignments).where(and(eq(reviewAssignments.id, assignmentId), eq(reviewAssignments.packageId, pkg.id))).limit(1).for("update");
    if (!a) return reviewNotFound();
    if (a.status === "annulee" || a.status === "remplacee") refuse(409, "assignment_closed", "Cette affectation est déjà annulée ou remplacée.");
    const now = new Date();
    await tx.update(reviewAssignments).set({ status: "annulee", revokedAt: now, revokedBy: userId, revokeReason: reason, updatedAt: now }).where(eq(reviewAssignments.id, a.id));
    await tx.update(invitations).set({ status: "cancelled", respondedAt: now }).where(and(eq(invitations.reviewAssignmentId, a.id), eq(invitations.status, "pending")));
    await audit(tx, { actorId: userId, action: "review.assignment.revoked", target: { type: "project", id: projectId }, metadata: { projectId, packageId: pkg.id, assignmentId: a.id }, ip });
  });
}

/** Nouveau lien pour une affectation pas encore acceptée (renvoi : nouveau jeton, l'ancien ne vaut plus). */
export async function resendReviewInvitation(projectId: string, packageId: string, assignmentId: string, userId: string, ip: string | null, locale: MailLocale) {
  assertMailAvailable();
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const { access } = await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId);
    if (pkg.status !== "partage") refuse(409, "package_not_shared", "Les invitations partent au partage du paquet.");
    const [a] = await tx.select().from(reviewAssignments).where(and(eq(reviewAssignments.id, assignmentId), eq(reviewAssignments.packageId, pkg.id))).limit(1).for("update");
    if (!a) return reviewNotFound();
    if (a.userId) refuse(409, "already_accepted", "Cette invitation a déjà été acceptée.");
    if (a.status !== "en-attente" && a.status !== "en-cours") refuse(409, "assignment_closed", "Cette affectation n'est plus attendue.");
    const email = await emailOfAssignment(tx, a);
    if (!email) refuse(400, "invalid_input", "Adresse du destinataire inconnue.");
    return { mail: await inviteAssignment(tx, pkg, `${access.code} — ${access.name}`, a, email!, userId, ip, locale) };
  });
}

/**
 * Partage : copie figée de la publication candidate (révision, empreinte, manifeste, fichiers régénérés et vérifiés
 * contre les empreintes du manifeste, rangés dans `volumes`), puis invitations. Une nouvelle version exige un manifeste
 * différent de celui de la version remplacée et remplace celle-ci : ses affectations passent `remplacee` et sont
 * reconduites sur la nouvelle version (une identité déjà vérifiée n'est pas réinvitée).
 */
export async function shareReviewPackage(projectId: string, packageId: string, userId: string, ip: string | null, locale: MailLocale) {
  assertMailAvailable();
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    const { access } = await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId, true);
    if (pkg.status !== "brouillon") refuse(409, "invalid_transition", "Ce paquet est déjà partagé.");
    const frozen = await frozenPublicationFiles(tx, pkg.publicationId, projectId);
    if (!frozen) refuse(409, "manifest_missing", "La publication n'a pas de manifeste figé : actualisez-la dans Studio.");
    const pub = frozen!.publication;
    const work = pub.workStatus ?? "brouillon";
    if (work !== "en-revue") refuse(409, "publication_not_in_review", "La publication doit être soumise (en revue) dans Studio avant d'être partagée en revue externe.", { workStatus: work });
    if ((pub.diffusionStatus ?? "non-diffuse") !== "non-diffuse") refuse(409, "publication_diffused", "Cette publication est déjà diffusée.");
    if (frozen!.mismatch.length) refuse(409, "frozen_files_mismatch", "Les documents régénérés ne correspondent pas aux empreintes du manifeste : actualisez la publication dans Studio.", { formats: frozen!.mismatch });
    let previous: PackageRow | null = null;
    if (pkg.supersedesPackageId) {
      previous = await packageOfProject(tx, projectId, pkg.supersedesPackageId, true);
      if (previous.manifestHash === pub.manifestHash) refuse(409, "package_unchanged", "Le manifeste de la publication n'a pas changé depuis la version remplacée : rien de nouveau à revoir.");
      if (previous.status !== "partage" && previous.status !== "clos") refuse(409, "package_replaced", "La version précédente est déjà remplacée.");
    }
    const now = new Date();
    const files: StudioPackageFile[] = [];
    for (const f of frozen!.files) {
      if (sha256(f.body) !== f.sha256) throw new Error("review_package_hash_drift");
      await tx.insert(volumes).values({ id: f.sha256, mime: f.mime, size: f.body.byteLength, content: f.body, createdAt: now }).onConflictDoNothing();
      files.push({ format: f.format, fileName: f.fileName, mime: f.mime, size: f.body.byteLength, sha256: f.sha256 });
    }
    await tx.update(reviewPackages).set({
      status: "partage", revisionId: pub.revisionId, documentHash: pub.documentHash, manifest: pub.manifest, manifestHash: pub.manifestHash, files,
      sharedAt: now, sharedBy: userId, updatedAt: now,
    }).where(eq(reviewPackages.id, pkg.id));
    await audit(tx, { actorId: userId, action: "review.package.shared", target: { type: "project", id: projectId }, metadata: { projectId, packageId: pkg.id, version: pkg.version, manifestHash: pub.manifestHash, revisionId: pub.revisionId }, ip });
    const label = `${access.code} — ${access.name}`;
    const shared = { ...pkg, status: "partage" as const, files, manifestHash: pub.manifestHash };
    const mails: InvitationMail[] = [];
    if (previous) {
      await tx.update(reviewPackages).set({ status: "remplace", replacedAt: now, replacedByPackageId: pkg.id, updatedAt: now }).where(eq(reviewPackages.id, previous.id));
      const carried = await tx.select().from(reviewAssignments).where(and(eq(reviewAssignments.packageId, previous.id), sql`${reviewAssignments.status} NOT IN ('annulee', 'remplacee')`)).for("update");
      for (const old of carried) {
        await tx.update(reviewAssignments).set({ status: "remplacee", updatedAt: now }).where(eq(reviewAssignments.id, old.id));
        await tx.update(invitations).set({ status: "cancelled", respondedAt: now }).where(and(eq(invitations.reviewAssignmentId, old.id), eq(invitations.status, "pending")));
        const [already] = await tx.select({ id: reviewAssignments.id }).from(reviewAssignments).where(and(eq(reviewAssignments.packageId, pkg.id), eq(reviewAssignments.participationId, old.participationId), eq(reviewAssignments.responsibility, old.responsibility), sql`${reviewAssignments.status} NOT IN ('annulee', 'remplacee')`)).limit(1);
        if (already) continue;
        await tx.insert(reviewAssignments).values({
          id: newId("rva"), packageId: pkg.id, projectId, participationId: old.participationId, personId: old.personId, userId: old.userId, acceptedAt: old.userId ? now : null,
          responsibility: old.responsibility, canComment: old.canComment, canAttach: old.canAttach, canDownload: old.canDownload, canExport: old.canExport,
          accessExpiresAt: old.accessExpiresAt.getTime() > now.getTime() ? old.accessExpiresAt : defaultAccessExpiry(now), carriedFromAssignmentId: old.id, createdBy: userId,
        });
      }
      await audit(tx, { actorId: userId, action: "review.package.superseded", target: { type: "project", id: projectId }, metadata: { projectId, packageId: previous.id, replacedBy: pkg.id, carried: carried.length }, ip });
    }
    // Invitations : chaque affectation attendue dont l'identité n'est pas encore vérifiée.
    const waiting = await tx.select().from(reviewAssignments).where(and(eq(reviewAssignments.packageId, pkg.id), sql`${reviewAssignments.userId} IS NULL`, sql`${reviewAssignments.status} IN ('en-attente', 'en-cours')`));
    for (const a of waiting) {
      const email = await emailOfAssignment(tx, a);
      if (email) mails.push(await inviteAssignment(tx, shared, label, a, email, userId, ip, locale));
    }
    return { packageId: pkg.id, files, manifestHash: pub.manifestHash, invitations: mails };
  });
}

/** Nouvelle version (brouillon) d'un paquet partagé ou clos ; partagée, elle remplace la précédente. */
export async function createReviewVersion(projectId: string, packageId: string, userId: string, input: z.infer<typeof reviewVersionSchema>, ip: string | null) {
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId, true);
    if (pkg.status !== "partage" && pkg.status !== "clos") refuse(409, "invalid_transition", "Seul un paquet partagé ou clos reçoit une nouvelle version.");
    const [next] = await tx.select({ id: reviewPackages.id }).from(reviewPackages).where(eq(reviewPackages.supersedesPackageId, pkg.id)).limit(1);
    if (next) refuse(409, "version_exists", "Une nouvelle version de ce paquet existe déjà.", { packageId: next.id });
    const id = newId("rvp");
    await tx.insert(reviewPackages).values({
      id, projectId, publicationId: pkg.publicationId, studyId: pkg.studyId, variantId: pkg.variantId, lineageId: pkg.lineageId, version: pkg.version + 1,
      supersedesPackageId: pkg.id, title: input.title ?? pkg.title, purpose: input.purpose ?? pkg.purpose, expectedResponse: input.expectedResponse ?? pkg.expectedResponse,
      questions: input.questions ?? pkg.questions, coordinatorId: pkg.coordinatorId, correctionsOwnerId: pkg.correctionsOwnerId,
      dueOn: input.dueOn === undefined ? pkg.dueOn : input.dueOn, createdBy: userId,
    });
    await audit(tx, { actorId: userId, action: "review.package.version_created", target: { type: "project", id: projectId }, metadata: { projectId, packageId: id, supersedes: pkg.id, version: pkg.version + 1 }, ip });
    return { id, version: pkg.version + 1 };
  });
}

/** Clôture d'un paquet partagé (motif requis) : plus aucune écriture de revue ; la lecture reste. */
export async function closeReviewPackage(projectId: string, packageId: string, userId: string, reason: string, ip: string | null) {
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    await teamContext(projectId, userId, "send", tx);
    const pkg = await packageOfProject(tx, projectId, packageId, true);
    if (pkg.status !== "partage") refuse(409, "invalid_transition", "Seul un paquet partagé se clôt.");
    const now = new Date();
    await tx.update(reviewPackages).set({ status: "clos", closedAt: now, closedBy: userId, closeReason: reason, updatedAt: now }).where(eq(reviewPackages.id, pkg.id));
    await audit(tx, { actorId: userId, action: "review.package.closed", target: { type: "project", id: projectId }, metadata: { projectId, packageId }, ip });
  });
}

/** Note interne de l'équipe (jamais servie aux destinataires). */
export async function addReviewNote(projectId: string, packageId: string, userId: string, body: string) {
  await teamContext(projectId, userId, "follow");
  const pkg = await packageOfProject(db, projectId, packageId);
  const id = newId("rvn");
  await db.insert(reviewPackageNotes).values({ id, packageId: pkg.id, authorId: userId, body });
  return { id };
}

/** Réponse de l'équipe dans le fil d'un constat : audience `revue`, lue par les destinataires du paquet. */
export async function teamReplyToFinding(projectId: string, packageId: string, observationId: string, userId: string, body: string) {
  const { access } = await teamContext(projectId, userId, "follow");
  if (access.role === "support") refuse(403, "support_read_only", "Accès support en lecture seule.");
  const pkg = await packageOfProject(db, projectId, packageId);
  const lineage = await lineageOf(db, pkg.lineageId);
  const [finding] = (await findingsOf(db, lineage.map((p) => p.id))).filter((f) => f.observationId === observationId);
  if (!finding) return reviewNotFound();
  const [root] = await db.select({ reviewPackageId: studioComments.reviewPackageId }).from(studioComments).where(eq(studioComments.id, observationId)).limit(1);
  const id = newId("studio_comment");
  await db.insert(studioComments).values({ id, variantId: finding.variantId, revisionId: null, objectIds: [], parentId: observationId, authorId: userId, body, audience: "revue", reviewPackageId: root!.reviewPackageId });
  return { id };
}

export { ReviewError };
