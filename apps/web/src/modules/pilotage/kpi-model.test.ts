import { describe, expect, it } from "vitest";
import type { AnalysesView, DocumentsView, ParcoursStep, ProjectPlanning, ProjectPlanningStep } from "../../lib/api";
import { buildPilotageKpis, localCivilDay } from "./kpi-model";

const demoSteps = (): ParcoursStep[] => Array.from({ length: 21 }, (_, i) => ({
  number: i + 1, title: "Étape " + (i + 1), status: "a-faire", stale: false, staleRetainedCount: 0,
})) as unknown as ParcoursStep[];

const stepPlan = (endDate: string | null, startDate = "2026-10-01", responsible = "Architecte", nextAction = "Vérifier") =>
  ({ startDate, endDate, responsible, nextAction }) satisfies ProjectPlanningStep;

const plan = (steps: ProjectPlanning["steps"]): ProjectPlanning => ({
  projectId: "p1", revision: 2, steps, updatedAt: "2026-10-12T10:00:00Z", updatedBy: "u1", baseline: null,
});

const documentView = (revision = 7): DocumentsView => ({
  modelRevision: revision, nativeHash: "hash", computedAt: "2026-10-13T10:00:00Z",
  documents: [
    { kind: "harmonie-etape-01", label: "Rapport étape 01", stepNumber: 1,
      produced: { producedAt: "2026-10-11T00:00:00Z", count: 1, modelRevision: revision, inputHash: "a" }, freshness: "a-jour" },
    { kind: "harmonie-etape-02", label: "Rapport étape 02", stepNumber: 2,
      produced: { producedAt: "2026-10-11T00:00:00Z", count: 1, modelRevision: 5, inputHash: "b" }, freshness: "perime" },
    { kind: "harmonie-etape-03", label: "Rapport étape 03", stepNumber: 3, produced: null, freshness: null },
    { kind: "archive-projet", label: "Archive", stepNumber: null,
      produced: { producedAt: "2026-10-11T00:00:00Z", count: 1, modelRevision: revision, inputHash: "a" }, freshness: "a-jour" },
  ] as unknown as DocumentsView["documents"],
});

const analysesView = (revision = 7): AnalysesView => ({
  modelRevision: revision, checks: [
    { status: "conforme" }, { status: "a-verifier" }, { status: "non-evalue" }, { status: "sans-objet" },
  ],
  totals: { conforme: 1, "non-conforme": 0, "a-verifier": 1, "non-evalue": 1, "sans-objet": 1 },
  inputHash: "input-abcdef", nativeHash: "native-abcdef", version: "v-test", computedAt: "2026-10-13T10:00:00Z",
}) as unknown as AnalysesView;

const build = (overrides: Partial<Parameters<typeof buildPilotageKpis>[0]> = {}) => buildPilotageKpis({
  steps: demoSteps(), planning: plan({}), documents: documentView(), analyses: analysesView(),
  projectId: "p1", projectRevision: 7, today: "2026-10-14", ...overrides,
});

describe("R4 — indicateurs métier sourcés", () => {
  it("refuse de transformer des sources indisponibles en KPI favorables à zéro", () => {
    const kpi = build({ steps: null, planning: null, documents: null, analyses: null });
    expect(kpi.steps).toBeNull();
    expect(kpi.phases).toHaveLength(6);
    expect(kpi.phases[0]).toMatchObject({
      total: 3, finished: null, dated: null, assigned: null, pastDue: null, currentDocuments: null,
    });
    expect(kpi.analysis).toBeNull();
    expect(Object.values(kpi.sourceStatus).every((state) => state === "unavailable")).toBe(true);
  });

  it("agrège statuts, retards, actions et pièces par phase sans fabriquer de score de qualité", () => {
    const steps = demoSteps();
    steps[0]!.status = "termine";
    steps[1]!.status = "en-cours";
    steps[1]!.stale = true;
    const kpi = build({ steps, planning: plan({
      "1": stepPlan("2026-10-04"),
      "2": stepPlan("2026-10-05", "2026-10-01", "", ""),
      "3": stepPlan(null),
    }) });
    expect(kpi.phases[0]).toMatchObject({
      total: 3, finished: 1, ongoing: 1, toReview: 1,
      dated: 2, assigned: 2, withAction: 2, pastDue: 1, withKnownDeadline: 2,
      currentDocuments: 1, staleDocuments: 1,
    });
    expect(kpi.steps?.[0]).toMatchObject({ outstandingPastDue: false, documentProduced: 1, documentCurrent: 1 });
    expect(kpi.steps?.[1]).toMatchObject({ outstandingPastDue: true, documentProduced: 1, documentStale: 1 });
    expect(kpi.steps?.[2]).toMatchObject({ outstandingPastDue: null, documentProduced: 0 });
    expect(kpi.phases[1]?.finished).toBe(0);
  });

  it("une révision documentaire ou technique différente est non évaluée", () => {
    const kpi = build({ documents: documentView(6), analyses: analysesView(6) });
    expect(kpi.sourceStatus.documents).toBe("unavailable");
    expect(kpi.phases[0]?.currentDocuments).toBeNull();
    expect(kpi.sourceStatus.analyses).toBe("unavailable");
    expect(kpi.analysis).toBeNull();
  });

  it("contrôle la cohérence des comptes techniques annoncés par l'API", () => {
    const checks = analysesView();
    expect(build({ analyses: checks }).analysis).toMatchObject({
      evaluated: 2, conform: 1, toVerify: 1, notEvaluated: 1, notApplicable: 1, total: 4, version: "v-test",
    });
    checks.totals.conforme = 4;
    expect(build({ analyses: checks }).analysis).toBeNull();
  });

  it("les données d'un autre projet ne peuvent pas alimenter les KPI", () => {
    const foreignPlan = plan({ "1": stepPlan("2026-10-10") });
    foreignPlan.projectId = "autre-projet";
    const kpi = build({ planning: foreignPlan });
    expect(kpi.sourceStatus.planning).toBe("unavailable");
    expect(kpi.steps?.[0]?.scheduled).toBeNull();
  });

  it("ne déclare pas un planning daté si le début est invalide ou postérieur à la fin", () => {
    const kpi = build({ planning: plan({ "1": stepPlan("2026-10-01", "2026-10-02"), "2": stepPlan("2026-02-30") }) });
    expect(kpi.steps?.[0]?.scheduled).toBe(false);
    expect(kpi.steps?.[1]?.scheduled).toBe(false);
    expect(kpi.steps?.[1]?.dueDate).toBeNull();
  });

  it("les étapes manquantes invalident la progression mais pas les autres sources", () => {
    const kpi = build({ steps: demoSteps().slice(1) });
    expect(kpi.sourceStatus.parcours).toBe("unavailable");
    expect(kpi.phases[0]?.finished).toBeNull();
    expect(kpi.sourceStatus.documents).toBe("known");
  });

  it("le jour de référence utilise le calendrier local sans forcer UTC", () => {
    expect(localCivilDay(new Date(2026, 9, 14, 20, 30, 0))).toBe("2026-10-14");
  });
});
