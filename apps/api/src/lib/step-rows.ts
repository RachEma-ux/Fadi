/**
 * Lecture / écriture des lignes `project_steps` (contenu réel des 21 étapes
 * d'un projet), partagées par le routeur des étapes, les transmissions du
 * programme (bibliothèque des bâtiments) et les imports.
 */
import { eq } from "drizzle-orm";
import { EMPTY_HARMONIE_STEP_STATE, type HarmonieStepState, type ParcoursStepContent, type ParcoursStepStatus } from "@parcours/domain-model";
import type { db } from "../db/client.js";
import { projectSteps } from "../db/schema.js";
import { EMPTY_STEP_CONTENT } from "../data/parcours.js";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Querier = Tx | typeof db;
export type StepRows = Map<number, { status: ParcoursStepStatus; content: ParcoursStepContent }>;

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
