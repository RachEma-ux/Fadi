/**
 * Client API · Parcours — les 21 étapes (contenu, saisies, statut) et le bloc « site » de l'étape 01.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */
import type { Point2 } from "@parcours/core-geometry";
import type { GeographicCoordinate, SiteObservations } from "@parcours/domain-model";

import { request } from "./http";
import type { HarmonieOption, HarmonieStepState, HarmonieProposal, IncomingIntention, HarmonieProfile } from "./harmonie";

export type ParcoursStepStatus = "a-faire" | "en-cours" | "termine";

export interface ParcoursStepResult {
  donnee: string | null;
  hypothese: string | null;
  raw: string | null;
}

export type ParcoursFieldType = "text" | "textarea" | "number" | "date";
export interface ParcoursFormField {
  key: string;
  label: string;
  type: ParcoursFieldType;
}
export interface ParcoursStepForm {
  intro: string | null;
  fields: ParcoursFormField[];
}

export type ParcoursFieldValue = string | number | null;

export interface ParcoursStepContent {
  status: ParcoursStepStatus;
  choice: string | null;
  headline: string | null;
  decision: string | null;
  why: string | null;
  alternatives: string | null;
  owner: string | null;
  proof: string | null;
  result: ParcoursStepResult | null;
  sourceStatus: string | null;
  fields: Record<string, ParcoursFieldValue>;
  harmonie: HarmonieStepState;
}

/** Étape 01 — le bloc « site » servi avec l'étape : parcelle, géolocalisation, observations déclarées, proposition de départ. */
export interface SiteView {
  parcel: {
    parcelNumber: string;
    commune: string;
    crs: string;
    units: string;
    vertexIds: string[];
    vertexCount: number;
    officialArea: number | null;
    sourceFile: string;
    area: number;
    /** Contour dans le repère local (origine au centroïde, mètres). */
    local: Point2[];
  };
  geo: { center: GeographicCoordinate | null; points: GeographicCoordinate[] | null; source: string; hypothesis: boolean };
  frontage: number | null;
  observations: SiteObservations;
  recommendation: { key: "A" | "B" | "C"; reason: string };
}

/** Ce que « Enregistrer ces données » envoie (`save-site` du prototype). */
export type SiteObservationsInput = Pick<SiteObservations, "frontageEdge" | "approachStatus" | "priority" | "frontContext" | "backContext" | "source" | "note"> & {
  geographic?: SiteObservations["geographic"];
};

/** Une des 21 étapes du Parcours : définition générique + contenu propre au projet + vue Harmonie calculée par le serveur. */
export interface ParcoursStep {
  number: number;
  title: string;
  phase: string;
  key: string | null;
  scope: string | null;
  goal: string | null;
  inputs: string | null;
  deliverable: string | null;
  method: string | null;
  topic: string | null;
  harmonieOptions: HarmonieOption[];
  transmitsTo: number[];
  form: ParcoursStepForm | null;
  status: ParcoursStepStatus;
  content: ParcoursStepContent;
  proposals: HarmonieProposal[];
  incoming: IncomingIntention[];
  retainedCount: number;
  /** « Données pertinentes modifiées » : propositions générées sur d'autres données (`isStageStale`). */
  stale: boolean;
  /** Choix retenus mais à réexaminer. */
  staleRetainedCount: number;
  profile: HarmonieProfile;
  /** Étape 01 seulement ; `null` ailleurs. */
  site: SiteView | null;
  /** Étape 10 : proposition de départ calculée sur le modèle ; `null` ailleurs. */
  recommendation: { key: string; reason: string } | null;
  /** Étapes 10/11 : empreinte et niveaux du modèle lu ; `null` sans modèle. */
  model: { nativeHash: string; floors: { id: string; name: string; count: number; rooms: number }[]; roomCount: number } | null;
  /** Étapes ≥ 07 avec cas de programme appliqué : « Programme : N fiches · X m² de cibles de travail ». */
  programme: { spaceCount: number; total: number } | null;
}

export const parcoursApi = {
  listSteps: (projectId: string) => request<ParcoursStep[]>(`/projects/${projectId}/steps`),
  patchStep: (projectId: string, stepNumber: number, patch: { status?: ParcoursStepStatus; fields?: Record<string, ParcoursFieldValue>; baseline?: Record<string, ParcoursFieldValue> }) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}`, { method: "PATCH", body: JSON.stringify(patch) }),
  putSiteObservations: (projectId: string, input: SiteObservationsInput) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/1/site`, { method: "PUT", body: JSON.stringify(input) }),
  /** « Collecter centre + sommets » : les altitudes reçues du service (contrôlées par le navigateur) deviennent l'altimétrie du site. */
  putSiteElevation: (projectId: string, points: [number, number, number][]) => request<ParcoursStep>(`/projects/${projectId}/steps/1/site/elevation`, { method: "PUT", body: JSON.stringify({ points }) }),
};
