/**
 * « Sources de l'étape » — les fichiers rattachés à une étape du projet
 * (`sourceBlock()` / `renderStageSources()` du prototype : importer des
 * fichiers, zone de dépôt, liste nom · taille · type · date, Télécharger,
 * Supprimer avec confirmation). Le prototype les gardait dans IndexedDB
 * (`FILE_DB`) ; Fadi les enregistre sur le serveur, par projet et par étape
 * (module Projets et sources).
 */
import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectAccess } from "../../lib/access";
import { api, ApiError, type StepFile } from "../../lib/api";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `humanSize()` du prototype. */
export function humanSize(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1048576).toFixed(1)} Mo`;
}

export function StepSources({ projectId, stepNumber }: { projectId: string; stepNumber: number }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const files = useQuery({ queryKey: ["step-files", projectId, stepNumber], queryFn: () => api.listStepFiles(projectId, stepNumber) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["step-files", projectId, stepNumber] });

  const upload = useMutation({
    mutationFn: async (list: File[]) => {
      for (const file of list) await api.uploadStepFile(projectId, stepNumber, file);
    },
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (err) => {
      setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Le fichier n’a pas pu être enregistré.");
      void invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (file: StepFile) => api.deleteStepFile(projectId, stepNumber, file.id),
    onSuccess: () => void invalidate(),
    onError: () => setError("Le fichier n’a pas pu être supprimé."),
  });

  function addFiles(list: FileList | File[] | null) {
    const arr = Array.from(list ?? []);
    if (arr.length) upload.mutate(arr);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  }

  const rows = files.data ?? [];
  const access = useProjectAccess(projectId);
  return (
    <details className="fold-card step-sources" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Sources de l’étape</summary>
      <div className="fold-card-body">
        <section className="sources-card" aria-label="Sources de l’étape">
          <div className="sources-head">
            <div className="source-meta">Fichiers rattachés à l’étape {pad2(stepNumber)} de ce projet.</div>
            {access.canWrite ? (
              <button type="button" className="button-primary" disabled={upload.isPending} onClick={() => input.current?.click()}>
                + Importer des fichiers
              </button>
            ) : (
              <span className="source-meta">Lecture seule : téléchargement possible, import et suppression réservés au propriétaire et aux éditeurs.</span>
            )}
          </div>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {access.canWrite && (
            <div
              className={`sources-drop${drag ? " drag" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
            >
              Déposez des fichiers ici ou utilisez « Importer des fichiers »
              <br />
              <small>PDF, DOCX, XLSX, images, KML/KMZ, JSON et autres pièces du dossier.</small>
            </div>
          )}
          {error && (
            <p className="h7-error" role="alert">
              {error}
            </p>
          )}
          <div className="sources-list" role="list">
            {files.isPending ? (
              <div className="source-meta">Chargement des sources…</div>
            ) : files.isError ? (
              <div className="source-meta">Sources indisponibles pour le moment.</div>
            ) : rows.length === 0 ? (
              <div className="source-meta">{upload.isPending ? "Enregistrement…" : "Aucune source importée pour cette étape."}</div>
            ) : (
              rows.map((r) => (
                <div className="source-row" role="listitem" key={r.id}>
                  <div>
                    <div className="source-name">{r.name}</div>
                    <div className="source-meta">
                      {humanSize(r.size)} · {r.type || "type inconnu"} · ajouté le {new Date(r.addedAt).toLocaleString("fr-FR")}
                    </div>
                  </div>
                  <div className="source-actions">
                    <a className="button-secondary" href={api.stepFileUrl(projectId, stepNumber, r.id)} download={r.name}>
                      Télécharger
                    </a>
                    {access.canWrite && (
                      <button
                        type="button"
                        className="button-secondary danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm("Supprimer ce fichier de l’étape ?")) remove.mutate(r);
                        }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {upload.isPending && rows.length > 0 && <div className="source-meta">Enregistrement…</div>}
          </div>
        </section>
      </div>
    </details>
  );
}

/** Module Projets et sources : toutes les pièces du projet, étape par étape, avec leur téléchargement. */
export function ProjectSources({ projectId, stepTitle }: { projectId: string; stepTitle: (n: number) => string }) {
  const files = useQuery({ queryKey: ["project-files", projectId], queryFn: () => api.listProjectFiles(projectId) });
  const rows = files.data ?? [];
  const byStep = new Map<number, typeof rows>();
  for (const r of rows) byStep.set(r.stepNumber, [...(byStep.get(r.stepNumber) ?? []), r]);
  return (
    <section className="sources-card project-sources" aria-label="Sources du projet">
      <div className="sources-head">
        <div className="source-meta">{rows.length ? `${rows.length} pièce(s) rattachée(s) aux étapes de ce projet. Les fichiers s’ajoutent depuis « Sources de l’étape » de chaque étape.` : "Aucune pièce rattachée aux étapes de ce projet. Les fichiers s’ajoutent depuis « Sources de l’étape » de chaque étape."}</div>
      </div>
      {[...byStep.entries()].map(([n, list]) => (
        <div className="sources-list" key={n} role="list" aria-label={`Étape ${pad2(n)}`}>
          <div className="source-name">
            Étape {pad2(n)} · {stepTitle(n)}
          </div>
          {list.map((r) => (
            <div className="source-row" role="listitem" key={r.id}>
              <div>
                <div className="source-name">{r.name}</div>
                <div className="source-meta">
                  {humanSize(r.size)} · {r.type || "type inconnu"} · ajouté le {new Date(r.addedAt).toLocaleString("fr-FR")}
                </div>
              </div>
              <div className="source-actions">
                <a className="button-secondary" href={api.stepFileUrl(projectId, r.stepNumber, r.id)} download={r.name}>
                  Télécharger
                </a>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
