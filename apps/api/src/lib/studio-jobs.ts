/**
 * Jobs serveur Studio (EX-088) et appel d'essai à portée de révision (EX-045).
 *
 * Un job est une exécution du serveur rattachée à une étude (et, pour un essai, à une variante et à sa révision
 * source) : `en-calcul` → `termine` | `echec`, puis pour un essai `abandonne` ou `confirme`. Son résultat est relu par
 * `GET /projects/:p/studio/jobs/:jobId` sous l'autorisation de l'objet source : droit de lecture du projet ET de l'étude
 * (portées étroites comprises) ; un job d'un autre projet ou d'une étude non lisible répond 404 sans aucune métadonnée.
 *
 * Essai (`essai-commandes`) : l'enveloppe de commandes est validée comme un lot (même contrat, mêmes droits d'écriture),
 * les booléens exacts sont **recalculés par le noyau du serveur** (le recalcul exact est ce job), puis le lot est appliqué
 * en mémoire seulement : aucune révision n'est écrite. Le résultat porte la géométrie des éléments touchés, les effets,
 * les avertissements et sa portée (`baseRevisionId`). Confirmer un essai rejoue son enveloppe par le point d'entrée des
 * écritures (`submitStudioCommands`), sous la condition que la tête soit encore la révision de l'essai : un essai R12
 * confirmé quand R13 est la tête est refusé (409 `essai_perime`), un essai abandonné aussi (409 `essai_abandonne`).
 */
import { and, eq } from "drizzle-orm";
import { StudioValidationError, type StudioDocument, type StudioEnvelope } from "@parcours/atelier-model";
import { studioEffetsCommande, type StudioEffetsCommande } from "@parcours/atelier-model/studio-cmd";
import { db } from "../db/client.js";
import { studioJobs, studioStudies, studioVariants, type StudioJobKind, type StudioJobStatus } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess } from "./owned-project.js";
import { assertAccess, essayerCommandesStudio, lockedAccess, notFound, parseStudioEnvelope, readStudioContext, studioArchivedRefusal, studioPayloadHash, StudioRequestError, submitStudioCommands, type StudioScope, type StudioSoumission } from "./studio-commands.js";
import { revaliderBooleensStudio } from "./studio-exact.js";
import type { Querier } from "./step-rows.js";

export interface StudioJob {
  id: string;
  kind: StudioJobKind;
  status: StudioJobStatus;
  projectId: string;
  studyId: string;
  variantId: string | null;
  sourceRevisionId: string | null;
  result: unknown;
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
}
type LigneJob = typeof studioJobs.$inferSelect;
export const versJob = (r: LigneJob): StudioJob => ({
  id: r.id, kind: r.kind, status: r.status, projectId: r.projectId, studyId: r.studyId, variantId: r.variantId ?? null, sourceRevisionId: r.sourceRevisionId ?? null,
  result: r.result ?? null, createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null,
});

/** Résultat d'un job lu sous l'autorisation de l'étude source ; 404 sans métadonnée sinon. */
export async function lireJobStudio(q: Querier, projectId: string, jobId: string, actorId: string): Promise<StudioJob> {
  const access = await loadProjectAccess(projectId, actorId, q);
  assertAccess(access, actorId, "read");
  const [row] = await q.select().from(studioJobs).where(and(eq(studioJobs.id, jobId), eq(studioJobs.projectId, projectId))).limit(1);
  if (!row) return notFound();
  // Portées étroites : l'étude (et la variante) du job doivent être lisibles par ce compte.
  try { assertAccess(access, actorId, "read", { studyId: row.studyId, ...(row.variantId ? { variantIds: [row.variantId] } : {}) }); }
  catch { return notFound(); }
  return versJob(row);
}

export interface ResultatEssai {
  schema: "studio-essai/1";
  baseRevisionId: string;
  /** Portée de validité : l'essai ne vaut que pour cette révision (EX-045). */
  valideSur: string;
  effets: StudioEffetsCommande;
  /** Géométrie des éléments créés ou modifiés, telle que le lot la produirait (aucune écriture). */
  geometrie: Record<string, unknown>;
  avertissements: string[];
  exacts: { id: string; volume: number | null; aire: number | null; empreinte: string | null }[];
}

function elementsDe(doc: StudioDocument): Map<string, unknown> {
  const m = new Map<string, unknown>();
  const d = doc as unknown as Record<string, unknown>;
  for (const l of ["objects", "dimensions", "solides", "exacts", "annotations", "architecture", "scenes", "nonNatifs", "layers"]) {
    for (const x of (d[l] as { id?: string }[] | undefined) ?? []) if (x && typeof x.id === "string") m.set(x.id, x);
  }
  return m;
}

function avertissementsDe(doc: StudioDocument, ids: Set<string>): string[] {
  const out: string[] = [];
  for (const c of doc.dimensions ?? []) if (c.toResolve && ids.has(c.id)) out.push(`Cote ${c.id} à résoudre après l’essai.`);
  for (const c of doc.dimensions ?? []) if (c.toResolve && !ids.has(c.id) && [c.links.start, c.links.end].some((l) => l && ids.has(l.objectId))) out.push(`Cote ${c.id} à résoudre.`);
  return out;
}

/**
 * Essai d'une enveloppe sur la tête de la variante. Droits d'écriture exigés ; base ≠ tête → 409 `stale_revision`. Le
 * job est enregistré `termine` (résultat) ou `echec` (motif du refus) ; aucune révision n'est écrite dans les deux cas.
 */
export async function creerEssaiStudio(scope: StudioScope, actorId: string, input: unknown): Promise<StudioJob> {
  const envelope = parseStudioEnvelope(input);
  const payloadHash = studioPayloadHash(envelope);
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, scope.projectId, actorId);
    const current = await readStudioContext(tx, scope, actorId);
    assertAccess(access, actorId, "modify", { studyId: current.study.id, variantIds: [current.variant.id] });
    if (current.archived) return studioArchivedRefusal();
    if (envelope.baseRevisionId !== current.variant.headRevisionId) {
      throw new StudioRequestError(409, { error: "stale_revision", headRevisionId: current.variant.headRevisionId, baseRevisionId: envelope.baseRevisionId });
    }
    const id = newId("studio_job");
    let status: StudioJobStatus = "termine";
    let result: unknown;
    // Le recalcul exact (booléens) est fait ici, par le noyau du serveur, sur une copie : l'enveloppe stockée porte le
    // résultat du serveur, que la confirmation recalculera encore (le serveur fait autorité, R9).
    const commandes = structuredClone(envelope.commands);
    const refusExact = await revaliderBooleensStudio(current.revision.document, commandes, essayerCommandesStudio);
    if (refusExact) { status = "echec"; result = { schema: "studio-essai/1", baseRevisionId: envelope.baseRevisionId, erreur: refusExact.body }; }
    else {
      try {
        const apres = essayerCommandesStudio(current.revision.document, commandes);
        const effets = studioEffetsCommande(current.revision.document, apres, commandes, { revisionBase: envelope.baseRevisionId, revisionSortie: `essai:${id}`, source: "essai", auteurId: actorId, requestId: envelope.requestId });
        const touches = new Set([...effets.crees, ...effets.modifies]);
        const elements = elementsDe(apres);
        const r: ResultatEssai = {
          schema: "studio-essai/1", baseRevisionId: envelope.baseRevisionId, valideSur: envelope.baseRevisionId, effets,
          geometrie: Object.fromEntries([...touches].filter((k) => elements.has(k)).sort().map((k) => [k, elements.get(k)])),
          avertissements: avertissementsDe(apres, new Set([...touches, ...effets.supprimes])),
          exacts: (apres.exacts ?? []).filter((x) => touches.has(x.id)).map((x) => ({ id: x.id, volume: x.resultat.volume ?? null, aire: x.resultat.aire ?? null, empreinte: x.resultat.empreinte ?? null })),
        };
        result = r;
      } catch (error) {
        if (!(error instanceof StudioValidationError)) throw error;
        status = "echec";
        result = { schema: "studio-essai/1", baseRevisionId: envelope.baseRevisionId, erreur: { error: "invalid_commands", code: error.code, path: error.path, message: error.message } };
      }
    }
    const [row] = await tx.insert(studioJobs).values({
      id, projectId: scope.projectId, studyId: scope.studyId, variantId: scope.variantId, kind: "essai-commandes", status,
      sourceRevisionId: envelope.baseRevisionId, payload: envelope, payloadHash, result, createdBy: actorId, finishedAt: new Date(),
    }).returning();
    return versJob(row!);
  });
}

async function jobEssai(q: Querier, scope: StudioScope, jobId: string) {
  const [row] = await q.select().from(studioJobs).where(and(eq(studioJobs.id, jobId), eq(studioJobs.projectId, scope.projectId), eq(studioJobs.studyId, scope.studyId), eq(studioJobs.variantId, scope.variantId), eq(studioJobs.kind, "essai-commandes"))).limit(1);
  return row ?? notFound();
}

/** Abandon d'un essai terminé (aucun effet) ; idempotent ; un essai confirmé ne s'abandonne plus (409). */
export async function abandonnerEssaiStudio(scope: StudioScope, actorId: string, jobId: string): Promise<StudioJob> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, scope.projectId, actorId);
    const row = await jobEssai(tx, scope, jobId);
    assertAccess(access, actorId, "modify", { studyId: scope.studyId, variantIds: [scope.variantId] });
    if (row.status === "abandonne") return versJob(row);
    if (row.status === "confirme") throw new StudioRequestError(409, { error: "essai_confirme", message: "Cet essai a déjà été confirmé." });
    const [maj] = await tx.update(studioJobs).set({ status: "abandonne", updatedAt: new Date() }).where(eq(studioJobs.id, row.id)).returning();
    return versJob(maj!);
  });
}

/**
 * Confirmation d'un essai : son enveloppe passe par le point d'entrée des écritures, sous le contrôle (dans la même
 * transaction) que l'essai est toujours `termine` et que la tête est sa révision. Le journal relie la révision au job.
 */
export async function confirmerEssaiStudio(scope: StudioScope, actorId: string, jobId: string): Promise<StudioSoumission & { jobId: string }> {
  const row = await jobEssai(db, scope, jobId);
  assertAccess(await loadProjectAccess(scope.projectId, actorId), actorId, "read", { studyId: scope.studyId, variantIds: [scope.variantId] });
  if (row.status === "abandonne") throw new StudioRequestError(409, { error: "essai_abandonne", message: "Prévisualisation abandonnée : elle ne peut plus être confirmée." });
  if (row.status === "echec") throw new StudioRequestError(409, { error: "essai_echec", message: "Cet essai a échoué : rien à confirmer." });
  try {
    const r = await submitStudioCommands(scope, actorId, row.payload as StudioEnvelope, "modify", {
      jobId: row.id,
      avantEcriture: async (tx, tete) => {
        if (tete.variant.headRevisionId !== row.sourceRevisionId) throw new StudioRequestError(409, { error: "essai_perime", baseRevisionId: row.sourceRevisionId, headRevisionId: tete.variant.headRevisionId });
        const maj = await tx.update(studioJobs).set({ status: "confirme", updatedAt: new Date() }).where(and(eq(studioJobs.id, row.id), eq(studioJobs.status, "termine"))).returning({ id: studioJobs.id });
        if (!maj.length) throw new StudioRequestError(409, { error: "essai_abandonne", message: "Prévisualisation abandonnée entre-temps : rien n’est confirmé." });
      },
    });
    return { ...r, jobId: row.id };
  } catch (error) {
    if (error instanceof StudioRequestError && error.body["error"] === "stale_revision") {
      throw new StudioRequestError(409, { ...error.body, error: "essai_perime", message: `Essai calculé sur ${row.sourceRevisionId}, la tête est ${String(error.body["headRevisionId"])} : il ne peut plus être confirmé.` });
    }
    throw error;
  }
}

/** Étude du projet (404 sinon), pour un job d'étude sans variante. */
export async function etudeDuProjet(q: Querier, projectId: string, studyId: string) {
  const [s] = await q.select({ id: studioStudies.id, archivedAt: studioStudies.archivedAt }).from(studioStudies).where(and(eq(studioStudies.id, studyId), eq(studioStudies.projectId, projectId))).limit(1);
  return s ?? notFound();
}
export const variantesDeLEtude = (q: Querier, studyId: string) => q.select({ id: studioVariants.id, headRevisionId: studioVariants.headRevisionId }).from(studioVariants).where(eq(studioVariants.studyId, studyId));
