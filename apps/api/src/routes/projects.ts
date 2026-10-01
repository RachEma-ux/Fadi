import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { architecturalObjects, levels, projects, projectSteps } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { EMPTY_STEP_CONTENT, PARCOURS_STEPS } from "../data/parcours.js";
import { loadOwnedProject } from "../lib/owned-project.js";
import { parcoursStepsRouter } from "./parcours-steps.js";
import { programmeRouter } from "./programme.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const codePattern = /^[A-Za-z0-9._-]{1,64}$/;

const createProjectSchema = z.object({
  code: z.string().regex(codePattern, "Code projet invalide"),
  name: z.string().trim().min(1).max(200),
});

projectsRouter.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, req.user!.id))
    .orderBy(asc(projects.createdAt));
  res.json(rows);
});

projectsRouter.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const id = newId("proj");
  const created = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ id, ownerId: req.user!.id, code: parsed.data.code, name: parsed.data.name })
      .returning();
    if (!project) throw new Error("project insert returned nothing");
    // Chaque projet, même vide, porte les 21 vraies étapes du Parcours dès
    // sa création — jamais un placeholder générique côté frontend
    // (AGENTS.md : « Preserve the authoritative Parcours workflow »).
    await tx.insert(projectSteps).values(
      PARCOURS_STEPS.map((def) => ({
        projectId: id,
        stepNumber: def.number,
        status: EMPTY_STEP_CONTENT.status,
        content: { ...EMPTY_STEP_CONTENT },
      })),
    );
    return project;
  });
  res.status(201).json(created);
});

// --- Étapes du Parcours (module Parcours) et répartition (module Programmation)
projectsRouter.use("/:projectId/steps", parcoursStepsRouter);
projectsRouter.use("/:projectId/programme", programmeRouter);

projectsRouter.get("/:projectId", async (req, res) => {
  const project = await loadOwnedProject(req.params.projectId as string, req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(project);
});

projectsRouter.delete("/:projectId", async (req, res) => {
  const project = await loadOwnedProject(req.params.projectId as string, req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await db.delete(projects).where(eq(projects.id, project.id));
  res.status(204).end();
});

// --- Niveaux -----------------------------------------------------------

const createLevelSchema = z.object({
  label: z.string().trim().min(1).max(100),
  // Pas `.int()` : une élévation réelle (ex. modèle P.118) est décimale ;
  // voir la justification dans db/schema.ts sur `levels.elevation`.
  elevation: z.number().min(-50).max(500).default(0),
  position: z.number().int().min(0).max(1000).default(0),
});

projectsRouter.get("/:projectId/levels", async (req, res) => {
  const project = await loadOwnedProject(req.params.projectId as string, req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rows = await db.select().from(levels).where(eq(levels.projectId, project.id)).orderBy(asc(levels.position));
  res.json(rows);
});

projectsRouter.post("/:projectId/levels", async (req, res) => {
  const project = await loadOwnedProject(req.params.projectId as string, req.user!.id);
  if (!project) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const parsed = createLevelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const id = newId("level");
  const [created] = await db
    .insert(levels)
    .values({ id, projectId: project.id, ...parsed.data })
    .returning();
  res.status(201).json(created);
});

// --- Objets architecturaux ----------------------------------------------

const relationSchema = z.object({ kind: z.string().min(1).max(64), targetId: z.string().min(1).max(128) });

const createObjectSchema = z.object({
  kind: z.string().trim().min(1).max(64),
  properties: z.record(z.string(), z.unknown()).default({}),
  relations: z.array(relationSchema).default([]),
});

async function loadOwnedLevel(projectId: string, levelId: string, ownerId: string) {
  const project = await loadOwnedProject(projectId, ownerId);
  if (!project) return null;
  const rows = await db
    .select()
    .from(levels)
    .where(and(eq(levels.id, levelId), eq(levels.projectId, project.id)))
    .limit(1);
  const level = rows[0];
  return level ? { project, level } : null;
}

projectsRouter.get("/:projectId/levels/:levelId/objects", async (req, res) => {
  const found = await loadOwnedLevel(req.params.projectId as string, req.params.levelId as string, req.user!.id);
  if (!found) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rows = await db
    .select()
    .from(architecturalObjects)
    .where(eq(architecturalObjects.levelId, found.level.id));
  res.json(rows);
});

/**
 * Crée un objet architectural ET avance la révision du projet d'une unité,
 * dans la même transaction. C'est la mécanique minimale qui rend
 * `CalculatedResult.modelRevision` et `ProducedDocument.modelRevision`
 * (packages/domain-model) vérifiables plus tard : un résultat sait avec
 * quelle révision il est cohérent parce que la révision avance atomiquement
 * avec chaque commande qui touche le modèle.
 */
projectsRouter.post("/:projectId/levels/:levelId/objects", async (req, res) => {
  const found = await loadOwnedLevel(req.params.projectId as string, req.params.levelId as string, req.user!.id);
  if (!found) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const parsed = createObjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [updatedProject] = await tx
      .update(projects)
      .set({ modelRevision: found.project.modelRevision + 1, updatedAt: new Date() })
      .where(eq(projects.id, found.project.id))
      .returning({ modelRevision: projects.modelRevision });
    const nextRevision = updatedProject?.modelRevision ?? found.project.modelRevision + 1;
    const id = newId("obj");
    const [object] = await tx
      .insert(architecturalObjects)
      .values({
        id,
        levelId: found.level.id,
        kind: parsed.data.kind,
        properties: parsed.data.properties,
        relations: parsed.data.relations,
        modelRevision: nextRevision,
      })
      .returning();
    return object;
  });

  res.status(201).json(created);
});

projectsRouter.delete("/:projectId/levels/:levelId/objects/:objectId", async (req, res) => {
  const found = await loadOwnedLevel(req.params.projectId as string, req.params.levelId as string, req.user!.id);
  if (!found) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const objectId = req.params.objectId as string;
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(architecturalObjects)
      .where(and(eq(architecturalObjects.id, objectId), eq(architecturalObjects.levelId, found.level.id)))
      .returning({ id: architecturalObjects.id });
    if (deleted.length > 0) {
      await tx
        .update(projects)
        .set({ modelRevision: found.project.modelRevision + 1, updatedAt: new Date() })
        .where(eq(projects.id, found.project.id));
    }
  });
  res.status(204).end();
});
