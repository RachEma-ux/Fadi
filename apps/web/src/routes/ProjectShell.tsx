import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { MODULES } from "../modules/module-registry";
import { NativeAtelier } from "../modules/atelier/NativeAtelier";
import { ParcoursModule } from "../modules/parcours/ParcoursModule";
import { ProgrammeRepartition, ProgrammeTransfer } from "../modules/programmation/ProgrammeRepartition";
import { ParcelleTool } from "../modules/projets-sources/ParcelleTool";

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) throw new Error("projectId manquant dans l'URL");

  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });

  const [searchParams] = useSearchParams();
  const requestedModule = searchParams.get("module");
  const [activeModule, setActiveModule] = useState(
    requestedModule && MODULES.some((m) => m.id === requestedModule) ? requestedModule : "parcours",
  );

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
            <NativeAtelier projectId={projectId} />
          </>
        )}

        {activeModule === "projets-sources" && (
          <>
            <h2>Projets et sources</h2>
            <ParcelleTool projectId={projectId} />
          </>
        )}

        {activeModule === "programmation" && (
          <>
            <h2>Programmation</h2>
            <ProgrammeRepartition projectId={projectId} />
            <ProgrammeTransfer projectId={projectId} />
          </>
        )}

        {activeModule !== "parcours" && activeModule !== "atelier" && activeModule !== "programmation" && activeModule !== "projets-sources" && descriptor && (
          <>
            <h2>{descriptor.label}</h2>
            <p>{descriptor.status}</p>
          </>
        )}
      </main>
    </div>
  );
}
