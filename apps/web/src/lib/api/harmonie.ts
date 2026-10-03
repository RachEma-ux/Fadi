/**
 * Client API · Harmonie — propositions et arbitrages par étape, rapports, bilan du bâtiment conçu (design-review) et aperçu conceptuel.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */
import type { SiteZoning } from "@parcours/core-geometry";
import type { ProgrammeFieldConflict, SiteZoningGeographic } from "@parcours/domain-model";

import { request } from "./http";
import type { ParcoursStep } from "./parcours";

/** Aperçu conceptuel (`GET …/design-review/apercu`) : axonométrie éclatée dessinée depuis les polygones réels ; `svg` null sans modèle. */
export interface ConceptPreview {
  svg: string | null;
  /** Plan compact du niveau de référence (RDC ou premier niveau), sans texte ; null sans modèle. */
  plan: string | null;
  planLevel: string | null;
  levels: number;
  rooms: number;
  walls: number;
  nativeHash: string;
  generatedAt: string;
  /** Validation technique, distincte de l'avancement du Parcours (bilan du bâtiment conçu). */
  validation: { issues: number; priorityIssues: number; auditGaps: number; auditToDocument: number; reviewedAt: string | null; reviewStale: boolean; modelRevision: number };
}

/** Une proposition Harmonie pour une étape — jamais présentée comme acquise. */
export interface HarmonieOption {
  title: string;
  proposal: string;
  benefit: string;
  tradeoff: string;
  validation: string;
}

export type HarmonieProposalStatus = "proposed" | "retained" | "adapted" | "translated" | "drawn" | "verified" | "dismissed";

export interface HarmonieProposalDecision {
  status: HarmonieProposalStatus;
  notes: string;
  owner: string;
  proof: string;
  link: string;
  adaptedText: string | null;
  decisionVersion: number;
  updatedAt: string | null;
  history: { at: string; status: HarmonieProposalStatus; text: string | null; proof: string | null; owner: string | null; reason: string | null }[];
  /** Empreinte des données de l'étape quand le choix a été retenu (`acceptedHash`) ; `null` sans choix retenu. */
  acceptedHash?: string | null;
  /** Ce que la proposition disait à l'arbitrage (conserve un choix dont la proposition a disparu). */
  snapshot?: { ref: string; key: string; group: "parti" | "local"; title: string; text: string; source: string; targets: number[]; roomId?: string; objectId?: string } | null;
}

export interface HarmonieStepState {
  revision: number;
  generatedAt: string | null;
  /** Empreinte des données à la dernière génération (« Actualiser les propositions ») ; `null` tant que l'étape n'a pas été générée. */
  generatedHash?: string | null;
  proposals: Record<string, HarmonieProposalDecision>;
}

/** Une proposition Harmonie telle que le serveur la calcule pour ce projet (définition × profil × arbitrages). */
export interface HarmonieProposal {
  id: string;
  ref: string;
  key: string;
  stage: number;
  scope: string;
  group: "parti" | "local";
  title: string;
  text: string;
  originalText: string;
  benefit: string;
  tradeoff: string;
  conditions: string;
  why: string;
  source: string;
  targets: number[];
  recommended: boolean;
  decision: HarmonieProposalDecision;
  retained: boolean;
  stateLabel: string;
  /** « À réexaminer · choix conservé » : choix pris sur d'autres données, ou proposition disparue (`orphaned`). */
  stale: boolean;
  orphaned: boolean;
  /** Étape 01 : zonage calculé sur le contour de la parcelle (`null` sans contour exploitable). */
  zoning?: SiteZoning | null;
  /** Étape 01 : le zonage en WGS84 quand la parcelle est géoréférencée (superposition sur le fond MapTiler, hypothèse). */
  zoningGeographic?: SiteZoningGeographic | null;
  /** Propositions localisées (étapes 10/11) : le local du modèle et l'objet natif. */
  roomId?: string;
  objectId?: string;
}

export interface IncomingIntention {
  origin: number;
  originLabel: string;
  id: string;
  ref: string;
  title: string;
  text: string;
  status: HarmonieProposalStatus;
  stateLabel: string;
  decisionVersion: number;
  /** « Source à réexaminer » : l'étape d'origine est elle-même périmée. */
  originStale: boolean;
}

export interface HarmonieProfile {
  key: string;
  sourceType: string;
  label: string;
  site: string;
  usage: string;
  decor: string;
}

/** Bilan Harmonie du bâtiment conçu (flow-v62) tel que le serveur le calcule sur le modèle courant. */
export interface DesignReviewView {
  analysis: {
    version: string;
    name: string;
    nativeId: string | null;
    nativeHash: string;
    inputHash: string;
    facts: { parcelArea: number | null; officialArea: number | null; footprint: number | null; setbackArea: number | null; setbacks: number[]; inside: boolean | null; insideSetback: boolean | null; gross: number | null; net: number | null; roomArea: number; roomCount: number; height: number | null };
    floors: { id: string; name: string; elevation: number | null; height: number | null; gross: number | null; slabNet: number | null; rooms: number; count: number; columns: number; stairs: number; voidArea: number | null }[];
    rooms: { id: string; objectId: string; level: string; levelName: string; name: string; area: number; usage: string; capacity: number | null; ratio: number | null; width: number | null; doors: number; windows: number; furniture: number; target: number | null; delta: number | null; reading: string; status: string; sector: string }[];
    entry: { id: string; width: number | null; height: number | null; wallId: string; gridBearing: number; trueBearing: number | null; source: string } | null;
    totals: { programme: number; total: number } | null;
    issues: { id: string; priority: string; title: string; body: string; refs: string[]; step: number }[];
    sourceSummary: string;
    generatedAt: string;
    stale: boolean;
  };
  audit: { id: string; name: string; status: "OK" | "À documenter" | "Écart"; detail: string }[];
  review: { version: string; name: string; at: string; signature: string; modelSignature: string; status: string; automatic: boolean; summary: string; counts: { levels: number; rooms: number; issues: number } } | null;
  history: DesignReviewView["review"][];
  assumptions: { id: string; topic: string; value: string; source: string; validation: string; owner: string; status: string }[];
  georeference: { latitude: number; longitude: number; projectNorth: number | null; source: string; hypothesis: boolean } | null;
  /** Observation déclarée du contexte extérieur (`site-note` du prototype), null tant que rien n'est déclaré. */
  siteContext: { observation: string; observationStatus: string; observedAt: string; satelliteObserved: boolean; elevation?: { value: number; unit: "m"; coordinates: [number, number]; at: string; source: string; quality: string } | null } | null;
  profileLabel: string;
  example: boolean;
  compass: { values: Record<string, unknown>; status: { ready: boolean; missing: string[]; facing: number | null; sitting: number | null; gua: { n: number; name: string; element: string; group: string; direction: string } | null } };
  natal: { ready: boolean; missing: string[]; base: Record<string, number> | null };
  /** Plans de lecture SVG par niveau (composés par le serveur depuis les polygones réels). */
  plans: Record<string, string>;
  /** Fragments HTML du bilan (mêmes fonctions que le rapport téléchargé). */
  html: { synthesis: string; metrics: string; levelTable: string; rooms: Record<string, string>; exampleRooms: string | null; issues: string; audit: string; assumptions: string; sources: string; designTrace: string };
  /** « Derniers événements » de l'onglet Transmission : les 10 derniers du journal daté (modèle, programme, parcelle, revue, MapTiler). */
  events: { at: string; kind: string; label: string; detail: string }[];
  /** « Textes manuels préservés » : les champs conservés face aux textes proposés par le programme (« Adopter cette proposition »). */
  conflicts: ProgrammeFieldConflict[];
  css: string;
}

export interface CompassInput {
  facing?: number | string | null;
  source?: string;
  facadeReason?: string;
  date?: string;
  uncertainty?: number | string | null;
  declination?: number | string | null;
  declinationSource?: string;
  basis?: "" | "magnetic" | "geographic" | "grid";
  confirmed?: boolean;
}

export interface HarmonieDecisionInput {
  status: HarmonieProposalStatus;
  notes?: string;
  owner?: string;
  proof?: string;
  link?: string;
}

export const harmonieApi = {
  /** « Collecter l'altitude indicative du centre » (bilan du bâtiment). */
  putCenterElevation: (projectId: string, point: [number, number, number]) => request<DesignReviewView>(`/projects/${projectId}/design-review/elevation`, { method: "PUT", body: JSON.stringify({ point }) }),
  decideHarmonie: (projectId: string, stepNumber: number, proposalId: string, input: HarmonieDecisionInput & { expectedVersion?: number }) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}/harmonie/${encodeURIComponent(proposalId)}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** « Actualiser les propositions » : révision +1 sur les données courantes, choix conservés pour réexamen. */
  generateHarmonie: (projectId: string, stepNumber: number) => request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}/harmonie/generate`, { method: "POST" }),
  /** Bilan Harmonie du bâtiment conçu (étapes 10 / 11). */
  getDesignReview: (projectId: string) => request<DesignReviewView>(`/projects/${projectId}/design-review`),
  getConceptPreview: (projectId: string) => request<ConceptPreview>(`/projects/${projectId}/design-review/apercu`),
  refreshDesignReview: (projectId: string) => request<DesignReviewView>(`/projects/${projectId}/design-review/review`, { method: "POST" }),
  designReportUrl: (projectId: string) => `/projects/${projectId}/design-review/rapport`,
  putCompass: (projectId: string, input: CompassInput) => request<DesignReviewView>(`/projects/${projectId}/design-review/compass`, { method: "PUT", body: JSON.stringify(input) }),
  /** « Enregistrer comme observation déclarée » (contexte extérieur, 20 caractères minimum ; 422 sinon). */
  putSiteObservation: (projectId: string, note: string) => request<DesignReviewView>(`/projects/${projectId}/design-review/observation`, { method: "PUT", body: JSON.stringify({ note }) }),
  /** « Rapport de cette étape » (`Harmonie_Etape_NN_V7.html`) ou, sans étape, la synthèse des choix du projet (`Harmonie_Choix_Parcours_V7.html`). */
  harmonieReportUrl: (projectId: string, stepNumber: number | null) => (stepNumber === null ? `/projects/${projectId}/steps/harmonie/rapport` : `/projects/${projectId}/steps/${stepNumber}/harmonie/rapport`),
};
