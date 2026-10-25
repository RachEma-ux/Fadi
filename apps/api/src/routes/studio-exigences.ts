/**
 * Exigences Studio (E.1-02 à E.1-06) — monté depuis `routes/studio.ts` (sous `/projects/:projectId/studio`,
 * authentification et analyse JSON déjà posées). Règles pures : `lib/studio-exigences.ts`.
 *   GET  /studies/:studyId/exigences                                  versions (résumés, plus récente d'abord) et jeu courant
 *   GET  /studies/:studyId/exigences/versions/:version                une version
 *   POST /studies/:studyId/exigences                                  nouvelle version (201 ; `baseVersion` exacte, rejeu par requestId)
 *   POST /studies/:studyId/exigences/acceptations                     acceptation d'une référence partenaire (201 : version suivante)
 *   GET  /studies/:studyId/variants/:variantId/controles              contrôles de la variante (plus récent d'abord)
 *   POST /studies/:studyId/variants/:variantId/controles              contrôle d'une révision par une version (201, enregistré)
 *   GET  /studies/:studyId/variants/:variantId/controles/:checkId     un contrôle
 * Un contrôle n'écrit que son résultat : jamais l'exigence, jamais le document.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { ExigenceStudio, JeuExigences, StudioDocument } from "@parcours/atelier-model";
import { rapprocherVariante } from "../lib/studio-observations-rapprochement.js";
import { db } from "../db/client.js";
import { studioRequirementChecks, studioRequirementSets, studioRevisions, studioVariants, users } from "../db/schema.js";
import type { Tx } from "../lib/atelier-validation.js";
import { newId } from "../lib/ids.js";
import { loadProjectAccess } from "../lib/owned-project.js";
import type { Querier } from "../lib/step-rows.js";
import { assertAccess, lockedAccess, notFound, studioArchivedRefusal, StudioRequestError, studyOf } from "../lib/studio-commands.js";
import {
  deciderAcceptation, deciderEdition, empreinte, rejeuAdmis, resultatControle, studioControleSchema, studioExigenceAcceptationSchema,
  studioExigencesEditionSchema, versionExaminee, type Decision,
} from "../lib/studio-exigences.js";

export const studioExigencesRouter = Router({ mergeParams: true });

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

type SetRow = typeof studioRequirementSets.$inferSelect;
type CheckRow = typeof studioRequirementChecks.$inferSelect;

async function emails(q: Querier, ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}
function jeuDe(row: SetRow, email: Map<string, string>): JeuExigences & { auteurEmail: string | null } {
  return {
    studyId: row.studyId, version: row.version, exigences: row.requirements, auteur: row.authorId, auteurEmail: email.get(row.authorId) ?? null,
    creeLe: row.createdAt.toISOString(), ...(row.motif ? { motif: row.motif } : {}),
  };
}
function controleDe(row: CheckRow, email: Map<string, string>) {
  return {
    id: row.id, studyId: row.studyId, variantId: row.variantId, revisionId: row.revisionId, version: row.setVersion,
    execution: row.execution, conclusion: row.conclusion, documentHash: row.documentHash,
    auteur: row.authorId, auteurEmail: email.get(row.authorId) ?? null, creeLe: row.createdAt.toISOString(), resultat: row.result,
  };
}
async function derniere(q: Querier, studyId: string): Promise<SetRow | null> {
  const [row] = await q.select().from(studioRequirementSets).where(eq(studioRequirementSets.studyId, studyId)).orderBy(desc(studioRequirementSets.version)).limit(1);
  return row ?? null;
}

studioExigencesRouter.get("/studies/:studyId/exigences", endpoint(async (req, res) => {
  const projectId = param(req, "projectId");
  const access = assertAccess(await loadProjectAccess(projectId, req.user!.id), req.user!.id, "read");
  const study = await studyOf(db, access.id, param(req, "studyId"));
  const rows = await db.select().from(studioRequirementSets).where(eq(studioRequirementSets.studyId, study.id)).orderBy(desc(studioRequirementSets.version));
  const email = await emails(db, rows.map((r) => r.authorId));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    studyId: study.id,
    // Acceptation d'une référence partenaire : réservée au propriétaire (même règle que la route d'acceptation).
    peutAccepter: access.role === "proprietaire" && study.archivedAt === null,
    courante: rows[0] ? jeuDe(rows[0], email) : null,
    versions: rows.map((r) => ({ version: r.version, nombre: r.requirements.length, auteur: r.authorId, auteurEmail: email.get(r.authorId) ?? null, creeLe: r.createdAt.toISOString(), motif: r.motif })),
  });
}));

studioExigencesRouter.get("/studies/:studyId/exigences/versions/:version", endpoint(async (req, res) => {
  const projectId = param(req, "projectId");
  const access = assertAccess(await loadProjectAccess(projectId, req.user!.id), req.user!.id, "read");
  const study = await studyOf(db, access.id, param(req, "studyId"));
  const raw = param(req, "version");
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) return notFound();
  const [row] = await db.select().from(studioRequirementSets).where(and(eq(studioRequirementSets.studyId, study.id), eq(studioRequirementSets.version, Number(raw)))).limit(1);
  if (!row) return notFound();
  res.setHeader("Cache-Control", "private, no-store");
  res.json(jeuDe(row, await emails(db, [row.authorId])));
}));

/** Étude du projet sous verrou, droit `need`, étude active ; renvoie l'étude et la dernière version. */
async function etudeEcrite(tx: Tx, projectId: string, studyId: string, actorId: string, need: "modify" | "owner" | "write") {
  const access = await lockedAccess(tx, projectId, actorId);
  const study = await studyOf(tx, projectId, studyId);
  assertAccess(access, actorId, need);
  if (study.archivedAt !== null) return studioArchivedRefusal();
  return { study, courante: await derniere(tx, study.id) };
}

/** Enregistre une version (ou rejoue celle du même `requestId`). */
async function enregistrerVersion(tx: Tx, studyId: string, actorId: string, requestId: string | undefined, payloadHash: string, decision: () => { version: number; exigences: ExigenceStudio[] }, motif?: string) {
  if (requestId !== undefined) {
    const [previous] = await tx.select().from(studioRequirementSets).where(and(eq(studioRequirementSets.studyId, studyId), eq(studioRequirementSets.requestId, requestId))).limit(1);
    if (previous) {
      const refus = rejeuAdmis(previous, actorId, payloadHash);
      if (refus) throw new StudioRequestError(refus.status, refus.body);
      return { row: previous, replayed: true };
    }
  }
  const next = decision();
  const [row] = await tx.insert(studioRequirementSets).values({
    id: newId("studio_requirement_set"), studyId, version: next.version, requirements: next.exigences, motif: motif ?? null,
    authorId: actorId, requestId: requestId ?? null, payloadHash,
  }).returning();
  return { row: row!, replayed: false };
}

studioExigencesRouter.post("/studies/:studyId/exigences", endpoint(async (req, res) => {
  const parsed = studioExigencesEditionSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const input = parsed.data;
  const actorId = req.user!.id;
  const out = await db.transaction(async (tx) => {
    const { study, courante } = await etudeEcrite(tx, param(req, "projectId"), param(req, "studyId"), actorId, "modify");
    const hash = empreinte({ action: "editer", baseVersion: input.baseVersion, exigences: input.exigences, motif: input.motif ?? null });
    const r = await enregistrerVersion(tx, study.id, actorId, input.requestId, hash, () => unwrap(deciderEdition(courante ? { version: courante.version, exigences: courante.requirements } : null, input)), input.motif);
    return { ...jeuDe(r.row, await emails(tx, [r.row.authorId])), replayed: r.replayed };
  });
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));

studioExigencesRouter.post("/studies/:studyId/exigences/acceptations", endpoint(async (req, res) => {
  const parsed = studioExigenceAcceptationSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const input = parsed.data;
  const actor = req.user!;
  const out = await db.transaction(async (tx) => {
    const { study, courante } = await etudeEcrite(tx, param(req, "projectId"), param(req, "studyId"), actor.id, "owner");
    const hash = empreinte({ action: "accepter", baseVersion: input.baseVersion, exigenceId: input.exigenceId });
    const r = await enregistrerVersion(tx, study.id, actor.id, input.requestId, hash, () => unwrap(deciderAcceptation(courante ? { version: courante.version, exigences: courante.requirements } : null, input, actor, new Date())),
      `Acceptation de la référence partenaire de l’exigence ${input.exigenceId}`);
    return { ...jeuDe(r.row, await emails(tx, [r.row.authorId])), replayed: r.replayed };
  });
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));

const controlesPath = "/studies/:studyId/variants/:variantId/controles";

async function varianteDe(q: Querier, studyId: string, variantId: string) {
  const [variant] = await q.select().from(studioVariants).where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).limit(1);
  return variant ?? notFound();
}

studioExigencesRouter.get(controlesPath, endpoint(async (req, res) => {
  const access = assertAccess(await loadProjectAccess(param(req, "projectId"), req.user!.id), req.user!.id, "read");
  const study = await studyOf(db, access.id, param(req, "studyId"));
  const variant = await varianteDe(db, study.id, param(req, "variantId"));
  const rows = await db.select().from(studioRequirementChecks).where(and(eq(studioRequirementChecks.studyId, study.id), eq(studioRequirementChecks.variantId, variant.id)))
    .orderBy(desc(studioRequirementChecks.createdAt), desc(studioRequirementChecks.id)).limit(200);
  const email = await emails(db, rows.map((r) => r.authorId));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ controles: rows.map((r) => controleDe(r, email)) });
}));

studioExigencesRouter.get(`${controlesPath}/:checkId`, endpoint(async (req, res) => {
  const access = assertAccess(await loadProjectAccess(param(req, "projectId"), req.user!.id), req.user!.id, "read");
  const study = await studyOf(db, access.id, param(req, "studyId"));
  const variant = await varianteDe(db, study.id, param(req, "variantId"));
  const [row] = await db.select().from(studioRequirementChecks)
    .where(and(eq(studioRequirementChecks.id, param(req, "checkId")), eq(studioRequirementChecks.variantId, variant.id))).limit(1);
  if (!row) return notFound();
  res.setHeader("Cache-Control", "private, no-store");
  res.json(controleDe(row, await emails(db, [row.authorId])));
}));

studioExigencesRouter.post(controlesPath, endpoint(async (req, res) => {
  const parsed = studioControleSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() }); return; }
  const input = parsed.data;
  const actorId = req.user!.id;
  const out = await db.transaction(async (tx) => {
    const { study } = await etudeEcrite(tx, param(req, "projectId"), param(req, "studyId"), actorId, "write");
    const variant = await varianteDe(tx, study.id, param(req, "variantId"));
    if (variant.archivedAt !== null) return studioArchivedRefusal();
    const revisionId = input.revisionId ?? variant.headRevisionId;
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioRequirementChecks).where(and(eq(studioRequirementChecks.variantId, variant.id), eq(studioRequirementChecks.requestId, input.requestId))).limit(1);
      if (previous) {
        const memeDemande = previous.authorId === actorId && previous.revisionId === revisionId && (input.version === undefined || previous.setVersion === input.version);
        if (!memeDemande) throw new StudioRequestError(409, { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." });
        return { ...controleDe(previous, await emails(tx, [previous.authorId])), replayed: true };
      }
    }
    const [revision] = await tx.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
      .where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variant.id))).limit(1);
    if (!revision) return notFound();
    const versions = (await tx.select({ version: studioRequirementSets.version }).from(studioRequirementSets).where(eq(studioRequirementSets.studyId, study.id))).map((r) => r.version);
    const version = unwrap(versionExaminee(versions, input.version));
    const [jeu] = version === null ? [] : await tx.select().from(studioRequirementSets).where(and(eq(studioRequirementSets.studyId, study.id), eq(studioRequirementSets.version, version))).limit(1);
    const { result, execution, conclusion } = resultatControle(study.id, revision.id, revision.document, jeu ? { version: jeu.version, exigences: jeu.requirements } : null);
    const [row] = await tx.insert(studioRequirementChecks).values({
      id: newId("studio_requirement_check"), studyId: study.id, variantId: variant.id, revisionId: revision.id, setVersion: version,
      execution, conclusion, result, documentHash: empreinte(revision.document), authorId: actorId, requestId: input.requestId ?? null,
    }).returning();
    // Réexamen (EX-086) : les observations non clôturées de la variante sont rapprochées de la révision contrôlée, dans
    // la même transaction ; aucun statut d'observation n'est modifié (objet disparu : marqué, jamais clos).
    const rapprochements = await rapprocherVariante(tx, {
      variantId: variant.id, revision: { id: revision.id, document: revision.document as StudioDocument }, controle: { id: row!.id, result }, actorId, at: row!.createdAt,
    });
    return { ...controleDe(row!, await emails(tx, [actorId])), rapprochements: rapprochements.map((r) => ({ observationId: r.observationId, suivi: r.suivi, statut: r.statut })), replayed: false };
  });
  res.setHeader("Idempotent-Replayed", String(out.replayed));
  res.status(201).json(out);
}));
