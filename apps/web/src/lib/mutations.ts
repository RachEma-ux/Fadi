/**
 * Mutations rejouables (file hors-ligne des saisies, arbitrages et
 * commentaires) : chaque mutation porte une clé et des valeurs complètes,
 * et le client enregistre ses valeurs par défaut (`setMutationDefaults`)
 * pour qu'une mutation mise en pause pendant une coupure — persistée avec
 * le cache des requêtes — reparte après un rechargement. Une saisie envoie
 * la valeur qu'elle avait lue (`baseline`), un arbitrage la version qu'il
 * avait lue (`expectedVersion`) : le serveur refuse (409) ce qui écraserait
 * une écriture plus récente, et le refus est conservé dans
 * `["sync-conflicts", projectId]` avec ce qui avait été tenté, pour être
 * montré côte à côte avec l'état du serveur et résolu : garder le serveur,
 * ou reprendre sa saisie / son arbitrage sur l'état courant (relu, jamais
 * écrasé en silence).
 */
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, api, comApi, type ComMessageInput, type CommentAudience, type HarmonieDecisionInput, type ParcoursFieldValue, type ParcoursStep, type ParcoursStepStatus, type ProjectComment } from "./api";
import { isNetworkError, reachability } from "./reachability";

export const MUTATION_KEYS = {
  stepPatch: ["step-patch"] as const,
  decide: ["harmonie-decide"] as const,
  comment: ["comment-add"] as const,
  /** Message de la Communication (COM-6) : rejoué avec le même `clientRequestId`, le serveur n'en garde qu'un. */
  comMessage: ["com-message"] as const,
};

export interface ComMessageVars {
  projectId: string;
  conversationId: string;
  /** Porte `clientRequestId` et `capturedAt` fixés à la rédaction : un rejeu après rechargement reste le même envoi. */
  input: ComMessageInput & { clientRequestId: string; capturedAt: string };
}

const REPLAYABLE_KEYS = new Set<string>(Object.values(MUTATION_KEYS).map((key) => key[0]));
interface ScopedMutation {
  options: { mutationKey?: readonly unknown[] };
  state: { variables?: unknown; status: string; isPaused: boolean };
}
/** Un autre projet, même en pause, ne doit jamais gonfler le compteur de ce dossier. */
export function isProjectPendingMutation(mutation: ScopedMutation, projectId: string): boolean {
  const variables = mutation.state.variables;
  return mutation.state.status === "pending" && !!variables && typeof variables === "object" && "projectId" in variables && variables.projectId === projectId && (mutation.state.isPaused || REPLAYABLE_KEYS.has(String(mutation.options.mutationKey?.[0])));
}

export async function resumeProjectMutations(queryClient: QueryClient, projectId: string): Promise<void> {
  if (reachability.get() !== "reachable" || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const pending = queryClient.getMutationCache().getAll().filter((mutation) => isProjectPendingMutation(mutation, projectId) && mutation.state.isPaused);
  await Promise.allSettled(pending.map((mutation) => mutation.continue()));
}

export interface StepPatchVars {
  projectId: string;
  stepNumber: number;
  body: { status?: ParcoursStepStatus; fields?: Record<string, ParcoursFieldValue>; baseline?: Record<string, ParcoursFieldValue> };
}

export interface DecideVars {
  projectId: string;
  stepNumber: number;
  proposalId: string;
  input: HarmonieDecisionInput & { expectedVersion?: number };
}

export interface CommentVars {
  projectId: string;
  body: string;
  stepNumber: number | null;
  /** Réponse en fil : le commentaire d'origine. */
  parentId?: string | null;
  /** Audience choisie à la rédaction (écart E1) ; absente = défaut du serveur (l'équipe ; « projet » pour un lecteur). */
  audience?: CommentAudience;
}

/**
 * Commentaire accepté par le serveur : fils de l'étape et de la collaboration relus APRÈS l'écriture.
 *
 * Une première lecture partie avant la publication (pli ouvert puis publié aussitôt) peut avoir été servie avant
 * l'insertion. Tant que la requête n'a encore aucune donnée, `invalidateQueries` ne l'annule pas : TanStack Query
 * réutilise la lecture en vol (`cancelRefetch` ne s'applique qu'à une requête qui a déjà des données), qui rendait
 * alors une liste sans le commentaire, sans autre relecture. Ces lectures sont donc annulées d'abord ; le
 * commentaire est ajouté au fil déjà lu de son étape, puis tout est relu.
 */
export async function adoptComment(queryClient: QueryClient, created: ProjectComment, v: CommentVars): Promise<void> {
  const keys = [["comments", v.projectId], ["collaboration", v.projectId]] as const;
  await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));
  if (v.stepNumber !== null) {
    queryClient.setQueryData<ProjectComment[]>(["comments", v.projectId, v.stepNumber], (existing) =>
      existing ? (existing.some((c) => c.id === created.id) ? existing : [...existing, created]) : existing,
    );
  }
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export interface SyncConflict {
  id: string;
  at: string;
  where: string;
  message: string;
  /** Valeurs courantes du serveur quand il les renvoie (saisies). */
  current: Record<string, ParcoursFieldValue> | null;
  stepNumber: number | null;
  /** Ce qui avait été tenté : une saisie (champs) ou un arbitrage (proposition, entrée, version lue). */
  kind: "saisie" | "arbitrage";
  attempted: Record<string, ParcoursFieldValue> | null;
  decision: { proposalId: string; input: HarmonieDecisionInput; expectedVersion: number | null } | null;
  /** Version d'arbitrage courante du serveur (arbitrage refusé). */
  currentVersion: number | null;
}

/** Sans valeur serveur pour chaque champ, une reprise n'aurait pas de précondition fiable. */
export function canReplayFieldConflict(conflict: Pick<SyncConflict, "stepNumber" | "attempted" | "current">): boolean {
  return conflict.stepNumber !== null && conflict.attempted !== null && conflict.current !== null && Object.keys(conflict.attempted).length > 0 && Object.keys(conflict.attempted).every((key) => Object.hasOwn(conflict.current!, key));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Les refus conservés pour l'écran, par projet : un petit magasin synchrone
 * (mémoire + localStorage) plutôt que le cache des requêtes — un conflit
 * retiré ne doit pas réapparaître après une navigation parce que le cache
 * persistant (écrit avec un délai) aurait gardé l'instantané d'avant.
 */
const CONFLICTS_PREFIX = "fadi.conflicts.";
const conflictsMemory = new Map<string, SyncConflict[]>();
const conflictListeners = new Set<() => void>();

function readConflicts(projectId: string): SyncConflict[] {
  const cached = conflictsMemory.get(projectId);
  if (cached) return cached;
  let list: SyncConflict[] = [];
  try {
    const raw = localStorage.getItem(CONFLICTS_PREFIX + projectId);
    if (raw) list = JSON.parse(raw) as SyncConflict[];
  } catch {
    /* stockage indisponible : mémoire seulement */
  }
  conflictsMemory.set(projectId, list);
  return list;
}

function writeConflicts(projectId: string, list: SyncConflict[]) {
  conflictsMemory.set(projectId, list);
  try {
    if (list.length) localStorage.setItem(CONFLICTS_PREFIX + projectId, JSON.stringify(list));
    else localStorage.removeItem(CONFLICTS_PREFIX + projectId);
  } catch {
    /* mémoire seulement */
  }
  for (const fn of conflictListeners) fn();
}

export const conflictsStore = {
  get: readConflicts,
  subscribe(fn: () => void): () => void {
    conflictListeners.add(fn);
    return () => conflictListeners.delete(fn);
  },
  /** Déconnexion ou changement d'utilisateur : les refus de l'autre compte ne sont pas montrés. */
  clearAll() {
    conflictsMemory.clear();
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(CONFLICTS_PREFIX)) localStorage.removeItem(key);
    } catch {
      /* rien à vider */
    }
    for (const fn of conflictListeners) fn();
  },
};

/** Enregistre un refus 409 pour l'écran (jamais perdu en silence) ; les autres erreurs restent à la charge de l'appelant. */
export function recordConflict(
  queryClient: QueryClient,
  projectId: string,
  err: unknown,
  where: string,
  stepNumber: number | null,
  tried: { attempted?: Record<string, ParcoursFieldValue>; decision?: SyncConflict["decision"] } = {},
): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const body = (err.body ?? {}) as { current?: Record<string, ParcoursFieldValue>; currentVersion?: number };
  const conflict: SyncConflict = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    where,
    message: err.serverMessage ?? "Conflit avec une écriture plus récente.",
    current: body.current ?? null,
    stepNumber,
    kind: tried.decision ? "arbitrage" : "saisie",
    attempted: tried.attempted ?? null,
    decision: tried.decision ?? null,
    currentVersion: typeof body.currentVersion === "number" ? body.currentVersion : null,
  };
  writeConflicts(projectId, [...readConflicts(projectId), conflict]);
  void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
  return true;
}

export function clearConflict(_queryClient: QueryClient, projectId: string, id: string | null) {
  writeConflicts(projectId, id === null ? [] : readConflicts(projectId).filter((c) => c.id !== id));
}

/** Une reprise n'efface son conflit antérieur que si un nouveau refus 409 l'a effectivement remplacé. */
export function recordConflictRetryFailure(
  queryClient: QueryClient, projectId: string, previousId: string, err: unknown, where: string, stepNumber: number | null,
  tried: { attempted?: Record<string, ParcoursFieldValue>; decision?: SyncConflict["decision"] } = {},
): boolean {
  const replaced = recordConflict(queryClient, projectId, err, where, stepNumber, tried);
  if (replaced) clearConflict(queryClient, projectId, previousId);
  return replaced;
}

/** Une étape renvoyée par le serveur remplace la sienne dans la liste ; les effets amont / aval se relisent. */
export function adoptStep(queryClient: QueryClient, projectId: string, updated: ParcoursStep) {
  queryClient.setQueryData<ParcoursStep[]>(["steps", projectId], (list) => (list ?? []).map((s) => (s.number === updated.number ? updated : s)));
  void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
  // Seulement après la réponse acceptée : les lectures dérivées de ce dossier doivent retrouver leur propre état courant.
  for (const key of ["design-review-status", "concept-preview", "programme", "documents", "project"]) void queryClient.invalidateQueries({ queryKey: [key, projectId] });
  void queryClient.invalidateQueries({ queryKey: ["history"], predicate: (query) => query.queryKey[2] === projectId });
}

/**
 * Un échec sans réponse du serveur n'est pas un refus : la mutation réessaie, et comme le client HTTP vient de
 * déclarer le serveur injoignable (`reachability`), TanStack la met en pause au lieu de l'abandonner — elle
 * repart dès que la sonde `/health` répond. Un refus applicatif (4xx, 409) n'est jamais réessayé. Le plafond est
 * large (20) : une liaison qui bascule plusieurs fois entre joignable et injoignable consomme des essais, et une
 * saisie ne doit pas être abandonnée pour autant.
 */
const RETRY_NETWORK = { retry: (count: number, err: unknown) => isNetworkError(err) && count < 20, retryDelay: (count: number) => Math.min(8000, 1000 * 2 ** count) };

export function registerMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(MUTATION_KEYS.stepPatch, {
    ...RETRY_NETWORK,
    mutationFn: (v: StepPatchVars) => api.patchStep(v.projectId, v.stepNumber, v.body),
    onSuccess: (updated: ParcoursStep, v: StepPatchVars) => adoptStep(queryClient, v.projectId, updated),
    onError: (err: unknown, v: StepPatchVars) => {
      recordConflict(queryClient, v.projectId, err, `Étape ${pad2(v.stepNumber)} · saisie`, v.stepNumber, { attempted: v.body.fields ?? {} });
    },
  });
  queryClient.setMutationDefaults(MUTATION_KEYS.decide, {
    ...RETRY_NETWORK,
    mutationFn: (v: DecideVars) => api.decideHarmonie(v.projectId, v.stepNumber, v.proposalId, v.input),
    onSuccess: (updated: ParcoursStep, v: DecideVars) => adoptStep(queryClient, v.projectId, updated),
    onError: (err: unknown, v: DecideVars) => {
      const { expectedVersion, ...input } = v.input;
      recordConflict(queryClient, v.projectId, err, `Étape ${pad2(v.stepNumber)} · arbitrage ${v.proposalId}`, v.stepNumber, { decision: { proposalId: v.proposalId, input, expectedVersion: expectedVersion ?? null } });
    },
  });
  queryClient.setMutationDefaults(MUTATION_KEYS.comMessage, {
    ...RETRY_NETWORK,
    mutationFn: (v: ComMessageVars) => comApi.envoyer(v.projectId, v.conversationId, v.input),
    onSuccess: (_r: unknown, v: ComMessageVars) => {
      void queryClient.invalidateQueries({ queryKey: ["com", v.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["com-boite"] });
    },
  });
  queryClient.setMutationDefaults(MUTATION_KEYS.comment, {
    ...RETRY_NETWORK,
    mutationFn: (v: CommentVars) => api.addComment(v.projectId, v.body, v.stepNumber, v.parentId ?? null, null, v.audience),
    onSuccess: (created: ProjectComment, v: CommentVars) => {
      void adoptComment(queryClient, created, v);
    },
  });
}
