/**
 * Module Collaboration — accès et partage (propriétaire, votre rôle, membres
 * invités par leur adresse : lecteur ou éditeur, droits vérifiés par le
 * serveur à chaque requête), état de synchronisation du modèle (révision,
 * écritures), journal des révisions relu depuis les dates portées par les
 * données, et fil de commentaires du projet (par étape ou général). Rien
 * n'est simulé : ce qui n'existe pas (verrou d'édition, résolution assistée
 * des conflits) est annoncé tel quel.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { accountApi, api, ApiError, canComment, ROLE_LABEL, type CommentAudience, type MemberAffectation, type MemberRole, type ProjectComment, type ProjectMember } from "../../lib/api";
import { useProjectAccess } from "../../lib/access";
import { useOnline } from "../../components/SyncIndicator";
import { apiMessage, ConfirmDialog, CopyLink } from "../../components/comptes/ComptesUI";
import { MUTATION_KEYS, adoptComment, type CommentVars } from "../../lib/mutations";
import { LOCALE } from "../../lib/i18n";
import { cheminVarianteStudio } from "../studio/routes-studio";
import { COMMANDES_COLLABORATION, declenche, propsRaccourci, type CommandeCollaboration } from "./commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "./IconeCollaboration";

const pad2 = (n: number) => String(n).padStart(2, "0");
const KIND_LABEL: Record<string, string> = {
  projet: "Projet",
  harmonie: "Harmonie",
  programme: "Programme",
  modele: "Modèle",
  parcelle: "Parcelle",
  revue: "Revue",
  maptiler: "MapTiler",
  document: "Document",
  commentaire: "Commentaire",
};

/**
 * Fil de commentaires (projet entier ou une étape) : liste en fils (réponses rattachées à leur commentaire d'origine), ajout, réponse, suppression par l'auteur.
 * Audience (écart E1) : un nouveau commentaire est réservé à l'équipe (propriétaire et éditeurs) sauf « Visible par les lecteurs » ;
 * l'auteur ou le propriétaire change l'audience d'un fil. Le serveur filtre ce que chacun reçoit : un lecteur n'a jamais un fil de l'équipe.
 */
export function CommentThread({ projectId, stepNumber, comments, compact = false }: { projectId: string; stepNumber: number | null; comments: ProjectComment[]; compact?: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [visibleToReaders, setVisibleToReaders] = useState(false);
  // Accès support (D-2) : lecture seule, sans commentaire — ni formulaire, ni bouton « Répondre ».
  const access = useProjectAccess(projectId);
  const mayComment = canComment(access.role);
  // Propriétaire et éditeurs choisissent l'audience ; un lecteur écrit toujours pour tout le projet.
  const inTeam = access.known && (access.role === "proprietaire" || access.role === "editeur");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
  };
  const add = useMutation({
    mutationKey: MUTATION_KEYS.comment,
    mutationFn: (v: CommentVars) => api.addComment(v.projectId, v.body, v.stepNumber, v.parentId ?? null, null, v.audience),
    onSuccess: (created, v) => {
      // Afficher uniquement le commentaire réellement accepté par l'API, puis relire les fils après l'écriture
      // (une lecture partie avant la publication est annulée, `adoptComment`).
      if (v.parentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else {
        setDraft("");
        setVisibleToReaders(false);
      }
      setError(null);
      void adoptComment(queryClient, created, v);
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Le commentaire n’a pas pu être enregistré."),
  });
  const audience = useMutation({
    mutationFn: ({ id, next }: { id: string; next: CommentAudience }) => api.setCommentAudience(projectId, id, next),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "L’audience n’a pas pu être modifiée."),
  });
  // Audience d'un fil : bouton, icône propre et raccourci (règle d'or, `commandes-collaboration.ts`).
  const mayToggle = (c: ProjectComment) => !c.parentId && inTeam && (c.mine || access.isOwner);
  const bascule = (c: ProjectComment): CommandeCollaboration => (c.audience === "projet" ? "reserver-equipe" : "rendre-visible");
  const toggle = (c: ProjectComment) => { if (!audience.isPending) audience.mutate({ id: c.id, next: c.audience === "projet" ? "equipe" : "projet" }); };
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteComment(projectId, id),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Suppression refusée."),
  });
  // Fils : les commentaires de premier niveau (ordre reçu), leurs réponses par ordre chronologique.
  const roots = comments.filter((c) => !c.parentId || !comments.some((x) => x.id === c.parentId));
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id).sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));
  const meta = (c: ProjectComment) => (
    <div className="comment-meta">
      <b>{c.authorEmail}</b> · {new Date(c.createdAt).toLocaleString(LOCALE)}
      {c.stepNumber !== null && stepNumber === null && !c.parentId && (
        <>
          {" · "}
          <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}`}>étape {pad2(c.stepNumber)}</Link>
        </>
      )}
      {c.atelierRevision != null && !c.parentId && (
        <>
          {" · "}
          <Link to={`/projets/${projectId}?module=atelier`}>Atelier, révision {c.atelierRevision}</Link>
        </>
      )}
      {!c.parentId && (
        <>
          {" · "}
          <span className="h7-chip comment-audience" data-audience={c.audience}>
            {c.audience === "projet" ? "Visible par les lecteurs" : "Équipe"}
          </span>
          {mayToggle(c) && (
            <button
              type="button"
              className="comment-audience-toggle"
              data-audience-toggle={c.id}
              disabled={audience.isPending}
              title={c.audience === "projet" ? "Réserver ce fil au propriétaire et aux éditeurs" : "Rendre ce fil lisible par les lecteurs du projet"}
              {...propsRaccourci(bascule(c))}
              onClick={() => toggle(c)}
            >
              <IconeCollaboration commande={c.audience === "projet" ? "reserver-equipe" : "rendre-visible"} />
              {c.audience === "projet" ? "Réserver à l’équipe" : "Rendre visible aux lecteurs"}
              <RaccourciCollaboration commande={bascule(c)} />
            </button>
          )}
        </>
      )}
      {c.mine && (
        <button type="button" className="comment-delete" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
          Supprimer
        </button>
      )}
    </div>
  );
  return (
    <div className={`comment-thread${compact ? " compact" : ""}`}>
      {comments.length ? (
        <ul className="comment-list">
          {roots.map((c) => (
            <li
              key={c.id}
              className="comment"
              data-comment={c.id}
              onKeyDown={(e) => {
                // Règle d'or : Alt+Maj+2 bascule l'audience du fil où se trouve le focus (même commande que le bouton).
                if (mayToggle(c) && declenche(e, bascule(c))) {
                  e.preventDefault();
                  toggle(c);
                }
              }}
            >
              {meta(c)}
              <p>{c.body}</p>
              {repliesOf(c.id).length > 0 && (
                <ul className="comment-replies">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id} className="comment comment-reply" data-comment={r.id} data-parent={c.id}>
                      {meta(r)}
                      <p>{r.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              {replyTo === c.id ? (
                <form
                  className="comment-form comment-reply-form"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (replyDraft.trim()) add.mutate({ projectId, body: replyDraft.trim(), stepNumber: c.stepNumber, parentId: c.id });
                  }}
                >
                  <label>
                    Répondre à {c.authorEmail}
                    <textarea value={replyDraft} maxLength={4000} rows={2} autoFocus onChange={(e) => setReplyDraft(e.target.value)} />
                  </label>
                  <div className="h7-actions">
                    <button type="submit" className="button-primary" disabled={(add.isPending && !add.isPaused) || !replyDraft.trim()}>
                      Publier la réponse
                    </button>
                    <button type="button" className="button-secondary" onClick={() => setReplyTo(null)}>
                      Annuler
                    </button>
                  </div>
                </form>
              ) : mayComment ? (
                <button type="button" className="comment-reply-button" onClick={() => setReplyTo(c.id)}>
                  Répondre
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="h7-muted">Aucun commentaire{stepNumber !== null ? " sur cette étape" : ""}.</p>
      )}
      {mayComment ? <form
        className="comment-form"
        onKeyDown={(e) => {
          // Règle d'or : Alt+Maj+1 coche ou décoche « Visible par les lecteurs » depuis le formulaire.
          if (inTeam && declenche(e, "visible-lecteurs")) {
            e.preventDefault();
            setVisibleToReaders((v) => !v);
          }
        }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (draft.trim()) add.mutate({ projectId, body: draft.trim(), stepNumber, ...(inTeam ? { audience: visibleToReaders ? "projet" : "equipe" } : {}) });
        }}
      >
        <label>
          {stepNumber !== null ? `Commentaire sur l'étape ${pad2(stepNumber)}` : "Nouveau commentaire"}
          <textarea value={draft} maxLength={4000} rows={compact ? 2 : 3} placeholder="Question, remarque, décision à tracer…" onChange={(e) => setDraft(e.target.value)} />
        </label>
        {inTeam ? (
          <label className="comment-audience-choice">
            <input type="checkbox" checked={visibleToReaders} onChange={(e) => setVisibleToReaders(e.target.checked)} data-comment-audience {...propsRaccourci("visible-lecteurs")} />
            <IconeCollaboration commande="visible-lecteurs" />
            Visible par les lecteurs
            <RaccourciCollaboration commande="visible-lecteurs" />
            <small className="h7-muted"> — sinon réservé au propriétaire et aux éditeurs</small>
          </label>
        ) : (
          <p className="h7-muted">Votre commentaire sera lisible par tous les membres du projet.</p>
        )}
        <div className="h7-actions">
          <button type="submit" className="button-primary" disabled={(add.isPending && !add.isPaused) || !draft.trim()}>
            Publier le commentaire
          </button>
          {add.isPaused && <span className="h7-muted">Commentaire en attente du réseau : il sera publié au retour de la connexion.</span>}
        </div>
      </form> : <p className="h7-muted">Accès support en lecture seule : les commentaires ne sont pas ouverts.</p>}
      {error && (
        <p className="h7-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Pli « Commentaires (n) » d'une étape du Parcours. */
export function StepComments({ projectId, stepNumber }: { projectId: string; stepNumber: number }) {
  const query = useQuery({ queryKey: ["comments", projectId, stepNumber], queryFn: () => api.listComments(projectId, stepNumber) });
  const [open, setOpen] = useState(false);
  const comments = query.data ?? [];
  return (
    <details className="fold-card step-comments" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Commentaires ({comments.length})</summary>
      <div className="fold-card-body">
        <CommentThread projectId={projectId} stepNumber={stepNumber} comments={comments} compact />
      </div>
    </details>
  );
}

const ROLE_HELP: Record<MemberRole, string> = {
  lecteur: "lit le dossier et les commentaires ouverts aux lecteurs, commente ; exporte si vous le lui accordez",
  editeur: "lit, commente et modifie (saisies, arbitrages, programme, Atelier, sources)",
};

/**
 * Affectations de la ligne du membre (écarts E5 et E10) : chacune est une commande avec son icône et son raccourci
 * (règle d'or). Approbateur et Diffuseur ouvrent l'approbation et la diffusion Studio ; le gardien du contenu est une
 * responsabilité déclarée, sans aucun droit.
 */
const AFFECTATIONS: readonly { cle: MemberAffectation; commande: CommandeCollaboration; aide: string; oui: string; non: string }[] = [
  { cle: "approbateur", commande: "approbateur", aide: "approuve ou refuse les publications Studio", oui: "est maintenant approbateur : il peut approuver ou refuser les publications Studio.", non: "n’est plus approbateur." },
  { cle: "diffuseur", commande: "diffuseur", aide: "diffuse ou retire les publications Studio approuvées", oui: "est maintenant diffuseur : il peut diffuser ou retirer les publications Studio approuvées.", non: "n’est plus diffuseur." },
  { cle: "gardien", commande: "gardien-contenu", aide: "responsabilité déclarée, sans droit supplémentaire", oui: "est déclaré gardien du contenu (aucun droit supplémentaire).", non: "n’est plus déclaré gardien du contenu." },
];
const COMMANDE_LIBELLE = (c: CommandeCollaboration) => COMMANDES_COLLABORATION[c].libelle;
const affectationsDe = (m: ProjectMember) => m.affectations ?? { approbateur: false, diffuseur: false, gardien: false };

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError && err.serverMessage ? err.serverMessage : fallback);

/** Partage du projet : membres et rôles. Le propriétaire invite, change, retire ; un membre peut quitter le projet. */
export function MembersPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["members", projectId], queryFn: () => api.listMembers(projectId) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("lecteur");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
  };
  const invite = useMutation({
    mutationFn: () => api.inviteMember(projectId, email.trim(), role),
    onSuccess: (m) => {
      setEmail("");
      setError(null);
      if ("invitation" in m) {
        // Adresse sans compte : invitation nominative (UM-3) ; lien à transmettre si le courriel n'a pas pu partir (D-1).
        setInviteLink(m.mail.link ?? null);
        setNotice(m.mail.queued
          ? `Invitation ${m.resent ? "renvoyée" : "envoyée"} à ${m.invitation.email} : elle pourra rejoindre le projet comme ${m.invitation.projectRole ? ROLE_LABEL[m.invitation.projectRole] : "lecteur"} après avoir créé son compte.`
          : `Invitation ${m.resent ? "renouvelée" : "créée"} pour ${m.invitation.email}.`);
      } else {
        setInviteLink(null);
        setNotice(`${m.email} a maintenant accès au projet comme ${ROLE_LABEL[m.role]}.`);
      }
      refresh();
    },
    onError: (err) => setError(errorText(err, "L’invitation n’a pas pu être enregistrée.")),
  });
  const change = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: MemberRole }) => api.setMemberRole(projectId, userId, next),
    onSuccess: (m) => {
      setError(null);
      setNotice(`${m.email} est maintenant ${ROLE_LABEL[m.role]}.`);
      refresh();
    },
    onError: (err) => setError(errorText(err, "Le rôle n’a pas pu être modifié.")),
  });
  const exportRight = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: boolean }) => api.setMemberExport(projectId, userId, next),
    onSuccess: (m) => {
      setError(null);
      setNotice(m.canExport ? `${m.email} peut maintenant exporter et télécharger le contenu du projet.` : `${m.email} ne peut plus exporter ni télécharger le contenu du projet.`);
      refresh();
    },
    onError: (err) => setError(errorText(err, "Le droit d’export n’a pas pu être modifié.")),
  });
  const affect = useMutation({
    mutationFn: ({ userId, cle, next }: { userId: string; cle: MemberAffectation; next: boolean }) => api.setMemberAffectation(projectId, userId, cle, next),
    onSuccess: (m, { cle, next }) => {
      setError(null);
      const a = AFFECTATIONS.find((x) => x.cle === cle)!;
      setNotice(`${m.email} ${next ? a.oui : a.non}`);
      refresh();
    },
    onError: (err) => setError(errorText(err, "L’affectation n’a pas pu être modifiée.")),
  });
  const transfer = useMutation({
    mutationFn: (userId: string) => api.transferOwnership(projectId, userId),
    onSuccess: (v) => {
      setError(null);
      setNotice(`${v.owner.email} est maintenant propriétaire du projet ; vous en restez éditeur.`);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => setError(errorText(err, "Le transfert n’a pas pu être enregistré.")),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(projectId, userId),
    onSuccess: (_v, userId) => {
      setError(null);
      if (userId === query.data?.you.userId) {
        // Vous avez quitté le projet : il n'est plus accessible.
        void queryClient.invalidateQueries({ queryKey: ["projects"] });
        void navigate("/projets", { state: { notice: "Vous avez quitté le projet partagé." } });
        return;
      }
      setNotice("Accès retiré. Sa réservation d’édition et ses verrous ont été libérés ; ses observations et tâches ouvertes restent à réattribuer.");
      refresh();
    },
    onError: (err) => setError(errorText(err, "Le retrait n’a pas pu être enregistré.")),
  });
  const cancelInvitation = useMutation({
    mutationFn: (id: string) => accountApi.cancelProjectInvitation(projectId, id),
    onSuccess: () => { setNotice("Invitation annulée : le lien ne donne plus accès."); refresh(); },
    onError: (err) => setError(errorText(err, "L’annulation n’a pas pu être enregistrée.")),
  });
  if (query.isLoading) return <p role="status">Lecture des membres…</p>;
  if (!query.data) return <p role="alert">Impossible de lire les membres du projet.</p>;
  const v = query.data;
  const isOwner = v.you.role === "proprietaire";
  const busy = invite.isPending || change.isPending || remove.isPending || transfer.isPending || exportRight.isPending || affect.isPending;
  return (
    <div className="members-panel">
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Membres du projet">
      <table className="programme-table members-table">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Rôle</th>
            <th>Export</th>
            <th>Affectations</th>
            <th>Depuis</th>
            <th>{isOwner ? "Action" : ""}</th>
          </tr>
        </thead>
        <tbody>
          <tr data-member="owner">
            <td>
              <b className="collab-email">{v.owner.email}</b>
              {v.owner.userId === v.you.userId ? " (vous)" : ""}
            </td>
            <td>propriétaire</td>
            <td>oui</td>
            <td>gardien du projet ; approuve et diffuse</td>
            <td>—</td>
            <td />
          </tr>
          {v.members.map((m) => (
            <tr
              key={m.userId}
              data-member={m.email}
              onKeyDown={(e) => {
                // Règle d'or : Alt+Maj+3 accorde ou retire l'export du lecteur de la ligne où se trouve le focus.
                if (isOwner && m.role === "lecteur" && !busy && declenche(e, "export-lecteur")) {
                  e.preventDefault();
                  exportRight.mutate({ userId: m.userId, next: !m.canExport });
                }
                // Alt+Maj+4 / 5 / 6 : Approbateur, Diffuseur, Gardien du contenu du membre de la ligne.
                for (const a of AFFECTATIONS) {
                  if (isOwner && !busy && declenche(e, a.commande)) {
                    e.preventDefault();
                    affect.mutate({ userId: m.userId, cle: a.cle, next: !affectationsDe(m)[a.cle] });
                  }
                }
              }}
            >
              <td>
                <span className="collab-email">{m.email}</span>
                {m.userId === v.you.userId ? " (vous)" : ""}
                <small className="h7-muted"> · invité par {m.invitedBy}</small>
              </td>
              <td>
                {isOwner ? (
                  <select aria-label={`Rôle de ${m.email}`} value={m.role} disabled={busy} onChange={(e) => change.mutate({ userId: m.userId, next: e.target.value as MemberRole })}>
                    <option value="lecteur">lecteur</option>
                    <option value="editeur">éditeur</option>
                  </select>
                ) : (
                  ROLE_LABEL[m.role]
                )}
              </td>
              <td data-member-export={m.canExport ? "oui" : "non"}>
                {isOwner && m.role === "lecteur" ? (
                  <label className="member-export">
                    <input type="checkbox" checked={m.canExport} disabled={busy} aria-label={`Export accordé à ${m.email}`} {...propsRaccourci("export-lecteur")} onChange={(e) => exportRight.mutate({ userId: m.userId, next: e.target.checked })} />
                    <IconeCollaboration commande="export-lecteur" />
                    {m.canExport ? "accordé" : "non accordé"}
                    <RaccourciCollaboration commande="export-lecteur" />
                  </label>
                ) : m.role === "editeur" ? (
                  "oui"
                ) : m.canExport ? (
                  "accordé"
                ) : (
                  "non"
                )}
              </td>
              <td data-member-affectations={AFFECTATIONS.filter((a) => affectationsDe(m)[a.cle]).map((a) => a.cle).join(" ")}>
                {isOwner ? (
                  <span className="member-affectations">
                    {AFFECTATIONS.map((a) => (
                      <label key={a.cle} className="member-export" title={a.aide}>
                        <input type="checkbox" checked={affectationsDe(m)[a.cle]} disabled={busy} aria-label={`${COMMANDE_LIBELLE(a.commande)} : ${m.email}`} {...propsRaccourci(a.commande)} onChange={(e) => affect.mutate({ userId: m.userId, cle: a.cle, next: e.target.checked })} />
                        <IconeCollaboration commande={a.commande} />
                        {COMMANDE_LIBELLE(a.commande)}
                        <RaccourciCollaboration commande={a.commande} />
                      </label>
                    ))}
                  </span>
                ) : (
                  // Un libellé par élément : chacun se traduit seul (D-163), jamais une liste jointe absente du dictionnaire.
                  <span className="member-affectations">
                    {AFFECTATIONS.filter((a) => affectationsDe(m)[a.cle]).map((a) => <span key={a.cle}>{COMMANDE_LIBELLE(a.commande)}</span>)}
                    {!AFFECTATIONS.some((a) => affectationsDe(m)[a.cle]) && "—"}
                  </span>
                )}
              </td>
              <td>{new Date(m.createdAt).toLocaleDateString(LOCALE)}</td>
              <td>
                {isOwner ? (
                  <>
                    <button type="button" className="button-secondary" disabled={busy} onClick={() => remove.mutate(m.userId)}>
                      Retirer
                    </button>{" "}
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      title="Ce compte devient propriétaire (partage, libération, suppression) ; vous restez éditeur."
                      onClick={() => {
                        if (confirm(`Transférer la propriété du projet à ${m.email} ? Vous en resterez éditeur.`)) transfer.mutate(m.userId);
                      }}
                    >
                      Transférer la propriété
                    </button>
                  </>
                ) : m.userId === v.you.userId ? (
                  <button type="button" className="button-secondary" disabled={busy} onClick={() => remove.mutate(m.userId)}>
                    Quitter le projet
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
          {v.members.length === 0 && (
            <tr>
              <td colSpan={6} className="h7-muted">
                Aucun membre invité : ce projet n’est visible que par son propriétaire.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {isOwner && (
        <form
          className="members-invite"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (email.trim()) invite.mutate();
          }}
        >
          <label>
            Adresse du compte à inviter
            <input type="email" value={email} required maxLength={254} placeholder="prenom.nom@exemple.fr" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Rôle
            <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              <option value="lecteur">lecteur — {ROLE_HELP.lecteur}</option>
              <option value="editeur">éditeur — {ROLE_HELP.editeur}</option>
            </select>
          </label>
          <button type="submit" className="button-primary" disabled={busy || !email.trim()}>
            Inviter
          </button>
          <p className="h7-muted">Un compte existant reçoit l’accès aussitôt. Une adresse sans compte reçoit une invitation par courriel, valable 7 jours : aucun compte n’est créé tant qu’elle n’est pas acceptée.</p>
        </form>
      )}
      {inviteLink && <CopyLink link={inviteLink} />}
      {isOwner && (v.invitations?.length ?? 0) > 0 && (
        <div className="members-invitations" data-project-invitations>
          <h3>Invitations en attente</h3>
          <ul className="sessions-list">
            {v.invitations!.map((i) => (
              <li key={i.id} data-invitation={i.email}>
                <span><span className="collab-email">{i.email}</span> <small>· {i.projectRole ? ROLE_LABEL[i.projectRole] : ""}{` · valable jusqu’au ${new Date(i.expiresAt).toLocaleDateString(LOCALE)}`}</small></span>
                <button type="button" className="button-secondary" disabled={busy || cancelInvitation.isPending} onClick={() => cancelInvitation.mutate(i.id)}>Annuler l’invitation</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOwner && (v.aReattribuer?.length ?? 0) > 0 && (
        <div className="members-invitations" data-a-reattribuer>
          <h3>Responsabilités à réattribuer</h3>
          <p className="h7-muted">Ces observations et tâches Studio sont encore confiées à une personne qui n’a plus accès au projet. Rien n’est réattribué d’office : ouvrez la variante et réattribuez-les ; leur auteur et leur historique restent inchangés.</p>
          <ul className="sessions-list">
            {v.aReattribuer!.map((r) => (
              <li key={`${r.nature}-${r.id}`} data-responsabilite={r.nature}>
                <span>
                  <b>{r.nature === "observation" ? "Observation" : "Tâche"}</b> <span translate="no">« {r.libelle.length > 80 ? `${r.libelle.slice(0, 79)}…` : r.libelle} »</span>{" "}
                  <small>· <span className="collab-email">{r.responsable.email}</span></small>
                </span>
                <Link className="button-secondary" to={cheminVarianteStudio(projectId, r.studyId, r.variantId)}>Ouvrir dans Studio</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <p className="h7-muted members-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="h7-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Accès support (D-2) : le propriétaire accorde à un administrateur nommé un accès en lecture seule (sans commentaire
 * ni export), pour une durée de 72 h au plus, avec un motif ; révocable à tout moment, chaque lecture journalisée.
 */
export function SupportAccessPanel({ projectId }: { projectId: string }) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["support-grants", projectId], queryFn: () => accountApi.supportGrants(projectId), retry: false });
  const [adminId, setAdminId] = useState("");
  const [hours, setHours] = useState(24);
  const [purpose, setPurpose] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["support-grants", projectId] });
  const grant = useMutation({
    mutationFn: () => accountApi.grantSupport(projectId, { adminId, hours, purpose: purpose.trim() }),
    onSuccess: () => { setConfirm(false); setPurpose(""); setMsg({ ok: true, text: "Accès support accordé." }); refresh(); },
    onError: (err) => { setConfirm(false); setMsg({ ok: false, text: apiMessage(err, "L’accès n’a pas pu être accordé.") }); },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => accountApi.revokeSupport(projectId, id),
    onSuccess: () => { setMsg({ ok: true, text: "Accès support révoqué." }); refresh(); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "La révocation a échoué.") }),
  });
  if (!q.data || q.data.you !== "owner") return null;
  const v = q.data;
  const admin = v.admins.find((a) => a.id === adminId);
  return (
    <section className="biz-card" aria-labelledby="collab-support" data-support-panel>
      <h2 id="collab-support">Accès support</h2>
      <p className="biz-sub">{`Un administrateur de la plateforme n’a jamais accès à votre projet par défaut. Vous pouvez lui accorder un accès en lecture seule (ni commentaire, ni modification, ni export), au plus ${v.maxHours} heures, révocable à tout moment ; chaque consultation est journalisée.`}</p>
      {v.admins.length === 0 ? <p className="h7-muted">Aucun administrateur actif sur la plateforme.</p> : (
        <form className="account-form" onSubmit={(e: FormEvent) => { e.preventDefault(); if (adminId && purpose.trim().length >= 3) setConfirm(true); }}>
          <label>Administrateur
            <select value={adminId} onChange={(e) => setAdminId(e.target.value)} required>
              <option value="">— choisir —</option>
              {v.admins.map((a) => <option key={a.id} value={a.id}>{a.displayName ? `${a.displayName} (${a.email})` : a.email}</option>)}
            </select>
          </label>
          <label>{`Durée (heures, ${v.maxHours} au plus)`}
            <input type="number" min={1} max={v.maxHours} value={hours} onChange={(e) => setHours(Math.max(1, Math.min(v.maxHours, Number(e.target.value) || 1)))} />
          </label>
          <label>Motif
            <textarea rows={2} maxLength={500} required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Diagnostic demandé, numéro de ticket…" />
          </label>
          <button type="submit" className="button-primary" disabled={!online || !adminId || purpose.trim().length < 3}>Accorder l’accès support</button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "h7-muted" : "form-error"}>{msg.text}</p>}
      {v.grants.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Historique des accès support">
          <table className="programme-table">
            <thead><tr><th>Administrateur</th><th>Motif</th><th>Accordé</th><th>Jusqu’au</th><th>Dernier accès</th><th>État</th></tr></thead>
            <tbody>
              {v.grants.map((g) => (
                <tr key={g.id} data-support-grant={g.active ? "active" : "inactive"}>
                  <td className="collab-email">{g.adminEmail}</td>
                  <td translate="no">{g.purpose}</td>
                  <td>{new Date(g.grantedAt).toLocaleString(LOCALE)}</td>
                  <td>{new Date(g.expiresAt).toLocaleString(LOCALE)}</td>
                  <td>{g.lastAccessAt ? new Date(g.lastAccessAt).toLocaleString(LOCALE) : "—"}</td>
                  <td>{g.active ? <button type="button" className="button-secondary" disabled={!online || revoke.isPending} onClick={() => revoke.mutate(g.id)}>Révoquer</button> : g.revokedAt ? "révoqué" : "expiré"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm && admin && (
        <ConfirmDialog title="Accorder un accès support" confirmLabel="Accorder" busy={grant.isPending} onClose={() => setConfirm(false)} onConfirm={() => grant.mutate()}>
          <p><span translate="no">{admin.email}</span>{` pourra consulter ce projet en lecture seule pendant ${hours} heure(s). Vous serez prévenu de sa première consultation et pourrez révoquer l’accès à tout moment.`}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export function CollaborationModule({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["collaboration", projectId], queryFn: () => api.getCollaboration(projectId) });
  const [filter, setFilter] = useState("tous");
  if (query.isLoading) return <p role="status">Lecture du journal…</p>;
  if (!query.data) return <p role="alert">Impossible de lire la collaboration du projet.</p>;
  const v = query.data;
  const kinds = [...new Set(v.journal.map((e) => e.kind))];
  const journal = filter === "tous" ? v.journal : v.journal.filter((e) => e.kind === filter);
  return (
    <div className="collaboration-module">
      <section className="biz-card" aria-labelledby="collab-access">
        <h2 id="collab-access">Accès</h2>
        <div className="biz-kpis">
          <div className="biz-kpi">
            <span>Propriétaire</span>
            <b className="collab-email">{v.access.ownerEmail}</b>
            <small>{v.access.you === v.access.ownerEmail ? "c'est vous" : `vous : ${v.access.you}`}</small>
          </div>
          <div className="biz-kpi">
            <span>Votre rôle</span>
            <b className="collab-role" data-role={v.access.role}>
              {ROLE_LABEL[v.access.role]}
            </b>
            <small>{v.access.role === "proprietaire" ? "partage, édition, suppression" : v.access.role === "editeur" ? "lecture, commentaires, édition" : v.access.role === "support" ? "lecture seule, sans commentaire ni export" : v.access.canExport ? "lecture et commentaires, export accordé" : "lecture et commentaires, sans export"}</small>
          </div>
          <div className="biz-kpi">
            <span>Édition</span>
            <b className="collab-lock">{v.access.lock ? `réservée par ${v.access.lock.email === v.access.you ? "vous" : v.access.lock.email}` : "libre"}</b>
            <small>
              {v.access.lock
                ? `jusqu’à ${new Date(v.access.lock.expiresAt).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })} · depuis ${new Date(v.access.lock.since).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}`
                : "réservation optionnelle, 30 min prolongeables"}
            </small>
          </div>
          <div className="biz-kpi">
            <span>Partage</span>
            <b>{v.access.members.length} membre(s)</b>
            <small>
              {v.access.members.filter((m) => m.role === "editeur").length} éditeur(s) · {v.access.members.filter((m) => m.role === "lecteur").length} lecteur(s)
            </small>
          </div>
          <div className="biz-kpi">
            <span>Modèle</span>
            <b>Révision {v.sync.modelRevision}</b>
            <small>
              {v.sync.lastModelWrite ? `dernière écriture ${new Date(v.sync.lastModelWrite).toLocaleString(LOCALE)}` : "aucune écriture"} · {v.sync.journalEntries} modification(s) au journal
            </small>
          </div>
          <div className="biz-kpi">
            <span>Hors-ligne</span>
            <b>{v.sync.offline.available ? "Atelier, saisies, lecture" : "Non disponible"}</b>
            <small>files locales et cache (IndexedDB)</small>
          </div>
        </div>
        <p className="programme-note">{v.access.sharing.reason}</p>
        <p className="programme-note">{v.sync.offline.reason}</p>
      </section>

      <section className="biz-card" aria-labelledby="collab-members">
        <h2 id="collab-members">Membres du projet</h2>
        <MembersPanel projectId={projectId} />
      </section>

      <SupportAccessPanel projectId={projectId} />

      <section className="biz-card" aria-labelledby="collab-comments">
        <h2 id="collab-comments">Commentaires ({v.comments.length})</h2>
        <CommentThread projectId={projectId} stepNumber={null} comments={v.comments} />
      </section>

      <section className="biz-card" aria-labelledby="collab-journal">
        <h2 id="collab-journal">Journal des révisions ({v.journal.length})</h2>
        <p className="biz-sub">
          Relu depuis les dates portées par les données : arbitrages Harmonie et états antérieurs conservés, variantes de programme, transferts, revues de conception, écritures du modèle et des
          parcelles, documents produits, commentaires.
        </p>
        <nav className="h7-tabs" aria-label="Filtrer le journal">
          <button type="button" className={filter === "tous" ? "sel" : ""} aria-pressed={filter === "tous"} onClick={() => setFilter("tous")}>
            Tous
          </button>
          {kinds.map((k) => (
            <button key={k} type="button" className={filter === k ? "sel" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {KIND_LABEL[k] ?? k}
            </button>
          ))}
        </nav>
        <div className="table-scroll" tabIndex={0}>
          <table className="programme-table journal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Nature</th>
                <th>Événement</th>
                <th>Détail</th>
                <th>Étape</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((e, i) => (
                <tr key={`${e.at}-${e.kind}-${i}`} data-kind={e.kind}>
                  <td>{new Date(e.at).toLocaleString(LOCALE)}</td>
                  <td>
                    <span className="h7-chip">{KIND_LABEL[e.kind] ?? e.kind}</span>
                  </td>
                  <td>
                    <b>{e.label}</b>
                  </td>
                  <td>{e.detail}</td>
                  <td>{e.stepNumber !== null ? <Link to={`/projets/${projectId}?module=parcours&etape=${e.stepNumber}`}>{pad2(e.stepNumber)}</Link> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
