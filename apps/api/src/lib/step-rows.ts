/**
 * Lecture / écriture des lignes `project_steps` (contenu réel des 21 étapes
 * d'un projet), partagées par le routeur des étapes, les transmissions du
 * programme (bibliothèque des bâtiments) et les imports.
 */
import { eq } from "drizzle-orm";
import { EMPTY_HARMONIE_STEP_STATE, type HarmonieStepState, type ParcoursStepContent, type ParcoursStepStatus } from "@parcours/domain-model";
import type { db } from "../db/client.js";
import { projects, projectSteps } from "../db/schema.js";
import { EMPTY_STEP_CONTENT } from "../data/parcours.js";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Querier = Tx | typeof db;
export type StepRows = Map<number, { status: ParcoursStepStatus; content: ParcoursStepContent }>;

/**
 * Sérialise les écritures d'un projet : toute transaction qui relit un
 * état (étapes, programme, dossier Harmony, parcelles) pour le réécrire
 * commence par verrouiller la ligne du projet (`FOR UPDATE`). Deux
 * requêtes simultanées — deux champs d'un même formulaire, deux éditeurs,
 * un rejeu hors-ligne — s'enchaînent alors au lieu de se relire l'une
 * l'autre, et aucune ne perd l'écriture de l'autre (un « dernier écrit
 * gagne » sur le JSON complet de l'étape effaçait la saisie concurrente).
 * Les contrôles par champ / par version (409) s'appliquent ensuite sur
 * l'état réellement courant.
 */
export async function lockProject(tx: Tx, projectId: string): Promise<void> {
  await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
}

/** Les lignes écrites avant l'ajout des champs `fields`/`harmonie` sont lues avec leurs valeurs vides. */
export function normalizeContent(raw: Record<string, unknown>): ParcoursStepContent {
  const content = { ...EMPTY_STEP_CONTENT, ...(raw as Partial<ParcoursStepContent>) } as ParcoursStepContent;
  content.fields = { ...(content.fields ?? {}) };
  const harmonie = (content.harmonie ?? EMPTY_HARMONIE_STEP_STATE) as HarmonieStepState;
  content.harmonie = { ...EMPTY_HARMONIE_STEP_STATE, ...harmonie, proposals: { ...(harmonie.proposals ?? {}) } };
  return content;
}

export async function loadStepRows(q: Querier, projectId: string): Promise<StepRows> {
  const rows = await q.select().from(projectSteps).where(eq(projectSteps.projectId, projectId));
  const byNumber: StepRows = new Map();
  for (const r of rows) byNumber.set(r.stepNumber, { status: r.status as ParcoursStepStatus, content: normalizeContent(r.content) });
  return byNumber;
}

export async function upsertStep(tx: Tx, projectId: string, stepNumber: number, status: ParcoursStepStatus, content: ParcoursStepContent) {
  await tx
    .insert(projectSteps)
    .values({ projectId, stepNumber, status, content: { ...content } })
    .onConflictDoUpdate({ target: [projectSteps.projectId, projectSteps.stepNumber], set: { status, content: { ...content } } });
}
