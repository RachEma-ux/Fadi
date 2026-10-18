/** Module Studio autonome : aucun rattachement à une étape Parcours ou au modèle Atelier. */
import { Router, json, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";
import { createStudioStudy, createStudioVariant, listStudioRevisions, listStudioStudies, listStudioVariants, readStudioContext, readStudioStudy, StudioRequestError, submitStudioCommands, type StudioScope } from "../lib/studio-commands.js";

export const studioRouter = Router({ mergeParams: true });
studioRouter.use(requireAuth);
studioRouter.use(json({ limit: "1mb" }));
const studySchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
const variantSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
function scope(req: Request): StudioScope {
  const params = req.params as Record<string, string>;
  return { projectId: params["projectId"] ?? "", studyId: params["studyId"] ?? "", variantId: params["variantId"] ?? "" };
}
function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof StudioRequestError) res.status(error.status).json(error.body);
      else next(error);
    }
  };
}
studioRouter.get("/studies", endpoint(async (req, res) => {
  res.json(await listStudioStudies(scope(req).projectId, req.user!.id));
}));
studioRouter.post("/studies", endpoint(async (req, res) => {
  const parsed = studySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  res.status(201).json(await createStudioStudy(scope(req).projectId, req.user!.id, parsed.data.name));
}));
studioRouter.get("/studies/:studyId", endpoint(async (req, res) => {
  const s = scope(req);
  res.json(await readStudioStudy(db, s.projectId, s.studyId, req.user!.id));
}));
studioRouter.get("/studies/:studyId/variants", endpoint(async (req, res) => {
  const s = scope(req);
  res.json(await listStudioVariants(db, s.projectId, s.studyId, req.user!.id));
}));
studioRouter.post("/studies/:studyId/variants", endpoint(async (req, res) => {
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.status(201).json(await createStudioVariant(s.projectId, s.studyId, req.user!.id, parsed.data.name));
}));
studioRouter.get("/studies/:studyId/variants/:variantId/revisions", endpoint(async (req, res) => {
  res.json(await listStudioRevisions(db, scope(req), req.user!.id));
}));
studioRouter.get("/studies/:studyId/variants/:variantId", endpoint(async (req, res) => {
  res.json(await readStudioContext(db, scope(req), req.user!.id));
}));
studioRouter.get("/studies/:studyId/variants/:variantId/revisions/:revisionId", endpoint(async (req, res) => {
  res.json(await readStudioContext(db, scope(req), req.user!.id, req.params["revisionId"] as string));
}));
studioRouter.post("/studies/:studyId/variants/:variantId/commands", endpoint(async (req, res) => {
  res.json(await submitStudioCommands(scope(req), req.user!.id, req.body));
}));
