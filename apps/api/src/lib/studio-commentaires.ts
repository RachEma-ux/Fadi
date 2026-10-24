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
 * se supprime plus (409 observation). La vue d'une observation porte aussi sa vue citée, ses liens de domaines, ses
 * tâches et ses décisions (suivi E.2 : `studio-observations-suivi.ts`) ; la clôture est motivée, attend la fin des
 * tâches et consigne la décision de clôture.
 *
 * Audience (écart E1, `audience.ts`) : portée par le commentaire d'origine et recopiée sur ses réponses ; l'observation,
 * ses passages, tâches et décisions la suivent. Un fil `equipe` (défaut) n'est lu que par le propriétaire et les
 * éditeurs ; `projet` (« Visible par les lecteurs ») par tous. Chaque lecture et chaque recherche par identifiant passe
 * par `audienceFilter` : pour un lecteur, un fil de l'équipe est introuvable (404), jamais seulement masqué.
 */
import { and, asc, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  projectMembers, studioComments, studioObservationDecisions, studioObservationEvents, studioObservationLinks, studioObservations, studioObservationTaskEvents,
  studioObservationTasks, studioRevisions, studioStudies, studioVariants, users,
  type StudioObservationAction, type StudioObservationDecisionNature, type StudioObservationDecisionPortee, type StudioObservationDomaine, type StudioObservationStatut,
  type StudioObservationTacheAction, type StudioObservationTacheStatut, type StudioObservationVueMode,
} from "../db/schema.js";
import { newId } from "./ids.js";
import { audit } from "./audit.js";
import { AudienceError, audienceChangeRefusal, audienceOfNew, audienceSchema, seesTeam, type CommentAudience } from "./audience.js";
import { loadProjectAccess, projectAccessRefusal, roleAllows, type AccessibleProject, type ProjectNeed, type ProjectRole } from "./owned-project.js";
import { lockedAccess, StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";
import type { Tx } from "./atelier-validation.js";
import {
  acteurAutorise, echeanceValide, estAncetreOuEgale, OBSERVATION_TRANSITIONS, peutCreerTache, peutLier, REFUS_ACTEUR, refusCloture, REVISION_EXIGEE, statutApres,
  TACHE_TRANSITIONS, tacheApres, tacheAutorisee, VUE_MODES, type ActeurObservation, type ObservationTransition, type TacheTransition,
} from "./studio-observations.js";

export const STUDIO_COMMENT_MAX_OBJECTS = 200;

export const studioCommentSchema = z.object({
  body: z.string().trim().min(1, "Commentaire vide").max(4000),
  revisionId: studioIdentifierSchema.optional(),
  objectIds: z.array(z.string().min(1).max(256)).max(STUDIO_COMMENT_MAX_OBJECTS)
    .refine((ids) => new Set(ids).size === ids.length, "Objet cité deux fois").optional(),
  parentId: studioIdentifierSchema.optional(),
  requestId: studioIdentifierSchema.optional(),
  /** Audience du fil (E1) : `equipe` par défaut, `projet` = visible par les lecteurs ; une réponse suit son fil. */
  audience: audienceSchema.optional(),
}).strict();
export type StudioCommentInput = z.infer<typeof studioCommentSchema>;

/** Fils Studio lisibles par ce rôle (E1) : l'équipe lit tout ; les autres l'audience `projet` (NULL = archive antérieure = `projet`). */
export function audienceFilter(role: ProjectRole): SQL | undefined {
  return seesTeam(role) ? undefined : or(isNull(studioComments.audience), eq(studioComments.audience, "projet"));
}

/** Refus d'audience levé comme erreur de requête Studio (même forme que les autres refus). */
export function audienceOrRefuse<T>(f: () => T): T {
  try { return f(); } catch (e) {
    if (e instanceof AudienceError) throw new StudioRequestError(e.status, e.body);
    throw e;
  }
}

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
  /** Audience du fil (E1). */
  audience: CommentAudience;
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
  /** Responsable désigné par ce passage (ouverture et réattribution ; null pour une ouverture antérieure à ce champ). */
  responsableId: string | null;
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
  /** Contexte de vue déclaré à l'ouverture (E.2-02), null s'il n'a pas été cité. */
  vue: { mode: StudioObservationVueMode; ref: string | null } | null;
  /** Éléments des domaines suivis par cette même observation (E.2-01), du plus ancien au plus récent. */
  liens: StudioObservationLienView[];
  /** Tâches attribuées (E.2-03), de la plus ancienne à la plus récente, avec leur journal. */
  taches: StudioObservationTacheView[];
  /** Propositions et décisions distinctes (E.2-03 / E.2-04), journal append-only (`seq` croissant). */
  decisions: StudioObservationDecisionView[];
  /** Ce que l'utilisateur courant peut écrire maintenant, relu du serveur (rôle, statut, archive). */
  peut: { lier: boolean; creerTache: boolean; proposer: boolean; decider: boolean };
}

export interface StudioObservationLienView {
  id: string;
  domaine: StudioObservationDomaine;
  ref: string;
  revisionId: string | null;
  controleId: string | null;
  createdBy: string;
  createdAt: string;
}
export interface StudioObservationTacheEventView {
  seq: number; action: StudioObservationTacheAction; fromStatut: StudioObservationTacheStatut | null; toStatut: StudioObservationTacheStatut;
  actorId: string; actorEmail: string; assigneeId: string | null; note: string | null; at: string;
}
export interface StudioObservationTacheView {
  id: string;
  libelle: string;
  assigneeId: string;
  assigneeEmail: string;
  echeance: string | null;
  statut: StudioObservationTacheStatut;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  journal: StudioObservationTacheEventView[];
  assignedToMe: boolean;
  possibles: TacheTransition[];
}
export interface StudioObservationDecisionView {
  seq: number;
  nature: StudioObservationDecisionNature;
  portee: StudioObservationDecisionPortee;
  texte: string;
  actorId: string;
  actorEmail: string;
  actorRole: "proprietaire" | "editeur";
  revisionId: string | null;
  at: string;
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
    mine: c.authorId === actorId, audience: c.audience ?? "projet", observation,
  };
}

export const notFound = (message?: string): never => { throw new StudioRequestError(404, message ? { error: "not_found", message } : { error: "not_found" }); };

/** Droit vérifié par le serveur, puis portée : étude du projet, variante de l'étude ; sinon 404 sans rien révéler. */
export async function scopedVariant(scope: StudioScope, actorId: string, need: ProjectNeed) {
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
  payloadHash: studioComments.payloadHash, createdAt: studioComments.createdAt, deletedAt: studioComments.deletedAt, audience: studioComments.audience, authorEmail: users.email,
}).from(studioComments).leftJoin(users, eq(users.id, studioComments.authorId));

/** Fils de la variante : chaque commentaire d'origine (plus ancien d'abord) suivi de ses réponses (plus ancienne d'abord). */
export async function listStudioComments(scope: StudioScope, actorId: string): Promise<{ comments: StudioCommentView[]; participants: StudioParticipant[]; archived: boolean; me: { id: string; role: ProjectRole } }> {
  const variant = await scopedVariant(scope, actorId, "read");
  const rows = await selectRow().where(and(eq(studioComments.variantId, variant.id), audienceFilter(variant.access.role))).orderBy(asc(studioComments.createdAt), asc(studioComments.id));
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
export async function participants(project: AccessibleProject, executor: Pick<typeof db, "select"> = db): Promise<StudioParticipant[]> {
  const [owner] = await executor.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, project.ownerId)).limit(1);
  const members = await executor.select({ id: users.id, email: users.email, role: projectMembers.role }).from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, project.id))
    .orderBy(asc(projectMembers.createdAt), asc(users.id));
  const all: StudioParticipant[] = owner ? [{ ...owner, role: "proprietaire", assignable: true }] : [];
  for (const m of members) if (m.id !== project.ownerId) all.push({ id: m.id, email: m.email, role: m.role, assignable: roleAllows(m.role, "write") });
  return all;
}

export interface Lecteur { actorId: string; role: ProjectRole; archived: boolean }

/**
 * Comme `scopedVariant`, mais dans la transaction d'écriture et sous les verrous des autres écritures Studio : projet
 * (et membre de l'acteur) verrouillés par `lockedAccess`, ligne de variante partagée — un archivage, une révocation ou
 * un changement de rôle concurrent ne traverse pas la transaction ; droit et archive relus sous ces verrous.
 */
export async function lockedVariant(tx: Tx, scope: StudioScope, actorId: string, need: ProjectNeed) {
  const access = await lockedAccess(tx, scope.projectId, actorId);
  const refusal = projectAccessRefusal(access, actorId, need);
  if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
  const [variant] = await tx.select({ id: studioVariants.id, archived: studioVariants.archivedAt, studyArchived: studioStudies.archivedAt })
    .from(studioVariants).innerJoin(studioStudies, eq(studioStudies.id, studioVariants.studyId))
    .where(and(eq(studioVariants.id, scope.variantId), eq(studioStudies.id, scope.studyId), eq(studioStudies.projectId, scope.projectId)))
    .limit(1).for("share", { of: studioVariants });
  if (!variant) return notFound();
  const lecteur: Lecteur = { actorId, role: access.role, archived: variant.archived !== null || variant.studyArchived !== null };
  return { id: variant.id, access, lecteur };
}

/** Rôle de l'acteur vis-à-vis d'une observation, droit actuel compris (un responsable rétrogradé lecteur ne corrige plus). */
export function acteurDe(lecteur: Lecteur, responsableId: string, authorId: string): ActeurObservation {
  return {
    estResponsable: responsableId === lecteur.actorId, estAuteur: authorId === lecteur.actorId,
    estProprietaire: roleAllows(lecteur.role, "owner"), peutEcrire: roleAllows(lecteur.role, "write"),
  };
}

/** Observations de la variante (ou d'un seul commentaire), journal compris, avec les passages possibles du lecteur. */
export async function observationViews(variantId: string, commentId: string | null, lecteur: Lecteur, executor: Pick<typeof db, "select"> = db): Promise<Map<string, StudioObservationView>> {
  const where = and(eq(studioObservations.variantId, variantId), commentId === null ? undefined : eq(studioObservations.commentId, commentId), audienceFilter(lecteur.role));
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
      revisionId: e.revisionId, responsableId: e.responsableId, note: e.note, at: e.at.toISOString(),
    }]);
  }
  const ids = obs.map((x) => x.o.commentId);
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);
  // Liens de domaines (E.2-01), tâches et leur journal (E.2-03), décisions (E.2-03 / E.2-04).
  const liens = new Map<string, StudioObservationLienView[]>();
  for (const l of await executor.select().from(studioObservationLinks).where(inArray(studioObservationLinks.observationId, ids)).orderBy(asc(studioObservationLinks.createdAt), asc(studioObservationLinks.id))) {
    push(liens, l.observationId, { id: l.id, domaine: l.domaine, ref: l.ref, revisionId: l.revisionId, controleId: l.controleId, createdBy: l.createdBy, createdAt: l.createdAt.toISOString() });
  }
  const tasks = await executor.select({ t: studioObservationTasks, assigneeEmail: users.email }).from(studioObservationTasks)
    .leftJoin(users, eq(users.id, studioObservationTasks.assigneeId)).where(inArray(studioObservationTasks.observationId, ids))
    .orderBy(asc(studioObservationTasks.createdAt), asc(studioObservationTasks.id));
  const taskJournal = new Map<string, StudioObservationTacheEventView[]>();
  if (tasks.length) {
    const tev = await executor.select({ e: studioObservationTaskEvents, actorEmail: users.email }).from(studioObservationTaskEvents)
      .leftJoin(users, eq(users.id, studioObservationTaskEvents.actorId)).where(inArray(studioObservationTaskEvents.taskId, tasks.map((x) => x.t.id)))
      .orderBy(asc(studioObservationTaskEvents.taskId), asc(studioObservationTaskEvents.seq));
    for (const { e, actorEmail } of tev) {
      push(taskJournal, e.taskId, { seq: e.seq, action: e.action, fromStatut: e.fromStatut, toStatut: e.toStatut, actorId: e.actorId, actorEmail: actorEmail ?? "", assigneeId: e.assigneeId, note: e.note, at: e.at.toISOString() });
    }
  }
  const decisions = new Map<string, StudioObservationDecisionView[]>();
  for (const { d, actorEmail } of await executor.select({ d: studioObservationDecisions, actorEmail: users.email }).from(studioObservationDecisions)
    .leftJoin(users, eq(users.id, studioObservationDecisions.actorId)).where(inArray(studioObservationDecisions.observationId, ids))
    .orderBy(asc(studioObservationDecisions.observationId), asc(studioObservationDecisions.seq))) {
    push(decisions, d.observationId, { seq: d.seq, nature: d.nature, portee: d.portee, texte: d.texte, actorId: d.actorId, actorEmail: actorEmail ?? "", actorRole: d.actorRole, revisionId: d.revisionId, at: d.at.toISOString() });
  }
  const taches = new Map<string, StudioObservationTacheView[]>();
  for (const { o, authorId } of obs) {
    const acteur = acteurDe(lecteur, o.responsableId, authorId);
    const ouverte = !lecteur.archived && o.statut !== "cloturee";
    for (const { t, assigneeEmail } of tasks.filter((x) => x.t.observationId === o.commentId)) {
      const at = { estProprietaire: acteur.estProprietaire, peutEcrire: acteur.peutEcrire, estResponsableObservation: acteur.estResponsable, estChargee: t.assigneeId === lecteur.actorId, estCreateur: t.createdBy === lecteur.actorId };
      push(taches, o.commentId, {
        id: t.id, libelle: t.libelle, assigneeId: t.assigneeId, assigneeEmail: assigneeEmail ?? "", echeance: t.echeance, statut: t.statut, createdBy: t.createdBy,
        createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), journal: taskJournal.get(t.id) ?? [], assignedToMe: at.estChargee,
        possibles: ouverte ? TACHE_TRANSITIONS.filter((a) => tacheAutorisee(a, at) && tacheApres(t.statut, a) !== null) : [],
      });
    }
  }
  for (const { o, responsableEmail, authorId } of obs) {
    const acteur = acteurDe(lecteur, o.responsableId, authorId);
    const ouverte = !lecteur.archived && o.statut !== "cloturee";
    result.set(o.commentId, {
      id: o.commentId, authorId, responsableId: o.responsableId, responsableEmail: responsableEmail ?? "", echeance: o.echeance, statut: o.statut,
      correctionRevisionId: o.correctionRevisionId, recontroleRevisionId: o.recontroleRevisionId, createdBy: o.createdBy,
      createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(), journal: journal.get(o.commentId) ?? [],
      assignedToMe: acteur.estResponsable,
      possibles: lecteur.archived ? [] : OBSERVATION_TRANSITIONS.filter((a) => acteurAutorise(a, acteur, o.statut) && statutApres(o.statut, a) !== null),
      vue: o.vueMode ? { mode: o.vueMode, ref: o.vueRef } : null,
      liens: liens.get(o.commentId) ?? [], taches: taches.get(o.commentId) ?? [], decisions: decisions.get(o.commentId) ?? [],
      peut: {
        lier: ouverte && peutLier(acteur), creerTache: ouverte && peutCreerTache({ ...acteur, estResponsableObservation: acteur.estResponsable }),
        proposer: ouverte && acteur.peutEcrire, decider: ouverte && acteur.estProprietaire,
      },
    });
  }
  return result;
}

const noteSchema = z.string().trim().min(1).max(2000).optional();
/** Contexte de vue cité à l'ouverture (E.2-02) : mode de l'espace de travail et repère facultatif dans ce mode. */
export const studioObservationVueSchema = z.object({
  mode: z.enum(VUE_MODES as [StudioObservationVueMode, ...StudioObservationVueMode[]]),
  ref: z.string().trim().min(1).max(256).optional(),
}).strict();
export const studioObservationSchema = z.object({
  responsableId: z.string().min(1).max(256),
  echeance: z.string().refine(echeanceValide, "Échéance attendue au format AAAA-MM-JJ.").nullable().optional(),
  note: noteSchema,
  vue: studioObservationVueSchema.optional(),
  requestId: studioIdentifierSchema.optional(),
}).strict();
export type StudioObservationInput = z.infer<typeof studioObservationSchema>;

export const studioObservationTransitionSchema = z.object({
  action: z.enum(OBSERVATION_TRANSITIONS as [ObservationTransition, ...ObservationTransition[]]),
  revisionId: studioIdentifierSchema.optional(),
  /** Nouveau responsable : exigé par `reattribuer`, refusé par les autres passages. */
  responsableId: z.string().min(1).max(256).optional(),
  note: noteSchema,
  requestId: studioIdentifierSchema.optional(),
}).strict().refine((v) => (v.action === "reattribuer") === (v.responsableId !== undefined), {
  message: "responsableId est exigé par reattribuer et refusé par les autres passages.", path: ["responsableId"],
});
export type StudioObservationTransitionInput = z.infer<typeof studioObservationTransitionSchema>;

export const hashOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const conflict = (error: string, message: string, extra: Record<string, unknown> = {}): never => { throw new StudioRequestError(409, { error, message, ...extra }); };

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
  // La vue n'entre dans l'empreinte que citée : un rejeu d'une promotion antérieure à ce champ garde son empreinte.
  const hash = hashOf({ action: "ouvrir", responsableId: input.responsableId, echeance: input.echeance ?? null, note: input.note ?? null, ...(input.vue ? { vue: input.vue } : {}) });
  const { variantId, lecteur, replayed } = await db.transaction(async (tx) => {
    const variant = await lockedVariant(tx, scope, actorId, "comment");
    const lecteur = variant.lecteur;
    const done = (replayed: boolean) => ({ variantId: variant.id, lecteur, replayed });
    const [comment] = await tx.select({ id: studioComments.id, parentId: studioComments.parentId, authorId: studioComments.authorId, deletedAt: studioComments.deletedAt })
      .from(studioComments).where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, commentId), audienceFilter(lecteur.role))).limit(1).for("update");
    if (!comment) return notFound();
    if (await replayedEvent(tx, comment.id, input.requestId, actorId, hash)) return done(true);
    if (lecteur.archived) studioArchivedRefusal();
    if (comment.authorId !== actorId && !roleAllows(variant.access.role, "owner")) {
      throw new StudioRequestError(403, { error: "forbidden", message: "Seul l'auteur du commentaire ou le propriétaire du projet en fait une observation." });
    }
    if (comment.deletedAt) return notFound("Ce commentaire a été supprimé.");
    if (comment.parentId) throw new StudioRequestError(400, { error: "invalid_input", code: "reponse", message: "Seul un commentaire d'origine devient une observation, pas une réponse." });
    const [existing] = await tx.select({ id: studioObservations.commentId }).from(studioObservations).where(eq(studioObservations.commentId, comment.id)).limit(1);
    if (existing) conflict("already_observation", "Ce commentaire est déjà une observation.");
    const responsable = await assignable(tx, variant.access, input.responsableId);
    await insertObservationRows(tx, { commentId: comment.id, variantId: variant.id, responsableId: responsable, input, actorId, hash });
    return done(false);
  });
  return observationResult(variantId, commentId, lecteur, replayed);
}

/** Ouverture : ligne d'observation (statut « ouverte », vue citée) et premier passage du journal (`seq` 1). */
export async function insertObservationRows(tx: Tx, o: { commentId: string; variantId: string; responsableId: string; input: Pick<StudioObservationInput, "echeance" | "note" | "vue" | "requestId">; actorId: string; hash: string }): Promise<void> {
  await tx.insert(studioObservations).values({
    commentId: o.commentId, variantId: o.variantId, responsableId: o.responsableId, echeance: o.input.echeance ?? null, statut: "ouverte", createdBy: o.actorId,
    vueMode: o.input.vue?.mode ?? null, vueRef: o.input.vue?.ref ?? null,
  });
  await tx.insert(studioObservationEvents).values({
    id: newId("studio_observation_event"), observationId: o.commentId, seq: 1, action: "ouvrir", fromStatut: null, toStatut: "ouverte", actorId: o.actorId,
    revisionId: null, responsableId: o.responsableId, note: o.input.note ?? null, requestId: o.input.requestId ?? null, payloadHash: o.hash,
  });
}

/** Responsable désignable maintenant (propriétaire ou éditeur, relu sous le verrou du projet), sinon 400. */
export async function assignable(tx: Tx, project: AccessibleProject, userId: string): Promise<string> {
  const p = (await participants(project, tx)).find((x) => x.id === userId);
  if (!p?.assignable) {
    throw new StudioRequestError(400, { error: "invalid_input", code: "responsable_invalide", message: "Le responsable doit être le propriétaire ou un éditeur du projet." });
  }
  return p.id;
}

/** Révisions de la variante : identifiant → parent (chaîne immuable). */
export async function revisionParents(tx: Pick<typeof db, "select">, variantId: string): Promise<Map<string, string | null>> {
  const rows = await tx.select({ id: studioRevisions.id, parent: studioRevisions.parentRevisionId }).from(studioRevisions).where(eq(studioRevisions.variantId, variantId));
  return new Map(rows.map((r) => [r.id, r.parent]));
}

/**
 * Passage d'une observation (200). Ordre des refus : portée 404 → archive 409 archived → rôle 403 → statut
 * 409 invalid_transition → révision (exigée 400, inconnue 404, antérieure 409 revision_anterieure).
 */
export async function transitionStudioObservation(scope: StudioScope, actorId: string, commentId: string, input: StudioObservationTransitionInput): Promise<StudioObservationView & { replayed: boolean }> {
  const action = input.action;
  const hash = hashOf({ action, revisionId: input.revisionId ?? null, note: input.note ?? null, ...(input.responsableId !== undefined ? { responsableId: input.responsableId } : {}) });
  const { variantId, lecteur, replayed } = await db.transaction(async (tx) => {
    const variant = await lockedVariant(tx, scope, actorId, "comment");
    const lecteur = variant.lecteur;
    const done = (replayed: boolean) => ({ variantId: variant.id, lecteur, replayed });
    const [row] = await tx.select({ o: studioObservations, authorId: studioComments.authorId }).from(studioObservations)
      .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
      .where(and(eq(studioObservations.variantId, variant.id), eq(studioObservations.commentId, commentId), audienceFilter(variant.lecteur.role))).limit(1).for("update", { of: studioObservations });
    if (!row) return notFound("Ce commentaire n'est pas une observation.");
    const { o } = row;
    if (await replayedEvent(tx, o.commentId, input.requestId, actorId, hash)) return done(true);
    if (lecteur.archived) studioArchivedRefusal();
    // Rôle relu sous le verrou du projet : un responsable rétrogradé lecteur ne déclare plus la correction.
    const acteur = acteurDe(lecteur, o.responsableId, row.authorId);
    if (!acteurAutorise(action, acteur, o.statut)) throw new StudioRequestError(403, { error: "forbidden", message: REFUS_ACTEUR[action] });
    const vers = statutApres(o.statut, action);
    if (vers === null) conflict("invalid_transition", "Ce passage n'est pas permis depuis le statut actuel.", { statut: o.statut, action });
    if (REVISION_EXIGEE[action] && input.revisionId === undefined) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "revision_exigee", message: "Citez la révision de la variante concernée." });
    }
    // Réattribution : nouveau responsable propriétaire ou éditeur au moment du passage, différent de l'actuel.
    const responsableId = action === "reattribuer" ? await assignable(tx, variant.access, input.responsableId!) : null;
    if (responsableId !== null && responsableId === o.responsableId) conflict("same_responsable", "Cette personne est déjà responsable de l'observation.");
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
    // Décision de clôture (E.2-04) : motivée, sans tâche restant à faire (tâches lues sous le verrou de l'observation,
    // que toute écriture de tâche prend aussi).
    if (action === "cloturer") {
      const ouvertes = await tx.select({ id: studioObservationTasks.id }).from(studioObservationTasks)
        .where(and(eq(studioObservationTasks.observationId, o.commentId), eq(studioObservationTasks.statut, "a-faire")));
      const refus = refusCloture(input.note, ouvertes.length);
      if (refus) throw new StudioRequestError(refus.status, refus.body);
    }
    // Sous le verrou de la ligne d'observation : `seq` suivant sans trou ni doublon.
    const [last] = await tx.select({ seq: studioObservationEvents.seq }).from(studioObservationEvents)
      .where(eq(studioObservationEvents.observationId, o.commentId)).orderBy(desc(studioObservationEvents.seq)).limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const now = new Date();
    if (action === "cloturer") {
      // La décision de clôture est consignée à part des passages : qui (propriétaire), quand, motif, révision recontrôlée.
      await insertDecision(tx, {
        observationId: o.commentId, nature: "decision", portee: "cloture", texte: input.note!, actorId, actorRole: "proprietaire",
        revisionId: o.recontroleRevisionId, requestId: null, payloadHash: null, at: now,
      });
    }
    await tx.update(studioObservations).set({
      statut: vers!, updatedAt: now,
      ...(action === "corriger" ? { correctionRevisionId: revisionId, recontroleRevisionId: null } : {}),
      ...(action === "recontroler" ? { recontroleRevisionId: revisionId } : {}),
      ...(responsableId !== null ? { responsableId } : {}),
    }).where(eq(studioObservations.commentId, o.commentId));
    await tx.insert(studioObservationEvents).values({
      id: newId("studio_observation_event"), observationId: o.commentId, seq, action, fromStatut: o.statut, toStatut: vers!, actorId,
      revisionId, responsableId, note: input.note ?? null, requestId: input.requestId ?? null, payloadHash: hash, at: now,
    });
    return done(false);
  });
  return observationResult(variantId, commentId, lecteur, replayed);
}

/** Décision ou proposition ajoutée au journal des décisions, `seq` suivant (sous le verrou de l'observation). */
export async function insertDecision(tx: Tx, d: {
  observationId: string; nature: StudioObservationDecisionNature; portee: StudioObservationDecisionPortee; texte: string; actorId: string;
  actorRole: "proprietaire" | "editeur"; revisionId: string | null; requestId: string | null; payloadHash: string | null; at?: Date;
}): Promise<number> {
  const [last] = await tx.select({ seq: studioObservationDecisions.seq }).from(studioObservationDecisions)
    .where(eq(studioObservationDecisions.observationId, d.observationId)).orderBy(desc(studioObservationDecisions.seq)).limit(1);
  const seq = (last?.seq ?? 0) + 1;
  await tx.insert(studioObservationDecisions).values({
    id: newId("studio_observation_decision"), observationId: d.observationId, seq, nature: d.nature, portee: d.portee, texte: d.texte, actorId: d.actorId,
    actorRole: d.actorRole, revisionId: d.revisionId, requestId: d.requestId, payloadHash: d.payloadHash, ...(d.at ? { at: d.at } : {}),
  });
  return seq;
}

// ---------------------------------------------------------------------------

function payloadHash(input: StudioCommentInput): string {
  // L'audience n'entre dans l'empreinte que citée : un rejeu d'un envoi antérieur à ce champ garde son empreinte.
  const canonical = { body: input.body, revisionId: input.revisionId ?? null, objectIds: input.objectIds ?? [], parentId: input.parentId ?? null, ...(input.audience ? { audience: input.audience } : {}) };
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
  let threadAudience: CommentAudience | null | undefined;
  if (input.parentId !== undefined) {
    const [parent] = await db.select({ id: studioComments.id, parentId: studioComments.parentId, deletedAt: studioComments.deletedAt, audience: studioComments.audience }).from(studioComments)
      .where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, input.parentId), audienceFilter(variant.access.role))).limit(1);
    if (!parent || parent.deletedAt) return notFound("Le commentaire auquel vous répondez n'existe plus.");
    parentId = parent.parentId ?? parent.id;
    threadAudience = parent.audience;
  }
  const audience = audienceOrRefuse(() => audienceOfNew(variant.access.role, input.audience, threadAudience));
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
      requestId: input.requestId ?? null, payloadHash: hash, audience,
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
  // Même transaction et mêmes verrous que la promotion (projet, variante, ligne du commentaire) : une promotion
  // concurrente attend la suppression, ou la suppression voit l'observation créée.
  await db.transaction(async (tx) => {
    const variant = await lockedVariant(tx, scope, actorId, "comment");
    const [existing] = await tx.select({ authorId: studioComments.authorId, deletedAt: studioComments.deletedAt }).from(studioComments)
      .where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, commentId), audienceFilter(variant.lecteur.role))).limit(1).for("update");
    if (!existing) return notFound();
    if (existing.authorId !== actorId) throw new StudioRequestError(403, { error: "forbidden", message: "Seul l'auteur peut supprimer son commentaire." });
    if (existing.deletedAt) return;
    // Une observation et son journal restent lisibles : le commentaire qui la porte ne se supprime plus.
    const [observation] = await tx.select({ id: studioObservations.commentId }).from(studioObservations).where(eq(studioObservations.commentId, commentId)).limit(1);
    if (observation) conflict("observation", "Ce commentaire est une observation : il ne peut plus être supprimé.");
    await tx.update(studioComments).set({ deletedAt: new Date() })
      .where(and(eq(studioComments.id, commentId), eq(studioComments.authorId, actorId)));
  });
}

/**
 * Audience d'un fil Studio (E1) : le commentaire d'origine et ses réponses ensemble (l'observation et son suivi
 * suivent), par son auteur ou le propriétaire, tous deux de l'équipe ; journalisée dans la même transaction
 * (`comment.audience_changed`). Refusée sur une réponse (422) et, vers `equipe`, tant qu'un lecteur actuel a écrit
 * dans le fil (409). Une archive reste lisible mais ne change plus (409 archived).
 */
export async function setStudioCommentAudience(scope: StudioScope, actorId: string, commentId: string, next: CommentAudience, ip: string | null): Promise<StudioCommentView> {
  const lecteur = await db.transaction(async (tx) => {
    const variant = await lockedVariant(tx, scope, actorId, "comment");
    const [root] = await tx.select({ id: studioComments.id, parentId: studioComments.parentId, authorId: studioComments.authorId, audience: studioComments.audience })
      .from(studioComments).where(and(eq(studioComments.variantId, variant.id), eq(studioComments.id, commentId), audienceFilter(variant.lecteur.role))).limit(1).for("update");
    if (!root) return notFound();
    if (variant.lecteur.archived) studioArchivedRefusal();
    if (root.parentId) throw new StudioRequestError(422, { error: "audience_du_fil", message: "Une réponse suit l'audience de son fil : changez celle du commentaire d'origine." });
    const replies = await tx.select({ authorId: studioComments.authorId }).from(studioComments).where(and(eq(studioComments.variantId, variant.id), eq(studioComments.parentId, root.id)));
    const authors = [...new Set([root.authorId, ...replies.map((r) => r.authorId)])];
    const readers = await tx.select({ userId: projectMembers.userId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, scope.projectId), eq(projectMembers.role, "lecteur"), inArray(projectMembers.userId, authors)));
    const refusal = audienceChangeRefusal({ role: variant.lecteur.role, isAuthor: root.authorId === actorId }, next, readers.length > 0);
    if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
    const before = root.audience ?? "projet";
    if (before !== next) {
      await tx.update(studioComments).set({ audience: next }).where(and(eq(studioComments.variantId, variant.id), or(eq(studioComments.id, root.id), eq(studioComments.parentId, root.id))));
      await audit(tx, { actorId, action: "comment.audience_changed", target: { type: "project", id: scope.projectId }, metadata: { commentId: root.id, module: "studio", variantId: variant.id, audienceBefore: before, audienceAfter: next, replies: replies.length }, ip });
    }
    return variant.lecteur;
  });
  const [row] = await selectRow().where(and(eq(studioComments.variantId, scope.variantId), eq(studioComments.id, commentId))).limit(1);
  const observation = (await observationViews(scope.variantId, commentId, lecteur)).get(commentId) ?? null;
  return view(row!, actorId, observation);
}
