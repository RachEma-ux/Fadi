/**
 * Modèles externes (partenaires) d'une variante Studio (lot F3, TR-EX-066) — monté depuis `routes/studio.ts` (sous
 * `/projects/:projectId/studio`, authentification posée ; corps JSON jusqu'à 6 Mo pour le fichier reçu). Règles pures :
 * `lib/studio-modeles-externes.ts` (et `@parcours/atelier-model`, `echanges/modeles-externes.ts`).
 *   GET  /studies/:studyId/variants/:variantId/modeles-externes                     modèles reçus (sans le fichier), plus récent d'abord
 *   POST /studies/:studyId/variants/:variantId/modeles-externes                     réception (201) : relu, comparé à la tête, journalisé
 *   GET  /studies/:studyId/variants/:variantId/modeles-externes/:modelId            un modèle, sa comparaison et son journal
 *   GET  /studies/:studyId/variants/:variantId/modeles-externes/:modelId/contenu    texte du fichier reçu (JSON, droit `export`), pour l'ajouter au brouillon
 *   GET  /studies/:studyId/variants/:variantId/modeles-externes/:modelId/provenance métadonnées de provenance (EX-014, `studio-provenance-modele/1`, droit `export`)
 *   POST /studies/:studyId/variants/:variantId/modeles-externes/:modelId/:action    comparer | accepter | refuser
 * Aucun de ces passages ne modifie la variante : seul un import explicite dans le brouillon, puis « Enregistrer », le fait.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import { STUDIO_ACTIONS_MODELE_EXTERNE, studioProvenanceModeleExterne, type StudioActionModeleExterne, type StudioIfcRapport, type StudioMetaModeleExterne } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioExternalModelEvents, studioExternalModels, studioRevisions, studioVariants, users } from "../db/schema.js";
import type { Tx } from "../lib/atelier-validation.js";
import { newId } from "../lib/ids.js";
import { loadProjectAccess, projectAccessRefusal } from "../lib/owned-project.js";
import type { Querier } from "../lib/step-rows.js";
import { assertAccess, lockedAccess, notFound, studioArchivedRefusal, StudioRequestError, studyOf } from "../lib/studio-commands.js";
import {
  decideComparaison, deciderPassage, deciderReception, empreinteRequete, rejeuAdmis, studioModelePassageSchema, studioModeleReceptionSchema, type Decision,
} from "../lib/studio-modeles-externes.js";
import { avecContrat } from "../lib/studio-contrats.js";
import { CONTRAT_MODELES_EXTERNES_LISTER, CONTRAT_MODELE_EXTERNE_LIRE, CONTRAT_MODELE_EXTERNE_CONTENU, CONTRAT_MODELE_EXTERNE_PROVENANCE, CONTRAT_MODELE_EXTERNE_RECEVOIR, CONTRAT_MODELE_EXTERNE_ACTION } from "../lib/studio-contrats-routes.js";

export const studioModelesExternesRouter = Router({ mergeParams: true });

const base = "/studies/:studyId/variants/:variantId/modeles-externes";

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
function unwrap<T>(d: Decision<T>): T {
  if ("refus" in d) throw new StudioRequestError(d.refus.status, d.refus.body);
  return d.ok;
}

type ModelRow = typeof studioExternalModels.$inferSelect;
type EventRow = typeof studioExternalModelEvents.$inferSelect;

async function emails(q: Querier, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}
const metaDe = (row: ModelRow): StudioMetaModeleExterne => ({
  reference: row.reference, auteur: row.authorName, discipline: row.discipline, format: row.format, version: row.versionLabel,
  uniteDeclaree: row.declaredUnit, transformation: row.transformation ?? null, nomFichier: row.fileName,
  repereSource: row.sourceFrame ?? null, restrictions: row.usageRestrictions ?? null,
});
function vue(row: ModelRow, email: Map<string, string>, events?: EventRow[]) {
  return {
    id: row.id, studyId: row.studyId, variantId: row.variantId, ...metaDe(row), contentSha256: row.contentDigest,
    statut: row.status, rapport: row.report, comparaison: row.comparison, revisionComparee: row.comparedRevisionId,
    decision: row.decidedBy ? { par: row.decidedBy, parEmail: email.get(row.decidedBy) ?? null, le: row.decidedAt?.toISOString() ?? null, motif: row.decisionMotif } : null,
    recuPar: row.createdBy, recuParEmail: email.get(row.createdBy) ?? null, recuLe: row.createdAt.toISOString(),
    ...(events ? { journal: events.map((e) => ({ seq: e.seq, action: e.action, par: e.actorId, parEmail: email.get(e.actorId) ?? null, revisionId: e.revisionId, motif: e.motif, le: e.createdAt.toISOString() })) } : {}),
  };
}

async function variante(q: Querier, studyId: string, variantId: string) {
  const [v] = await q.select().from(studioVariants).where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).limit(1);
  return v ?? notFound();
}
async function tete(q: Querier, variantId: string, headRevisionId: string) {
  const [r] = await q.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, headRevisionId), eq(studioRevisions.variantId, variantId))).limit(1);
  return r ? { revisionId: r.id, document: r.document } : notFound();
}
async function modele(q: Querier, variantId: string, modelId: string): Promise<ModelRow> {
  const [m] = await q.select().from(studioExternalModels).where(and(eq(studioExternalModels.id, modelId), eq(studioExternalModels.variantId, variantId))).limit(1);
  return m ?? notFound();
}
async function journal(q: Querier, modelId: string): Promise<EventRow[]> {
  return q.select().from(studioExternalModelEvents).where(eq(studioExternalModelEvents.modelId, modelId)).orderBy(asc(studioExternalModelEvents.seq));
}
async function evenement(tx: Tx, modelId: string, action: EventRow["action"], actorId: string, revisionId: string | null, motif: string | null) {
  const seqs = (await tx.select({ seq: studioExternalModelEvents.seq }).from(studioExternalModelEvents).where(eq(studioExternalModelEvents.modelId, modelId))).map((r) => r.seq);
  await tx.insert(studioExternalModelEvents).values({ id: newId("studio_external_model_event"), modelId, seq: Math.max(0, ...seqs) + 1, action, actorId, revisionId, motif });
}

/** Lecture : étude et variante du projet, droit `read` ; rend aussi si le compte peut accepter ou refuser. */
async function lecture(req: Request) {
  const access = assertAccess(await loadProjectAccess(param(req, "projectId"), req.user!.id), req.user!.id, "read");
  const study = await studyOf(db, access.id, param(req, "studyId"));
  const v = await variante(db, study.id, param(req, "variantId"));
  return { access, study, variant: v };
}

studioModelesExternesRouter.get(base, avecContrat(CONTRAT_MODELES_EXTERNES_LISTER), endpoint(async (req, res) => {
  const { access, study, variant } = await lecture(req);
  const rows = await db.select().from(studioExternalModels).where(eq(studioExternalModels.variantId, variant.id))
    .orderBy(desc(studioExternalModels.createdAt), desc(studioExternalModels.id)).limit(200);
  const email = await emails(db, rows.flatMap((r) => [r.createdBy, r.decidedBy]));
  const archive = study.archivedAt !== null || variant.archivedAt !== null;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    peutRecevoir: !archive && projectAccessRefusal(access, req.user!.id, "modify") === null,
    peutDecider: !archive && projectAccessRefusal(access, req.user!.id, "approve") === null,
    teteRevisionId: variant.headRevisionId,
    modeles: rows.map((r) => vue(r, email)),
  });
}));

studioModelesExternesRouter.get(`${base}/:modelId`, avecContrat(CONTRAT_MODELE_EXTERNE_LIRE), endpoint(async (req, res) => {
  const { variant } = await lecture(req);
  const row = await modele(db, variant.id, param(req, "modelId"));
  const events = await journal(db, row.id);
  res.setHeader("Cache-Control", "private, no-store");
  res.json(vue(row, await emails(db, [row.createdBy, row.decidedBy, ...events.map((e) => e.actorId)]), events));
}));

// Provenance (EX-014) : ce que l'émetteur déclare (auteur, version, unité, repère source, transformation, restrictions)
// et ce que le serveur a lu et calculé (schéma, unité lue, empreinte SHA-256, horodatage) ; elle sort du projet : `export`.
studioModelesExternesRouter.get(`${base}/:modelId/provenance`, avecContrat(CONTRAT_MODELE_EXTERNE_PROVENANCE), endpoint(async (req, res) => {
  const { access, variant } = await lecture(req);
  assertAccess(access, req.user!.id, "export");
  const row = await modele(db, variant.id, param(req, "modelId"));
  const provenance = studioProvenanceModeleExterne({
    id: row.id, meta: metaDe(row), contentSha256: row.contentDigest, recuLe: row.createdAt.toISOString(), statut: row.status,
    rapport: row.report as unknown as Pick<StudioIfcRapport, "schema" | "unite">,
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="provenance-${row.id}.json"`);
  res.json(provenance);
}));

studioModelesExternesRouter.get(`${base}/:modelId/contenu`, avecContrat(CONTRAT_MODELE_EXTERNE_CONTENU), endpoint(async (req, res) => {
  const { access, variant } = await lecture(req);
  // Le fichier reçu sort du projet tel quel : droit `export` (refusé à l'accès support, lecture seule).
  assertAccess(access, req.user!.id, "export");
  const row = await modele(db, variant.id, param(req, "modelId"));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ id: row.id, statut: row.status, nomFichier: row.fileName, contentSha256: row.contentDigest, transformation: row.transformation ?? null, contenu: row.content });
}));

/** Écriture : verrou du projet, droit `need`, étude et variante actives ; rend la variante et la tête courante. */
async function ecriture(tx: Tx, req: Request) {
  const actorId = req.user!.id;
  const access = await lockedAccess(tx, param(req, "projectId"), actorId);
  const study = await studyOf(tx, param(req, "projectId"), param(req, "studyId"));
  const v = await variante(tx, study.id, param(req, "variantId"));
  if (study.archivedAt !== null || v.archivedAt !== null) return studioArchivedRefusal();
  return { access, study, variant: v, habilite: projectAccessRefusal(access, actorId, "approve") === null, assertModify: () => assertAccess(access, actorId, "modify") };
}

studioModelesExternesRouter.post(base, avecContrat(CONTRAT_MODELE_EXTERNE_RECEVOIR), endpoint(async (req, res) => {
  const parsed = studioModeleReceptionSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const input = parsed.data;
  const actorId = req.user!.id;
  const out = await db.transaction(async (tx) => {
    const e = await ecriture(tx, req);
    e.assertModify();
    const { requestId: _r, ...corps } = input;
    const hash = empreinteRequete(corps);
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioExternalModels).where(and(eq(studioExternalModels.variantId, e.variant.id), eq(studioExternalModels.requestId, input.requestId))).limit(1);
      if (previous) {
        const refus = rejeuAdmis({ authorId: previous.createdBy, payloadHash: previous.payloadHash }, actorId, hash);
        if (refus) throw new StudioRequestError(refus.status, refus.body);
        return { ...vue(previous, await emails(tx, [previous.createdBy])), replayed: true };
      }
    }
    const t = await tete(tx, e.variant.id, e.variant.headRevisionId);
    const r = unwrap(deciderReception(input, t));
    const id = newId("studio_external_model");
    const [row] = await tx.insert(studioExternalModels).values({
      id, studyId: e.study.id, variantId: e.variant.id, reference: r.meta.reference, authorName: r.meta.auteur, discipline: r.meta.discipline,
      format: r.meta.format, versionLabel: r.meta.version, declaredUnit: r.meta.uniteDeclaree, transformation: r.meta.transformation, fileName: r.meta.nomFichier,
      sourceFrame: r.meta.repereSource, usageRestrictions: r.meta.restrictions,
      content: input.contenu, contentDigest: r.contentSha256, report: r.rapport as unknown as Record<string, unknown>,
      comparison: r.comparaison as unknown as Record<string, unknown>, comparedRevisionId: t.revisionId, status: "compare",
      createdBy: actorId, requestId: input.requestId ?? null, payloadHash: hash,
    }).returning();
    await evenement(tx, id, "recevoir", actorId, t.revisionId, null);
    return { ...vue(row!, await emails(tx, [actorId])), replayed: false };
  });
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));

studioModelesExternesRouter.post(`${base}/:modelId/:action`, avecContrat(CONTRAT_MODELE_EXTERNE_ACTION), endpoint(async (req, res) => {
  const action = param(req, "action");
  if (!(STUDIO_ACTIONS_MODELE_EXTERNE as readonly string[]).includes(action)) { res.status(404).json({ error: "not_found" }); return; }
  const parsed = studioModelePassageSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const actorId = req.user!.id;
  const out = await db.transaction(async (tx) => {
    const e = await ecriture(tx, req);
    // Comparer exige le droit d'écriture ; accepter / refuser, le rôle habilité (`approve` : propriétaire ou approbateur).
    if (action === "comparer") e.assertModify();
    else assertAccess(e.access, actorId, "approve");
    const row = await modele(tx, e.variant.id, param(req, "modelId"));
    const t = await tete(tx, e.variant.id, e.variant.headRevisionId);
    const statut = unwrap(deciderPassage(
      { statut: row.status, revisionComparee: row.comparedRevisionId, uniteLue: (row.report as { unite?: { facteur?: unknown } }).unite?.facteur != null },
      action as StudioActionModeleExterne,
      { habilite: e.habilite, revisionCourante: t.revisionId, motif: parsed.data.motif ?? null },
    ));
    const maintenant = new Date();
    if (action === "comparer") {
      const comparaison = decideComparaison(row.content, metaDe(row), t);
      await tx.update(studioExternalModels).set({ comparison: comparaison as unknown as Record<string, unknown>, comparedRevisionId: t.revisionId, updatedAt: maintenant }).where(eq(studioExternalModels.id, row.id));
    } else {
      await tx.update(studioExternalModels).set({ status: statut, decidedBy: actorId, decidedAt: maintenant, decisionMotif: parsed.data.motif ?? null, updatedAt: maintenant }).where(eq(studioExternalModels.id, row.id));
    }
    await evenement(tx, row.id, action as EventRow["action"], actorId, t.revisionId, parsed.data.motif ?? null);
    const relu = await modele(tx, e.variant.id, row.id);
    const events = await journal(tx, row.id);
    return vue(relu, await emails(tx, [relu.createdBy, relu.decidedBy, ...events.map((x) => x.actorId)]), events);
  });
  res.json(out);
}));
