/**
 * L'Atelier architectural du prototype, monté dans Fadi : le moteur natif
 * (3D, plan, coupes, façades, niveaux, outils de dessin, exports) sur le
 * modèle du projet, persisté par l'API avec révision contrôlée. Affiché
 * dans l'onglet Atelier et dans les étapes 10 et 11 du Parcours.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type AtelierStore } from "../../lib/api";
import { localStore } from "../../lib/local-store";
import { atelierStorage, DRAWING_COPY_NAME, mountEngine, PROTECTED_REFERENCE_MESSAGE, unmountEngine, type SyncState } from "./native/engine";

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
  const navigate = useNavigate();
  const location = useLocation();
  // `networkMode: "always"` : sans réseau, la requête s'exécute quand même pour tomber sur le cache local.
  const storeQuery = useQuery({ queryKey: ["atelier-store", projectId], queryFn: () => loadStore(projectId), staleTime: Infinity, networkMode: "always" });
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  // Référence protégée de l'exemple (`demoP118V81.mode = "reference"`) : la première modification validée du dessin crée une copie de travail.
  const protectedReference = !readOnly && projectQuery.data?.exampleMode === "reference";
  const projectKnown = !!projectQuery.data;
  const container = useRef<HTMLDivElement>(null);
  const [mountError, setMountError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: "idle", pending: 0, message: null });
  // L'adresse courante (module, étape) est lue au moment de la copie, sans remonter le moteur à chaque changement.
  const search = useRef(location.search);
  search.current = location.search;

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
    if (!el || !store || !projectKnown) return;
    let cancelled = false;
    // Copie de travail créée automatiquement (prototype : `copy(…, { stayInAtelier: true, automatic: true })`) : une fois ses
    // écritures envoyées, l'écran bascule sur la copie, même module et même étape, l'original intact.
    const onDrawingCopy = (copy: { id: string; name: string }) => {
      void atelierStorage.flush().then(() => {
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        const params = new URLSearchParams(search.current);
        navigate(`/projets/${copy.id}?${params.toString()}`, { state: { notice: "Copie de travail créée automatiquement · exemple original conservé." } });
      });
    };
    mountEngine(el, { projectId, stage, store, readOnly, protectedReference, onDrawingCopy }).catch((err: unknown) => {
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
  }, [projectId, stage, storeQuery.data, projectKnown, queryClient, readOnly, protectedReference, navigate]);

  if (storeQuery.isLoading || projectQuery.isLoading) return <p role="status">Chargement du modèle…</p>;
  if (!storeQuery.data) return <p role="alert">Impossible de charger le modèle de l’Atelier.</p>;

  // Ordre du prototype : bandeau, barre d'outils et dessin d'abord ; l'état de synchronisation et la note de protection sous le dessin.
  return (
    <section className="native-atelier" aria-label="Atelier architectural">
      <div id="nativeDesignerMount" ref={container} />
      <p className={`native-atelier-status native-atelier-status-${sync.status}`} role="status">
        {sync.status === "idle" && storeQuery.data.source === "cache"
          ? `Hors-ligne · modèle chargé depuis le cache local du ${new Date(storeQuery.data.fetchedAt).toLocaleString("fr-FR")}`
          : STATUS_LABEL[sync.status]}
        {sync.pending > 0 ? ` (${sync.pending})` : ""}
        {sync.message ? ` — ${sync.message}` : ""}
      </p>
      {protectedReference && (
        <p className="native-atelier-reference h7-muted" role="note">
          {PROTECTED_REFERENCE_MESSAGE} La référence reste intacte : votre première modification validée ouvre une copie de travail (« {projectQuery.data?.code} — {DRAWING_COPY_NAME} ») et s’y
          enregistre.
        </p>
      )}
      {mountError && (
        <p role="alert" className="h7-error">
          Le moteur de l’Atelier n’a pas pu démarrer : {mountError}
        </p>
      )}
    </section>
  );
}
