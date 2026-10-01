import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { MODULES } from "../modules/module-registry";
import { AtelierPanel } from "../modules/atelier/AtelierPanel";
import { ParcoursModule } from "../modules/parcours/ParcoursModule";
import { ProgrammeRepartition, ProgrammeTransfer } from "../modules/programmation/ProgrammeRepartition";

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) throw new Error("projectId manquant dans l'URL");

  const queryClient = useQueryClient();
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const levelsQuery = useQuery({ queryKey: ["levels", projectId], queryFn: () => api.listLevels(projectId) });

  const [searchParams] = useSearchParams();
  const requestedModule = searchParams.get("module");
  const [activeModule, setActiveModule] = useState(
    requestedModule && MODULES.some((m) => m.id === requestedModule) ? requestedModule : "parcours",
  );

  const ensureGroundLevel = useMutation({
    mutationFn: () => api.createLevel(projectId, "RDC", 0, 0),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["levels", projectId] }),
  });

  // Chaque projet a besoin d'au moins un niveau pour que l'Atelier ait un
  // endroit où poser un mur. On en crée un par défaut s'il n'en existe
  // aucun, plutôt que de bloquer l'utilisateur sur un écran de configuration.
  useEffect(() => {
    if (levelsQuery.data && levelsQuery.data.length === 0 && !ensureGroundLevel.isPending) {
      ensureGroundLevel.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelsQuery.data]);

  if (projectQuery.isLoading) {
    return <p role="status">Chargement du projet…</p>;
  }
  if (projectQuery.isError || !projectQuery.data) {
    return (
      <main>
        <p role="alert">Projet introuvable, ou vous n'y avez pas accès.</p>
        <Link to="/projets">Retour aux projets</Link>
      </main>
    );
  }

  const project = projectQuery.data;
  const groundLevel = levelsQuery.data?.[0];
  const descriptor = MODULES.find((m) => m.id === activeModule);

  return (
    <div className="project-shell">
      <header className="project-header">
        <h1>
          {project.code} — {project.name}
        </h1>
        <span>Révision du modèle : {project.modelRevision}</span>
      </header>

      <nav aria-label="Modules du projet" className="module-nav">
        {MODULES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-current={m.id === activeModule ? "page" : undefined}
            onClick={() => setActiveModule(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <main className="module-content">
        {activeModule === "parcours" && (
          <>
            <h2>Étude du potentiel d’une parcelle</h2>
            <ParcoursModule projectId={projectId} />
          </>
        )}

        {activeModule === "atelier" && (
          <>
            <h2>Atelier architectural</h2>
            {groundLevel ? (
              <AtelierPanel projectId={projectId} levelId={groundLevel.id} />
            ) : (
              <p role="status">Préparation du niveau…</p>
            )}
          </>
        )}

        {activeModule === "programmation" && (
          <>
            <h2>Programmation</h2>
            <ProgrammeRepartition projectId={projectId} />
            <ProgrammeTransfer projectId={projectId} />
          </>
        )}

        {activeModule !== "parcours" && activeModule !== "atelier" && activeModule !== "programmation" && descriptor && (
          <>
            <h2>{descriptor.label}</h2>
            <p>{descriptor.status}</p>
          </>
        )}
      </main>
    </div>
  );
}
