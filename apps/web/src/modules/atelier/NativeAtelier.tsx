/**
 * L'Atelier architectural du prototype, monté dans Fadi : le moteur natif
 * (3D, plan, coupes, façades, niveaux, outils de dessin, exports) sur le
 * modèle du projet, persisté par l'API avec révision contrôlée. Affiché
 * dans l'onglet Atelier et dans les étapes 10 et 11 du Parcours.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AtelierStore } from "../../lib/api";
import { localStore } from "../../lib/local-store";
import { atelierStorage, mountEngine, unmountEngine, type SyncState } from "./native/engine";

const STATUS_LABEL: Record<SyncState["status"], string> = {
  idle: "Modèle chargé depuis le serveur",
  local: "Enregistré localement · synchronisation en attente",
  syncing: "Synchronisation en cours…",
  saved: "Enregistré sur le serveur",
  conflict: "Conflit détecté",
  error: "Échec de la synchronisation",
  offline: "Hors-ligne · enregistré localement",
  readonly: "Lecture seule",
};

type LoadedStore = AtelierStore & { source: "serveur" | "cache"; fetchedAt: string };

/** Le magasin du modèle : depuis le serveur (et mis en cache local), sinon depuis le cache local quand le réseau manque. */
async function loadStore(projectId: string): Promise<LoadedStore> {
  try {
    const store = await api.getAtelierStore(projectId);
    const fetchedAt = new Date().toISOString();
    await localStore.cacheModel({ projectId, entries: store.entries, revisions: store.revisions, modelRevision: store.modelRevision, fetchedAt });
    return { ...store, source: "serveur", fetchedAt };
  } catch (err) {
    const cached = await localStore.readModelCache(projectId);
    if (cached) return { entries: cached.entries, revisions: cached.revisions, modelRevision: cached.modelRevision, source: "cache", fetchedAt: cached.fetchedAt };
    throw err;
  }
}

export function NativeAtelier({ projectId, stage = null, readOnly = false }: { projectId: string; stage?: number | null; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  // `networkMode: "always"` : sans réseau, la requête s'exécute quand même pour tomber sur le cache local.
  const storeQuery = useQuery({ queryKey: ["atelier-store", projectId], queryFn: () => loadStore(projectId), staleTime: Infinity, networkMode: "always" });
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
    mountEngine(el, { projectId, stage, store, readOnly }).catch((err: unknown) => {
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
  }, [projectId, stage, storeQuery.data, queryClient, readOnly]);

  if (storeQuery.isLoading) return <p role="status">Chargement du modèle…</p>;
  if (!storeQuery.data) return <p role="alert">Impossible de charger le modèle de l’Atelier.</p>;

  return (
    <section className="native-atelier" aria-label="Atelier architectural">
      <p className={`native-atelier-status native-atelier-status-${sync.status}`} role="status">
        {sync.status === "idle" && storeQuery.data.source === "cache" ? `Hors-ligne · modèle chargé depuis le cache local du ${new Date(storeQuery.data.fetchedAt).toLocaleString("fr-FR")}` : STATUS_LABEL[sync.status]}
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
