/**
 * Cache des requêtes persistant (TanStack Query → IndexedDB via Dexie) : les
 * données déjà lues d'un projet (projet, étapes, programme, analyses,
 * documents…) restent lisibles sans réseau et après rechargement, marquées
 * périmées jusqu'à la prochaine lecture serveur. Le magasin du modèle de
 * l'Atelier a son propre cache (`modelCache`) et n'est pas déshydraté ici.
 */
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { dehydrate, type QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { localStore } from "./local-store";

export const QUERY_CACHE_VERSION = "fadi-queries-1";

interface QueryPersistenceState { failedProjects: readonly string[]; error: string | null; saving: boolean }
let queryPersistenceState: QueryPersistenceState = { failedProjects: [], error: null, saving: false };
let savedProjects: string[] = [];
let writeSequence: Promise<void> = Promise.resolve();
const persistenceListeners = new Set<() => void>();
function publishPersistence(patch: Partial<QueryPersistenceState>) {
  queryPersistenceState = { ...queryPersistenceState, ...patch };
  for (const listener of persistenceListeners) listener();
}
export const queryPersistenceStore = {
  get: (): QueryPersistenceState => queryPersistenceState,
  subscribe(listener: () => void): () => void { persistenceListeners.add(listener); return () => persistenceListeners.delete(listener); },
};
function mutationProjects(value: string): string[] {
  const cache = JSON.parse(value) as { clientState?: { mutations?: { state?: { variables?: { projectId?: unknown } } }[] } };
  return [...new Set((cache.clientState?.mutations ?? []).map((mutation) => mutation.state?.variables?.projectId).filter((id): id is string => typeof id === "string"))];
}
async function writeQueryCacheValue(key: string, value: string): Promise<void> {
  const projects = mutationProjects(value);
  publishPersistence({ saving: true });
  try {
    await localStore.setValueChecked(key, value);
    savedProjects = projects;
    publishPersistence({ failedProjects: [], error: null });
  } catch (error) {
    publishPersistence({ failedProjects: [...new Set([...projects, ...savedProjects, ...queryPersistenceState.failedProjects])], error: "La mise à jour de la file locale des saisies n’est pas confirmée. Les informations en mémoire restent conservées." });
    throw error;
  } finally { publishPersistence({ saving: false }); }
}
export function persistQueryCacheValue(key: string, value: string): Promise<void> {
  // Le bouton de reprise et l'écriture différée ne doivent pas se doubler ni remettre un ancien instantané après le nouveau.
  const next = writeSequence.catch(() => undefined).then(() => writeQueryCacheValue(key, value));
  writeSequence = next;
  return next;
}

export const queryPersister = createAsyncStoragePersister({
  key: QUERY_CACHE_VERSION,
  // Écriture regroupée mais rapide : une mutation qui vient d'aboutir ne doit pas rester « en pause » dans le cache
  // persistant le temps d'un rechargement immédiat (elle serait rejouée une seconde fois).
  throttleTime: 200,
  storage: {
    getItem: (key) => localStore.getValue(key),
    setItem: persistQueryCacheValue,
    removeItem: (key) => localStore.removeValue(key),
  },
});

/** Le cache est propre à l'utilisateur connu de l'appareil : un autre utilisateur le fait tomber (`buster`). */
function lastUserId(): string {
  try {
    const raw = localStorage.getItem("fadi.lastUser");
    return raw ? String((JSON.parse(raw) as { id?: string }).id ?? "anon") : "anon";
  } catch {
    return "anon";
  }
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: queryPersister,
  maxAge: 1000 * 60 * 60 * 24 * 14,
  buster: `${QUERY_CACHE_VERSION}:${lastUserId()}`,
  dehydrateOptions: {
    // Le modèle natif (plusieurs Mo) a son cache dédié ; les sessions et la liste des exemples se relisent.
    shouldDehydrateQuery: (query) => query.state.status === "success" && !["auth"].includes(String(query.queryKey[0])),
  },
};

/** Reprise explicite, immédiate et vérifiée, hors du regroupement différé du persister. */
export async function retryQueryPersistence(queryClient: QueryClient): Promise<void> {
  const value = JSON.stringify({ buster: persistOptions.buster, timestamp: Date.now(), clientState: dehydrate(queryClient, persistOptions.dehydrateOptions) });
  await persistQueryCacheValue(QUERY_CACHE_VERSION, value);
}
