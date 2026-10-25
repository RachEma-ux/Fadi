/**
 * Publications Studio — monté depuis `routes/studio.ts` (sous `/projects/:projectId/studio`, authentification et
 * analyse JSON déjà posées). Règles, droits et statuts : `lib/studio-publications.ts`.
 *   GET  /publications                                               paquets diffusés du projet (module Documents)
 *   GET  /studies/:studyId/publications                              publications de l'étude (tous statuts)
 *   POST /studies/:studyId/variants/:variantId/publications          nouvelle publication `travail` (201 ; rejeu par requestId)
 *   GET  /studies/:studyId/publications/:publicationId               détail et journal
 *   POST /studies/:studyId/publications/:publicationId/:action       soumettre | actualiser | approuver | refuser | diffuser | retirer
 *        (droits distincts : revue = propriétaire et éditeur ; approbation et publication = propriétaire ; lecteur = lecture)
 *   GET  /studies/:studyId/publications/:publicationId/files/:format fichier figé (svg | dxf | ifc | pdf)
 *   GET  /studies/:studyId/publications/:publicationId/verification  recalcul déterministe des empreintes du paquet
 *   GET  /studies/:studyId/publications/:publicationId/controle-approbation  aperçu de l'auto-contrôle (OP-6) pour
 *        l'utilisateur courant : { autoControle, revisionsAuteur, soumisParLui, autorise, approvers } ; droit `approve`
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { StudioRequestError } from "../lib/studio-commands.js";
import { clientIp } from "../lib/audit.js";
import {
  controleApprobationStudio, createStudioPublication, listProjectStudioPackages, listStudyPublications, readStudioPackageFile, readStudioPublication,
  STUDIO_PUBLICATION_ACTIONS, studioPublicationCreateSchema, studioPublicationTransitionSchema, transitionStudioPublication,
  verifierPaquet, type StudioPublicationTransition,
} from "../lib/studio-publications.js";

export const studioPublicationsRouter = Router({ mergeParams: true });

function endpoint(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof StudioRequestError) res.status(error.status).json(error.body);
      else next(error);
    }
  };
}
const param = (req: Request, key: string) => (req.params as Record<string, string>)[key] ?? "";
const base = "/studies/:studyId/publications/:publicationId";

studioPublicationsRouter.get("/publications", endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listProjectStudioPackages(param(req, "projectId"), req.user!.id));
}));
studioPublicationsRouter.get("/studies/:studyId/publications", endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudyPublications(param(req, "projectId"), param(req, "studyId"), req.user!.id));
}));
studioPublicationsRouter.post("/studies/:studyId/variants/:variantId/publications", endpoint(async (req, res) => {
  const parsed = studioPublicationCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const created = await createStudioPublication(param(req, "projectId"), param(req, "studyId"), param(req, "variantId"), req.user!.id, parsed.data);
  res.setHeader("Idempotent-Replayed", String(created.replayed));
  res.status(201).json(created);
}));
studioPublicationsRouter.get(base, endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readStudioPublication(param(req, "projectId"), param(req, "studyId"), param(req, "publicationId"), req.user!.id));
}));
// OP-6 : aperçu de l'auto-contrôle pour l'utilisateur courant, avant d'approuver (même accès que l'approbation).
studioPublicationsRouter.get(`${base}/controle-approbation`, endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await controleApprobationStudio(param(req, "projectId"), param(req, "studyId"), param(req, "publicationId"), req.user!.id));
}));
studioPublicationsRouter.get(`${base}/verification`, endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await verifierPaquet(param(req, "projectId"), param(req, "studyId"), param(req, "publicationId"), req.user!.id));
}));
studioPublicationsRouter.get(`${base}/files/:format`, endpoint(async (req, res) => {
  const out = await readStudioPackageFile(param(req, "projectId"), param(req, "studyId"), param(req, "publicationId"), req.user!.id, param(req, "format"));
  res.setHeader("Content-Type", out.file.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${out.file.fileName}"`);
  res.setHeader("X-Content-SHA256", out.file.sha256);
  res.setHeader("X-Studio-Package", out.packageHash);
  res.setHeader("X-Studio-Publication-Status", out.status);
  res.setHeader("X-Studio-Diffusion-Status", out.diffusionStatus);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (out.file.format === "svg") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.status(200).send(Buffer.from(out.content));
}));
studioPublicationsRouter.post(`${base}/:action`, endpoint(async (req, res) => {
  const action = param(req, "action");
  if (!(STUDIO_PUBLICATION_ACTIONS as readonly string[]).includes(action)) { res.status(404).json({ error: "not_found" }); return; }
  const parsed = studioPublicationTransitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  res.json(await transitionStudioPublication(param(req, "projectId"), param(req, "studyId"), param(req, "publicationId"), req.user!.id, action as StudioPublicationTransition, parsed.data, clientIp(req)));
}));
