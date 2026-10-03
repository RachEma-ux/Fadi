/**
 * État de synchronisation du projet, visible en permanence dans l'en-tête :
 * réseau (en ligne / hors-ligne), écritures du modèle en attente dans la
 * file locale, dernier état de l'Atelier (enregistré localement,
 * synchronisation, enregistré sur le serveur, conflit). Les formulaires et
 * arbitrages, eux, exigent le réseau : leurs envois restent en pause pendant
 * une coupure (TanStack Query) et le disent dans leur écran.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutationState } from "@tanstack/react-query";
import { localStore } from "../lib/local-store";
import { conflictsStore, type SyncConflict } from "../lib/mutations";
import { reachability } from "../lib/reachability";
import { atelierStorage, type SyncState } from "../modules/atelier/native/storage";

/** Les refus 409 conservés pour l'écran (`recordConflict`, magasin synchrone) ; jamais relus du serveur. */
export function useSyncConflicts(projectId: string): SyncConflict[] {
  return useSyncExternalStore(conflictsStore.subscribe, () => conflictsStore.get(projectId));
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

/** Le serveur répond-il ? (`lib/reachability.ts` : indépendant de l'état réseau du navigateur.) */
export function useReachable(): boolean {
  return useSyncExternalStore(reachability.subscribe, () => reachability.get() === "reachable");
}

export function SyncIndicator({ projectId }: { projectId: string }) {
  const online = useOnline();
  const reachable = useReachable();
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
  const state = !online ? "offline" : !reachable ? "unreachable" : conflictCount > 0 ? "conflict" : pending > 0 ? "pending" : "synced";
  const label = !online
    ? `Hors-ligne · ${pending} modification(s) enregistrée(s) localement`
    : !reachable
      ? `Serveur injoignable · ${pending} modification(s) en attente, reprise automatique`
      : conflictCount > 0
        ? `${conflictCount} conflit(s) à examiner`
        : pending > 0
          ? `${pending} modification(s) à synchroniser`
          : "Synchronisé avec le serveur";
  return (
    <span className={`sync-indicator sync-indicator-${state}`} role="status" aria-live="polite" data-pending={pending} data-reachable={reachable ? "1" : "0"}>
      <i aria-hidden="true" />
      {label}
      {online && !reachable && (
        <button type="button" className="sync-indicator-retry" onClick={() => void reachability.probeNow().then((ok) => { if (ok) void atelierStorage.retryPending(); })}>
          Réessayer
        </button>
      )}
      {online && reachable && pending > 0 && (
        <button type="button" className="sync-indicator-retry" onClick={() => void atelierStorage.retryPending()}>
          Synchroniser maintenant
        </button>
      )}
    </span>
  );
}
