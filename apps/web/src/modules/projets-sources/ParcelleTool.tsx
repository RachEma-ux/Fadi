/**
 * Étape 01 — l'outil Parcelle du prototype (« Parcelle — Atelier satellite » :
 * Leaflet, import KML/KMZ, bornes, cotes, fond MapTiler optionnel, dossier,
 * Design Parcel 2.0), chargé tel quel dans une iframe comme dans le
 * prototype, mais dont les fichiers vivent dans Fadi
 * (`/projects/:id/parcels`, révision par fichier) et dont chaque
 * modification est transmise au modèle de l'Atelier avec les règles
 * `acceptParcel` du prototype (statut lié / incomplet / invalide / conflit).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ParcelTransmission } from "../../lib/api";
import { useProjectAccess } from "../../lib/access";

const SLOT_ID = "fadi-harmonie-slot";

/**
 * `ParcoursSectionsV82.place(panel)` du prototype : à l'étape 01, le panneau
 * Harmonie vit dans la colonne gauche de l'outil Parcelle, après le pli
 * « Construction » (`#fold-construction`), avec les feuilles de style de
 * l'application copiées dans le document de l'outil. Ici : un emplacement
 * créé au même endroit, les feuilles de Fadi limitées à cet emplacement
 * (`@scope`) pour ne pas toucher l'outil, et le panneau React rendu dedans
 * par un portail. Sans `@scope` (navigateur ancien), le panneau reste sous
 * l'outil.
 */
async function parentStylesheetText(): Promise<string> {
  const parts: string[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))) {
    if (el instanceof HTMLLinkElement) {
      try {
        const r = await fetch(el.href, { credentials: "same-origin" });
        if (r.ok) parts.push(await r.text());
      } catch {
        /* feuille inaccessible : le panneau garde les styles de l'outil */
      }
    } else if (!el.id.startsWith("fadi-")) parts.push(el.textContent ?? "");
  }
  return parts.join("\n");
}

async function placeHarmonieSlot(doc: Document): Promise<HTMLElement | null> {
  if (typeof CSSScopeRule === "undefined") return null;
  const construction = doc.getElementById("fold-construction");
  if (!construction || !construction.parentElement) return null;
  let slot = doc.getElementById(SLOT_ID);
  if (!slot) {
    slot = doc.createElement("section");
    slot.id = SLOT_ID;
    slot.className = "h7-site-section";
    slot.setAttribute("aria-label", "Harmonie de l’étape");
    construction.after(slot);
  }
  if (!doc.getElementById("fadi-scoped-css")) {
    const css = (await parentStylesheetText()).replace(/:root\b/g, `#${SLOT_ID}`);
    const scoped = doc.createElement("style");
    scoped.id = "fadi-scoped-css";
    scoped.textContent = `@scope (#${SLOT_ID}) {\n${css}\n}`;
    doc.head.append(scoped);
    // Mise en page du prototype dans la colonne de l'outil (`v82-site-section-css`), appliquée au panneau de Fadi.
    const column = doc.createElement("style");
    column.id = "fadi-site-section-css";
    column.textContent = `
#coordinates #${SLOT_ID}{margin:0;border-top:1px solid var(--line);background:white;min-width:0;max-width:100%;overflow:hidden;font:15px/1.5 Arial,"Helvetica Neue",Helvetica,sans-serif;color:#183d32}
#coordinates #${SLOT_ID} .h7-panel{margin:0;border:0;border-radius:0;min-width:0;max-width:100%;background:white;overflow:hidden}
#coordinates #${SLOT_ID} .h7-panel>summary{min-height:60px;padding:16px var(--fold-padding);background:#eaf3ef;color:var(--accent);font:700 16px/1.4 Inter,Arial,sans-serif;display:flex;gap:12px;align-items:center;justify-content:space-between;cursor:pointer}
#coordinates #${SLOT_ID} .h7-panel>summary:hover{background:#dfeee7}
#coordinates #${SLOT_ID} .h7-panel>summary::after{content:'›';font:400 27px/1 Arial;flex:0 0 20px;text-align:center;transform:none}
#coordinates #${SLOT_ID} .h7-panel[open]>summary{border-bottom:1px solid var(--line)}
#coordinates #${SLOT_ID} .h7-panel[open]>summary::after{transform:rotate(90deg)}
#coordinates #${SLOT_ID} .h7-content,#coordinates #${SLOT_ID} .h7-inner{padding:18px var(--fold-padding);min-width:0}
#coordinates #${SLOT_ID} .h7-head{display:block}
#coordinates #${SLOT_ID} .h7-proposals,#coordinates #${SLOT_ID} .h7-form,#coordinates #${SLOT_ID} .h7-site-hero{grid-template-columns:minmax(0,1fr);display:grid}
#coordinates #${SLOT_ID} .h7-facts,#coordinates #${SLOT_ID} .ex81-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
#coordinates #${SLOT_ID} .h7-tabs{display:flex;flex-wrap:wrap;max-width:100%}
#coordinates #${SLOT_ID} .h7-tabs button{white-space:normal;flex:1 1 120px;min-width:0}
#coordinates #${SLOT_ID} .h7-form .wide{grid-column:auto}
#coordinates #${SLOT_ID} p,#coordinates #${SLOT_ID} h2,#coordinates #${SLOT_ID} h3{overflow-wrap:anywhere}
#coordinates #${SLOT_ID} svg{max-width:100%}
#coordinates #${SLOT_ID} input,#coordinates #${SLOT_ID} select,#coordinates #${SLOT_ID} textarea{max-width:100%;box-sizing:border-box}
#coordinates #${SLOT_ID} [hidden]{display:none!important}
`;
    doc.head.append(column);
  }
  return slot;
}

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

export function ParcelleTool({ projectId, harmonie = null }: { projectId: string; /** Étape 01 : le panneau Harmonie, placé dans la colonne gauche de l'outil (prototype), sous l'outil tant que la colonne n'est pas prête. */ harmonie?: ReactNode }) {
  const queryClient = useQueryClient();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!ready || !harmonie) return;
    let cancelled = false;
    const doc = frame.current?.contentDocument ?? null;
    if (!doc) return;
    void placeHarmonieSlot(doc).then((el) => {
      if (!cancelled) setSlot(el);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, harmonie !== null]);
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
      {harmonie && (slot ? createPortal(harmonie, slot) : <div className="parcelle-harmonie-fallback">{harmonie}</div>)}
    </section>
  );
}
