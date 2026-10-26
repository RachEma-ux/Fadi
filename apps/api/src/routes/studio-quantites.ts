/**
 * Ajustements manuels du métré Studio (E.3-05) — monté depuis `routes/studio.ts` (sous `/projects/:projectId/studio`,
 * authentification et analyse JSON déjà posées). Règles pures : `lib/studio-quantites.ts`.
 *   GET  /studies/:studyId/variants/:variantId/ajustements-quantites   journal de la variante (ordre des séquences) et
 *                                                                      statut de chaque ajustement pour la tête
 *   POST /studies/:studyId/variants/:variantId/ajustements-quantites   nouvel ajustement (201 ; `baseSequence` exacte,
 *                                                                      révision de tête, rejeu par requestId)
 * Un ajustement n'écrit que sa ligne de journal : jamais le document, jamais la quantité brute.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import { evaluerAjustementsQuantites, quantitesStudio, validateStudioDocument } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioQuantityAdjustments, studioRevisions, studioVariants, users } from "../db/schema.js";
import { newId } from "../lib/ids.js";
import { loadProjectAccess, projectAccessRefusal } from "../lib/owned-project.js";
import type { Querier } from "../lib/step-rows.js";
import { assertAccess, lockedAccess, notFound, studioArchivedRefusal, StudioRequestError, studyOf } from "../lib/studio-commands.js";
import { rejeuAdmis } from "../lib/studio-exigences.js";
import { ajustementDe, deciderAjustement, empreinteAjustement, studioAjustementSchema, type LigneAjustement } from "../lib/studio-quantites.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_AJUSTEMENTS_LISTER, CONTRAT_AJUSTEMENT_CREER } from "../lib/studio-contrats-routes.js";

export const studioQuantitesRouter = Router({ mergeParams: true });

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
const chemin = "/studies/:studyId/variants/:variantId/ajustements-quantites";

async function emails(q: Querier, ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}
async function varianteDe(q: Querier, studyId: string, variantId: string) {
  const [variant] = await q.select().from(studioVariants).where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).limit(1);
  return variant ?? notFound();
}
async function journalDe(q: Querier, variantId: string): Promise<LigneAjustement[]> {
  return await q.select().from(studioQuantityAdjustments).where(eq(studioQuantityAdjustments.variantId, variantId)).orderBy(asc(studioQuantityAdjustments.seq)) as LigneAjustement[];
}

studioQuantitesRouter.get(chemin, avecContrat(CONTRAT_AJUSTEMENTS_LISTER), endpoint(async (req, res) => {
  const actorId = req.user!.id;
  const access = assertAccess(await loadProjectAccess(param(req, "projectId"), actorId), actorId, "read");
  const study = await studyOf(db, access.id, param(req, "studyId"));
  const variant = await varianteDe(db, study.id, param(req, "variantId"));
  const rows = await journalDe(db, variant.id);
  const email = await emails(db, rows.map((r) => r.authorId));
  const ajustements = rows.map((r) => ajustementDe(r, email));
  const [head] = await db.select({ document: studioRevisions.document }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, variant.headRevisionId), eq(studioRevisions.variantId, variant.id))).limit(1);
  // Statuts pour la tête (autorité du serveur) ; le client recalcule pour la révision ou le brouillon qu'il affiche.
  let statuts: { id: string; statut: string; revue?: string }[] = [];
  if (head) {
    const doc = validateStudioDocument(head.document);
    statuts = evaluerAjustementsQuantites(doc, quantitesStudio(doc), ajustements).journal.map((l) => ({ id: l.ajustement.id, statut: l.statut, ...(l.revue ? { revue: l.revue } : {}) }));
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    studyId: study.id, variantId: variant.id, headRevisionId: variant.headRevisionId, sequence: rows.at(-1)?.seq ?? 0,
    peutAjuster: study.archivedAt === null && variant.archivedAt === null && projectAccessRefusal(access, actorId, "modify", { studyId: study.id, variantIds: [variant.id] }) === null,
    ajustements, statuts,
  });
}));

studioQuantitesRouter.post(chemin, avecContrat(CONTRAT_AJUSTEMENT_CREER), endpoint(async (req, res) => {
  const parsed = studioAjustementSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const input = parsed.data;
  const actorId = req.user!.id;
  const out = await db.transaction(async (tx) => {
    const access = await lockedAccess(tx, param(req, "projectId"), actorId);
    const study = await studyOf(tx, param(req, "projectId"), param(req, "studyId"));
    // Portée étroite : Concepteur de l'étude ou de cette variante (l'identifiant de l'adresse, résolu juste après : une
    // variante d'une autre étude reste un 404).
    assertAccess(access, actorId, "modify", { studyId: study.id, variantIds: [param(req, "variantId")] });
    const variant = await varianteDe(tx, study.id, param(req, "variantId"));
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    const hash = empreinteAjustement(input);
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioQuantityAdjustments)
        .where(and(eq(studioQuantityAdjustments.variantId, variant.id), eq(studioQuantityAdjustments.requestId, input.requestId))).limit(1);
      if (previous) {
        const refus = rejeuAdmis(previous, actorId, hash);
        if (refus) throw new StudioRequestError(refus.status, refus.body);
        return { ...ajustementDe(previous as LigneAjustement, await emails(tx, [previous.authorId])), replayed: true };
      }
    }
    // Journal de la variante (borné par STUDIO_LIMITES_AJUSTEMENTS.journal) : dernière séquence et ajustements d'objets en
    // vigueur sur la tête, repris dans l'état d'un total de calque.
    const journal = await journalDe(tx, variant.id);
    const last = journal.at(-1);
    const [revision] = await tx.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
      .where(and(eq(studioRevisions.id, variant.headRevisionId), eq(studioRevisions.variantId, variant.id))).limit(1);
    if (!revision) return notFound();
    const d = deciderAjustement(input, { derniereSequence: last?.seq ?? 0, headRevisionId: variant.headRevisionId, document: revision.document, journal: journal.map((r) => ajustementDe(r, new Map())) });
    if ("refus" in d) throw new StudioRequestError(d.refus.status, d.refus.body);
    const [row] = await tx.insert(studioQuantityAdjustments).values({
      id: newId("studio_quantity_adjustment"), studyId: study.id, variantId: variant.id, revisionId: revision.id, ...d.ok,
      authorId: actorId, requestId: input.requestId ?? null, payloadHash: hash,
    }).returning();
    return { ...ajustementDe(row as LigneAjustement, await emails(tx, [actorId])), replayed: false };
  });
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));
