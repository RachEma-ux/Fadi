/**
 * État de synchronisation du projet, visible en permanence dans l'en-tête :
 * réseau (en ligne / hors-ligne), lots de commandes de l'Atelier en attente
 * dans la file locale du bus et conflits. Les formulaires et
 * arbitrages, eux, exigent le réseau : leurs envois restent en pause pendant
 * une coupure (TanStack Query) et le disent dans leur écran.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutationState } from "@tanstack/react-query";
import { conflictsStore, type SyncConflict } from "../lib/mutations";
import { reachability } from "../lib/reachability";

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

/**
 * File de l'Atelier (`modules/atelier/bus/adaptateurs.ts`), quand l'Atelier est ouvert : ses lots en attente et
 * ses conflits s'ajoutent aux compteurs ; « Synchroniser maintenant » la relance.
 * `get()` doit rendre le même objet tant que rien ne change (`useSyncExternalStore`).
 */
export interface SourceSynchroAtelier {
  subscribe(fn: () => void): () => void;
  get(): { readonly enAttente: number; readonly conflits: number };
  synchroniser(): Promise<unknown>;
}

const SANS_SOURCE = { enAttente: 0, conflits: 0 } as const;
const sansAbonnement = () => () => {};

export function SyncIndicator({ projectId, atelier }: { projectId: string; atelier?: SourceSynchroAtelier }) {
  const online = useOnline();
  const bus = useSyncExternalStore(atelier ? atelier.subscribe : sansAbonnement, () => (atelier ? atelier.get() : SANS_SOURCE));
  const reachable = useReachable();
  // Saisies, arbitrages et commentaires en pause (hors-ligne), persistés avec le cache.
  const pausedMutations = useMutationState({ filters: { status: "pending", predicate: (m) => m.state.isPaused }, select: (m) => m.mutationId });
  const conflicts = useSyncConflicts(projectId);

  const pending = pausedMutations.length + bus.enAttente;
  const conflictCount = conflicts.length + bus.conflits;
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
        <button
          type="button"
          className="sync-indicator-retry"
          onClick={() =>
            void reachability.probeNow().then((ok) => {
              if (ok) void atelier?.synchroniser();
            })
          }
        >
          Réessayer
        </button>
      )}
      {online && reachable && pending > 0 && (
        <button
          type="button"
          className="sync-indicator-retry"
          onClick={() => void atelier?.synchroniser()}
        >
          Synchroniser maintenant
        </button>
      )}
    </span>
  );
}
