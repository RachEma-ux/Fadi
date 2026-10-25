/**
 * Temps réel — annotations enregistrées (RTC-3, Issue #283 ; critères RT-R3, RT-R5 ; test TR-T04).
 *
 * Une annotation est un geste délibéré pendant une session : un commentaire Studio ordinaire (même identifiant, même
 * texte, même auteur, même audience, objets cités vérifiés contre la révision) **ancré à la révision épinglée par la
 * session** (révision source), plus une ligne `rt_annotations` qui garde le point de vue (cadre plan `local-2d` et / ou
 * caméra `local-3d`, mètres) et la session d'origine. Rien n'est recopié du circuit des commentaires : création,
 * audience (écart E1), idempotence par `requestId`, promotion en observation (tâches, décisions) et conversation COM
 * restent ceux de Studio. L'annotation survit à la clôture de la session ; la révision source ne change jamais.
 *
 * Rejeu : même `requestId`, même contenu et même point de vue = la même annotation (aucun doublon, aucune annonce) ;
 * même `requestId` avec un autre point de vue = 409 `request_conflict`. Une ligne de point de vue manquante (réponse
 * perdue entre les deux écritures) est complétée par le rejeu.
 */
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { rtAnnotations, studioComments, studioObservations, users, type RtPointDeVue } from "../db/schema.js";
import type { CommentAudience } from "./audience.js";
import { seesTeam } from "./audience.js";
import type { ProjectRole } from "./owned-project.js";
import { createStudioComment, type StudioCommentView } from "./studio-commentaires.js";
import { StudioRequestError } from "./studio-commands.js";
import { canonique, pointDeVue, type PointDeVueSaisi } from "./temps-reel-protocole.js";
import { lireSession, sessionOuverte, TempsReelErreur, type SessionRow } from "./temps-reel-sessions.js";

export interface AnnotationSaisie {
  body: string;
  objectIds?: string[] | undefined;
  audience?: CommentAudience | undefined;
  requestId: string;
  vue: PointDeVueSaisi;
}

export interface AnnotationVue {
  commentId: string;
  sessionId: string | null;
  sourceRevisionId: string;
  pointDeVue: RtPointDeVue;
  body: string | null;
  objectIds: string[];
  audience: CommentAudience;
  auteurId: string;
  auteur: string;
  observation: boolean;
  createdAt: string;
}

const memePointDeVue = (a: RtPointDeVue, b: RtPointDeVue) => canonique(a) === canonique(b);

/** Erreurs du circuit des commentaires Studio rendues comme les refus du temps réel (même forme : `error`, `message`). */
function refusStudio(e: StudioRequestError): TempsReelErreur {
  const code = typeof e.body["error"] === "string" ? e.body["error"] : "refus";
  const message = typeof e.body["message"] === "string" ? e.body["message"] : "Annotation refusée.";
  return new TempsReelErreur(e.status, code, message);
}

export async function annoter(projectId: string, sessionId: string, actorId: string, saisie: AnnotationSaisie): Promise<{ annotation: StudioCommentView; session: SessionRow; pointDeVue: RtPointDeVue; rejoue: boolean }> {
  const session = await lireSession(db, projectId, sessionId);
  if (!session) throw new TempsReelErreur(404, "not_found", "Session introuvable.");
  if (!sessionOuverte(session)) throw new TempsReelErreur(409, "session_close", "La session est close : annotez depuis les commentaires Studio.");
  const vue = pointDeVue(saisie.vue);
  let commentaire: StudioCommentView & { replayed: boolean };
  try {
    commentaire = await createStudioComment(
      { projectId, studyId: session.studyId, variantId: session.variantId },
      actorId,
      { body: saisie.body, revisionId: session.revisionId, ...(saisie.objectIds ? { objectIds: saisie.objectIds } : {}), ...(saisie.audience ? { audience: saisie.audience } : {}), requestId: saisie.requestId },
    );
  } catch (e) {
    if (e instanceof StudioRequestError) throw refusStudio(e);
    throw e;
  }
  await db.insert(rtAnnotations).values({
    commentId: commentaire.id, projectId, variantId: session.variantId, sessionId: session.id, sourceRevisionId: commentaire.revisionId ?? session.revisionId, viewpoint: vue,
  }).onConflictDoNothing();
  const [ligne] = await db.select().from(rtAnnotations).where(eq(rtAnnotations.commentId, commentaire.id)).limit(1);
  if (!ligne || ligne.sessionId !== session.id || !memePointDeVue(ligne.viewpoint, vue)) {
    throw new TempsReelErreur(409, "request_conflict", "Cet identifiant de requête est déjà utilisé pour une autre annotation.");
  }
  return { annotation: commentaire, session, pointDeVue: vue, rejoue: commentaire.replayed };
}

/**
 * Annotations d'une variante (revue asynchrone après la session), filtrées par l'audience du fil (E1) : pour un
 * lecteur, une annotation de l'équipe n'existe pas. Un commentaire supprimé par son auteur garde son point de vue mais
 * plus son texte (même règle que les commentaires Studio).
 */
export async function listerAnnotations(projectId: string, variantId: string, role: ProjectRole, filtre: { sessionId?: string | undefined } = {}): Promise<AnnotationVue[]> {
  const audience = seesTeam(role) ? undefined : or(isNull(studioComments.audience), eq(studioComments.audience, "projet"));
  const lignes = await db.select({
    a: rtAnnotations, body: studioComments.body, deletedAt: studioComments.deletedAt, objectIds: studioComments.objectIds, audience: studioComments.audience,
    authorId: studioComments.authorId, auteur: users.displayName, email: users.email, observation: studioObservations.commentId,
  }).from(rtAnnotations)
    .innerJoin(studioComments, eq(studioComments.id, rtAnnotations.commentId))
    .innerJoin(users, eq(users.id, studioComments.authorId))
    .leftJoin(studioObservations, eq(studioObservations.commentId, rtAnnotations.commentId))
    .where(and(eq(rtAnnotations.projectId, projectId), eq(rtAnnotations.variantId, variantId), filtre.sessionId ? eq(rtAnnotations.sessionId, filtre.sessionId) : undefined, audience))
    .orderBy(asc(rtAnnotations.createdAt));
  return lignes.map((l) => ({
    commentId: l.a.commentId, sessionId: l.a.sessionId, sourceRevisionId: l.a.sourceRevisionId, pointDeVue: l.a.viewpoint,
    body: l.deletedAt ? null : l.body, objectIds: l.objectIds, audience: l.audience ?? "projet", auteurId: l.authorId, auteur: l.auteur?.trim() || l.email,
    observation: l.observation !== null, createdAt: l.a.createdAt.toISOString(),
  }));
}
