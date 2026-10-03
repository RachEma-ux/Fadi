/**
 * Module Projets et sources — « Sources de l'étape » : les fichiers rattachés
 * à une étape d'un projet (`FILE_DB` / IndexedDB du prototype : import,
 * liste, téléchargement, suppression), ici stockés par le serveur et
 * propriété du projet. Monté sous `/projects/:projectId/steps/:stepNumber/files`.
 *
 *   GET    /            → [{ id, name, type, size, addedAt }] (ordre d'ajout)
 *   POST   /            corps brut (octets) + en-têtes X-File-Name / X-File-Type → 201 { file }
 *   GET    /:fileId     → le contenu, toujours en pièce jointe (jamais rendu dans la page)
 *   DELETE /:fileId     → 204
 *
 * Le type déclaré par le navigateur est conservé pour l'affichage ; le
 * fichier est servi `Content-Disposition: attachment` avec `nosniff`, quel
 * que soit son type, pour qu'une pièce HTML ou SVG déposée ne s'exécute
 * jamais dans l'origine de Fadi.
 */
import { Router, raw, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { projects, stepFiles } from "../db/schema.js";
import { requireAuth } from "../middleware/require-auth.js";
import { projectOr404, type ProjectNeed } from "../lib/owned-project.js";
import { parcoursStepDefinition } from "../data/parcours.js";

export const stepFilesRouter = Router({ mergeParams: true });
stepFilesRouter.use(requireAuth);

/** Taille maximale d'une pièce (PDF, DOCX, XLSX, images, KML/KMZ, JSON…). */
export const STEP_FILE_LIMIT = 25 * 1024 * 1024;
const FILE_ID = /^[a-f0-9-]{36}$/;

const params = (req: Request) => req.params as Record<string, string>;

/** Le projet (404 sans accès, 403 si le rôle ne suffit pas — déjà répondu) et l'étape ; `null` quand la réponse est partie ou l'étape inconnue. */
async function ownedStep(req: Request, res: Response, need: ProjectNeed): Promise<{ projectId: string; stepNumber: number } | null> {
  const project = await projectOr404(req, res, need);
  if (!project) return null;
  const stepNumber = Number(params(req)["stepNumber"]);
  if (!Number.isInteger(stepNumber) || !parcoursStepDefinition(stepNumber)) {
    res.status(404).json({ error: "not_found" });
    return null;
  }
  return { projectId: project.id, stepNumber };
}

function metadata(row: { id: string; name: string; type: string; size: number; addedAt: Date }) {
  return { id: row.id, name: row.name, type: row.type, size: row.size, addedAt: row.addedAt.toISOString() };
}

/** Nom de fichier tel que le navigateur l'a transmis (encodé en URI dans l'en-tête), borné et sans séparateur de chemin. */
function fileNameOf(req: Request): string | null {
  const header = req.get("x-file-name");
  if (!header) return null;
  let name: string;
  try {
    name = decodeURIComponent(header);
  } catch {
    return null;
  }
  name = name.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return name.length >= 1 && name.length <= 255 ? name : null;
}

stepFilesRouter.get("/", async (req, res) => {
  const scope = await ownedStep(req, res, "read");
  if (!scope) return;
  const rows = await db
    .select({ id: stepFiles.id, name: stepFiles.name, type: stepFiles.type, size: stepFiles.size, addedAt: stepFiles.addedAt })
    .from(stepFiles)
    .where(and(eq(stepFiles.projectId, scope.projectId), eq(stepFiles.stepNumber, scope.stepNumber)))
    .orderBy(asc(stepFiles.addedAt), asc(stepFiles.id));
  res.json(rows.map(metadata));
});

stepFilesRouter.post("/", raw({ type: () => true, limit: STEP_FILE_LIMIT }), async (req, res) => {
  const scope = await ownedStep(req, res, "write");
  if (!scope) return;
  const name = fileNameOf(req);
  if (!name) {
    res.status(400).json({ error: "invalid_input", details: { name: "Nom de fichier requis (en-tête X-File-Name)" } });
    return;
  }
  const content = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (content.length === 0) {
    res.status(400).json({ error: "invalid_input", details: { content: "Fichier vide" } });
    return;
  }
  const type = (req.get("x-file-type") ?? "").slice(0, 120) || "application/octet-stream";
  const row = { id: randomUUID(), projectId: scope.projectId, stepNumber: scope.stepNumber, name, type, size: content.length, content, addedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx.insert(stepFiles).values(row);
    await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, scope.projectId));
  });
  res.status(201).json({ file: metadata(row) });
});

stepFilesRouter.get("/:fileId", async (req, res) => {
  const scope = await ownedStep(req, res, "read");
  if (!scope) return;
  const id = params(req)["fileId"] ?? "";
  if (!FILE_ID.test(id)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const row = (await db.select().from(stepFiles).where(and(eq(stepFiles.id, id), eq(stepFiles.projectId, scope.projectId), eq(stepFiles.stepNumber, scope.stepNumber))).limit(1))[0];
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  res.setHeader("Content-Type", /^(image|audio|video|application\/pdf|text\/plain)/.test(row.type) ? row.type : "application/octet-stream");
  res.setHeader("Content-Length", String(row.size));
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(row.content);
});

stepFilesRouter.delete("/:fileId", async (req, res) => {
  const scope = await ownedStep(req, res, "write");
  if (!scope) return;
  const id = params(req)["fileId"] ?? "";
  if (!FILE_ID.test(id)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const deleted = await db
    .delete(stepFiles)
    .where(and(eq(stepFiles.id, id), eq(stepFiles.projectId, scope.projectId), eq(stepFiles.stepNumber, scope.stepNumber)))
    .returning({ id: stepFiles.id });
  if (!deleted.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, scope.projectId));
  res.status(204).end();
});

/**
 * Vue d'ensemble du module Projets et sources : toutes les pièces du projet,
 * par étape. Monté sous `/projects/:projectId/files`.
 */
export const projectFilesRouter = Router({ mergeParams: true });
projectFilesRouter.use(requireAuth);
projectFilesRouter.get("/", async (req, res) => {
  const project = await projectOr404(req, res, "read");
  if (!project) return;
  const rows = await db
    .select({ id: stepFiles.id, stepNumber: stepFiles.stepNumber, name: stepFiles.name, type: stepFiles.type, size: stepFiles.size, addedAt: stepFiles.addedAt })
    .from(stepFiles)
    .where(eq(stepFiles.projectId, project.id))
    .orderBy(asc(stepFiles.stepNumber), asc(stepFiles.addedAt), asc(stepFiles.id));
  res.json(rows.map((r) => ({ ...metadata(r), stepNumber: r.stepNumber })));
});
