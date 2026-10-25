/** Module Studio autonome : aucun rattachement au modèle Atelier ; lien de lecture facultatif vers des étapes du Parcours (studio-liens). */
import { Router, json, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { studioRapportFidelite } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";
import { compareStudioRevisions, createStudioStudy, createStudioVariant, exportStudioVariant, listStudioRevisions, listStudioStudies, listStudioVariants, parseStudioCompareSide, readStudioContext, readStudioRevisionChanges, readStudioStudy, STUDIO_EXPORT_FORMATS, StudioRequestError, studioIdentifierSchema, submitStudioCommands, type StudioCreation, type StudioScope } from "../lib/studio-commands.js";
import { createStudioComment, createStudioObservation, deleteStudioComment, listStudioComments, setStudioCommentAudience, studioCommentSchema, studioObservationSchema, studioObservationTransitionSchema, transitionStudioObservation } from "../lib/studio-commentaires.js";
import { audienceSchema } from "../lib/audience.js";
import { clientIp } from "../lib/audit.js";
import { listStudiesOfStep, listStudioStudySteps, setStudioStudySteps, studioStudyStepsSchema } from "../lib/studio-liens.js";
import { renameStudioStudy, renameStudioVariant, setStudioStudyArchived, setStudioStudyWorkflowPhase, setStudioVariantArchived, studioRenameSchema, studioWorkflowSchema } from "../lib/studio-variantes.js";
import { etatExempleStudio, installerExempleStudio } from "../lib/studio-exemple.js";
import { studioExigencesRouter } from "./studio-exigences.js";
import { studioPublicationsRouter } from "./studio-publications.js";
import { studioObservationsRouter } from "./studio-observations.js";
import { studioPreferencesRouter } from "./studio-preferences.js";
import { studioQuantitesRouter } from "./studio-quantites.js";
import { studioDossiersRouter } from "./studio-dossiers.js";
import { studioModelesExternesRouter } from "./studio-modeles-externes.js";
import { studioIllustrationsRouter } from "./studio-illustrations.js";
import { studioAgentsRouter } from "./studio-agents.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_ETUDES_LISTER, CONTRAT_ETUDE_CREER, CONTRAT_ETUDE_LIRE, CONTRAT_ETUDE_RENOMMER, CONTRAT_ETUDE_PHASE, CONTRAT_EXEMPLE_INSTALLER, CONTRAT_ETUDE_ARCHIVAGE, CONTRAT_VARIANTE_ARCHIVAGE, CONTRAT_VARIANTE_RENOMMER, CONTRAT_VARIANTES_COMPARER, CONTRAT_VARIANTES_LISTER, CONTRAT_VARIANTE_CREER, CONTRAT_REVISIONS_LISTER, CONTRAT_VARIANTE_LIRE, CONTRAT_REVISION_CHANGEMENTS, CONTRAT_REVISION_LIRE, CONTRAT_VARIANTE_EXPORTER, CONTRAT_EXPORT_RAPPORT, CONTRAT_COMMANDES, CONTRAT_COMMENTAIRES_LISTER, CONTRAT_COMMENTAIRE_CREER, CONTRAT_COMMENTAIRE_AUDIENCE, CONTRAT_COMMENTAIRE_SUPPRIMER, CONTRAT_COMMENTAIRE_OBSERVATION, CONTRAT_COMMENTAIRE_OBSERVATION_TRANSITION, CONTRAT_ETAPES_LIRE, CONTRAT_ETAPES_REMPLACER, CONTRAT_ETAPE_ETUDES } from "../lib/studio-contrats-routes.js";

export const studioRouter = Router({ mergeParams: true });
studioRouter.use(requireAuth);
// Modèles externes (lot F3) : le fichier reçu (5 Mo de texte au plus) voyage dans le corps JSON, borné à 6 Mo ici seulement.
studioRouter.use("/studies/:studyId/variants/:variantId/modeles-externes", json({ limit: "6mb" }));
// Illustrations (lot F) : le rendu de la vue (8 Mo de PNG au plus) voyage en base64 dans le corps JSON, borné à 12 Mo ici seulement.
studioRouter.use("/studies/:studyId/variants/:variantId/illustrations", json({ limit: "12mb" }));
studioRouter.use(json({ limit: "1mb" }));
studioRouter.use("/preferences", studioPreferencesRouter);
// `requestId` facultatif : même règle d'identifiant que les enveloppes de commandes ; rejeu = réponse 201 d'origine.
const studySchema = z.object({ name: z.string().trim().min(1).max(200), requestId: studioIdentifierSchema.optional() }).strict();
// Dérivation facultative : `fromVariantId` (même étude) et, si donnée, `fromRevisionId` (de cette variante ; tête sinon).
const variantSchema = z.object({
  name: z.string().trim().min(1).max(200), requestId: studioIdentifierSchema.optional(),
  fromVariantId: studioIdentifierSchema.optional(), fromRevisionId: studioIdentifierSchema.optional(),
}).strict().refine((v) => v.fromRevisionId === undefined || v.fromVariantId !== undefined, { message: "fromRevisionId exige fromVariantId.", path: ["fromRevisionId"] });
const exportSchema = z.object({ format: z.enum(STUDIO_EXPORT_FORMATS), revision: studioIdentifierSchema.optional() });
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
/**
 * Listes : seul paramètre admis `archives=1` (inclut les études ou variantes archivées) ; `null` = requête refusée (400).
 */
function archivesOf(req: Request): boolean | null {
  const query = req.query as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== "archives")) return null;
  if (query["archives"] === undefined) return false;
  return query["archives"] === "1" ? true : null;
}
const archivesRefused = (res: Response) => res.status(400).json({ error: "invalid_input", message: "Seul paramètre admis : archives=1." });
/** 201 dans les deux cas ; un rejeu renvoie le corps d'origine avec `replayed: true` et l'en-tête Idempotent-Replayed. */
function created(res: Response, body: StudioCreation): void {
  res.setHeader("Idempotent-Replayed", String(body.replayed));
  res.status(201).json(body);
}
studioRouter.get("/studies", avecContrat(CONTRAT_ETUDES_LISTER), endpoint(async (req, res) => {
  const archives = archivesOf(req);
  if (archives === null) { archivesRefused(res); return; }
  const projectId = scope(req).projectId;
  const liste = await listStudioStudies(projectId, req.user!.id, archives);
  // État de l'étude exemple (`absente | partielle | complete`, lu dans son marquage) ; null hors d'un projet de l'exemple.
  res.json({ ...liste, exemple: await etatExempleStudio(projectId, req.user!.id) });
}));
studioRouter.post("/studies", avecContrat(CONTRAT_ETUDE_CREER), endpoint(async (req, res) => {
  const parsed = studySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  created(res, await createStudioStudy(scope(req).projectId, req.user!.id, parsed.data.name, parsed.data.requestId));
}));
studioRouter.get("/studies/:studyId", avecContrat(CONTRAT_ETUDE_LIRE), endpoint(async (req, res) => {
  const archives = archivesOf(req);
  if (archives === null) { archivesRefused(res); return; }
  const s = scope(req);
  res.json(await readStudioStudy(db, s.projectId, s.studyId, req.user!.id, archives));
}));
/** Renommage (`modify`) : nom épuré 1..200 ; une étude archivée → 409 archived. */
studioRouter.patch("/studies/:studyId", avecContrat(CONTRAT_ETUDE_RENOMMER), endpoint(async (req, res) => {
  const parsed = studioRenameSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await renameStudioStudy(s.projectId, s.studyId, req.user!.id, parsed.data.name));
}));
/**
 * Phase déclarée du workflow de conception (REF-01 §06) : `{ phase: "cadrer" | … | "publier" | null }`, droit `modify`
 * (propriétaire ou éditeur ; lecteur → 403), étude archivée → 409 `archived`. Renvoie l'étude relue.
 */
studioRouter.patch("/studies/:studyId/workflow", avecContrat(CONTRAT_ETUDE_PHASE), endpoint(async (req, res) => {
  const parsed = studioWorkflowSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await setStudioStudyWorkflowPhase(s.projectId, s.studyId, req.user!.id, parsed.data.phase));
}));
/**
 * Étude exemple du projet P.118 (`lib/studio-exemple.ts`), réservée au propriétaire (écriture système du contenu de
 * l'exemple, même dans la référence protégée) : 201 étude créée (ou reprise), 200 étude déjà complète renvoyée sans
 * écriture (idempotent, lecture seule : aucun 423 pendant le verrou d'un autre compte), 409 `exemple_indisponible` hors
 * d'un projet issu de l'exemple P.118, 423 pendant le verrou d'un autre compte si l'installation doit écrire, 409
 * `exemple_version_changee` pour une installation partielle d'une autre version de la conversion. Corps ignoré.
 */
studioRouter.post("/exemple", avecContrat(CONTRAT_EXEMPLE_INSTALLER), endpoint(async (req, res) => {
  const installe = await installerExempleStudio(scope(req).projectId, req.user!.id);
  res.status(installe.created ? 201 : 200).json(installe);
}));
/** Archivage sans suppression (`modify`), idempotent ; l'étude reste lisible par son adresse, en lecture seule. */
for (const [action, archived] of [["archive", true], ["unarchive", false]] as const) {
  studioRouter.post(`/studies/:studyId/${action}`, avecContrat(CONTRAT_ETUDE_ARCHIVAGE), endpoint(async (req, res) => {
    const s = scope(req);
    res.json(await setStudioStudyArchived(s.projectId, s.studyId, req.user!.id, archived));
  }));
  studioRouter.post(`/studies/:studyId/variants/:variantId/${action}`, avecContrat(CONTRAT_VARIANTE_ARCHIVAGE), endpoint(async (req, res) => {
    const s = scope(req);
    res.json(await setStudioVariantArchived(s.projectId, s.studyId, s.variantId, req.user!.id, archived));
  }));
}
studioRouter.patch("/studies/:studyId/variants/:variantId", avecContrat(CONTRAT_VARIANTE_RENOMMER), endpoint(async (req, res) => {
  const parsed = studioRenameSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await renameStudioVariant(s.projectId, s.studyId, s.variantId, req.user!.id, parsed.data.name));
}));
/** Comparaison lecture seule : `from` et `to` = `variantId[:revisionId]` de la même étude ; seuls ces deux paramètres. */
studioRouter.get("/studies/:studyId/compare", avecContrat(CONTRAT_VARIANTES_COMPARER), endpoint(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const from = parseStudioCompareSide(query["from"]), to = parseStudioCompareSide(query["to"]);
  if (!from || !to || Object.keys(query).some((key) => key !== "from" && key !== "to")) {
    res.status(400).json({ error: "invalid_input", message: "Paramètres attendus : from et to = variantId[:revisionId]." }); return;
  }
  const s = scope(req);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await compareStudioRevisions(db, s.projectId, s.studyId, req.user!.id, from, to));
}));
studioRouter.get("/studies/:studyId/variants", avecContrat(CONTRAT_VARIANTES_LISTER), endpoint(async (req, res) => {
  const archives = archivesOf(req);
  if (archives === null) { archivesRefused(res); return; }
  const s = scope(req);
  res.json(await listStudioVariants(db, s.projectId, s.studyId, req.user!.id, archives));
}));
studioRouter.post("/studies/:studyId/variants", avecContrat(CONTRAT_VARIANTE_CREER), endpoint(async (req, res) => {
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  const { name, requestId, fromVariantId, fromRevisionId } = parsed.data;
  const from = fromVariantId === undefined ? undefined : { variantId: fromVariantId, ...(fromRevisionId === undefined ? {} : { revisionId: fromRevisionId }) };
  created(res, await createStudioVariant(s.projectId, s.studyId, req.user!.id, name, requestId, from));
}));
studioRouter.get("/studies/:studyId/variants/:variantId/revisions", avecContrat(CONTRAT_REVISIONS_LISTER), endpoint(async (req, res) => {
  res.json(await listStudioRevisions(db, scope(req), req.user!.id));
}));
studioRouter.get("/studies/:studyId/variants/:variantId", avecContrat(CONTRAT_VARIANTE_LIRE), endpoint(async (req, res) => {
  res.json(await readStudioContext(db, scope(req), req.user!.id));
}));
/** Historique hybride (A.5-07) : commandes enregistrées et delta d'une révision ; lecture seule. */
studioRouter.get("/studies/:studyId/variants/:variantId/revisions/:revisionId/changes", avecContrat(CONTRAT_REVISION_CHANGEMENTS), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await readStudioRevisionChanges(db, scope(req), req.user!.id, req.params["revisionId"] as string));
}));
studioRouter.get("/studies/:studyId/variants/:variantId/revisions/:revisionId", avecContrat(CONTRAT_REVISION_LIRE), endpoint(async (req, res) => {
  res.json(await readStudioContext(db, scope(req), req.user!.id, req.params["revisionId"] as string));
}));
/** Fichier SVG, DXF ou IFC d'une révision (tête par défaut) ; droits et refus identiques à la lecture de la variante. */
studioRouter.get("/studies/:studyId/variants/:variantId/export", avecContrat(CONTRAT_VARIANTE_EXPORTER), endpoint(async (req, res) => {
  const parsed = exportSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const file = await exportStudioVariant(db, scope(req), req.user!.id, parsed.data.format, parsed.data.revision);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("X-Studio-Revision", file.revisionId);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Un SVG ouvert directement n'exécute aucun script et ne charge aucune ressource.
  if (file.format === "svg") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  // Tampon : Express n'ajoute pas de charset au type déclaré (le DXF et l'IFC sont de l'ASCII strict).
  res.status(200).send(Buffer.from(file.body, "utf8"));
}));
/**
 * Rapport de fidélité de l'export (E.6-03) : ce que le fichier `format` porte exactement, approché ou pas, par type et par
 * raison, pour la même révision (tête par défaut) ; JSON, mêmes droits et refus que l'export.
 */
studioRouter.get("/studies/:studyId/variants/:variantId/export/rapport", avecContrat(CONTRAT_EXPORT_RAPPORT), endpoint(async (req, res) => {
  const parsed = exportSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const context = await readStudioContext(db, scope(req), req.user!.id, parsed.data.revision);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ revisionId: context.revision.id, ...studioRapportFidelite(context.revision.document, parsed.data.format) });
}));
studioRouter.post("/studies/:studyId/variants/:variantId/commands", avecContrat(CONTRAT_COMMANDES), endpoint(async (req, res) => {
  res.json(await submitStudioCommands(scope(req), req.user!.id, req.body));
}));
/**
 * Commentaires d'une variante (règles de la Collaboration) : lecture `read`, écriture `comment` (tout membre),
 * suppression douce par l'auteur seul ; audience du fil (E1) filtrée par le serveur, changée par PATCH. POST idempotent par `requestId` : 201, rejeu = `replayed: true`.
 */
const commentsPath = "/studies/:studyId/variants/:variantId/comments";
studioRouter.get(commentsPath, avecContrat(CONTRAT_COMMENTAIRES_LISTER), endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioComments(scope(req), req.user!.id));
}));
studioRouter.post(commentsPath, avecContrat(CONTRAT_COMMENTAIRE_CREER), endpoint(async (req, res) => {
  const parsed = studioCommentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const comment = await createStudioComment(scope(req), req.user!.id, parsed.data);
  res.setHeader("Idempotent-Replayed", String(comment.replayed));
  res.status(201).json(comment);
}));
/** Audience du fil (E1) : `{ audience }`, par l'auteur ou le propriétaire, journalisée ; 200 = le commentaire relu. */
studioRouter.patch(`${commentsPath}/:commentId`, avecContrat(CONTRAT_COMMENTAIRE_AUDIENCE), endpoint(async (req, res) => {
  const parsed = z.object({ audience: audienceSchema }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  res.json(await setStudioCommentAudience(scope(req), req.user!.id, req.params["commentId"] as string, parsed.data.audience, clientIp(req)));
}));
studioRouter.delete(`${commentsPath}/:commentId`, avecContrat(CONTRAT_COMMENTAIRE_SUPPRIMER), endpoint(async (req, res) => {
  await deleteStudioComment(scope(req), req.user!.id, req.params["commentId"] as string);
  res.status(204).end();
}));
/**
 * Observations (E.2) : un commentaire d'origine devient une observation (POST …/observation, 201, auteur ou
 * propriétaire) ; passages corriger / recontroler / cloturer / rouvrir (POST …/observation/transitions, 200),
 * journalisés. Rôles et refus : `lib/studio-observations.ts`. Idempotents par `requestId`.
 */
studioRouter.post(`${commentsPath}/:commentId/observation`, avecContrat(CONTRAT_COMMENTAIRE_OBSERVATION), endpoint(async (req, res) => {
  const parsed = studioObservationSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const observation = await createStudioObservation(scope(req), req.user!.id, req.params["commentId"] as string, parsed.data);
  res.setHeader("Idempotent-Replayed", String(observation.replayed));
  res.status(201).json(observation);
}));
studioRouter.post(`${commentsPath}/:commentId/observation/transitions`, avecContrat(CONTRAT_COMMENTAIRE_OBSERVATION_TRANSITION), endpoint(async (req, res) => {
  const parsed = studioObservationTransitionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const observation = await transitionStudioObservation(scope(req), req.user!.id, req.params["commentId"] as string, parsed.data);
  res.setHeader("Idempotent-Replayed", String(observation.replayed));
  res.json(observation);
}));
/**
 * Étapes du Parcours rattachées à une étude : lecture `read`, remplacement de la liste complète avec `modify`
 * (PUT idempotent) ; une étape absente du projet → 400 ; une étude d'un autre projet → 404.
 */
studioRouter.get("/studies/:studyId/steps", avecContrat(CONTRAT_ETAPES_LIRE), endpoint(async (req, res) => {
  const s = scope(req);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioStudySteps(s.projectId, s.studyId, req.user!.id));
}));
studioRouter.put("/studies/:studyId/steps", avecContrat(CONTRAT_ETAPES_REMPLACER), endpoint(async (req, res) => {
  const parsed = studioStudyStepsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await setStudioStudySteps(s.projectId, s.studyId, req.user!.id, parsed.data.steps));
}));
/** Études rattachées à une étape du Parcours (bloc « Études Studio liées » de l'étape) : lecture `read`. */
studioRouter.get("/steps/:stepNumber/studies", avecContrat(CONTRAT_ETAPE_ETUDES), endpoint(async (req, res) => {
  const raw = req.params["stepNumber"] as string;
  if (!/^[1-9][0-9]{0,3}$/.test(raw)) { res.status(400).json({ error: "invalid_input", message: "Numéro d'étape attendu." }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudiesOfStep(scope(req).projectId, Number(raw), req.user!.id));
}));
studioRouter.use(studioPublicationsRouter);
// Exigences versionnées et contrôles (E.1-02 à E.1-06) : `routes/studio-exigences.ts`.
studioRouter.use(studioExigencesRouter);
// Ajustements manuels du métré, journal versionné par variante (E.3-05) : `routes/studio-quantites.ts`.
studioRouter.use(studioQuantitesRouter);
// Observations : identité réemployée, contexte, tâches, décisions, clôture (E.2-01 à E.2-05) : `routes/studio-observations.ts`.
studioRouter.use(studioObservationsRouter);
// Feuilles composées et dossiers de conception (E.3-01 à E.3-03, E.3-06) : `routes/studio-dossiers.ts`.
studioRouter.use(studioDossiersRouter);
// Modèles externes (partenaires) d'une variante (lot F3) : réception, comparaison, acceptation ou refus.
studioRouter.use(studioModelesExternesRouter);
// Lot F (décision P-12) : illustrations depuis une vue ; jetons, propositions et journal des agents ; extensions.
studioRouter.use(studioIllustrationsRouter);
studioRouter.use(studioAgentsRouter);
