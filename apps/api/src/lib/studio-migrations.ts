/**
 * Migration non destructrice d'une étude vers `studio-document/2` (EX-019, EX-091) : simulation (job), accord du
 * propriétaire, application, retour arrière.
 *
 * - Simuler (`modify`) : toutes les révisions de toutes les variantes de l'étude sont migrées en mémoire et comparées à
 *   leur source (identifiants, propriétés, cotes, associations, historique, accès : `studioSimulerMigration`) ; le
 *   rapport est le résultat d'un job `simulation-migration` ; le point de retour (tête de chaque variante) est figé.
 *   Rien n'est écrit dans les révisions.
 * - Accorder (propriétaire seul) : refusé si le verdict est `refusee` (perte sans trace ou révision non migrable).
 * - Appliquer (propriétaire seul) : refusé si une tête a changé depuis la simulation (409 `migration_perimee` : simuler
 *   de nouveau) ; écrit une copie `/2` de chaque révision (`studio_document_migrations`) — les révisions `/1` restent
 *   intactes (append-only), elles sont la source de la récupération.
 * - Retour arrière (propriétaire seul) : retire les copies `/2` ; les têtes sont celles du point de retour.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { studioMigrerDocumentV1V2, studioSimulerMigration, STUDIO_SCHEMA_DOCUMENT_V2, type StudioRapportSimulationMigration } from "@parcours/atelier-model/studio-cmd";
import { db } from "../db/client.js";
import { projectEffectiveAccess, studioDocumentMigrations, studioJobs, studioMigrations, studioRevisions, studioVariants, type StudioMigrationStatus } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess } from "./owned-project.js";
import { assertAccess, lockedAccess, notFound, StudioRequestError, studyOf } from "./studio-commands.js";
import type { Querier } from "./step-rows.js";

export interface StudioMigrationLue {
  id: string;
  studyId: string;
  jobId: string;
  cible: string;
  statut: StudioMigrationStatus;
  verdict: string;
  pointRetour: { variantId: string; headRevisionId: string }[];
  accord: { par: string; le: string } | null;
  appliqueeLe: string | null;
  retourArriereLe: string | null;
  documentsMigres: number;
  rapport: StudioRapportSimulationMigration | null;
}

async function acces(q: Querier, projectId: string) {
  return (await q.select({ userId: projectEffectiveAccess.userId, role: projectEffectiveAccess.role }).from(projectEffectiveAccess).where(eq(projectEffectiveAccess.projectId, projectId)))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

async function versMigration(q: Querier, m: typeof studioMigrations.$inferSelect): Promise<StudioMigrationLue> {
  const [job] = await q.select({ result: studioJobs.result }).from(studioJobs).where(eq(studioJobs.id, m.jobId)).limit(1);
  const docs = await q.select({ revisionId: studioDocumentMigrations.revisionId }).from(studioDocumentMigrations).where(eq(studioDocumentMigrations.migrationId, m.id));
  return {
    id: m.id, studyId: m.studyId, jobId: m.jobId, cible: m.targetSchema, statut: m.status, verdict: m.verdict, pointRetour: m.rollbackPoint,
    accord: m.agreedBy && m.agreedAt ? { par: m.agreedBy, le: m.agreedAt.toISOString() } : null,
    appliqueeLe: m.appliedAt?.toISOString() ?? null, retourArriereLe: m.rolledBackAt?.toISOString() ?? null,
    documentsMigres: docs.length, rapport: (job?.result as StudioRapportSimulationMigration | undefined) ?? null,
  };
}

async function teteDesVariantes(q: Querier, studyId: string) {
  return (await q.select({ variantId: studioVariants.id, headRevisionId: studioVariants.headRevisionId }).from(studioVariants).where(eq(studioVariants.studyId, studyId)))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
}

export async function simulerMigrationEtude(projectId: string, studyId: string, actorId: string): Promise<StudioMigrationLue> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id });
    const avant = await acces(tx, projectId);
    const variantes = await teteDesVariantes(tx, study.id);
    const revisions = variantes.length ? await tx.select({ id: studioRevisions.id, parentRevisionId: studioRevisions.parentRevisionId, document: studioRevisions.document, variantId: studioRevisions.variantId })
      .from(studioRevisions).where(inArray(studioRevisions.variantId, variantes.map((v) => v.variantId))).orderBy(asc(studioRevisions.createdAt), asc(studioRevisions.id)) : [];
    const rapport = studioSimulerMigration(revisions, { avant, apres: await acces(tx, projectId) });
    const jobId = newId("studio_job"), id = newId("studio_migration");
    await tx.insert(studioJobs).values({ id: jobId, projectId, studyId: study.id, variantId: null, kind: "simulation-migration", status: "termine", sourceRevisionId: null, payload: { cible: STUDIO_SCHEMA_DOCUMENT_V2 }, result: rapport, createdBy: actorId, finishedAt: new Date() });
    const [m] = await tx.insert(studioMigrations).values({ id, projectId, studyId: study.id, jobId, targetSchema: STUDIO_SCHEMA_DOCUMENT_V2, status: "simulee", rollbackPoint: variantes, verdict: rapport.verdict, createdBy: actorId }).returning();
    return versMigration(tx, m!);
  });
}

async function migrationDe(q: Querier, projectId: string, studyId: string, id: string) {
  const [m] = await q.select().from(studioMigrations).where(and(eq(studioMigrations.id, id), eq(studioMigrations.projectId, projectId), eq(studioMigrations.studyId, studyId))).limit(1);
  return m ?? notFound();
}

export async function lireMigrationEtude(projectId: string, studyId: string, id: string, actorId: string): Promise<StudioMigrationLue> {
  const access = await loadProjectAccess(projectId, actorId);
  assertAccess(access, actorId, "read", { studyId });
  await studyOf(db, projectId, studyId);
  return versMigration(db, await migrationDe(db, projectId, studyId, id));
}

export async function listerMigrationsEtude(projectId: string, studyId: string, actorId: string): Promise<{ migrations: StudioMigrationLue[] }> {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read", { studyId });
  await studyOf(db, projectId, studyId);
  const rows = await db.select().from(studioMigrations).where(and(eq(studioMigrations.projectId, projectId), eq(studioMigrations.studyId, studyId))).orderBy(desc(studioMigrations.createdAt), desc(studioMigrations.id));
  return { migrations: await Promise.all(rows.map((r) => versMigration(db, r))) };
}

type Passage = "accorder" | "appliquer" | "retour-arriere";
const ATTENDU: Record<Passage, StudioMigrationStatus> = { accorder: "simulee", appliquer: "accordee", "retour-arriere": "appliquee" };

export async function passerMigrationEtude(projectId: string, studyId: string, id: string, actorId: string, passage: Passage): Promise<StudioMigrationLue> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    // Procédure d'accord : le propriétaire du projet seul accorde, applique et retire.
    assertAccess(access, actorId, "owner");
    // Écriture du propriétaire : la réservation d'édition d'un autre compte s'y oppose (423).
    assertAccess(access, actorId, "write");
    const m = await migrationDe(tx, projectId, studyId, id);
    if (m.status !== ATTENDU[passage]) throw new StudioRequestError(409, { error: "migration_etat", statut: m.status, attendu: ATTENDU[passage], message: `Passage « ${passage} » impossible depuis l’état « ${m.status} ».` });
    if (passage === "accorder") {
      if (m.verdict === "refusee") throw new StudioRequestError(409, { error: "migration_refusee", message: "La simulation rapporte une perte sans trace ou une révision non migrable : aucun accord possible." });
      const [r] = await tx.update(studioMigrations).set({ status: "accordee", agreedBy: actorId, agreedAt: new Date() }).where(eq(studioMigrations.id, m.id)).returning();
      return versMigration(tx, r!);
    }
    if (passage === "appliquer") {
      const tetes = await teteDesVariantes(tx, studyId);
      if (JSON.stringify(tetes) !== JSON.stringify(m.rollbackPoint)) throw new StudioRequestError(409, { error: "migration_perimee", pointRetour: m.rollbackPoint, tetes, message: "L’étude a changé depuis la simulation : simulez de nouveau avant d’appliquer." });
      const revisions = tetes.length ? await tx.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions).where(inArray(studioRevisions.variantId, tetes.map((t) => t.variantId))) : [];
      for (const r of revisions) {
        const mig = studioMigrerDocumentV1V2(r.document);
        if (!mig.ok) throw new StudioRequestError(409, { error: "migration_impossible", revisionId: r.id, motif: mig.motif });
        await tx.insert(studioDocumentMigrations).values({ migrationId: m.id, revisionId: r.id, schemaVersion: STUDIO_SCHEMA_DOCUMENT_V2, document: mig.document });
      }
      const [r] = await tx.update(studioMigrations).set({ status: "appliquee", appliedAt: new Date() }).where(eq(studioMigrations.id, m.id)).returning();
      return versMigration(tx, r!);
    }
    await tx.delete(studioDocumentMigrations).where(eq(studioDocumentMigrations.migrationId, m.id));
    const [r] = await tx.update(studioMigrations).set({ status: "retour-arriere", rolledBackAt: new Date() }).where(eq(studioMigrations.id, m.id)).returning();
    return versMigration(tx, r!);
  });
}

/** Copie `/2` d'une révision dans une migration appliquée (lecture ; 404 si absente). */
export async function lireDocumentMigre(projectId: string, studyId: string, id: string, revisionId: string, actorId: string): Promise<{ revisionId: string; document: unknown }> {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read", { studyId });
  const m = await migrationDe(db, projectId, studyId, id);
  const [d] = await db.select({ document: studioDocumentMigrations.document }).from(studioDocumentMigrations).where(and(eq(studioDocumentMigrations.migrationId, m.id), eq(studioDocumentMigrations.revisionId, revisionId))).limit(1);
  if (!d) return notFound();
  return { revisionId, document: d.document };
}
