/**
 * Routes du lot CMD (Studio) : contexte d'étude (IF-001), essais à portée de révision (EX-045), jobs serveur (EX-088),
 * journal des changements de révision (IF-011), migrations de schéma (EX-019, EX-091) et bascule Atelier → Studio
 * (MIG-COEX-06). Montées dans `studioRouter` (`/projects/:projectId/studio`, authentification exigée en amont).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { lireBascule, passerBascule, type StudioActionBascule } from "../lib/studio-bascule.js";
import { readStudioContext, StudioRequestError, studyOf, studioIdentifierSchema, assertAccess, type StudioScope } from "../lib/studio-commands.js";
import { lireContexteEtude } from "../lib/studio-contexte.js";
import { abandonnerEssaiStudio, confirmerEssaiStudio, creerEssaiStudio, lireJobStudio } from "../lib/studio-jobs.js";
import { lireJournalVariante } from "../lib/studio-journal.js";
import { lireDocumentMigre, lireMigrationEtude, listerMigrationsEtude, passerMigrationEtude, simulerMigrationEtude } from "../lib/studio-migrations.js";
import { loadProjectAccess } from "../lib/owned-project.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_BASCULE_LIRE, CONTRAT_BASCULE_PASSAGE, CONTRAT_ESSAI_ABANDON, CONTRAT_ESSAI_CONFIRMER, CONTRAT_ESSAI_CREER, CONTRAT_ETUDE_CONTEXTE, CONTRAT_JOB_LIRE, CONTRAT_JOURNAL_REVISIONS, CONTRAT_MIGRATIONS_LISTER, CONTRAT_MIGRATION_DOCUMENT, CONTRAT_MIGRATION_LIRE, CONTRAT_MIGRATION_PASSAGE, CONTRAT_MIGRATION_SIMULER } from "../lib/studio-contrats-routes.js";

export const studioCmdRouter = Router({ mergeParams: true });

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
const param = (req: Request, nom: string): string => {
  const v = (req.params as Record<string, string>)[nom] ?? "";
  if (!studioIdentifierSchema.safeParse(v).success) throw new StudioRequestError(404, { error: "not_found" });
  return v;
};
const prive = (res: Response) => res.setHeader("Cache-Control", "private, no-store");

/** Contexte validé d'une étude (IF-001) ; `null` si l'étude a été créée sans contexte. */
studioCmdRouter.get("/studies/:studyId/contexte", avecContrat(CONTRAT_ETUDE_CONTEXTE), endpoint(async (req, res) => {
  const s = scope(req);
  assertAccess(await loadProjectAccess(s.projectId, req.user!.id), req.user!.id, "read", { studyId: s.studyId });
  await studyOf(db, s.projectId, s.studyId);
  prive(res);
  res.json({ studyId: s.studyId, contexte: await lireContexteEtude(db, s.studyId) });
}));

/** Essai (EX-045) : 201 avec le job (`termine` ou `echec`) ; aucune révision écrite. */
const variante = "/studies/:studyId/variants/:variantId";
studioCmdRouter.post(`${variante}/essais`, avecContrat(CONTRAT_ESSAI_CREER), endpoint(async (req, res) => {
  res.status(201).json(await creerEssaiStudio(scope(req), req.user!.id, req.body));
}));
studioCmdRouter.post(`${variante}/essais/:jobId/abandon`, avecContrat(CONTRAT_ESSAI_ABANDON), endpoint(async (req, res) => {
  res.json(await abandonnerEssaiStudio(scope(req), req.user!.id, param(req, "jobId")));
}));
studioCmdRouter.post(`${variante}/essais/:jobId/confirmer`, avecContrat(CONTRAT_ESSAI_CONFIRMER), endpoint(async (req, res) => {
  res.json(await confirmerEssaiStudio(scope(req), req.user!.id, param(req, "jobId")));
}));

/** Résultat d'un job serveur (EX-088) sous l'autorisation de son étude ; 404 sans métadonnée sinon. */
studioCmdRouter.get("/jobs/:jobId", avecContrat(CONTRAT_JOB_LIRE), endpoint(async (req, res) => {
  prive(res);
  res.json(await lireJobStudio(db, scope(req).projectId, param(req, "jobId"), req.user!.id));
}));

/** Journal des changements de révision d'une variante (IF-011), du plus ancien au plus récent. */
studioCmdRouter.get(`${variante}/journal`, avecContrat(CONTRAT_JOURNAL_REVISIONS), endpoint(async (req, res) => {
  const context = await readStudioContext(db, scope(req), req.user!.id);
  prive(res);
  res.json({ variantId: context.variant.id, headRevisionId: context.variant.headRevisionId, evenements: await lireJournalVariante(db, context.variant.id) });
}));

/** Migrations de schéma d'une étude (EX-091) : simuler (201), lire, accorder / appliquer / retour arrière. */
studioCmdRouter.post("/studies/:studyId/migrations", avecContrat(CONTRAT_MIGRATION_SIMULER), endpoint(async (req, res) => {
  const parsed = z.object({ cible: z.literal("studio-document/2") }).strict().safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.status(201).json(await simulerMigrationEtude(s.projectId, s.studyId, req.user!.id));
}));
studioCmdRouter.get("/studies/:studyId/migrations", avecContrat(CONTRAT_MIGRATIONS_LISTER), endpoint(async (req, res) => {
  const s = scope(req);
  prive(res);
  res.json(await listerMigrationsEtude(s.projectId, s.studyId, req.user!.id));
}));
studioCmdRouter.get("/studies/:studyId/migrations/:migrationId", avecContrat(CONTRAT_MIGRATION_LIRE), endpoint(async (req, res) => {
  const s = scope(req);
  prive(res);
  res.json(await lireMigrationEtude(s.projectId, s.studyId, param(req, "migrationId"), req.user!.id));
}));
const passerMigration = (passage: "accorder" | "appliquer" | "retour-arriere") => endpoint(async (req, res) => {
  const s = scope(req);
  res.json(await passerMigrationEtude(s.projectId, s.studyId, param(req, "migrationId"), req.user!.id, passage));
});
studioCmdRouter.post("/studies/:studyId/migrations/:migrationId/accorder", avecContrat(CONTRAT_MIGRATION_PASSAGE), passerMigration("accorder"));
studioCmdRouter.post("/studies/:studyId/migrations/:migrationId/appliquer", avecContrat(CONTRAT_MIGRATION_PASSAGE), passerMigration("appliquer"));
studioCmdRouter.post("/studies/:studyId/migrations/:migrationId/retour-arriere", avecContrat(CONTRAT_MIGRATION_PASSAGE), passerMigration("retour-arriere"));
studioCmdRouter.get("/studies/:studyId/migrations/:migrationId/documents/:revisionId", avecContrat(CONTRAT_MIGRATION_DOCUMENT), endpoint(async (req, res) => {
  const s = scope(req);
  prive(res);
  res.json(await lireDocumentMigre(s.projectId, s.studyId, param(req, "migrationId"), param(req, "revisionId"), req.user!.id));
}));

/** Bascule Atelier → Studio du projet (MIG-COEX-06) : lecture, puis préparer / basculer / retour arrière (propriétaire). */
studioCmdRouter.get("/bascule", avecContrat(CONTRAT_BASCULE_LIRE), endpoint(async (req, res) => {
  prive(res);
  res.json({ bascule: await lireBascule(scope(req).projectId, req.user!.id) });
}));
const bascule = (action: StudioActionBascule) => endpoint(async (req, res) => {
  let studyId: string | undefined;
  if (action === "preparer") {
    const parsed = z.object({ studyId: studioIdentifierSchema }).strict().safeParse(req.body ?? {});
    if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
    studyId = parsed.data.studyId;
  }
  res.json(await passerBascule(scope(req).projectId, req.user!.id, action, studyId));
});
studioCmdRouter.post("/bascule/preparer", avecContrat(CONTRAT_BASCULE_PASSAGE), bascule("preparer"));
studioCmdRouter.post("/bascule/basculer", avecContrat(CONTRAT_BASCULE_PASSAGE), bascule("basculer"));
studioCmdRouter.post("/bascule/retour-arriere", avecContrat(CONTRAT_BASCULE_PASSAGE), bascule("retour-arriere"));
