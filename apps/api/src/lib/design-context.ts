/**
 * Bilan Harmonie du bâtiment conçu — les entrées de `designAnalysis` /
 * `designAudit` (modèle de domaine) chargées pour un projet : domaines du
 * modèle natif (parcelle, emprise, niveaux, plan, étude solaire), cas de
 * programme, répartition, observations du site, réponses des formulaires,
 * dossier Harmony, géoréférencement (étude solaire, sinon conversion du CRS
 * de la parcelle, sinon repère saisi), hypothèses de travail (celles de
 * l'exemple pour P.118, sinon celles du dossier).
 */
import type { Point2 } from "@parcours/core-geometry";
import {
  compassStatus,
  designAnalysis,
  designAssumptionsHtml,
  designAudit,
  designAuditHtml,
  designIssuesHtml,
  designLevelTableHtml,
  designMetricsHtml,
  designPlanSvg,
  designReportHtml,
  designRoomTableHtml,
  designSourcesHtml,
  designSynthesisHtml,
  designTraceHtml,
  exampleRoomsHtml,
  harmonyDossier,
  harmonyProfile,
  natalStatus,
  programmeCaseSums,
  type DesignAnalysis,
  type DesignAssumption,
  type DesignAuditRow,
  type DesignGeoreference,
  type DesignReviewInput,
  type HarmonyDossier,
  type ProgrammeCase,
} from "@parcours/domain-model";
import { projects } from "../db/schema.js";
import { HARMONY_ENGINE, PARCOURS_STEPS } from "../data/parcours.js";
import { loadModelDomains } from "./model-context.js";
import { loadActiveProgrammeCase, programmeStateOf } from "./programme-case.js";
import { loadProgrammeRepartition } from "../routes/programme.js";
import { georeferenceFromParcel, siteObservationsOf } from "./site-context.js";
import { loadStepContext, stepView, type StepContext } from "./step-context.js";
import { loadStepRows, type Querier, type StepRows } from "./step-rows.js";

export const P118_EXAMPLE_ID = "p118-exemple-complet";
export const P118_CASE_ID = "parcours_lot118";

type ProjectRow = typeof projects.$inferSelect;

export interface DesignContext {
  input: DesignReviewInput;
  analysis: DesignAnalysis;
  audit: DesignAuditRow[];
  profileLabel: string;
  harmony: HarmonyDossier;
  steps: StepContext;
}

function point2s(v: unknown): Point2[] {
  return Array.isArray(v) ? v.filter((p): p is Point2 => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p): Point2 => [p[0], p[1]]) : [];
}

/** `ownsP118(p)` : le projet importé de l'exemple P.118, ou tout projet portant son cas de programme. */
export function ownsP118(project: { sourceExampleId: string | null }, programmeCase: ProgrammeCase | null): boolean {
  return project.sourceExampleId === P118_EXAMPLE_ID || programmeCase?.caseId === P118_CASE_ID;
}

export async function loadDesignContext(q: Querier, project: ProjectRow, now: string, rows?: StepRows): Promise<DesignContext> {
  const stepRows = rows ?? (await loadStepRows(q, project.id));
  const steps = await loadStepContext(q, project, stepRows);
  const domains = await loadModelDomains(q, project.id);
  const programmeCase = await loadActiveProgrammeCase(q, project.id);
  const rep = await loadProgrammeRepartition(project.id, q);
  const h = harmonyDossier(project.harmony, now);
  const example = ownsP118(project, programmeCase);
  const np = (domains?.parcel ?? null) as Record<string, unknown> | null;
  const parcel = np && Array.isArray(np["vertices"])
    ? {
        vertices: point2s(np["vertices"]),
        centroid: Array.isArray(np["centroid"]) ? (point2s([np["centroid"]])[0] ?? null) : null,
        crs: String(np["crs"] ?? ""),
        officialArea: typeof np["officialArea"] === "number" ? np["officialArea"] : null,
        setback: np["setback"] && typeof np["setback"] === "object" ? { envelope: point2s((np["setback"] as Record<string, unknown>)["envelope"]) } : null,
      }
    : null;
  const footprint = point2s((domains?.footprint as { vertices?: unknown } | null)?.vertices);
  const attachment = (project.sourceAttachment ?? {}) as Record<string, unknown>;
  const dossierV62 = (attachment["dossierV62"] ?? null) as { georeference?: DesignGeoreference & { parcelVertices?: Point2[] }; assumptions?: DesignAssumption[] } | null;
  // `georef(c)` : géoréférencement de l'exemple quand la parcelle est la sienne, sinon conversion du CRS, sinon repère saisi à l'étape 01.
  // (L'étude solaire du moteur V14 n'existe plus depuis la bascule : elle n'était saisie que dans cet ancien moteur.)
  const siteObservations = siteObservationsOf(project);
  let georeference: DesignGeoreference | null = null;
  if (dossierV62?.georeference && parcel && JSON.stringify(parcel.vertices) === JSON.stringify(dossierV62.georeference.parcelVertices) && parcel.crs === dossierV62.georeference.crs) {
    const { parcelVertices: _ignored, ...g } = dossierV62.georeference;
    georeference = { ...g, hypothesis: true };
  } else if (parcel) {
    georeference = georeferenceFromParcel(parcel);
  }
  if (!georeference && siteObservations.geographic) {
    georeference = { latitude: siteObservations.geographic.latitude, longitude: siteObservations.geographic.longitude, projectNorth: null, source: siteObservations.geographic.source || "Repérage saisi, sans calage du contour", hypothesis: true };
  }
  const assumptions: DesignAssumption[] = Array.isArray(h.workingAssumptionsV62) ? (h.workingAssumptionsV62 as DesignAssumption[]) : example && dossierV62?.assumptions ? dossierV62.assumptions : [];
  const programmeState = programmeStateOf(project);
  const input: DesignReviewInput = {
    projectId: project.id,
    projectName: project.name,
    nativeId: domains?.nativeId ?? null,
    levels: steps.model ? (domains!.levels as DesignReviewInput["levels"]) : [],
    floor: steps.model ? (domains!.floor as DesignReviewInput["floor"]) : { levels: {} },
    parcel,
    footprint,
    solarSite: null,
    programmeCase: programmeCase ? { caseId: programmeCase.caseId, type: programmeCase.type, spaces: programmeCase.spaces, roomLinks: programmeCase.roomLinks ?? {}, hypotheses: programmeCase.hypotheses ?? null, revision: programmeCase.revision } : null,
    repartitionCaseTotals: programmeCase && rep.fromCase ? programmeCaseSums(programmeCase.spaces) : null,
    siteObservations: project.siteObservations,
    siteContext: project.siteContext ?? null,
    business: steps.sources.business,
    generatedTexts: Object.fromEntries(Object.entries(programmeState.generated).map(([k, v]) => [String(k), v])),
    harmony: h,
    georeference,
    assumptions,
    example,
    parcelTransmission: (project.parcelTransmission as { status?: string; reason?: string } | null) ?? null,
    decision19: (stepRows.get(19)?.content.fields["decision"] as string | undefined) ?? null,
    textConflicts: programmeState.conflicts.length,
    engine: HARMONY_ENGINE,
    now,
  };
  const analysis = designAnalysis(input);
  const programmeType = rep.stored ? rep.type : programmeCase?.type;
  const profileLabel = harmonyProfile(HARMONY_ENGINE, h, programmeType ? { type: programmeType } : null, example).label;
  return { input, analysis, audit: designAudit(input, analysis, profileLabel), profileLabel, harmony: h, steps };
}

/** La vue servie au client : analyse (sans les polygones), audit, revue archivée, hypothèses, références directionnelles, plans SVG par niveau. */
export function designReviewView(ctx: DesignContext) {
  const { analysis: r, input } = ctx;
  return {
    analysis: {
      ...r,
      rooms: r.rooms.map(({ points: _p, holes: _h, ...room }) => room),
    },
    audit: ctx.audit,
    review: ctx.harmony.designReviewV62 ?? null,
    history: ctx.harmony.designReviewHistoryV62 ?? [],
    assumptions: input.assumptions,
    georeference: input.georeference,
    /** Observation déclarée du contexte extérieur (null tant que rien n'est déclaré). */
    siteContext: input.siteContext,
    profileLabel: ctx.profileLabel,
    example: input.example,
    compass: { values: ctx.harmony.compass, status: compassStatus(input.engine, ctx.harmony.compass) },
    natal: natalStatus(input.engine, ctx.harmony),
    plans: Object.fromEntries(r.floors.map((f) => [f.id, designPlanSvg(input, r, f.id)])),
    /** Fragments HTML composés par le moteur (mêmes fonctions que le rapport), prêts à afficher dans le bilan en ligne. */
    html: {
      synthesis: designSynthesisHtml(input, r),
      metrics: designMetricsHtml(r),
      levelTable: designLevelTableHtml(r),
      rooms: Object.fromEntries([["", designRoomTableHtml(r)], ...r.floors.map((f) => [f.id, designRoomTableHtml(r, f.id)])]),
      /** Fiches d'espaces de l'exemple résolu (`roomsHTML` de p118-resolved-app) ; `null` hors du dossier P.118. */
      exampleRooms: input.example ? exampleRoomsHtml(input, r) : null,
      issues: designIssuesHtml(r),
      audit: designAuditHtml(ctx.audit),
      assumptions: designAssumptionsHtml(input.assumptions),
      sources: designSourcesHtml(input, r),
      designTrace: designTrace(ctx),
    },
  };
}

/** Le rapport HTML, avec la trace Harmonie des étapes 10 / 11 (`designTraceHTML`). */
export function designReportFor(ctx: DesignContext, css: string): string {
  const trace = designTrace(ctx);
  return designReportHtml(ctx.input, ctx.analysis, { css, audit: ctx.audit, designTrace: trace });
}

function designTrace(ctx: DesignContext): string {
  const view10 = stepView(PARCOURS_STEPS.find((d) => d.number === 10)!, ctx.steps);
  const view11 = stepView(PARCOURS_STEPS.find((d) => d.number === 11)!, ctx.steps);
  const chosen = [...view10.proposals, ...view11.proposals].filter((q) => q.retained).map((q) => ({ title: q.title, text: q.text, link: q.decision.link, ...(q.objectId ? { objectId: q.objectId } : {}), stateLabel: q.stateLabel, stale: q.stale }));
  return designTraceHtml(view10.incoming, chosen);
}
