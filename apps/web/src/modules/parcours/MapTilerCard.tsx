/**
 * Les trois commandes MapTiler du pli « Données du site » de l'étape 01
 * (h7-app) : « Afficher le fond MapTiler » (mosaïque satellite du site avec
 * le contour source en superposition), « Collecter centre + sommets »
 * (altimétrie du modèle de terrain, 50 positions au plus, conservée comme
 * donnée déclarée de l'étape 01) et « Connexion MapTiler » (clé réutilisée
 * depuis l'outil Parcelle, ou saisie, conservée localement sur demande).
 * Les messages d'état sont ceux du prototype ; rien n'est inventé sans clé
 * ni géolocalisation.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type HarmonieProposal, type ParcoursStep, type SiteView } from "../../lib/api";
import { adoptStep } from "../../lib/mutations";
import { collectCenterElevation, collectElevationPoints, maptilerKey, mercator, satelliteMosaic, useMaptilerKey, type LonLat, type SatelliteMosaic } from "../../lib/maptiler";
import { useProjectAccess } from "../../lib/access";
import { LOCALE } from "../../lib/i18n";

const fmt = (x: number) => x.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
const toLonLat = (c: { lon: number; lat: number }): LonLat => [c.lon, c.lat];

/** « Connexion MapTiler » : la clé déjà configurée dans Parcelle est réutilisée ; une nouvelle clé reste en session sauf choix explicite. */
export function MapTilerKeyDialog({ onClose, onReady }: { onClose: () => void; onReady: () => void }) {
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="h7-dialog-inline" role="dialog" aria-labelledby="h7-map-key-title">
      <div className="h7-dialog-head">
        <h2 id="h7-map-key-title">Connexion MapTiler</h2>
        <button type="button" className="button-secondary" onClick={onClose}>
          Fermer
        </button>
      </div>
      <p>
        La clé déjà configurée dans Parcelle est réutilisée. Une nouvelle clé reste en mémoire de session sauf choix explicite de stockage local. Elle n’est jamais incluse dans les rapports Harmonie.
      </p>
      <label>
        Clé API
        <input id="h7-map-key" type="password" autoComplete="off" placeholder="Clé MapTiler" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="h7-checkbox">
        <input id="h7-remember-key" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Conserver dans le stockage local du navigateur
      </label>
      <div className="h7-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => {
            try {
              useMaptilerKey(key, remember);
              setError(null);
              onReady();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Clé non renseignée");
            }
          }}
        >
          Utiliser cette clé
        </button>
      </div>
      {error && (
        <p className="h7-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Mosaïque satellite rendue comme le prototype (`#h7-map-host`) : tuiles positionnées, contour et sommets, variante de site superposée (hypothèse), crédit. */
function MapView({ mosaic, site, proposal }: { mosaic: SatelliteMosaic; site: SiteView; proposal: HarmonieProposal | null }) {
  const poly = mosaic.polygon;
  // Superposition de la variante de site retenue (ou affichée, ou la première) : toutes les surfaces restent des hypothèses.
  const overlay = poly && proposal?.zoningGeographic ? proposal.zoningGeographic.zones : null;
  const project = (ll: readonly [number, number]): [number, number] => {
    const pt = mercator(ll, mosaic.zoom);
    return [pt[0] - mosaic.origin[0], pt[1] - mosaic.origin[1]];
  };
  return (
    <div id="h7-map-host">
      <div className="h7-map-viewport">
        <div className="h7-map-tiles">
          {mosaic.tiles.map((t) => (
            <img key={t.url} alt="Fond satellite du site" referrerPolicy="no-referrer" src={t.url} style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.width}%`, height: `${t.height}%` }} />
          ))}
        </div>
        <svg viewBox="0 0 900 560" className="h7-map-overlay" aria-label="Contour source sur fond MapTiler">
          {overlay?.map((zone) =>
            zone.polys.map((part, i) => (
              <polygon key={`${zone.id}-${i}`} points={part.map((q) => project(q).join(",")).join(" ")} fill={zone.color} fillOpacity={0.28} stroke={zone.color} strokeWidth={1}>
                <title>
                  Hypothèse {proposal!.key} · {zone.name}
                </title>
              </polygon>
            )),
          )}
          {poly ? (
            <>
              <polygon points={poly.map((p) => p.join(",")).join(" ")} fill="#e9c66c" fillOpacity={0.13} stroke="#ffe578" strokeWidth={3} />
              {poly.map((q, i) => (
                <g key={i}>
                  <circle cx={q[0]} cy={q[1]} r={4} fill="white" />
                  <text x={q[0] + 7} y={q[1] - 9} fill="white" stroke="#173f35" strokeWidth={3} paintOrder="stroke" fontSize={13}>
                    {site.parcel.vertexIds[i] ?? `B${i + 1}`}
                  </text>
                </g>
              ))}
            </>
          ) : (
            <>
              <circle cx={450} cy={280} r={7} fill="#ffe578" />
              <text x={465} y={275} fill="white" stroke="#173f35" strokeWidth={3} paintOrder="stroke" fontSize={14}>
                Centre seulement · contour non géoréférencé
              </text>
            </>
          )}
        </svg>
        <span className="h7-map-north">N ↑ · carte</span>
      </div>
      <p className="h7-map-credit">
        {mosaic.attribution} · image reçue à la demande ; date de prise de vue à vérifier. Limites non certifiées.
        {overlay ? ` Superposition : variante ${proposal!.key} hypothétique, non constat cartographique.` : ""}
      </p>
    </div>
  );
}

export function MapTilerCard({ projectId, step, active = null }: { projectId: string; step: ParcoursStep; active?: HarmonieProposal | null }) {
  const queryClient = useQueryClient();
  const access = useProjectAccess(projectId);
  const site = step.site!;
  const s = site.observations;
  const [status, setStatus] = useState<string>(
    s.elevation
      ? `Altimétrie conservée : ${s.elevation.points.length} points de modèle de terrain · ${s.elevation.at}. Ce n’est pas un relevé de géomètre.`
      : "Aucune observation de terrain n’est inventée. Les services externes sont appelés seulement à votre demande.",
  );
  const [mosaic, setMosaic] = useState<SatelliteMosaic | null>(null);
  const [keyDialog, setKeyDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const center = site.geo.center ? toLonLat(site.geo.center) : null;
  const points = site.geo.points ? site.geo.points.map(toLonLat) : null;

  const save = useMutation({
    mutationFn: (pts: [number, number, number][]) => api.putSiteElevation(projectId, pts),
    onSuccess: (updated) => {
      adoptStep(queryClient, projectId, updated);
      const zs = (updated.site?.observations.elevation?.points ?? []) as [number, number, number][];
      const range = updated.site?.observations.elevation?.range ?? 0;
      setStatus(`${zs.length} points reçus · amplitude ${fmt(range)} m. Modèle de terrain seulement ; ni nappe, ni écoulement, ni risque certifié. Actualisez les propositions.`);
    },
    onError: (err) => setStatus(`Collecte non réalisée : ${err instanceof ApiError && err.serverMessage ? err.serverMessage : "enregistrement refusé"}. Les valeurs précédentes restent inchangées.`),
  });

  async function showMap() {
    if (!center) {
      setStatus("Géolocalisation absente : renseignez le repère ou importez une parcelle géoréférencée.");
      return;
    }
    const key = maptilerKey();
    if (!key) {
      setStatus("Clé MapTiler absente. Utilisez Connexion MapTiler ; aucune image de contexte n’est inventée.");
      return;
    }
    setBusy(true);
    setStatus("Demande du fond satellite pour le site courant…");
    try {
      const m = await satelliteMosaic(center, points, key);
      setMosaic(m);
      setStatus(`${m.tiles.length} tuile(s) demandée(s). Une observation datée reste à consigner ; aucune conclusion automatique sur le contexte.`);
    } catch (err) {
      setStatus(`Fond non disponible : ${err instanceof Error ? err.message : String(err)}. Aucun contexte n’a été déduit.`);
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    if (!center) {
      setStatus("Géolocalisation à fournir.");
      return;
    }
    const key = maptilerKey();
    if (!key) {
      setStatus("Clé MapTiler absente : connexion requise, aucune altitude inventée.");
      return;
    }
    setBusy(true);
    const count = 1 + Math.min(points?.length ?? 0, 49);
    setStatus(`Collecte indicative : ${count} positions (comptées dans votre quota MapTiler)…`);
    try {
      const received = await collectElevationPoints(center, points, key);
      save.mutate(received);
    } catch (err) {
      setStatus(`Collecte non réalisée : ${err instanceof Error ? err.message : String(err)}. Les valeurs précédentes restent inchangées.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h7-maptiler">
      <div className="h7-actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => void showMap()}>
          Afficher le fond MapTiler
        </button>
        <button type="button" className="button-secondary" disabled={busy || save.isPending || !access.canWrite} onClick={() => void collect()}>
          Collecter centre + sommets
        </button>
        <button type="button" className="button-secondary" onClick={() => setKeyDialog((o) => !o)} aria-expanded={keyDialog}>
          Connexion MapTiler
        </button>
      </div>
      <p id="h7-map-status" className="h7-muted" role="status">
        {status}
      </p>
      {keyDialog && (
        <MapTilerKeyDialog
          onClose={() => setKeyDialog(false)}
          onReady={() => {
            setKeyDialog(false);
            setStatus("Clé disponible. Lancez « Afficher le fond MapTiler » ou « Collecter centre + sommets ».");
          }}
        />
      )}
      {mosaic && <MapView mosaic={mosaic} site={site} proposal={active ?? step.proposals.find((q) => q.retained) ?? step.proposals[0] ?? null} />}
    </div>
  );
}

/** « Collecter l’altitude indicative du centre » du bilan (flow-v62) : une position, posée sur le contexte extérieur. */
export function CenterElevationButton({
  projectId,
  center,
  onSaved,
  onStatus,
}: {
  projectId: string;
  center: LonLat | null;
  onSaved: (view: Awaited<ReturnType<typeof api.putCenterElevation>>) => void;
  onStatus: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const access = useProjectAccess(projectId);
  async function run() {
    if (!center) return;
    const key = maptilerKey();
    if (!key) {
      onStatus("Clé MapTiler absente : connectez-la dans Parcelle 00. Aucune donnée ni altitude inventée.");
      return;
    }
    setBusy(true);
    onStatus("Collecte du centre uniquement (1 position)…");
    try {
      const point = await collectCenterElevation(center, key);
      onSaved(await api.putCenterElevation(projectId, point));
    } catch (err) {
      onStatus(`Collecte non réalisée : ${err instanceof ApiError && err.serverMessage ? err.serverMessage : err instanceof Error ? err.message : String(err)}. Les hypothèses restent visibles.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="button-secondary" disabled={busy || !center || !access.canWrite} onClick={() => void run()}>
      Collecter l’altitude indicative du centre
    </button>
  );
}
