/**
 * Liens entre une étude Studio et des étapes du Parcours du même projet. Lecture avec le droit `read`, écriture avec
 * le droit `modify` (mêmes refus que les créations Studio : lecteur 403, réservation d'autrui 423, référence protégée
 * 403). L'étape est identifiée par son numéro (`project_steps.step_number`) et doit exister dans le projet, sinon 400.
 * PUT idempotent : la liste complète remplace la précédente ; un lien conservé garde son auteur et sa date.
 * Les libellés d'étape viennent des définitions du Parcours (`data/parcours.ts`), jamais d'un texte ressaisi.
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { PARCOURS_STEPS } from "../data/parcours.js";
import { db } from "../db/client.js";
import { projectMembers, projectSteps, studioStudies, studioStudySteps } from "../db/schema.js";
import { loadProjectAccess, projectAccessRefusal, type ProjectNeed } from "./owned-project.js";
import { StudioRequestError, studioArchivedRefusal } from "./studio-commands.js";
import { lockProject, type Querier } from "./step-rows.js";

export const studioStudyStepsSchema = z.object({
  steps: z.array(z.number().int().positive().max(1000)).max(64)
    .refine((s) => new Set(s).size === s.length, "Étape citée deux fois"),
}).strict();

export interface StudioStepOption { number: number; title: string; phase: string }
export interface StudioStudyStepsView {
  /** Étapes rattachées, par numéro croissant. */
  steps: { number: number; createdAt: string }[];
  /** Étapes du projet proposées au rattachement (libellés des définitions du Parcours). */
  available: StudioStepOption[];
  canWrite: boolean;
}

const notFound = (): never => { throw new StudioRequestError(404, { error: "not_found" }); };

async function access(q: Querier, projectId: string, actorId: string, need: ProjectNeed) {
  const loaded = await loadProjectAccess(projectId, actorId, q);
  const refusal = projectAccessRefusal(loaded, actorId, need);
  if (refusal) throw new StudioRequestError(refusal.status, refusal.body);
  return loaded!;
}

async function studyIn(q: Querier, projectId: string, studyId: string): Promise<{ id: string; archivedAt: Date | null }> {
  const [study] = await q.select({ id: studioStudies.id, archivedAt: studioStudies.archivedAt }).from(studioStudies)
    .where(and(eq(studioStudies.id, studyId), eq(studioStudies.projectId, projectId))).limit(1);
  return study ?? notFound();
}

/** Numéros d'étape présents dans le projet, avec le libellé de leur définition. */
async function projectStepOptions(q: Querier, projectId: string): Promise<StudioStepOption[]> {
  const rows = await q.select({ n: projectSteps.stepNumber }).from(projectSteps).where(eq(projectSteps.projectId, projectId));
  const present = new Set(rows.map((r) => r.n));
  return PARCOURS_STEPS.filter((s) => present.has(s.number)).map((s) => ({ number: s.number, title: s.title, phase: s.phase }));
}

async function view(q: Querier, projectId: string, studyId: string, canWrite: boolean): Promise<StudioStudyStepsView> {
  const rows = await q.select({ n: studioStudySteps.stepNumber, createdAt: studioStudySteps.createdAt }).from(studioStudySteps)
    .where(eq(studioStudySteps.studyId, studyId)).orderBy(asc(studioStudySteps.stepNumber));
  return { steps: rows.map((r) => ({ number: r.n, createdAt: r.createdAt.toISOString() })), available: await projectStepOptions(q, projectId), canWrite };
}

export async function listStudioStudySteps(projectId: string, studyId: string, actorId: string): Promise<StudioStudyStepsView> {
  const loaded = await access(db, projectId, actorId, "read");
  const study = await studyIn(db, projectId, studyId);
  return view(db, projectId, study.id, projectAccessRefusal(loaded, actorId, "modify") === null);
}

export async function setStudioStudySteps(projectId: string, studyId: string, actorId: string, steps: number[]): Promise<StudioStudyStepsView> {
  return db.transaction(async (tx) => {
    // Même sérialisation que les écritures du projet ; le membre est relu sous verrou (révocation concurrente).
    await lockProject(tx, projectId);
    await tx.select({ userId: projectMembers.userId }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actorId))).for("share");
    await access(tx, projectId, actorId, "modify");
    const study = await studyIn(tx, projectId, studyId);
    if (study.archivedAt !== null) studioArchivedRefusal();
    const known = new Set((await projectStepOptions(tx, projectId)).map((s) => s.number));
    const unknown = steps.filter((n) => !known.has(n));
    if (unknown.length) {
      throw new StudioRequestError(400, { error: "invalid_input", code: "unknown_steps", steps: unknown, message: "Étape(s) absente(s) du Parcours de ce projet." });
    }
    await tx.delete(studioStudySteps).where(steps.length
      ? and(eq(studioStudySteps.studyId, study.id), notInArray(studioStudySteps.stepNumber, steps))
      : eq(studioStudySteps.studyId, study.id));
    if (steps.length) {
      await tx.insert(studioStudySteps).values(steps.map((n) => ({ studyId: study.id, stepNumber: n, createdBy: actorId }))).onConflictDoNothing();
    }
    return view(tx, projectId, study.id, true);
  });
}

/** Études du projet rattachées à une étape : lecture `read` ; numéro absent du projet → 400. */
export async function listStudiesOfStep(projectId: string, stepNumber: number, actorId: string): Promise<{ studies: { id: string; name: string }[] }> {
  await access(db, projectId, actorId, "read");
  const known = await projectStepOptions(db, projectId);
  if (!known.some((s) => s.number === stepNumber)) {
    throw new StudioRequestError(400, { error: "invalid_input", code: "unknown_steps", steps: [stepNumber], message: "Étape absente du Parcours de ce projet." });
  }
  const studies = await db.select({ id: studioStudies.id, name: studioStudies.name }).from(studioStudySteps)
    .innerJoin(studioStudies, eq(studioStudies.id, studioStudySteps.studyId))
    .where(and(eq(studioStudies.projectId, projectId), eq(studioStudySteps.stepNumber, stepNumber)))
    .orderBy(asc(studioStudies.createdAt), asc(studioStudies.id));
  return { studies };
}
