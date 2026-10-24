/**
 * Revue externe (phase 4) — espace du destinataire (`/reviews`) : liste de ses revues, paquet figé (identité, objet,
 * échéance, actions permises, statut enregistré par Studio), fichiers figés, constats rattachés au document, aux objets
 * et à la révision exacte du paquet, réponses dans les fils, recontrôle, réponse de relecture, décision d'approbation par
 * un approbateur nommé (transitions Studio), rapport exporté. Chaque requête repasse par `loadReviewAccess` : aucune
 * route ne lit le projet, ses autres données ni ses notes internes.
 */
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { validateStudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import {
  projects as projectsTable, reviewAssignments, reviewFindings, reviewPackages as reviewPackagesTable, studioComments, studioObservationEvents, studioObservations, studioRevisions, studioStudies, studioVariants, volumes,
  type ReviewAttachment,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { audit } from "./audit.js";
import { newId } from "./ids.js";
import {
  ATTACHMENT_MAX_COUNT, attachmentProblem, decisionBlock, fileDelivery, isOpenAssignment, isOpenFinding, responseRefusal, reviewActions,
  safeFileName, type DecisionContext, type ReviewAction,
} from "./review-rules.js";
import {
  accessiblePackageIds, accountLabels, findingsOf, lineageOf, loadReviewAccess, refuse, repliesOf, reviewNotFound, stateOfRow,
  type ReviewAccess,
} from "./reviews-core.js";
import { estAncetreOuEgale, statutApres } from "./studio-observations.js";
import { revisionParents } from "./studio-commentaires.js";
import { StudioRequestError } from "./studio-commands.js";
import { decideStudioPublicationByReview, publicationReviewState } from "./studio-publications.js";
import { sha256 } from "./studio-publication-statuts.js";
import type { Querier } from "./step-rows.js";

const STUDIO_OBJECT_ID = z.string().min(1).max(128);
export const reviewFindingSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Document du paquet visé (format d'un fichier figé). */
  document: z.enum(["svg", "dxf", "ifc", "pdf"]).optional(),
  objectIds: z.array(STUDIO_OBJECT_ID).max(50).optional(),
  /** Repère dans le document (feuille, zone…), déclaré par le destinataire. */
  location: z.string().trim().min(1).max(256).optional(),
  attachments: z.array(z.object({
    name: z.string().trim().min(1).max(200), mime: z.string().max(100), contentBase64: z.string().max(3_000_000),
  }).strict()).max(ATTACHMENT_MAX_COUNT).optional(),
}).strict();
export const reviewRecipientReplySchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
export const reviewRecheckSchema = z.object({ outcome: z.enum(["levee", "maintenue"]), note: z.string().trim().min(1).max(2000).optional() }).strict();
export const reviewResponseSchema = z.object({ result: z.enum(["constats", "satisfaisante"]), note: z.string().trim().min(1).max(4000).optional() }).strict();
export const reviewDecisionSchema = z.object({
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  comment: z.string().trim().min(1).max(2000).optional(),
}).strict();

async function decisionContext(access: ReviewAccess, q: Querier = db): Promise<DecisionContext> {
  const pub = await publicationReviewState(q, access.project, access.pkg.publicationId, access.project.id);
  return {
    publicationWorkStatus: pub?.workStatus ?? "brouillon", publicationDiffusionStatus: pub?.diffusionStatus ?? "non-diffuse",
    publicationMatchesPackage: !!pub && access.pkg.manifestHash !== null && pub.manifestHash === access.pkg.manifestHash,
  };
}
const actionsOf = (access: ReviewAccess, decision: DecisionContext): ReviewAction[] => reviewActions(access.assignments.map(stateOfRow), access.pkg.status, decision);

async function required(packageId: string, userId: string, executor: Pick<typeof db, "select"> | Tx = db, forUpdate = false): Promise<ReviewAccess> {
  return (await loadReviewAccess(packageId, userId, executor, forUpdate)) ?? reviewNotFound();
}
function need(actions: readonly ReviewAction[], action: ReviewAction, message: string): void {
  if (!actions.includes(action)) refuse(403, "forbidden", message, { action });
}

/** Mes revues : paquets auxquels j'ai aujourd'hui un accès de revue valide. */
export async function listMyReviews(userId: string) {
  const ids = await accessiblePackageIds(userId);
  const out = [];
  for (const id of ids) {
    const access = (await loadReviewAccess(id, userId))!;
    const decision = await decisionContext(access);
    out.push({
      id, title: access.pkg.title, version: access.pkg.version, status: access.pkg.status, dueOn: access.pkg.dueOn, projectLabel: `${access.project.code} — ${access.project.name}`,
      responsibilities: [...new Set(access.assignments.map((a) => a.responsibility))], assignmentStatuses: access.assignments.map((a) => a.status),
      accessExpiresAt: new Date(Math.max(...access.assignments.map((a) => a.accessExpiresAt.getTime()))).toISOString(),
      publicationWorkStatus: decision.publicationWorkStatus, actions: actionsOf(access, decision), sharedAt: access.pkg.sharedAt?.toISOString() ?? null,
    });
  }
  out.sort((a, b) => (a.sharedAt ?? "") < (b.sharedAt ?? "") ? 1 : -1);
  return { reviews: out };
}

/** Le paquet tel que le destinataire le voit : rien d'autre du projet. */
export async function readMyReview(packageId: string, userId: string) {
  const access = await required(packageId, userId);
  const { pkg } = access;
  const decision = await decisionContext(access);
  const actions = actionsOf(access, decision);
  const lineage = (await lineageOf(db, pkg.lineageId)).filter((p) => p.status !== "brouillon");
  const findings = await findingsOf(db, lineage.map((p) => p.id));
  const replies = await repliesOf(db, findings.map((f) => f.observationId));
  const labels = await accountLabels(db, [pkg.coordinatorId, ...findings.map((f) => f.authorId), ...replies.map((r) => r.authorId)]);
  const label = (id: string) => labels.get(id)?.label ?? "";
  const pub = await publicationReviewState(db, access.project, pkg.publicationId, access.project.id);
  return {
    package: {
      id: pkg.id, title: pkg.title, version: pkg.version, status: pkg.status, purpose: pkg.purpose, expectedResponse: pkg.expectedResponse, questions: pkg.questions,
      dueOn: pkg.dueOn, overdue: pkg.dueOn !== null && pkg.dueOn < new Date().toISOString().slice(0, 10) && access.assignments.some((a) => isOpenAssignment(a.status)),
      projectLabel: `${access.project.code} — ${access.project.name}`, coordinator: label(pkg.coordinatorId),
      supersedes: lineage.find((p) => p.id === pkg.supersedesPackageId) ? { id: pkg.supersedesPackageId, version: pkg.version - 1 } : null,
      replacedBy: pkg.replacedByPackageId, sharedAt: pkg.sharedAt?.toISOString() ?? null,
      revisionId: pkg.revisionId, documentHash: pkg.documentHash, manifestHash: pkg.manifestHash,
      sources: pkg.manifest?.sources ?? [], meta: pkg.manifest?.meta ?? null,
      files: (pkg.files ?? []).map((f) => ({ format: f.format, fileName: f.fileName, mime: f.mime, size: f.size, sha256: f.sha256 })),
    },
    /** États enregistrés par Studio (aucun statut d'approbation concurrent). */
    publication: { workStatus: decision.publicationWorkStatus, diffusionStatus: decision.publicationDiffusionStatus, matchesPackage: decision.publicationMatchesPackage,
      approvedAt: decision.publicationMatchesPackage && pub?.approvedAt ? pub.approvedAt.toISOString() : null },
    decisionBlock: access.assignments.some((a) => a.responsibility === "approbation" && isOpenAssignment(a.status)) ? decisionBlock(pkg.status, decision) : null,
    me: {
      assignments: access.assignments.map((a) => ({
        id: a.id, responsibility: a.responsibility, status: a.status, result: a.result, responseNote: a.responseNote, respondedAt: a.respondedAt?.toISOString() ?? null,
        accessExpiresAt: a.accessExpiresAt.toISOString(), permissions: { view: true, comment: a.canComment, attach: a.canAttach, download: a.canDownload, export: a.canExport },
      })),
      actions,
    },
    findings: findings.map((f) => ({
      id: f.observationId, packageVersion: lineage.find((p) => p.id === f.packageId)?.version ?? null, body: f.body, author: label(f.authorId), mine: f.authorId === userId,
      statut: f.statut, revisionId: f.revisionId, document: f.documentFormat ? { format: f.documentFormat, sha256: f.documentSha256 } : null, location: f.vueRef,
      objectIds: f.objectIds, correctionRevisionId: f.correctionRevisionId, recontroleRevisionId: f.recontroleRevisionId, createdAt: f.createdAt.toISOString(),
      attachments: f.attachments.map((x) => ({ name: x.name, mime: x.mime, size: x.size, sha256: x.sha256 })),
      replies: replies.filter((r) => r.parentId === f.observationId).map((r) => ({ id: r.id, body: r.body, author: label(r.authorId), mine: r.authorId === userId, createdAt: r.createdAt.toISOString() })),
    })),
  };
}

/** Fichier figé du paquet : vérifié contre son empreinte ; en ligne (SVG, PDF) pour consulter, en pièce jointe si le téléchargement est accordé. */
export async function readReviewFile(packageId: string, userId: string, format: string, wantsDownload: boolean) {
  const access = await required(packageId, userId);
  const file = (access.pkg.files ?? []).find((f) => f.format === format);
  if (!file) return reviewNotFound();
  const delivery = fileDelivery(format, wantsDownload, actionsOf(access, await decisionContext(access)));
  if (!delivery.ok) refuse(403, "download_not_granted", "Le téléchargement de ce document ne vous a pas été accordé : consultez-le en ligne (SVG, PDF).");
  const [volume] = await db.select().from(volumes).where(eq(volumes.id, file.sha256)).limit(1);
  if (!volume || sha256(volume.content) !== file.sha256) throw new Error("review_package_volume_corrupt");
  return { file, content: volume.content, disposition: delivery.ok ? delivery.disposition : "attachment", packageStatus: access.pkg.status, version: access.pkg.version };
}

/** Pièce jointe d'un constat de la lignée du paquet. */
export async function readFindingAttachment(packageId: string, userId: string, observationId: string, digest: string) {
  const access = await required(packageId, userId);
  const lineage = await lineageOf(db, access.pkg.lineageId);
  const [finding] = (await findingsOf(db, lineage.filter((p) => p.status !== "brouillon").map((p) => p.id))).filter((f) => f.observationId === observationId);
  const att = finding?.attachments.find((a) => a.sha256 === digest);
  if (!att) return reviewNotFound();
  const [volume] = await db.select().from(volumes).where(eq(volumes.id, att.sha256)).limit(1);
  if (!volume || sha256(volume.content) !== att.sha256) throw new Error("review_attachment_volume_corrupt");
  return { attachment: att, content: volume.content };
}

/** Passage en cours d'une affectation attendue dès la première écriture du destinataire. */
async function markInProgress(tx: Tx, access: ReviewAccess): Promise<void> {
  const ids = access.assignments.filter((a) => a.status === "en-attente").map((a) => a.id);
  if (ids.length) await tx.update(reviewAssignments).set({ status: "en-cours", updatedAt: new Date() }).where(inArray(reviewAssignments.id, ids));
}

/**
 * Constat : observation Studio d'audience `revue` rattachée au paquet, à la révision figée du paquet (jamais la tête
 * courante), au document visé et aux objets cités (vérifiés dans cette révision). Responsable : le responsable interne
 * des corrections du paquet.
 */
export async function createFinding(packageId: string, userId: string, input: z.infer<typeof reviewFindingSchema>, ip: string | null) {
  return db.transaction(async (tx) => {
    const access = await required(packageId, userId, tx, true);
    const { pkg } = access;
    const actions = actionsOf(access, await decisionContext(access, tx));
    need(actions, "commenter", "Vous ne pouvez pas écrire de constat sur ce paquet (paquet clos ou remplacé, réponse déjà rendue, ou commentaire non accordé).");
    if (input.attachments?.length) need(actions, "joindre", "Les pièces jointes ne vous ont pas été accordées.");
    const [variant] = await tx.select({ archived: studioVariants.archivedAt, studyArchived: studioStudies.archivedAt }).from(studioVariants)
      .innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId)).where(eq(studioVariants.id, pkg.variantId)).limit(1);
    if (!variant || variant.archived || variant.studyArchived) refuse(409, "archived", "L'étude de ce paquet est archivée : aucun nouveau constat.");
    const file = input.document ? (pkg.files ?? []).find((f) => f.format === input.document) : undefined;
    if (input.document && !file) refuse(400, "invalid_input", "Ce document n'appartient pas au paquet.", { code: "unknown_document" });
    const objectIds = [...new Set(input.objectIds ?? [])];
    if (objectIds.length) {
      const [revision] = await tx.select({ document: studioRevisions.document }).from(studioRevisions)
        .where(and(eq(studioRevisions.id, pkg.revisionId!), eq(studioRevisions.variantId, pkg.variantId))).limit(1);
      const doc = validateStudioDocument(revision!.document);
      const known = new Set([...doc.objects.map((o) => o.id), ...(doc.dimensions ?? []).map((d) => d.id)]);
      const unknown = objectIds.filter((id) => !known.has(id));
      if (unknown.length) refuse(400, "invalid_input", "Objet(s) absent(s) de la révision du paquet.", { code: "unknown_objects", objectIds: unknown, revisionId: pkg.revisionId });
    }
    const attachments: ReviewAttachment[] = [];
    for (const att of input.attachments ?? []) {
      const bytes = Buffer.from(att.contentBase64, "base64");
      const problem = attachmentProblem(att.mime, bytes);
      if (problem) refuse(400, "invalid_input", problem, { code: "attachment_invalid", name: att.name });
      const digest = sha256(bytes);
      await tx.insert(volumes).values({ id: digest, mime: att.mime, size: bytes.byteLength, content: bytes, createdAt: new Date() }).onConflictDoNothing();
      attachments.push({ name: safeFileName(att.name), mime: att.mime, size: bytes.byteLength, sha256: digest });
    }
    const id = newId("studio_comment");
    const now = new Date();
    const relecture = access.assignments.find((a) => isOpenAssignment(a.status) && a.canComment) ?? access.assignments[0]!;
    await tx.insert(studioComments).values({ id, variantId: pkg.variantId, revisionId: pkg.revisionId, objectIds, parentId: null, authorId: userId, body: input.body, audience: "revue", reviewPackageId: pkg.id });
    await tx.insert(studioObservations).values({
      commentId: id, variantId: pkg.variantId, responsableId: pkg.correctionsOwnerId, echeance: pkg.dueOn, statut: "ouverte", createdBy: userId,
      vueMode: "revue", vueRef: input.location ?? (file ? file.format : null),
    });
    await tx.insert(studioObservationEvents).values({
      id: newId("studio_observation_event"), observationId: id, seq: 1, action: "ouvrir", fromStatut: null, toStatut: "ouverte", actorId: userId,
      revisionId: pkg.revisionId, responsableId: pkg.correctionsOwnerId, note: null, at: now,
    });
    await tx.insert(reviewFindings).values({
      observationId: id, packageId: pkg.id, assignmentId: relecture.id, revisionId: pkg.revisionId!, documentFormat: file?.format ?? null, documentSha256: file?.sha256 ?? null,
      attachments, createdAt: now,
    });
    await markInProgress(tx, access);
    await audit(tx, { actorId: userId, action: "review.finding.created", target: { type: "project", id: pkg.projectId }, metadata: { projectId: pkg.projectId, packageId: pkg.id, observationId: id, document: file?.format ?? null, attachments: attachments.length }, ip });
    return { id, revisionId: pkg.revisionId, document: file ? { format: file.format, sha256: file.sha256 } : null };
  });
}

/** Constat de la lignée du paquet (un recontrôle sur la version 2 vise un constat de la version 1). */
async function lineageFinding(tx: Tx, access: ReviewAccess, observationId: string) {
  const lineage = (await lineageOf(tx, access.pkg.lineageId)).filter((p) => p.status !== "brouillon");
  const [finding] = (await findingsOf(tx, lineage.map((p) => p.id))).filter((f) => f.observationId === observationId);
  return finding ?? reviewNotFound();
}

/** Réponse du destinataire dans le fil d'un constat (audience `revue`). */
export async function replyToFinding(packageId: string, userId: string, observationId: string, body: string) {
  return db.transaction(async (tx) => {
    const access = await required(packageId, userId, tx, true);
    need(actionsOf(access, await decisionContext(access, tx)), "commenter", "Vous ne pouvez plus écrire sur ce paquet.");
    const finding = await lineageFinding(tx, access, observationId);
    const [root] = await tx.select({ reviewPackageId: studioComments.reviewPackageId }).from(studioComments).where(eq(studioComments.id, observationId)).limit(1);
    const id = newId("studio_comment");
    await tx.insert(studioComments).values({ id, variantId: finding.variantId, revisionId: null, objectIds: [], parentId: observationId, authorId: userId, body, audience: "revue", reviewPackageId: root!.reviewPackageId });
    await markInProgress(tx, access);
    return { id };
  });
}

/**
 * Recontrôle par l'auteur du constat, sur la révision de CE paquet : « levée » = passage Studio `recontroler` (la
 * correction doit être contenue dans la révision du paquet), « maintenue » = passage `rouvrir`. Les règles et le journal
 * sont ceux des observations Studio.
 */
export async function recheckFinding(packageId: string, userId: string, observationId: string, input: z.infer<typeof reviewRecheckSchema>, ip: string | null) {
  return db.transaction(async (tx) => {
    const access = await required(packageId, userId, tx, true);
    need(actionsOf(access, await decisionContext(access, tx)), "recontroler", "Vous ne pouvez plus recontrôler sur ce paquet.");
    const finding = await lineageFinding(tx, access, observationId);
    if (finding.authorId !== userId) refuse(403, "forbidden", "Seul l'auteur du constat le recontrôle.");
    const [o] = await tx.select().from(studioObservations).where(eq(studioObservations.commentId, observationId)).limit(1).for("update");
    const action = input.outcome === "levee" ? "recontroler" : "rouvrir";
    const vers = statutApres(o!.statut, action);
    if (vers === null) refuse(409, "invalid_transition", input.outcome === "levee" ? "Le constat n'est pas déclaré corrigé : rien à lever." : "Ce constat ne peut pas être maintenu depuis son statut actuel.", { statut: o!.statut });
    const revisionId = access.pkg.revisionId!;
    if (action === "recontroler") {
      const parents = await revisionParents(tx, access.pkg.variantId);
      if (!o!.correctionRevisionId || !estAncetreOuEgale(parents, o!.correctionRevisionId, revisionId)) {
        refuse(409, "correction_not_in_package", "La correction déclarée n'est pas contenue dans la révision de ce paquet : attendez la version qui la présente.", { correctionRevisionId: o!.correctionRevisionId, revisionId });
      }
    }
    const [last] = await tx.select({ seq: studioObservationEvents.seq }).from(studioObservationEvents).where(eq(studioObservationEvents.observationId, observationId)).orderBy(desc(studioObservationEvents.seq)).limit(1);
    const now = new Date();
    await tx.update(studioObservations).set({ statut: vers!, updatedAt: now, ...(action === "recontroler" ? { recontroleRevisionId: revisionId } : {}) }).where(eq(studioObservations.commentId, observationId));
    await tx.insert(studioObservationEvents).values({
      id: newId("studio_observation_event"), observationId, seq: (last?.seq ?? 0) + 1, action, fromStatut: o!.statut, toStatut: vers!, actorId: userId,
      revisionId: action === "recontroler" ? revisionId : null, responsableId: null, note: input.note ?? null, at: now,
    });
    await markInProgress(tx, access);
    await audit(tx, { actorId: userId, action: "review.finding.rechecked", target: { type: "project", id: access.pkg.projectId }, metadata: { projectId: access.pkg.projectId, packageId: access.pkg.id, observationId, outcome: input.outcome }, ip });
    return { statut: vers };
  });
}

/** Réponse d'une relecture : constats, ou revue satisfaisante pour la portée. Ne vaut jamais approbation. */
export async function respondToReview(packageId: string, userId: string, input: z.infer<typeof reviewResponseSchema>, ip: string | null) {
  return db.transaction(async (tx) => {
    const access = await required(packageId, userId, tx, true);
    need(actionsOf(access, await decisionContext(access, tx)), "repondre", "Aucune relecture attendue de vous sur ce paquet.");
    const lineage = (await lineageOf(tx, access.pkg.lineageId)).filter((p) => p.status !== "brouillon");
    const open = (await findingsOf(tx, lineage.map((p) => p.id))).filter((f) => f.authorId === userId && isOpenFinding(f.statut)).length;
    const refusal = responseRefusal(input.result, open);
    if (refusal) refuse(refusal.status, String(refusal.body["error"]), String(refusal.body["message"]), { count: open });
    const now = new Date();
    const ids = access.assignments.filter((a) => a.responsibility === "relecture" && isOpenAssignment(a.status)).map((a) => a.id);
    await tx.update(reviewAssignments).set({ status: "terminee", result: input.result, responseNote: input.note ?? null, respondedAt: now, updatedAt: now }).where(inArray(reviewAssignments.id, ids));
    await audit(tx, { actorId: userId, action: "review.response.recorded", target: { type: "project", id: access.pkg.projectId }, metadata: { projectId: access.pkg.projectId, packageId: access.pkg.id, result: input.result, openFindings: open }, ip });
    return { result: input.result };
  });
}

/**
 * Décision d'un approbateur nommé (OP-D7 a) : transitions Studio `approuver` (empreinte du manifeste examiné = celle du
 * paquet) ou `refuser` (motif requis). Bloquée si la publication a changé depuis le paquet, n'est plus en revue ou est
 * diffusée. Un relecteur n'y a jamais accès.
 */
export async function decideReview(packageId: string, userId: string, decision: "approuver" | "refuser", input: z.infer<typeof reviewDecisionSchema>, ip: string | null) {
  return db.transaction(async (tx) => {
    const access = await required(packageId, userId, tx, true);
    const context = await decisionContext(access, tx);
    const open = access.assignments.filter((a) => a.responsibility === "approbation" && isOpenAssignment(a.status));
    if (!open.length) refuse(403, "forbidden", "Vous n'avez pas d'affectation d'approbation attendue sur ce paquet : un relecteur n'approuve pas.", { action: decision });
    const block = decisionBlock(access.pkg.status, context);
    if (block) refuse(409, block, block === "publication_changee" ? "La publication a changé depuis ce paquet : une nouvelle version doit être revue et approuvée." : "La décision n'est pas possible dans l'état actuel du paquet ou de la publication.");
    if (decision === "approuver" && input.manifestHash !== access.pkg.manifestHash) {
      refuse(409, "manifest_mismatch", "L'empreinte examinée n'est pas celle du paquet.", { packageManifestHash: access.pkg.manifestHash });
    }
    try {
      await decideStudioPublicationByReview(tx, access.project, access.pkg.publicationId, userId, decision, {
        ...(input.comment ? { comment: input.comment } : {}),
        ...(decision === "approuver" ? { manifestHash: access.pkg.manifestHash!, revisionId: access.pkg.revisionId!, documentHash: access.pkg.documentHash! } : {}),
      });
    } catch (e) {
      if (e instanceof StudioRequestError) refuse(e.status, String(e.body["error"] ?? "refused"), String(e.body["message"] ?? "Transition refusée par Studio."), e.body);
      throw e;
    }
    const now = new Date();
    await tx.update(reviewAssignments).set({ status: "terminee", respondedAt: now, responseNote: input.comment ?? null, updatedAt: now }).where(inArray(reviewAssignments.id, open.map((a) => a.id)));
    await audit(tx, { actorId: userId, action: "review.decision.recorded", target: { type: "project", id: access.pkg.projectId }, metadata: { projectId: access.pkg.projectId, packageId: access.pkg.id, publicationId: access.pkg.publicationId, decision, manifestHash: access.pkg.manifestHash }, ip });
    return { decision };
  });
}

/** Rapport de revue exporté (droit `exporter`) : identité du paquet, empreintes, constats et réponses ; jamais de note interne. */
export async function exportReviewReport(packageId: string, userId: string) {
  const view = await readMyReview(packageId, userId);
  if (!view.me.actions.includes("exporter")) refuse(403, "export_not_granted", "L'export du rapport de revue ne vous a pas été accordé.");
  return {
    schema: "fadi-review-report/1", generatedAt: new Date().toISOString(),
    package: view.package, publication: view.publication, assignments: view.me.assignments, findings: view.findings,
  };
}

/** Accès de revue d'un compte, sans rien charger d'autre : sert aux notifications (`routes/notifications.ts`). */
export async function reviewNotificationScope(userId: string): Promise<{ packageIds: string[]; lineageIds: string[]; packages: Map<string, { title: string; version: number; projectId: string; code: string; name: string; sharedAt: Date | null; lineageId: string }> }> {
  const ids = await accessiblePackageIds(userId);
  const packages = new Map<string, { title: string; version: number; projectId: string; code: string; name: string; sharedAt: Date | null; lineageId: string }>();
  for (const id of ids) {
    const a = (await loadReviewAccess(id, userId))!;
    packages.set(id, { title: a.pkg.title, version: a.pkg.version, projectId: a.project.id, code: a.project.code, name: a.project.name, sharedAt: a.pkg.sharedAt, lineageId: a.pkg.lineageId });
  }
  return { packageIds: ids, lineageIds: [...new Set([...packages.values()].map((p) => p.lineageId))], packages };
}


export interface ReviewNotification {
  id: string; at: string; kind: "revue"; projectId: string; projectCode: string; projectName: string; stepNumber: null; review: { packageId: string }; text: string; unread: boolean;
}
const excerptOf = (body: string, n = 80) => (body.length > n ? `${body.slice(0, n)}…` : body);

/**
 * Source « revue » de `GET /notifications` (phase 4), bornée à l'accès de revue : paquets partagés avec vous, réponses
 * des autres dans les fils de vos paquets, passages de vos constats ; côté équipe, réponses reçues par le coordinateur.
 * Aucun extrait d'un fil de l'équipe, aucune note interne : seuls des éléments que vous lisez déjà sont signalés.
 */
export async function reviewNotifications(userId: string, since: Date): Promise<ReviewNotification[]> {
  const out: ReviewNotification[] = [];
  const scope = await reviewNotificationScope(userId);
  const base = (packageId: string) => {
    const p = scope.packages.get(packageId)!;
    return { kind: "revue" as const, projectId: p.projectId, projectCode: p.code, projectName: p.name, stepNumber: null, review: { packageId }, unread: false };
  };
  for (const [id, p] of scope.packages) {
    if (p.sharedAt && p.sharedAt > since) out.push({ ...base(id), id: `revue-partage:${id}`, at: p.sharedAt.toISOString(), text: `Le paquet de revue « ${p.title} » (version ${p.version}) vous est partagé.` });
  }
  if (scope.packageIds.length) {
    // Paquet le plus récent de chaque lignée accessible : cible des notifications de ses fils.
    const latest = new Map<string, string>();
    for (const [id, p] of scope.packages) {
      const cur = latest.get(p.lineageId);
      if (!cur || scope.packages.get(cur)!.version < p.version) latest.set(p.lineageId, id);
    }
    const lineagePackages = await db.select({ id: reviewPackagesTable.id, lineageId: reviewPackagesTable.lineageId }).from(reviewPackagesTable)
      .where(and(inArray(reviewPackagesTable.lineageId, scope.lineageIds), ne(reviewPackagesTable.status, "brouillon")));
    const lineageOfPackage = new Map(lineagePackages.map((r) => [r.id, r.lineageId]));
    const findings = await findingsOf(db, lineagePackages.map((r) => r.id));
    const target = (f: { packageId: string }) => latest.get(lineageOfPackage.get(f.packageId) ?? "") ?? null;
    const replies = await repliesOf(db, findings.map((f) => f.observationId));
    const labels = await accountLabels(db, replies.map((r) => r.authorId));
    for (const r of replies) {
      const f = findings.find((x) => x.observationId === r.parentId)!;
      const pkg = target(f);
      if (!pkg || r.authorId === userId || r.createdAt <= since) continue;
      out.push({ ...base(pkg), id: `revue-reponse:${r.id}`, at: r.createdAt.toISOString(), text: `${labels.get(r.authorId)?.label ?? ""} a répondu au constat « ${excerptOf(f.body)} » : « ${excerptOf(r.body, 120)} »` });
    }
    const mine = findings.filter((f) => f.authorId === userId);
    if (mine.length) {
      const events = await db.select({ id: studioObservationEvents.id, observationId: studioObservationEvents.observationId, action: studioObservationEvents.action, at: studioObservationEvents.at })
        .from(studioObservationEvents).where(and(inArray(studioObservationEvents.observationId, mine.map((f) => f.observationId)), gt(studioObservationEvents.at, since), ne(studioObservationEvents.actorId, userId)));
      const VERBE: Record<string, string> = { corriger: "est déclaré corrigé", cloturer: "est clôturé", rouvrir: "est rouvert", recontroler: "est recontrôlé", reattribuer: "change de responsable" };
      for (const e of events) {
        const f = mine.find((x) => x.observationId === e.observationId)!;
        const pkg = target(f);
        if (!pkg) continue;
        out.push({ ...base(pkg), id: `revue-constat:${e.id}`, at: e.at.toISOString(), text: `Votre constat « ${excerptOf(f.body)} » ${VERBE[e.action] ?? e.action}.` });
      }
    }
  }
  // Équipe : réponses reçues sur les paquets que vous coordonnez (aucune adresse, aucun texte de réponse).
  const responses = await db.select({ id: reviewAssignments.id, packageId: reviewAssignments.packageId, result: reviewAssignments.result, respondedAt: reviewAssignments.respondedAt, responsibility: reviewAssignments.responsibility, title: reviewPackagesTable.title, version: reviewPackagesTable.version, projectId: projectsTable.id, code: projectsTable.code, name: projectsTable.name })
    .from(reviewAssignments).innerJoin(reviewPackagesTable, eq(reviewPackagesTable.id, reviewAssignments.packageId)).innerJoin(projectsTable, eq(projectsTable.id, reviewAssignments.projectId))
    .where(and(eq(reviewPackagesTable.coordinatorId, userId), gt(reviewAssignments.respondedAt, since), ne(reviewAssignments.userId, userId)));
  for (const r of responses) {
    const what = r.responsibility === "approbation" ? "Décision d'approbation enregistrée" : r.result === "satisfaisante" ? "Revue satisfaisante pour la portée" : "Constats rendus";
    out.push({ kind: "revue", projectId: r.projectId, projectCode: r.code, projectName: r.name, stepNumber: null, review: { packageId: r.packageId }, unread: false,
      id: `revue-equipe:${r.id}`, at: r.respondedAt!.toISOString(), text: `${what} sur le paquet « ${r.title} » (version ${r.version}, ${r.code}).` });
  }
  return out;
}
