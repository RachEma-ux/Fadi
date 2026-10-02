/**
 * État de synchronisation du projet, visible en permanence dans l'en-tête :
 * réseau (en ligne / hors-ligne), écritures du modèle en attente dans la
 * file locale, dernier état de l'Atelier (enregistré localement,
 * synchronisation, enregistré sur le serveur, conflit). Les formulaires et
 * arbitrages, eux, exigent le réseau : leurs envois restent en pause pendant
 * une coupure (TanStack Query) et le disent dans leur écran.
 */
import { useEffect, useState } from "react";
import { localStore } from "../lib/local-store";
import { atelierStorage, type SyncState } from "../modules/atelier/native/engine";

export function SyncIndicator({ projectId }: { projectId: string }) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [sync, setSync] = useState<SyncState>({ status: "idle", pending: 0, message: null });
  const [queued, setQueued] = useState(0);

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
  useEffect(() => atelierStorage.subscribe(setSync), []);
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

  const pending = Math.max(sync.pending, queued);
  const state = !online ? "offline" : sync.status === "conflict" ? "conflict" : pending > 0 ? "pending" : "synced";
  const label = !online
    ? `Hors-ligne · ${pending} modification(s) enregistrée(s) localement`
    : sync.status === "conflict"
      ? "Conflit à examiner dans l’Atelier"
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
