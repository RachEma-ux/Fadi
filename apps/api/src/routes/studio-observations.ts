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
 *   GET  …/observations/rapprochements                          rapprochements consignés avec les révisions ultérieures (EX-086)
 *   POST …/observations/rapprochements                          rapprochement sur demande (propriétaire, éditeur) ; il est aussi
 *                                                              fait à chaque contrôle d'exigences enregistré (routes/studio-exigences.ts)
 *   GET  …/observations/bcf                                     export BCF 2.1 minimal (.bcfzip) des observations lisibles (IF-010, lot PUB)
 *   POST …/observations/bcf                                     import BCF : sujets nouveaux dans leur contexte seulement (200)
 *   GET  …/observations/:observationId/pieces/:sha256           pièce justificative (contenu vérifié par empreinte)
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
import { listStudioRapprochements, rapprocherSurDemande, studioRapprochementSchema } from "../lib/studio-observations-rapprochement.js";
import { exporterObservationsBcf, importerObservationsBcf, lirePieceObservation, studioBcfImportSchema } from "../lib/studio-observations-bcf.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_OBSERVATIONS_LISTER, CONTRAT_OBSERVATION_CREER, CONTRAT_RAPPROCHEMENTS_LISTER, CONTRAT_RAPPROCHEMENT_DEMANDER, CONTRAT_OBSERVATION_LIRE, CONTRAT_OBSERVATION_TRANSITION, CONTRAT_OBSERVATION_LIER, CONTRAT_OBSERVATION_TACHE_CREER, CONTRAT_OBSERVATION_TACHE_TRANSITION, CONTRAT_OBSERVATION_DECISION } from "../lib/studio-contrats-routes.js";

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

studioObservationsRouter.get(base, avecContrat(CONTRAT_OBSERVATIONS_LISTER), endpoint(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const filtre = { ...(typeof q["domaine"] === "string" ? { domaine: q["domaine"] } : {}), ...(typeof q["ref"] === "string" ? { ref: q["ref"] } : {}) };
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioObservations(scope(req), req.user!.id, filtre));
}));
studioObservationsRouter.post(base, avecContrat(CONTRAT_OBSERVATION_CREER), endpoint(async (req, res) => {
  const input = corps(studioObservationOuvertureSchema, req, res);
  if (input) repondre(res, 201, await openStudioObservation(scope(req), req.user!.id, input));
}));
// Rapprochement avec une nouvelle révision (EX-086) : déclarés avant `/:observationId`, qui les prendrait sinon.
studioObservationsRouter.get(`${base}/rapprochements`, avecContrat(CONTRAT_RAPPROCHEMENTS_LISTER), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioRapprochements(scope(req), req.user!.id));
}));
studioObservationsRouter.post(`${base}/rapprochements`, avecContrat(CONTRAT_RAPPROCHEMENT_DEMANDER), endpoint(async (req, res) => {
  const input = corps(studioRapprochementSchema, req, res);
  if (input) res.status(200).json(await rapprocherSurDemande(scope(req), req.user!.id, input));
}));
// Échange BCF (IF-010) : déclaré avant `/:observationId`, qui le prendrait sinon.
studioObservationsRouter.get(`${base}/bcf`, endpoint(async (req, res) => {
  const out = await exporterObservationsBcf(scope(req), req.user!.id);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${out.fileName}"`);
  res.setHeader("X-Studio-Bcf-Topics", String(out.sujets));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(out.body);
}));
studioObservationsRouter.post(`${base}/bcf`, endpoint(async (req, res) => {
  const input = corps(studioBcfImportSchema, req, res);
  if (input) res.status(200).json(await importerObservationsBcf(scope(req), req.user!.id, input));
}));
studioObservationsRouter.get(`${base}/:observationId/pieces/:sha256`, endpoint(async (req, res) => {
  const p = await lirePieceObservation(scope(req), req.user!.id, param(req, "observationId"), param(req, "sha256"));
  res.setHeader("Content-Type", p.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${p.name}"`);
  res.setHeader("X-Content-SHA256", p.sha256);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(p.body);
}));
studioObservationsRouter.get(`${base}/:observationId`, avecContrat(CONTRAT_OBSERVATION_LIRE), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await getStudioObservation(scope(req), req.user!.id, param(req, "observationId")));
}));
studioObservationsRouter.post(`${base}/:observationId/transitions`, avecContrat(CONTRAT_OBSERVATION_TRANSITION), endpoint(async (req, res) => {
  const input = corps(studioObservationTransitionSchema, req, res);
  if (input) repondre(res, 200, await transitionStudioObservation(scope(req), req.user!.id, param(req, "observationId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/liens`, avecContrat(CONTRAT_OBSERVATION_LIER), endpoint(async (req, res) => {
  const input = corps(studioObservationLienAjoutSchema, req, res);
  if (input) repondre(res, 201, await addStudioObservationLink(scope(req), req.user!.id, param(req, "observationId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/taches`, avecContrat(CONTRAT_OBSERVATION_TACHE_CREER), endpoint(async (req, res) => {
  const input = corps(studioObservationTacheSchema, req, res);
  if (input) repondre(res, 201, await createStudioObservationTask(scope(req), req.user!.id, param(req, "observationId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/taches/:taskId/transitions`, avecContrat(CONTRAT_OBSERVATION_TACHE_TRANSITION), endpoint(async (req, res) => {
  const input = corps(studioObservationTacheTransitionSchema, req, res);
  if (input) repondre(res, 200, await transitionStudioObservationTask(scope(req), req.user!.id, param(req, "observationId"), param(req, "taskId"), input));
}));
studioObservationsRouter.post(`${base}/:observationId/decisions`, avecContrat(CONTRAT_OBSERVATION_DECISION), endpoint(async (req, res) => {
  const input = corps(studioObservationDecisionSchema, req, res);
  if (input) repondre(res, 201, await recordStudioObservationDecision(scope(req), req.user!.id, param(req, "observationId"), input));
}));
