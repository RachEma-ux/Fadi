/**
 * Étape 01 — les parties propres au site du panneau Harmonie, telles que
 * `h7-app` les compose dans le prototype :
 *
 * - `SiteHero` : le schéma d'organisation du terrain (SVG `svgSite`) de la
 *   proposition active, sa légende (`siteLegend`) et l'export SVG ;
 * - `SiteDataFold` : « Données du site, hypothèses et connexion MapTiler » —
 *   faits de la parcelle, géolocalisation, formulaire des observations
 *   (`save-site`) et repère géographique saisi (`geographic`).
 *
 * Le schéma est calculé par `@parcours/domain-model` sur le contour local
 * servi par l'API ; rien n'est dessiné à partir d'une parcelle inventée.
 */
import { useState, type FormEvent } from "react";
import { SITE_OBSERVATION_LABELS, SITE_SVG_EMPTY, fmtFr, siteLegend, siteSvg } from "@parcours/domain-model";
import type { HarmonieProposal, ParcoursStep, SiteObservationsInput, SiteView } from "../../lib/api";

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function siteSketch(site: SiteView, q: HarmonieProposal | null): string | null {
  if (!q?.zoning) return null;
  return siteSvg({ local: site.parcel.local, area: site.parcel.area, vertexIds: site.parcel.vertexIds, crs: site.parcel.crs, approachStatus: site.observations.approachStatus }, q.zoning);
}

export function SiteHero({ site, active }: { site: SiteView; active: HarmonieProposal | null }) {
  const svg = siteSketch(site, active);
  const legend = active?.zoning ? siteLegend(active.zoning) : [];
  return (
    <div className="h7-site-hero">
      <div className="h7-site-svg">
        {svg ? (
          // SVG produit par le domaine à partir des données du projet (identifiants de bornes échappés).
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="h7-callout warn">{SITE_SVG_EMPTY}</p>
        )}
      </div>
      <div>
        <span className="h7-kicker">ORGANISATION DU TERRAIN</span>
        <h3>{active?.title ?? "Schéma à préparer"}</h3>
        {legend.length > 0 && (
          <>
            <div className="h7-zones">
              {legend.map((row) => (
                <div key={row.index}>
                  <span className="h7-zone-key" style={{ "--zone": row.color } as React.CSSProperties}>
                    {row.index}
                  </span>
                  <span>
                    {row.name}
                    <strong>
                      {fmtFr(row.area)} m² · {fmtFr(row.share, 1)} %
                    </strong>
                  </span>
                </div>
              ))}
            </div>
            <p className="h7-muted">
              Ces surfaces décrivent des zones d’intention. Le « secteur d’implantation à étudier » n’est ni une emprise autorisée, ni une dalle, ni une surface
              intérieure.
            </p>
          </>
        )}
        <button type="button" className="button-secondary" disabled={!svg} onClick={() => svg && active && download(`Harmonie_Site_${active.key}_V7.svg`, "image/svg+xml", svg)}>
          Exporter ce schéma SVG
        </button>
      </div>
    </div>
  );
}

export function SiteDataFold({
  step,
  onSave,
  pending,
  error,
  open,
  onToggle,
}: {
  step: ParcoursStep;
  onSave: (input: SiteObservationsInput) => void;
  pending: boolean;
  error: string | null;
  /** État du pli, conservé par le panneau pour survivre à la régénération après enregistrement. */
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const site = step.site!;
  const s = site.observations;
  const ids = site.parcel.vertexIds;
  const n = site.parcel.vertexCount;
  const [frontageEdge, setFrontageEdge] = useState<string>(s.frontageEdge === null ? "" : String(s.frontageEdge));
  const [approachStatus, setApproachStatus] = useState(s.approachStatus);
  const [priority, setPriority] = useState(s.priority);
  const [frontContext, setFrontContext] = useState(s.frontContext);
  const [backContext, setBackContext] = useState(s.backContext);
  const [source, setSource] = useState(s.source);
  const [note, setNote] = useState(s.note);
  const [longitude, setLongitude] = useState(s.geographic ? String(s.geographic.longitude) : "");
  const [latitude, setLatitude] = useState(s.geographic ? String(s.geographic.latitude) : "");
  const [geoSource, setGeoSource] = useState(s.geographic?.source ?? "");

  const base = (): SiteObservationsInput => ({
    frontageEdge: frontageEdge === "" ? null : Number(frontageEdge),
    approachStatus,
    priority,
    frontContext,
    backContext,
    source,
    note,
  });

  function saveSite(e: FormEvent) {
    e.preventDefault();
    onSave(base());
  }

  function saveGeographic() {
    const lon = Number(longitude);
    const lat = Number(latitude);
    onSave({ ...base(), geographic: longitude.trim() === "" && latitude.trim() === "" ? null : { longitude: lon, latitude: lat, source: geoSource } });
  }

  return (
    <details className="h7-fold" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>Données du site, hypothèses et connexion MapTiler</summary>
      <div className="h7-fold-body">
        <div className="h7-facts">
          <div>
            Parcelle<strong>{site.parcel.parcelNumber || "À renseigner"}</strong>
          </div>
          <div>
            Contour calculé<strong>{fmtFr(site.parcel.area)} m²</strong>
          </div>
          <div>
            Contenance source<strong>{fmtFr(site.parcel.officialArea, 0)} m²</strong>
          </div>
          <div>
            Géolocalisation<strong>{site.geo.center ? `${fmtFr(site.geo.center.lon, 6)} / ${fmtFr(site.geo.center.lat, 6)}` : "À renseigner"}</strong>
          </div>
        </div>
        <p className="h7-muted">{site.geo.source}. Coordonnées affichées : longitude / latitude. Ni visite ni lecture satellite automatique.</p>
        <form className="h7-form" onSubmit={saveSite}>
          <label>
            Côté d’approche étudié
            <select value={frontageEdge} onChange={(e) => setFrontageEdge(e.target.value)}>
              <option value="">Non documenté · repère provisoire</option>
              {Array.from({ length: n }, (_, i) => (
                <option key={i} value={String(i)}>
                  {ids[i] || "B" + (i + 1)} → {ids[(i + 1) % n] || "B" + (((i + 1) % n) + 1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nature de l’approche
            <select value={approachStatus} onChange={(e) => setApproachStatus(e.target.value as typeof approachStatus)}>
              {SITE_OBSERVATION_LABELS.approachStatus.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priorité du scénario
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              {SITE_OBSERVATION_LABELS.priority.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contexte côté approche
            <select value={frontContext} onChange={(e) => setFrontContext(e.target.value as typeof frontContext)}>
              {SITE_OBSERVATION_LABELS.frontContext.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contexte à l’arrière
            <select value={backContext} onChange={(e) => setBackContext(e.target.value as typeof backContext)}>
              {SITE_OBSERVATION_LABELS.backContext.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source / date / portée
            <input value={source} maxLength={1000} placeholder="Photo, relevé, lecture MapTiler datée ou scénario explicite" onChange={(e) => setSource(e.target.value)} />
          </label>
          <label className="wide">
            Observation ou hypothèse de contexte
            <textarea value={note} maxLength={6000} rows={3} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="h7-callout">
            Un scénario saisi n’est pas une observation. Ni bruit, ni vents, ni sol, ni risque d’inondation ne sont déduits d’une simple image. L’eau éventuelle ne
            justifie aucun bassin automatique.
          </p>
          <div className="h7-actions">
            <button type="submit" className="button-primary" disabled={pending}>
              Enregistrer ces données
            </button>
          </div>
          {error && (
            <p className="h7-error" role="alert">
              {error}
            </p>
          )}
          <p className="h7-muted" role="status">
            {s.elevation
              ? `Altimétrie conservée : ${s.elevation.points.length} points de modèle de terrain · ${s.elevation.at}. Ce n’est pas un relevé de géomètre.`
              : "Aucune observation de terrain n’est inventée. Les services externes sont appelés seulement à votre demande. Fond MapTiler et altimétrie : à connecter dans l’outil Parcelle ci-dessus."}
          </p>
        </form>
        <details className="h7-fold">
          <summary>Repère géographique du centre — si la conversion manque</summary>
          <div className="h7-form">
            <label>
              Longitude WGS84
              <input type="number" min={-180} max={180} step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </label>
            <label>
              Latitude WGS84
              <input type="number" min={-85} max={85} step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </label>
            <label className="wide">
              Source de localisation
              <input value={geoSource} maxLength={500} onChange={(e) => setGeoSource(e.target.value)} />
            </label>
            <div className="h7-actions">
              <button type="button" className="button-secondary" disabled={pending} onClick={saveGeographic}>
                Enregistrer le repère
              </button>
            </div>
            <p className="h7-muted">Un point de centre ne géoréférence pas à lui seul le contour. La conversion du CRS source reste prioritaire.</p>
          </div>
        </details>
      </div>
    </details>
  );
}
