import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError, type HistoryEvent } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { LOCALE } from "../../lib/i18n";
import { reachability } from "../../lib/reachability";
import { useOnline, useReachable } from "../../components/SyncIndicator";
import { Dialog } from "./Dialog";
import { EMPTY_HISTORY_FILTERS, HISTORY_AREAS, HISTORY_TIME_ZONE, UNKNOWN_HISTORY_AUTHOR, filterHistory, historyDestination, invalidHistoryPeriod, type HistoryFilters } from "./history-view-model";
import "./history.css";

const dateTime = (value: string) => new Date(value).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: HISTORY_TIME_ZONE });

/** Le dialogue reste une lecture : seul un lien explicite ouvre le dossier ou le module concerné. */
export function HistoryDialog({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const { user } = useAuth();
  return <Dialog title={projectId ? "Historique du Dossier" : "Historique de la plateforme"} onClose={onClose} className="fadi-history-dialog">
    <HistoryContent key={`${user?.id ?? "anonymous"}:${projectId ?? "platform"}`} projectId={projectId} userId={user?.id} onClose={onClose} />
  </Dialog>;
}

function HistoryContent({ projectId, userId, onClose }: { projectId?: string; userId?: string; onClose: () => void }) {
  const prefix = useId();
  const online = useOnline();
  const reachable = useReachable();
  const [filters, setFilters] = useState<HistoryFilters>({ ...EMPTY_HISTORY_FILTERS });
  const [probing, setProbing] = useState(false);
  const query = useQuery({
    queryKey: ["history", userId, projectId ?? "platform"],
    queryFn: ({ signal }) => api.getHistory(projectId, signal),
    enabled: !!userId,
    staleTime: 0,
    retry: false,
  });
  const denied = query.error instanceof ApiError && [401, 403, 404].includes(query.error.status);
  // Un refus d'accès explicite masque aussi l'ancien relevé mis en cache.
  const data = denied ? undefined : query.data;
  const events = data?.events ?? [];
  const rows = filterHistory(events, filters);
  const invalidPeriod = invalidHistoryPeriod(filters);
  const offline = !online || !reachable || query.fetchStatus === "paused";
  const busy = probing || query.isFetching;
  const filtered = Object.values(filters).some(Boolean);
  const authors = [...new Map(events.filter((event) => event.authorId).map((event) => [event.authorId!, event.authorLabel ?? event.authorId!])).entries()].sort((a, b) => a[1].localeCompare(b[1], LOCALE));
  const areas = [...new Set(events.map((event) => event.kind))].sort((a, b) => (HISTORY_AREAS[a] ?? a).localeCompare(HISTORY_AREAS[b] ?? b, LOCALE));
  const projects = [...new Map(events.map((event) => [event.project.id, event.project])).values()].sort((a, b) => a.code.localeCompare(b.code, LOCALE));
  // Une actualisation peut faire sortir une valeur du relevé borné : garder le filtre visible, jamais le changer en « tous ».
  const missingAuthor = !!filters.author && filters.author !== UNKNOWN_HISTORY_AUTHOR && !authors.some(([id]) => id === filters.author);
  const missingArea = !!filters.area && !areas.includes(filters.area);
  const missingProject = !!filters.project && !projects.some((project) => project.id === filters.project);
  const setFilter = (key: keyof HistoryFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  async function refresh() {
    if (busy) return;
    if (offline) {
      setProbing(true);
      try {
        if (await reachability.probeNow()) await query.refetch();
      } finally {
        setProbing(false);
      }
    } else await query.refetch();
  }

  return <div className="fadi-history-body">
    {data?.project && <p className="fadi-history-project" translate="no">{data.project.code} — {data.project.name}</p>}
    <p>{projectId ? "Les événements datés disponibles pour ce dossier." : "Les créations et enregistrements serveur des dossiers auxquels vous avez accès."}</p>
    <p id={`${prefix}-zone`}>Dates et filtres : heure de Zurich (Europe/Zurich).</p>
    <div className="fadi-history-actions">
      <button type="button" onClick={() => void refresh()} disabled={busy}>{busy ? "Lecture en cours…" : offline ? "Vérifier la connexion" : "Actualiser l’historique"}</button>
      <button type="button" onClick={() => setFilters({ ...EMPTY_HISTORY_FILTERS })} disabled={!filtered}>Effacer les filtres</button>
    </div>
    {denied ? <div className="fadi-history-message" role="alert">
      <p>{query.error instanceof ApiError && query.error.status === 401 ? "Votre session doit être renouvelée pour lire l’historique." : "Ce dossier n’existe plus ou vous n’y avez plus accès."}</p>
      <Link to={query.error instanceof ApiError && query.error.status === 401 ? "/connexion?renouveler=1" : "/projets"} onClick={onClose}>{query.error instanceof ApiError && query.error.status === 401 ? "Se connecter" : "Ouvrir les projets"}</Link>
    </div> : <>
      <div className="fadi-history-reading" role="status">
        {data && <p>Dernière lecture réussie : <time dateTime={data.readAt}>{dateTime(data.readAt)}</time>.</p>}
        {offline ? <p>{data ? "Copie déjà lue. La connexion est nécessaire pour vérifier les événements plus récents et les droits d’accès." : "Historique indisponible hors connexion : aucune copie n’a encore été lue sur cet appareil."}</p>
          : query.isFetching ? <p>{data ? "Actualisation en cours. Le relevé précédent reste affiché." : "Chargement de l’historique…"}</p>
          : query.isError ? <p>{data ? "L’actualisation a échoué. Le relevé précédent reste affiché ; réessayez pour lire les événements plus récents." : "L’historique n’a pas pu être chargé. Réessayez."}</p>
          : null}
      </div>
      {data && <>
        <p className="fadi-history-count" aria-live="polite" aria-atomic="true">{invalidPeriod ? "La date de fin doit être postérieure ou égale à la date de début." : <>{rows.length} événement(s) affiché(s) parmi {events.length} chargé(s).</>}</p>
        {invalidPeriod && <p id={`${prefix}-period-error`} className="fadi-history-error">Corrigez les dates pour afficher les résultats.</p>}
        <div className="fadi-history-table-region" role="region" aria-label="Tableau de l’historique, défilement horizontal si nécessaire" tabIndex={0}>
          <table className="fadi-history-table">
            <caption className="sr-only">Événements disponibles, du plus récent au plus ancien. Les filtres portent sur le relevé chargé.</caption>
            <thead><tr>
              <th scope="col"><span>Date et heure</span><label htmlFor={`${prefix}-from`}>Depuis · inclus</label><input id={`${prefix}-from`} type="datetime-local" step={60} value={filters.from} onChange={(event) => setFilter("from", event.target.value)} aria-invalid={invalidPeriod || undefined} aria-describedby={`${prefix}-zone${invalidPeriod ? ` ${prefix}-period-error` : ""}`} /><label htmlFor={`${prefix}-to`}>Jusqu’à · inclus</label><input id={`${prefix}-to`} type="datetime-local" step={60} value={filters.to} onChange={(event) => setFilter("to", event.target.value)} aria-invalid={invalidPeriod || undefined} aria-describedby={`${prefix}-zone${invalidPeriod ? ` ${prefix}-period-error` : ""}`} /></th>
              <th scope="col"><label htmlFor={`${prefix}-author`}>Auteur</label><select id={`${prefix}-author`} value={filters.author} onChange={(event) => setFilter("author", event.target.value)}><option value="">Tous les auteurs</option>{authors.map(([id, label]) => <option key={id} value={id} translate="no">{label}</option>)}{(events.some((event) => !event.authorId) || filters.author === UNKNOWN_HISTORY_AUTHOR) && <option value={UNKNOWN_HISTORY_AUTHOR}>Auteur non enregistré</option>}{missingAuthor && <option value={filters.author}>Auteur sélectionné absent du relevé actuel</option>}</select></th>
              {!projectId && <th scope="col"><label htmlFor={`${prefix}-project`}>Dossier</label><select id={`${prefix}-project`} value={filters.project} onChange={(event) => setFilter("project", event.target.value)}><option value="">Tous les dossiers</option>{projects.map((project) => <option key={project.id} value={project.id} translate="no">{project.code} — {project.name}</option>)}{missingProject && <option value={filters.project}>Dossier sélectionné absent du relevé actuel</option>}</select></th>}
              <th scope="col"><label htmlFor={`${prefix}-area`}>Domaine</label><select id={`${prefix}-area`} value={filters.area} onChange={(event) => setFilter("area", event.target.value)}><option value="">Tous les domaines</option>{areas.map((area) => <option key={area} value={area}>{HISTORY_AREAS[area] ?? area}</option>)}{missingArea && <option value={filters.area}>{HISTORY_AREAS[filters.area] ?? filters.area}</option>}</select></th>
              <th scope="col"><label htmlFor={`${prefix}-change`}>Changement enregistré</label><input id={`${prefix}-change`} type="search" value={filters.change} onChange={(event) => setFilter("change", event.target.value)} placeholder="Filtrer les changements" /></th>
            </tr></thead>
            <tbody>{rows.map((event) => <HistoryRow key={event.id} event={event} platform={!projectId} onClose={onClose} />)}</tbody>
          </table>
        </div>
        {!invalidPeriod && !rows.length && <p className="fadi-history-message">{filtered ? "Aucun événement chargé ne correspond à ces filtres." : "Aucun événement dans les données actuellement disponibles."}</p>}
        <div className="fadi-history-coverage">
          <p>{data.coverage.notice}</p>
          {data.coverage.truncated && <p>Ce relevé est limité. Des événements plus anciens ou hors des sources chargées peuvent ne pas être affichés.</p>}
          {data.coverage.omittedInvalidDates > 0 && <p>Des données sans date exploitable ne peuvent pas être placées dans ce relevé.</p>}
          <details><summary>Sources et limites de ce relevé</summary><ul>{data.coverage.sources.map((source) => <li key={source}>{source}</li>)}</ul><p>Au plus {data.coverage.limit} événements. Les filtres ne recherchent que dans ces événements.</p></details>
        </div>
      </>}
    </>}
  </div>;
}

function HistoryRow({ event, platform, onClose }: { event: HistoryEvent; platform: boolean; onClose: () => void }) {
  const destination = historyDestination(event);
  return <tr>
    <td><time dateTime={event.at}>{dateTime(event.at)}</time></td>
    <td>{event.authorId ? <span translate="no">{event.authorLabel ?? event.authorId}</span> : "Auteur non enregistré"}</td>
    {platform && <td translate="no">{event.project.code}<br />{event.project.name}</td>}
    <td>{HISTORY_AREAS[event.kind] ?? event.kind}</td>
    <td><strong translate="no">{event.label}</strong><details className="fadi-history-detail"><summary>Voir les détails</summary>
      {event.detail ? <p className="fadi-history-detail-text" translate="no">{event.detail}</p> : <p>Aucun détail supplémentaire enregistré.</p>}
      <dl><dt>Origine de l’entrée</dt><dd>{event.source === "ledger" ? "Lot accepté dans le journal de l’Atelier" : event.source === "record" ? "Donnée datée encore conservée" : "État daté conservé, susceptible d’être remplacé"}</dd>
        {event.revision !== null && <><dt>Révision enregistrée</dt><dd>{event.revision}</dd></>}
        {event.stepNumber !== null && <><dt>Étape concernée</dt><dd>{String(event.stepNumber).padStart(2, "0")}</dd></>}
      </dl>
      <p>Le lien ouvre les informations actuelles du dossier.</p><Link to={destination.to} onClick={onClose}>{destination.label}</Link>
    </details></td>
  </tr>;
}
