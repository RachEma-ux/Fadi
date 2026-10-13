/**
 * R2 — Planning métier du dossier. Aucun statut Parcours ni modèle Atelier
 * n'est modifié ici. Les références validées restent immuables.
 */
import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projectPlans, projectPlanBaselines, type ProjectPlanningStep, type ProjectPlanningSteps } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { estReferenceProtegee, projectOr404 } from "../lib/owned-project.js";
import { PARCOURS_STEPS } from "../data/parcours.js";

export const projectPlanningRouter = Router({ mergeParams: true });
projectPlanningRouter.use(requireAuth);

const isCivilDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const nullableDate = z.string().refine(isCivilDate, "Date civile attendue au format YYYY-MM-DD").nullable();

const stepSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  startDate: nullableDate,
  endDate: nullableDate,
  responsible: z.string().trim().max(120),
  nextAction: z.string().trim().max(1200),
}).strict().superRefine((value, ctx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "La fin doit être postérieure ou égale au début." });
  }
});
const versionSchema = z.object({ expectedRevision: z.number().int().nonnegative() }).strict();

function stepNumber(value: string | undefined): number | null {
  const number = Number(value);
  return value && /^\d{1,2}$/.test(value) && PARCOURS_STEPS.some((step) => step.number === number) ? number : null;
}
function configured(step: ProjectPlanningStep) {
  return Boolean(step.startDate || step.endDate || step.responsible || step.nextAction);
}
function forbiddenReference(res: import("express").Response, project: { exampleMode: string | null }) {
  if (!estReferenceProtegee(project as { exampleMode: "reference" | "editable" | null })) return false;
  res.status(403).json({ error: "forbidden", motif: "reference-protegee", message: "Exemple de référence protégé : créez une copie de travail pour modifier le planning." });
  return true;
}

/** Le GET d'un projet sans planning renvoie une valeur vide, jamais des dates simulées. */
async function planningView(projectId: string) {
  const [plan] = await db.select().from(projectPlans).where(eq(projectPlans.projectId, projectId)).limit(1);
  const [baseline] = plan?.baselineVersion
    ? await db.select().from(projectPlanBaselines).where(and(eq(projectPlanBaselines.projectId, projectId), eq(projectPlanBaselines.version, plan.baselineVersion))).limit(1)
    : [];
  return {
    projectId,
    revision: plan?.revision ?? 0,
    steps: plan?.steps ?? {},
    updatedAt: plan?.updatedAt.toISOString() ?? null,
    updatedBy: plan?.updatedBy ?? null,
    baseline: baseline ? {
      version: baseline.version,
      steps: baseline.steps,
      sourceRevision: baseline.sourceRevision,
      createdAt: baseline.createdAt.toISOString(),
      createdBy: baseline.createdBy,
    } : null,
  };
}

function noCache(res: import("express").Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

projectPlanningRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  noCache(res);
  res.json(await planningView(project.id));
});

/**
 * Écriture atomique par étape. Même si deux clients éditent deux étapes
 * différentes, la révision globale refuse d'écraser silencieusement l'autre.
 */
projectPlanningRouter.put("/steps/:stepNumber", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project || forbiddenReference(res, project)) return;
  const number = stepNumber(req.params["stepNumber"]);
  if (number === null) { res.status(404).json({ error: "not_found" }); return; }
  const parsed = stepSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }

  const { expectedRevision, startDate, endDate, responsible, nextAction } = parsed.data;
  const value: ProjectPlanningStep = { startDate, endDate, responsible, nextAction };
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(projectPlans).where(eq(projectPlans.projectId, project.id)).limit(1);
    if (!existing && expectedRevision !== 0) return false;
    if (existing && existing.revision !== expectedRevision) return false;
    const steps: ProjectPlanningSteps = { ...(existing?.steps ?? {}) };
    if (configured(value)) steps[String(number)] = value;
    else delete steps[String(number)];

    if (!existing) {
      const inserted = await tx.insert(projectPlans).values({
        projectId: project.id, steps, revision: 1, baselineVersion: 0, updatedAt: new Date(), updatedBy: req.user!.id,
      }).onConflictDoNothing().returning({ projectId: projectPlans.projectId });
      return inserted.length === 1;
    }
    const updated = await tx.update(projectPlans).set({
      steps, revision: expectedRevision + 1, updatedAt: new Date(), updatedBy: req.user!.id,
    }).where(and(eq(projectPlans.projectId, project.id), eq(projectPlans.revision, expectedRevision)))
      .returning({ projectId: projectPlans.projectId });
    return updated.length === 1;
  });
  noCache(res);
  if (!result) {
    res.status(409).json({ error: "planning_conflict", message: "Le planning a changé. Rechargez les valeurs avant de réappliquer votre saisie.", current: await planningView(project.id) });
    return;
  }
  res.json(await planningView(project.id));
});

/** Validation explicite : pas de référence tant que les 21 dates ne sont pas complètes. */
projectPlanningRouter.post("/baseline", async (req, res) => {
  const project = await projectOr404(req, res, "write");
  if (!project || forbiddenReference(res, project)) return;
  const parsed = versionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const { expectedRevision } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(projectPlans).where(eq(projectPlans.projectId, project.id)).limit(1);
    if (!plan || plan.revision !== expectedRevision) return { type: "conflict" as const };
    const missing = PARCOURS_STEPS.map((x) => x.number).filter((number) => {
      const step = plan.steps[String(number)];
      return !step || !step.startDate || !step.endDate || !isCivilDate(step.startDate) || !isCivilDate(step.endDate) || step.endDate < step.startDate;
    });
    if (missing.length) return { type: "incomplete" as const, missing };
    const nextVersion = plan.baselineVersion + 1;
    const updated = await tx.update(projectPlans).set({
      revision: plan.revision + 1, baselineVersion: nextVersion, updatedAt: new Date(), updatedBy: req.user!.id,
    }).where(and(eq(projectPlans.projectId, project.id), eq(projectPlans.revision, expectedRevision)))
      .returning({ projectId: projectPlans.projectId });
    if (updated.length !== 1) return { type: "conflict" as const };
    // The insert and revision bump commit together; old baselines are never rewritten.
    await tx.insert(projectPlanBaselines).values({
      projectId: project.id, version: nextVersion, steps: plan.steps,
      sourceRevision: expectedRevision, createdAt: new Date(), createdBy: req.user!.id,
    });
    return { type: "ok" as const };
  });
  noCache(res);
  if (result.type === "conflict") {
    res.status(409).json({ error: "planning_conflict", message: "Le planning a changé. Rechargez-le pour valider sa nouvelle version.", current: await planningView(project.id) });
    return;
  }
  if (result.type === "incomplete") {
    res.status(422).json({ error: "incomplete_baseline", message: "Les 21 étapes doivent posséder une date de début et de fin avant validation.", missing: result.missing });
    return;
  }
  res.json(await planningView(project.id));
});

/** Journal des références : les versions précédentes restent consultables. */
projectPlanningRouter.get("/baselines", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const baselines = await db.select().from(projectPlanBaselines).where(eq(projectPlanBaselines.projectId, project.id)).orderBy(asc(projectPlanBaselines.version));
  noCache(res);
  res.json(baselines.map((b) => ({ version: b.version, sourceRevision: b.sourceRevision, createdAt: b.createdAt.toISOString(), createdBy: b.createdBy })));
});

projectPlanningRouter.get("/baselines/:version", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const version = Number(req.params["version"]);
  if (!Number.isSafeInteger(version) || version < 1) { res.status(404).json({ error: "not_found" }); return; }
  const [baseline] = await db.select().from(projectPlanBaselines).where(and(eq(projectPlanBaselines.projectId, project.id), eq(projectPlanBaselines.version, version))).limit(1);
  if (!baseline) { res.status(404).json({ error: "not_found" }); return; }
  noCache(res);
  res.json({ version: baseline.version, sourceRevision: baseline.sourceRevision, steps: baseline.steps, createdAt: baseline.createdAt.toISOString(), createdBy: baseline.createdBy });
});
