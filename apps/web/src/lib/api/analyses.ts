/**
 * Client API · Analyses métier — contrôles traçables, quantités dérivées, structure et circulations déclarées, variantes.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */
import type { CheckStatus, DerivedQuantities, ProgrammeScenarioRow, StepResults, StructureStatement, TraceableCheck } from "@parcours/domain-model";

import { request } from "./http";

/** Module Analyses métier : tout est calculé à la lecture et tagué de la révision du modèle et des empreintes. */
export interface AnalysesView {
  version: string;
  computedAt: string;
  modelRevision: number;
  nativeHash: string;
  inputHash: string;
  profileLabel: string;
  example: boolean;
  quantities: DerivedQuantities;
  checks: TraceableCheck[];
  totals: Record<CheckStatus, number>;
  results: StepResults;
  structure: { statements: StructureStatement[]; source: string } | null;
  circulation: { revision: number | null; spaces: { code: string; name: string; levels: string[]; area: number; dimension: string; use: string }[]; totals: Record<string, number>; note: string; source: string } | null;
  scenarios: ProgrammeScenarioRow[];
}

export const analysesApi = {
  getAnalyses: (projectId: string) => request<AnalysesView>(`/projects/${projectId}/analyses`),
};
