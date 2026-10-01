/**
 * L'Atelier architectural du prototype, monté dans Fadi : le moteur natif
 * (3D, plan, coupes, façades, niveaux, outils de dessin, exports) sur le
 * modèle du projet, persisté par l'API avec révision contrôlée. Affiché
 * dans l'onglet Atelier et dans les étapes 10 et 11 du Parcours.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { atelierStorage, mountEngine, unmountEngine, type SyncState } from "./native/engine";

const STATUS_LABEL: Record<SyncState["status"], string> = {
  idle: "Modèle chargé depuis le serveur",
  local: "Enregistré localement · synchronisation en attente",
  syncing: "Synchronisation en cours…",
  saved: "Enregistré sur le serveur",
  conflict: "Conflit détecté",
  error: "Échec de la synchronisation",
};

export function NativeAtelier({ projectId, stage = null }: { projectId: string; stage?: number | null }) {
  const queryClient = useQueryClient();
  const storeQuery = useQuery({ queryKey: ["atelier-store", projectId], queryFn: () => api.getAtelierStore(projectId), staleTime: Infinity });
  const container = useRef<HTMLDivElement>(null);
  const [mountError, setMountError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: "idle", pending: 0, message: null });

  useEffect(
    () =>
      atelierStorage.subscribe((state) => {
        setSync(state);
        // Chaque écriture acceptée a pu avancer la révision du modèle et sa projection.
        if (state.status === "saved") {
          void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          void queryClient.invalidateQueries({ queryKey: ["levels", projectId] });
        }
      }),
    [projectId, queryClient],
  );

  useEffect(() => {
    const el = container.current;
    const store = storeQuery.data;
    if (!el || !store) return;
    let cancelled = false;
    mountEngine(el, { projectId, stage, store }).catch((err: unknown) => {
      if (!cancelled) setMountError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
      void unmountEngine().then(() => {
        // Les révisions ont avancé : la prochaine ouverture repart du serveur.
        void queryClient.invalidateQueries({ queryKey: ["atelier-store", projectId] });
        void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        void queryClient.invalidateQueries({ queryKey: ["levels", projectId] });
      });
    };
  }, [projectId, stage, storeQuery.data, queryClient]);

  if (storeQuery.isLoading) return <p role="status">Chargement du modèle…</p>;
  if (storeQuery.isError || !storeQuery.data) return <p role="alert">Impossible de charger le modèle de l’Atelier.</p>;

  return (
    <section className="native-atelier" aria-label="Atelier architectural">
      <p className={`native-atelier-status native-atelier-status-${sync.status}`} role="status">
        {STATUS_LABEL[sync.status]}
        {sync.pending > 0 ? ` (${sync.pending})` : ""}
        {sync.message ? ` — ${sync.message}` : ""}
      </p>
      {mountError && (
        <p role="alert" className="h7-error">
          Le moteur de l’Atelier n’a pas pu démarrer : {mountError}
        </p>
      )}
      <div id="nativeDesignerMount" ref={container} />
    </section>
  );
}
