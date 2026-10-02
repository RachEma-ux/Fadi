/**
 * Module Collaboration — accès (propriétaire ; partage non disponible, dit
 * tel quel), état de synchronisation du modèle (révision, écritures), journal
 * des révisions relu depuis les dates portées par les données, et fil de
 * commentaires du projet (par étape ou général). Rien n'est simulé : ce qui
 * n'existe pas encore (partage, droits, file hors-ligne) est annoncé.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError, type ProjectComment } from "../../lib/api";

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

/** Fil de commentaires (projet entier ou une étape) : liste, ajout, suppression par l'auteur. */
export function CommentThread({ projectId, stepNumber, comments, compact = false }: { projectId: string; stepNumber: number | null; comments: ProjectComment[]; compact?: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["collaboration", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
  };
  const add = useMutation({
    mutationFn: (body: string) => api.addComment(projectId, body, stepNumber),
    onSuccess: () => {
      setDraft("");
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
  return (
    <div className={`comment-thread${compact ? " compact" : ""}`}>
      {comments.length ? (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment" data-comment={c.id}>
              <div className="comment-meta">
                <b>{c.authorEmail}</b> · {new Date(c.createdAt).toLocaleString("fr-FR")}
                {c.stepNumber !== null && stepNumber === null && (
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
              <p>{c.body}</p>
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
          if (draft.trim()) add.mutate(draft.trim());
        }}
      >
        <label>
          {stepNumber !== null ? `Commentaire sur l'étape ${pad2(stepNumber)}` : "Nouveau commentaire"}
          <textarea value={draft} maxLength={4000} rows={compact ? 2 : 3} placeholder="Question, remarque, décision à tracer…" onChange={(e) => setDraft(e.target.value)} />
        </label>
        <div className="h7-actions">
          <button type="submit" className="button-primary" disabled={add.isPending || !draft.trim()}>
            Publier le commentaire
          </button>
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

export function CollaborationModule({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["collaboration", projectId], queryFn: () => api.getCollaboration(projectId) });
  const [filter, setFilter] = useState("tous");
  if (query.isLoading) return <p role="status">Lecture du journal…</p>;
  if (query.isError || !query.data) return <p role="alert">Impossible de lire la collaboration du projet.</p>;
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
            <span>Partage</span>
            <b>{v.access.sharing.available ? "Disponible" : "Non disponible"}</b>
            <small>lecture, commentaires, édition</small>
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
            <b>{v.sync.offline.available ? "Disponible" : "Non disponible"}</b>
            <small>file de synchronisation</small>
          </div>
        </div>
        <p className="programme-note">{v.access.sharing.reason}</p>
        <p className="programme-note">{v.sync.offline.reason}</p>
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
