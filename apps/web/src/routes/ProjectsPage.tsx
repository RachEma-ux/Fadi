import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";

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
      <h1>Mes projets</h1>

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

      <section aria-labelledby="project-list-heading">
        <h2 id="project-list-heading">{q ? `Résultats pour « ${searchParams.get("q")} »` : "Vos projets"}</h2>
        {projectsQuery.isLoading && <p role="status">Chargement…</p>}
        {projectsQuery.isError && <p role="alert">Impossible de charger vos projets.</p>}
        {projectsQuery.data && filtered.length === 0 && (
          <p>{q ? "Aucun projet ne correspond à cette recherche." : "Aucun projet pour l'instant."}</p>
        )}
        {filtered.length > 0 && (
          <ul className="project-list">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link to={`/projets/${p.id}`}>
                  <strong>{p.code}</strong> — {p.name}
                </Link>
                <small>Révision du modèle : {p.modelRevision}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
