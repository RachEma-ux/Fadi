/**
 * Revue externe (phase 4) — socle commun aux routes de l'équipe (`/projects/:id/reviews`) et du destinataire
 * (`/reviews`) : erreur de requête, lectures (paquet, affectations, constats d'une lignée), garde d'accès borné au
 * paquet `loadReviewAccess`, invitations de finalité `review_package` (création, autorité de l'invitant, activation par
 * l'identité vérifiée). Règles pures : `review-rules.ts`.
 *
 * Frontière : la garde de revue ne passe JAMAIS par `loadProjectAccess` ni par un rôle de projet ; un destinataire
 * externe n'a qu'une participation sans rôle (aucun accès au projet, vue `project_effective_access`) et des affectations.
 */
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  invitations, people, projectParticipations, projects, reviewAssignments, reviewFindings, reviewPackages, studioComments, studioObservations, users,
  type ReviewAttachment,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { audit } from "./audit.js";
import { INVITATION_TTL_MS } from "./account.js";
import { newId } from "./ids.js";
import { loadProjectAccess } from "./owned-project.js";
import { isProjectResponsible } from "./project-responsables.js";
import { randomToken, sha256Hex } from "./security/tokens.js";
import { isOpenAssignment, reviewAccessRefusal, type AssignmentState, type ReviewPermissions } from "./review-rules.js";

export type Executor = Pick<typeof db, "select">;
export type PackageRow = typeof reviewPackages.$inferSelect;
export type AssignmentRow = typeof reviewAssignments.$inferSelect;
type InvitationRow = typeof invitations.$inferSelect;

export class ReviewError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super("review_request_refused"); }
}
export const reviewNotFound = (): never => { throw new ReviewError(404, { error: "not_found" }); };
export const refuse = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): never => {
  throw new ReviewError(status, { error, message, ...extra });
};

export const permissionsOfRow = (a: Pick<AssignmentRow, "canComment" | "canAttach" | "canDownload" | "canExport">): ReviewPermissions =>
  ({ view: true, comment: a.canComment, attach: a.canAttach, download: a.canDownload, export: a.canExport });
export const stateOfRow = (a: AssignmentRow): AssignmentState =>
  ({ responsibility: a.responsibility, status: a.status, revokedAt: a.revokedAt, accessExpiresAt: a.accessExpiresAt, permissions: permissionsOfRow(a) });

// ---------------------------------------------------------------------------------------------------------------------
// Garde d'accès borné au paquet

export interface ReviewAccess {
  pkg: PackageRow;
  /** Affectations valides de ce compte sur ce paquet (au moins une). */
  assignments: AssignmentRow[];
  project: { id: string; code: string; name: string; editingLock: typeof projects.$inferSelect["editingLock"] };
}

/**
 * L'accès de revue de `userId` au paquet `packageId`, revérifié à chaque requête : affectation acceptée par ce compte,
 * ni révoquée, ni annulée, ni expirée ; participation active ; compte actif ; paquet partagé (clos ou remplacé : lecture
 * de l'historique). `null` sinon — les routes répondent 404 sans rien révéler. `forUpdate` verrouille les affectations
 * (écritures du destinataire : une révocation concurrente attend, ou l'écriture voit la révocation).
 */
export async function loadReviewAccess(packageId: string, userId: string, executor: Executor | Tx = db, forUpdate = false): Promise<ReviewAccess | null> {
  if (typeof packageId !== "string" || !packageId || packageId.length > 128) return null;
  const query = executor.select({ a: reviewAssignments, pkg: reviewPackages, participationStatus: projectParticipations.status, accountStatus: users.status, deletion: users.deletionRequestedAt })
    .from(reviewAssignments)
    .innerJoin(reviewPackages, eq(reviewPackages.id, reviewAssignments.packageId))
    .innerJoin(projectParticipations, eq(projectParticipations.id, reviewAssignments.participationId))
    .innerJoin(users, eq(users.id, reviewAssignments.userId))
    .where(and(eq(reviewAssignments.packageId, packageId), eq(reviewAssignments.userId, userId)));
  const rows = forUpdate ? await query.for("update", { of: reviewAssignments }) : await query;
  const now = new Date();
  const valid = rows.filter((r) => !r.deletion && reviewAccessRefusal({ ...stateOfRow(r.a), accepted: r.a.userId === userId }, {
    packageStatus: r.pkg.status, participationStatus: r.participationStatus, accountStatus: r.accountStatus, now,
  }) === null);
  if (!valid.length) return null;
  const pkg = valid[0]!.pkg;
  const [project] = await executor.select({ id: projects.id, code: projects.code, name: projects.name, editingLock: projects.editingLock }).from(projects).where(eq(projects.id, pkg.projectId)).limit(1);
  if (!project) return null;
  return { pkg, assignments: valid.map((r) => r.a), project };
}

/** Paquets auxquels ce compte a aujourd'hui un accès de revue valide (identifiants). */
export async function accessiblePackageIds(userId: string, executor: Executor = db): Promise<string[]> {
  const rows = await executor.select({ id: reviewAssignments.packageId }).from(reviewAssignments).where(eq(reviewAssignments.userId, userId));
  const out: string[] = [];
  for (const id of [...new Set(rows.map((r) => r.id))]) if (await loadReviewAccess(id, userId, executor)) out.push(id);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectures

export async function packageOfProject(q: Executor | Tx, projectId: string, packageId: string, forUpdate = false): Promise<PackageRow> {
  const query = q.select().from(reviewPackages).where(and(eq(reviewPackages.id, packageId), eq(reviewPackages.projectId, projectId))).limit(1);
  const [row] = forUpdate ? await query.for("update") : await query;
  return row ?? reviewNotFound();
}

export async function lineageOf(q: Executor | Tx, lineageId: string): Promise<PackageRow[]> {
  return q.select().from(reviewPackages).where(eq(reviewPackages.lineageId, lineageId)).orderBy(asc(reviewPackages.version));
}

export interface FindingRow {
  observationId: string; packageId: string; assignmentId: string | null; revisionId: string; documentFormat: string | null; documentSha256: string | null;
  attachments: ReviewAttachment[]; createdAt: Date; statut: string; correctionRevisionId: string | null; recontroleRevisionId: string | null;
  responsableId: string; body: string; authorId: string; objectIds: string[]; variantId: string; vueRef: string | null;
}
/** Constats des paquets donnés (rattachement, observation, texte d'origine). */
export async function findingsOf(q: Executor | Tx, packageIds: string[]): Promise<FindingRow[]> {
  if (!packageIds.length) return [];
  return q.select({
    observationId: reviewFindings.observationId, packageId: reviewFindings.packageId, assignmentId: reviewFindings.assignmentId, revisionId: reviewFindings.revisionId,
    documentFormat: reviewFindings.documentFormat, documentSha256: reviewFindings.documentSha256, attachments: reviewFindings.attachments, createdAt: reviewFindings.createdAt,
    statut: studioObservations.statut, correctionRevisionId: studioObservations.correctionRevisionId, recontroleRevisionId: studioObservations.recontroleRevisionId,
    responsableId: studioObservations.responsableId, body: studioComments.body, authorId: studioComments.authorId, objectIds: studioComments.objectIds,
    variantId: studioComments.variantId, vueRef: studioObservations.vueRef,
  }).from(reviewFindings)
    .innerJoin(studioObservations, eq(studioObservations.commentId, reviewFindings.observationId))
    .innerJoin(studioComments, eq(studioComments.id, reviewFindings.observationId))
    .where(inArray(reviewFindings.packageId, packageIds))
    .orderBy(asc(reviewFindings.createdAt), asc(reviewFindings.observationId));
}

/** Réponses d'un fil de constat : audience `revue` seulement (jamais un fil de l'équipe), non supprimées. */
export async function repliesOf(q: Executor | Tx, observationIds: string[]) {
  if (!observationIds.length) return [];
  return q.select({ id: studioComments.id, parentId: studioComments.parentId, body: studioComments.body, authorId: studioComments.authorId, createdAt: studioComments.createdAt })
    .from(studioComments)
    .where(and(inArray(studioComments.parentId, observationIds), eq(studioComments.audience, "revue"), isNull(studioComments.deletedAt)))
    .orderBy(asc(studioComments.createdAt), asc(studioComments.id));
}

/** Libellés des comptes (nom affiché, sinon adresse) — jamais d'autre donnée du compte. */
export async function accountLabels(q: Executor | Tx, ids: (string | null)[]): Promise<Map<string, { label: string; email: string }>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, { label: r.displayName || r.email, email: r.email }]));
}

// ---------------------------------------------------------------------------------------------------------------------
// Autorité de l'équipe

/**
 * Expéditeur d'une revue externe : le propriétaire du projet, ou un responsable du projet (`isProjectResponsible` :
 * coordinateur de portée projet ou responsabilité `diriger`, participation active). Un éditeur sans responsabilité ne
 * partage rien hors de l'équipe. L'accès support n'expédie jamais.
 */
export async function senderAuthorized(projectId: string, userId: string, executor: Executor = db): Promise<boolean> {
  const access = await loadProjectAccess(projectId, userId, executor);
  if (!access || access.role === "support") return false;
  return access.role === "proprietaire" || await isProjectResponsible(projectId, userId, executor);
}

// ---------------------------------------------------------------------------------------------------------------------
// Invitations de finalité `review_package`

export interface CreatedReviewInvitation { invitation: InvitationRow; token: string; resent: boolean }

/** Crée l'invitation de l'affectation, ou renouvelle celle en attente (nouveau jeton, nouvelle échéance ; aucun doublon). */
export async function createOrRenewReviewInvitation(tx: Tx, input: { email: string; assignment: AssignmentRow; invitedBy: string; ip?: string | null }): Promise<CreatedReviewInvitation> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await tx.update(invitations).set({ status: "expired" })
    .where(and(eq(invitations.status, "pending"), sql`${invitations.expiresAt} <= now()`, eq(invitations.email, input.email)));
  const [existing] = await tx.select().from(invitations).where(and(
    eq(invitations.purpose, "review_package"), eq(invitations.status, "pending"), eq(invitations.reviewAssignmentId, input.assignment.id),
  )).limit(1).for("update");
  const meta = { purpose: "review_package", projectId: input.assignment.projectId, packageId: input.assignment.packageId, assignmentId: input.assignment.id, responsibility: input.assignment.responsibility };
  if (existing) {
    const [row] = await tx.update(invitations).set({ tokenHash: sha256Hex(token), expiresAt, accessExpiresAt: input.assignment.accessExpiresAt, invitedBy: input.invitedBy })
      .where(eq(invitations.id, existing.id)).returning();
    await audit(tx, { actorId: input.invitedBy, action: "invitation.resent", target: { type: "invitation", id: existing.id }, metadata: meta, ip: input.ip });
    return { invitation: row!, token, resent: true };
  }
  const [row] = await tx.insert(invitations).values({
    id: newId("inv"), purpose: "review_package", email: input.email, tokenHash: sha256Hex(token), invitedBy: input.invitedBy, expiresAt,
    accessExpiresAt: input.assignment.accessExpiresAt, reviewAssignmentId: input.assignment.id,
  }).returning();
  await tx.update(reviewAssignments).set({ invitationId: row!.id, updatedAt: new Date() }).where(eq(reviewAssignments.id, input.assignment.id));
  await audit(tx, { actorId: input.invitedBy, action: "invitation.created", target: { type: "invitation", id: row!.id }, metadata: meta, ip: input.ip });
  return { invitation: row!, token, resent: false };
}

/**
 * Autorité d'une invitation de revue, revérifiée à l'acceptation : invitant toujours actif et toujours expéditeur
 * autorisé du projet, affectation encore attendue et non révoquée, paquet partagé et non remplacé.
 */
export async function reviewInviterStillAuthorized(inv: Pick<InvitationRow, "invitedBy" | "reviewAssignmentId">, executor: Executor = db): Promise<boolean> {
  if (!inv.invitedBy || !inv.reviewAssignmentId) return false;
  const [row] = await executor.select({ a: reviewAssignments, pkgStatus: reviewPackages.status }).from(reviewAssignments)
    .innerJoin(reviewPackages, eq(reviewPackages.id, reviewAssignments.packageId)).where(eq(reviewAssignments.id, inv.reviewAssignmentId)).limit(1);
  if (!row || row.a.revokedAt || !isOpenAssignment(row.a.status) || row.pkgStatus !== "partage") return false;
  const [inviter] = await executor.select({ status: users.status, deletion: users.deletionRequestedAt }).from(users).where(eq(users.id, inv.invitedBy)).limit(1);
  if (!inviter || inviter.status !== "active" || inviter.deletion) return false;
  return senderAuthorized(row.a.projectId, inv.invitedBy, executor);
}

/** Refus d'activation propre à la revue : la fiche visée est déjà liée à un autre compte. */
export class ReviewActivationRefused extends Error {
  constructor(readonly code: "identity_conflict") { super(code); }
}

/**
 * Activation d'une invitation de revue acceptée (déjà vérifiée par `invitationRefusal` : bonne adresse, invitant
 * habilité). L'identité vérifiée est liée à la fiche personne de la participation : fiche sans compte → liée ; fiche
 * déjà liée à CE compte → rien ; fiche liée à un autre compte → refus (`identity_conflict`, rien n'est activé). Si le
 * compte a déjà sa propre fiche, l'affectation passe sur la participation de cette fiche dans le projet (créée au
 * besoin), sans rôle de projet. Idempotente.
 */
export async function activateReviewAssignment(tx: Tx, inv: InvitationRow, userId: string, ip: string | null): Promise<string | null> {
  if (inv.purpose !== "review_package" || !inv.reviewAssignmentId) return null;
  const [a] = await tx.select().from(reviewAssignments).where(eq(reviewAssignments.id, inv.reviewAssignmentId)).limit(1).for("update");
  if (!a) return null;
  if (a.userId === userId) return a.packageId;
  if (a.userId && a.userId !== userId) throw new ReviewActivationRefused("identity_conflict");
  const [person] = await tx.select().from(people).where(eq(people.id, a.personId)).limit(1).for("update");
  if (!person) return null;
  if (person.userId && person.userId !== userId) throw new ReviewActivationRefused("identity_conflict");
  let participationId = a.participationId;
  let personId = a.personId;
  if (!person.userId) {
    const [own] = await tx.select({ id: people.id }).from(people).where(eq(people.userId, userId)).limit(1);
    if (!own) {
      await tx.update(people).set({ userId, updatedAt: new Date() }).where(eq(people.id, person.id));
    } else {
      // Le compte a déjà sa fiche : sa participation dans le projet (existante, ou créée sans rôle) porte l'affectation.
      personId = own.id;
      const [current] = await tx.select({ id: projectParticipations.id }).from(projectParticipations)
        .where(and(eq(projectParticipations.projectId, a.projectId), eq(projectParticipations.personId, own.id), ne(projectParticipations.status, "terminee"))).limit(1);
      if (current) {
        participationId = current.id;
      } else {
        await tx.update(projectParticipations).set({ personId: own.id, updatedAt: new Date() }).where(eq(projectParticipations.id, a.participationId));
      }
    }
  }
  await tx.update(projectParticipations).set({ status: "active", startsOn: sql`coalesce(${projectParticipations.startsOn}, current_date)`, updatedAt: new Date() })
    .where(and(eq(projectParticipations.id, participationId), eq(projectParticipations.status, "contact")));
  await tx.update(reviewAssignments).set({ userId, personId, participationId, acceptedAt: new Date(), updatedAt: new Date() }).where(eq(reviewAssignments.id, a.id));
  await audit(tx, { actorId: userId, action: "review.assignment.accepted", target: { type: "project", id: a.projectId }, metadata: { projectId: a.projectId, packageId: a.packageId, assignmentId: a.id, invitationId: inv.id, responsibility: a.responsibility }, ip });
  return a.packageId;
}

/** Paquet visé par une invitation de revue (vue publique de l'invitation, redirection après acceptation). */
export async function reviewInvitationContext(assignmentId: string | null, executor: Executor = db): Promise<{ packageId: string; title: string; version: number; projectLabel: string; responsibility: string; accessExpiresAt: Date } | null> {
  if (!assignmentId) return null;
  const [row] = await executor.select({ packageId: reviewPackages.id, title: reviewPackages.title, version: reviewPackages.version, code: projects.code, name: projects.name, responsibility: reviewAssignments.responsibility, accessExpiresAt: reviewAssignments.accessExpiresAt })
    .from(reviewAssignments).innerJoin(reviewPackages, eq(reviewPackages.id, reviewAssignments.packageId)).innerJoin(projects, eq(projects.id, reviewAssignments.projectId))
    .where(eq(reviewAssignments.id, assignmentId)).limit(1);
  return row ? { packageId: row.packageId, title: row.title, version: row.version, projectLabel: `${row.code} — ${row.name}`, responsibility: row.responsibility, accessExpiresAt: row.accessExpiresAt } : null;
}

/** Refus de suppression d'un projet : un paquet de revue partagé ne s'efface jamais (déclencheur `review_package_no_delete`). */
export const REVUES_PARTAGEES_MESSAGE = "Ce projet porte des paquets de revue externe partagés : ils sont conservés et le projet ne peut pas être supprimé.";
export async function projectHasSharedReviewPackages(q: Executor | Tx, projectId: string): Promise<boolean> {
  const [row] = await q.select({ id: reviewPackages.id }).from(reviewPackages).where(and(eq(reviewPackages.projectId, projectId), ne(reviewPackages.status, "brouillon"))).limit(1);
  return row !== undefined;
}
