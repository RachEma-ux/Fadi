import express, { Router, type ErrorRequestHandler, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { ARCHIVE_IMPORT_LIMIT, ArchiveError, archiveFileName, normalizeImportedProjects } from "@parcours/domain-model";
import { db } from "../db/client.js";
import { projectMembers, projects, projectSteps, stepFiles, users } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { newId } from "../lib/ids.js";
import { EMPTY_STEP_CONTENT, PARCOURS_STEPS, exampleBaseDocuments } from "../data/parcours.js";
import { activeLock, projectOr404 } from "../lib/owned-project.js";
import { APPLICATION_VERSION, ArchiveModeleError, SOURCE_VERSION, exportProjectArchive, importProjectArchive } from "../lib/project-archive.js";
import { parcoursStepsRouter } from "./parcours-steps.js";
import { programmeRouter } from "./programme.js";
import { atelierCommandsRouter } from "./atelier-commands.js";
import { parcelsRouter } from "./parcels.js";
import { projectFilesRouter } from "./step-files.js";
import { designReviewRouter } from "./design-review.js";
import { analysesRouter } from "./analyses.js";
import { documentsRouter } from "./documents.js";
import { collaborationRouter } from "./collaboration.js";
import { membersRouter, ownerEmailOf } from "./members.js";
import { lockRouter } from "./lock.js";
import { archiveHash, recordProducedDocument } from "../lib/documents.js";
import { loadStepContext } from "../lib/step-context.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const codePattern = /^[A-Za-z0-9._-]{1,64}$/;

const createProjectSchema = z.object({
  code: z.string().regex(codePattern, "Code projet invalide"),
  name: z.string().trim().min(1).max(200),
});

/**
 * « Documents de base intégrés » (vue d'ensemble du projet d'exemple dans le prototype) : les fichiers de l'exemple
 * retrouvés parmi les sources des étapes du projet (nom, étape et taille identiques), avec leur téléchargement.
 */
async function baseDocumentsOf(project: { id: string; sourceExampleId: string | null }): Promise<{ caption: string; files: { id: string; stepNumber: number; name: string; type: string; size: number; note: string }[] } | null> {
  const base = exampleBaseDocuments(project.sourceExampleId);
  if (!base) return null;
  const rows = await db
    .select({ id: stepFiles.id, stepNumber: stepFiles.stepNumber, name: stepFiles.name, type: stepFiles.type, size: stepFiles.size })
    .from(stepFiles)
    .where(eq(stepFiles.projectId, project.id));
  const files = base.files.flatMap((doc) => {
    const row = rows.find((r) => r.stepNumber === doc.stepNumber && r.name === doc.name && r.size === doc.size);
    return row ? [{ ...row, note: doc.note }] : [];
  });
  return files.length ? { caption: base.caption, files } : null;
}

/** Vos projets, puis ceux qui vous sont partagés (avec votre rôle et l'adresse du propriétaire). */
projectsRouter.get("/", async (req, res) => {
  const owned = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, req.user!.id))
    .orderBy(asc(projects.createdAt));
  const shared = await db
    .select({ project: projects, role: projectMembers.role, ownerEmail: users.email })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(eq(projectMembers.userId, req.user!.id))
    .orderBy(asc(projects.createdAt));
  res.json([
    ...owned.map((p) => ({ ...p, editingLock: activeLock(p), role: "proprietaire" as const, ownerEmail: req.user!.email })),
    ...shared.map((r) => ({ ...r.project, editingLock: activeLock(r.project), role: r.role, ownerEmail: r.ownerEmail })),
  ]);
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

// --- Archive de projet : « Importer projet JSON » / « Sauvegarder projet JSON »

const archiveBody = express.json({ limit: ARCHIVE_IMPORT_LIMIT, type: () => true });
const archiveBodyError: ErrorRequestHandler = (err, _req, res, next) => {
  const e = err as { type?: string; status?: number } | null;
  if (e?.type === "entity.too.large") {
    res.status(413).json({ error: "archive_rule", message: "Le fichier dépasse 32 Mo." });
    return;
  }
  if (e?.type === "entity.parse.failed" || e?.status === 400) {
    res.status(422).json({ error: "archive_rule", message: "Format attendu : export Parcours V6 / V7 ou base projets V5." });
    return;
  }
  next(err);
};

/**
 * `importBundle` : une archive Fadi, un export Parcours V6 / V7 (`workflow`,
 * `native`, `stageAttachments`) ou une base projets V5 → un ou plusieurs
 * NOUVEAUX projets de l'utilisateur ; les projets existants sont conservés.
 * Refus avec les messages du prototype (422), fichier > 32 Mo (413).
 */
projectsRouter.post("/import", archiveBody, archiveBodyError, async (req: Request, res: Response) => {
  const now = new Date().toISOString();
  try {
    const imports = normalizeImportedProjects(req.body, PARCOURS_STEPS, { now, applicationVersion: APPLICATION_VERSION, sourceVersion: SOURCE_VERSION });
    const created = await db.transaction(async (tx) => {
      const out = [];
      for (const { origin, archive } of imports) {
        const r = await importProjectArchive(tx, req.user!.id, archive, now);
        out.push({ id: r.project.id, code: r.project.code, name: r.project.name, origin, warnings: r.warnings });
      }
      return out;
    });
    res.status(201).json({ projects: created });
  } catch (err) {
    if (err instanceof ArchiveError) {
      res.status(422).json({ error: "archive_rule", message: err.message });
      return;
    }
    if (err instanceof ArchiveModeleError) {
      res.status(422).json({ error: "archive_model", message: err.message, details: err.erreurs.slice(0, 50) });
      return;
    }
    throw err;
  }
});

/** `backup()` : tout le projet en un JSON téléchargeable (`Parcours_V7_<nom>.json`). */
projectsRouter.get("/:projectId/archive", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const now = new Date();
  const archive = await exportProjectArchive(db, project, now.toISOString());
  await recordProducedDocument(db, project.id, { kind: "archive-projet", label: "Sauvegarde du projet (JSON)", fileName: archiveFileName(project.name), modelRevision: project.modelRevision, inputHash: archiveHash(project, await loadStepContext(db, project)), stepNumber: null }, now);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${archiveFileName(project.name)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(JSON.stringify(archive, null, 2));
});

const copySchema = z.object({ name: z.string().trim().min(1).max(200).optional() });

/**
 * `copy()` de p118-resolved-app : « Essayer une autre répartition en copie »
 * — un NOUVEAU projet modifiable, copie intégrale du dossier (étapes et
 * choix Harmonie, programme et son historique, parcelles, modèle natif,
 * pièces jointes, dossier Harmony), empreintes de péremption reposées. La
 * référence reste intacte ; la provenance (`sourceExampleId`) est conservée.
 */
projectsRouter.post("/:projectId/copies", async (req, res) => {
  // Lire suffit : la copie devient un nouveau projet de l'utilisateur (comme exporter puis importer l'archive), l'original n'est pas touché.
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const parsed = copySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const now = new Date().toISOString();
  // Le prototype nomme la copie « P.118 — ma variante de l’exemple résolu » ; l'application affiche « code — nom », le code n'est donc pas répété.
  const name = parsed.data.name ?? (project.exampleMode === "reference" ? "ma variante de l’exemple résolu" : `${project.name} — copie`);
  const created = await db.transaction(async (tx) => {
    const archive = await exportProjectArchive(tx, project, now);
    return importProjectArchive(tx, req.user!.id, { ...archive, project: { ...archive.project, name, exampleMode: project.exampleMode ? "editable" : null } }, now);
  });
  res.status(201).json({ id: created.project.id, code: created.project.code, name: created.project.name, warnings: created.warnings });
});

// --- Étapes du Parcours (module Parcours) et répartition (module Programmation)
projectsRouter.use("/:projectId/steps", parcoursStepsRouter);
projectsRouter.use("/:projectId/programme", programmeRouter);
projectsRouter.use("/:projectId/atelier", atelierCommandsRouter);
projectsRouter.use("/:projectId/parcels", parcelsRouter);
projectsRouter.use("/:projectId/files", projectFilesRouter);
projectsRouter.use("/:projectId/design-review", designReviewRouter);
projectsRouter.use("/:projectId/analyses", analysesRouter);
projectsRouter.use("/:projectId/documents", documentsRouter);
projectsRouter.use("/:projectId/collaboration", collaborationRouter);
projectsRouter.use("/:projectId/members", membersRouter);
projectsRouter.use("/:projectId/lock", lockRouter);

projectsRouter.get("/:projectId", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  // Le verrou n'est renvoyé que s'il est encore valable ; `editingLock` brut n'est jamais exposé.
  res.json({
    ...project,
    editingLock: activeLock(project),
    ownerEmail: project.ownerId === req.user!.id ? req.user!.email : await ownerEmailOf(project.ownerId),
    baseDocuments: await baseDocumentsOf(project),
  });
});

projectsRouter.delete("/:projectId", async (req, res) => {
  const project = await projectOr404(req, res, "owner");
  if (!project) return;
  await db.delete(projects).where(eq(projects.id, project.id));
  res.status(204).end();
});
