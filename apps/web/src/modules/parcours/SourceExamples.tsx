/**
 * « Exemples issus des fichiers sources » — le pli de chaque étape du
 * prototype (`exampleBlock()` / `initExamples()`) : exemple affiché (choix
 * mémorisé par projet et par étape), origine, résumé, contenu pertinent pour
 * l'étape, avertissement, « Utiliser comme aide au remplissage »
 * (renseigne les rubriques vides, côté serveur) et « Bibliothèque complète ».
 *
 * Pour les étapes 01–03, le prototype (h7-app) remplace ce pli par
 * « Exemples · qualités du site par type de bâtiment » : la phrase de site
 * du profil Harmonie et un renvoi vers la bibliothèque.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type ParcoursStep } from "../../lib/api";

export function SourceExamplesFold({ projectId, step, onStepUpdated }: { projectId: string; step: ParcoursStep; onStepUpdated: (step: ParcoursStep) => void }) {
  const queryClient = useQueryClient();
  const items = useQuery({ queryKey: ["source-examples", step.number], queryFn: () => api.sourceExamplesForStep(step.number), staleTime: Infinity });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filledNote, setFilledNote] = useState<string | null>(null);

  const select = useMutation({
    mutationFn: (key: string) => api.patchStep(projectId, step.number, { exampleSelection: key }),
    onSuccess: (updated) => {
      onStepUpdated(updated);
      void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
    },
    onError: () => setError("Le choix de l’exemple n’a pas pu être enregistré."),
  });
  const fill = useMutation({
    mutationFn: (key: string) => api.fillFromExample(projectId, step.number, key),
    onSuccess: ({ step: updated, filled }) => {
      setError(null);
      setFilledNote(filled.length ? `${filled.length} rubrique(s) renseignée(s) à partir de l’exemple — à adapter.` : "Aucune rubrique vide à renseigner : vos réponses sont conservées.");
      onStepUpdated(updated);
      void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "L’aide au remplissage n’a pas pu être appliquée."),
  });

  if (step.number <= 3) {
    return (
      <details className="fold-card source-examples" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Exemples · qualités du site par type de bâtiment</summary>
        <div className="fold-card-body">
          <p>{step.profile.site}</p>
          <Link className="button-secondary" to="/bibliotheque/exemples">
            Explorer la bibliothèque
          </Link>
        </div>
      </details>
    );
  }

  const list = items.data ?? [];
  if (items.isSuccess && list.length === 0) return null;
  const selectedKey = step.content.exampleSelection && list.some((e) => e.key === step.content.exampleSelection) ? step.content.exampleSelection : list[0]?.key;
  const e = list.find((x) => x.key === selectedKey) ?? null;
  const used = step.content.exampleUsed ?? null;

  return (
    <details className="fold-card source-examples" open={open} onToggle={(ev) => setOpen((ev.target as HTMLDetailsElement).open)}>
      <summary>Exemples issus des fichiers sources</summary>
      <div className="fold-card-body">
        <section className="example-step" aria-label="Exemples issus des fichiers sources">
          <div className="example-step-head">
            <div className="example-meta">Cas pédagogiques à adapter — jamais considérés comme données réelles du projet.</div>
            <Link className="button-secondary" to="/bibliotheque/exemples">
              Bibliothèque complète
            </Link>
          </div>
          {items.isPending && <p className="example-meta">Chargement des exemples…</p>}
          {e && (
            <>
              <label className="biz-field">
                <span>Exemple affiché</span>
                <select className="example-select" value={e.key} disabled={select.isPending} onChange={(ev) => select.mutate(ev.target.value)}>
                  {list.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.title} — {x.origin}
                    </option>
                  ))}
                </select>
              </label>
              <div className="example-body">
                <strong>{e.title}</strong>
                <div className="example-meta">
                  {e.origin} · {e.location}
                </div>
                <p>{e.summary}</p>
                <details>
                  <summary>Voir le contenu pertinent pour cette étape</summary>
                  <div className="example-pre">{e.text}</div>
                </details>
                <div className="example-warning">Les valeurs, coûts, notes et décisions des cas fictifs ne sont ni des références de marché ni des preuves.</div>
                <p>
                  <button type="button" className="button-primary" disabled={fill.isPending || !step.form} onClick={() => fill.mutate(e.key)}>
                    Utiliser comme aide au remplissage
                  </button>
                </p>
                {filledNote && (
                  <p className="example-meta" role="status">
                    {filledNote}
                  </p>
                )}
                {used && (
                  <p className="example-meta">
                    Aide au remplissage utilisée : {list.find((x) => x.key === used.key)?.title ?? used.key} · {new Date(used.at).toLocaleString("fr-FR")} · {used.warning}.
                  </p>
                )}
                {error && (
                  <p className="h7-error" role="alert">
                    {error}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </details>
  );
}
