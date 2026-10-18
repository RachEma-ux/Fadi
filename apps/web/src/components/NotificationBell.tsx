/**
 * Cloche de l'en-tête : deux catégories distinctes.
 * - Notifications de collaboration : non lues jusqu'à leur consultation.
 * - Alertes du dossier : actives tant que le fait qui les cause subsiste.
 * Consulter une alerte ne la marque jamais comme résolue.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type NotificationItem } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useProjectAccess, lockedHint, READ_ONLY_HINT } from "../lib/access";
import { LOCALE } from "../lib/i18n";
import { useDossierQueries, denied, dateLabel } from "../modules/accueil/dossier-data";
import { useDossierSync } from "../modules/accueil/use-dossier-sync";
import { dossierAlerts, type DossierAlert, type DossierAlertCommand } from "../modules/accueil/dossier-alerts";
import { cheminVarianteStudio } from "../modules/studio/routes-studio";

const KIND_LABEL: Record<NotificationItem["kind"], string> = { acces: "Accès", commentaire: "Commentaire", reservation: "Réservation", modification: "Modification", verrou: "Verrou", peremption: "Document périmé", "commentaire-studio": "Commentaire Studio" };

function targetOf(n: NotificationItem): string {
  // Commentaire d'une variante Studio : la variante, panneau des commentaires ouvert.
  if (n.kind === "commentaire-studio" && n.studio) return cheminVarianteStudio(n.projectId, n.studio.studyId, n.studio.variantId, null, { commentaires: true });
  if (n.kind === "commentaire") return n.stepNumber ? "/projets/" + n.projectId + "?module=parcours&etape=" + n.stepNumber : "/projets/" + n.projectId + "?module=collaboration";
  if (n.kind === "reservation") return "/projets/" + n.projectId + "?module=collaboration";
  if (n.kind === "modification" || n.kind === "verrou") return "/projets/" + n.projectId + "?module=atelier";
  if (n.kind === "peremption") return "/projets/" + n.projectId + "?module=documents";
  return "/projets/" + n.projectId;
}

/** Le badge des pages globales continue de compter seulement les notifications non lues. */
export function NotificationBell({ projectId }: { projectId?: string }) {
  return projectId ? <ScopedBell key={projectId} projectId={projectId} /> : <BellView alerts={[]} />;
}

function ScopedBell({ projectId }: { projectId: string }) {
  // Le panneau ne charge ni dessin SVG ni catalogue : les lectures disponibles
  // réutilisent les mêmes clés de cache que l'accueil du projet.
  const queries = useDossierQueries(projectId, { lightweight: true });
  const access = useProjectAccess(projectId);
  const sync = useDossierSync(projectId);
  const [busyCommand, setBusyCommand] = useState<DossierAlertCommand | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const project = queries.project.data;
  const connected = sync.online && sync.reachable;
  const firstStale = queries.steps.data?.find((s) => s.stale || s.staleRetainedCount > 0)?.number;
  const alerts = dossierAlerts({
    projectId,
    code: project?.code ?? "Dossier",
    projectAvailable: !!project && !denied(queries.project.error),
    accessKnown: access.known,
    canWrite: access.canWrite,
    accessReason: access.lock && !access.holdsLock && access.mayEdit ? lockedHint(access.lock) : READ_ONLY_HINT,
    projectReadFailed: queries.project.isError,
    projectLastRead: queries.project.dataUpdatedAt ? dateLabel(queries.project.dataUpdatedAt) : undefined,
    localSaveFailed: !!sync.localSaveError,
    connected,
    online: sync.online,
    conflicts: sync.conflicts,
    stepsReadFailed: queries.steps.isError,
    hasSteps: !!queries.steps.data,
    programmeReadFailed: queries.programme.isError,
    hasProgramme: !!queries.programme.data,
    reviewReadFailed: queries.review.isError,
    hasReview: !!queries.review.data,
    reviewStale: !!queries.review.data?.reviewStale,
    staleStep: firstStale,
  });
  async function recover(command: DossierAlertCommand) {
    if (busyCommand) return;
    setBusyCommand(command);
    setFeedback(null);
    try {
      let ok = false;
      switch (command) {
        case "retry-project": ok = !(await queries.project.refetch()).isError; break;
        case "retry-steps": ok = !(await queries.steps.refetch()).isError; break;
        case "retry-programme": ok = !(await queries.programme.refetch()).isError; break;
        case "retry-review": ok = !(await queries.review.refetch()).isError; break;
        case "retry-local": ok = await sync.retryLocal(); break;
        case "reconnect": ok = await sync.reconnect(); break;
      }
      setFeedback(ok ? "Opération effectuée. Les autres alertes restent actives si nécessaire." : "L’opération n’a pas abouti. Les informations conservées et les autres alertes restent disponibles.");
    } catch {
      setFeedback("La reprise a échoué. Aucun problème n’a été marqué comme résolu automatiquement.");
    } finally {
      setBusyCommand(null);
    }
  }
  return <BellView key={projectId} alerts={alerts} projectCode={project?.code} onRecover={recover} busyCommand={busyCommand} feedback={feedback} />;
}

function BellView({
  alerts, projectCode, onRecover, busyCommand, feedback,
}: {
  alerts: DossierAlert[];
  projectCode?: string;
  onRecover?: (command: DossierAlertCommand) => Promise<void>;
  busyCommand?: DossierAlertCommand | null;
  feedback?: string | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const query = useQuery({ queryKey: ["notifications"], queryFn: api.listNotifications, enabled: !!user, refetchInterval: 60_000 });
  const seen = useMutation({ mutationFn: api.markNotificationsSeen, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }) });
  const items = query.data?.items ?? [];
  const unread = items.filter((n) => n.unread).length;
  const active = alerts.length;
  const total = unread + active;
  const ariaLabel = active > 0 ? "Notifications : " + unread + " non lue(s), " + active + " alerte(s) du dossier" : unread > 0 ? "Notifications : " + unread + " non lue(s)" : "Notifications";

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Les notifications reçues sont consultées. Les alertes du dossier ne
    // diminuent jamais simplement parce que la cloche a été ouverte.
    if (next && unread > 0) seen.mutate();
  }

  return <div className="notification-bell" ref={root}>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} title={ariaLabel} onClick={toggle} data-alert-count={active} data-unread-count={unread}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {total > 0 && <span className="notification-count" aria-hidden="true">{total > 9 ? "9+" : total}</span>}
    </button>
    {open && <div role="dialog" aria-label={projectCode ? "Notifications et alertes du dossier " + projectCode : "Notifications"} className="notification-popover">
      {projectCode && <section className="notification-alerts" aria-label="Alertes du dossier">
        <h2>Alertes du dossier ({active})</h2>
        {active === 0 ? <p>Aucune alerte active pour ce dossier.</p> : <ul className="notification-list notification-alert-list">
          {alerts.map((alert) => {
            const action = alert.action;
            return <li key={alert.id} data-alert-id={alert.id}>
              <strong>{alert.title}</strong>
              <p>{alert.text}</p>
              {action && ("href" in action ? <Link to={action.href} onClick={() => setOpen(false)}>{action.label}</Link> : <button type="button" className="link-button" disabled={!!busyCommand} onClick={() => void onRecover?.(action.command)}>{busyCommand === action.command ? "Reprise en cours…" : action.label}</button>)}
            </li>;
          })}
        </ul>}
        {feedback && <p className="notification-recovery" role="status">{feedback}</p>}
      </section>}
      <section className="notification-incoming" aria-label="Notifications de collaboration">
        {projectCode && <h2>Notifications ({unread} non lue(s))</h2>}
        {query.isLoading && <p role="status">Chargement…</p>}
        {query.isError && <p role="alert">Notifications non disponibles sans réseau.</p>}
        {query.data && items.length === 0 && <p>Aucune notification pour l’instant.</p>}
        {items.length > 0 && <ul className="notification-list">{items.map((n) => <li key={n.id} className={n.unread ? "notification-unread" : undefined} data-kind={n.kind}>
          <span className="h7-chip">{KIND_LABEL[n.kind]}</span>
          <Link to={targetOf(n)} onClick={() => setOpen(false)}>{n.text}</Link>
          <small>{new Date(n.at).toLocaleString(LOCALE)}</small>
        </li>)}</ul>}
      </section>
      <p className="notification-foot">Les alertes restent affichées jusqu’à la résolution de leur cause. Aucun courriel n’est envoyé.</p>
    </div>}
  </div>;
}
