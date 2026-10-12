import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutationState, useQueryClient } from "@tanstack/react-query";
import { useProjectAccess } from "../../lib/access";
import { conflictsStore, isProjectPendingMutation, resumeProjectMutations, type SyncConflict } from "../../lib/mutations";
import { queuePersistenceStore } from "../../lib/local-store";
import { queryPersistenceStore, retryQueryPersistence } from "../../lib/query-persister";
import { reachability } from "../../lib/reachability";
import { reessayerSauvegardeAtelier, synchroniserAtelier, useFileAtelier } from "../atelier/bus/etat-projet";
import type { DossierSyncState } from "./dossier-state";

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on);window.removeEventListener("offline", off); };
  }, []);
  return online;
}
export function useReachable(): boolean { return useSyncExternalStore(reachability.subscribe, () => reachability.get() === "reachable"); }
export function useSyncConflicts(projectId: string): SyncConflict[] { return useSyncExternalStore(conflictsStore.subscribe, () => conflictsStore.get(projectId)); }

export interface DossierSync extends DossierSyncState {
  retryLocal(): Promise<boolean>;
  reconnect(): Promise<boolean>;
  synchronize(): Promise<boolean>;
}

export function useDossierSync(projectId: string): DossierSync {
  const queryClient = useQueryClient();
  const access = useProjectAccess(projectId);
  const online = useOnline(), reachable = useReachable();
  const file = useFileAtelier(projectId), conflicts = useSyncConflicts(projectId);
  const persistence = useSyncExternalStore(queryPersistenceStore.subscribe, queryPersistenceStore.get);
  const mutations = useMutationState({ filters: { status: "pending", predicate: (mutation) => isProjectPendingMutation(mutation, projectId) }, select: (mutation) => ({ id: mutation.mutationId, paused: mutation.state.isPaused }) });
  const cacheError = persistence.failedProjects.includes(projectId) ? persistence.error : null;
  const localSaveError = file.erreurLocale || cacheError;
  const pending = file.enAttente === null ? null : file.enAttente + mutations.length;
  const busy = file.envoiEnCours || file.sauvegardeEnCours || mutations.some((mutation) => !mutation.paused);

  async function synchronize(): Promise<boolean> {
    if (!access.known || !access.canWrite || !online || !reachable || localSaveError || file.lecture !== "ready") return false;
    await synchroniserAtelier(projectId, true);
    await resumeProjectMutations(queryClient, projectId);
    return true;
  }
  async function retryLocal(): Promise<boolean> {
    if (!access.known || !access.canWrite || busy) return false;
    try {
      if (file.erreurLocale || file.lecture !== "ready") await reessayerSauvegardeAtelier(projectId);
      if (cacheError) await retryQueryPersistence(queryClient);
      return !queuePersistenceStore.get(projectId).error && !queryPersistenceStore.get().failedProjects.includes(projectId);
    } catch { return false; }
  }
  async function reconnect(): Promise<boolean> {
    if (!online) return false;
    const ok = await reachability.probeNow();
    if (ok && access.known && access.canWrite && !localSaveError && conflicts.length === 0 && file.aTraiter.length === 0) {
      await synchroniserAtelier(projectId, true);
      await resumeProjectMutations(queryClient, projectId);
    }
    return ok;
  }
  return { projectId, pending, conflicts: conflicts.length + file.aTraiter.length, busy, busyLabel: file.sauvegardeEnCours ? "Sauvegarde locale en cours…" : "Envoi en cours…", localStatus: localSaveError ? "error" : file.lecture, localSaveError, online, reachable, retryLocal, reconnect, synchronize };
}
