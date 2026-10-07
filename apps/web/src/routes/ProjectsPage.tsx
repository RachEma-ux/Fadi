import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api, ROLE_LABEL } from "../lib/api";
import { ImportProjectButton } from "../modules/projets-sources/ImportProjectButton";
import { IMPORT_PROGRESS_TEXT, useImportExample } from "../lib/use-import-example";

/**
 * Exemples importables — une copie indépendante est créée dans le compte de
 * l'utilisateur, jamais une référence partagée (voir apps/api/src/routes/examples.ts).
 * Les chiffres affichés viennent du contenu réellement importé, pas d'un
 * mécanisme de propositions Harmonie que Fadi n'a pas encore.
 */
function ExamplesSection() {
  const examplesQuery = useQuery({ queryKey: ["examples"], queryFn: api.listExamples });
  // L'import copie 21 étapes, le modèle natif (≈ 1 Mo), la parcelle et les documents de base : plusieurs secondes.
  // Toute la carte le déclenche (pas seulement le bouton), l'état est visible, un échec est dit et se retente.
  const { importingId, error: importError, start } = useImportExample();

  if (examplesQuery.isLoading || !examplesQuery.data || examplesQuery.data.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="examples-heading" className="panel examples-panel">
      <h2 id="examples-heading">Exemples</h2>
      <p className="panel-sub">
        Des cas déjà travaillés, à importer comme point de départ. Chaque import crée votre propre copie ; l'exemple d'origine ne change pas.
      </p>
      <div className="examples-grid">
        {examplesQuery.data.map((ex) => {
          const importing = importingId === ex.id;
          const error = importError?.id === ex.id ? importError.message : null;
          return (
            <article
              key={ex.id}
              className={`example-card${importing ? " example-card-importing" : ""}`}
              data-example={ex.id}
              aria-busy={importing}
              onClick={(e) => {
                // Un lien ou un bouton de la carte garde son propre comportement ; ailleurs, la carte entière importe.
                if ((e.target as HTMLElement).closest("button, a")) return;
                start(ex.id);
              }}
            >
              <span className="eyebrow">{ex.kind === "exemple-complet" ? "EXEMPLE COMPLET" : "ARCHIVE DE TRAVAIL"}</span>
              <h3>{ex.name}</h3>
              <p>{ex.summary}</p>
              <p className="example-card-meta">
                {ex.stepsWithContent} / 21 étapes avec contenu importé · {ex.documentedDecisions} décisions documentées
              </p>
              <button type="button" className="button-primary" onClick={() => start(ex.id)} disabled={importingId !== null}>
                {importing ? "Import en cours…" : "Importer et ouvrir"}
              </button>
              {importing && (
                <p className="example-card-progress" role="status">
                  <span className="example-card-spinner" aria-hidden="true" /> {IMPORT_PROGRESS_TEXT}
                </p>
              )}
              {error && (
                <p className="h7-error" role="alert">
                  {error}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const filtered = useMemo(() => {
    const projects = projectsQuery.data ?? [];
    if (!q) return projects;
    return projects.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [projectsQuery.data, q]);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createProject = useMutation({
    mutationFn: () => api.createProject(code, name),
    onSuccess: () => {
      setCode("");
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError && err.code === "invalid_input"
        ? "Code projet invalide (lettres, chiffres, points, tirets) ou nom manquant."
        : "Impossible de créer le projet.");
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    createProject.mutate();
  }

  return (
    <main className="projects-page">
      <div className="projects-heading">
        <h1>Mes projets</h1>
        {/* Page Projets du prototype : « + Nouveau projet », « Importer projet JSON », « Bibliothèque des bâtiments ». */}
        <div className="h7-actions">
          <ImportProjectButton />
          <Link className="button-secondary" to="/bibliotheque/batiments">
            Bibliothèque des bâtiments
          </Link>
        </div>
      </div>

      <section aria-labelledby="new-project-heading" className="panel">
        <h2 id="new-project-heading">Nouveau projet</h2>
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="project-code">Code (ex. P.118)</label>
          <input id="project-code" required value={code} onChange={(e) => setCode(e.target.value)} />

          <label htmlFor="project-name">Nom</label>
          <input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />

          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}

          <button type="submit" disabled={createProject.isPending}>
            {createProject.isPending ? "Création…" : "Créer"}
          </button>
        </form>
      </section>

      <ExamplesSection />

      <section aria-labelledby="project-list-heading">
        <h2 id="project-list-heading">{q ? `Résultats pour « ${searchParams.get("q")} »` : "Vos projets"}</h2>
        {projectsQuery.isLoading && <p role="status">Chargement…</p>}
        {projectsQuery.isError && <p role="alert">Impossible de charger vos projets.</p>}
        {projectsQuery.data && filtered.length === 0 && (
          <p>{q ? "Aucun projet ne correspond à cette recherche." : "Aucun projet pour l'instant."}</p>
        )}
        {filtered.some((p) => !p.role || p.role === "proprietaire") && (
          <ul className="project-list">
            {filtered
              .filter((p) => !p.role || p.role === "proprietaire")
              .map((p) => (
                <li key={p.id}>
                  <Link to={`/projets/${p.id}`}>
                    <strong>{p.code}</strong> — <span translate="no">{p.name}</span>
                  </Link>
                  <small>Révision du modèle : {p.modelRevision}</small>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Projets que d'autres comptes vous ont partagés : le rôle (lecteur / éditeur) est décidé par le serveur. */}
      {filtered.some((p) => p.role && p.role !== "proprietaire") && (
        <section aria-labelledby="shared-list-heading" className="shared-projects">
          <h2 id="shared-list-heading">Projets partagés avec vous</h2>
          <ul className="project-list">
            {filtered
              .filter((p) => p.role && p.role !== "proprietaire")
              .map((p) => (
                <li key={p.id} data-role={p.role}>
                  <Link to={`/projets/${p.id}`}>
                    <strong>{p.code}</strong> — <span translate="no">{p.name}</span>
                  </Link>
                  <small>
                    {ROLE_LABEL[p.role ?? "lecteur"]} · partagé par {p.ownerEmail ?? "son propriétaire"} · révision du modèle : {p.modelRevision}
                  </small>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
