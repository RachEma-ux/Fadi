/**
 * Invitation à un projet (Issue #262, phase 3, OP-D2 a) : plus aucun ajout direct — toute adresse, compte existant
 * compris, reçoit une invitation à accepter par l'identité visée. Le propriétaire choisit la fiche (contact de
 * l'annuaire, ou fiche créée à l'envoi), les rôles à la portée projet, l'échéance de l'invitation et celle de l'accès
 * (indépendantes), puis lit l'**aperçu de l'accès résultant** avant l'envoi : l'envoi n'est possible qu'après un aperçu
 * des valeurs saisies, sans motif bloquant. Le serveur refait tous les contrôles à l'envoi et à l'acceptation.
 * Règle d'or : « Aperçu de l'accès » a son icône, sa barre (le formulaire d'invitation) et son raccourci Alt+Maj+4.
 */
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ROLE_LABEL, type BusinessRole, type InvitationCreated, type InvitationInput, type InvitationPreview, type ProjectMember } from "../../lib/api";
import { apiMessage } from "../../components/comptes/ComptesUI";
import { LOCALE } from "../../lib/i18n";
import { declenche, propsRaccourci } from "./commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "./IconeCollaboration";
import { BUSINESS_ROLE_LABEL, participantsApi, rolesLisibles } from "./participants-api";

const EXTRA_ROLES: readonly BusinessRole[] = ["relecteur", "coordinateur", "approbateur", "diffuseur"];
const date = (iso: string) => new Date(iso).toLocaleDateString(LOCALE);

const TARGET_LABEL: Record<InvitationPreview["target"]["kind"], string> = {
  membre: "compte déjà membre : son rôle sera changé directement",
  participation: "fiche existante de l’annuaire du projet",
  "nouvelle-fiche": "nouvelle fiche créée à l’envoi (contact, sans droit avant l’acceptation)",
};

export function InvitationProjet({ projectId, onSent }: { projectId: string; onSent: (r: ProjectMember | InvitationCreated) => void }) {
  const [email, setEmail] = useState("");
  const [base, setBase] = useState<"lecteur" | "concepteur">("lecteur");
  const [extras, setExtras] = useState<BusinessRole[]>([]);
  const [participationId, setParticipationId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [days, setDays] = useState(7);
  const [accessUntil, setAccessUntil] = useState("");
  const [preview, setPreview] = useState<{ key: string; value: InvitationPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Contacts de l'annuaire (participations `contact` de personnes) proposables comme fiche visée.
  const participants = useQuery({ queryKey: ["participants", projectId], queryFn: () => participantsApi.list(projectId) });
  const contacts = (participants.data?.participants ?? []).filter((p) => p.kind === "personne" && p.status === "contact" && !p.person?.erased);

  const input: InvitationInput = useMemo(() => ({
    email: email.trim(),
    roles: [{ role: base }, ...extras.map((role) => ({ role }))],
    participationId: participationId || null,
    displayName: displayName.trim() || null,
    accessExpiresAt: accessUntil || null,
    invitationDays: days,
  }), [email, base, extras, participationId, displayName, accessUntil, days]);
  const key = JSON.stringify(input);
  const current = preview?.key === key ? preview.value : null;

  const look = useMutation({
    mutationFn: () => api.previewInvitation(projectId, input),
    onSuccess: (r) => { setError(null); setPreview({ key, value: r.preview }); },
    onError: (err) => { setPreview(null); setError(apiMessage(err, "L’aperçu n’a pas pu être calculé.")); },
  });
  const send = useMutation({
    mutationFn: () => api.inviteMember(projectId, input),
    onSuccess: (r) => {
      setError(null); setPreview(null); setEmail(""); setDisplayName(""); setParticipationId(""); setExtras([]); setAccessUntil("");
      onSent(r);
    },
    onError: (err) => setError(apiMessage(err, "L’invitation n’a pas pu être enregistrée.")),
  });
  const busy = look.isPending || send.isPending;
  const canPreview = !!email.trim() && !busy;
  const canSend = !!current && !current.blocking && !busy;

  return (
    <form
      className="members-invite"
      data-invitation-form
      onSubmit={(e: FormEvent) => { e.preventDefault(); if (canSend) send.mutate(); }}
      onKeyDown={(e) => {
        // Règle d'or : Alt+Maj+4 calcule l'aperçu de l'accès depuis n'importe quel champ du formulaire.
        if (declenche(e, "apercu-invitation")) { e.preventDefault(); if (canPreview) look.mutate(); }
      }}
    >
      <label>
        Adresse à inviter
        <input type="email" value={email} required maxLength={254} placeholder="prenom.nom@exemple.fr" autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Rôle au projet
        <select value={base} onChange={(e) => setBase(e.target.value as "lecteur" | "concepteur")}>
          <option value="lecteur">Lecteur — lire et commenter</option>
          <option value="concepteur">Concepteur — modifier le projet et exporter</option>
        </select>
      </label>
      <fieldset className="invitation-extra-roles">
        <legend>Rôles complémentaires (portée projet)</legend>
        {EXTRA_ROLES.map((r) => (
          <label key={r} className="h7-checkbox">
            <input type="checkbox" checked={extras.includes(r)} onChange={(e) => setExtras((xs) => (e.target.checked ? [...xs, r] : xs.filter((x) => x !== r)))} />
            {BUSINESS_ROLE_LABEL[r]}
          </label>
        ))}
      </fieldset>
      {contacts.length > 0 && (
        <label>
          Fiche de l’annuaire (facultatif)
          <select value={participationId} onChange={(e) => setParticipationId(e.target.value)}>
            <option value="">Trouver par l’adresse, ou créer la fiche</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.person?.displayName ?? c.person?.account?.email ?? c.id}</option>)}
          </select>
        </label>
      )}
      <label>
        Nom de la personne (fiche nouvelle, facultatif)
        <input type="text" value={displayName} maxLength={200} autoComplete="off" onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        Invitation valable (jours)
        <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))} />
      </label>
      <label>
        Accès jusqu’au (facultatif)
        <input type="date" value={accessUntil} onChange={(e) => setAccessUntil(e.target.value)} />
      </label>
      <div className="h7-actions">
        <button type="button" className="button-secondary" disabled={!canPreview} {...propsRaccourci("apercu-invitation")} onClick={() => look.mutate()}>
          <IconeCollaboration commande="apercu-invitation" /> Aperçu de l’accès <RaccourciCollaboration commande="apercu-invitation" />
        </button>
        <button type="submit" className="button-primary" disabled={!canSend}>Envoyer l’invitation</button>
      </div>
      {!current && <p className="h7-muted">Lisez l’aperçu de l’accès avant l’envoi. Rien n’est accordé avant que la personne accepte l’invitation, compte existant compris.</p>}
      {current && (
        <div className="invitation-apercu" data-invitation-apercu role="region" aria-label="Aperçu de l’accès">
          <dl>
            <dt>Adresse</dt><dd translate="no">{current.email}</dd>
            <dt>Compte</dt><dd>{current.accountExists ? "compte existant : il acceptera depuis le lien ou sa notification" : "aucun compte : il le créera depuis le lien"}</dd>
            <dt>Fiche visée</dt><dd>{TARGET_LABEL[current.target.kind]}</dd>
            <dt>Invitation en attente</dt><dd>{current.pendingInvitation ? `oui : elle sera renvoyée (même invitation, nouveau lien), valable jusqu’au ${date(current.invitationExpiresAt)}` : "aucune"}</dd>
            <dt>Rôles proposés</dt><dd>{rolesLisibles(current.roles)}</dd>
            <dt>Accès après acceptation</dt>
            <dd data-apercu-acces>{current.access ? `${ROLE_LABEL[current.access.role]} · export ${current.access.canExport ? "oui" : "non"} · approbation ${current.access.canApprove ? "oui" : "non"} · diffusion ${current.access.canPublish ? "oui" : "non"}` : "aucun"}</dd>
            <dt>Échéance de l’invitation</dt><dd>{date(current.invitationExpiresAt)}</dd>
            <dt>Échéance de l’accès</dt><dd>{current.accessExpiresAt ? date(current.accessExpiresAt) : "aucune"}</dd>
          </dl>
          {current.warnings.map((w) => <p key={w} className="h7-muted">{w}</p>)}
          {current.blocking && <p className="h7-error" role="alert" data-apercu-bloquant>{current.blocking}</p>}
        </div>
      )}
      {error && <p className="h7-error" role="alert">{error}</p>}
    </form>
  );
}
