/**
 * Production documentaire Studio (E.3-01 à E.3-03, E.3-06) — monté depuis `routes/studio.ts` (sous
 * `/projects/:projectId/studio`, authentification et analyse JSON déjà posées). Règles : `lib/studio-dossiers.ts`.
 *   GET    /dossiers                                              dossiers du projet (module Documents)
 *   GET    /studies/:studyId/sheets                               feuilles composées de l'étude (provenance recalculée)
 *   POST   /studies/:studyId/variants/:variantId/sheets           nouvelle feuille sur une révision de la variante (201 ; rejeu par requestId)
 *   PATCH  /studies/:studyId/sheets/:sheetId                      définition, réépinglage (`revisionId`)
 *   DELETE /studies/:studyId/sheets/:sheetId                      suppression (409 si un dossier la cite)
 *   GET    /studies/:studyId/sheets/:sheetId/files/:format        rendu svg | pdf (provenance et empreintes en en-têtes)
 *   GET    /studies/:studyId/dossiers                             dossiers de l'étude
 *   POST   /studies/:studyId/dossiers                             nouveau dossier (201 ; rejeu par requestId)
 *   GET    /studies/:studyId/dossiers/:dossierId                  détail et dossier assemblé
 *   PATCH  /studies/:studyId/dossiers/:dossierId                  titre, feuilles ordonnées, métré, fidélité
 *   GET    /studies/:studyId/dossiers/:dossierId/files/:format    pdf | json
 *   GET    /studies/:studyId/section-views                        vues de coupe enregistrées de l'étude (EX-075, lot PUB)
 *   POST   /studies/:studyId/variants/:variantId/section-views    nouvelle vue de coupe sur une révision de la variante (201)
 *   GET    /studies/:studyId/section-views/:viewId                vue recalculée (section, sources, actualité)
 *   PATCH  /studies/:studyId/section-views/:viewId                définition, annotation propre, réépinglage
 *   DELETE /studies/:studyId/section-views/:viewId                suppression (409 si un dossier la cite)
 * Aucune de ces routes n'écrit une révision : la planche de travail n'est jamais modifiée.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { StudioRequestError } from "../lib/studio-commands.js";
import {
  createStudioDossier, createStudioSheet, deleteStudioSheet, listProjectStudioDossiers, listStudioDossiers, listStudioSheets, readStudioDossier,
  readStudioDossierFile, readStudioSheetFile, studioDossierCreateSchema, studioDossierUpdateSchema, studioSheetCreateSchema, studioSheetUpdateSchema,
  updateStudioDossier, updateStudioSheet,
} from "../lib/studio-dossiers.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_DOSSIERS_PROJET, CONTRAT_FEUILLES_LISTER, CONTRAT_FEUILLE_CREER, CONTRAT_FEUILLE_MODIFIER, CONTRAT_FEUILLE_SUPPRIMER, CONTRAT_FEUILLE_FICHIER, CONTRAT_DOSSIERS_LISTER, CONTRAT_DOSSIER_CREER, CONTRAT_DOSSIER_LIRE, CONTRAT_DOSSIER_MODIFIER, CONTRAT_DOSSIER_FICHIER } from "../lib/studio-contrats-routes.js";

import {
  createStudioVueCoupe, deleteStudioVueCoupe, listStudioVuesCoupe, readStudioVueCoupe, studioVueCoupeCreateSchema, studioVueCoupeUpdateSchema, updateStudioVueCoupe,
} from "../lib/studio-vues-coupe.js";

export const studioDossiersRouter = Router({ mergeParams: true });

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
const invalid = (res: Response, details: unknown) => res.status(400).json({ error: "invalid_input", details });
const sheet = "/studies/:studyId/sheets/:sheetId";
const dossier = "/studies/:studyId/dossiers/:dossierId";

function sendFile(res: Response, out: { body: Buffer; fileName: string; mime: string; sha256: string }, extra: Record<string, string>) {
  res.setHeader("Content-Type", out.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${out.fileName}"`);
  res.setHeader("X-Content-SHA256", out.sha256);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (out.mime.startsWith("image/svg")) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.status(200).send(out.body);
}

studioDossiersRouter.get("/dossiers", avecContrat(CONTRAT_DOSSIERS_PROJET), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listProjectStudioDossiers(param(req, "projectId"), req.user!.id));
}));
studioDossiersRouter.get("/studies/:studyId/sheets", avecContrat(CONTRAT_FEUILLES_LISTER), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioSheets(param(req, "projectId"), param(req, "studyId"), req.user!.id));
}));
studioDossiersRouter.post("/studies/:studyId/variants/:variantId/sheets", avecContrat(CONTRAT_FEUILLE_CREER), endpoint(async (req, res) => {
  const parsed = studioSheetCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  const out = await createStudioSheet(param(req, "projectId"), param(req, "studyId"), param(req, "variantId"), req.user!.id, parsed.data);
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));
studioDossiersRouter.patch(sheet, avecContrat(CONTRAT_FEUILLE_MODIFIER), endpoint(async (req, res) => {
  const parsed = studioSheetUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  res.json(await updateStudioSheet(param(req, "projectId"), param(req, "studyId"), param(req, "sheetId"), req.user!.id, parsed.data));
}));
studioDossiersRouter.delete(sheet, avecContrat(CONTRAT_FEUILLE_SUPPRIMER), endpoint(async (req, res) => {
  res.json(await deleteStudioSheet(param(req, "projectId"), param(req, "studyId"), param(req, "sheetId"), req.user!.id));
}));
studioDossiersRouter.get(`${sheet}/files/:format`, avecContrat(CONTRAT_FEUILLE_FICHIER), endpoint(async (req, res) => {
  const out = await readStudioSheetFile(param(req, "projectId"), param(req, "studyId"), param(req, "sheetId"), req.user!.id, param(req, "format"));
  sendFile(res, out, {
    "X-Studio-Revision": out.feuille.vue.source.revisionId, "X-Studio-Variant": out.feuille.vue.source.variantId,
    "X-Studio-Document-Hash": out.feuille.vue.source.documentHash, "X-Studio-View-Hash": out.feuille.vue.empreinteDonnees, "X-Studio-Sheet-Hash": out.feuille.empreinte,
  });
}));
studioDossiersRouter.get("/studies/:studyId/dossiers", avecContrat(CONTRAT_DOSSIERS_LISTER), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioDossiers(param(req, "projectId"), param(req, "studyId"), req.user!.id));
}));
studioDossiersRouter.post("/studies/:studyId/dossiers", avecContrat(CONTRAT_DOSSIER_CREER), endpoint(async (req, res) => {
  const parsed = studioDossierCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  const out = await createStudioDossier(param(req, "projectId"), param(req, "studyId"), req.user!.id, parsed.data);
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));
studioDossiersRouter.get(dossier, avecContrat(CONTRAT_DOSSIER_LIRE), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readStudioDossier(param(req, "projectId"), param(req, "studyId"), param(req, "dossierId"), req.user!.id));
}));
studioDossiersRouter.patch(dossier, avecContrat(CONTRAT_DOSSIER_MODIFIER), endpoint(async (req, res) => {
  const parsed = studioDossierUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  res.json(await updateStudioDossier(param(req, "projectId"), param(req, "studyId"), param(req, "dossierId"), req.user!.id, parsed.data));
}));
studioDossiersRouter.get(`${dossier}/files/:format`, avecContrat(CONTRAT_DOSSIER_FICHIER), endpoint(async (req, res) => {
  const out = await readStudioDossierFile(param(req, "projectId"), param(req, "studyId"), param(req, "dossierId"), req.user!.id, param(req, "format"));
  sendFile(res, out, { "X-Studio-Dossier-Hash": out.empreinte });
}));

const vueCoupe = "/studies/:studyId/section-views/:viewId";
studioDossiersRouter.get("/studies/:studyId/section-views", endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioVuesCoupe(param(req, "projectId"), param(req, "studyId"), req.user!.id));
}));
studioDossiersRouter.post("/studies/:studyId/variants/:variantId/section-views", endpoint(async (req, res) => {
  const parsed = studioVueCoupeCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  res.status(201).json(await createStudioVueCoupe(param(req, "projectId"), param(req, "studyId"), param(req, "variantId"), req.user!.id, parsed.data));
}));
studioDossiersRouter.get(vueCoupe, endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readStudioVueCoupe(param(req, "projectId"), param(req, "studyId"), param(req, "viewId"), req.user!.id));
}));
studioDossiersRouter.patch(vueCoupe, endpoint(async (req, res) => {
  const parsed = studioVueCoupeUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) { invalid(res, parsed.error.flatten()); return; }
  res.json(await updateStudioVueCoupe(param(req, "projectId"), param(req, "studyId"), param(req, "viewId"), req.user!.id, parsed.data));
}));
studioDossiersRouter.delete(vueCoupe, endpoint(async (req, res) => {
  res.json(await deleteStudioVueCoupe(param(req, "projectId"), param(req, "studyId"), param(req, "viewId"), req.user!.id));
}));
