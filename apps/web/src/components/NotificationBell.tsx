/**
 * Cloche de l'en-tête : les notifications dans l'application (accès reçus à
 * un projet, commentaires des autres, réservations d'édition en cours),
 * relues par l'API des données datées — aucun courriel n'est envoyé. Le
 * compteur dit combien sont postérieures à votre dernière consultation ;
 * ouvrir la liste les marque consultées.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type NotificationItem } from "../lib/api";
import { useAuth } from "../lib/auth-context";

const KIND_LABEL: Record<NotificationItem["kind"], string> = { acces: "Accès", commentaire: "Commentaire", reservation: "Réservation", modification: "Modification", verrou: "Verrou", peremption: "Document périmé" };

function targetOf(n: NotificationItem): string {
  if (n.kind === "commentaire") return n.stepNumber ? `/projets/${n.projectId}?module=parcours&etape=${n.stepNumber}` : `/projets/${n.projectId}?module=collaboration`;
  if (n.kind === "reservation") return `/projets/${n.projectId}?module=collaboration`;
  if (n.kind === "modification" || n.kind === "verrou") return `/projets/${n.projectId}?module=atelier`;
  if (n.kind === "peremption") return `/projets/${n.projectId}?module=documents`;
  return `/projets/${n.projectId}`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Relues toutes les minutes (comme la réservation d'édition) : une invitation reçue se voit sans recharger.
  const query = useQuery({ queryKey: ["notifications"], queryFn: api.listNotifications, enabled: !!user, refetchInterval: 60_000 });
  const seen = useMutation({ mutationFn: api.markNotificationsSeen, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }) });
  const items = query.data?.items ?? [];
  const unread = items.filter((n) => n.unread).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
    if (next && unread > 0) seen.mutate();
  }

  return (
    <div className="notification-bell" ref={root}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={unread ? `Notifications : ${unread} non lue(s)` : "Notifications"} onClick={toggle}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="notification-popover">
          {query.isLoading && <p role="status">Chargement…</p>}
          {query.isError && <p role="alert">Notifications non disponibles sans réseau.</p>}
          {query.data && items.length === 0 && <p>Aucune notification pour l’instant.</p>}
          {items.length > 0 && (
            <ul className="notification-list">
              {items.map((n) => (
                <li key={n.id} className={n.unread ? "notification-unread" : undefined} data-kind={n.kind}>
                  <span className="h7-chip">{KIND_LABEL[n.kind]}</span>
                  <Link to={targetOf(n)} onClick={() => setOpen(false)}>
                    {n.text}
                  </Link>
                  <small>{new Date(n.at).toLocaleString("fr-FR")}</small>
                </li>
              ))}
            </ul>
          )}
          <p className="notification-foot">Dans l’application seulement : aucun courriel n’est envoyé.</p>
        </div>
      )}
    </div>
  );
}
