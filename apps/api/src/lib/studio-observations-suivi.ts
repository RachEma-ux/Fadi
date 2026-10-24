/**
 * Suivi des observations Studio (E.2-01 à E.2-05), au-delà du fil des commentaires (`studio-commentaires.ts`, qui
 * construit la vue d'une observation et porte ses passages) :
 *
 * - **identité unique réemployée** (E.2-01) : une observation reste un commentaire d'origine promu (même identifiant) ;
 *   elle peut être ouverte directement depuis un domaine (exigence BIM et son contrôle, ligne de métré, revue, objet du
 *   modèle) et suivre plusieurs éléments de domaines. Un élément n'est suivi que par UNE observation de la variante :
 *   une seconde demande renvoie 409 `deja_suivie` avec l'identifiant existant, qui est réemployé, jamais doublé ; la
 *   recherche par domaine (`?domaine=&ref=`) relit cette identité ;
 * - **contexte et responsable** (E.2-02) : étude, variante, révision et objets d'ancrage (commentaire), vue citée,
 *   responsable propriétaire ou éditeur ;
 * - **tâches et décisions distinctes** (E.2-03) : tâches attribuées (journal append-only des passages) et journal
 *   append-only des propositions (éditeur) et décisions (propriétaire) ;
 * - **clôture** (E.2-04 / E.2-05) : par le passage « clôturer » (propriétaire seul, après recontrôle, motivé, sans tâche
 *   à faire), qui consigne la décision de clôture ; un éditeur propose la clôture, il ne la décide pas.
 *
 * Toute écriture se fait sous les verrous de `lockedVariant` (projet, membre, variante) puis de la ligne d'observation
 * (FOR UPDATE) : `seq` sans trou, clôture et tâches sérialisées. Ordre des refus : portée 404 → rejeu → archive 409 →
 * observation clôturée 409 → rôle 403 → statut 409 → contenu 400 / 404 / 409.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { quantitesStudio, type StudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import {
  studioComments, studioObservationDecisions, studioObservationLinks, studioObservations, studioObservationTaskEvents, studioObservationTasks, studioPublications,
  studioRequirementChecks, studioRequirementSets, studioRevisions, studioVariants, users,
  type StudioObservationDecisionNature, type StudioObservationDecisionPortee, type StudioObservationDomaine,
} from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import { newId } from "./ids.js";
import { roleAllows, type ProjectRole } from "./owned-project.js";
import { audienceOfNew, audienceSchema, type CommentAudience } from "./audience.js";
import { StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, type StudioScope } from "./studio-commands.js";
import {
  acteurDe, assignable, audienceFilter, audienceOrRefuse, conflict, hashOf, insertDecision, insertObservationRows, lockedVariant, notFound, observationViews, participants, scopedVariant,
  STUDIO_COMMENT_MAX_OBJECTS, studioObservationVueSchema, type Lecteur, type StudioObservationView, type StudioParticipant,
} from "./studio-commentaires.js";
import {
  DOMAINE_AVEC_REVISION, echeanceValide, lireRefMetre, OBSERVATION_DOMAINES, peutCreerTache, peutLier, REFUS_TACHE, refusDecision, TACHE_TRANSITIONS, tacheApres,
  tacheAutorisee, type TacheTransition,
} from "./studio-observations.js";

// ---------------------------------------------------------------------------
// Schémas

const domaineSchema = z.enum(OBSERVATION_DOMAINES as [StudioObservationDomaine, ...StudioObservationDomaine[]]);
export const studioObservationLienSchema = z.object({
  domaine: domaineSchema,
  ref: z.string().trim().min(1).max(300),
  revisionId: studioIdentifierSchema.optional(),
  /** Exigence seulement : contrôle enregistré de la variante où l'écart a été vu. */
  controleId: studioIdentifierSchema.optional(),
}).strict().refine((l) => l.domaine === "exigence" || l.controleId === undefined, { message: "controleId ne s'emploie qu'avec une exigence.", path: ["controleId"] });
export type StudioObservationLienInput = z.infer<typeof studioObservationLienSchema>;

const note = z.string().trim().min(1).max(2000).optional();
const echeance = z.string().refine(echeanceValide, "Échéance attendue au format AAAA-MM-JJ.").nullable().optional();

/** Ouverture directe d'une observation (texte, ancrage, responsable, vue, liens de domaines) : commentaire et observation en une transaction. */
export const studioObservationOuvertureSchema = z.object({
  body: z.string().trim().min(1, "Observation vide").max(4000),
  revisionId: studioIdentifierSchema.optional(),
  objectIds: z.array(z.string().min(1).max(256)).max(STUDIO_COMMENT_MAX_OBJECTS).refine((ids) => new Set(ids).size === ids.length, "Objet cité deux fois").optional(),
  responsableId: z.string().min(1).max(256),
  echeance,
  note,
  vue: studioObservationVueSchema.optional(),
  liens: z.array(studioObservationLienSchema).max(20).optional(),
  requestId: studioIdentifierSchema.optional(),
  /** Audience (E1) : `equipe` par défaut, `projet` = visible par les lecteurs. */
  audience: audienceSchema.optional(),
}).strict();
export type StudioObservationOuverture = z.infer<typeof studioObservationOuvertureSchema>;

export const studioObservationLienAjoutSchema = z.object({
  domaine: domaineSchema, ref: z.string().trim().min(1).max(300), revisionId: studioIdentifierSchema.optional(), controleId: studioIdentifierSchema.optional(),
  requestId: studioIdentifierSchema.optional(),
}).strict().refine((l) => l.domaine === "exigence" || l.controleId === undefined, { message: "controleId ne s'emploie qu'avec une exigence.", path: ["controleId"] });

export const studioObservationTacheSchema = z.object({
  libelle: z.string().trim().min(1, "Tâche vide").max(500),
  assigneeId: z.string().min(1).max(256),
  echeance,
  note,
  requestId: studioIdentifierSchema.optional(),
}).strict();

export const studioObservationTacheTransitionSchema = z.object({
  action: z.enum(TACHE_TRANSITIONS as [TacheTransition, ...TacheTransition[]]),
  /** Nouvelle personne chargée : exigée par `reattribuer`, refusée par les autres passages. */
  assigneeId: z.string().min(1).max(256).optional(),
  note,
  requestId: studioIdentifierSchema.optional(),
}).strict().refine((v) => (v.action === "reattribuer") === (v.assigneeId !== undefined), {
  message: "assigneeId est exigé par reattribuer et refusé par les autres passages.", path: ["assigneeId"],
});

export const studioObservationDecisionSchema = z.object({
  nature: z.enum(["proposition", "decision"]),
  portee: z.enum(["cloture", "autre"]),
  texte: z.string().trim().min(1, "Décision vide").max(2000),
  revisionId: studioIdentifierSchema.optional(),
  requestId: studioIdentifierSchema.optional(),
}).strict();

// ---------------------------------------------------------------------------
// Lecture

/** Observation lue hors du fil : la vue complète, le texte d'origine et son contexte (étude, variante, révision, objets). */
export interface StudioObservationDetail extends StudioObservationView {
  body: string;
  authorEmail: string;
  /** Audience du fil (E1). */
  audience: CommentAudience;
  contexte: { projectId: string; studyId: string; variantId: string; revisionId: string | null; objectIds: string[] };
}
export interface StudioObservationsLecture {
  observations: StudioObservationDetail[];
  participants: StudioParticipant[];
  archived: boolean;
  me: { id: string; role: string };
}

async function details(scope: StudioScope, variantId: string, lecteur: Lecteur, ids: string[] | null, executor: Pick<typeof db, "select"> = db): Promise<StudioObservationDetail[]> {
  const views = ids?.length === 1 ? await observationViews(variantId, ids[0]!, lecteur, executor) : await observationViews(variantId, null, lecteur, executor);
  const wanted = ids === null ? [...views.keys()] : ids.filter((id) => views.has(id));
  if (!wanted.length) return [];
  const rows = await executor.select({ id: studioComments.id, body: studioComments.body, revisionId: studioComments.revisionId, objectIds: studioComments.objectIds, email: users.email, createdAt: studioComments.createdAt, audience: studioComments.audience })
    .from(studioComments).leftJoin(users, eq(users.id, studioComments.authorId)).where(inArray(studioComments.id, wanted)).orderBy(asc(studioComments.createdAt), asc(studioComments.id));
  return rows.map((c) => ({
    ...views.get(c.id)!, body: c.body, authorEmail: c.email ?? "", audience: c.audience ?? "projet",
    contexte: { projectId: scope.projectId, studyId: scope.studyId, variantId, revisionId: c.revisionId, objectIds: c.objectIds },
  }));
}

/** Observations de la variante (plus ancienne d'abord) ; `domaine` + `ref` : celle qui suit cet élément (au plus une). */
export async function listStudioObservations(scope: StudioScope, actorId: string, filtre: { domaine?: string; ref?: string }): Promise<StudioObservationsLecture> {
  const variant = await scopedVariant(scope, actorId, "read");
  const archived = variant.archived !== null || variant.studyArchived !== null;
  const lecteur: Lecteur = { actorId, role: variant.access.role, archived };
  let ids: string[] | null = null;
  if (filtre.domaine !== undefined || filtre.ref !== undefined) {
    const d = domaineSchema.safeParse(filtre.domaine);
    if (!d.success || !filtre.ref) throw new StudioRequestError(400, { error: "invalid_input", message: "Filtre attendu : domaine (exigence, metre, revue, objet) et ref." });
    const found = await db.select({ id: studioObservationLinks.observationId }).from(studioObservationLinks)
      .where(and(eq(studioObservationLinks.variantId, variant.id), eq(studioObservationLinks.domaine, d.data), eq(studioObservationLinks.ref, filtre.ref)));
    ids = found.map((f) => f.id);
  }
  return { observations: await details(scope, variant.id, lecteur, ids), participants: await participants(variant.access), archived, me: { id: actorId, role: variant.access.role } };
}

export async function getStudioObservation(scope: StudioScope, actorId: string, observationId: string): Promise<StudioObservationDetail> {
  const variant = await scopedVariant(scope, actorId, "read");
  const lecteur: Lecteur = { actorId, role: variant.access.role, archived: variant.archived !== null || variant.studyArchived !== null };
  const [d] = await details(scope, variant.id, lecteur, [observationId]);
  return d ?? notFound("Observation inconnue pour cette variante.");
}

// ---------------------------------------------------------------------------
// Validation des liens de domaines (contre la base : jamais deviné)

interface VarianteVerrouillee { id: string; studyId: string; headRevisionId: string }

const lienInvalide = (lien: { domaine: string; ref: string }, message: string): never => {
  throw new StudioRequestError(400, { error: "invalid_input", code: "lien_invalide", domaine: lien.domaine, ref: lien.ref, message });
};

async function documentDe(tx: Tx, variantId: string, revisionId: string): Promise<StudioDocument> {
  const [r] = await tx.select({ document: studioRevisions.document }).from(studioRevisions)
    .where(and(eq(studioRevisions.variantId, variantId), eq(studioRevisions.id, revisionId))).limit(1);
  return r ? (r.document as StudioDocument) : notFound("Révision inconnue pour cette variante.");
}

/**
 * Lien vérifié : l'élément existe dans son domaine pour cette variante. Exigence : présente dans une version du jeu de
 * l'étude, et, si un contrôle est cité, écart de ce contrôle (révision = celle du contrôle). Métré : grandeur de l'objet
 * dans le métré de la révision citée (tête par défaut, enregistrée). Revue : publication de la même variante (révision =
 * celle de la publication). Objet : objet ou cote de la révision citée (tête par défaut, enregistrée).
 */
export async function validerLien(tx: Tx, v: VarianteVerrouillee, lien: StudioObservationLienInput): Promise<{ domaine: StudioObservationDomaine; ref: string; revisionId: string | null; controleId: string | null }> {
  const ref = lien.ref;
  let revisionId: string | null = lien.revisionId ?? (DOMAINE_AVEC_REVISION[lien.domaine] ? v.headRevisionId : null);
  if (revisionId !== null) await documentDe(tx, v.id, revisionId);
  switch (lien.domaine) {
    case "exigence": {
      const sets = await tx.select({ requirements: studioRequirementSets.requirements }).from(studioRequirementSets).where(eq(studioRequirementSets.studyId, v.studyId));
      if (!sets.some((s) => Array.isArray(s.requirements) && s.requirements.some((e) => e.id === ref))) lienInvalide(lien, "Exigence absente du jeu d'exigences de l'étude.");
      if (lien.controleId === undefined) return { domaine: "exigence", ref, revisionId, controleId: null };
      const [c] = await tx.select({ revisionId: studioRequirementChecks.revisionId, result: studioRequirementChecks.result }).from(studioRequirementChecks)
        .where(and(eq(studioRequirementChecks.id, lien.controleId), eq(studioRequirementChecks.variantId, v.id))).limit(1);
      if (!c) return notFound("Contrôle inconnu pour cette variante.");
      if (!(c.result.ecarts ?? []).some((e) => e.exigenceId === ref)) lienInvalide(lien, "Cette exigence n'est pas examinée par le contrôle cité.");
      if (lien.revisionId !== undefined && lien.revisionId !== c.revisionId) lienInvalide(lien, "La révision citée n'est pas celle du contrôle.");
      return { domaine: "exigence", ref, revisionId: c.revisionId, controleId: lien.controleId };
    }
    case "metre": {
      const m = lireRefMetre(ref);
      if (!m) return lienInvalide(lien, "Ligne de métré attendue sous la forme objet#grandeur.");
      const objet = quantitesStudio(await documentDe(tx, v.id, revisionId!)).objets.find((o) => o.objetId === m.objetId);
      if (!objet) lienInvalide(lien, "Objet absent du métré de la révision citée.");
      if (!objet!.valeurs.some((x) => x.grandeur === m.grandeur)) lienInvalide(lien, "Grandeur absente du métré de cet objet.");
      return { domaine: "metre", ref, revisionId, controleId: null };
    }
    case "revue": {
      const [p] = await tx.select({ revisionId: studioPublications.revisionId }).from(studioPublications)
        .where(and(eq(studioPublications.id, ref), eq(studioPublications.variantId, v.id), eq(studioPublications.studyId, v.studyId))).limit(1);
      if (!p) return lienInvalide(lien, "Publication inconnue pour cette variante.");
      if (lien.revisionId !== undefined && lien.revisionId !== p.revisionId) lienInvalide(lien, "La révision citée n'est pas celle de la publication.");
      return { domaine: "revue", ref, revisionId: p.revisionId, controleId: null };
    }
    case "objet": {
      // Objet du modèle : forme ou cote 2D, objet architectural (mur, ouverture) ou solide de la révision citée.
      const doc = await documentDe(tx, v.id, revisionId!);
      const known = new Set([...doc.objects, ...(doc.dimensions ?? []), ...(doc.architecture ?? []), ...(doc.solides ?? [])].map((o) => o.id));
      if (!known.has(ref)) lienInvalide(lien, "Objet absent de la révision citée.");
      return { domaine: "objet", ref, revisionId, controleId: null };
    }
  }
}

/** Élément déjà suivi par une observation de la variante : 409 `deja_suivie` (autre observation) ou `deja_liee` (celle-ci). */
async function refuserDoublon(tx: Tx, variantId: string, lien: { domaine: StudioObservationDomaine; ref: string }, observationId: string | null): Promise<void> {
  const [existing] = await tx.select({ observationId: studioObservationLinks.observationId }).from(studioObservationLinks)
    .where(and(eq(studioObservationLinks.variantId, variantId), eq(studioObservationLinks.domaine, lien.domaine), eq(studioObservationLinks.ref, lien.ref))).limit(1);
  if (!existing) return;
  if (existing.observationId === observationId) conflict("deja_liee", "Cet élément est déjà lié à cette observation.", { observationId, domaine: lien.domaine, ref: lien.ref });
  conflict("deja_suivie", "Cet élément est déjà suivi par une observation de la variante : réemployez-la.", { observationId: existing.observationId, domaine: lien.domaine, ref: lien.ref });
}

const isUniqueViolation = (e: unknown): boolean => {
  for (let x: unknown = e, depth = 0; x && typeof x === "object" && depth < 4; x = (x as { cause?: unknown }).cause, depth += 1) {
    if ((x as { code?: unknown }).code === "23505") return true;
  }
  return false;
};

/** Variante verrouillée (droits relus sous les verrous) et sa tête. */
async function varianteEcrite(tx: Tx, scope: StudioScope, actorId: string) {
  const variant = await lockedVariant(tx, scope, actorId, "comment");
  const [row] = await tx.select({ studyId: studioVariants.studyId, headRevisionId: studioVariants.headRevisionId }).from(studioVariants).where(eq(studioVariants.id, variant.id)).limit(1);
  return { ...variant, studyId: row!.studyId, headRevisionId: row!.headRevisionId };
}

/** Ligne d'observation verrouillée (FOR UPDATE) et son auteur ; 404 hors de la variante ou hors de l'audience du rôle (E1). */
async function observationVerrouillee(tx: Tx, variantId: string, observationId: string, role: ProjectRole) {
  const [row] = await tx.select({ o: studioObservations, authorId: studioComments.authorId }).from(studioObservations)
    .innerJoin(studioComments, eq(studioComments.id, studioObservations.commentId))
    .where(and(eq(studioObservations.variantId, variantId), eq(studioObservations.commentId, observationId), audienceFilter(role))).limit(1).for("update", { of: studioObservations });
  return row ?? notFound("Observation inconnue pour cette variante.");
}

const cloturee = (statut: string) => { if (statut === "cloturee") conflict("observation_cloturee", "Cette observation est clôturée : rouvrez-la d'abord."); };

async function resultat(scope: StudioScope, variantId: string, lecteur: Lecteur, observationId: string, replayed: boolean): Promise<StudioObservationDetail & { replayed: boolean }> {
  const [d] = await details(scope, variantId, lecteur, [observationId]);
  return { ...(d ?? notFound()), replayed };
}

// ---------------------------------------------------------------------------
// Écritures

/**
 * Ouverture directe (201) : commentaire d'origine (auteur = l'acteur, tout membre du projet) et observation de même
 * identifiant, responsable propriétaire ou éditeur, vue citée, liens de domaines vérifiés — tout ou rien. Un élément
 * déjà suivi → 409 `deja_suivie` (identifiant existant) : rien n'est créé. Rejeu par `requestId` (même auteur, même
 * contenu), sinon 409 request_conflict.
 */
export async function openStudioObservation(scope: StudioScope, actorId: string, input: StudioObservationOuverture): Promise<StudioObservationDetail & { replayed: boolean }> {
  const { requestId, ...contenu } = input;
  const hash = hashOf({ action: "ouvrir-directe", ...contenu });
  const run = () => db.transaction(async (tx) => {
    const v = await varianteEcrite(tx, scope, actorId);
    const done = (id: string, replayed: boolean) => ({ variantId: v.id, lecteur: v.lecteur, id, replayed });
    if (requestId !== undefined) {
      const [prev] = await tx.select({ id: studioComments.id, authorId: studioComments.authorId, payloadHash: studioComments.payloadHash }).from(studioComments)
        .where(and(eq(studioComments.variantId, v.id), eq(studioComments.requestId, requestId))).limit(1);
      if (prev) {
        if (prev.authorId !== actorId || prev.payloadHash !== hash) conflict("request_conflict", "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur.");
        return done(prev.id, true);
      }
    }
    if (v.lecteur.archived) studioArchivedRefusal();
    const audience = audienceOrRefuse(() => audienceOfNew(v.lecteur.role, input.audience));
    const responsable = await assignable(tx, v.access, input.responsableId);
    const objectIds = input.objectIds ?? [];
    let revisionId: string | null = input.revisionId ?? null;
    if (revisionId !== null || objectIds.length) {
      revisionId ??= v.headRevisionId;
      const doc = await documentDe(tx, v.id, revisionId);
      const known = new Set([...doc.objects.map((o) => o.id), ...(doc.dimensions ?? []).map((d) => d.id)]);
      const unknown = objectIds.filter((id) => !known.has(id));
      if (unknown.length) throw new StudioRequestError(400, { error: "invalid_input", code: "unknown_objects", objectIds: unknown, revisionId, message: "Objet(s) absent(s) de la révision citée." });
    }
    if ((input.liens?.length ?? 0) > 0 && !roleAllows(v.lecteur.role, "write")) {
      throw new StudioRequestError(403, { error: "forbidden", message: "Lier une observation à un domaine exige le droit d'écriture (propriétaire ou éditeur)." });
    }
    const liens = [];
    const vus = new Set<string>();
    for (const l of input.liens ?? []) {
      const ok = await validerLien(tx, v, l);
      const k = `${ok.domaine}|${ok.ref}`;
      if (vus.has(k)) lienInvalide(ok, "Élément cité deux fois.");
      vus.add(k);
      await refuserDoublon(tx, v.id, ok, null);
      liens.push(ok);
    }
    const id = newId("studio_comment");
    await tx.insert(studioComments).values({ id, variantId: v.id, revisionId, objectIds, parentId: null, authorId: actorId, body: input.body, requestId: requestId ?? null, payloadHash: hash, audience });
    await insertObservationRows(tx, { commentId: id, variantId: v.id, responsableId: responsable, input: { echeance: input.echeance, note: input.note, vue: input.vue }, actorId, hash });
    for (const l of liens) await tx.insert(studioObservationLinks).values({ id: newId("studio_observation_link"), observationId: id, variantId: v.id, ...l, createdBy: actorId });
    return done(id, false);
  });
  let r: Awaited<ReturnType<typeof run>>;
  try { r = await run(); }
  catch (error) {
    // Envoi concurrent : même requestId (rejeu relu) ou même élément de domaine (l'autre ouverture l'a pris : 409).
    if (!isUniqueViolation(error)) throw error;
    r = await run();
  }
  return resultat(scope, r.variantId, r.lecteur, r.id, r.replayed);
}

/** Rejeu d'une écriture de suivi (lien, tâche, décision) : même auteur et même empreinte, sinon 409 request_conflict. */
function rejeu(prev: { actorId: string; payloadHash: string | null } | undefined, actorId: string, hash: string): boolean {
  if (!prev) return false;
  if (prev.actorId !== actorId || prev.payloadHash !== hash) conflict("request_conflict", "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur.");
  return true;
}

/** Ajout d'un lien de domaine (201) par l'auteur, le responsable (éditeur) ou le propriétaire ; jamais réécrit. */
export async function addStudioObservationLink(scope: StudioScope, actorId: string, observationId: string, input: z.infer<typeof studioObservationLienAjoutSchema>): Promise<StudioObservationDetail & { replayed: boolean }> {
  const { requestId, ...lien } = input;
  const hash = hashOf({ action: "lier", ...lien });
  const run = () => db.transaction(async (tx) => {
    const v = await varianteEcrite(tx, scope, actorId);
    const { o, authorId } = await observationVerrouillee(tx, v.id, observationId, v.lecteur.role);
    const done = (replayed: boolean) => ({ variantId: v.id, lecteur: v.lecteur, replayed });
    if (requestId !== undefined) {
      const [prev] = await tx.select({ actorId: studioObservationLinks.createdBy, payloadHash: studioObservationLinks.payloadHash }).from(studioObservationLinks)
        .where(and(eq(studioObservationLinks.observationId, o.commentId), eq(studioObservationLinks.requestId, requestId))).limit(1);
      if (rejeu(prev, actorId, hash)) return done(true);
    }
    if (v.lecteur.archived) studioArchivedRefusal();
    cloturee(o.statut);
    if (!peutLier(acteurDe(v.lecteur, o.responsableId, authorId))) {
      throw new StudioRequestError(403, { error: "forbidden", message: "Seul l'auteur de l'observation, son responsable (éditeur) ou le propriétaire du projet la lie à un domaine." });
    }
    const ok = await validerLien(tx, v, lien);
    await refuserDoublon(tx, v.id, ok, o.commentId);
    await tx.insert(studioObservationLinks).values({ id: newId("studio_observation_link"), observationId: o.commentId, variantId: v.id, ...ok, createdBy: actorId, requestId: requestId ?? null, payloadHash: hash });
    return done(false);
  });
  // Envoi concurrent : même requestId (rejeu relu) ou même élément pris par une autre observation (409 `deja_suivie`
  // avec l'identifiant à réemployer, par `refuserDoublon`) — la seconde exécution relit l'état engagé.
  let r: Awaited<ReturnType<typeof run>>;
  try { r = await run(); }
  catch (error) {
    if (!isUniqueViolation(error)) throw error;
    r = await run();
  }
  return resultat(scope, r.variantId, r.lecteur, observationId, r.replayed);
}

/** Création d'une tâche (201) par le propriétaire ou le responsable (éditeur), confiée au propriétaire ou à un éditeur. */
export async function createStudioObservationTask(scope: StudioScope, actorId: string, observationId: string, input: z.infer<typeof studioObservationTacheSchema>): Promise<StudioObservationDetail & { replayed: boolean }> {
  const { requestId, ...contenu } = input;
  const hash = hashOf({ action: "creer", ...contenu, echeance: contenu.echeance ?? null });
  const r = await db.transaction(async (tx) => {
    const v = await varianteEcrite(tx, scope, actorId);
    const { o, authorId } = await observationVerrouillee(tx, v.id, observationId, v.lecteur.role);
    const done = (replayed: boolean) => ({ variantId: v.id, lecteur: v.lecteur, replayed });
    if (requestId !== undefined) {
      const [prev] = await tx.select({ actorId: studioObservationTaskEvents.actorId, payloadHash: studioObservationTaskEvents.payloadHash }).from(studioObservationTaskEvents)
        .innerJoin(studioObservationTasks, eq(studioObservationTasks.id, studioObservationTaskEvents.taskId))
        .where(and(eq(studioObservationTasks.observationId, o.commentId), eq(studioObservationTaskEvents.action, "creer"), eq(studioObservationTaskEvents.requestId, requestId))).limit(1);
      if (rejeu(prev, actorId, hash)) return done(true);
    }
    if (v.lecteur.archived) studioArchivedRefusal();
    cloturee(o.statut);
    const a = acteurDe(v.lecteur, o.responsableId, authorId);
    if (!peutCreerTache({ ...a, estResponsableObservation: a.estResponsable })) throw new StudioRequestError(403, { error: "forbidden", message: REFUS_TACHE.creer });
    const assignee = await assignable(tx, v.access, input.assigneeId);
    const id = newId("studio_observation_task");
    await tx.insert(studioObservationTasks).values({ id, observationId: o.commentId, libelle: input.libelle, assigneeId: assignee, echeance: input.echeance ?? null, statut: "a-faire", createdBy: actorId });
    await tx.insert(studioObservationTaskEvents).values({
      id: newId("studio_observation_task_event"), taskId: id, seq: 1, action: "creer", fromStatut: null, toStatut: "a-faire", actorId, assigneeId: assignee,
      note: input.note ?? null, requestId: requestId ?? null, payloadHash: hash,
    });
    return done(false);
  });
  return resultat(scope, r.variantId, r.lecteur, observationId, r.replayed);
}

/** Passage d'une tâche (200) : terminer, annuler, rouvrir, réattribuer ; journalisé, `seq` suivant. */
export async function transitionStudioObservationTask(scope: StudioScope, actorId: string, observationId: string, taskId: string, input: z.infer<typeof studioObservationTacheTransitionSchema>): Promise<StudioObservationDetail & { replayed: boolean }> {
  const { requestId, ...contenu } = input;
  const hash = hashOf(contenu);
  const r = await db.transaction(async (tx) => {
    const v = await varianteEcrite(tx, scope, actorId);
    const { o, authorId } = await observationVerrouillee(tx, v.id, observationId, v.lecteur.role);
    const done = (replayed: boolean) => ({ variantId: v.id, lecteur: v.lecteur, replayed });
    const [t] = await tx.select().from(studioObservationTasks).where(and(eq(studioObservationTasks.id, taskId), eq(studioObservationTasks.observationId, o.commentId))).limit(1).for("update");
    if (!t) return notFound("Tâche inconnue pour cette observation.");
    if (requestId !== undefined) {
      const [prev] = await tx.select({ actorId: studioObservationTaskEvents.actorId, payloadHash: studioObservationTaskEvents.payloadHash }).from(studioObservationTaskEvents)
        .where(and(eq(studioObservationTaskEvents.taskId, t.id), eq(studioObservationTaskEvents.requestId, requestId))).limit(1);
      if (rejeu(prev, actorId, hash)) return done(true);
    }
    if (v.lecteur.archived) studioArchivedRefusal();
    cloturee(o.statut);
    const a = acteurDe(v.lecteur, o.responsableId, authorId);
    const at = { estProprietaire: a.estProprietaire, peutEcrire: a.peutEcrire, estResponsableObservation: a.estResponsable, estChargee: t.assigneeId === actorId, estCreateur: t.createdBy === actorId };
    if (!tacheAutorisee(input.action, at)) throw new StudioRequestError(403, { error: "forbidden", message: REFUS_TACHE[input.action] });
    const vers = tacheApres(t.statut, input.action);
    if (vers === null) conflict("invalid_transition", "Ce passage n'est pas permis depuis le statut actuel de la tâche.", { statut: t.statut, action: input.action });
    const assignee = input.action === "reattribuer" ? await assignable(tx, v.access, input.assigneeId!) : null;
    if (assignee !== null && assignee === t.assigneeId) conflict("same_assignee", "Cette personne est déjà chargée de la tâche.");
    // Sous le verrou de la ligne de tâche : `seq` suivant sans trou ni doublon.
    const [last] = await tx.select({ seq: studioObservationTaskEvents.seq }).from(studioObservationTaskEvents).where(eq(studioObservationTaskEvents.taskId, t.id))
      .orderBy(desc(studioObservationTaskEvents.seq)).limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const now = new Date();
    await tx.update(studioObservationTasks).set({ statut: vers!, updatedAt: now, ...(assignee !== null ? { assigneeId: assignee } : {}) }).where(eq(studioObservationTasks.id, t.id));
    await tx.insert(studioObservationTaskEvents).values({
      id: newId("studio_observation_task_event"), taskId: t.id, seq, action: input.action, fromStatut: t.statut, toStatut: vers!, actorId, assigneeId: assignee,
      note: input.note ?? null, requestId: requestId ?? null, payloadHash: hash, at: now,
    });
    return done(false);
  });
  return resultat(scope, r.variantId, r.lecteur, observationId, r.replayed);
}

/**
 * Proposition (propriétaire ou éditeur) ou décision (propriétaire seul) consignée au journal des décisions (201). Une
 * décision de clôture passe par « clôturer » ; une proposition de clôture ne clôt rien.
 */
export async function recordStudioObservationDecision(scope: StudioScope, actorId: string, observationId: string, input: z.infer<typeof studioObservationDecisionSchema>): Promise<StudioObservationDetail & { replayed: boolean }> {
  const { requestId, ...contenu } = input;
  const hash = hashOf({ action: "decider", ...contenu, revisionId: contenu.revisionId ?? null });
  const r = await db.transaction(async (tx) => {
    const v = await varianteEcrite(tx, scope, actorId);
    const { o, authorId } = await observationVerrouillee(tx, v.id, observationId, v.lecteur.role);
    const done = (replayed: boolean) => ({ variantId: v.id, lecteur: v.lecteur, replayed });
    if (requestId !== undefined) {
      const [prev] = await tx.select({ actorId: studioObservationDecisions.actorId, payloadHash: studioObservationDecisions.payloadHash }).from(studioObservationDecisions)
        .where(and(eq(studioObservationDecisions.observationId, o.commentId), eq(studioObservationDecisions.requestId, requestId))).limit(1);
      if (rejeu(prev, actorId, hash)) return done(true);
    }
    if (v.lecteur.archived) studioArchivedRefusal();
    cloturee(o.statut);
    const a = acteurDe(v.lecteur, o.responsableId, authorId);
    const refus = refusDecision(input.nature as StudioObservationDecisionNature, input.portee as StudioObservationDecisionPortee, a);
    if (refus) throw new StudioRequestError(refus.status, refus.body);
    if (input.revisionId !== undefined) await documentDe(tx, v.id, input.revisionId);
    await insertDecision(tx, {
      observationId: o.commentId, nature: input.nature, portee: input.portee, texte: input.texte, actorId,
      actorRole: roleAllows(v.lecteur.role, "owner") ? "proprietaire" : "editeur", revisionId: input.revisionId ?? null, requestId: requestId ?? null, payloadHash: hash,
    });
    return done(false);
  });
  return resultat(scope, r.variantId, r.lecteur, observationId, r.replayed);
}
