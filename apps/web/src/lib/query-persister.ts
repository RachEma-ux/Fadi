/**
 * Cache des requêtes persistant (TanStack Query → IndexedDB via Dexie) : les
 * données déjà lues d'un projet (projet, étapes, programme, analyses,
 * documents…) restent lisibles sans réseau et après rechargement, marquées
 * périmées jusqu'à la prochaine lecture serveur. Le magasin du modèle de
 * l'Atelier a son propre cache (`modelCache`) et n'est pas déshydraté ici.
 */
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { localStore } from "./local-store";

export const QUERY_CACHE_VERSION = "fadi-queries-1";

export const queryPersister = createAsyncStoragePersister({
  key: QUERY_CACHE_VERSION,
  // Écriture regroupée mais rapide : une mutation qui vient d'aboutir ne doit pas rester « en pause » dans le cache
  // persistant le temps d'un rechargement immédiat (elle serait rejouée une seconde fois).
  throttleTime: 200,
  storage: {
    getItem: (key) => localStore.getValue(key),
    setItem: (key, value) => localStore.setValue(key, value),
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
