/**
 * Observations Studio (E.2-01 à E.2-05) — monté depuis `routes/studio.ts` (sous `/projects/:projectId/studio`,
 * authentification et analyse JSON déjà posées). Règles pures : `lib/studio-observations.ts` ; écritures :
 * `lib/studio-observations-suivi.ts` ; vue d'une observation et passages : `lib/studio-commentaires.ts`.
 *   GET  …/observations[?domaine=&ref=]                         observations de la variante (contexte, liens, tâches, décisions) ;
 *                                                              avec domaine + ref : celle qui suit cet élément (identité réemployée)
 *   POST …/observations                                         ouverture directe (201) : commentaire + observation + liens
 *   GET  …/observations/:observationId                          une observation
 *   POST …/observations/:observationId/transitions              passage (corriger, recontroler, cloturer, rouvrir, reattribuer)
 *   POST …/observations/:observationId/liens                    lien vers un domaine (201)
 *   POST …/observations/:observationId/taches                   tâche attribuée (201)
 *   POST …/observations/:observationId/taches/:taskId/transitions  passage d'une tâche (200)
 *   POST …/observations/:observationId/decisions                proposition (éditeur) ou décision (propriétaire), 201
 * Les passages restent aussi servis par `…/comments/:commentId/observation/transitions` (même fonction, même identité).
 * Toutes les écritures sont idempotentes par `requestId` (en-tête `Idempotent-Replayed`).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import type { z } from "zod";
import { StudioRequestError, type StudioScope } from "../lib/studio-commands.js";
import { studioObservationTransitionSchema, transitionStudioObservation } from "../lib/studio-commentaires.js";
import {
  addStudioObservationLink, createStudioObservationTask, getStudioObservation, listStudioObservations, openStudioObservation, recordStudioObservationDecision,
  studioObservationDecisionSchema, studioObservationLienAjoutSchema, studioObservationOuvertureSchema, studioObservationTacheSchema,
  studioObservationTacheTransitionSchema, transitionStudioObservationTask,
} from "../lib/studio-observations-suivi.js";

export const studioObservationsRouter = Router({ mergeParams: true });

const base = "/studies/:studyId/variants/:variantId/observations";

function scope(req: Request): StudioScope {
  const params = req.params as Record<string, string>;
  return { projectId: params["projectId"] ?? "", studyId: params["studyId"] ?? "", variantId: params["variantId"] ?? "" };
}
const param = (req: Request, key: string) => (req.params as Record<string, string>)[key] ?? "";

function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof StudioRequestError) res.status(error.status).json(error.body);
      else next(error);
    }
  };
}

/** Corps validé, sinon 400 et `null`. */
function corps<S extends z.ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return null; }
  return parsed.data as z.infer<S>;
}
function repondre(res: Response, status: number, body: { replayed: boolean }) {
  res.setHeader("Idempotent-Replayed", String(body.replayed));
  res.status(status).json(body);
}

studioObservationsRouter.get(base, endpoint(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const filtre = { ...(typeof q["domaine"] === "string" ? { domaine: q["domaine"] } : {}), ...(typeof q["ref"] === "string" ? { ref: q["ref"] } : {}) };
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioObservations(scope(req), req.user!.id, filtre));
}));
studioObservationsRouter.post(base, endpoint(async (req, res) => {
  const input = corps(studioObservationOuvertureSchema, req, res);
  if (input) repondre(res, 201, await openStudioObservation(scope(req), req.user!.id, input));
}));
studioObservationsRouter.get(`${base}/:observationId`, endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await getStudioObservation(scope(req), req.user!.id, param(req, "observationId")));
}));
studioObservationsRouter.post(`${base}/:observationId/transitions`, endpoint(async (req, res) => {
  const input = corps(studioObservationTransitionSchema, req, res);
  if (input) repondre(res, 200, await transitionStudioObservation(scope(req), req.user!.id, param(req, "observationId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/liens`, endpoint(async (req, res) => {
  const input = corps(studioObservationLienAjoutSchema, req, res);
  if (input) repondre(res, 201, await addStudioObservationLink(scope(req), req.user!.id, param(req, "observationId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/taches`, endpoint(async (req, res) => {
  const input = corps(studioObservationTacheSchema, req, res);
  if (input) repondre(res, 201, await createStudioObservationTask(scope(req), req.user!.id, param(req, "observationId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/taches/:taskId/transitions`, endpoint(async (req, res) => {
  const input = corps(studioObservationTacheTransitionSchema, req, res);
  if (input) repondre(res, 200, await transitionStudioObservationTask(scope(req), req.user!.id, param(req, "observationId"), param(req, "taskId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/decisions`, endpoint(async (req, res) => {
  const input = corps(studioObservationDecisionSchema, req, res);
  if (input) repondre(res, 201, await recordStudioObservationDecision(scope(req), req.user!.id, param(req, "observationId"), input));
}));
