/**
 * Client API · Programmation — répartition programmatique, cas de programme appliqué (dossier maître), liaisons au modèle, hypothèses, transfert surfacique, bibliothèque des bâtiments.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */
import type { BuildingCase, BuildingHypothesis, BuildingReference, ProgrammeCase, ProgrammeFieldConflict, ProgrammeModelLinkRow, SurfaceTransfer } from "@parcours/domain-model";

import { request } from "./http";

export type ProgrammeMode = "min" | "cible" | "max";

export interface ProgrammeRepartition {
  type: string;
  baseArea: number;
  mode: ProgrammeMode;
  custom: Record<string, number>;
  components: string[];
  stored: boolean;
}

export interface ProgrammeView {
  repartition: ProgrammeRepartition;
  typeLabel: string;
  rows: { key: string; label: string; range: [number, number]; ratio: number; area: number }[];
  totals: { baseArea: number; supportPercent: number; supportArea: number; netPercent: number; netArea: number };
  reference: {
    subtitle: string;
    modes: { key: ProgrammeMode; label: string }[];
    types: { key: string; label: string }[];
    adjacency: [string, string][];
    statusNote: string;
    transfer: { title: string; rules: string; control: string };
  };
  programmeCase: ProgrammeCaseView | null;
  resolvedExample: boolean;
}

export type ProgrammeSumsView = Record<"principal" | "circulation" | "technique" | "sanitaires" | "convivialite" | "supportAutres" | "parois" | "support" | "programme" | "total", number>;

/** Le cas de programme appliqué au projet, tel que le module Programmation le sert ; `readOnly` pour le cas d'un exemple conservé en pièce jointe. */
export type ProgrammeCaseView = {
  title: string | null;
  scenarioLabel: string | null;
  revision: number | null;
  users: string | null;
  spaceCount: number;
  sums: ProgrammeSumsView;
  readOnly?: boolean;
} & Partial<
  Omit<ProgrammeCase, "title" | "scenarioLabel" | "revision" | "users"> & {
    profileLabel: string;
    libraryCaseExists: boolean;
    conflicts: ProgrammeFieldConflict[];
    decisionReview: { required: boolean; reason: string; at: string } | null;
    decisionHistoryCount: number;
    history: { revision: number; title: string; scenarioLabel: string; updated: string; archived: string }[];
  }
>;

/** « Programme ↔ modèle dessiné » (`modelView`) : lignes du programme appliqué, zones liées et disponibles. */
export interface ProgrammeModelLinksView {
  applied: boolean;
  revision: number | null;
  title?: string;
  scenarioLabel?: string;
  rows: ProgrammeModelLinkRow[];
  roomCount: number;
  hasModel: boolean;
}

/** Registre des hypothèses (`hypothesisView`) après modification. */
export interface ProgrammeHypothesesView {
  hypotheses: (BuildingHypothesis & { updated?: string })[];
  revision: number;
}

export type SurfaceTransferView = SurfaceTransfer;

/** Bibliothèque des bâtiments : index et fiche d'un cas. */
export interface BuildingLibraryIndex {
  version: string;
  date: string;
  surfaceConvention: string;
  profiles: { id: string; label: string; tags: string }[];
  /** Les 21 étapes et ce que chacune reçoit du cas (`routeNames` du prototype). */
  steps: { number: number; title: string; route: string }[];
  cases: {
    id: string;
    type: string;
    subtype: string;
    title: string;
    capacity: number | null;
    unit: string;
    users: string;
    summary: string;
    origin: string;
    sourceKey: string | null;
    spaceCount: number;
    scenarioCount: number;
    programmeArea: number;
    paroisArea: number;
  }[];
}

export interface BuildingCaseDetail {
  case: BuildingCase;
  references: BuildingReference[];
  surfaceConvention: string;
  version: string;
}

export interface ApplyProgrammeCaseInput {
  caseId: string;
  scenarioId: string;
  jurisdiction: "Maroc" | "France" | "Suisse" | "Autre / à préciser";
  replaceText: boolean;
}

export const programmationApi = {
  /** Bibliothèque des bâtiments et cas de programme appliqué. */
  getBuildingLibrary: () => request<BuildingLibraryIndex>("/library/buildings"),
  getBuildingCase: (id: string) => request<BuildingCaseDetail>(`/library/buildings/${encodeURIComponent(id)}`),
  applyProgrammeCase: (projectId: string, input: ApplyProgrammeCaseInput) =>
    request<ProgrammeView & { applied: { revision: number; conflicts: number } }>(`/projects/${projectId}/programme/case`, { method: "POST", body: JSON.stringify(input) }),
  /** « Adopter cette proposition » : l'écart n° `index` — le champ conservé prend le texte proposé, l'ancien est archivé. */
  adoptProgrammeConflict: (projectId: string, index: number) => request<ProgrammeView & { adopted: ProgrammeFieldConflict }>(`/projects/${projectId}/programme/conflicts/${index}/adopt`, { method: "POST" }),
  patchProgrammeSpace: (projectId: string, spaceId: string, patch: { quantity?: number | string; unitArea?: number | string }) =>
    request<ProgrammeView>(`/projects/${projectId}/programme/case/spaces/${encodeURIComponent(spaceId)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  /** « Comparer au modèle dessiné » : liaisons ligne ↔ zone par identifiant (`modelView` / `linkRoom`). */
  getProgrammeModelLinks: (projectId: string) => request<ProgrammeModelLinksView>(`/projects/${projectId}/programme/model-links`),
  linkProgrammeRoom: (projectId: string, spaceId: string, roomId: string) =>
    request<{ ok: true }>(`/projects/${projectId}/programme/case/links`, { method: "POST", body: JSON.stringify({ spaceId, roomId }) }),
  unlinkProgrammeRoom: (projectId: string, spaceId: string, roomId: string) =>
    request<void>(`/projects/${projectId}/programme/case/links/${encodeURIComponent(spaceId)}/${encodeURIComponent(roomId)}`, { method: "DELETE" }),
  /** Registre des hypothèses : statut, responsable, preuve / motif (`hypothesisView`). */
  patchProgrammeHypothesis: (projectId: string, hypothesisId: string, patch: { status?: string; owner?: string; proof?: string }) =>
    request<ProgrammeHypothesesView>(`/projects/${projectId}/programme/case/hypotheses/${encodeURIComponent(hypothesisId)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  /** Transfert surfacique à total constant (étape 07) : comparaison avant / après, puis application sur la même empreinte. */
  previewProgrammeTransfer: (projectId: string, input: { from: string; to: string; amount: string | number; reason: string }) =>
    request<SurfaceTransferView>(`/projects/${projectId}/programme/case/transfer/preview`, { method: "POST", body: JSON.stringify(input) }),
  applyProgrammeTransfer: (projectId: string, transfer: SurfaceTransferView) =>
    request<ProgrammeView & { transfer: { total: number; revision: number } }>(`/projects/${projectId}/programme/case/transfer`, { method: "POST", body: JSON.stringify(transfer) }),
  getProgramme: (projectId: string) => request<ProgrammeView>(`/projects/${projectId}/programme`),
  putProgramme: (projectId: string, rep: { type: string; baseArea: number; mode: ProgrammeMode; custom: Record<string, number> }) =>
    request<ProgrammeView>(`/projects/${projectId}/programme`, { method: "PUT", body: JSON.stringify(rep) }),
};
