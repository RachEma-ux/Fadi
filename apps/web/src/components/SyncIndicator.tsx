/**
 * État de synchronisation du projet, visible en permanence dans l'en-tête :
 * réseau (en ligne / hors-ligne), écritures du modèle en attente dans la
 * file locale, dernier état de l'Atelier (enregistré localement,
 * synchronisation, enregistré sur le serveur, conflit). Les formulaires et
 * arbitrages, eux, exigent le réseau : leurs envois restent en pause pendant
 * une coupure (TanStack Query) et le disent dans leur écran.
 */
import { useEffect, useState } from "react";
import { useMutationState, useQuery } from "@tanstack/react-query";
import { localStore } from "../lib/local-store";
import { conflictsKey, type SyncConflict } from "../lib/mutations";
import { atelierStorage, type SyncState } from "../modules/atelier/native/engine";

/** Les refus 409 conservés pour l'écran (`recordConflict`) ; jamais relus du serveur. */
export function useSyncConflicts(projectId: string): SyncConflict[] {
  const q = useQuery({ queryKey: conflictsKey(projectId), queryFn: () => [] as SyncConflict[], enabled: false, initialData: [] as SyncConflict[], staleTime: Infinity, gcTime: Infinity });
  return q.data ?? [];
}

/** L'état réseau du navigateur, suivi par les événements `online` / `offline`. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function SyncIndicator({ projectId }: { projectId: string }) {
  const online = useOnline();
  const [sync, setSync] = useState<SyncState>({ status: "idle", pending: 0, message: null });
  const [queued, setQueued] = useState(0);
  // Saisies, arbitrages et commentaires en pause (hors-ligne), persistés avec le cache.
  const pausedMutations = useMutationState({ filters: { status: "pending", predicate: (m) => m.state.isPaused }, select: (m) => m.mutationId });
  const conflicts = useSyncConflicts(projectId);
  const [modelConflicts, setModelConflicts] = useState(0);
  useEffect(() => atelierStorage.subscribe(setSync), []);
  useEffect(() => atelierStorage.subscribeConflicts((c) => setModelConflicts(c.length)), []);
  useEffect(() => {
    let alive = true;
    const read = () => void localStore.pendingCount(projectId).then((n) => alive && setQueued(n));
    read();
    const t = setInterval(read, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [projectId, sync]);

  const pending = Math.max(sync.pending, queued) + pausedMutations.length;
  const conflictCount = conflicts.length + modelConflicts;
  const state = !online ? "offline" : conflictCount > 0 ? "conflict" : pending > 0 ? "pending" : "synced";
  const label = !online
    ? `Hors-ligne · ${pending} modification(s) enregistrée(s) localement`
    : conflictCount > 0
      ? `${conflictCount} conflit(s) à examiner`
      : pending > 0
        ? `${pending} modification(s) à synchroniser`
        : "Synchronisé avec le serveur";
  return (
    <span className={`sync-indicator sync-indicator-${state}`} role="status" aria-live="polite" data-pending={pending}>
      <i aria-hidden="true" />
      {label}
      {online && pending > 0 && (
        <button type="button" className="sync-indicator-retry" onClick={() => void atelierStorage.retryPending()}>
          Synchroniser maintenant
        </button>
      )}
    </span>
  );
}
