/** Écritures connues de ce dossier. Le réseau du navigateur n'est jamais un reçu de synchronisation. */
import { useDossierSync } from "../modules/accueil/use-dossier-sync";
import { useProjectAccess } from "../lib/access";
export { useOnline, useReachable, useSyncConflicts } from "../modules/accueil/use-dossier-sync";

export function SyncIndicator({ projectId }: { projectId: string }) {
  const sync = useDossierSync(projectId);
  const access = useProjectAccess(projectId);
  const state = sync.localSaveError ? "conflict" : sync.localStatus === "loading" ? "pending" : !sync.online ? "offline" : !sync.reachable ? "unreachable" : sync.conflicts > 0 ? "conflict" : sync.pending ? "pending" : "synced";
  const count = sync.pending === null ? "Nombre de modifications inconnu" : `${sync.pending} modification(s) en attente`;
  const label = sync.localSaveError ? "Sauvegarde locale non confirmée" : sync.localStatus === "loading" ? "Lecture de la file locale…" : !sync.online ? `Hors-ligne · ${count}` : !sync.reachable ? `Serveur injoignable · ${count}` : sync.conflicts > 0 ? `${sync.conflicts} conflit(s) à examiner` : sync.pending === null ? "File locale indisponible" : sync.pending > 0 ? count : "Aucune écriture en attente sur cet appareil";
  return <span className={`sync-indicator sync-indicator-${state}`} role="status" aria-live="polite" data-pending={sync.pending ?? "unknown"} data-reachable={sync.reachable ? "1" : "0"}>
    <i aria-hidden="true" />{label}
    {sync.localSaveError && <button type="button" className="sync-indicator-retry" disabled={sync.busy || !access.known || !access.canWrite} onClick={() => void sync.retryLocal()}>Réessayer la sauvegarde</button>}
    {!sync.localSaveError && sync.online && !sync.reachable && <button type="button" className="sync-indicator-retry" disabled={sync.busy} onClick={() => void sync.reconnect()}>Réessayer</button>}
    {!sync.localSaveError && sync.online && sync.reachable && sync.pending !== null && sync.pending > 0 && <button type="button" className="sync-indicator-retry" disabled={sync.busy || !access.known || !access.canWrite} onClick={() => void sync.synchronize()}>Synchroniser maintenant</button>}
  </span>;
}
