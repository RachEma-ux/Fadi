/**
 * Commentaires d'une variante Studio. Règles reprises telles quelles de la Collaboration (`routes/collaboration.ts`) :
 * lecture avec le droit `read`, écriture avec le droit `comment` (tout membre du projet commente, lecteur compris ;
 * la réservation d'édition et la référence protégée ne bloquent pas les commentaires), un seul niveau de fil
 * (répondre à une réponse rattache au commentaire d'origine), suppression par son auteur seulement (403 sinon).
 * Différences propres à Studio : suppression douce (`deleted_at`, le fil reste lisible, le texte n'est plus rendu),
 * ancrage facultatif à une révision de la même variante et à des objets de son document (validés contre la révision
 * citée, sinon contre la tête, qui est alors enregistrée comme révision d'ancrage), création idempotente par
 * `requestId` (même auteur et même contenu = réponse d'origine, sinon 409 request_conflict).
 *
 * Observations (E.2) : un commentaire d'origine peut devenir une observation (même identifiant), avec un responsable,
 * une échéance facultative et un cycle ouverte → corrigée → recontrôlée → clôturée / rouverte ; règles et
 * correspondance des rôles dans `studio-observations.ts`. Chaque passage est journalisé sous verrou de ligne
 * (`seq` croissant) ; une archive refuse promotion et passages (409 archived) ; un commentaire devenu observation ne
 * se supprime plus (409 observation).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db/client.js";
import { projectMembers, studioComments, studioObservationEvents, studioObservations, studioRevisions, studioStudies, studioVariants, users, type StudioObservationAction, type StudioObservationStatut } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess, projectAccessRefusal, roleAllows, type AccessibleProject, type ProjectNeed, type ProjectRole } from "./owned-project.js";
import { StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";
import { acteurAutorise, echeanceValide, estAncetreOuEgale, OBSERVATION_TRANSITIONS, REFUS_ACTEUR, REVISION_EXIGEE, statutApres, type ActeurObservation, type ObservationTransition } from "./studio-observations.js";

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
  /** Observation issue de ce commentaire (même identifiant), null sinon. */
  observation: StudioObservationView | null;
}

/** Un passage du journal d'une observation : qui, quand, depuis / vers quel statut, contre quelle révision, avec quelle note. */
export interface StudioObservationEventView {
  seq: number;
  action: StudioObservationAction;
  fromStatut: StudioObservationStatut | null;
  toStatut: StudioObservationStatut;
  actorId: string;
  actorEmail: string;
  revisionId: string | null;
  note: string | null;
  at: string;
}

export interface StudioObservationView {
  /** Identifiant du commentaire d'origine : une seule identité. */
  id: string;
  authorId: string;
  responsableId: string;
  responsableEmail: string;
  /** AAAA-MM-JJ, null sans échéance. */
  echeance: string | null;
  statut: StudioObservationStatut;
  correctionRevisionId: string | null;
  recontroleRevisionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Journal complet, du plus ancien au plus récent (`seq` croissant). */
  journal: StudioObservationEventView[];
  /** L'utilisateur courant est le responsable. */
  assignedToMe: boolean;
  /** Passages que l'utilisateur courant peut faire maintenant (rôle, statut, archive), relus du serveur. */
  possibles: ObservationTransition[];
}

/** Personne du projet : le propriétaire et les membres ; `assignable` = peut être responsable (droit `write`). */
export interface StudioParticipant { id: string; email: string; role: ProjectRole; assignable: boolean }

type Row = typeof studioComments.$inferSelect & { authorEmail: string | null };

function view(c: Row, actorId: string, observation: StudioObservationView | null = null): StudioCommentView {
  const deleted = c.deletedAt !== null;
  return {
    id: c.id, variantId: c.variantId, parentId: c.parentId, revisionId: c.revisionId,
    objectIds: deleted ? [] : c.objectIds, authorId: c.authorId, authorEmail: c.authorEmail ?? "",
    body: deleted ? null : c.body, createdAt: c.createdAt.toISOString(), deletedAt: c.deletedAt?.toISOString() ?? null,
    mine: c.authorId === actorId, observation,
  };
}

const notFound = (message?: string): never => { throw new StudioRequestError(404, message ? { error: "not_found", message } : { error: "not_found" }); };

/** Droit vérifié par le serveur, puis portée : étude du projet, variante de l'étude ; sinon 404 sans rien révéler. */
async function scopedVariant(scope: StudioScope, actorId: string, need: ProjectNeed) {
  const access = await loadProjectAccess(scope.projectId, actorId);
  const refusal = projectAccessRefusal(access, actorId, need);
  if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
  const [variant] = await db.select({ id: studioVariants.id, headRevisionId: studioVariants.headRevisionId, archived: studioVariants.archivedAt, studyArchived: studioStudies.archivedAt })
    .from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
    .where(and(eq(studioVariants.id, scope.variantId), eq(studioStudies.id, scope.studyId), eq(studioStudies.projectId, scope.projectId))).limit(1);
  return variant ? { ...variant, access: access! } : notFound();
}

const selectRow = () => db.select({
  id: studioComments.id, variantId: studioComments.variantId, revisionId: studioComments.revisionId, objectIds: studioComments.objectIds,
  parentId: studioComments.parentId, authorId: studioComments.authorId, body: studioComments.body, requestId: studioComments.requestId,
  payloadHash: studioComments.payloadHash, createdAt: studioComments.createdAt, deletedAt: studioComments.deletedAt, authorEmail: users.email,
}).from(studioComments).leftJoin(users, eq(users.id, studioComments.authorId));

/** Fils de la variante : chaque commentaire d'origine (plus ancien d'abord) suivi de ses réponses (plus ancienne d'abord). */
export async function listStudioComments(scope: StudioScope, actorId: string): Promise<{ comments: StudioCommentView[]; participants: StudioParticipant[]; archived: boolean; me: { id: string; role: ProjectRole } }> {
  const variant = await scopedVariant(scope, actorId, "read");
  const rows = await selectRow().where(eq(studioComments.variantId, variant.id)).orderBy(asc(studioComments.createdAt), asc(studioComments.id));
  const replies = new Map<string, Row[]>();
  for (const r of rows) if (r.parentId) replies.set(r.parentId, [...(replies.get(r.parentId) ?? []), r]);
  const ordered = rows.filter((r) => !r.parentId).flatMap((root) => [root, ...(replies.get(root.id) ?? [])]);
  const archived = variant.archived !== null || variant.studyArchived !== null;
  const observations = await observationViews(variant.id, null, { actorId, role: variant.access.role, archived });
  return { comments: ordered.map((r) => view(r, actorId, observations.get(r.id) ?? null)), participants: await participants(variant.access), archived, me: { id: actorId, role: variant.access.role } };
}

// ---------------------------------------------------------------------------
// Observations

/** Propriétaire puis membres (ordre d'invitation) ; un membre `editeur` ou le propriétaire peut être responsable. */
async function participants(project: AccessibleProject): Promise<StudioParticipant[]> {
  const [owner] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, project.ownerId)).limit(1);
  const members = await db.select({ id: users.id, email: users.email, role: projectMembers.role }).from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, project.id))
    .orderBy(asc(projectMembers.createdAt), asc(users.id));
  const all: StudioParticipant[] = owner ? [{ ...owner, role: "proprietaire", assignable: true }] : [];
  for (const m of members) if (m.id !== project.ownerId) all.push({ id: m.id, email: m.email, role: m.role, assignable: roleAllows(m.role, "write") });
  return all;
}

interface Lecteur { actorId: string; role: ProjectRole; archived: boolean }

/** Observations de la variante (ou d'un seul commentaire), journal compris, avec les passages possibles du lecteur. */
async function observationViews(variantId: string, commentId: string | null, lecteur: Lecteur, executor: Pick<typeof db, "select"> = db): Promise<Map<string, StudioObservationView>> {
  const where = commentId === null ? eq(studioObservations.variantId, variantId) : and(eq(studioObservations.variantId, variantId), eq(studioObservations.commentId, commentId));
  const obs = await executor.select({ o: studioObservations, responsableEmail: users.email, authorId: studioComments.authorId }).from(studioObservations)
    .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
    .leftJoin(users, eq(users.id, studioObservations.responsableId)).where(where);
  const result = new Map<string, StudioObservationView>();
  if (!obs.length) return result;
  const events = await executor.select({ e: studioObservationEvents, actorEmail: users.email }).from(studioObservationEvents)
    .leftJoin(users, eq(users.id, studioObservationEvents.actorId))
    .where(inArray(studioObservationEvents.observationId, obs.map((x) => x.o.commentId)))
    .orderBy(asc(studioObservationEvents.observationId), asc(studioObservationEvents.seq));
  const journal = new Map<string, StudioObservationEventView[]>();
  for (const { e, actorEmail } of events) {
    journal.set(e.observationId, [...(journal.get(e.observationId) ?? []), {
      seq: e.seq, action: e.action, fromStatut: e.fromStatut, toStatut: e.toStatut, actorId: e.actorId, actorEmail: actorEmail ?? "",
      revisionId: e.revisionId, note: e.note, at: e.at.toISOString(),
    }]);
  }
  for (const { o, responsableEmail, authorId } of obs) {
    const acteur: ActeurObservation = { estResponsable: o.responsableId === lecteur.actorId, estAuteur: authorId === lecteur.actorId, estProprietaire: roleAllows(lecteur.role, "owner") };
    result.set(o.commentId, {
      id: o.commentId, authorId, responsableId: o.responsableId, responsableEmail: responsableEmail ?? "", echeance: o.echeance, statut: o.statut,
      correctionRevisionId: o.correctionRevisionId, recontroleRevisionId: o.recontroleRevisionId, createdBy: o.createdBy,
      createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(), journal: journal.get(o.commentId) ?? [],
      assignedToMe: acteur.estResponsable,
      possibles: lecteur.archived ? [] : OBSERVATION_TRANSITIONS.filter((a) => acteurAutorise(a, acteur) && statutApres(o.statut, a) !== null),
    });
  }
  return result;
}

const noteSchema = z.string().trim().min(1).max(2000).optional();
export const studioObservationSchema = z.object({
  responsableId: z.string().min(1).max(256),
  echeance: z.string().refine(echeanceValide, "Échéance attendue au format AAAA-MM-JJ.").nullable().optional(),
  note: noteSchema,
  requestId: studioIdentifierSchema.optional(),
}).strict();
export type StudioObservationInput = z.infer<typeof studioObservationSchema>;

export const studioObservationTransitionSchema = z.object({
  action: z.enum(OBSERVATION_TRANSITIONS as [ObservationTransition, ...ObservationTransition[]]),
  revisionId: studioIdentifierSchema.optional(),
  note: noteSchema,
  requestId: studioIdentifierSchema.optional(),
}).strict();
export type StudioObservationTransitionInput = z.infer<typeof studioObservationTransitionSchema>;

const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const conflict = (error: string, message: string, extra: Record<string, unknown> = {}): never => { throw new StudioRequestError(409, { error, message, ...extra }); };

/** Rejeu d'un passage déjà journalisé avec ce `requestId` : même auteur et même contenu, sinon 409 request_conflict. */
async function replayedEvent(tx: Pick<typeof db, "select">, observationId: string, requestId: string | undefined, actorId: string, hash: string): Promise<boolean> {
  if (requestId === undefined) return false;
  const [previous] = await tx.select({ actorId: studioObservationEvents.actorId, payloadHash: studioObservationEvents.payloadHash }).from(studioObservationEvents)
    .where(and(eq(studioObservationEvents.observationId, observationId), eq(studioObservationEvents.requestId, requestId))).limit(1);
  if (!previous) return false;
  if (previous.actorId !== actorId || previous.payloadHash !== hash) conflict("request_conflict", "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur.");
  return true;
}

async function observationResult(variantId: string, commentId: string, lecteur: Lecteur, replayed: boolean): Promise<StudioObservationView & { replayed: boolean }> {
  const v = (await observationViews(variantId, commentId, lecteur)).get(commentId);
  return { ...(v ?? notFound()), replayed };
}

/**
 * Promotion d'un commentaire d'origine en observation (201) par son auteur ou le propriétaire : responsable = le
 * propriétaire ou un membre éditeur du projet (400 responsable_invalide sinon), échéance facultative. Un commentaire
 * déjà promu → 409 already_observation (sauf rejeu du même requestId).
 */
export async function createStudioObservation(scope: StudioScope, actorId: string, commentId: string, input: StudioObservationInput): Promise<StudioObservationView & { replayed: boolean }> {
  const variant = await scopedVariant(scope, actorId, "comment");
  const lecteur: Lecteur = { actorId, role: variant.access.role, archived: variant.archived !== null || variant.studyArchived !== null };
  const hash = hashOf({ action: "ouvrir", responsableId: input.responsableId, echeance: input.echeance ?? null, note: input.note ?? null });
  const replayed = await db.transaction(async (tx) => {
    const [comment] = await tx.select({ id: studioComments.id, parentId: studioComments.parentId, authorId: studioComments.authorId, deletedAt: studioComments.deletedAt })
      .from(studioComments).where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, commentId))).limit(1).for("update");
    if (!comment) return notFound();
    if (await replayedEvent(tx, comment.id, input.requestId, actorId, hash)) return true;
    if (lecteur.archived) studioArchivedRefusal();
    if (comment.authorId !== actorId && !roleAllows(variant.access.role, "owner")) {
      throw new StudioRequestError(403, { error: "forbidden", message: "Seul l'auteur du commentaire ou le propriétaire du projet en fait une observation." });
    }
    if (comment.deletedAt) return notFound("Ce commentaire a été supprimé.");
    if (comment.parentId) throw new StudioRequestError(400, { error: "invalid_input", code: "reponse", message: "Seul un commentaire d'origine devient une observation, pas une réponse." });
    const [existing] = await tx.select({ id: studioObservations.commentId }).from(studioObservations).where(eq(studioObservations.commentId, comment.id)).limit(1);
    if (existing) conflict("already_observation", "Ce commentaire est déjà une observation.");
    const responsable = (await participants(variant.access)).find((p) => p.id === input.responsableId);
    if (!responsable?.assignable) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "responsable_invalide", message: "Le responsable doit être le propriétaire ou un éditeur du projet." });
    }
    await tx.insert(studioObservations).values({
      commentId: comment.id, variantId: variant.id, responsableId: responsable.id, echeance: input.echeance ?? null, statut: "ouverte", createdBy: actorId,
    });
    await tx.insert(studioObservationEvents).values({
      id: newId("studio_observation_event"), observationId: comment.id, seq: 1, action: "ouvrir", fromStatut: null, toStatut: "ouverte", actorId,
      revisionId: null, note: input.note ?? null, requestId: input.requestId ?? null, payloadHash: hash,
    });
    return false;
  });
  return observationResult(variant.id, commentId, lecteur, replayed);
}

/** Révisions de la variante : identifiant → parent (chaîne immuable). */
async function revisionParents(tx: Pick<typeof db, "select">, variantId: string): Promise<Map<string, string | null>> {
  const rows = await tx.select({ id: studioRevisions.id, parent: studioRevisions.parentRevisionId }).from(studioRevisions).where(eq(studioRevisions.variantId, variantId));
  return new Map(rows.map((r) => [r.id, r.parent]));
}

/**
 * Passage d'une observation (200). Ordre des refus : portée 404 → archive 409 archived → rôle 403 → statut
 * 409 invalid_transition → révision (exigée 400, inconnue 404, antérieure 409 revision_anterieure).
 */
export async function transitionStudioObservation(scope: StudioScope, actorId: string, commentId: string, input: StudioObservationTransitionInput): Promise<StudioObservationView & { replayed: boolean }> {
  const variant = await scopedVariant(scope, actorId, "comment");
  const lecteur: Lecteur = { actorId, role: variant.access.role, archived: variant.archived !== null || variant.studyArchived !== null };
  const action = input.action;
  const hash = hashOf({ action, revisionId: input.revisionId ?? null, note: input.note ?? null });
  const replayed = await db.transaction(async (tx) => {
    const [row] = await tx.select({ o: studioObservations, authorId: studioComments.authorId }).from(studioObservations)
      .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
      .where(and(eq(studioObservations.variantId, variant.id), eq(studioObservations.commentId, commentId))).limit(1).for("update", { of: studioObservations });
    if (!row) return notFound("Ce commentaire n'est pas une observation.");
    const { o } = row;
    if (await replayedEvent(tx, o.commentId, input.requestId, actorId, hash)) return true;
    if (lecteur.archived) studioArchivedRefusal();
    const acteur: ActeurObservation = { estResponsable: o.responsableId === actorId, estAuteur: row.authorId === actorId, estProprietaire: roleAllows(variant.access.role, "owner") };
    if (!acteurAutorise(action, acteur)) throw new StudioRequestError(403, { error: "forbidden", message: REFUS_ACTEUR[action] });
    const vers = statutApres(o.statut, action);
    if (vers === null) conflict("invalid_transition", "Ce passage n'est pas permis depuis le statut actuel.", { statut: o.statut, action });
    if (REVISION_EXIGEE[action] && input.revisionId === undefined) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "revision_exigee", message: "Citez la révision de la variante concernée." });
    }
    const revisionId = input.revisionId ?? null;
    if (revisionId !== null) {
      const parents = await revisionParents(tx, variant.id);
      if (!parents.has(revisionId)) return notFound("Révision inconnue pour cette variante.");
      const [anchor] = await tx.select({ revisionId: studioComments.revisionId }).from(studioComments).where(eq(studioComments.id, o.commentId)).limit(1);
      // La correction suit la révision observée ; le recontrôle porte sur la correction ou une révision postérieure.
      const plancher = action === "recontroler" ? o.correctionRevisionId : action === "corriger" ? anchor?.revisionId ?? null : null;
      if (plancher !== null && !estAncetreOuEgale(parents, plancher, revisionId)) {
        conflict("revision_anterieure", action === "recontroler" ? "Le recontrôle porte sur la révision corrigée ou une révision postérieure." : "La correction porte sur la révision observée ou une révision postérieure.", { revisionId, plancher });
      }
    }
    // Sous le verrou de la ligne d'observation : `seq` suivant sans trou ni doublon.
    const [last] = await tx.select({ seq: studioObservationEvents.seq }).from(studioObservationEvents)
      .where(eq(studioObservationEvents.observationId, o.commentId)).orderBy(desc(studioObservationEvents.seq)).limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const now = new Date();
    await tx.update(studioObservations).set({
      statut: vers!, updatedAt: now,
      ...(action === "corriger" ? { correctionRevisionId: revisionId, recontroleRevisionId: null } : {}),
      ...(action === "recontroler" ? { recontroleRevisionId: revisionId } : {}),
    }).where(eq(studioObservations.commentId, o.commentId));
    await tx.insert(studioObservationEvents).values({
      id: newId("studio_observation_event"), observationId: o.commentId, seq, action, fromStatut: o.statut, toStatut: vers!, actorId,
      revisionId, note: input.note ?? null, requestId: input.requestId ?? null, payloadHash: hash, at: now,
    });
    return false;
  });
  return observationResult(variant.id, commentId, lecteur, replayed);
}

// ---------------------------------------------------------------------------

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
  // Une observation et son journal restent lisibles : le commentaire qui la porte ne se supprime plus.
  const [observation] = await db.select({ id: studioObservations.commentId }).from(studioObservations).where(eq(studioObservations.commentId, commentId)).limit(1);
  if (observation) conflict("observation", "Ce commentaire est une observation : il ne peut plus être supprimé.");
  await db.update(studioComments).set({ deletedAt: new Date() })
    .where(and(eq(studioComments.id, commentId), eq(studioComments.authorId, actorId)));
}
