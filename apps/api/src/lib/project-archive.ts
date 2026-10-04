/**
 * Archive de projet côté serveur — « Sauvegarder projet JSON » (export de
 * tout ce qui appartient au projet) et « Importer projet JSON » (création
 * d'un nouveau projet à partir d'une archive Fadi ou d'un export du
 * prototype, voir `@parcours/domain-model` `archive.ts`). L'import est une
 * transaction : rien n'est créé si une partie du fichier est refusée.
 */
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import {
  ARCHIVE_ATTACHMENTS_LIMIT,
  ArchiveError,
  PROJECT_ARCHIVE_KIND,
  PROJECT_ARCHIVE_VERSION,
  archiveStageMapping,
  buildHarmonieProposals,
  decodeDataUrl,
  proposalSnapshot,
  PROGRAMME_MODES,
  type ArchiveAttachment,
  type ArchiveRepartition,
  type HarmonieProposalDecision,
  type ProgrammeMode,
  type ProjectArchive,
} from "@parcours/domain-model";
import type { JeuDonneesP118 } from "@parcours/atelier-model";
import { parcels, programmeCases, programmeRepartitions, projects, projectSteps, stepFiles } from "../db/schema.js";
import { EMPTY_STEP_CONTENT, HARMONIE_PROFILES, PARCOURS_STEPS } from "../data/parcours.js";
import { newId } from "./ids.js";
import { initialiserModeleServeur, modeleArchive } from "./atelier-commands.js";
import { chargerEtat } from "./atelier-rows.js";
import { computationFor, loadStepContext, type StepContextProject } from "./step-context.js";
import { loadStepRows, upsertStep, type Querier, type Tx } from "./step-rows.js";
import type { SiteContextDeclaration } from "@parcours/domain-model";

/** Version de l'application écrite dans l'archive (traçabilité, pas une compatibilité). */
export const APPLICATION_VERSION = "fadi 0.1.0";
/** Version du prototype de référence (docs/migration/reference.md). */
export const SOURCE_VERSION = "8.19.0";

type ProjectRow = typeof projects.$inferSelect;

/** Le mode enregistré (« min » / « cible » / « max », ou « cas » quand la répartition vient d'un cas de programme). */
function repartitionMode(mode: string): ArchiveRepartition["mode"] {
  return mode === "cas" ? "cas" : (PROGRAMME_MODES as readonly string[]).includes(mode) ? (mode as ProgrammeMode) : "cible";
}

/** `backup()` : le projet, ses étapes, son programme, ses parcelles, son modèle typé et ses pièces jointes (20 Mo cumulés) en un seul JSON. */
export async function exportProjectArchive(q: Querier, project: ProjectRow, now: string): Promise<ProjectArchive> {
  const rows = await loadStepRows(q, project.id);
  const [rep] = await q.select().from(programmeRepartitions).where(eq(programmeRepartitions.projectId, project.id)).limit(1);
  const cases = await q.select().from(programmeCases).where(eq(programmeCases.projectId, project.id)).orderBy(asc(programmeCases.revision));
  const parcelRows = await q.select().from(parcels).where(eq(parcels.projectId, project.id)).orderBy(asc(parcels.number));
  const modele = await chargerEtat(q, project.id);
  const files = await q.select().from(stepFiles).where(eq(stepFiles.projectId, project.id)).orderBy(asc(stepFiles.addedAt));
  const warnings: string[] = [];
  const stageAttachments: ArchiveAttachment[] = [];
  let bytes = 0;
  for (const f of files) {
    if (bytes + f.size > ARCHIVE_ATTACHMENTS_LIMIT) {
      warnings.push(`Pièce non incluse (limite 20 Mo cumulés) : ${f.name}`);
      continue;
    }
    bytes += f.size;
    stageAttachments.push({ stepNumber: f.stepNumber, name: f.name, type: f.type, size: f.size, addedAt: f.addedAt.toISOString(), dataUrl: `data:${f.type};base64,${f.content.toString("base64")}` });
  }
  return {
    kind: PROJECT_ARCHIVE_KIND,
    version: PROJECT_ARCHIVE_VERSION,
    applicationVersion: APPLICATION_VERSION,
    sourceVersion: SOURCE_VERSION,
    exported: now,
    stageMapping: archiveStageMapping(PARCOURS_STEPS),
    project: {
      code: project.code,
      name: project.name,
      modelRevision: project.modelRevision,
      sourceExampleId: project.sourceExampleId ?? null,
      exampleMode: project.exampleMode ?? null,
      sourceAttachment: project.sourceAttachment ?? null,
      siteObservations: project.siteObservations ?? null,
      siteContext: (project.siteContext as Record<string, unknown> | null) ?? null,
      programmeState: project.programmeState ?? null,
      parcelTransmission: project.parcelTransmission ?? null,
      parcelsInitialized: project.parcelsInitialized,
      harmony: project.harmony ?? null,
    },
    steps: PARCOURS_STEPS.map((def) => {
      const r = rows.get(def.number);
      return { stepNumber: def.number, status: r?.status ?? EMPTY_STEP_CONTENT.status, content: r?.content ?? EMPTY_STEP_CONTENT };
    }),
    programmeRepartition: rep ? { type: rep.type, baseArea: rep.baseArea, mode: repartitionMode(rep.mode), custom: { ...rep.custom }, components: [...rep.components] } : null,
    programmeCases: cases.map((c) => ({ revision: c.revision, caseId: c.caseId, scenarioId: c.scenarioId, data: c.data })),
    parcels: parcelRows.map((p) => ({ id: p.id, number: p.number, name: p.name, crs: p.crs, parcelNumber: p.parcelNumber, data: p.data, revision: p.revision })),
    atelier: modele ? { modele: modele as unknown as Record<string, unknown> } : null,
    native: null,
    stageAttachments,
    warnings,
  };
}

/**
 * Pose les empreintes de péremption sur les étapes d'un projet qui vient
 * d'être créé (exemple importé, archive importée) : chaque étape générée
 * (révision > 0) et chaque choix retenu sont datés des données importées —
 * rien n'est « à réexaminer » à l'ouverture, seuls les changements
 * ultérieurs le seront. Les instantanés manquants sont complétés.
 */
export async function stampStepFingerprints(tx: Tx, project: StepContextProject): Promise<void> {
  const rows = await loadStepRows(tx, project.id);
  const ctx = await loadStepContext(tx, project, rows);
  for (const def of PARCOURS_STEPS) {
    const row = rows.get(def.number);
    if (!row) continue;
    const fingerprint = ctx.dependencies.get(def.number)?.fingerprint ?? null;
    const decisions: Record<string, HarmonieProposalDecision> = { ...row.content.harmonie.proposals };
    for (const q of buildHarmonieProposals(HARMONIE_PROFILES, def, ctx.profile, row.content.harmonie, computationFor(ctx, def.number), fingerprint)) {
      const d = decisions[q.id];
      if (q.retained && d) decisions[q.id] = { ...d, acceptedHash: fingerprint, snapshot: q.orphaned && d.snapshot ? d.snapshot : proposalSnapshot(q) };
    }
    const harmonie = { ...row.content.harmonie, generatedHash: row.content.harmonie.revision > 0 ? fingerprint : null, proposals: decisions };
    await upsertStep(tx, project.id, def.number, row.status, { ...row.content, harmonie });
  }
}

/**
 * `importBundle` : crée un NOUVEAU projet appartenant à l'utilisateur à
 * partir d'une archive normalisée. Les projets existants ne sont jamais
 * modifiés. Retourne le projet créé et les réserves (pièces jointes
 * illisibles, modèle non projeté).
 */
export async function importProjectArchive(tx: Tx, ownerId: string, archive: ProjectArchive, now: string): Promise<{ project: ProjectRow; warnings: string[] }> {
  const id = newId("proj");
  const warnings = [...archive.warnings];
  const [project] = await tx
    .insert(projects)
    .values({
      id,
      ownerId,
      code: archive.project.code,
      name: archive.project.name,
      modelRevision: archive.atelier || archive.native ? Math.max(1, archive.project.modelRevision) : 0,
      sourceExampleId: archive.project.sourceExampleId,
      exampleMode: archive.project.exampleMode,
      sourceAttachment: archive.project.sourceAttachment,
      siteObservations: archive.project.siteObservations,
      siteContext: archive.project.siteContext as SiteContextDeclaration | null,
      programmeState: archive.project.programmeState,
      parcelTransmission: archive.project.parcelTransmission,
      parcelsInitialized: archive.project.parcelsInitialized,
      harmony: archive.project.harmony,
    })
    .returning();
  if (!project) throw new Error("project insert returned nothing");

  await tx.insert(projectSteps).values(archive.steps.map((s) => ({ projectId: id, stepNumber: s.stepNumber, status: s.status, content: { ...s.content } as Record<string, unknown> })));

  if (archive.programmeRepartition) {
    const r = archive.programmeRepartition;
    await tx.insert(programmeRepartitions).values({ projectId: id, type: r.type, baseArea: r.baseArea, mode: r.mode, custom: r.custom, components: r.components });
  }
  if (archive.programmeCases.length) {
    await tx.insert(programmeCases).values(archive.programmeCases.map((c) => ({ projectId: id, revision: c.revision, caseId: c.caseId, scenarioId: c.scenarioId, data: c.data })));
  }
  if (archive.parcels.length) {
    await tx.insert(parcels).values(archive.parcels.map((p) => ({ projectId: id, id: p.id, number: p.number, name: p.name, crs: p.crs, parcelNumber: p.parcelNumber, data: p.data, revision: p.revision })));
  }
  // Le modèle typé (D-052) : l'état d'une archive version 2 tel quel, ou le modèle natif d'une archive version 1 ou
  // d'un export du prototype passé par l'importeur du lot 1. Un modèle typé refusé annule tout l'import.
  if (archive.atelier) {
    const modele = modeleArchive(archive.atelier.modele);
    if (typeof modele === "string") throw new ArchiveError(modele);
    await initialiserModeleServeur(tx, id, { modele });
  } else if (archive.native) {
    const natif: JeuDonneesP118 = { registry: archive.native.registry, domains: archive.native.domains };
    const etat = await initialiserModeleServeur(tx, id, { natif });
    if (!Object.values(etat.objets).some((o) => o.classe === "niveau")) warnings.push("Modèle natif importé sans niveaux exploitables : modèle typé sans bâtiment.");
  }
  for (const f of archive.stageAttachments) {
    const decoded = decodeDataUrl(f.dataUrl);
    if (!decoded) {
      warnings.push(`Pièce jointe non restaurée (encodage inattendu) : ${f.name}`);
      continue;
    }
    const content = Buffer.from(decoded.base64, "base64");
    await tx.insert(stepFiles).values({ id: randomUUID(), projectId: id, stepNumber: f.stepNumber, name: f.name, type: f.type || decoded.type, size: content.length, content, addedAt: f.addedAt ? new Date(f.addedAt) : new Date(now) });
  }

  await stampStepFingerprints(tx, { id, name: project.name, siteObservations: project.siteObservations, harmony: project.harmony });
  return { project, warnings };
}
