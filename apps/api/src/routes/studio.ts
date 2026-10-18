/** Module Studio autonome : aucun rattachement au modèle Atelier ; lien de lecture facultatif vers des étapes du Parcours (studio-liens). */
import { Router, json, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";
import { compareStudioRevisions, createStudioStudy, createStudioVariant, exportStudioVariant, listStudioRevisions, listStudioStudies, listStudioVariants, parseStudioCompareSide, readStudioContext, readStudioStudy, STUDIO_EXPORT_FORMATS, StudioRequestError, studioIdentifierSchema, submitStudioCommands, type StudioCreation, type StudioScope } from "../lib/studio-commands.js";
import { createStudioComment, deleteStudioComment, listStudioComments, studioCommentSchema } from "../lib/studio-commentaires.js";
import { listStudiesOfStep, listStudioStudySteps, setStudioStudySteps, studioStudyStepsSchema } from "../lib/studio-liens.js";
import { renameStudioStudy, renameStudioVariant, setStudioStudyArchived, setStudioVariantArchived, studioRenameSchema } from "../lib/studio-variantes.js";

export const studioRouter = Router({ mergeParams: true });
studioRouter.use(requireAuth);
studioRouter.use(json({ limit: "1mb" }));
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
studioRouter.get("/studies", endpoint(async (req, res) => {
  const archives = archivesOf(req);
  if (archives === null) { archivesRefused(res); return; }
  res.json(await listStudioStudies(scope(req).projectId, req.user!.id, archives));
}));
studioRouter.post("/studies", endpoint(async (req, res) => {
  const parsed = studySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  created(res, await createStudioStudy(scope(req).projectId, req.user!.id, parsed.data.name, parsed.data.requestId));
}));
studioRouter.get("/studies/:studyId", endpoint(async (req, res) => {
  const archives = archivesOf(req);
  if (archives === null) { archivesRefused(res); return; }
  const s = scope(req);
  res.json(await readStudioStudy(db, s.projectId, s.studyId, req.user!.id, archives));
}));
/** Renommage (`modify`) : nom épuré 1..200 ; une étude archivée → 409 archived. */
studioRouter.patch("/studies/:studyId", endpoint(async (req, res) => {
  const parsed = studioRenameSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await renameStudioStudy(s.projectId, s.studyId, req.user!.id, parsed.data.name));
}));
/** Archivage sans suppression (`modify`), idempotent ; l'étude reste lisible par son adresse, en lecture seule. */
for (const [action, archived] of [["archive", true], ["unarchive", false]] as const) {
  studioRouter.post(`/studies/:studyId/${action}`, endpoint(async (req, res) => {
    const s = scope(req);
    res.json(await setStudioStudyArchived(s.projectId, s.studyId, req.user!.id, archived));
  }));
  studioRouter.post(`/studies/:studyId/variants/:variantId/${action}`, endpoint(async (req, res) => {
    const s = scope(req);
    res.json(await setStudioVariantArchived(s.projectId, s.studyId, s.variantId, req.user!.id, archived));
  }));
}
studioRouter.patch("/studies/:studyId/variants/:variantId", endpoint(async (req, res) => {
  const parsed = studioRenameSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await renameStudioVariant(s.projectId, s.studyId, s.variantId, req.user!.id, parsed.data.name));
}));
/** Comparaison lecture seule : `from` et `to` = `variantId[:revisionId]` de la même étude ; seuls ces deux paramètres. */
studioRouter.get("/studies/:studyId/compare", endpoint(async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const from = parseStudioCompareSide(query["from"]), to = parseStudioCompareSide(query["to"]);
  if (!from || !to || Object.keys(query).some((key) => key !== "from" && key !== "to")) {
    res.status(400).json({ error: "invalid_input", message: "Paramètres attendus : from et to = variantId[:revisionId]." }); return;
  }
  const s = scope(req);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await compareStudioRevisions(db, s.projectId, s.studyId, req.user!.id, from, to));
}));
studioRouter.get("/studies/:studyId/variants", endpoint(async (req, res) => {
  const archives = archivesOf(req);
  if (archives === null) { archivesRefused(res); return; }
  const s = scope(req);
  res.json(await listStudioVariants(db, s.projectId, s.studyId, req.user!.id, archives));
}));
studioRouter.post("/studies/:studyId/variants", endpoint(async (req, res) => {
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  const { name, requestId, fromVariantId, fromRevisionId } = parsed.data;
  const from = fromVariantId === undefined ? undefined : { variantId: fromVariantId, ...(fromRevisionId === undefined ? {} : { revisionId: fromRevisionId }) };
  created(res, await createStudioVariant(s.projectId, s.studyId, req.user!.id, name, requestId, from));
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
/** Fichier SVG, DXF ou IFC d'une révision (tête par défaut) ; droits et refus identiques à la lecture de la variante. */
studioRouter.get("/studies/:studyId/variants/:variantId/export", endpoint(async (req, res) => {
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
studioRouter.post("/studies/:studyId/variants/:variantId/commands", endpoint(async (req, res) => {
  res.json(await submitStudioCommands(scope(req), req.user!.id, req.body));
}));
/**
 * Commentaires d'une variante (règles de la Collaboration) : lecture `read`, écriture `comment` (tout membre),
 * suppression douce par l'auteur seul. POST idempotent par `requestId` : 201, rejeu = `replayed: true`.
 */
const commentsPath = "/studies/:studyId/variants/:variantId/comments";
studioRouter.get(commentsPath, endpoint(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioComments(scope(req), req.user!.id));
}));
studioRouter.post(commentsPath, endpoint(async (req, res) => {
  const parsed = studioCommentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const comment = await createStudioComment(scope(req), req.user!.id, parsed.data);
  res.setHeader("Idempotent-Replayed", String(comment.replayed));
  res.status(201).json(comment);
}));
studioRouter.delete(`${commentsPath}/:commentId`, endpoint(async (req, res) => {
  await deleteStudioComment(scope(req), req.user!.id, req.params["commentId"] as string);
  res.status(204).end();
}));
/**
 * Étapes du Parcours rattachées à une étude : lecture `read`, remplacement de la liste complète avec `modify`
 * (PUT idempotent) ; une étape absente du projet → 400 ; une étude d'un autre projet → 404.
 */
studioRouter.get("/studies/:studyId/steps", endpoint(async (req, res) => {
  const s = scope(req);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudioStudySteps(s.projectId, s.studyId, req.user!.id));
}));
studioRouter.put("/studies/:studyId/steps", endpoint(async (req, res) => {
  const parsed = studioStudyStepsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const s = scope(req);
  res.json(await setStudioStudySteps(s.projectId, s.studyId, req.user!.id, parsed.data.steps));
}));
/** Études rattachées à une étape du Parcours (bloc « Études Studio liées » de l'étape) : lecture `read`. */
studioRouter.get("/steps/:stepNumber/studies", endpoint(async (req, res) => {
  const raw = req.params["stepNumber"] as string;
  if (!/^[1-9][0-9]{0,3}$/.test(raw)) { res.status(400).json({ error: "invalid_input", message: "Numéro d'étape attendu." }); return; }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listStudiesOfStep(scope(req).projectId, Number(raw), req.user!.id));
}));
