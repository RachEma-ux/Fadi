/**
 * Client HTTP minimal vers `apps/api`. Toujours `credentials: "include"`
 * (cookie de session httpOnly) ; jamais de jeton stocké en `localStorage`
 * (surface XSS inutile pour une session qui peut vivre dans un cookie).
 */
import type { Point2, SiteZoning } from "@parcours/core-geometry";
import type {
  BuildingCase,
  BuildingHypothesis,
  BuildingReference,
  CheckStatus,
  DerivedQuantities,
  GeographicCoordinate,
  ProgrammeCase,
  ProgrammeFieldConflict,
  ProgrammeModelLinkRow,
  ProgrammeScenarioRow,
  SiteObservations,
  StepResults,
  StructureStatement,
  SurfaceTransfer,
  TraceableCheck,
} from "@parcours/domain-model";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    /** Message lisible renvoyé par le serveur (règles Harmonie, validation), s'il existe. */
    public readonly serverMessage: string | null = null,
    /** Corps complet de la réponse d'erreur (ex. valeur courante lors d'un conflit 409). */
    public readonly body: unknown = null,
  ) {
    super(serverMessage ?? code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
    const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : null;
    throw new ApiError(res.status, code, message, body);
  }
  return body as T;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export interface Project {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  modelRevision: number;
  /** Provenance d'un exemple importé (jamais effacée) et son mode : référence protégée ou copie de travail. */
  sourceExampleId?: string | null;
  exampleMode?: "reference" | "editable" | null;
  /** Votre rôle sur ce projet, décidé par le serveur à chaque requête (`proprietaire` pour vos projets). */
  role?: ProjectRole;
  /** Adresse du propriétaire (liste des projets : distingue les projets partagés). */
  ownerEmail?: string;
  /** Réservation d'édition en cours (verrou optionnel « un seul éditeur actif »), null si libre ou expirée. */
  editingLock?: EditingLock | null;
  /** « Documents de base intégrés » d'un projet issu de l'exemple : les fichiers du prototype retrouvés parmi les sources des étapes. */
  baseDocuments?: { caption: string; files: { id: string; stepNumber: number; name: string; type: string; size: number; note: string }[] } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditingLock {
  userId: string;
  email: string;
  since: string;
  expiresAt: string;
}

/** Rôles du partage (`lib/owned-project.ts` de l'API) : lecteur lit et commente, éditeur modifie, propriétaire partage et supprime. */
export type ProjectRole = "proprietaire" | "editeur" | "lecteur";
export type MemberRole = Exclude<ProjectRole, "proprietaire">;

export const ROLE_LABEL: Record<ProjectRole, string> = { proprietaire: "propriétaire", editeur: "éditeur", lecteur: "lecteur" };

/** Le rôle permet-il de modifier le projet ? (`undefined` = projet lu avant le partage : propriétaire.) */
export function canWrite(role: ProjectRole | undefined): boolean {
  return role === undefined || role === "proprietaire" || role === "editeur";
}

export interface ProjectMember {
  userId: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  createdAt: string;
}

export interface MembersView {
  owner: { userId: string; email: string };
  you: { userId: string; role: ProjectRole };
  members: ProjectMember[];
}

export interface Level {
  id: string;
  projectId: string;
  label: string;
  elevation: number;
  position: number;
}

export interface ArchitecturalObjectDto {
  id: string;
  levelId: string;
  kind: string;
  properties: Record<string, unknown>;
  relations: { kind: string; targetId: string }[];
  modelRevision: number;
  createdAt: string;
}

/** Une proposition Harmonie pour une étape — jamais présentée comme acquise. */
export interface HarmonieOption {
  title: string;
  proposal: string;
  benefit: string;
  tradeoff: string;
  validation: string;
}

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
  /** Propositions localisées (étapes 10/11) : le local du modèle et l'objet natif. */
  roomId?: string;
  objectId?: string;
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

/** Une pièce jointe d'une étape (« Sources de l'étape »). */
export interface StepFile {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: string;
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

/** Résultat de « Importer projet JSON » : les projets créés (une base V5 peut en contenir plusieurs) et leurs réserves. */
export interface ImportedProjects {
  projects: { id: string; code: string; name: string; origin: "fadi" | "parcours-v7" | "parcours-v6" | "parcours-v5"; warnings: string[] }[];
}

export interface HarmonieDecisionInput {
  status: HarmonieProposalStatus;
  notes?: string;
  owner?: string;
  proof?: string;
  link?: string;
}

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

/** Module Documents : un document productible, sa dernière production et son actualité. */
export interface DocumentDescriptor {
  kind: string;
  group: "harmonie" | "bilan" | "tableaux" | "archive";
  label: string;
  fileName: string;
  href: string;
  stepNumber: number | null;
  current: { modelRevision: number; inputHash: string };
  produced: { producedAt: string; modelRevision: number; inputHash: string; count: number } | null;
  freshness: "a-jour" | "perime" | null;
}

export interface DocumentsView {
  modelRevision: number;
  nativeHash: string;
  computedAt: string;
  documents: DocumentDescriptor[];
}

/** Module Collaboration. */
export interface ProjectComment {
  id: string;
  stepNumber: number | null;
  authorEmail: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface RevisionEvent {
  at: string;
  kind: string;
  label: string;
  detail: string;
  stepNumber: number | null;
  revision: number | null;
}

export interface CollaborationView {
  access: { ownerEmail: string; you: string; role: ProjectRole; members: ProjectMember[]; lock: EditingLock | null; sharing: { available: boolean; reason: string } };
  sync: { modelRevision: number; nativeKeys: number; lastModelWrite: string | null; offline: { available: boolean; reason: string } };
  journal: RevisionEvent[];
  comments: ProjectComment[];
}

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

export interface ParcoursExample {
  id: string;
  kind: "exemple-complet" | "archive";
  name: string;
  summary: string;
  stepsWithContent: number;
  documentedDecisions: number;
}

/** Le magasin du moteur de l'Atelier natif : clés `design.v13.*` et leur révision par clé. */
export interface AtelierStore {
  entries: Record<string, unknown>;
  revisions: Record<string, number>;
  modelRevision: number;
}

export interface ParcelFileMeta {
  id: string;
  number: number;
  parcelNumber: string;
  sourceFilename: string;
  name: string;
  crs: string;
  revision: number;
  updated_at: string;
  area: number | null;
  perimeter: number | null;
  boundaryCount: number;
}

export interface ParcelSummary {
  name: string;
  crs: string;
  parcelNumber: string;
  area: number | null;
  perimeter: number | null;
  boundaryCount: number;
}

export interface ParcelTransmission {
  status: "linked" | "incomplete" | "invalid" | "conflict" | "design-conflict" | "setback-pending";
  reason: string;
  at: string;
  signature: string | null;
  nativeId: string | null;
  parcelId?: string;
  /** La parcelle telle qu'elle a été transmise (mesures dans le plan du CRS). */
  parcel?: ParcelSummary;
}

export const api = {
  register: (email: string, password: string) =>
    request<CurrentUser>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<CurrentUser>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<CurrentUser>("/auth/me"),

  listProjects: () => request<Project[]>("/projects"),
  createProject: (code: string, name: string) =>
    request<Project>("/projects", { method: "POST", body: JSON.stringify({ code, name }) }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  listLevels: (projectId: string) => request<Level[]>(`/projects/${projectId}/levels`),
  createLevel: (projectId: string, label: string, elevation: number, position: number) =>
    request<Level>(`/projects/${projectId}/levels`, {
      method: "POST",
      body: JSON.stringify({ label, elevation, position }),
    }),

  listSteps: (projectId: string) => request<ParcoursStep[]>(`/projects/${projectId}/steps`),
  patchStep: (projectId: string, stepNumber: number, patch: { status?: ParcoursStepStatus; fields?: Record<string, ParcoursFieldValue>; baseline?: Record<string, ParcoursFieldValue> }) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}`, { method: "PATCH", body: JSON.stringify(patch) }),
  /** Sources de l'étape (pièces jointes) — module Projets et sources. */
  listStepFiles: (projectId: string, stepNumber: number) => request<StepFile[]>(`/projects/${projectId}/steps/${stepNumber}/files`),
  listProjectFiles: (projectId: string) => request<(StepFile & { stepNumber: number })[]>(`/projects/${projectId}/files`),
  uploadStepFile: async (projectId: string, stepNumber: number, file: File): Promise<StepFile> => {
    // Octets bruts + nom et type dans les en-têtes : aucun fichier n'est interprété par le serveur.
    const res = await fetch(`/projects/${projectId}/steps/${stepNumber}/files`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name), "X-File-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
      throw new ApiError(res.status, code, res.status === 413 ? "Fichier trop volumineux (25 Mo maximum)." : null, body);
    }
    return (body as { file: StepFile }).file;
  },
  stepFileUrl: (projectId: string, stepNumber: number, fileId: string) => `/projects/${projectId}/steps/${stepNumber}/files/${encodeURIComponent(fileId)}`,
  deleteStepFile: (projectId: string, stepNumber: number, fileId: string) => request<void>(`/projects/${projectId}/steps/${stepNumber}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }),
  /** Bibliothèque des bâtiments et cas de programme appliqué. */
  getBuildingLibrary: () => request<BuildingLibraryIndex>("/library/buildings"),
  getBuildingCase: (id: string) => request<BuildingCaseDetail>(`/library/buildings/${encodeURIComponent(id)}`),
  applyProgrammeCase: (projectId: string, input: ApplyProgrammeCaseInput) =>
    request<ProgrammeView & { applied: { revision: number; conflicts: number } }>(`/projects/${projectId}/programme/case`, { method: "POST", body: JSON.stringify(input) }),
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
  /** « Essayer une autre répartition en copie » (`copy()` de l'exemple résolu) : un nouveau projet modifiable, la référence intacte. */
  copyProject: (projectId: string, name?: string) =>
    request<{ id: string; code: string; name: string; warnings: string[] }>(`/projects/${projectId}/copies`, { method: "POST", body: JSON.stringify(name ? { name } : {}) }),
  putSiteObservations: (projectId: string, input: SiteObservationsInput) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/1/site`, { method: "PUT", body: JSON.stringify(input) }),
  /** « Collecter centre + sommets » : les altitudes reçues du service (contrôlées par le navigateur) deviennent l'altimétrie du site. */
  putSiteElevation: (projectId: string, points: [number, number, number][]) => request<ParcoursStep>(`/projects/${projectId}/steps/1/site/elevation`, { method: "PUT", body: JSON.stringify({ points }) }),
  /** « Collecter l'altitude indicative du centre » (bilan du bâtiment). */
  putCenterElevation: (projectId: string, point: [number, number, number]) => request<DesignReviewView>(`/projects/${projectId}/design-review/elevation`, { method: "PUT", body: JSON.stringify({ point }) }),
  decideHarmonie: (projectId: string, stepNumber: number, proposalId: string, input: HarmonieDecisionInput & { expectedVersion?: number }) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}/harmonie/${encodeURIComponent(proposalId)}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** « Actualiser les propositions » : révision +1 sur les données courantes, choix conservés pour réexamen. */
  generateHarmonie: (projectId: string, stepNumber: number) => request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}/harmonie/generate`, { method: "POST" }),
  /** « Sauvegarder projet JSON » (`Parcours_V7_<nom>.json`). */
  projectArchiveUrl: (projectId: string) => `/projects/${projectId}/archive`,
  /** « Importer projet JSON » : archive Fadi ou export du logiciel existant (Parcours V6 / V7, base V5) → nouveaux projets. */
  importProjectArchive: async (file: File): Promise<ImportedProjects> => {
    const res = await fetch("/projects/import", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: file });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : null) ?? `http_${res.status}`;
      const message = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : null;
      throw new ApiError(res.status, code, message, body);
    }
    return body as ImportedProjects;
  },
  /** Bilan Harmonie du bâtiment conçu (étapes 10 / 11). */
  getDesignReview: (projectId: string) => request<DesignReviewView>(`/projects/${projectId}/design-review`),
  getAnalyses: (projectId: string) => request<AnalysesView>(`/projects/${projectId}/analyses`),
  getDocuments: (projectId: string) => request<DocumentsView>(`/projects/${projectId}/documents`),
  getCollaboration: (projectId: string) => request<CollaborationView>(`/projects/${projectId}/collaboration`),
  listComments: (projectId: string, stepNumber: number | null) => request<ProjectComment[]>(`/projects/${projectId}/collaboration/comments${stepNumber === null ? "" : `?step=${stepNumber}`}`),
  addComment: (projectId: string, body: string, stepNumber: number | null) =>
    request<ProjectComment>(`/projects/${projectId}/collaboration/comments`, { method: "POST", body: JSON.stringify({ body, stepNumber }) }),
  deleteComment: (projectId: string, commentId: string) => request<void>(`/projects/${projectId}/collaboration/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" }),
  /** Partage : membres et rôles (propriétaire seulement pour inviter, changer, retirer ; un membre peut se retirer lui-même). */
  listMembers: (projectId: string) => request<MembersView>(`/projects/${projectId}/members`),
  inviteMember: (projectId: string, email: string, role: MemberRole) => request<ProjectMember>(`/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email, role }) }),
  setMemberRole: (projectId: string, userId: string, role: MemberRole) => request<ProjectMember>(`/projects/${projectId}/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (projectId: string, userId: string) => request<void>(`/projects/${projectId}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  /** Transfert de propriété à un membre (propriétaire seulement) : vous restez éditeur. */
  transferOwnership: (projectId: string, userId: string) => request<MembersView>(`/projects/${projectId}/members/${encodeURIComponent(userId)}/propriete`, { method: "POST" }),
  /** Verrou d'édition optionnel : réserver / prolonger (423 si quelqu'un d'autre le détient), rendre la main (ou libérer, propriétaire). */
  getLock: (projectId: string) => request<{ lock: EditingLock | null; yours: boolean }>(`/projects/${projectId}/lock`),
  reserveEditing: (projectId: string) => request<{ lock: EditingLock; yours: true }>(`/projects/${projectId}/lock`, { method: "PUT" }),
  releaseEditing: (projectId: string) => request<void>(`/projects/${projectId}/lock`, { method: "DELETE" }),
  /** Documents produits par le serveur (production enregistrée) : plan de lecture d'un niveau, tableau des surfaces, programme, fiches de l'exemple. */
  documentUrl: (projectId: string, doc: "surfaces" | "programme" | "fiches") => `/projects/${projectId}/documents/${doc}`,
  planUrl: (projectId: string, levelId: string) => `/projects/${projectId}/documents/plan/${encodeURIComponent(levelId)}`,
  refreshDesignReview: (projectId: string) => request<DesignReviewView>(`/projects/${projectId}/design-review/review`, { method: "POST" }),
  designReportUrl: (projectId: string) => `/projects/${projectId}/design-review/rapport`,
  putCompass: (projectId: string, input: CompassInput) => request<DesignReviewView>(`/projects/${projectId}/design-review/compass`, { method: "PUT", body: JSON.stringify(input) }),
  /** « Enregistrer comme observation déclarée » (contexte extérieur, 20 caractères minimum ; 422 sinon). */
  putSiteObservation: (projectId: string, note: string) => request<DesignReviewView>(`/projects/${projectId}/design-review/observation`, { method: "PUT", body: JSON.stringify({ note }) }),
  /** « Rapport de cette étape » (`Harmonie_Etape_NN_V7.html`) ou, sans étape, la synthèse des choix du projet (`Harmonie_Choix_Parcours_V7.html`). */
  harmonieReportUrl: (projectId: string, stepNumber: number | null) => (stepNumber === null ? `/projects/${projectId}/steps/harmonie/rapport` : `/projects/${projectId}/steps/${stepNumber}/harmonie/rapport`),
  getAtelierStore: (projectId: string) => request<AtelierStore>(`/projects/${projectId}/atelier/store`),
  putAtelierStoreEntry: (projectId: string, key: string, value: unknown, expectedRevision: number | null) =>
    request<{ key: string; revision: number; modelRevision: number }>(`/projects/${projectId}/atelier/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, expectedRevision }),
    }),
  deleteAtelierStoreEntry: (projectId: string, key: string) =>
    request<void>(`/projects/${projectId}/atelier/store/${encodeURIComponent(key)}`, { method: "DELETE" }),
  listParcels: (projectId: string) => request<{ files: ParcelFileMeta[]; initialized: boolean; transmission: ParcelTransmission | null }>(`/projects/${projectId}/parcels`),
  /** Transmet la parcelle capturée dans l'outil (ou, sans `data`, le fichier enregistré) au modèle ; `keepalive` pour la transmission avant de quitter l'étape. */
  transmitParcel: (projectId: string, parcelId: string, data?: unknown) => {
    const body = JSON.stringify(data === undefined ? {} : { data });
    // `keepalive` est plafonné à 64 ko par les navigateurs (même seuil que l'outil Parcelle).
    return request<{ transmission: ParcelTransmission }>(`/projects/${projectId}/parcels/${encodeURIComponent(parcelId)}/transmit`, { method: "POST", body, keepalive: body.length < 60000 });
  },
  getProgramme: (projectId: string) => request<ProgrammeView>(`/projects/${projectId}/programme`),
  putProgramme: (projectId: string, rep: { type: string; baseArea: number; mode: ProgrammeMode; custom: Record<string, number> }) =>
    request<ProgrammeView>(`/projects/${projectId}/programme`, { method: "PUT", body: JSON.stringify(rep) }),

  listExamples: () => request<ParcoursExample[]>("/examples"),
  importExample: (exampleId: string) =>
    request<Project>(`/examples/${exampleId}/import`, { method: "POST" }),

  listObjects: (projectId: string, levelId: string) =>
    request<ArchitecturalObjectDto[]>(`/projects/${projectId}/levels/${levelId}/objects`),
  createObject: (
    projectId: string,
    levelId: string,
    kind: string,
    properties: Record<string, unknown>,
  ) =>
    request<ArchitecturalObjectDto>(`/projects/${projectId}/levels/${levelId}/objects`, {
      method: "POST",
      body: JSON.stringify({ kind, properties, relations: [] }),
    }),
  deleteObject: (projectId: string, levelId: string, objectId: string) =>
    request<void>(`/projects/${projectId}/levels/${levelId}/objects/${objectId}`, { method: "DELETE" }),
};
