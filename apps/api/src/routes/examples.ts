import { Router } from "express";
import { db } from "../db/client.js";
import { projects, projectSteps } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import {
  PARCOURS_STEPS,
  exampleAttachment,
  exampleRegistryName,
  exampleStepContents,
  listParcoursExamples,
} from "../data/parcours.js";

export const examplesRouter = Router();
examplesRouter.use(requireAuth);

/**
 * Bibliothèque d'exemples : des projets-sources extraits d'un prototype
 * antérieur (voir apps/api/src/data), pas des données inventées pour la
 * démonstration. `GET` liste ce qui est importable ; `POST .../import`
 * copie l'exemple dans un nouveau projet appartenant à l'utilisateur —
 * une copie, jamais une référence partagée, pour que l'utilisateur puisse
 * ensuite la modifier librement sans affecter l'exemple d'origine.
 */
examplesRouter.get("/", (_req, res) => {
  res.json(listParcoursExamples());
});

examplesRouter.post("/:exampleId/import", async (req, res) => {
  const exampleId = req.params.exampleId as string;
  const registry = exampleRegistryName(exampleId);
  const contents = exampleStepContents(exampleId);
  if (!registry || !contents) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const id = newId("proj");
  const created = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        id,
        ownerId: req.user!.id,
        code: registry.code,
        name: registry.name,
        sourceExampleId: exampleId,
        sourceAttachment: exampleAttachment(exampleId) ?? null,
      })
      .returning();
    if (!project) throw new Error("project insert returned nothing");
    await tx.insert(projectSteps).values(
      PARCOURS_STEPS.map((def) => {
        const content = contents[def.number]!;
        return { projectId: id, stepNumber: def.number, status: content.status, content: { ...content } };
      }),
    );
    return project;
  });

  res.status(201).json(created);
});
