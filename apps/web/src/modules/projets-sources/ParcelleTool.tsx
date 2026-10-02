/**
 * Étape 01 — l'outil Parcelle du prototype (« Parcelle — Atelier satellite » :
 * Leaflet, import KML/KMZ, bornes, cotes, fond MapTiler optionnel, dossier,
 * Design Parcel 2.0), chargé tel quel dans une iframe comme dans le
 * prototype, mais dont les fichiers vivent dans Fadi
 * (`/projects/:id/parcels`, révision par fichier) et dont chaque
 * modification est transmise au modèle de l'Atelier avec les règles
 * `acceptParcel` du prototype (statut lié / incomplet / invalide / conflit).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ParcelTransmission } from "../../lib/api";
import { useProjectAccess } from "../../lib/access";

interface ParcelFrameWindow extends Window {
  ParcoursParcel?: {
    capture: () => unknown;
    load: (data: unknown, id: string) => void;
    files: { currentId: () => string; flush: () => Promise<void>; isDirty: () => boolean };
    ready: boolean;
  };
}

const STATUS_LABEL: Record<ParcelTransmission["status"], string> = {
  linked: "Parcelle liée au modèle",
  incomplete: "Parcelle incomplète",
  invalid: "Parcelle invalide",
  conflict: "Conflit avec le bâtiment dessiné",
  "design-conflict": "Conflit d’emprise",
  "setback-pending": "Recul à recalculer",
};

const m2 = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const m = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

export function ParcelleTool({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [transmitting, setTransmitting] = useState(false);
  const parcelsQuery = useQuery({ queryKey: ["parcels", projectId], queryFn: () => api.listParcels(projectId) });
  const access = useProjectAccess(projectId);

  // Prêt / erreur signalés par l'outil (postMessage, même origine).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
      const data = e.data as { type?: string; message?: string };
      if (data.type === "parcelle:ready") setReady(true);
      if (data.type === "parcelle:error") setFrameError(data.message ?? "Outil Parcelle indisponible.");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Comme `frameReady()` / `flushParcel()` du prototype : la signature de la
  // parcelle capturée est relevée à l'ouverture puis relue à intervalle
  // régulier ; quand elle change, la capture est transmise au modèle. Un
  // clic dans la page hôte (navigation vers une autre étape) ou le passage
  // de la page en arrière-plan transmettent la dernière saisie avant que
  // l'outil ne disparaisse. L'enregistrement du fichier reste l'affaire de
  // l'outil (son propre délai de 600 ms, `keepalive`).
  useEffect(() => {
    if (!ready) return;
    const bridgeOf = () => (frame.current?.contentWindow as ParcelFrameWindow | null)?.ParcoursParcel;
    const captureOf = (): { snapshot: unknown; signature: string; id: string } | null => {
      const bridge = bridgeOf();
      if (!bridge?.ready) return null;
      try {
        const snapshot = bridge.capture();
        return { snapshot, signature: JSON.stringify(snapshot), id: bridge.files.currentId() };
      } catch {
        return null;
      }
    };
    let last = captureOf()?.signature ?? null;
    let busy = false;
    let disposed = false;
    const transmit = async () => {
      const captured = captureOf();
      if (!captured || captured.signature === last || busy) return;
      busy = true;
      try {
        const id = captured.id || (await flushedId());
        if (id) {
          if (!disposed) setTransmitting(true);
          await api.transmitParcel(projectId, id, captured.snapshot);
          last = captured.signature;
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["parcels", projectId] }),
            queryClient.invalidateQueries({ queryKey: ["atelier-store", projectId] }),
            queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
          ]);
        }
      } catch {
        /* nouvelle tentative au prochain tour */
      } finally {
        busy = false;
        if (!disposed) setTransmitting(false);
      }
    };
    // Un nouveau fichier n'a d'identifiant qu'une fois enregistré par l'outil.
    const flushedId = async () => {
      const bridge = bridgeOf();
      if (!bridge) return "";
      await bridge.files.flush();
      return bridge.files.currentId();
    };
    const timer = setInterval(transmit, 1500);
    const onClick = () => void transmit();
    const onHide = () => {
      if (document.visibilityState === "hidden") void transmit();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [ready, projectId, queryClient]);

  const transmission = parcelsQuery.data?.transmission ?? null;
  const file = parcelsQuery.data?.files.find((f) => f.id === transmission?.parcelId) ?? parcelsQuery.data?.files[0] ?? null;
  // Les mesures affichées sont celles de la parcelle transmise au modèle,
  // sinon celles du fichier enregistré.
  const current = transmission?.parcel ?? file;
  const summary = current
    ? [current.name, `${current.boundaryCount} bornes`, current.area !== null ? m2(current.area) : null, current.perimeter !== null ? m(current.perimeter) : null].filter(Boolean).join(" · ")
    : null;
  const status = !ready ? "Chargement de l’outil…" : transmitting ? "Transmission au modèle…" : transmission ? `${STATUS_LABEL[transmission.status]} · ${new Date(transmission.at).toLocaleString("fr-FR")}` : "Fichiers enregistrés dans ce projet";

  return (
    <section className="parcelle-tool" aria-label="Parcelle / Site existant">
      {transmission && transmission.status !== "linked" && (
        <p className="v62-alert" role="status">
          <b>{STATUS_LABEL[transmission.status]}.</b> {transmission.reason}
        </p>
      )}
      {frameError && (
        <p className="h7-error" role="alert">
          {frameError}
        </p>
      )}
      {!access.canWrite && <p className="h7-muted access-readonly-hint">Lecture seule : la parcelle se consulte et s’exporte ; son enregistrement est réservé au propriétaire et aux éditeurs (le serveur refuse toute écriture).</p>}
      <div className="module">
        <div className="module-head">
          <b>Parcelle-1 · Import KML/KMZ + MapTiler</b>
          <small className="parcelle-status" role="status">
            {summary ? `${summary} — ` : ""}
            {status}
          </small>
        </div>
        <iframe
          ref={frame}
          title="Parcelle — Atelier satellite"
          src={`/parcelle/index.html?project=${encodeURIComponent(projectId)}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"
        />
      </div>
    </section>
  );
}
