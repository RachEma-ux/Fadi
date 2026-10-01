/**
 * Client HTTP minimal vers `apps/api`. Toujours `credentials: "include"`
 * (cookie de session httpOnly) ; jamais de jeton stocké en `localStorage`
 * (surface XSS inutile pour une session qui peut vivre dans un cookie).
 */

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
  createdAt: string;
  updatedAt: string;
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
}

export interface HarmonieStepState {
  revision: number;
  generatedAt: string | null;
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
  group: "parti";
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
  profile: HarmonieProfile;
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
  programmeCase: {
    title: string | null;
    scenarioLabel: string | null;
    revision: number | null;
    users: string | null;
    spaceCount: number;
    sums: Record<"principal" | "circulation" | "technique" | "sanitaires" | "convivialite" | "supportAutres" | "parois" | "support" | "programme" | "total", number>;
  } | null;
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
  patchStep: (projectId: string, stepNumber: number, patch: { status?: ParcoursStepStatus; fields?: Record<string, ParcoursFieldValue> }) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}`, { method: "PATCH", body: JSON.stringify(patch) }),
  decideHarmonie: (projectId: string, stepNumber: number, proposalId: string, input: HarmonieDecisionInput) =>
    request<ParcoursStep>(`/projects/${projectId}/steps/${stepNumber}/harmonie/${encodeURIComponent(proposalId)}`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getAtelierStore: (projectId: string) => request<AtelierStore>(`/projects/${projectId}/atelier/store`),
  putAtelierStoreEntry: (projectId: string, key: string, value: unknown, expectedRevision: number | null) =>
    request<{ key: string; revision: number; modelRevision: number }>(`/projects/${projectId}/atelier/store/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, expectedRevision }),
    }),
  deleteAtelierStoreEntry: (projectId: string, key: string) =>
    request<void>(`/projects/${projectId}/atelier/store/${encodeURIComponent(key)}`, { method: "DELETE" }),
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
