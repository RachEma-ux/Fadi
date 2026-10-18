/** Handler Studio de l'orchestrateur commun : droits, rejeu, base, révision append-only. */
import { and, asc, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { applyStudioCommands, newStudioDocument, STUDIO_COMMAND_TOOL_IDS, STUDIO_CONTRACT, StudioValidationError, validateStudioDocument, type StudioEnvelope } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { projectMembers, studioRevisions, studioStudies, studioVariants, type StudioContext } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess, projectAccessRefusal, type AccessibleProject, type ProjectNeed } from "./owned-project.js";
import { orchestrerCommandesDansTransaction, type Tx } from "./atelier-validation.js";
import { lockProject, type Querier } from "./step-rows.js";

export interface StudioScope { projectId: string; studyId: string; variantId: string }
export class StudioRequestError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) { super("studio_request_refused"); }
}
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const envelopeSchema = z.object({
  contractVersion: z.literal(STUDIO_CONTRACT), requestId: identifier, baseRevisionId: identifier,
  commands: z.array(z.object({
    toolId: z.enum(STUDIO_COMMAND_TOOL_IDS),
    params: z.record(z.string(), z.unknown()),
  }).strict()).min(1).max(500),
}).strict();

export function parseStudioEnvelope(value: unknown): StudioEnvelope {
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

function notFound(): never { throw new StudioRequestError(404, { error: "not_found" }); }
function assertAccess(access: AccessibleProject | null, actorId: string, need: ProjectNeed): AccessibleProject {
  const refusal = projectAccessRefusal(access, actorId, need);
  if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
  return access!;
}

/** Verrouille également le membre : une révocation concurrente ne traverse pas le commit. */
async function lockedAccess(tx: Tx, projectId: string, actorId: string): Promise<AccessibleProject> {
  await lockProject(tx, projectId);
  await tx.select({ userId: projectMembers.userId }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId))).for("share");
  return assertAccess(await loadProjectAccess(projectId, actorId, tx), actorId, "read");
}

export async function readStudioContext(q: Querier, scope: StudioScope, actorId: string, revisionId?: string): Promise<StudioContext> {
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
  return {
    study: { id: study.id, name: study.name, projectId: study.projectId },
    variant: { id: variant.id, name: variant.name, studyId: study.id, headRevisionId: variant.headRevisionId },
    revision: { id: revision.id, parentRevisionId: revision.parentRevisionId, document: validateStudioDocument(revision.document) },
    canWrite: revisionId === undefined && projectAccessRefusal(access, actorId, "modify") === null,
  };
}

export async function listStudioStudies(projectId: string, actorId: string) {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const rows = await db.select({ id: studioStudies.id, name: studioStudies.name, initialVariantId: studioStudies.initialVariantId, createdAt: studioStudies.createdAt })
    .from(studioStudies).where(eq(studioStudies.projectId, projectId)).orderBy(asc(studioStudies.createdAt), asc(studioStudies.id));
  return { studies: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}

export interface StudioVariantSummary { id: string; name: string; headRevisionId: string }
export interface StudioStudyRead {
  study: { id: string; name: string; projectId: string; initialVariantId: string; createdAt: string };
  variants: StudioVariantSummary[];
  canWrite: boolean;
}
export interface StudioRevisionSummary { id: string; parentRevisionId: string | null; source: string; authorId: string; createdAt: string }

/** Étude du projet de l'URL, sinon 404 (une étude d'un autre projet n'est pas révélée). */
async function studyOf(q: Querier, projectId: string, studyId: string) {
  const [study] = await q.select().from(studioStudies)
    .where(and(eq(studioStudies.id, studyId), eq(studioStudies.projectId, projectId))).limit(1);
  return study ?? notFound();
}

/** Variante initiale d'abord, puis les autres par ordre de création (identifiant en départage). */
async function variantsOf(q: Querier, study: { id: string; initialVariantId: string }): Promise<StudioVariantSummary[]> {
  const rows = await q.select({ id: studioVariants.id, name: studioVariants.name, headRevisionId: studioVariants.headRevisionId })
    .from(studioVariants).where(eq(studioVariants.studyId, study.id)).orderBy(asc(studioVariants.createdAt), asc(studioVariants.id));
  return [...rows.filter((row) => row.id === study.initialVariantId), ...rows.filter((row) => row.id !== study.initialVariantId)];
}

export async function readStudioStudy(q: Querier, projectId: string, studyId: string, actorId: string): Promise<StudioStudyRead> {
  const access = assertAccess(await loadProjectAccess(projectId, actorId, q), actorId, "read");
  const study = await studyOf(q, projectId, studyId);
  return {
    study: { id: study.id, name: study.name, projectId: study.projectId, initialVariantId: study.initialVariantId, createdAt: study.createdAt.toISOString() },
    variants: await variantsOf(q, study),
    canWrite: projectAccessRefusal(access, actorId, "modify") === null,
  };
}

export async function listStudioVariants(q: Querier, projectId: string, studyId: string, actorId: string): Promise<{ variants: StudioVariantSummary[] }> {
  assertAccess(await loadProjectAccess(projectId, actorId, q), actorId, "read");
  return { variants: await variantsOf(q, await studyOf(q, projectId, studyId)) };
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

export async function createStudioStudy(projectId: string, actorId: string, name: string): Promise<StudioContext> {
  return db.transaction(async (tx) => {
    assertAccess(await lockedAccess(tx, projectId, actorId), actorId, "modify");
    const studyId = newId("studio_study"), variantId = newId("studio_variant"), revisionId = newId("studio_revision");
    const response: StudioContext = {
      study: { id: studyId, name, projectId },
      variant: { id: variantId, name: "Variante initiale", studyId, headRevisionId: revisionId },
      revision: { id: revisionId, parentRevisionId: null, document: newStudioDocument(newId("studio_document")) }, canWrite: true,
    };
    await tx.insert(studioStudies).values({ id: studyId, projectId, name, initialVariantId: variantId });
    await tx.insert(studioVariants).values({ id: variantId, studyId, name: response.variant.name, headRevisionId: revisionId });
    await tx.insert(studioRevisions).values({
      id: revisionId, variantId, parentRevisionId: null, document: response.revision.document, envelope: null,
      requestId: newId("initialization"), payloadHash: createHash("sha256").update(JSON.stringify({ projectId, studyId, variantId, name })).digest("hex"),
      source: "study-initialization", authorId: actorId, response,
    });
    return response;
  });
}

/** Nouvelle variante d'une étude existante : une seule révision initiale, document vide, sans parent. */
export async function createStudioVariant(projectId: string, studyId: string, actorId: string, name: string): Promise<StudioContext> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify");
    const variantId = newId("studio_variant"), revisionId = newId("studio_revision");
    const response: StudioContext = {
      study: { id: study.id, name: study.name, projectId },
      variant: { id: variantId, name, studyId: study.id, headRevisionId: revisionId },
      revision: { id: revisionId, parentRevisionId: null, document: newStudioDocument(newId("studio_document")) }, canWrite: true,
    };
    await tx.insert(studioVariants).values({ id: variantId, studyId: study.id, name, headRevisionId: revisionId });
    await tx.insert(studioRevisions).values({
      id: revisionId, variantId, parentRevisionId: null, document: response.revision.document, envelope: null,
      requestId: newId("initialization"), payloadHash: createHash("sha256").update(JSON.stringify({ projectId, studyId: study.id, variantId, name })).digest("hex"),
      source: "variant-initialization", authorId: actorId, response,
    });
    return response;
  });
}

export async function submitStudioCommands(scope: StudioScope, actorId: string, input: unknown): Promise<StudioContext & { replayed: boolean }> {
  // Capture avant le premier await : aucun changement du payload durant les verrous/rejeu.
  scope = Object.freeze({ projectId: scope.projectId, studyId: scope.studyId, variantId: scope.variantId });
  const envelope = parseStudioEnvelope(input);
  const payloadHash = studioPayloadHash(envelope);
  return db.transaction(async (tx) => {
    let current: StudioContext | undefined;
    return orchestrerCommandesDansTransaction<StudioContext & { replayed: boolean }>(tx, { kind: "studio", ...scope }, {
      prepare: async (transaction) => {
        const access = await lockedAccess(transaction, scope.projectId, actorId);
        const [study] = await transaction.select({ id: studioStudies.id }).from(studioStudies)
          .where(and(eq(studioStudies.id, scope.studyId), eq(studioStudies.projectId, scope.projectId))).limit(1);
        if (!study) return notFound();
        const [variant] = await transaction.select({ id: studioVariants.id }).from(studioVariants)
          .where(and(eq(studioVariants.id, scope.variantId), eq(studioVariants.studyId, study.id))).for("update");
        if (!variant) return notFound();
        assertAccess(access, actorId, "modify");
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
      execute: async (transaction) => {
        if (!current) throw new Error("studio_scope_not_prepared");
        if (envelope.baseRevisionId !== current.variant.headRevisionId) {
          throw new StudioRequestError(409, { error: "stale_revision", headRevisionId: current.variant.headRevisionId });
        }
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
        await transaction.insert(studioRevisions).values({ id, variantId: scope.variantId, parentRevisionId: current.variant.headRevisionId, document, envelope, requestId: envelope.requestId, payloadHash, source: "authenticated-session", authorId: actorId, response });
        await transaction.update(studioVariants).set({ headRevisionId: id }).where(eq(studioVariants.id, scope.variantId));
        return { ...response, replayed: false };
      },
    });
  });
}
