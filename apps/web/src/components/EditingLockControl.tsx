/**
 * Réservation d'édition (verrou optionnel « un seul éditeur actif »), dans
 * l'en-tête du projet : un éditeur ou le propriétaire réserve l'édition pour
 * 30 minutes, la prolonge (automatiquement tant que le projet reste ouvert)
 * ou rend la main ; le propriétaire peut libérer la réservation d'un autre.
 * Pendant une réservation, les autres comptes lisent et commentent (le
 * serveur refuse leurs écritures : 423 avec le motif et l'échéance).
 */
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useProjectAccess } from "../lib/access";
import { LOCALE } from "../lib/i18n";

const RENEW_EVERY_MS = 5 * 60_000;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });

export function EditingLockControl({ projectId, onMessage }: { projectId: string; onMessage: (text: string | null) => void }) {
  const queryClient = useQueryClient();
  const access = useProjectAccess(projectId);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
  };
  const reserve = useMutation({
    mutationFn: () => api.reserveEditing(projectId),
    onSuccess: (r) => {
      onMessage(null);
      refresh();
      void r;
    },
    onError: (err) => {
      onMessage(err instanceof ApiError && err.serverMessage ? err.serverMessage : "La réservation n’a pas pu être enregistrée.");
      refresh();
    },
  });
  const release = useMutation({
    mutationFn: () => api.releaseEditing(projectId),
    onSuccess: () => {
      onMessage(null);
      refresh();
    },
    onError: (err) => onMessage(err instanceof ApiError && err.serverMessage ? err.serverMessage : "La réservation n’a pas pu être libérée."),
  });
  // Tant que vous détenez la réservation et que le projet reste ouvert, elle est prolongée d'elle-même.
  useEffect(() => {
    if (!access.holdsLock) return;
    const t = setInterval(() => reserve.mutate(), RENEW_EVERY_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.holdsLock, projectId]);

  if (!access.mayEdit) return null;
  const busy = reserve.isPending || release.isPending;
  if (!access.lock) {
    return (
      <span className="editing-lock editing-lock-free">
        <button
          type="button"
          className="sync-indicator-retry"
          disabled={busy}
          onClick={() => reserve.mutate()}
          title="Vous seul pourrez modifier le projet pendant 30 minutes (prolongeables) ; les autres liront et commenteront."
        >
          Réserver l’édition
        </button>
      </span>
    );
  }
  if (access.holdsLock) {
    return (
      <span className="editing-lock editing-lock-mine" data-expires={access.lock.expiresAt}>
        Édition réservée par vous jusqu’à {hhmm(access.lock.expiresAt)}
        <button type="button" className="sync-indicator-retry" disabled={busy} onClick={() => reserve.mutate()}>
          Prolonger
        </button>
        <button type="button" className="sync-indicator-retry" disabled={busy} onClick={() => release.mutate()}>
          Rendre la main
        </button>
      </span>
    );
  }
  return (
    <span className="editing-lock editing-lock-other" data-expires={access.lock.expiresAt}>
      Édition réservée par {access.lock.email} jusqu’à {hhmm(access.lock.expiresAt)}
      {access.isOwner && (
        <button type="button" className="sync-indicator-retry" disabled={busy} onClick={() => release.mutate()} title="Propriétaire : libère la réservation de cette personne.">
          Libérer
        </button>
      )}
    </span>
  );
}
