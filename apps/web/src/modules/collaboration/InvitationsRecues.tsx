/**
 * Invitations reçues (Issue #262, phase 3, OP-D2 a) : un compte existant invité à un projet le voit dans l'application,
 * en plus du courriel, et l'accepte ou la décline ici. Rien n'est accordé avant l'acceptation ; le serveur revalide tout
 * (invitant toujours habilité, échéances, fiche visée, participation). Après acceptation : entrée dans le projet, avec le
 * travail en attente. Règle d'or : « Accepter » et « Décliner » ont chacune leur icône, leur barre (la carte de
 * l'invitation) et leur raccourci, actif quand le focus est dans la carte.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { accountApi, ROLE_LABEL, type ReceivedInvitation } from "../../lib/api";
import { apiMessage } from "../../components/comptes/ComptesUI";
import { LOCALE } from "../../lib/i18n";
import { declenche, propsRaccourci } from "./commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "./IconeCollaboration";
import { rolesLisibles } from "./participants-api";

export const RECEIVED_INVITATIONS_KEY = ["invitations-recues"] as const;

/** Message d'entrée dans le projet : le travail en attente du compte, s'il y en a. */
export function noticeApresAcceptation(code: string, work?: { openObservations: number; openTasks: number }): string {
  const base = `Invitation acceptée : vous participez maintenant à ${code}.`;
  if (!work || (!work.openObservations && !work.openTasks)) return `${base} Aucun travail ne vous attend pour l’instant.`;
  return `${base} Travail en attente : ${work.openObservations} observation(s) dont vous êtes responsable, ${work.openTasks} tâche(s) à faire.`;
}

const date = (iso: string) => new Date(iso).toLocaleDateString(LOCALE);

export function InvitationsRecues() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: RECEIVED_INVITATIONS_KEY, queryFn: accountApi.receivedInvitations, refetchInterval: 60_000 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: (inv: ReceivedInvitation) => accountApi.acceptInvitationById(inv.id),
    onSuccess: (r, inv) => {
      setError(null);
      void queryClient.invalidateQueries();
      if (r.projectId) void navigate(`/projets/${r.projectId}`, { state: { notice: noticeApresAcceptation(inv.projectCode, r.pendingWork) } });
    },
    onError: (err) => setError(apiMessage(err, "L’invitation n’a pas pu être acceptée.")),
  });
  const decline = useMutation({
    mutationFn: (inv: ReceivedInvitation) => accountApi.declineInvitationById(inv.id),
    onSuccess: (_r, inv) => {
      setError(null);
      setNotice(`Invitation à ${inv.projectCode} déclinée : aucun accès n’a été donné.`);
      void queryClient.invalidateQueries({ queryKey: RECEIVED_INVITATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => setError(apiMessage(err, "L’invitation n’a pas pu être déclinée.")),
  });
  const list = query.data?.invitations ?? [];
  if (!list.length && !notice) return null;
  const verified = query.data?.emailVerified ?? true;
  const busy = accept.isPending || decline.isPending;
  return (
    <section id="invitations-recues" aria-labelledby="received-invitations-heading" className="received-invitations panel" data-invitations-recues>
      <h2 id="received-invitations-heading">Invitations reçues</h2>
      <p className="panel-sub">Une invitation est une proposition : rien n’est partagé tant que vous ne l’acceptez pas.</p>
      {!verified && <p className="h7-muted" role="note">Votre adresse n’est pas encore vérifiée : acceptez depuis le lien reçu par courriel, ou vérifiez d’abord votre adresse.</p>}
      <ul className="project-list">
        {list.map((inv) => (
          <li
            key={inv.id}
            data-invitation-recue={inv.projectCode}
            onKeyDown={(e) => {
              // Règle d'or : Ctrl+Alt+Maj+\ accepte, Ctrl+Alt+Maj+` décline l'invitation de la carte où se trouve le focus.
              if (busy || !verified) return;
              if (declenche(e, "accepter-invitation")) { e.preventDefault(); accept.mutate(inv); }
              else if (declenche(e, "decliner-invitation")) { e.preventDefault(); decline.mutate(inv); }
            }}
          >
            <strong translate="no">{inv.projectCode}</strong> — <span translate="no">{inv.projectName}</span>
            <small className="invitation-recue-detail">
              <span>{`De la part de `}<span translate="no">{inv.invitedBy || "—"}</span></span>
              <span>{`Accès proposé : ${ROLE_LABEL[inv.baseRole]}`}</span>
              <span>{`Rôles : ${rolesLisibles(inv.roles)}`}</span>
              <span>{`Invitation valable jusqu’au ${date(inv.expiresAt)}`}</span>
              <span>{inv.accessExpiresAt ? `Accès jusqu’au ${date(inv.accessExpiresAt)}` : "Accès sans échéance"}</span>
            </small>
            <span className="h7-actions">
              <button type="button" className="button-primary" disabled={busy || !verified} {...propsRaccourci("accepter-invitation")} onClick={() => accept.mutate(inv)}>
                <IconeCollaboration commande="accepter-invitation" /> Accepter l’invitation <RaccourciCollaboration commande="accepter-invitation" />
              </button>
              <button type="button" className="button-secondary" disabled={busy || !verified} {...propsRaccourci("decliner-invitation")} onClick={() => decline.mutate(inv)}>
                <IconeCollaboration commande="decliner-invitation" /> Décliner <RaccourciCollaboration commande="decliner-invitation" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {notice && <p className="h7-muted" role="status">{notice}</p>}
      {error && <p className="h7-error" role="alert">{error}</p>}
    </section>
  );
}
