/**
 * Illustrations d'une variante (lot F, décision P-12 ; `lib/studio-illustrations.ts`) : fournisseurs et leur
 * disponibilité, liste, création (rendu du modèle de la vue → image séparée), image archivée. Lecture : tout membre qui
 * lit la variante ; création : `modify` (et export pour un service externe). Le corps d'une création (image en base64)
 * est lu par `routes/studio.ts`, borné à 12 Mo pour cette adresse seulement. Contrats : `lib/studio-contrats-routes.ts`.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { StudioRequestError, type StudioScope } from "../lib/studio-commands.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_ILLUSTRATION_CREER, CONTRAT_ILLUSTRATION_IMAGE, CONTRAT_ILLUSTRATIONS_FOURNISSEURS, CONTRAT_ILLUSTRATIONS_LISTER } from "../lib/studio-contrats-routes.js";
import { creerIllustration, lireImageIllustration, listerFournisseursIllustration, listerIllustrations, studioIllustrationSchema } from "../lib/studio-illustrations.js";

export const studioIllustrationsRouter = Router({ mergeParams: true });
const base = "/studies/:studyId/variants/:variantId/illustrations";
const scope = (req: Request): StudioScope => {
  const p = req.params as Record<string, string>;
  return { projectId: p["projectId"] ?? "", studyId: p["studyId"] ?? "", variantId: p["variantId"] ?? "" };
};
const endpoint = (h: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await h(req, res); } catch (e) { if (e instanceof StudioRequestError) res.status(e.status).json(e.body); else next(e); }
};

studioIllustrationsRouter.get(`${base}/fournisseurs`, avecContrat(CONTRAT_ILLUSTRATIONS_FOURNISSEURS), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listerFournisseursIllustration(scope(req), req.user!.id));
}));
studioIllustrationsRouter.get(base, avecContrat(CONTRAT_ILLUSTRATIONS_LISTER), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listerIllustrations(scope(req), req.user!.id));
}));
studioIllustrationsRouter.post(base, avecContrat(CONTRAT_ILLUSTRATION_CREER), endpoint(async (req, res) => {
  const parsed = studioIllustrationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const r = await creerIllustration(scope(req), req.user!.id, parsed.data);
  res.setHeader("Idempotent-Replayed", String(r.replayed));
  res.status(201).json(r);
}));
/** Image archivée : PNG portant sa provenance (`fadi:illustration`) ; statut de vérification en en-tête. */
studioIllustrationsRouter.get(`${base}/:illustrationId/image`, avecContrat(CONTRAT_ILLUSTRATION_IMAGE), endpoint(async (req, res) => {
  const { png, ligne } = await lireImageIllustration(scope(req), req.user!.id, req.params["illustrationId"] as string);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `attachment; filename="illustration-${ligne.id.slice(-8)}.png"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Studio-Verification", "non-verifiee");
  res.setHeader("X-Studio-Source-Revision", ligne.revisionId);
  res.status(200).send(png);
}));
