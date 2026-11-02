/**
 * Fusion de variantes (lot W3-D, X.1-06) : aperçu, application et annulation d'une fusion à trois voies d'une variante
 * source dans la variante de l'adresse (cible). Montées dans `studioRouter` (`/projects/:projectId/studio`,
 * authentification exigée en amont). Règles et refus : `lib/studio-fusion.ts`.
 *
 *   POST /studies/:studyId/variants/:variantId/fusion/apercu       aperçu (lecture : `read`), rien n'est écrit
 *   POST /studies/:studyId/variants/:variantId/fusion              application (`modify` sur la cible) : révision `variant-merge`
 *   POST /studies/:studyId/variants/:variantId/fusion/annulation   annulation de la fusion de tête : révision `variant-merge-undo`
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { annulerFusionStudio, apercuFusionStudio, appliquerFusionStudio } from "../lib/studio-fusion.js";
import { StudioRequestError, type StudioScope } from "../lib/studio-commands.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_FUSION_ANNULER, CONTRAT_FUSION_APERCU, CONTRAT_FUSION_APPLIQUER } from "../lib/studio-contrats-routes.js";

export const studioFusionRouter = Router({ mergeParams: true });

function scope(req: Request): StudioScope {
  const params = req.params as Record<string, string>;
  return { projectId: params["projectId"] ?? "", studyId: params["studyId"] ?? "", variantId: params["variantId"] ?? "" };
}
function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof StudioRequestError) {
        if (error.status === 429 && typeof error.body["retryAfterSeconds"] === "number") res.setHeader("Retry-After", String(error.body["retryAfterSeconds"]));
        res.status(error.status).json(error.body);
      } else next(error);
    }
  };
}
const variante = "/studies/:studyId/variants/:variantId";

studioFusionRouter.post(`${variante}/fusion/apercu`, avecContrat(CONTRAT_FUSION_APERCU), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await apercuFusionStudio(scope(req), req.user!.id, req.body));
}));
studioFusionRouter.post(`${variante}/fusion`, avecContrat(CONTRAT_FUSION_APPLIQUER), endpoint(async (req, res) => {
  const r = await appliquerFusionStudio(scope(req), req.user!.id, req.body);
  res.setHeader("Idempotent-Replayed", String(r.replayed));
  res.json(r);
}));
studioFusionRouter.post(`${variante}/fusion/annulation`, avecContrat(CONTRAT_FUSION_ANNULER), endpoint(async (req, res) => {
  const r = await annulerFusionStudio(scope(req), req.user!.id, req.body);
  res.setHeader("Idempotent-Replayed", String(r.replayed));
  res.json(r);
}));
