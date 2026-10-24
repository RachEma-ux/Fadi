/**
 * Revue externe (Issue #262, phase 4 ; concept, partie 4).
 *
 * Équipe interne — `reviewsTeamRouter`, monté sous `/projects/:projectId/reviews` (droits de l'équipe, `lib/reviews-team.ts`) :
 *   GET    /                                   paquets du projet et leur suivi (réponses, constats ouverts, décisions bloquées, retards)
 *   POST   /                                   { publicationId, purpose, expectedResponse, title?, questions?, coordinatorId?, correctionsOwnerId?, dueOn?, requestId? } → brouillon
 *   GET    /:packageId                         détail (destinataires, constats de la lignée, notes internes, versions)
 *   PATCH  /:packageId                         brouillon : identité ; partagé : échéance, coordinateur, responsable des corrections
 *   DELETE /:packageId                         brouillon seulement
 *   POST   /:packageId/assignments/preview     aperçu de l'accès résultant (aucune écriture)
 *   POST   /:packageId/assignments             destinataire nommé ; invitation `review_package` si le paquet est partagé
 *   POST   /:packageId/assignments/:id/revoke  { reason } — l'accès cesse aussitôt
 *   POST   /:packageId/assignments/:id/resend  nouveau lien (identité pas encore vérifiée)
 *   POST   /:packageId/share                   copie figée vérifiée (fichiers dans `volumes`) ; remplace la version précédente
 *   POST   /:packageId/versions                nouvelle version (brouillon) qui remplacera celle-ci au partage
 *   POST   /:packageId/close                   { reason }
 *   POST   /:packageId/notes                   note interne (jamais servie aux destinataires)
 *   POST   /:packageId/findings/:id/replies    réponse de l'équipe dans le fil d'un constat (lue par les destinataires)
 *   GET    /:packageId/findings/:id/attachments/:sha256
 *
 * Destinataire — `reviewsRouter`, monté sous `/reviews` (garde `loadReviewAccess` seule, `lib/reviews-recipient.ts`) :
 *   GET  /                          mes revues
 *   GET  /:packageId                le paquet (identité, objet, échéance, actions permises, statut Studio, documents, constats)
 *   GET  /:packageId/files/:format  fichier figé (?download=1 : pièce jointe, si accordé) ; en-têtes sûrs
 *   GET  /:packageId/report         rapport exporté (si accordé)
 *   POST /:packageId/findings       constat (document, objets, révision exacte du paquet, pièces jointes si accordées)
 *   POST /:packageId/findings/:id/replies | /recheck
 *   GET  /:packageId/findings/:id/attachments/:sha256
 *   POST /:packageId/response       { result: constats | satisfaisante, note? }
 *   POST /:packageId/approve | /refuse   approbateur nommé seulement (transitions Studio)
 *
 * Toute absence d'accès répond 404 sans rien révéler ; un droit insuffisant 403 avec motif.
 */
import express, { Router, type Request, type Response } from "express";
import { z } from "zod";
import { clientIp } from "../lib/audit.js";
import { mailLocale } from "../lib/mail-locale.js";
import { requireAuth } from "../middleware/require-auth.js";
import { StudioRequestError } from "../lib/studio-commands.js";
import { safeFileName } from "../lib/review-rules.js";
import { ReviewError } from "../lib/reviews-core.js";
import {
  addReviewAssignment, addReviewNote, closeReviewPackage, createReviewPackage, createReviewVersion, deleteReviewDraft, listProjectReviews, previewReviewAssignment,
  readTeamPackage, resendReviewInvitation, reviewAssignmentSchema, reviewNoteSchema, reviewPackageCreateSchema, reviewPackageUpdateSchema, reviewReasonSchema,
  reviewReplySchema, reviewVersionSchema, revokeReviewAssignment, shareReviewPackage, teamReplyToFinding, updateReviewPackage,
} from "../lib/reviews-team.js";
import {
  createFinding, decideReview, exportReviewReport, listMyReviews, readFindingAttachment, readMyReview, readReviewFile, recheckFinding, replyToFinding,
  respondToReview, reviewDecisionSchema, reviewFindingSchema, reviewRecheckSchema, reviewRecipientReplySchema, reviewResponseSchema,
} from "../lib/reviews-recipient.js";
import { db } from "../db/client.js";
import { reviewFindings, reviewPackages, volumes } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { sha256 } from "../lib/studio-publication-statuts.js";

type Handler = (req: Request, res: Response) => Promise<void>;
const endpoint = (fn: Handler) => async (req: Request, res: Response) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    await fn(req, res);
  } catch (error) {
    if (error instanceof ReviewError || error instanceof StudioRequestError) { res.status(error.status).json(error.body); return; }
    throw error;
  }
};
const param = (req: Request, name: string) => String((req.params as Record<string, string>)[name] ?? "");
function parse<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return null; }
  return parsed.data;
}
/** En-têtes d'un contenu figé servi à un destinataire : jamais interprété comme page, jamais mis en cache partagé. */
function safeContentHeaders(res: Response, mime: string, disposition: "inline" | "attachment", fileName: string, digest: string) {
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `${disposition}; filename="${safeFileName(fileName)}"`);
  res.setHeader("X-Content-SHA256", digest);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
}

// ---------------------------------------------------------------------------------------------------------------------
// Équipe interne

export const reviewsTeamRouter = Router({ mergeParams: true });
const pid = (req: Request) => param(req, "projectId");

reviewsTeamRouter.get("/", endpoint(async (req, res) => { res.json(await listProjectReviews(pid(req), req.user!.id)); }));
reviewsTeamRouter.post("/", endpoint(async (req, res) => {
  const input = parse(reviewPackageCreateSchema, req, res); if (!input) return;
  const created = await createReviewPackage(pid(req), req.user!.id, input, clientIp(req));
  res.status(201).json({ ...(await readTeamPackage(pid(req), created.id, req.user!.id)), replayed: created.replayed });
}));
reviewsTeamRouter.get("/:packageId", endpoint(async (req, res) => { res.json(await readTeamPackage(pid(req), param(req, "packageId"), req.user!.id)); }));
reviewsTeamRouter.patch("/:packageId", endpoint(async (req, res) => {
  const input = parse(reviewPackageUpdateSchema, req, res); if (!input) return;
  await updateReviewPackage(pid(req), param(req, "packageId"), req.user!.id, input, clientIp(req));
  res.json(await readTeamPackage(pid(req), param(req, "packageId"), req.user!.id));
}));
reviewsTeamRouter.delete("/:packageId", endpoint(async (req, res) => {
  await deleteReviewDraft(pid(req), param(req, "packageId"), req.user!.id, clientIp(req));
  res.status(204).end();
}));
reviewsTeamRouter.post("/:packageId/assignments/preview", endpoint(async (req, res) => {
  const input = parse(reviewAssignmentSchema, req, res); if (!input) return;
  res.json(await previewReviewAssignment(pid(req), param(req, "packageId"), req.user!.id, input));
}));
reviewsTeamRouter.post("/:packageId/assignments", endpoint(async (req, res) => {
  const input = parse(reviewAssignmentSchema, req, res); if (!input) return;
  const out = await addReviewAssignment(pid(req), param(req, "packageId"), req.user!.id, input, clientIp(req), mailLocale(req));
  res.status(201).json(out);
}));
reviewsTeamRouter.post("/:packageId/assignments/:assignmentId/revoke", endpoint(async (req, res) => {
  const input = parse(reviewReasonSchema, req, res); if (!input) return;
  await revokeReviewAssignment(pid(req), param(req, "packageId"), param(req, "assignmentId"), req.user!.id, input.reason, clientIp(req));
  res.json({ revoked: true });
}));
reviewsTeamRouter.post("/:packageId/assignments/:assignmentId/resend", endpoint(async (req, res) => {
  res.json(await resendReviewInvitation(pid(req), param(req, "packageId"), param(req, "assignmentId"), req.user!.id, clientIp(req), mailLocale(req)));
}));
reviewsTeamRouter.post("/:packageId/share", endpoint(async (req, res) => {
  res.json(await shareReviewPackage(pid(req), param(req, "packageId"), req.user!.id, clientIp(req), mailLocale(req)));
}));
reviewsTeamRouter.post("/:packageId/versions", endpoint(async (req, res) => {
  const input = parse(reviewVersionSchema, req, res); if (!input) return;
  res.status(201).json(await createReviewVersion(pid(req), param(req, "packageId"), req.user!.id, input, clientIp(req)));
}));
reviewsTeamRouter.post("/:packageId/close", endpoint(async (req, res) => {
  const input = parse(reviewReasonSchema, req, res); if (!input) return;
  await closeReviewPackage(pid(req), param(req, "packageId"), req.user!.id, input.reason, clientIp(req));
  res.json({ closed: true });
}));
reviewsTeamRouter.post("/:packageId/notes", endpoint(async (req, res) => {
  const input = parse(reviewNoteSchema, req, res); if (!input) return;
  res.status(201).json(await addReviewNote(pid(req), param(req, "packageId"), req.user!.id, input.body));
}));
reviewsTeamRouter.post("/:packageId/findings/:observationId/replies", endpoint(async (req, res) => {
  const input = parse(reviewReplySchema, req, res); if (!input) return;
  res.status(201).json(await teamReplyToFinding(pid(req), param(req, "packageId"), param(req, "observationId"), req.user!.id, input.body));
}));
reviewsTeamRouter.get("/:packageId/findings/:observationId/attachments/:digest", endpoint(async (req, res) => {
  // L'équipe lit le détail (droit vérifié par `readTeamPackage`), puis la pièce du constat de la lignée.
  const detail = await readTeamPackage(pid(req), param(req, "packageId"), req.user!.id);
  const finding = detail.findings.find((f) => f.id === param(req, "observationId"));
  const att = finding?.attachments.find((a) => a.sha256 === param(req, "digest"));
  const [row] = att ? await db.select({ packageId: reviewFindings.packageId }).from(reviewFindings).innerJoin(reviewPackages, eq(reviewPackages.id, reviewFindings.packageId))
    .where(and(eq(reviewFindings.observationId, finding!.id), eq(reviewPackages.projectId, pid(req)))).limit(1) : [];
  if (!att || !row) { res.status(404).json({ error: "not_found" }); return; }
  const [volume] = await db.select().from(volumes).where(eq(volumes.id, att.sha256)).limit(1);
  if (!volume || sha256(volume.content) !== att.sha256) throw new Error("review_attachment_volume_corrupt");
  safeContentHeaders(res, att.mime, "attachment", att.name, att.sha256);
  res.status(200).send(Buffer.from(volume.content));
}));

// ---------------------------------------------------------------------------------------------------------------------
// Destinataire

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);
const pk = (req: Request) => param(req, "packageId");

reviewsRouter.get("/", endpoint(async (req, res) => { res.json(await listMyReviews(req.user!.id)); }));
reviewsRouter.get("/:packageId", endpoint(async (req, res) => { res.json(await readMyReview(pk(req), req.user!.id)); }));
reviewsRouter.get("/:packageId/files/:format", endpoint(async (req, res) => {
  const out = await readReviewFile(pk(req), req.user!.id, param(req, "format"), req.query["download"] === "1");
  safeContentHeaders(res, out.file.mime, out.disposition, out.file.fileName, out.file.sha256);
  // Finalité et statut affichés sur le contenu servi (concept : matériel étiqueté de sa finalité et de son statut).
  res.setHeader("X-Review-Purpose", "revue-externe");
  res.setHeader("X-Review-Package-Status", out.packageStatus);
  res.setHeader("X-Review-Package-Version", String(out.version));
  res.status(200).send(Buffer.from(out.content));
}));
reviewsRouter.get("/:packageId/report", endpoint(async (req, res) => {
  const report = await exportReviewReport(pk(req), req.user!.id);
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(`revue-${report.package.title}-v${report.package.version}.json`)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json(report);
}));
// Constat : corps lu ici (pièces jointes en base64, 5 × 2 Mo au plus), hors de la limite générale de 256 ko.
reviewsRouter.post("/:packageId/findings", express.json({ limit: "16mb" }), endpoint(async (req, res) => {
  const input = parse(reviewFindingSchema, req, res); if (!input) return;
  res.status(201).json(await createFinding(pk(req), req.user!.id, input, clientIp(req)));
}));
reviewsRouter.post("/:packageId/findings/:observationId/replies", endpoint(async (req, res) => {
  const input = parse(reviewRecipientReplySchema, req, res); if (!input) return;
  res.status(201).json(await replyToFinding(pk(req), req.user!.id, param(req, "observationId"), input.body));
}));
reviewsRouter.post("/:packageId/findings/:observationId/recheck", endpoint(async (req, res) => {
  const input = parse(reviewRecheckSchema, req, res); if (!input) return;
  res.json(await recheckFinding(pk(req), req.user!.id, param(req, "observationId"), input, clientIp(req)));
}));
reviewsRouter.get("/:packageId/findings/:observationId/attachments/:digest", endpoint(async (req, res) => {
  const out = await readFindingAttachment(pk(req), req.user!.id, param(req, "observationId"), param(req, "digest"));
  safeContentHeaders(res, out.attachment.mime, "attachment", out.attachment.name, out.attachment.sha256);
  res.status(200).send(Buffer.from(out.content));
}));
reviewsRouter.post("/:packageId/response", endpoint(async (req, res) => {
  const input = parse(reviewResponseSchema, req, res); if (!input) return;
  res.json(await respondToReview(pk(req), req.user!.id, input, clientIp(req)));
}));
reviewsRouter.post("/:packageId/approve", endpoint(async (req, res) => {
  const input = parse(reviewDecisionSchema, req, res); if (!input) return;
  res.json(await decideReview(pk(req), req.user!.id, "approuver", input, clientIp(req)));
}));
reviewsRouter.post("/:packageId/refuse", endpoint(async (req, res) => {
  const input = parse(reviewDecisionSchema, req, res); if (!input) return;
  if (!input.comment) { res.status(400).json({ error: "invalid_input", code: "comment_required", message: "Un motif est requis pour refuser." }); return; }
  res.json(await decideReview(pk(req), req.user!.id, "refuser", input, clientIp(req)));
}));
