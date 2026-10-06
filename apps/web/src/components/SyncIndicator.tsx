/**
 * État de synchronisation du projet, visible en permanence dans l'en-tête :
 * réseau (en ligne / hors-ligne), lots de commandes de l'Atelier en attente
 * dans la file locale, lots en conflit ou refusés à trancher. Les formulaires et
 * arbitrages, eux, exigent le réseau : leurs envois restent en pause pendant
 * une coupure (TanStack Query) et le disent dans leur écran.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useMutationState } from "@tanstack/react-query";
import { conflictsStore, MUTATION_KEYS, type SyncConflict } from "../lib/mutations";
import { reachability } from "../lib/reachability";
import { synchroniserAtelier, useFileAtelier } from "../modules/atelier/bus/etat-projet";

/** Les refus 409 conservés pour l'écran (`recordConflict`, magasin synchrone) ; jamais relus du serveur. */
export function useSyncConflicts(projectId: string): SyncConflict[] {
  return useSyncExternalStore(conflictsStore.subscribe, () => conflictsStore.get(projectId));
}

const CLES_REJOUABLES = new Set<string>(Object.values(MUTATION_KEYS).map((k) => k[0]));
/** Écriture rejouable (saisie d'étape, arbitrage, commentaire) d'après la clé de sa mutation. */
function ecritureRejouable(cle: readonly unknown[] | undefined): boolean {
  return !!cle && CLES_REJOUABLES.has(cle[0] as string);
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
  // Lots de commandes de l'Atelier en attente (file locale) et lots en conflit ou refusés, à trancher.
  const file = useFileAtelier(projectId);
  // Saisies, arbitrages et commentaires pas encore acceptés par le serveur : en pause (hors-ligne, persistés avec le
  // cache), en cours d'envoi ou en attente d'un nouvel essai après un échec réseau. « Synchronisé » n'est dit que
  // lorsqu'il n'en reste aucune.
  const pausedMutations = useMutationState({ filters: { status: "pending", predicate: (m) => m.state.isPaused || ecritureRejouable(m.options.mutationKey) }, select: (m) => m.mutationId });
  const conflicts = useSyncConflicts(projectId);

  const pending = file.enAttente + pausedMutations.length;
  const conflictCount = conflicts.length + file.aTraiter.length;
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
        <button type="button" className="sync-indicator-retry" onClick={() => void reachability.probeNow().then((ok) => { if (ok) synchroniserAtelier(projectId); })}>
          Réessayer
        </button>
      )}
      {online && reachable && pending > 0 && (
        <button type="button" className="sync-indicator-retry" onClick={() => synchroniserAtelier(projectId)}>
          Synchroniser maintenant
        </button>
      )}
    </span>
  );
}
