/** Handler Studio de l'orchestrateur commun : droits, rejeu, base, révision append-only. */
import { signalerTempsReel } from "./temps-reel-signaux.js";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { applyStudioCommands, comparerDocumentsStudio, exportStudioDxf, exportStudioIfc, exportStudioObj, exportStudioStl, exportStudioSvg, newStudioDocument, STUDIO_COMMAND_TOOL_IDS, STUDIO_CONTRACT, studioChevauchements, studioCopieIndependante, studioElementsModifies, StudioValidationError, validateStudioDocument, type StudioModeDerivation, type StudioDifferenceDocuments, type StudioDocument, type StudioEnvelope, type StudioPhaseWorkflow } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioRevisions, studioStudies, studioStudyContexts, studioVariants, type StudioContext, type StudioExampleInstall, type StudioProvenance } from "../db/schema.js";
import { newId } from "./ids.js";
import { lockAccessRows } from "./access-locks.js";
import { loadProjectAccess, projectAccessRefusal, type AccessibleProject, type ProjectNeed } from "./owned-project.js";
import type { CiblePortee } from "@parcours/domain-model";
import { orchestrerCommandesDansTransaction, type Tx } from "./atelier-validation.js";
import { lockProject, type Querier } from "./step-rows.js";
import { exportStudioStep, revaliderBooleensStudio } from "./studio-exact.js";
import { corpsRefusQuota, quotaCommandesStudio } from "./studio-quotas.js";
import { studioEffetsCommande, studioHorsPerimetre, type StudioEffetsCommande } from "@parcours/atelier-model/studio-cmd";
import { lireContexteEtude, validerContexteEtude, type StudioContexteDeclare } from "./studio-contexte.js";
import { consignerEvenementRevision, controlerCheminEcriture, engagerPuisNotifier, lireEvenementRevision, nouvelleTransaction, type EvenementRevision } from "./studio-journal.js";

export interface StudioScope { projectId: string; studyId: string; variantId: string }
export class StudioRequestError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super("studio_request_refused"); }
}
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
/** Règle d'identifiant des requêtes Studio (enveloppes, créations idempotentes, révision exportée). */
export const studioIdentifierSchema = identifier;
const envelopeSchema = z.object({
  contractVersion: z.literal(STUDIO_CONTRACT), requestId: identifier, baseRevisionId: identifier,
  commands: z.array(z.object({
    toolId: z.enum(STUDIO_COMMAND_TOOL_IDS),
    params: z.record(z.string(), z.unknown()),
  }).strict()).min(1).max(500),
}).strict();

export function parseStudioEnvelope(value: unknown): StudioEnvelope {
  // EX-002 : une demande hors du périmètre du Studio (comptabilité, RH, commerce, chantier, exploitation) est refusée
  // par un motif nommé, avant la validation du contrat (jamais confondue avec un outil inconnu).
  const commandes = (value as { commands?: unknown } | null)?.commands;
  if (Array.isArray(commandes)) {
    for (const [i, c] of commandes.entries()) {
      const refus = studioHorsPerimetre((c as { toolId?: unknown } | null)?.toolId);
      if (refus) throw new StudioRequestError(400, { error: "hors_perimetre", code: refus.code, domaine: refus.domaine, path: `commands[${i}].toolId`, message: refus.message });
    }
  }
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) throw new StudioRequestError(400, { error: "invalid_input", details: parsed.error.flatten() });
  // Le noyau public valide les paramètres géométriques, sans second schéma concurrent.
  return structuredClone(parsed.data) as StudioEnvelope;
}

/** Canonique JSON seulement : ordre des clés ignoré, contenu et ordre des commandes conservés. */
export function studioPayloadHash(envelope: StudioEnvelope): string {
  const canonical = (value: unknown, depth = 0): string => {
    if (depth > 64) throw new StudioRequestError(400, { error: "invalid_input", message: "Structure de commande trop profonde." });
    if (Array.isArray(value)) return `[${value.map((item) => canonical(item, depth + 1)).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new StudioRequestError(400, { error: "invalid_input" });
    return serialized;
  };
  return createHash("sha256").update(canonical(envelope)).digest("hex");
}

export function notFound(): never { throw new StudioRequestError(404, { error: "not_found" }); }
/** Étude ou variante archivée : lisible, jamais modifiée (409 `archived`, rien n'est écrit). */
export function studioArchivedRefusal(): never {
  throw new StudioRequestError(409, { error: "archived", message: "Cette étude ou cette variante est archivée : elle reste lisible mais ne peut pas être modifiée." });
}
/**
 * `cible` (portées étroites) : la ressource relue en base — étude, variantes du contenu, révision — à laquelle une
 * attribution de portée étroite peut ajouter la capacité demandée (`owned-project.ts`, `porteeAllows`).
 */
export function assertAccess(access: AccessibleProject | null, actorId: string, need: ProjectNeed, cible?: CiblePortee): AccessibleProject {
  const refusal = projectAccessRefusal(access, actorId, need, cible);
  if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
  return access!;
}

/**
 * Droit d'écriture d'une création ou d'un lot Studio. `modify` : règle commune (propriétaire ou éditeur, verrou
 * d'édition d'un autre compte refusé, référence protégée de l'exemple refusée). `installation-exemple` : écriture
 * SYSTÈME du contenu de l'exemple dans une étude dédiée (`lib/studio-exemple.ts`), réservée au PROPRIÉTAIRE ; elle passe
 * par le même contrat de commandes et la même orchestration, respecte le verrou d'édition d'un autre compte, mais
 * n'oppose pas la protection de la référence (le contenu installé est celui de l'exemple, pas une modification de
 * l'utilisateur). Aucune route ne la reçoit du client : seule `lib/studio-exemple.ts` la passe.
 */
export type StudioEcriture = "modify" | "installation-exemple";

/**
 * Préfixe RÉSERVÉ des identifiants de requête de l'installation d'une étude exemple (`lib/studio-exemple.ts`). Un
 * identifiant client (étude, variante, lot de commandes) qui commence par lui est refusé (400) : il ne peut ni rejouer
 * ni préempter une étape de l'installation. Comparaison sans casse.
 */
export const STUDIO_PREFIXE_EXEMPLE = "exemple-studio-";
function refuserPrefixeReserve(requestId: string | undefined, ecriture: StudioEcriture): void {
  if (ecriture !== "modify" || requestId === undefined || !requestId.toLowerCase().startsWith(STUDIO_PREFIXE_EXEMPLE)) return;
  throw new StudioRequestError(400, { error: "invalid_input", code: "request_id_reserve", message: `Identifiant de requête réservé à l'installation de l'exemple Studio (préfixe « ${STUDIO_PREFIXE_EXEMPLE} »).` });
}
function assertEcriture(access: AccessibleProject, actorId: string, ecriture: StudioEcriture, cible?: CiblePortee): void {
  if (ecriture === "modify") { assertAccess(access, actorId, "modify", cible); return; }
  assertAccess(access, actorId, "owner");
  assertAccess(access, actorId, "write");
}

/** Verrouille également le membre : une révocation concurrente ne traverse pas le commit. */
export async function lockedAccess(tx: Tx, projectId: string, actorId: string): Promise<AccessibleProject> {
  await lockProject(tx, projectId);
  await lockAccessRows(tx, projectId, actorId);
  return assertAccess(await loadProjectAccess(projectId, actorId, tx), actorId, "read");
}

/** Lecture d'une variante : `archived` si l'étude ou la variante l'est (alors `canWrite` faux) ; provenance d'une dérivation. */
export type StudioRead = StudioContext & { archived: boolean; derivedFrom: StudioProvenance | null };
const provenanceOf = (row: { derivedFromVariantId: string | null; derivedFromRevisionId: string | null; derivationMode?: "copie" | null; derivationIdentities?: Record<string, string> | null }, identites = false): StudioProvenance | null =>
  row.derivedFromVariantId && row.derivedFromRevisionId
    ? { variantId: row.derivedFromVariantId, revisionId: row.derivedFromRevisionId, ...(row.derivationMode === "copie" ? { mode: "copie" as const, ...(identites && row.derivationIdentities ? { identites: row.derivationIdentities } : {}) } : {}) }
    : null;

export async function readStudioContext(q: Querier, scope: StudioScope, actorId: string, revisionId?: string): Promise<StudioRead> {
  const access = assertAccess(await loadProjectAccess(scope.projectId, actorId, q), actorId, "read");
  const [study] = await q.select().from(studioStudies)
    .where(and(eq(studioStudies.id, scope.studyId), eq(studioStudies.projectId, scope.projectId))).limit(1);
  if (!study) return notFound();
  const [variant] = await q.select().from(studioVariants)
    .where(and(eq(studioVariants.id, scope.variantId), eq(studioVariants.studyId, study.id))).limit(1);
  if (!variant) return notFound();
  const [revision] = await q.select().from(studioRevisions)
    .where(and(eq(studioRevisions.id, revisionId ?? variant.headRevisionId), eq(studioRevisions.variantId, variant.id))).limit(1);
  if (!revision) return notFound();
  const archived = study.archivedAt !== null || variant.archivedAt !== null;
  return {
    study: { id: study.id, name: study.name, projectId: study.projectId },
    variant: { id: variant.id, name: variant.name, studyId: study.id, headRevisionId: variant.headRevisionId },
    revision: { id: revision.id, parentRevisionId: revision.parentRevisionId, document: validateStudioDocument(revision.document) },
    canWrite: revisionId === undefined && !archived && projectAccessRefusal(access, actorId, "modify", { studyId: study.id, variantIds: [variant.id] }) === null,
    archived, derivedFrom: provenanceOf(variant, true),
  };
}

/** Études du projet ; les archivées seulement avec `includeArchived` (`?archives=1`). */
export async function listStudioStudies(projectId: string, actorId: string, includeArchived = false) {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const rows = await db.select({ id: studioStudies.id, name: studioStudies.name, initialVariantId: studioStudies.initialVariantId, createdAt: studioStudies.createdAt, updatedAt: studioStudies.updatedAt, archivedAt: studioStudies.archivedAt, workflowPhase: studioStudies.workflowPhase })
    .from(studioStudies).where(includeArchived ? eq(studioStudies.projectId, projectId) : and(eq(studioStudies.projectId, projectId), isNull(studioStudies.archivedAt)))
    .orderBy(asc(studioStudies.createdAt), asc(studioStudies.id));
  return { studies: rows.map(({ archivedAt, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt?.toISOString() ?? null, archived: archivedAt !== null })) };
}

export interface StudioVariantSummary { id: string; name: string; headRevisionId: string; archived: boolean; derivedFrom: StudioProvenance | null }
export interface StudioStudyRead {
  /** `workflowPhase` : phase DÉCLARÉE du workflow de conception (REF-01 §06), `null` = non déclarée. */
  study: { id: string; name: string; projectId: string; initialVariantId: string; createdAt: string; updatedAt: string | null; archived: boolean; workflowPhase: StudioPhaseWorkflow | null };
  variants: StudioVariantSummary[];
  /** Écriture dans l'étude (droit `modify` et étude active). */
  canWrite: boolean;
  /** Droit `modify` seul : renommer reste refusé sur une archive, mais la désarchiver est permis. */
  canManage: boolean;
}
export interface StudioRevisionSummary { id: string; parentRevisionId: string | null; source: string; authorId: string; createdAt: string }

/** Étude du projet de l'URL, sinon 404 (une étude d'un autre projet n'est pas révélée). */
export async function studyOf(q: Querier, projectId: string, studyId: string) {
  const [study] = await q.select().from(studioStudies)
    .where(and(eq(studioStudies.id, studyId), eq(studioStudies.projectId, projectId))).limit(1);
  return study ?? notFound();
}

export const studioVariantSummaryColumns = {
  id: studioVariants.id, name: studioVariants.name, headRevisionId: studioVariants.headRevisionId, archivedAt: studioVariants.archivedAt,
  derivedFromVariantId: studioVariants.derivedFromVariantId, derivedFromRevisionId: studioVariants.derivedFromRevisionId,
  derivationMode: studioVariants.derivationMode,
};
type VariantSummaryRow = { id: string; name: string; headRevisionId: string; archivedAt: Date | null; derivedFromVariantId: string | null; derivedFromRevisionId: string | null; derivationMode?: "copie" | null };
export const toVariantSummary = (row: VariantSummaryRow): StudioVariantSummary =>
  ({ id: row.id, name: row.name, headRevisionId: row.headRevisionId, archived: row.archivedAt !== null, derivedFrom: provenanceOf(row) });

/** Variante initiale d'abord, puis les autres par ordre de création (identifiant en départage) ; archivées sur demande. */
async function variantsOf(q: Querier, study: { id: string; initialVariantId: string }, includeArchived: boolean): Promise<StudioVariantSummary[]> {
  const rows = (await q.select(studioVariantSummaryColumns).from(studioVariants)
    .where(includeArchived ? eq(studioVariants.studyId, study.id) : and(eq(studioVariants.studyId, study.id), isNull(studioVariants.archivedAt)))
    .orderBy(asc(studioVariants.createdAt), asc(studioVariants.id))).map(toVariantSummary);
  return [...rows.filter((row) => row.id === study.initialVariantId), ...rows.filter((row) => row.id !== study.initialVariantId)];
}

/** Étude lue par son adresse, archivée comprise (lecture seule) ; ses variantes archivées seulement avec `includeArchived`. */
export async function readStudioStudy(q: Querier, projectId: string, studyId: string, actorId: string, includeArchived = false): Promise<StudioStudyRead> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId, q), actorId, "read");
  const study = await studyOf(q, projectId, studyId);
  // `canManage` (archiver, désarchiver) reste au rôle de projet ; `canWrite` admet un Concepteur de l'étude (portée étroite).
  const canManage = projectAccessRefusal(access, actorId, "modify") === null;
  const canWriteStudy = projectAccessRefusal(access, actorId, "modify", { studyId: study.id }) === null;
  return {
    study: {
      id: study.id, name: study.name, projectId: study.projectId, initialVariantId: study.initialVariantId, createdAt: study.createdAt.toISOString(),
      updatedAt: study.updatedAt?.toISOString() ?? null, archived: study.archivedAt !== null, workflowPhase: study.workflowPhase ?? null,
    },
    variants: await variantsOf(q, study, includeArchived),
    canWrite: canWriteStudy && study.archivedAt === null, canManage,
  };
}

export async function listStudioVariants(q: Querier, projectId: string, studyId: string, actorId: string, includeArchived = false): Promise<{ variants: StudioVariantSummary[] }> {
  assertAccess(await loadProjectAccess(projectId, actorId, q), actorId, "read");
  return { variants: await variantsOf(q, await studyOf(q, projectId, studyId), includeArchived) };
}

/** Historique d'une variante, du plus récent au plus ancien ; lecture seule, aucun document renvoyé. */
export async function listStudioRevisions(q: Querier, scope: StudioScope, actorId: string): Promise<{ revisions: StudioRevisionSummary[] }> {
  assertAccess(await loadProjectAccess(scope.projectId, actorId, q), actorId, "read");
  const study = await studyOf(q, scope.projectId, scope.studyId);
  const [variant] = await q.select({ id: studioVariants.id }).from(studioVariants)
    .where(and(eq(studioVariants.id, scope.variantId), eq(studioVariants.studyId, study.id))).limit(1);
  if (!variant) return notFound();
  const rows = await q.select({
    id: studioRevisions.id, parentRevisionId: studioRevisions.parentRevisionId, source: studioRevisions.source,
    authorId: studioRevisions.authorId, createdAt: studioRevisions.createdAt,
  }).from(studioRevisions).where(eq(studioRevisions.variantId, variant.id))
    .orderBy(desc(studioRevisions.createdAt), desc(studioRevisions.id));
  return { revisions: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}

/**
 * Historique hybride (A.5-07) : une révision se lit comme les commandes qui l'ont produite (l'enveloppe enregistrée,
 * telle que le client l'a envoyée, jamais réécrite) et le delta qui en résulte par rapport à sa révision parente
 * (`studioElementsModifies`, et le résumé de `comparerDocumentsStudio`). Une révision d'initialisation n'a pas de
 * commandes ; une dérivation est comparée à un document vide. Lecture seule, mêmes droits et refus que la lecture.
 */
export interface StudioRevisionChanges {
  revisionId: string;
  parentRevisionId: string | null;
  source: string;
  authorId: string;
  createdAt: string;
  requestId: string | null;
  commands: StudioEnvelope["commands"];
  changedKeys: string[];
  summary: StudioDifferenceDocuments["resume"];
  /** Événement du journal (IF-011) et effets (EX-010) de la révision ; null pour une révision d'initialisation. */
  event: EvenementRevision | null;
}
export async function readStudioRevisionChanges(q: Querier, scope: StudioScope, actorId: string, revisionId: string): Promise<StudioRevisionChanges> {
  const context = await readStudioContext(q, scope, actorId, revisionId);
  const [row] = await q.select({ source: studioRevisions.source, authorId: studioRevisions.authorId, createdAt: studioRevisions.createdAt, envelope: studioRevisions.envelope, requestId: studioRevisions.requestId })
    .from(studioRevisions).where(and(eq(studioRevisions.id, context.revision.id), eq(studioRevisions.variantId, context.variant.id))).limit(1);
  if (!row) return notFound();
  let parent = newStudioDocument(context.revision.document.id);
  if (context.revision.parentRevisionId) {
    const [p] = await q.select({ document: studioRevisions.document }).from(studioRevisions)
      .where(and(eq(studioRevisions.id, context.revision.parentRevisionId), eq(studioRevisions.variantId, context.variant.id))).limit(1);
    if (!p) return notFound();
    parent = validateStudioDocument(p.document);
  }
  const envelope = row.envelope as StudioEnvelope | null;
  return {
    revisionId: context.revision.id, parentRevisionId: context.revision.parentRevisionId, source: row.source, authorId: row.authorId,
    createdAt: row.createdAt.toISOString(), requestId: envelope ? row.requestId : null, commands: envelope?.commands ?? [],
    changedKeys: studioElementsModifies(parent, context.revision.document), summary: comparerDocumentsStudio(parent, context.revision.document).resume,
    event: await lireEvenementRevision(q, context.variant.id, context.revision.id),
  };
}

export type StudioCreation = StudioContext & { replayed: boolean };

/**
 * Rejeu d'une création identifiée par `requestId` : la réponse 201 d'origine est relue dans la révision
 * d'initialisation (append-only), jamais reconstruite. Autre auteur ou autre nom → 409 request_conflict.
 */
type InitialSource = "study-initialization" | "variant-initialization" | "variant-derivation";
async function replayCreation(tx: Tx, variantId: string, sources: InitialSource[], actorId: string, name: string, storedName: (response: StudioContext) => string, sameOrigin: (response: StudioContext) => boolean = () => true): Promise<StudioCreation> {
  const [initial] = await tx.select({ authorId: studioRevisions.authorId, response: studioRevisions.response }).from(studioRevisions)
    .where(and(eq(studioRevisions.variantId, variantId), inArray(studioRevisions.source, sources))).limit(1);
  if (!initial) throw new Error("studio_creation_without_initial_revision");
  if (initial.authorId !== actorId || storedName(initial.response) !== name || !sameOrigin(initial.response)) {
    throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." });
  }
  return { ...structuredClone(initial.response), replayed: true };
}

/**
 * Options internes d'une création (jamais lues du corps d'une requête) : droit d'écriture, nom de la variante initiale,
 * marquage d'étude exemple (`example_install`, écrit dans la même transaction que l'étude).
 */
export interface StudioCreationOptions { ecriture?: StudioEcriture; nomVarianteInitiale?: string; exampleInstall?: StudioExampleInstall; contexte?: StudioContexteDeclare }

export async function createStudioStudy(projectId: string, actorId: string, name: string, requestId?: string, options: StudioCreationOptions = {}): Promise<StudioCreation> {
  refuserPrefixeReserve(requestId, options.ecriture ?? "modify");
  return db.transaction(async (tx) => {
    // Verrou du projet avant la recherche du rejeu : deux créations concurrentes du même requestId sont sérialisées.
    assertEcriture(await lockedAccess(tx, projectId, actorId), actorId, options.ecriture ?? "modify");
    if (requestId !== undefined) {
      const [previous] = await tx.select({ initialVariantId: studioStudies.initialVariantId }).from(studioStudies)
        .where(and(eq(studioStudies.projectId, projectId), eq(studioStudies.creationRequestId, requestId))).limit(1);
      if (previous) {
        const rejeu = await replayCreation(tx, previous.initialVariantId, ["study-initialization"], actorId, name, (r) => r.study.name);
        // IF-001 : un rejeu porte le même contexte déclaré (ou aucun), sinon c'est une autre demande.
        const stocke = await lireContexteEtude(tx, rejeu.study.id);
        const declare = (c: { site: { parcelles: { id: string; revision: number }[] }; sources: { id: string }[] } | null | undefined) =>
          c ? JSON.stringify({ p: c.site.parcelles.map((x) => [x.id, x.revision]), s: c.sources.map((x) => x.id) }) : null;
        if (declare(stocke) !== declare(options.contexte)) throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contexte d’étude." });
        return rejeu;
      }
    }
    // IF-001 : contexte validé sous le verrou du projet, avant toute insertion (aucune création partielle).
    const contexte = options.contexte ? await validerContexteEtude(tx, projectId, options.contexte) : null;
    const studyId = newId("studio_study"), variantId = newId("studio_variant"), revisionId = newId("studio_revision");
    const response: StudioContext = {
      study: { id: studyId, name, projectId },
      variant: { id: variantId, name: options.nomVarianteInitiale ?? "Variante initiale", studyId, headRevisionId: revisionId },
      revision: { id: revisionId, parentRevisionId: null, document: newStudioDocument(newId("studio_document")) }, canWrite: true,
    };
    await tx.insert(studioStudies).values({ id: studyId, projectId, name, initialVariantId: variantId, creationRequestId: requestId ?? null, exampleInstall: options.exampleInstall ?? null });
    await tx.insert(studioVariants).values({ id: variantId, studyId, name: response.variant.name, headRevisionId: revisionId });
    await tx.insert(studioRevisions).values({
      id: revisionId, variantId, parentRevisionId: null, document: response.revision.document, envelope: null,
      requestId: newId("initialization"), payloadHash: createHash("sha256").update(JSON.stringify({ projectId, studyId, variantId, name })).digest("hex"),
      source: "study-initialization", authorId: actorId, response,
    });
    if (contexte) await tx.insert(studioStudyContexts).values({ studyId, projectId, version: contexte.version, context: contexte as unknown as Record<string, unknown>, validatedBy: actorId });
    return { ...response, replayed: false };
  });
}

/**
 * Source d'une dérivation : variante de la même étude, révision donnée (sinon sa tête au moment de la création) ; `mode`
 * `version` (défaut : identifiants conservés) ou `copie` (copie indépendante, nouvelles identités — TR-EX-013).
 */
export interface StudioDerivationSource { variantId: string; revisionId?: string; mode?: StudioModeDerivation }

/**
 * Nouvelle variante d'une étude active : une seule révision initiale, sans parent. Document vide, ou — dérivation —
 * copie profonde (mêmes identifiants d'objets) du document d'une révision d'une variante de la même étude, sinon 404 ;
 * la provenance est enregistrée sur la variante et renvoyée (`derivedFrom`). Rejeu par `requestId` : même auteur, même
 * nom et même source, sinon 409 request_conflict ; une étude archivée refuse toute nouvelle variante (409 archived).
 */
export async function createStudioVariant(projectId: string, studyId: string, actorId: string, name: string, requestId?: string, from?: StudioDerivationSource, ecriture: StudioEcriture = "modify"): Promise<StudioCreation> {
  refuserPrefixeReserve(requestId, ecriture);
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    // Concepteur de l'étude (portée étroite) : crée et dérive des variantes dans CETTE étude.
    assertEcriture(access, actorId, ecriture, { studyId: study.id });
    if (requestId !== undefined) {
      const [previous] = await tx.select({ id: studioVariants.id }).from(studioVariants)
        .where(and(eq(studioVariants.studyId, study.id), eq(studioVariants.creationRequestId, requestId))).limit(1);
      if (previous) {
        return replayCreation(tx, previous.id, ["variant-initialization", "variant-derivation"], actorId, name, (r) => r.variant.name, (r) => {
          const stored = r.derivedFrom ?? null;
          if (!from) return stored === null;
          return stored !== null && stored.variantId === from.variantId && (from.revisionId === undefined || stored.revisionId === from.revisionId)
            && (stored.mode ?? "version") === (from.mode ?? "version");
        });
      }
    }
    if (study.archivedAt !== null) return studioArchivedRefusal();
    let document = newStudioDocument(newId("studio_document"));
    let derivedFrom: StudioProvenance | null = null;
    const variantId = newId("studio_variant"), revisionId = newId("studio_revision");
    if (from) {
      const [source] = await tx.select({ id: studioVariants.id, headRevisionId: studioVariants.headRevisionId }).from(studioVariants)
        .where(and(eq(studioVariants.id, from.variantId), eq(studioVariants.studyId, study.id))).limit(1);
      if (!source) return notFound();
      const [revision] = await tx.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
        .where(and(eq(studioRevisions.id, from.revisionId ?? source.headRevisionId), eq(studioRevisions.variantId, source.id))).limit(1);
      if (!revision) return notFound();
      if (from.mode === "copie") {
        // Copie indépendante (TR-INV-003) : nouvelles identités, provenance par élément, aucune propagation.
        const copie = studioCopieIndependante(validateStudioDocument(revision.document), newId("studio_document"), variantId.slice(-8));
        document = copie.document;
        derivedFrom = { variantId: source.id, revisionId: revision.id, mode: "copie", identites: copie.identites };
      } else {
        document = structuredClone(validateStudioDocument(revision.document));
        derivedFrom = { variantId: source.id, revisionId: revision.id };
      }
    }
    const response: StudioContext = {
      study: { id: study.id, name: study.name, projectId },
      variant: { id: variantId, name, studyId: study.id, headRevisionId: revisionId },
      revision: { id: revisionId, parentRevisionId: null, document }, canWrite: true, derivedFrom,
    };
    await tx.insert(studioVariants).values({
      id: variantId, studyId: study.id, name, headRevisionId: revisionId, creationRequestId: requestId ?? null,
      derivedFromVariantId: derivedFrom?.variantId ?? null, derivedFromRevisionId: derivedFrom?.revisionId ?? null,
      derivationMode: derivedFrom?.mode ?? null, derivationIdentities: derivedFrom?.identites ?? null,
    });
    await tx.insert(studioRevisions).values({
      id: revisionId, variantId, parentRevisionId: null, document, envelope: null,
      requestId: newId("initialization"), payloadHash: createHash("sha256").update(JSON.stringify({ projectId, studyId: study.id, variantId, name, derivedFrom })).digest("hex"),
      source: derivedFrom ? "variant-derivation" : "variant-initialization", authorId: actorId, response,
    });
    return { ...response, replayed: false };
  });
}

/** Formats d'export d'une révision : dessin (SVG, DXF), maquette (IFC) et géométrie 3D (OBJ, STL, STEP — E.6-04). */
export const STUDIO_EXPORT_FORMATS = ["svg", "dxf", "ifc", "obj", "stl", "step"] as const;
/** Formats couverts par le rapport de fidélité (E.6-03) ; les exports 3D ont leur bilan (`studioBilanExport3d`). */
export const STUDIO_RAPPORT_FORMATS = ["svg", "dxf", "ifc"] as const;
export type StudioExportFormat = (typeof STUDIO_EXPORT_FORMATS)[number];
export const STUDIO_EXPORT_CONTENT_TYPES: Readonly<Record<StudioExportFormat, string>> = Object.freeze({
  svg: "image/svg+xml; charset=utf-8",
  dxf: "application/dxf",
  // IFC STEP (ISO 10303-21) : chaînes encodées en ASCII (`\X2\`), aucun charset à déclarer.
  ifc: "application/x-step",
  // OBJ et STL ASCII : texte ASCII (identifiants échappés `~XXXX~`) ; STEP AP214 écrit par OCCT : ASCII.
  obj: "model/obj",
  stl: "model/stl",
  step: "model/step",
});
export interface StudioExportFile { format: StudioExportFormat; contentType: string; filename: string; revisionId: string; body: string }

/** Segment de nom de fichier : ASCII sans diacritiques, [a-z0-9._-], 60 caractères au plus, sinon la valeur de repli. */
export function studioFileSegment(value: string, fallback: string): string {
  const slug = value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "").slice(0, 60).replace(/[-.]+$/g, "");
  return slug || fallback;
}

/** Fichier d'export d'une révision (tête par défaut) : mêmes droits et mêmes 403 / 404 que la lecture. */
export async function exportStudioVariant(q: Querier, scope: StudioScope, actorId: string, format: StudioExportFormat, revisionId?: string): Promise<StudioExportFile> {
  assertAccess(await loadProjectAccess(scope.projectId, actorId, q), actorId, "export");
  const context = await readStudioContext(q, scope, actorId, revisionId);
  const doc = context.revision.document;
  let body: string;
  if (format === "svg") body = exportStudioSvg(doc);
  else if (format === "dxf") body = exportStudioDxf(doc);
  else if (format === "obj") body = exportStudioObj(doc);
  else if (format === "stl") body = exportStudioStl(doc);
  else if (format === "step") {
    const [row] = await q.select({ createdAt: studioRevisions.createdAt }).from(studioRevisions).where(eq(studioRevisions.id, context.revision.id)).limit(1);
    if (!row) return notFound();
    const step = await exportStudioStep(doc, row.createdAt.toISOString().slice(0, 19), `${studioFileSegment(context.variant.name, "variante")}.step`);
    // Aucun solide : refus explicite, jamais un fichier STEP vide.
    if (step === null) throw new StudioRequestError(422, { error: "nothing_to_export", message: "Aucun solide à écrire en STEP : extrudez un objet, posez un solide ou un mur." });
    body = step;
  } else {
    // Horodatage de la révision exportée (reproductible) ; GlobalId dérivés de la variante et des identifiants Studio.
    const [row] = await q.select({ createdAt: studioRevisions.createdAt }).from(studioRevisions).where(eq(studioRevisions.id, context.revision.id)).limit(1);
    if (!row) return notFound();
    body = exportStudioIfc(doc, {
      studyName: context.study.name, variantName: context.variant.name, revisionId: context.revision.id,
      timestamp: row.createdAt.toISOString().slice(0, 19), key: `${context.study.id}|${context.variant.id}`,
    });
  }
  const filename = [
    studioFileSegment(context.study.name, "etude"), studioFileSegment(context.variant.name, "variante"),
    studioFileSegment(context.revision.id.slice(-8), "revision"),
  ].join("-") + `.${format}`;
  return { format, contentType: STUDIO_EXPORT_CONTENT_TYPES[format], filename, revisionId: context.revision.id, body };
}

/** Côté d'une comparaison : `variantId` seul (tête) ou `variantId:revisionId`. */
export interface StudioCompareSide { variantId: string; revisionId?: string }
const compareSegment = /^[A-Za-z0-9._-]{1,128}$/;
/** Lit `variantId[:revisionId]` ; `null` si la valeur est mal formée (jamais corrigée). */
export function parseStudioCompareSide(value: unknown): StudioCompareSide | null {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  if (parts.length > 2 || !parts.every((part) => compareSegment.test(part))) return null;
  return parts.length === 2 ? { variantId: parts[0]!, revisionId: parts[1]! } : { variantId: parts[0]! };
}
export interface StudioComparison {
  from: { variantId: string; revisionId: string };
  to: { variantId: string; revisionId: string };
  difference: StudioDifferenceDocuments;
}
/**
 * Comparaison en lecture seule de deux révisions d'une même étude (tête par défaut). Mêmes droits que la lecture :
 * 401 / 403 selon le compte, 404 si l'étude n'est pas du projet ou si une variante ou une révision n'est pas de l'étude.
 */
export async function compareStudioRevisions(q: Querier, projectId: string, studyId: string, actorId: string, from: StudioCompareSide, to: StudioCompareSide): Promise<StudioComparison> {
  const a = await readStudioContext(q, { projectId, studyId, variantId: from.variantId }, actorId, from.revisionId);
  const b = await readStudioContext(q, { projectId, studyId, variantId: to.variantId }, actorId, to.revisionId);
  return {
    from: { variantId: a.variant.id, revisionId: a.revision.id },
    to: { variantId: b.variant.id, revisionId: b.revision.id },
    difference: comparerDocumentsStudio(a.revision.document, b.revision.document),
  };
}

/** Au plus tant de clés d'éléments citées dans un refus `stale_revision` (les comptes, eux, sont toujours exacts). */
export const STUDIO_CONFLICT_KEYS_MAX = 100;

/**
 * Corps d'un refus `stale_revision` (A.5-06) : la tête courante et, si la base citée est une révision de cette
 * variante, ce qui a changé depuis (`changedKeys`) et ce que le lot changerait aussi, autrement (`overlaps`,
 * `studioChevauchements`). Rien n'est écrit ni fusionné : le client revalide et décide (report ou rechargement).
 * `appliesOnHead` dit si le modèle accepterait encore le lot tel quel sur la tête (il n'est jamais appliqué pour autant).
 */
async function staleRevisionBody(tx: Tx, variantId: string, envelope: StudioEnvelope, headRevisionId: string, head: StudioDocument): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { error: "stale_revision", headRevisionId, baseRevisionId: envelope.baseRevisionId };
  const [base] = await tx.select({ document: studioRevisions.document }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, envelope.baseRevisionId), eq(studioRevisions.variantId, variantId))).limit(1);
  if (!base) return { ...body, baseKnown: false };
  // Une base qui ne passe plus la validation ne change pas la nature du refus : 409 sans détail (« non évalué »), jamais
  // un 500 que le client prendrait pour une issue inconnue et rejouerait.
  let baseDocument: StudioDocument;
  try { baseDocument = validateStudioDocument(base.document); }
  catch { return { ...body, baseKnown: true, detail: "non évalué", appliesOnHead: null }; }
  const changed = studioElementsModifies(baseDocument, head);
  const tryApply = (doc: StudioDocument): StudioDocument | null => { try { return applyStudioCommands(doc, envelope.commands); } catch { return null; } };
  const local = tryApply(baseDocument);
  const overlaps = local ? studioChevauchements(baseDocument, local, head) : null;
  return {
    ...body, baseKnown: true, changedCount: changed.length, changedKeys: changed.slice(0, STUDIO_CONFLICT_KEYS_MAX),
    overlapCount: overlaps?.length ?? null, overlaps: overlaps?.slice(0, STUDIO_CONFLICT_KEYS_MAX) ?? null, appliesOnHead: tryApply(head) !== null,
  };
}

/**
 * Application EN MÉMOIRE d'un lot à un document (essai, EX-045) : même modèle, aucune écriture. Le point d'entrée des
 * écritures reste `submitStudioCommands` ; ce module reste le seul à appliquer des commandes Studio (INV-010).
 */
export function essayerCommandesStudio(document: StudioDocument, commands: readonly StudioEnvelope["commands"][number][]): StudioDocument {
  return applyStudioCommands(document, [...commands]);
}

/** Réponse d'un lot accepté : contexte, rejeu, et (lot neuf) l'événement d'effets engagé avec la révision. */
export type StudioSoumission = StudioContext & { replayed: boolean; effects?: StudioEffetsCommande; eventId?: string };
/**
 * Source d'une révision écrite par ce point d'entrée : `authenticated-session` (l'interface, la console, l'exemple) ou
 * `agent-mcp` (proposition d'un agent confirmée par la personne dans Studio, `lib/studio-agents.ts`, INV-010). Jamais lue
 * dans le corps de la requête : seul le serveur la fixe.
 */
export type StudioSourceEcriture = "authenticated-session" | "agent-mcp";
/** Options internes (jamais lues du corps) : job d'essai confirmé (relation du journal), contrôle propre à l'appelant. */
export interface StudioSoumissionOptions {
  jobId?: string;
  avantEcriture?: (tx: Tx, tete: StudioRead) => Promise<void>;
  /** Dans la même transaction, après l'écriture de la révision (décision consignée avec elle, tout ou rien). */
  apresEcriture?: (tx: Tx, revisionId: string) => Promise<void>;
  source?: StudioSourceEcriture;
}

export async function submitStudioCommands(scope: StudioScope, actorId: string, input: unknown, ecriture: StudioEcriture = "modify", options: StudioSoumissionOptions = {}): Promise<StudioSoumission> {
  // Capture avant le premier await : aucun changement du payload durant les verrous/rejeu.
  scope = Object.freeze({ projectId: scope.projectId, studyId: scope.studyId, variantId: scope.variantId });
  // EX-003 : aucune géométrie sans variante propriétaire — un contexte incomplet est refusé avant toute lecture ou
  // écriture (sans s'en remettre à la sémantique de NULL de la requête).
  if ([scope.projectId, scope.studyId, scope.variantId].some((x) => typeof x !== "string" || x === "")) return notFound();
  const envelope = parseStudioEnvelope(input);
  refuserPrefixeReserve(envelope.requestId, ecriture);
  const payloadHash = studioPayloadHash(envelope);
  const source: StudioSourceEcriture = options.source ?? "authenticated-session";
  // IF-011 : la notification part après l'engagement de la transaction, jamais avant ni après un échec.
  return engagerPuisNotifier(() => db.transaction(async (tx) => {
    let current: StudioRead | undefined;
    const transactionId = nouvelleTransaction();
    return orchestrerCommandesDansTransaction<StudioSoumission>(tx, { kind: "studio", ...scope }, {
      prepare: async (transaction) => {
        const access = await lockedAccess(transaction, scope.projectId, actorId);
        const [study] = await transaction.select({ id: studioStudies.id }).from(studioStudies)
          .where(and(eq(studioStudies.id, scope.studyId), eq(studioStudies.projectId, scope.projectId))).limit(1);
        if (!study) return notFound();
        const [variant] = await transaction.select({ id: studioVariants.id }).from(studioVariants)
          .where(and(eq(studioVariants.id, scope.variantId), eq(studioVariants.studyId, study.id))).for("update");
        if (!variant) return notFound();
        assertEcriture(access, actorId, ecriture, { studyId: study.id, variantIds: [variant.id] });
        current = await readStudioContext(transaction, scope, actorId);
      },
      replay: async (transaction) => {
        const [previous] = await transaction.select().from(studioRevisions)
          .where(and(eq(studioRevisions.variantId, scope.variantId), eq(studioRevisions.requestId, envelope.requestId))).limit(1);
        if (!previous) return undefined;
        if (previous.authorId !== actorId || previous.payloadHash !== payloadHash) {
          throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." });
        }
        return { ...structuredClone(previous.response), replayed: true };
      },
      cheminEcriture: async (transaction, captured) => {
        const refus = await controlerCheminEcriture(transaction, captured);
        if (refus) throw new StudioRequestError(409, refus);
      },
      execute: async (transaction) => {
        if (!current) throw new Error("studio_scope_not_prepared");
        // Lu sous les verrous du projet et de la variante : un (dés)archivage concurrent est sérialisé avec ce lot.
        if (current.archived) return studioArchivedRefusal();
        // EX-028 : quota d'invocation du compte, contrôlé à chaque invocation effective (jamais pour un rejeu ni pour
        // l'installation d'un exemple) ; un lot refusé ici n'écrit rien et ne consomme rien.
        if (ecriture === "modify") {
          const depasse = quotaCommandesStudio.verifier(actorId);
          if (depasse) throw new StudioRequestError(429, corpsRefusQuota(depasse));
        }
        if (envelope.baseRevisionId !== current.variant.headRevisionId) {
          throw new StudioRequestError(409, await staleRevisionBody(transaction, scope.variantId, envelope, current.variant.headRevisionId, current.revision.document));
        }
        // Booléens exacts (lot F2) : recalculés par le noyau du serveur, qui remplace le résultat annoncé (R9).
        await options.avantEcriture?.(transaction, current);
        const refusExact = await revaliderBooleensStudio(current.revision.document, envelope.commands, applyStudioCommands);
        if (refusExact) throw new StudioRequestError(refusExact.status, refusExact.body);
        let document;
        try { document = applyStudioCommands(current.revision.document, envelope.commands); }
        catch (error) {
          if (error instanceof StudioValidationError) throw new StudioRequestError(400, { error: "invalid_commands", code: error.code, path: error.path, message: error.message });
          throw error;
        }
        const id = newId("studio_revision");
        const response: StudioContext = {
          study: current.study, variant: { ...current.variant, headRevisionId: id },
          revision: { id, parentRevisionId: current.variant.headRevisionId, document }, canWrite: true,
        };
        await transaction.insert(studioRevisions).values({ id, variantId: scope.variantId, parentRevisionId: current.variant.headRevisionId, document, envelope, requestId: envelope.requestId, payloadHash, source, authorId: actorId, response });
        await transaction.update(studioVariants).set({ headRevisionId: id }).where(eq(studioVariants.id, scope.variantId));
        // EX-010 / IF-011 : effets calculés par le serveur et consignés dans la même transaction que la révision.
        const effects = studioEffetsCommande(current.revision.document, document, envelope.commands, {
          revisionBase: current.variant.headRevisionId, revisionSortie: id, source: ecriture === "modify" ? source : "installation-exemple", auteurId: actorId, requestId: envelope.requestId,
        });
        const eventId = await consignerEvenementRevision(transaction, {
          transactionId, projectId: scope.projectId, studyId: scope.studyId, variantId: scope.variantId, baseRevisionId: current.variant.headRevisionId,
          revisionId: id, authorId: actorId, requestId: envelope.requestId, effects, jobId: options.jobId ?? null,
        });
        await options.apresEcriture?.(transaction, id);
        return { ...response, replayed: false, effects, eventId };
      },
    });
  }), (resultat) => {
    // EX-028 : un lot engagé (ni rejoué, ni installation d'exemple) consomme le quota d'invocation du compte.
    if (!resultat.replayed && ecriture === "modify") quotaCommandesStudio.consommer(actorId);
    // Temps réel (Issue #283), après validation : les sessions de cette variante apprennent qu'une révision plus récente
    // existe ; elle ne leur est jamais appliquée en silence.
    if (!resultat.replayed) signalerTempsReel({ type: "studio-revision", projectId: scope.projectId, variantId: scope.variantId, revisionId: resultat.revision.id });
  });
}
