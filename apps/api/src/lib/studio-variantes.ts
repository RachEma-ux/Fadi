/**
 * Cycle de vie des études et variantes Studio : renommage et archivage, jamais de suppression. Droit `modify` requis,
 * sous le verrou du projet (le même que les lots de commandes : un archivage et un lot concurrents sont sérialisés).
 * Une archive reste lisible par son adresse (lecture seule) ; elle n'est plus modifiée ni renommée (409 `archived`).
 * La variante initiale d'une étude active ne s'archive pas (400) ; désarchiver l'étude rend sa variante initiale active.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { STUDIO_PHASES_WORKFLOW, type StudioPhaseWorkflow } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { studioStudies, studioVariants } from "../db/schema.js";
import type { Tx } from "./atelier-validation.js";
import {
  assertAccess, lockedAccess, notFound, readStudioStudy, studioArchivedRefusal, studioVariantSummaryColumns, studyOf, StudioRequestError,
  toVariantSummary, type StudioStudyRead, type StudioVariantSummary,
} from "./studio-commands.js";

/** Corps d'un renommage : nom épuré, 1 à 200 caractères, aucun autre champ. */
export const studioRenameSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

/**
 * Étude du projet, accès verrouillé et droit `modify` (404 avant 403, comme la création de variante). `contenu` : le
 * renommage et la phase déclarée sont du contenu de l'étude, ouvert aussi à un Concepteur de CETTE étude (portée étroite) ;
 * l'archivage reste au rôle de projet.
 */
async function managedStudy(tx: Tx, projectId: string, studyId: string, actorId: string, contenu = false) {
  const access = await lockedAccess(tx, projectId, actorId);
  const study = await studyOf(tx, projectId, studyId);
  assertAccess(access, actorId, "modify", contenu ? { studyId: study.id } : undefined);
  return study;
}

/** Variante de l'étude, ligne verrouillée (comme un lot de commandes), sinon 404. */
async function managedVariant(tx: Tx, studyId: string, variantId: string) {
  const [variant] = await tx.select(studioVariantSummaryColumns).from(studioVariants)
    .where(and(eq(studioVariants.id, variantId), eq(studioVariants.studyId, studyId))).for("update");
  return variant ?? notFound();
}

export async function renameStudioStudy(projectId: string, studyId: string, actorId: string, name: string): Promise<StudioStudyRead> {
  return db.transaction(async (tx) => {
    const study = await managedStudy(tx, projectId, studyId, actorId, true);
    if (study.archivedAt !== null) return studioArchivedRefusal();
    if (study.name !== name) await tx.update(studioStudies).set({ name, updatedAt: new Date() }).where(eq(studioStudies.id, study.id));
    return readStudioStudy(tx, projectId, study.id, actorId);
  });
}

/**
 * Corps d'une déclaration de phase du workflow (REF-01 §06) : une phase de `STUDIO_PHASES_WORKFLOW`, ou `null` pour
 * revenir à « non déclarée ». Aucun autre champ.
 */
export const studioWorkflowSchema = z.object({
  phase: z.enum(STUDIO_PHASES_WORKFLOW.map((p) => p.id) as [StudioPhaseWorkflow, ...StudioPhaseWorkflow[]]).nullable(),
}).strict();

/**
 * Déclare la phase du workflow de l'étude (droit `modify` : propriétaire ou éditeur, sous le verrou du projet). La phase
 * est une déclaration de l'utilisateur, jamais une conséquence du contenu ; elle n'agit sur aucune donnée de conception
 * ni sur le Parcours. Une étude archivée → 409 `archived`. Répéter la même déclaration ne change rien (`updated_at`
 * compris). Aucun journal d'étude n'existe dans le schéma : la déclaration n'est pas journalisée (horodatée par
 * `updated_at` seulement).
 */
export async function setStudioStudyWorkflowPhase(projectId: string, studyId: string, actorId: string, phase: StudioPhaseWorkflow | null): Promise<StudioStudyRead> {
  return db.transaction(async (tx) => {
    const study = await managedStudy(tx, projectId, studyId, actorId, true);
    if (study.archivedAt !== null) return studioArchivedRefusal();
    if ((study.workflowPhase ?? null) !== phase) await tx.update(studioStudies).set({ workflowPhase: phase, updatedAt: new Date() }).where(eq(studioStudies.id, study.id));
    return readStudioStudy(tx, projectId, study.id, actorId);
  });
}

/** Archive (`archived` vrai) ou désarchive l'étude ; répéter l'opération ne change rien. */
export async function setStudioStudyArchived(projectId: string, studyId: string, actorId: string, archived: boolean): Promise<StudioStudyRead> {
  return db.transaction(async (tx) => {
    const study = await managedStudy(tx, projectId, studyId, actorId);
    if ((study.archivedAt !== null) !== archived) {
      const now = new Date();
      await tx.update(studioStudies).set({ archivedAt: archived ? now : null, updatedAt: now }).where(eq(studioStudies.id, study.id));
      // Une étude active n'a jamais sa variante initiale archivée.
      if (!archived) {
        await tx.update(studioVariants).set({ archivedAt: null, updatedAt: now })
          .where(and(eq(studioVariants.id, study.initialVariantId), eq(studioVariants.studyId, study.id)));
      }
    }
    return readStudioStudy(tx, projectId, study.id, actorId);
  });
}

export interface StudioVariantLifecycle { variant: StudioVariantSummary; studyArchived: boolean }

export async function renameStudioVariant(projectId: string, studyId: string, variantId: string, actorId: string, name: string): Promise<StudioVariantLifecycle> {
  return db.transaction(async (tx) => {
    const study = await managedStudy(tx, projectId, studyId, actorId, true);
    const variant = await managedVariant(tx, study.id, variantId);
    if (study.archivedAt !== null || variant.archivedAt !== null) return studioArchivedRefusal();
    if (variant.name === name) return { variant: toVariantSummary(variant), studyArchived: false };
    const updatedAt = new Date();
    await tx.update(studioVariants).set({ name, updatedAt }).where(eq(studioVariants.id, variant.id));
    return { variant: toVariantSummary({ ...variant, name }), studyArchived: false };
  });
}

export async function setStudioVariantArchived(projectId: string, studyId: string, variantId: string, actorId: string, archived: boolean): Promise<StudioVariantLifecycle> {
  return db.transaction(async (tx) => {
    const study = await managedStudy(tx, projectId, studyId, actorId);
    const variant = await managedVariant(tx, study.id, variantId);
    if (archived && variant.id === study.initialVariantId && study.archivedAt === null) {
      throw new StudioRequestError(400, { error: "initial_variant", message: "La variante initiale ne s’archive qu’avec son étude." });
    }
    if ((variant.archivedAt !== null) === archived) return { variant: toVariantSummary(variant), studyArchived: study.archivedAt !== null };
    const now = new Date();
    const archivedAt = archived ? now : null;
    await tx.update(studioVariants).set({ archivedAt, updatedAt: now }).where(eq(studioVariants.id, variant.id));
    return { variant: toVariantSummary({ ...variant, archivedAt }), studyArchived: study.archivedAt !== null };
  });
}
