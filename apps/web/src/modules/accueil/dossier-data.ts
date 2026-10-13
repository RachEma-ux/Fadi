import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";

export const denied = (error: unknown): boolean => error instanceof ApiError && [401, 403, 404].includes(error.status);
const retryRead = (count: number, error: unknown) => !denied(error) && count < 1;
function visibleRead<T, E>(query: UseQueryResult<T, E>): UseQueryResult<T, E> {
  // An explicit access denial supersedes a previously cached copy, including a partial-resource denial.
  return denied(query.error) ? { ...query, data: undefined } as UseQueryResult<T, E> : query;
}
export function useDossierQueries(projectId: string, options: { lightweight?: boolean } = {}) {
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, refetchInterval: 60_000, retry: retryRead });
  const enabled = !!project.data && !denied(project.error);
  const steps = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId), enabled, staleTime: 60_000, retry: retryRead });
  const programme = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId), enabled, staleTime: 60_000, retry: retryRead });
  // Independent resources and stable, dossier-scoped keys retain their own last successful read on refresh failure.
  const preview = useQuery({ queryKey: ["concept-preview", projectId], queryFn: () => api.getConceptPreview(projectId), enabled: enabled && !options.lightweight, staleTime: 300_000, retry: retryRead });
  const review = useQuery({ queryKey: ["design-review-status", projectId], queryFn: () => api.getDesignReviewStatus(projectId), enabled, staleTime: 60_000, retry: retryRead });
  const documents = useQuery({ queryKey: ["documents", projectId], queryFn: () => api.getDocuments(projectId), enabled: enabled && !options.lightweight, staleTime: 60_000, retry: retryRead });
  return { project: visibleRead(project), steps: visibleRead(steps), programme: visibleRead(programme), preview: visibleRead(preview), review: visibleRead(review), documents: visibleRead(documents) };
}
export type DossierQueries = ReturnType<typeof useDossierQueries>;
export const dateLabel = (value: string | number) => new Date(value).toLocaleString(LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export function resourceLabel(query: Pick<UseQueryResult, "data" | "isError" | "isFetching" | "fetchStatus" | "dataUpdatedAt">, connected: boolean): string {
  if (query.data === undefined) return query.isError ? "Information indisponible" : query.fetchStatus === "paused" || !connected ? "En attente de connexion" : "Chargement…";
  if (query.isFetching) return "Actualisation en cours · dernière lecture conservée";
  if (query.isError) return "Actualisation impossible · dernière lecture conservée";
  if (!connected || query.fetchStatus === "paused") return "Copie locale · à actualiser";
  return "Dernière lecture réussie";
}
export function dossierSubtitle(queries: Pick<DossierQueries, "steps" | "programme">): string {
  const commune = queries.steps.data?.find((s) => s.number === 1)?.site?.parcel.commune;
  const programme = queries.programme.data;
  const type = programme?.repartition.stored || programme?.programmeCase ? programme.typeLabel : null;
  return [type, commune].filter(Boolean).join(" · ") || "Espace de travail du projet";
}
