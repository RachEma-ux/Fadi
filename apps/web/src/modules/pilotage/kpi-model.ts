import type { AnalysesView, DocumentDescriptor, DocumentsView, ParcoursStep, ProjectPlanning } from "../../lib/api";
import { completeParcoursList } from "../accueil/dossier-state";
import { COCKPIT_PHASES } from "./roadmap";

/**
 * R4 — Indicateurs déterministes, exclusivement à partir des réponses API
 * déjà calculées et versionnées par Fadi. L'absence d'une source => null,
 * jamais 0 ni une conclusion positive.
 */
export type KnownCount = number | null;
export type StepProgress = "a-faire" | "en-cours" | "termine";
export type CheckState = "conforme" | "non-conforme" | "a-verifier" | "non-evalue" | "sans-objet";

export interface StepPilotageKpi {
  number: number;
  title: string;
  status: StepProgress;
  toReview: boolean;
  /** Un statut terminé est déclaratif ; il ne certifie pas un livrable. */
  scheduled: boolean | null;
  assigned: boolean | null;
  actionDefined: boolean | null;
  /** Échéance dépassée parmi les étapes non terminées ; null sans date connue. */
  outstandingPastDue: boolean | null;
  dueDate: string | null;
  documentProduced: KnownCount;
  documentCurrent: KnownCount;
  documentStale: KnownCount;
  documentNames: readonly { label: string; freshness: "a-jour" | "perime" }[] | null;
}

export interface PhasePilotageKpi {
  title: string;
  first: number;
  last: number;
  total: number;
  finished: KnownCount;
  ongoing: KnownCount;
  toReview: KnownCount;
  dated: KnownCount;
  assigned: KnownCount;
  withAction: KnownCount;
  pastDue: KnownCount;
  withKnownDeadline: KnownCount;
  currentDocuments: KnownCount;
  staleDocuments: KnownCount;
}

export interface AnalysisKpi {
  evaluated: number;
  conform: number;
  nonConform: number;
  toVerify: number;
  notEvaluated: number;
  notApplicable: number;
  total: number;
  modelRevision: number;
  inputHash: string;
  nativeHash: string;
  version: string;
  computedAt: string;
}

export interface PilotageKpiSnapshot {
  today: string;
  steps: StepPilotageKpi[] | null;
  phases: PhasePilotageKpi[];
  analysis: AnalysisKpi | null;
  sourceStatus: {
    parcours: "known" | "unavailable";
    planning: "known" | "unavailable";
    documents: "known" | "unavailable";
    analyses: "known" | "unavailable";
  };
}

/** The calendar day is local to the viewing user, not an invented timezone. */
export function localCivilDay(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return [year, month, day].join("-");
}

function civilDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function knownDocuments(docs: DocumentsView | null, projectRevision: number | null): readonly DocumentDescriptor[] | null {
  if (projectRevision === null || !docs || docs.modelRevision !== projectRevision || !Array.isArray(docs.documents)) return null;
  // L'API fait foi sur la fraîcheur par empreinte du document.
  return docs.documents;
}

function validAnalyses(view: AnalysesView | null, projectRevision: number | null): AnalysisKpi | null {
  if (projectRevision === null || !view || view.modelRevision !== projectRevision || !Array.isArray(view.checks)) return null;
  const keys: CheckState[] = ["conforme", "non-conforme", "a-verifier", "non-evalue", "sans-objet"];
  const counts: Record<CheckState, number> = { conforme: 0, "non-conforme": 0, "a-verifier": 0, "non-evalue": 0, "sans-objet": 0 };
  for (const check of view.checks) {
    if (!keys.includes(check.status as CheckState)) return null;
    counts[check.status as CheckState]++;
  }
  if (!keys.every((key) => view.totals[key] === counts[key])) return null;
  return {
    evaluated: counts.conforme + counts["non-conforme"] + counts["a-verifier"],
    conform: counts.conforme,
    nonConform: counts["non-conforme"],
    toVerify: counts["a-verifier"],
    notEvaluated: counts["non-evalue"],
    notApplicable: counts["sans-objet"],
    total: view.checks.length,
    modelRevision: view.modelRevision,
    inputHash: view.inputHash,
    nativeHash: view.nativeHash,
    version: view.version,
    computedAt: view.computedAt,
  };
}

export function buildPilotageKpis(input: {
  steps: readonly ParcoursStep[] | null;
  planning: ProjectPlanning | null;
  documents: DocumentsView | null;
  analyses: AnalysesView | null;
  projectId: string;
  projectRevision: number | null;
  today: string;
}): PilotageKpiSnapshot {
  const validSteps = completeParcoursList(input.steps ?? undefined);
  const plan = input.planning?.projectId === input.projectId ? input.planning.steps : null;
  const docs = knownDocuments(input.documents, input.projectRevision);
  const analysis = validAnalyses(input.analyses, input.projectRevision);

  const stepRows: StepPilotageKpi[] | null = validSteps ? input.steps!.map((step) => {
    const p = plan?.[String(step.number)];
    const dated = p ? civilDate(p.startDate) && civilDate(p.endDate) && p.endDate >= p.startDate : false;
    const hasDeadline = p && civilDate(p.endDate);
    const produced = docs?.filter((doc) => doc.stepNumber === step.number && doc.produced !== null) ?? null;
    return {
      number: step.number,
      title: step.title,
      status: step.status,
      toReview: step.stale || step.staleRetainedCount > 0,
      scheduled: plan === null ? null : dated,
      assigned: plan === null ? null : Boolean(p?.responsible?.trim()),
      actionDefined: plan === null ? null : Boolean(p?.nextAction?.trim()),
      outstandingPastDue: plan === null || !hasDeadline || !civilDate(input.today)
        ? null : step.status !== "termine" && p.endDate! < input.today,
      dueDate: hasDeadline ? p.endDate : null,
      documentProduced: produced === null ? null : produced.length,
      documentCurrent: produced === null ? null : produced.filter((doc) => doc.freshness === "a-jour").length,
      documentStale: produced === null ? null : produced.filter((doc) => doc.freshness === "perime").length,
      documentNames: produced === null ? null : produced
        .filter((doc): doc is DocumentDescriptor & { freshness: "a-jour" | "perime" } => doc.freshness === "a-jour" || doc.freshness === "perime")
        .map((doc) => ({ label: doc.label, freshness: doc.freshness })),
    };
  }).sort((a, b) => a.number - b.number) : null;

  const phases = COCKPIT_PHASES.map((phase): PhasePilotageKpi => {
    const members = stepRows?.filter((step) => step.number >= phase.first && step.number <= phase.last) ?? null;
    const count = (selector: (step: StepPilotageKpi) => boolean): KnownCount =>
      members === null ? null : members.filter(selector).length;
    const sums = (field: "documentCurrent" | "documentStale"): KnownCount =>
      members === null || members.some((step) => step[field] === null)
        ? null : members.reduce((sum, step) => sum + (step[field] ?? 0), 0);
    return {
      title: phase.name,
      first: phase.first,
      last: phase.last,
      total: phase.last - phase.first + 1,
      finished: count((step) => step.status === "termine"),
      ongoing: count((step) => step.status === "en-cours"),
      toReview: count((step) => step.toReview),
      dated: plan === null ? null : count((step) => step.scheduled === true),
      assigned: plan === null ? null : count((step) => step.assigned === true),
      withAction: plan === null ? null : count((step) => step.actionDefined === true),
      pastDue: plan === null || !civilDate(input.today) ? null : count((step) => step.outstandingPastDue === true),
      withKnownDeadline: plan === null ? null : count((step) => step.dueDate !== null),
      currentDocuments: sums("documentCurrent"),
      staleDocuments: sums("documentStale"),
    };
  });
  return {
    today: input.today,
    steps: stepRows,
    phases,
    analysis,
    sourceStatus: {
      parcours: validSteps ? "known" : "unavailable",
      planning: plan !== null ? "known" : "unavailable",
      documents: docs !== null ? "known" : "unavailable",
      analyses: analysis !== null ? "known" : "unavailable",
    },
  };
}
