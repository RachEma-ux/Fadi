/**
 * Mutations rejouables (file hors-ligne des saisies, arbitrages et
 * commentaires) : chaque mutation porte une clé et des valeurs complètes,
 * et le client enregistre ses valeurs par défaut (`setMutationDefaults`)
 * pour qu'une mutation mise en pause pendant une coupure — persistée avec
 * le cache des requêtes — reparte après un rechargement. Une saisie envoie
 * la valeur qu'elle avait lue (`baseline`), un arbitrage la version qu'il
 * avait lue (`expectedVersion`) : le serveur refuse (409) ce qui écraserait
 * une écriture plus récente, et le refus est conservé dans
 * `["sync-conflicts", projectId]` pour être montré et examiné.
 */
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, api, type HarmonieDecisionInput, type ParcoursFieldValue, type ParcoursStep, type ParcoursStepStatus, type ProjectComment } from "./api";

export const MUTATION_KEYS = {
  stepPatch: ["step-patch"] as const,
  decide: ["harmonie-decide"] as const,
  comment: ["comment-add"] as const,
};

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
}

export interface SyncConflict {
  id: string;
  at: string;
  where: string;
  message: string;
  /** Valeurs courantes du serveur quand il les renvoie (saisies). */
  current: Record<string, ParcoursFieldValue> | null;
  stepNumber: number | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function conflictsKey(projectId: string) {
  return ["sync-conflicts", projectId] as const;
}

/** Enregistre un refus 409 pour l'écran (jamais perdu en silence) ; les autres erreurs restent à la charge de l'appelant. */
export function recordConflict(queryClient: QueryClient, projectId: string, err: unknown, where: string, stepNumber: number | null): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const body = (err.body ?? {}) as { current?: Record<string, ParcoursFieldValue> };
  const conflict: SyncConflict = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    where,
    message: err.serverMessage ?? "Conflit avec une écriture plus récente.",
    current: body.current ?? null,
    stepNumber,
  };
  queryClient.setQueryData<SyncConflict[]>(conflictsKey(projectId), (prev) => [...(prev ?? []), conflict]);
  void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
  return true;
}

export function clearConflict(queryClient: QueryClient, projectId: string, id: string | null) {
  queryClient.setQueryData<SyncConflict[]>(conflictsKey(projectId), (prev) => (id === null ? [] : (prev ?? []).filter((c) => c.id !== id)));
}

/** Une étape renvoyée par le serveur remplace la sienne dans la liste ; les effets amont / aval se relisent. */
export function adoptStep(queryClient: QueryClient, projectId: string, updated: ParcoursStep) {
  queryClient.setQueryData<ParcoursStep[]>(["steps", projectId], (list) => (list ?? []).map((s) => (s.number === updated.number ? updated : s)));
  void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
}

export function registerMutationDefaults(queryClient: QueryClient) {
  queryClient.setMutationDefaults(MUTATION_KEYS.stepPatch, {
    mutationFn: (v: StepPatchVars) => api.patchStep(v.projectId, v.stepNumber, v.body),
    onSuccess: (updated: ParcoursStep, v: StepPatchVars) => adoptStep(queryClient, v.projectId, updated),
    onError: (err: unknown, v: StepPatchVars) => {
      recordConflict(queryClient, v.projectId, err, `Étape ${pad2(v.stepNumber)} · saisie`, v.stepNumber);
    },
  });
  queryClient.setMutationDefaults(MUTATION_KEYS.decide, {
    mutationFn: (v: DecideVars) => api.decideHarmonie(v.projectId, v.stepNumber, v.proposalId, v.input),
    onSuccess: (updated: ParcoursStep, v: DecideVars) => adoptStep(queryClient, v.projectId, updated),
    onError: (err: unknown, v: DecideVars) => {
      recordConflict(queryClient, v.projectId, err, `Étape ${pad2(v.stepNumber)} · arbitrage ${v.proposalId}`, v.stepNumber);
    },
  });
  queryClient.setMutationDefaults(MUTATION_KEYS.comment, {
    mutationFn: (v: CommentVars) => api.addComment(v.projectId, v.body, v.stepNumber),
    onSuccess: (_c: ProjectComment, v: CommentVars) => {
      void queryClient.invalidateQueries({ queryKey: ["collaboration", v.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["comments", v.projectId] });
    },
  });
}
