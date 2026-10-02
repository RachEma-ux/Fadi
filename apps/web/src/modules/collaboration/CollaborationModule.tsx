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
import { api, ApiError, ROLE_LABEL, type MemberRole, type ProjectComment } from "../../lib/api";
import { MUTATION_KEYS, type CommentVars } from "../../lib/mutations";

const pad2 = (n: number) => String(n).padStart(2, "0");
const KIND_LABEL: Record<string, string> = {
  projet: "Projet",
  harmonie: "Harmonie",
  programme: "Programme",
  modele: "Modèle",
  parcelle: "Parcelle",
  revue: "Revue",
  document: "Document",
  commentaire: "Commentaire",
};

/** Fil de commentaires (projet entier ou une étape) : liste en fils (réponses rattachées à leur commentaire d'origine), ajout, réponse, suppression par l'auteur. */
export function CommentThread({ projectId, stepNumber, comments, compact = false }: { projectId: string; stepNumber: number | null; comments: ProjectComment[]; compact?: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
  };
  const add = useMutation({
    mutationKey: MUTATION_KEYS.comment,
    mutationFn: (v: CommentVars) => api.addComment(v.projectId, v.body, v.stepNumber, v.parentId ?? null),
    onSuccess: (_c, v) => {
      if (v.parentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else setDraft("");
      setError(null);
      refresh();
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Le commentaire n’a pas pu être enregistré."),
  });
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
      <b>{c.authorEmail}</b> · {new Date(c.createdAt).toLocaleString("fr-FR")}
      {c.stepNumber !== null && stepNumber === null && !c.parentId && (
        <>
          {" · "}
          <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}`}>étape {pad2(c.stepNumber)}</Link>
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
            <li key={c.id} className="comment" data-comment={c.id}>
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
              ) : (
                <button type="button" className="comment-reply-button" onClick={() => setReplyTo(c.id)}>
                  Répondre
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="h7-muted">Aucun commentaire{stepNumber !== null ? " sur cette étape" : ""}.</p>
      )}
      <form
        className="comment-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (draft.trim()) add.mutate({ projectId, body: draft.trim(), stepNumber });
        }}
      >
        <label>
          {stepNumber !== null ? `Commentaire sur l'étape ${pad2(stepNumber)}` : "Nouveau commentaire"}
          <textarea value={draft} maxLength={4000} rows={compact ? 2 : 3} placeholder="Question, remarque, décision à tracer…" onChange={(e) => setDraft(e.target.value)} />
        </label>
        <div className="h7-actions">
          <button type="submit" className="button-primary" disabled={(add.isPending && !add.isPaused) || !draft.trim()}>
            Publier le commentaire
          </button>
          {add.isPaused && <span className="h7-muted">Commentaire en attente du réseau : il sera publié au retour de la connexion.</span>}
        </div>
      </form>
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
  lecteur: "lit tout le dossier et commente",
  editeur: "lit, commente et modifie (saisies, arbitrages, programme, Atelier, sources)",
};

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
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
  };
  const invite = useMutation({
    mutationFn: () => api.inviteMember(projectId, email.trim(), role),
    onSuccess: (m) => {
      setEmail("");
      setError(null);
      setNotice(`${m.email} a maintenant accès au projet comme ${ROLE_LABEL[m.role]}.`);
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
      setNotice("Accès retiré.");
      refresh();
    },
    onError: (err) => setError(errorText(err, "Le retrait n’a pas pu être enregistré.")),
  });
  if (query.isLoading) return <p role="status">Lecture des membres…</p>;
  if (!query.data) return <p role="alert">Impossible de lire les membres du projet.</p>;
  const v = query.data;
  const isOwner = v.you.role === "proprietaire";
  const busy = invite.isPending || change.isPending || remove.isPending || transfer.isPending;
  return (
    <div className="members-panel">
      <table className="programme-table members-table">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Rôle</th>
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
            <td>—</td>
            <td />
          </tr>
          {v.members.map((m) => (
            <tr key={m.userId} data-member={m.email}>
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
              <td>{new Date(m.createdAt).toLocaleDateString("fr-FR")}</td>
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
              <td colSpan={4} className="h7-muted">
                Aucun membre invité : ce projet n’est visible que par son propriétaire.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
          <p className="h7-muted">La personne doit déjà avoir un compte Fadi avec cette adresse ; aucun courriel n’est envoyé.</p>
        </form>
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
            <small>{v.access.role === "proprietaire" ? "partage, édition, suppression" : v.access.role === "editeur" ? "lecture, commentaires, édition" : "lecture et commentaires"}</small>
          </div>
          <div className="biz-kpi">
            <span>Édition</span>
            <b className="collab-lock">{v.access.lock ? `réservée par ${v.access.lock.email === v.access.you ? "vous" : v.access.lock.email}` : "libre"}</b>
            <small>
              {v.access.lock
                ? `jusqu’à ${new Date(v.access.lock.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · depuis ${new Date(v.access.lock.since).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
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
              {v.sync.lastModelWrite ? `dernière écriture ${new Date(v.sync.lastModelWrite).toLocaleString("fr-FR")}` : "aucune écriture"} · {v.sync.nativeKeys} clé(s)
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
        <div className="table-scroll">
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
                  <td>{new Date(e.at).toLocaleString("fr-FR")}</td>
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
