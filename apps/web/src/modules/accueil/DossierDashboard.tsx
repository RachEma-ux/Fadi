import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../../components/Icon";
import { ConflictPanel } from "../../components/ConflictPanel";
import { ApiError } from "../../lib/api";
import { dossierReconnectHref } from "../../lib/dossier-return";
import { reachability } from "../../lib/reachability";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation";
import { useDossierQueries, type DossierQueries, dateLabel, denied, resourceLabel, dossierSubtitle } from "./dossier-data";
import { completeParcoursList } from "./dossier-state";
import { useDossierSync } from "./use-dossier-sync";

export function DossierDashboard({ projectId, applicationHome = false }: { projectId: string; applicationHome?: boolean }) {
  const queries = useDossierQueries(projectId);
  const sync = useDossierSync(projectId);
  const { openProjects } = useWorkspaceNavigation();
  const [operation, setOperation] = useState<"reconnect" | "retry-project" | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const compare = searchParams.get("conflits") === "1";
  const comparison = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compare) return;
    const frame = requestAnimationFrame(() => {
      comparison.current?.focus();
      comparison.current?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [compare, projectId]);
  const project = queries.project.data;
  const connected = sync.online && sync.reachable;
  const completeSteps = completeParcoursList(queries.steps.data);
  async function recoverProject(intent: "reconnect" | "retry-project") {
    if (operation || queries.project.isFetching || !sync.online || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    setOperation(intent);setRecoveryError(null);
    try {
      if (intent === "reconnect") {
        const restored = await reachability.probeNow();
        if (!restored || reachability.get() !== "reachable" || (typeof navigator !== "undefined" && !navigator.onLine)) {
          setRecoveryError("La connexion n’est pas rétablie. Réessayez lorsque le serveur sera joignable.");
          return;
        }
        setOperation("retry-project");
      }
      const result = await queries.project.refetch();
      if (result.isError && !denied(result.error)) setRecoveryError("La lecture du dossier n’a pas pu être rétablie. Réessayez lorsque le service sera disponible.");
    } catch { setRecoveryError("La lecture du dossier n’a pas pu être rétablie. Réessayez lorsque le service sera disponible."); }
    finally { setOperation(null); }
  }
  if (!project || denied(queries.project.error)) {
    const sessionExpired = queries.project.error instanceof ApiError && queries.project.error.status === 401;
    const forbidden = denied(queries.project.error);
    const connectionUnavailable = !connected || queries.project.fetchStatus === "paused" || queries.project.error instanceof TypeError;
    const loading = !forbidden && !connectionUnavailable && queries.project.isPending;
    const busy = !!operation || queries.project.isFetching;
    const waitingLabel = operation === "reconnect" ? "Vérification de la connexion…" : operation === "retry-project" || !loading && queries.project.isFetching ? "Lecture du dossier en cours…" : loading ? "Chargement du dossier…" : null;
    return <section className="panel dossier-unavailable" aria-busy={loading || busy}>
      <h2>{applicationHome ? "Dernier dossier consulté" : "Dossier sélectionné"}</h2>
      <p id="unavailable-dossier-purpose" role={queries.project.isError ? "alert" : "status"}>{sessionExpired ? "Votre session doit être renouvelée pour consulter ce dossier." : forbidden ? "Ce dossier est introuvable ou vous n’y avez plus accès." : loading ? "Chargement du dossier…" : connectionUnavailable ? "La connexion au serveur est indisponible et aucune copie lisible de ce dossier n’est disponible sur cet appareil." : "La lecture du dossier a échoué. Aucune copie lisible n’est disponible sur cet appareil."}</p>
      <p>Aucun autre dossier n’a été sélectionné automatiquement.</p>
      {!forbidden && !sync.online && <p>Reconnectez cet appareil à un réseau pour réessayer.</p>}
      {recoveryError && <p role="alert" className="dossier-notice">{recoveryError}</p>}
      {sessionExpired ? <Link to={dossierReconnectHref(projectId)} className="button-primary" aria-describedby="unavailable-dossier-purpose">Se reconnecter</Link> : forbidden ? <Link to="/projets" className="button-primary" aria-describedby="unavailable-dossier-purpose">Retour aux projets</Link> : <button type="button" className="button-primary" disabled={loading || busy || !sync.online} aria-describedby="unavailable-dossier-purpose" onClick={() => void recoverProject(connectionUnavailable ? "reconnect" : "retry-project")}>{waitingLabel ?? (connectionUnavailable ? "Rétablir la connexion" : "Réessayer la lecture du dossier")}</button>}
      {!forbidden && <button type="button" className="button-secondary" onClick={openProjects}>Choisir un projet</button>}
      {(!forbidden || sessionExpired) && <Link to="/projets">Retour aux projets</Link>}
    </section>;
  }
  const steps = completeSteps ? queries.steps.data! : null;
  const done = steps?.filter((step) => step.status === "termine").length ?? null;
  const review = queries.review.data;
  const reservations = review ? review.issues + review.auditGaps : null;
  const programme = queries.programme.data;
  const reference = !!programme && !programme.repartition.stored && (!programme.programmeCase || programme.programmeCase.readOnly === true);
  const site = queries.steps.data?.find((s) => s.number === 1)?.site;
  const area = site?.parcel.officialArea ?? site?.parcel.area;
  const programmeArea = programme?.programmeCase?.sums.total ?? programme?.totals.baseArea;
  const stepLink = (number: number) => `/projets/${projectId}?module=parcours&etape=${number}`;
  const moduleLink = (module: string) => `/projets/${projectId}?module=${module}`;
  const reviewText = !review ? resourceLabel(queries.review, connected) : review.reviewStale ? "Revue à actualiser" : !review.reviewedAt ? "Revue non établie" : "Revue enregistrée";
  const progressText = done === null ? resourceLabel(queries.steps, connected) : `${done} / 21 étapes terminées`;
  const syncText = sync.localSaveError ? "Sauvegarde locale non confirmée" : sync.localStatus !== "ready" || sync.pending === null ? "État local indisponible" : sync.conflicts > 0 ? `${sync.conflicts} conflit(s) à examiner` : !connected ? "Connexion à rétablir" : sync.busy ? "Synchronisation en cours" : sync.pending > 0 ? `${sync.pending} modification(s) en attente` : "Aucun envoi en attente";
  return <>
    {applicationHome && <div className="dossier-section-heading"><div><h2>Dernier dossier consulté</h2><p translate="no">{project.code} — {project.name}</p></div><Link to={`/projets/${projectId}`} className="button-secondary">Ouvrir l’accueil du projet <Icon name="arrow-right" size={16} /></Link></div>}
    <div className="dossier-status-strip" aria-label="Trois suivis distincts du dossier">
      <div><span>Avancement du Parcours</span><strong>{progressText}</strong></div>
      <div><span>Revue technique</span><strong>{reviewText}</strong>{reservations !== null && <small>{reservations} point(s) d’attention calculé(s) · {review?.auditToDocument} point(s) à documenter</small>}</div>
      <div><span>Synchronisation</span><strong>{syncText}</strong><small>Les lectures et la revue sont suivies séparément.</small></div>
    </div>
    {compare && <div className="dossier-comparison" ref={comparison} tabIndex={-1}><ConflictPanel projectId={projectId} />{sync.conflicts === 0 && <p role="status">Aucun conflit à examiner dans ce dossier.</p>}</div>}
    <div className="dossier-grid">
      <section className="panel dossier-overview" data-project-id={projectId} aria-labelledby="dossier-overview-heading">
        <div className="dossier-card-heading"><h2 id="dossier-overview-heading">Vue d’ensemble</h2><p>{dossierSubtitle(queries)}</p></div>
        <figure className="dossier-preview">
          {queries.preview.data?.svg ? <div className="dossier-preview-svg" role="img" aria-label="Aperçu conceptuel du modèle de ce dossier" dangerouslySetInnerHTML={{ __html: queries.preview.data.svg }} /> : <div className="dossier-preview-placeholder"><Icon name="cube" size={38} /><p>{queries.preview.data ? "Aucun modèle dessiné pour l’instant. L’aperçu apparaîtra après les premiers éléments dans l’Atelier." : resourceLabel(queries.preview, connected)}</p></div>}
          <figcaption><span>Aperçu conceptuel</span>{queries.preview.data?.svg && <span>Généré le {dateLabel(queries.preview.data.generatedAt)} · cette date concerne uniquement l’aperçu.</span>}</figcaption>
        </figure>
        <ResourceNote query={queries.preview} connected={connected} onRetry={() => void queries.preview.refetch()} label="l’aperçu" />
        <dl className="dossier-facts">
          <div><dt>Parcelle</dt><dd>{!queries.steps.data ? resourceLabel(queries.steps, connected) : area == null || area <= 0 ? "Parcelle non renseignée" : `${Math.round(area).toLocaleString()} m²`}</dd></div>
          <div><dt>{reference ? "Programme de référence" : "Programme cible"}</dt><dd>{programmeArea == null ? resourceLabel(queries.programme, connected) : `${Math.round(programmeArea).toLocaleString()} m²`}{reference && <small>Non enregistré</small>}</dd></div>
          <div><dt>Parcours</dt><dd>{done === null ? resourceLabel(queries.steps, connected) : `${done} / 21 étapes`}</dd></div>
        </dl>
        <ResourceReadings queries={queries} connected={connected} />

      </section>
      {applicationHome ? <aside className="panel workspace-dossier-aside"><Icon name="folder" size={26} /><h2>Votre dossier de reprise</h2><p>Cette carte reprend la vue d’ensemble du dernier dossier consulté. Les informations et les actions concernent ce même dossier.</p><p>Choisissez un autre projet dans la barre latérale pour ouvrir son accueil et le retrouver ici à votre retour.</p><button type="button" className="button-secondary" onClick={openProjects}>Choisir un projet</button></aside> : <aside className="panel dossier-journey" aria-labelledby="dossier-journey-heading"><h2 id="dossier-journey-heading">Mon parcours</h2><p>21 étapes pour structurer le projet</p>
        {steps ? <><p>{progressText}</p><progress aria-label="Étapes terminées" max={21} value={done ?? 0} /><ol className="dossier-phases">{[...new Set(steps.map((s) => s.phase))].map((phase) => {
          const own = steps.filter((s) => s.phase === phase);
          const finished = own.filter((s) => s.status === "termine").length;
          return <li key={phase}><details><summary><span className={`phase-dot${finished === own.length ? " done" : finished ? " started" : ""}`} aria-hidden="true" /><span>{phase}</span><small>{finished}/{own.length}</small></summary><ul>{own.map((s) => <li key={s.number}><Link to={stepLink(s.number)}><span>{String(s.number).padStart(2, "0")} — {s.title}</span><small>{s.status === "termine" ? "Terminée" : s.status === "en-cours" ? "En cours" : "À faire"}{s.stale || s.staleRetainedCount > 0 ? " · À réexaminer" : ""}</small></Link></li>)}</ul></details></li>;
        })}</ol></> : <p role="status">{resourceLabel(queries.steps, connected)}</p>}
        <ResourceNote query={queries.steps} connected={connected} onRetry={() => void queries.steps.refetch()} label="l’avancement" />
        <Link className="dossier-all-steps" to={moduleLink("parcours")}>Voir les 21 étapes <Icon name="arrow-right" size={16} /></Link>
        <Link to={`${stepLink(11)}&bilan=1`} className="dossier-review-link">Consulter la revue</Link>
      </aside>}
    </div>
    {!applicationHome && <><section className="dossier-modules" aria-labelledby="dossier-modules-heading"><h2 id="dossier-modules-heading">Modules du projet</h2><div>{([{ module: "projets-sources", icon: "site", title: "Explorer la parcelle", description: "Site, limites et contexte" }, { module: "programmation", icon: "programme", title: "Organiser le programme", description: reference ? "Référence · non enregistrée" : "Espaces, surfaces et besoins" }, { module: "atelier", icon: "cube", title: "Concevoir dans l’Atelier", description: "Plans, volumes et détails" }] as { module: string; icon: IconName; title: string; description: string }[]).map((item) => <Link key={item.module} className="panel" to={moduleLink(item.module)}><Icon name={item.icon} size={26} /><span><strong>{item.title}</strong><small>{item.description}</small></span><Icon name="arrow-right" size={18} /></Link>)}</div></section>
    <div className="dossier-resources"><section className="panel"><h2>Programme du projet</h2>{programme ? <><p>{reference ? "Programme de référence · Non enregistré" : programme.typeLabel}</p>{programme.programmeCase && <p>{programme.programmeCase.spaceCount} fiches · {Math.round(programme.programmeCase.sums.total).toLocaleString()} m²</p>}<Link to={moduleLink("programmation")}>Ouvrir le programme</Link></> : <p role="status">{resourceLabel(queries.programme, connected)}</p>}<ResourceNote query={queries.programme} connected={connected} onRetry={() => void queries.programme.refetch()} label="le programme" /></section>
      <section className="panel"><h2>Documents du dossier</h2>{queries.documents.data ? <><p>{queries.documents.data.documents.filter((d) => d.produced !== null).length} document(s) produit(s)</p><ul className="dossier-documents">{queries.documents.data.documents.filter((d) => d.produced).slice(0, 3).map((d) => <li key={d.kind}><Icon name="file" size={18} /><span>{d.label}<small>{d.freshness === "perime" ? "À actualiser" : "Production enregistrée"}{d.produced ? ` · ${dateLabel(d.produced.producedAt)}` : ""}</small></span></li>)}</ul>{!queries.documents.data.documents.some((d) => d.produced) && <p>Aucun document produit pour l’instant.</p>}<Link to={moduleLink("documents")}>Consulter les documents</Link></> : <p role="status">{resourceLabel(queries.documents, connected)}</p>}<ResourceNote query={queries.documents} connected={connected} onRetry={() => void queries.documents.refetch()} label="les documents" /></section></div></>}
  </>;
}

type ReadableQuery = DossierQueries[keyof DossierQueries];
export function ResourceNote({ query, connected, onRetry, label }: { query: ReadableQuery; connected: boolean; onRetry: () => void; label: string }) {
  return <div className="resource-note"><span>{resourceLabel(query, connected)}{query.data !== undefined && query.dataUpdatedAt ? ` · ${dateLabel(query.dataUpdatedAt)}` : ""}</span>{(query.isError || !!query.data && (!connected || query.isStale)) && <button type="button" className="link-button" disabled={!connected || query.isFetching} onClick={onRetry}>Actualiser {label}</button>}</div>;
}
export function ResourceReadings({ queries, connected }: { queries: DossierQueries; connected: boolean }) {
  const entries: [string, ReadableQuery][] = [["Dossier et droits", queries.project], ["Parcelle et avancement", queries.steps], ["Programme", queries.programme], ["Revue technique", queries.review], ["Documents", queries.documents], ["Aperçu", queries.preview]];
  return <details className="dossier-readings"><summary>Dates des informations</summary><p>Chaque date concerne uniquement l’information indiquée. Une lecture réussie ne confirme pas la synchronisation des modifications.</p><dl>{entries.map(([label, query]) => <div key={label} data-resource={label}><dt>{label}</dt><dd><ResourceNote query={query} connected={connected} onRetry={() => void query.refetch()} label={label.toLowerCase()} /></dd></div>)}</dl></details>;
}
