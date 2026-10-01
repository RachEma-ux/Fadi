import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export function ProjectsPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

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
      <header className="projects-header">
        <div>
          <h1>Projets</h1>
          <p>{user?.email}</p>
        </div>
        <button type="button" onClick={() => void logout()}>
          Se déconnecter
        </button>
      </header>

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
        <h2 id="project-list-heading">Vos projets</h2>
        {projectsQuery.isLoading && <p role="status">Chargement…</p>}
        {projectsQuery.isError && <p role="alert">Impossible de charger vos projets.</p>}
        {projectsQuery.data && projectsQuery.data.length === 0 && <p>Aucun projet pour l'instant.</p>}
        {projectsQuery.data && projectsQuery.data.length > 0 && (
          <ul className="project-list">
            {projectsQuery.data.map((p) => (
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
