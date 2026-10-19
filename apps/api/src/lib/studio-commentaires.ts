/**
 * Commentaires d'une variante Studio. Règles reprises telles quelles de la Collaboration (`routes/collaboration.ts`) :
 * lecture avec le droit `read`, écriture avec le droit `comment` (tout membre du projet commente, lecteur compris ;
 * la réservation d'édition et la référence protégée ne bloquent pas les commentaires), un seul niveau de fil
 * (répondre à une réponse rattache au commentaire d'origine), suppression par son auteur seulement (403 sinon).
 * Différences propres à Studio : suppression douce (`deleted_at`, le fil reste lisible, le texte n'est plus rendu),
 * ancrage facultatif à une révision de la même variante et à des objets de son document (validés contre la révision
 * citée, sinon contre la tête, qui est alors enregistrée comme révision d'ancrage), création idempotente par
 * `requestId` (même auteur et même contenu = réponse d'origine, sinon 409 request_conflict).
 */
import { and, asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db/client.js";
import { studioComments, studioRevisions, studioStudies, studioVariants, users } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess, projectAccessRefusal, type ProjectNeed } from "./owned-project.js";
import { StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";

export const STUDIO_COMMENT_MAX_OBJECTS = 200;

export const studioCommentSchema = z.object({
  body: z.string().trim().min(1, "Commentaire vide").max(4000),
  revisionId: studioIdentifierSchema.optional(),
  objectIds: z.array(z.string().min(1).max(256)).max(STUDIO_COMMENT_MAX_OBJECTS)
    .refine((ids) => new Set(ids).size === ids.length, "Objet cité deux fois").optional(),
  parentId: studioIdentifierSchema.optional(),
  requestId: studioIdentifierSchema.optional(),
}).strict();
export type StudioCommentInput = z.infer<typeof studioCommentSchema>;

export interface StudioCommentView {
  id: string;
  variantId: string;
  parentId: string | null;
  revisionId: string | null;
  objectIds: string[];
  authorId: string;
  authorEmail: string;
  /** null quand le commentaire a été supprimé par son auteur. */
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  mine: boolean;
}

type Row = typeof studioComments.$inferSelect & { authorEmail: string | null };

function view(c: Row, actorId: string): StudioCommentView {
  const deleted = c.deletedAt !== null;
  return {
    id: c.id, variantId: c.variantId, parentId: c.parentId, revisionId: c.revisionId,
    objectIds: deleted ? [] : c.objectIds, authorId: c.authorId, authorEmail: c.authorEmail ?? "",
    body: deleted ? null : c.body, createdAt: c.createdAt.toISOString(), deletedAt: c.deletedAt?.toISOString() ?? null,
    mine: c.authorId === actorId,
  };
}

const notFound = (message?: string): never => { throw new StudioRequestError(404, message ? { error: "not_found", message } : { error: "not_found" }); };

/** Droit vérifié par le serveur, puis portée : étude du projet, variante de l'étude ; sinon 404 sans rien révéler. */
async function scopedVariant(scope: StudioScope, actorId: string, need: ProjectNeed) {
  const refusal = projectAccessRefusal(await loadProjectAccess(scope.projectId, actorId), actorId, need);
  if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
  const [variant] = await db.select({ id: studioVariants.id, headRevisionId: studioVariants.headRevisionId, archived: studioVariants.archivedAt, studyArchived: studioStudies.archivedAt })
    .from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
    .where(and(eq(studioVariants.id, scope.variantId), eq(studioStudies.id, scope.studyId), eq(studioStudies.projectId, scope.projectId))).limit(1);
  return variant ?? notFound();
}

const selectRow = () => db.select({
  id: studioComments.id, variantId: studioComments.variantId, revisionId: studioComments.revisionId, objectIds: studioComments.objectIds,
  parentId: studioComments.parentId, authorId: studioComments.authorId, body: studioComments.body, requestId: studioComments.requestId,
  payloadHash: studioComments.payloadHash, createdAt: studioComments.createdAt, deletedAt: studioComments.deletedAt, authorEmail: users.email,
}).from(studioComments).leftJoin(users, eq(users.id, studioComments.authorId));

/** Fils de la variante : chaque commentaire d'origine (plus ancien d'abord) suivi de ses réponses (plus ancienne d'abord). */
export async function listStudioComments(scope: StudioScope, actorId: string): Promise<{ comments: StudioCommentView[] }> {
  const variant = await scopedVariant(scope, actorId, "read");
  const rows = await selectRow().where(eq(studioComments.variantId, variant.id)).orderBy(asc(studioComments.createdAt), asc(studioComments.id));
  const replies = new Map<string, Row[]>();
  for (const r of rows) if (r.parentId) replies.set(r.parentId, [...(replies.get(r.parentId) ?? []), r]);
  const ordered = rows.filter((r) => !r.parentId).flatMap((root) => [root, ...(replies.get(root.id) ?? [])]);
  return { comments: ordered.map((r) => view(r, actorId)) };
}

function payloadHash(input: StudioCommentInput): string {
  const canonical = { body: input.body, revisionId: input.revisionId ?? null, objectIds: input.objectIds ?? [], parentId: input.parentId ?? null };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function replay(variantId: string, requestId: string, actorId: string, hash: string): Promise<(StudioCommentView & { replayed: true }) | null> {
  const [previous] = await selectRow().where(and(eq(studioComments.variantId, variantId), eq(studioComments.requestId, requestId))).limit(1);
  if (!previous) return null;
  if (previous.authorId !== actorId || previous.payloadHash !== hash) {
    throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." });
  }
  return { ...view(previous, actorId), replayed: true };
}

const isUniqueViolation = (e: unknown): boolean => {
  for (let x: unknown = e, depth = 0; x && typeof x === "object" && depth < 4; x = (x as { cause?: unknown }).cause, depth += 1) {
    if ((x as { code?: unknown }).code === "23505") return true;
  }
  return false;
};

export async function createStudioComment(scope: StudioScope, actorId: string, input: StudioCommentInput): Promise<StudioCommentView & { replayed: boolean }> {
  const variant = await scopedVariant(scope, actorId, "comment");
  const hash = payloadHash(input);
  if (input.requestId !== undefined) {
    const previous = await replay(variant.id, input.requestId, actorId, hash);
    if (previous) return previous;
  }
  // Une archive reste lisible (fils compris) mais ne reçoit plus de nouveau commentaire.
  if (variant.archived !== null || variant.studyArchived !== null) studioArchivedRefusal();
  let parentId: string | null = null;
  if (input.parentId !== undefined) {
    const [parent] = await db.select({ id: studioComments.id, parentId: studioComments.parentId, deletedAt: studioComments.deletedAt }).from(studioComments)
      .where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, input.parentId))).limit(1);
    if (!parent || parent.deletedAt) return notFound("Le commentaire auquel vous répondez n'existe plus.");
    parentId = parent.parentId ?? parent.id;
  }
  const objectIds = input.objectIds ?? [];
  let revisionId: string | null = input.revisionId ?? null;
  if (revisionId !== null || objectIds.length) {
    const [revision] = await db.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
      .where(and(eq(studioRevisions.variantId, variant.id), eq(studioRevisions.id, revisionId ?? variant.headRevisionId))).limit(1);
    if (!revision) return notFound("Révision inconnue pour cette variante.");
    const known = new Set([...revision.document.objects.map((o) => o.id), ...(revision.document.dimensions ?? []).map((d) => d.id)]);
    const unknown = objectIds.filter((id) => !known.has(id));
    if (unknown.length) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "unknown_objects", objectIds: unknown, revisionId: revision.id, message: "Objet(s) absent(s) de la révision citée." });
    }
    // Des objets cités sans révision sont ancrés à la tête contre laquelle ils ont été vérifiés.
    revisionId = revision.id;
  }
  try {
    const [created] = await db.insert(studioComments).values({
      id: newId("studio_comment"), variantId: variant.id, revisionId, objectIds, parentId, authorId: actorId, body: input.body,
      requestId: input.requestId ?? null, payloadHash: hash,
    }).returning({ id: studioComments.id });
    const [row] = await selectRow().where(eq(studioComments.id, created!.id)).limit(1);
    return { ...view(row!, actorId), replayed: false };
  } catch (error) {
    // Deux envois concurrents du même requestId : le second relit le premier (ou 409 si le contenu diffère).
    if (input.requestId !== undefined && isUniqueViolation(error)) {
      const previous = await replay(variant.id, input.requestId, actorId, hash);
      if (previous) return previous;
    }
    throw error;
  }
}

/** Suppression douce par l'auteur seul ; un commentaire déjà supprimé par son auteur reste supprimé (204). */
export async function deleteStudioComment(scope: StudioScope, actorId: string, commentId: string): Promise<void> {
  const variant = await scopedVariant(scope, actorId, "comment");
  const [existing] = await db.select({ authorId: studioComments.authorId, deletedAt: studioComments.deletedAt }).from(studioComments)
    .where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, commentId))).limit(1);
  if (!existing) return notFound();
  if (existing.authorId !== actorId) throw new StudioRequestError(403, { error: "forbidden", message: "Seul l'auteur peut supprimer son commentaire." });
  if (existing.deletedAt) return;
  await db.update(studioComments).set({ deletedAt: new Date() })
    .where(and(eq(studioComments.id, commentId), eq(studioComments.authorId, actorId)));
}
