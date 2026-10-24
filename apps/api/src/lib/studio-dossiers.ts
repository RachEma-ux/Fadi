/**
 * Production documentaire Studio (E.3-01 à E.3-03, E.3-06) — feuilles composées et dossiers de conception, rangés à
 * part des révisions (`studio_sheets`, `studio_dossiers`) : une feuille LIT une révision identifiée, elle ne la modifie
 * jamais. Règles pures (vues, empreintes, cartouche « non évalué », assemblage, PDF) : `@parcours/atelier-model`
 * (`studio/dossier-conception.ts`). Le serveur fait seul autorité sur les empreintes : chaque vue est recalculée depuis
 * la révision immuable, jamais crue sur parole.
 *
 * Droits (mêmes correspondances que le reste de Studio) : lecture `read` (propriétaire, éditeur, lecteur) ; création,
 * modification, réépinglage et suppression `modify` (propriétaire, éditeur), réservation d'édition respectée (423).
 * Étude ou variante archivée : lecture seule (409 `archived`) — création, modification et suppression d'une feuille.
 *
 * Stabilité de l'empreinte (I-2) : le métré d'un dossier épingle une révision et la borne du journal des ajustements
 * (`quantities_adjustment_seq`, séquence maximale à l'épinglage ; null : aucun ajustement pris en compte). Un ajustement
 * ajouté ensuite ne change ni le dossier ni son empreinte tant que le métré n'est pas réépinglé (`borneAjustements`).
 *
 * Catalogue des Documents (E.3-06) : `listProjectStudioDossiers` est lu par `lib/documents.ts` (groupe « Studio —
 * dossiers de conception »), avec les liens de téléchargement du PDF et du JSON de chaque dossier.
 */
import { and, asc, desc, eq, inArray, lte, max } from "drizzle-orm";
import {
  assemblerDossierConception, composerFeuilleComposee, evaluerAjustementsQuantites, pdfDossierConception, quantitesStudio, studioFeuilleComposeeSvg,
  studioSheetPdf, StudioValidationError, validateStudioDocument,
  type StudioDocument, type StudioDossierConception, type StudioFeuilleComposee, type StudioFeuilleComposeeDefinition, type StudioSourceDocumentaire,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioDossiers, studioQuantityAdjustments, studioRevisions, studioSheets, studioStudies, studioVariants, users } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess, projectAccessRefusal, type AccessibleProject } from "./owned-project.js";
import type { Querier } from "./step-rows.js";
import { assertAccess, lockedAccess, notFound, StudioRequestError, studioArchivedRefusal, studioFileSegment, studyOf } from "./studio-commands.js";
import {
  borneAjustements, codeErreurDossier, controleFeuillesDossier, definitionDeSaisie as definitionControlee, journalBorne, type StudioDossierErreur, empreinteSaisie, saisieModifiee, type SaisieFeuille,
  type StudioDossierCreateInput, type StudioDossierUpdateInput, type StudioSheetCreateInput, type StudioSheetUpdateInput,
} from "./studio-dossiers-regles.js";
import { rejeuAdmis } from "./studio-exigences.js";
import { sha256 } from "./studio-publication-statuts.js";
import { studioDocumentHash } from "./studio-publications.js";
import { ajustementDe, type LigneAjustement } from "./studio-quantites.js";

export { studioDossierCreateSchema, studioDossierUpdateSchema, studioSheetCreateSchema, studioSheetUpdateSchema } from "./studio-dossiers-regles.js";

function definitionDeSaisie(input: SaisieFeuille): StudioFeuilleComposeeDefinition {
  const r = definitionControlee(input);
  if ("refus" in r) throw new StudioRequestError(r.refus.status, r.refus.body);
  return r.definition;
}

type Who = { id: string; email: string };
type SheetRow = typeof studioSheets.$inferSelect;
type DossierRow = typeof studioDossiers.$inferSelect;
type Study = Awaited<ReturnType<typeof studyOf>>;

export interface StudioSheetView {
  id: string; studyId: string; variantId: string; variantName: string;
  /** Révision source épinglée et tête courante de la variante : `perimee` quand elles diffèrent. */
  revisionId: string; headRevisionId: string; freshness: "a-jour" | "perimee";
  definition: StudioFeuilleComposeeDefinition;
  /** Provenance recalculée depuis la révision : vue source, empreintes, échelle ; null si la vue n'a pas pu être produite. */
  provenance: null | { documentHash: string; vue: StudioFeuilleComposee["vue"]; empreinte: string; echelle: string; decoupee: boolean; cartouche: StudioFeuilleComposee["cartouche"] };
  error: string | null;
  createdBy: Who; createdAt: string; updatedAt: string;
  files: { svg: string; pdf: string };
}
export interface StudioDossierView {
  id: string; studyId: string; title: string; sheetIds: string[];
  quantities: { variantId: string; revisionId: string } | null; includeFidelity: boolean;
  /** Borne du journal des ajustements lue par le métré (séquence max à l'épinglage) ; null : aucun ajustement pris en compte. */
  quantitiesAdjustmentSeq: number | null;
  createdBy: Who; createdAt: string; updatedAt: string;
  files: { pdf: string; json: string };
}

async function emails(q: Querier, ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return new Map();
  const rows = await q.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.email]));
}
async function variantOf(q: Querier, studyId: string, variantId: string) {
  const [v] = await q.select().from(studioVariants).where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).limit(1);
  return v ?? notFound();
}
async function revisionOf(q: Querier, variantId: string, revisionId: string) {
  const [r] = await q.select({ id: studioRevisions.id, document: studioRevisions.document, createdAt: studioRevisions.createdAt }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variantId))).limit(1);
  return r ?? notFound();
}
const base = (projectId: string, studyId: string) => `/projects/${projectId}/studio/studies/${encodeURIComponent(studyId)}`;
const projetDe = (access: AccessibleProject) => ({ projectCode: access.code, projectName: access.name });

/** Source identifiée d'une révision (empreinte recalculée depuis le document immuable). */
function sourceDe(study: Study, variant: { id: string; name: string }, revision: { id: string; document: StudioDocument; createdAt: Date }): StudioSourceDocumentaire {
  return {
    studyId: study.id, studyName: study.name, variantId: variant.id, variantName: variant.name,
    revisionId: revision.id, revisionDate: revision.createdAt.toISOString(), documentHash: studioDocumentHash(revision.document),
  };
}

interface SheetContext { row: SheetRow; variant: typeof studioVariants.$inferSelect; revision: Awaited<ReturnType<typeof revisionOf>>; source: StudioSourceDocumentaire }
async function sheetContexts(q: Querier, study: Study, rows: SheetRow[]): Promise<SheetContext[]> {
  const variants = rows.length ? await q.select().from(studioVariants).where(inArray(studioVariants.id, [...new Set(rows.map((r) => r.variantId))])) : [];
  const byId = new Map(variants.map((v) => [v.id, v]));
  const out: SheetContext[] = [];
  for (const row of rows) {
    const variant = byId.get(row.variantId) ?? notFound();
    const revision = await revisionOf(q, variant.id, row.revisionId);
    out.push({ row, variant, revision, source: sourceDe(study, variant, revision) });
  }
  return out;
}

function composer(access: AccessibleProject, c: SheetContext) {
  return composerFeuilleComposee(c.row.id, c.row.definition, validateStudioDocument(c.revision.document), c.source, projetDe(access));
}

async function sheetViews(q: Querier, access: AccessibleProject, study: Study, rows: SheetRow[]): Promise<StudioSheetView[]> {
  const contexts = await sheetContexts(q, study, rows);
  const mails = await emails(q, rows.map((r) => r.createdBy));
  return contexts.map((c) => {
    let provenance: StudioSheetView["provenance"] = null;
    let error: string | null = null;
    try {
      const { feuille } = composer(access, c);
      provenance = { documentHash: c.source.documentHash, vue: feuille.vue, empreinte: feuille.empreinte, echelle: feuille.echelle, decoupee: feuille.decoupee, cartouche: feuille.cartouche };
    } catch (e) {
      // Calque retiré de la révision depuis, par exemple : la feuille reste lisible, la vue est à revoir.
      if (!(e instanceof StudioValidationError)) throw e;
      error = e.message;
    }
    const href = `${base(access.id, study.id)}/sheets/${encodeURIComponent(c.row.id)}/files`;
    return {
      id: c.row.id, studyId: study.id, variantId: c.variant.id, variantName: c.variant.name,
      revisionId: c.row.revisionId, headRevisionId: c.variant.headRevisionId, freshness: c.variant.headRevisionId === c.row.revisionId ? "a-jour" : "perimee",
      definition: c.row.definition, provenance, error,
      createdBy: { id: c.row.createdBy, email: mails.get(c.row.createdBy) ?? "" }, createdAt: c.row.createdAt.toISOString(), updatedAt: c.row.updatedAt.toISOString(),
      files: { svg: `${href}/svg`, pdf: `${href}/pdf` },
    };
  });
}

async function readAccess(projectId: string, actorId: string) {
  return assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
}
async function sheetRow(q: Querier, studyId: string, sheetId: string) {
  const [row] = await q.select().from(studioSheets).where(and(eq(studioSheets.id, sheetId), eq(studioSheets.studyId, studyId))).limit(1);
  return row ?? notFound();
}
async function numberTaken(q: Querier, studyId: string, number: string, except?: string): Promise<void> {
  const [other] = await q.select({ id: studioSheets.id }).from(studioSheets).where(and(eq(studioSheets.studyId, studyId), eq(studioSheets.number, number))).limit(1);
  if (other && other.id !== except) throw new StudioRequestError(409, { error: "sheet_number_taken", message: "Ce numéro de feuille est déjà utilisé dans l'étude." });
}

/** Feuilles de l'étude, par numéro ; droit `read`. */
export async function listStudioSheets(projectId: string, studyId: string, actorId: string): Promise<{ sheets: StudioSheetView[]; canWrite: boolean }> {
  const access = await readAccess(projectId, actorId);
  const study = await studyOf(db, projectId, studyId);
  const rows = await db.select().from(studioSheets).where(eq(studioSheets.studyId, study.id)).orderBy(asc(studioSheets.number), asc(studioSheets.id));
  return { sheets: await sheetViews(db, access, study, rows), canWrite: study.archivedAt === null && peutComposer(access, actorId) };
}

/** Nouvelle feuille composée sur une révision de la variante (tête par défaut) ; droit `modify`, rejeu par `requestId`. */
export async function createStudioSheet(projectId: string, studyId: string, variantId: string, actorId: string, input: StudioSheetCreateInput): Promise<StudioSheetView & { replayed: boolean }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id }); // Concepteur de l'étude (portée étroite) compris
    const variant = await variantOf(tx, study.id, variantId);
    const hash = empreinteSaisie({ ...input, variantId });
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioSheets).where(and(eq(studioSheets.studyId, study.id), eq(studioSheets.requestId, input.requestId))).limit(1);
      if (previous) {
        const refus = rejeuAdmis({ authorId: previous.createdBy, payloadHash: previous.payloadHash }, actorId, hash);
        if (refus) throw new StudioRequestError(refus.status, refus.body);
        return { ...(await sheetViews(tx, access, study, [previous]))[0]!, replayed: true };
      }
    }
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    const definition = definitionDeSaisie(input);
    const revision = await revisionOf(tx, variant.id, input.revisionId ?? variant.headRevisionId);
    await numberTaken(tx, study.id, definition.numero);
    // La vue doit pouvoir être produite sur cette révision (calques connus) : refus clair sinon.
    try { composerFeuilleComposee("controle", definition, validateStudioDocument(revision.document), sourceDe(study, variant, revision), projetDe(access)); }
    catch (e) {
      if (e instanceof StudioValidationError) throw new StudioRequestError(400, { error: "invalid_input", code: "sheet_view_invalid", message: e.message });
      throw e;
    }
    const now = new Date();
    const [row] = await tx.insert(studioSheets).values({
      id: newId("studio_sheet"), studyId: study.id, variantId: variant.id, revisionId: revision.id, number: definition.numero, definition,
      requestId: input.requestId ?? null, payloadHash: hash, createdBy: actorId, createdAt: now, updatedAt: now,
    }).returning();
    return { ...(await sheetViews(tx, access, study, [row!]))[0]!, replayed: false };
  });
}

/** Modification d'une feuille (définition, réépinglage sur une révision de sa variante) ; jamais de la planche. */
export async function updateStudioSheet(projectId: string, studyId: string, sheetId: string, actorId: string, input: StudioSheetUpdateInput): Promise<StudioSheetView> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id }); // Concepteur de l'étude (portée étroite) compris
    const row = await sheetRow(tx, study.id, sheetId);
    const variant = await variantOf(tx, study.id, row.variantId);
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    const { revisionId, ...champs } = input;
    const definition = definitionDeSaisie(saisieModifiee(row.definition, champs));
    const revision = await revisionOf(tx, variant.id, revisionId ?? row.revisionId);
    await numberTaken(tx, study.id, definition.numero, row.id);
    try { composerFeuilleComposee(row.id, definition, validateStudioDocument(revision.document), sourceDe(study, variant, revision), projetDe(access)); }
    catch (e) {
      if (e instanceof StudioValidationError) throw new StudioRequestError(400, { error: "invalid_input", code: "sheet_view_invalid", message: e.message });
      throw e;
    }
    const [stored] = await tx.update(studioSheets).set({ definition, number: definition.numero, revisionId: revision.id, updatedAt: new Date() }).where(eq(studioSheets.id, row.id)).returning();
    return (await sheetViews(tx, access, study, [stored!]))[0]!;
  });
}

/** Suppression d'une feuille : refusée (409) tant qu'un dossier de l'étude la cite. */
export async function deleteStudioSheet(projectId: string, studyId: string, sheetId: string, actorId: string): Promise<{ deleted: string }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id }); // Concepteur de l'étude (portée étroite) compris
    const row = await sheetRow(tx, study.id, sheetId);
    // Étude ou variante archivée : lecture seule (M-3), comme la création et la modification d'une feuille.
    const variant = await variantOf(tx, study.id, row.variantId);
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    const dossiers = await tx.select({ id: studioDossiers.id, sheetIds: studioDossiers.sheetIds }).from(studioDossiers).where(eq(studioDossiers.studyId, study.id));
    const cites = dossiers.filter((d) => d.sheetIds.includes(row.id)).map((d) => d.id);
    if (cites.length) throw new StudioRequestError(409, { error: "sheet_in_dossier", dossierIds: cites, message: "Cette feuille fait partie d'un dossier de conception : retirez-la du dossier d'abord." });
    await tx.delete(studioSheets).where(eq(studioSheets.id, row.id));
    return { deleted: row.id };
  });
}

/** Rendu d'une feuille (SVG avec ses métadonnées de provenance, ou PDF) ; droit `read`. */
export async function readStudioSheetFile(projectId: string, studyId: string, sheetId: string, actorId: string, format: string) {
  if (format !== "svg" && format !== "pdf") return notFound();
  const access = assertAccess(await readAccess(projectId, actorId), actorId, "export");
  const study = await studyOf(db, projectId, studyId);
  const row = await sheetRow(db, study.id, sheetId);
  const [c] = await sheetContexts(db, study, [row]);
  let out: ReturnType<typeof composer>;
  try { out = composer(access, c!); }
  catch (e) {
    if (e instanceof StudioValidationError) throw new StudioRequestError(409, { error: "sheet_view_invalid", message: e.message });
    throw e;
  }
  const fileName = `${studioFileSegment(study.name, "etude")}-feuille-${studioFileSegment(row.definition.numero, "feuille")}-${studioFileSegment(row.revisionId.slice(-8), "revision")}.${format}`;
  const body = format === "svg" ? Buffer.from(studioFeuilleComposeeSvg(out.feuille, out.rendu), "utf8") : Buffer.from(studioSheetPdf(out.rendu));
  return { body, fileName, mime: format === "svg" ? "image/svg+xml; charset=utf-8" : "application/pdf", sha256: sha256(body), feuille: out.feuille };
}

// ——— Dossiers ———

function dossierView(projectId: string, row: DossierRow, mails: Map<string, string>): StudioDossierView {
  const href = `${base(projectId, row.studyId)}/dossiers/${encodeURIComponent(row.id)}/files`;
  return {
    id: row.id, studyId: row.studyId, title: row.title, sheetIds: row.sheetIds,
    quantities: row.quantitiesVariantId && row.quantitiesRevisionId ? { variantId: row.quantitiesVariantId, revisionId: row.quantitiesRevisionId } : null,
    includeFidelity: row.includeFidelity, quantitiesAdjustmentSeq: row.quantitiesAdjustmentSeq,
    createdBy: { id: row.createdBy, email: mails.get(row.createdBy) ?? "" }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    files: { pdf: `${href}/pdf`, json: `${href}/json` },
  };
}

async function controlerFeuilles(q: Querier, studyId: string, ids: readonly string[]): Promise<void> {
  const rows = await q.select({ id: studioSheets.id }).from(studioSheets).where(and(eq(studioSheets.studyId, studyId), inArray(studioSheets.id, [...new Set(ids)])));
  const refus = controleFeuillesDossier(ids, new Set(rows.map((r) => r.id)));
  if (refus) throw new StudioRequestError(refus.status, refus.body);
}
/** Séquence maximale du journal des ajustements de la variante (null : journal vide). */
async function seqMaxAjustements(q: Querier, variantId: string): Promise<number | null> {
  const [r] = await q.select({ seq: max(studioQuantityAdjustments.seq) }).from(studioQuantityAdjustments).where(eq(studioQuantityAdjustments.variantId, variantId));
  return r?.seq ?? null;
}
/** Métré épinglé : variante, révision et borne du journal des ajustements (`borneAjustements`). */
async function metreEpingle(q: Querier, studyId: string, quantities: { variantId: string; revisionId?: string | undefined } | null | undefined, ancien: DossierRow | null) {
  const m = await metreDe(q, studyId, quantities);
  const seqMax = m.variantId ? await seqMaxAjustements(q, m.variantId) : null;
  const seq = borneAjustements(ancien ? { variantId: ancien.quantitiesVariantId, revisionId: ancien.quantitiesRevisionId, seq: ancien.quantitiesAdjustmentSeq } : null, m, seqMax);
  return { quantitiesVariantId: m.variantId, quantitiesRevisionId: m.revisionId, quantitiesAdjustmentSeq: seq };
}
async function metreDe(q: Querier, studyId: string, quantities: { variantId: string; revisionId?: string | undefined } | null | undefined): Promise<{ variantId: string | null; revisionId: string | null }> {
  if (!quantities) return { variantId: null, revisionId: null };
  const variant = await variantOf(q, studyId, quantities.variantId).catch(() => {
    throw new StudioRequestError(400, { error: "invalid_input", code: "dossier_quantities_invalid", message: "Variante du métré inconnue dans cette étude." });
  });
  const revision = await revisionOf(q, variant.id, quantities.revisionId ?? variant.headRevisionId).catch(() => {
    throw new StudioRequestError(400, { error: "invalid_input", code: "dossier_quantities_invalid", message: "Révision du métré inconnue pour cette variante." });
  });
  return { variantId: variant.id, revisionId: revision.id };
}

export async function listStudioDossiers(projectId: string, studyId: string, actorId: string): Promise<{ dossiers: StudioDossierView[] }> {
  await readAccess(projectId, actorId);
  const study = await studyOf(db, projectId, studyId);
  const rows = await db.select().from(studioDossiers).where(eq(studioDossiers.studyId, study.id)).orderBy(desc(studioDossiers.createdAt), desc(studioDossiers.id));
  const mails = await emails(db, rows.map((r) => r.createdBy));
  return { dossiers: rows.map((r) => dossierView(projectId, r, mails)) };
}

export async function createStudioDossier(projectId: string, studyId: string, actorId: string, input: StudioDossierCreateInput): Promise<StudioDossierView & { replayed: boolean }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id }); // Concepteur de l'étude (portée étroite) compris
    const hash = empreinteSaisie(input);
    if (input.requestId !== undefined) {
      const [previous] = await tx.select().from(studioDossiers).where(and(eq(studioDossiers.studyId, study.id), eq(studioDossiers.requestId, input.requestId))).limit(1);
      if (previous) {
        const refus = rejeuAdmis({ authorId: previous.createdBy, payloadHash: previous.payloadHash }, actorId, hash);
        if (refus) throw new StudioRequestError(refus.status, refus.body);
        return { ...dossierView(projectId, previous, await emails(tx, [previous.createdBy])), replayed: true };
      }
    }
    if (study.archivedAt !== null) return studioArchivedRefusal();
    await controlerFeuilles(tx, study.id, input.sheetIds);
    const metre = await metreEpingle(tx, study.id, input.quantities, null);
    const now = new Date();
    const [row] = await tx.insert(studioDossiers).values({
      id: newId("studio_dossier"), studyId: study.id, title: input.title, sheetIds: input.sheetIds,
      ...metre, includeFidelity: input.includeFidelity ?? true,
      requestId: input.requestId ?? null, payloadHash: hash, createdBy: actorId, createdAt: now, updatedAt: now,
    }).returning();
    return { ...dossierView(projectId, row!, await emails(tx, [actorId])), replayed: false };
  });
}

export async function updateStudioDossier(projectId: string, studyId: string, dossierId: string, actorId: string, input: StudioDossierUpdateInput): Promise<StudioDossierView> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id }); // Concepteur de l'étude (portée étroite) compris
    const [row] = await tx.select().from(studioDossiers).where(and(eq(studioDossiers.id, dossierId), eq(studioDossiers.studyId, study.id))).for("update");
    if (!row) return notFound();
    if (study.archivedAt !== null) return studioArchivedRefusal();
    const patch: Partial<typeof studioDossiers.$inferInsert> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.sheetIds !== undefined) { await controlerFeuilles(tx, study.id, input.sheetIds); patch.sheetIds = input.sheetIds; }
    // Réépinglage explicite : la borne est reprise comme pour un nouvel épinglage (ajustements ajoutés depuis compris).
    if (input.quantities !== undefined) Object.assign(patch, await metreEpingle(tx, study.id, input.quantities, input.repinQuantities ? null : row));
    if (input.includeFidelity !== undefined) patch.includeFidelity = input.includeFidelity;
    const [stored] = await tx.update(studioDossiers).set(patch).where(eq(studioDossiers.id, row.id)).returning();
    return dossierView(projectId, stored!, await emails(tx, [stored!.createdBy]));
  });
}

/** Dossier assemblé (JSON du modèle et rendus des feuilles), recalculé depuis les révisions immuables. */
async function assembler(q: Querier, access: AccessibleProject, study: Study, row: DossierRow): Promise<{ dossier: StudioDossierConception; pdf: () => Uint8Array }> {
  const sheets = row.sheetIds.length ? await q.select().from(studioSheets).where(and(eq(studioSheets.studyId, study.id), inArray(studioSheets.id, row.sheetIds))) : [];
  const byId = new Map(sheets.map((s) => [s.id, s]));
  const manquantes = row.sheetIds.filter((id) => !byId.has(id));
  if (manquantes.length) throw new StudioRequestError(409, { error: "dossier_sheet_missing", sheetIds: manquantes, message: "Une feuille du dossier n'existe plus." });
  const contexts = await sheetContexts(q, study, row.sheetIds.map((id) => byId.get(id)!));
  let metre: Parameters<typeof assemblerDossierConception>[0]["metre"] = null;
  if (row.quantitiesVariantId && row.quantitiesRevisionId) {
    const variant = await variantOf(q, study.id, row.quantitiesVariantId);
    const revision = await revisionOf(q, variant.id, row.quantitiesRevisionId);
    const document = validateStudioDocument(revision.document);
    // Ajustements manuels du journal de la variante (E.3-05), évalués pour la révision du métré : rapportés à part. Seules
    // les lignes de séquence ≤ borne épinglée sont lues (I-2) : un ajustement ajouté après l'épinglage ne change pas
    // l'empreinte du dossier ; borne nulle : aucun ajustement pris en compte.
    const borne = row.quantitiesAdjustmentSeq;
    const journal = borne === null ? [] : await q.select().from(studioQuantityAdjustments)
      .where(and(eq(studioQuantityAdjustments.variantId, variant.id), lte(studioQuantityAdjustments.seq, borne))).orderBy(asc(studioQuantityAdjustments.seq)) as LigneAjustement[];
    const ajustements = evaluerAjustementsQuantites(document, quantitesStudio(document), journalBorne(journal, borne).map((r) => ajustementDe(r, new Map())));
    metre = { document, source: sourceDe(study, variant, revision), ajustements, borneAjustements: borne };
  }
  try {
    const { dossier, rendus } = assemblerDossierConception({
      titre: row.title, projet: projetDe(access), etude: { id: study.id, nom: study.name },
      feuilles: contexts.map((c) => ({ id: c.row.id, definition: c.row.definition, document: validateStudioDocument(c.revision.document), source: c.source })),
      metre, fidelite: row.includeFidelity,
    });
    return { dossier, pdf: () => pdfDossierConception(dossier, rendus) };
  } catch (e) {
    if (e instanceof StudioValidationError) throw new StudioRequestError(409, { error: "dossier_invalid", message: e.message });
    throw e;
  }
}

async function dossierRow(q: Querier, studyId: string, dossierId: string) {
  const [row] = await q.select().from(studioDossiers).where(and(eq(studioDossiers.id, dossierId), eq(studioDossiers.studyId, studyId))).limit(1);
  return row ?? notFound();
}

/** Détail : définition et dossier assemblé (feuilles, métré, fidélité, empreinte) ; droit `read`. */
export async function readStudioDossier(projectId: string, studyId: string, dossierId: string, actorId: string): Promise<StudioDossierView & { assembly: StudioDossierConception }> {
  const access = await readAccess(projectId, actorId);
  const study = await studyOf(db, projectId, studyId);
  const row = await dossierRow(db, study.id, dossierId);
  const { dossier } = await assembler(db, access, study, row);
  return { ...dossierView(projectId, row, await emails(db, [row.createdBy])), assembly: dossier };
}

/** Fichier du dossier : PDF (sommaire, feuilles, métré, fidélité) ou JSON du dossier assemblé. */
export async function readStudioDossierFile(projectId: string, studyId: string, dossierId: string, actorId: string, format: string) {
  if (format !== "pdf" && format !== "json") return notFound();
  // Portée `documents` : la famille `studio-dossier` ou ce dossier (`studio-dossier:<id>`, kind du catalogue Documents).
  const access = assertAccess(await readAccess(projectId, actorId), actorId, "export", { document: { famille: "studio-dossier", kind: `studio-dossier:${dossierId}` } });
  const study = await studyOf(db, projectId, studyId);
  const row = await dossierRow(db, study.id, dossierId);
  const { dossier, pdf } = await assembler(db, access, study, row);
  const body = format === "pdf" ? Buffer.from(pdf()) : Buffer.from(`${JSON.stringify(dossier, null, 2)}\n`, "utf8");
  const fileName = `${studioFileSegment(study.name, "etude")}-dossier-${studioFileSegment(row.title, "dossier")}.${format}`;
  return { body, fileName, mime: format === "pdf" ? "application/pdf" : "application/json; charset=utf-8", sha256: sha256(body), empreinte: dossier.empreinte };
}

/** Dossiers de conception du projet, pour le catalogue des Documents (E.3-06) ; droit `read`. */
export async function listProjectStudioDossiers(projectId: string, actorId: string) {
  const access = await readAccess(projectId, actorId);
  const studies = await db.select().from(studioStudies).where(eq(studioStudies.projectId, projectId));
  if (!studies.length) return { dossiers: [] };
  const byStudy = new Map(studies.map((s) => [s.id, s]));
  const rows = await db.select().from(studioDossiers).where(inArray(studioDossiers.studyId, studies.map((s) => s.id))).orderBy(desc(studioDossiers.updatedAt), desc(studioDossiers.id));
  const mails = await emails(db, rows.map((r) => r.createdBy));
  const out = [];
  for (const row of rows) {
    const study = byStudy.get(row.studyId)!;
    // Toute exception d'assemblage d'un dossier (feuille retirée, vue impossible, donnée illisible…) devient une entrée en
    // erreur, sous un code que le client traduit (M-4, M-7) : le catalogue des Documents n'échoue jamais pour un dossier.
    let empreinte: string | null = null, sources: StudioSourceDocumentaire[] = [], error: StudioDossierErreur | null = null;
    try { const a = (await assembler(db, access, study, row)).dossier; empreinte = a.empreinte; sources = a.sources; }
    catch (e) {
      if (!(e instanceof StudioRequestError)) console.error("studio_dossier_catalogue", row.id, e);
      error = codeErreurDossier(e);
    }
    out.push({ ...dossierView(projectId, row, mails), studyName: study.name, sheetCount: row.sheetIds.length, empreinte, sources, error });
  }
  return { dossiers: out };
}

/** Droit d'écriture du compte sur les feuilles et dossiers (indication d'interface ; le serveur revérifie). */
export const peutComposer = (access: AccessibleProject, actorId: string): boolean => projectAccessRefusal(access, actorId, "modify") === null;
