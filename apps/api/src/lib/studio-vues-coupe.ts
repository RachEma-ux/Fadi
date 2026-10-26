/**
 * Vues de coupe enregistrées Studio (EX-075, lot PUB) — rangées à part des révisions (`studio_section_views`) : une vue
 * LIT une révision identifiée (épinglée), elle ne l'écrit jamais. Règles pures : `@parcours/atelier-model`
 * (`studio/vues-coupe.ts`). Le serveur recalcule la section depuis la révision immuable à chaque lecture.
 *
 * Droits (mêmes correspondances que les feuilles composées) : lecture `read` ; création, modification (définition,
 * annotations propres, réépinglage explicite) `modify`, réservation d'édition respectée (423). Étude ou variante
 * archivée : lecture seule (409 `archived`). Une vue citée par un dossier ne se supprime pas (409 `section_view_in_dossier`).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  actualiteVueCoupe, annoterVueCoupe, creerVueCoupe, STUDIO_HACHURES_COUPE, STUDIO_SHEET_SCALES, STUDIO_TRAITS_COUPE, StudioValidationError, validateStudioDocument, validerVueCoupe,
  type StudioVueCoupe, type StudioVueCoupeDefinition,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioDossiers, studioRevisions, studioSectionViews, studioVariants } from "../db/schema.js";
import { newId } from "./ids.js";
import { loadProjectAccess } from "./owned-project.js";
import type { Querier } from "./step-rows.js";
import { assertAccess, lockedAccess, notFound, StudioRequestError, studioArchivedRefusal, studioIdentifierSchema, studyOf } from "./studio-commands.js";
import { canonicalJson, sha256 } from "./studio-publication-statuts.js";

const fini = z.number().finite().min(-2e9).max(2e9);
const annotation = z.object({ id: z.string().trim().min(1).max(128), type: z.enum(["texte", "repere"]), position: z.object({ x: fini, y: fini }).strict(), texte: z.string().trim().min(1).max(500) }).strict();
const definitionSchema = z.object({
  nom: z.string().trim().min(1).max(200),
  niveau: z.object({ repere: z.literal("local-3d"), z: fini }).strict(),
  cadrage: z.object({ xMin: fini, yMin: fini, xMax: fini, yMax: fini }).strict(),
  echelle: z.number().refine((v) => (STUDIO_SHEET_SCALES as readonly number[]).includes(v), "échelle normalisée attendue"),
  visibilite: z.object({ calques: z.array(z.string().min(1).max(128)).max(200) }).strict().optional(),
  styles: z.object({ trait: z.enum(STUDIO_TRAITS_COUPE as [string, ...string[]]), hachure: z.enum(STUDIO_HACHURES_COUPE as [string, ...string[]]) }).strict(),
  annotations: z.array(annotation).max(200).default([]),
}).strict();
export const studioVueCoupeCreateSchema = z.object({ definition: definitionSchema, revisionId: studioIdentifierSchema.optional() }).strict();
export const studioVueCoupeUpdateSchema = z.object({
  /** Nouvelle définition complète (cadrage, échelle, visibilité, styles, annotations). */
  definition: definitionSchema.optional(),
  /** Opération sur une annotation propre (n'affecte ni la section ni le document). */
  annotation: z.discriminatedUnion("op", [
    z.object({ op: z.literal("ajouter"), annotation }).strict(),
    z.object({ op: z.literal("modifier"), annotation }).strict(),
    z.object({ op: z.literal("retirer"), id: z.string().min(1).max(128) }).strict(),
  ]).optional(),
  /** Réépinglage explicite sur une révision de la même variante (actualisation d'une vue périmée). */
  revisionId: studioIdentifierSchema.optional(),
}).strict().refine((v) => Object.keys(v).length > 0, { message: "Au moins un champ attendu." });

type Row = typeof studioSectionViews.$inferSelect;
type Study = Awaited<ReturnType<typeof studyOf>>;

export interface StudioVueCoupeView {
  id: string; studyId: string; variantId: string; revisionId: string; headRevisionId: string;
  /** Actualité : périmée quand la tête de la variante n'est plus la révision source (EX-075). */
  freshness: "a-jour" | "perimee";
  definition: StudioVueCoupeDefinition;
  /** Vue recalculée (section dérivée, sources, empreintes) ; null si elle n'a pas pu être produite. */
  vue: StudioVueCoupe | null;
  error: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
}

/** Empreinte du document d'une révision (même règle que les publications). */
const documentHash = (doc: unknown): string => sha256(canonicalJson(doc));

async function revisionOf(q: Querier, variantId: string, revisionId: string) {
  const [r] = await q.select({ id: studioRevisions.id, document: studioRevisions.document }).from(studioRevisions)
    .where(and(eq(studioRevisions.id, revisionId), eq(studioRevisions.variantId, variantId))).limit(1);
  return r ?? notFound();
}
async function variantOf(q: Querier, studyId: string, variantId: string) {
  const [v] = await q.select().from(studioVariants).where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).limit(1);
  return v ?? notFound();
}

/** Vue recalculée d'une ligne : section dérivée de la révision épinglée, actualité contre la tête de la variante. */
export async function vueDeLigne(q: Querier, study: Study, row: Row): Promise<StudioVueCoupeView> {
  const variant = await variantOf(q, study.id, row.variantId);
  const revision = await revisionOf(q, variant.id, row.revisionId);
  let vue: StudioVueCoupe | null = null, error: string | null = null;
  try { vue = creerVueCoupe(row.id, row.definition, validateStudioDocument(revision.document), { studyId: study.id, variantId: variant.id, revisionId: revision.id, documentHash: documentHash(revision.document) }); }
  catch (e) { if (!(e instanceof StudioValidationError)) throw e; error = e.message; }
  return {
    id: row.id, studyId: study.id, variantId: variant.id, revisionId: row.revisionId, headRevisionId: variant.headRevisionId,
    freshness: actualiteVueCoupe({ sources: [{ studyId: study.id, variantId: variant.id, revisionId: row.revisionId, documentHash: "" }] }, new Map([[variant.id, variant.headRevisionId]])).actualite,
    definition: row.definition, vue, error, createdBy: row.createdBy, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

/** Vues de coupe d'une étude, dans l'ordre donné (ou toutes, par date) ; une vue absente de la liste demandée → 409. */
export async function vuesDeCoupe(q: Querier, study: Study, ids?: readonly string[]): Promise<StudioVueCoupeView[]> {
  const rows = ids === undefined
    ? await q.select().from(studioSectionViews).where(eq(studioSectionViews.studyId, study.id)).orderBy(asc(studioSectionViews.createdAt), asc(studioSectionViews.id))
    : ids.length ? await q.select().from(studioSectionViews).where(and(eq(studioSectionViews.studyId, study.id), inArray(studioSectionViews.id, [...ids]))) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordre = ids ?? rows.map((r) => r.id);
  const manquantes = ordre.filter((id) => !byId.has(id));
  if (manquantes.length) throw new StudioRequestError(409, { error: "section_view_missing", sectionViewIds: manquantes, message: "Une vue de coupe citée n'existe plus." });
  const out: StudioVueCoupeView[] = [];
  for (const id of ordre) out.push(await vueDeLigne(q, study, byId.get(id)!));
  return out;
}

function definitionControlee(def: unknown): StudioVueCoupeDefinition {
  try { return validerVueCoupe(def as StudioVueCoupeDefinition); }
  catch (e) {
    if (e instanceof StudioValidationError) throw new StudioRequestError(400, { error: "invalid_input", code: "section_view_invalid", message: e.message });
    throw e;
  }
}

export async function listStudioVuesCoupe(projectId: string, studyId: string, actorId: string): Promise<{ vues: StudioVueCoupeView[] }> {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const study = await studyOf(db, projectId, studyId);
  return { vues: await vuesDeCoupe(db, study) };
}

export async function readStudioVueCoupe(projectId: string, studyId: string, id: string, actorId: string): Promise<StudioVueCoupeView> {
  assertAccess(await loadProjectAccess(projectId, actorId), actorId, "read");
  const study = await studyOf(db, projectId, studyId);
  return (await vuesDeCoupe(db, study, [id]).catch((e: unknown) => { if (e instanceof StudioRequestError && e.status === 409) notFound(); throw e; }))[0]!;
}

export async function createStudioVueCoupe(projectId: string, studyId: string, variantId: string, actorId: string, input: z.infer<typeof studioVueCoupeCreateSchema>): Promise<StudioVueCoupeView> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id });
    const variant = await variantOf(tx, study.id, variantId);
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    const definition = definitionControlee(input.definition);
    const revision = await revisionOf(tx, variant.id, input.revisionId ?? variant.headRevisionId);
    const now = new Date();
    const [row] = await tx.insert(studioSectionViews).values({ id: newId("studio_section_view"), studyId: study.id, variantId: variant.id, revisionId: revision.id, definition, createdBy: actorId, createdAt: now, updatedAt: now }).returning();
    return vueDeLigne(tx, study, row!);
  });
}

/** Modification : définition, annotation propre ou réépinglage ; la révision et le document ne sont jamais écrits. */
export async function updateStudioVueCoupe(projectId: string, studyId: string, id: string, actorId: string, input: z.infer<typeof studioVueCoupeUpdateSchema>): Promise<StudioVueCoupeView> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id });
    const [row] = await tx.select().from(studioSectionViews).where(and(eq(studioSectionViews.id, id), eq(studioSectionViews.studyId, study.id))).for("update");
    if (!row) return notFound();
    const variant = await variantOf(tx, study.id, row.variantId);
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    let definition = input.definition ? definitionControlee(input.definition) : row.definition;
    if (input.annotation) {
      try { definition = annoterVueCoupe(definition, input.annotation); }
      catch (e) {
        if (e instanceof StudioValidationError) throw new StudioRequestError(400, { error: "invalid_input", code: "section_view_annotation_invalid", message: e.message });
        throw e;
      }
    }
    const revision = await revisionOf(tx, variant.id, input.revisionId ?? row.revisionId);
    const [stored] = await tx.update(studioSectionViews).set({ definition, revisionId: revision.id, updatedAt: new Date() }).where(eq(studioSectionViews.id, row.id)).returning();
    return vueDeLigne(tx, study, stored!);
  });
}

export async function deleteStudioVueCoupe(projectId: string, studyId: string, id: string, actorId: string): Promise<{ deleted: string }> {
  return db.transaction(async (tx) => {
    const access = await lockedAccess(tx, projectId, actorId);
    const study = await studyOf(tx, projectId, studyId);
    assertAccess(access, actorId, "modify", { studyId: study.id });
    const [row] = await tx.select().from(studioSectionViews).where(and(eq(studioSectionViews.id, id), eq(studioSectionViews.studyId, study.id))).limit(1);
    if (!row) return notFound();
    if (study.archivedAt !== null) return studioArchivedRefusal();
    const dossiers = await tx.select({ id: studioDossiers.id, ids: studioDossiers.sectionViewIds }).from(studioDossiers).where(eq(studioDossiers.studyId, study.id));
    const cites = dossiers.filter((d) => (d.ids ?? []).includes(row.id)).map((d) => d.id);
    if (cites.length) throw new StudioRequestError(409, { error: "section_view_in_dossier", dossierIds: cites, message: "Cette vue de coupe fait partie d'un dossier de conception : retirez-la du dossier d'abord." });
    await tx.delete(studioSectionViews).where(eq(studioSectionViews.id, row.id));
    return { deleted: row.id };
  });
}
