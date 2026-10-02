import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { MODULES } from "../modules/module-registry";
import { AnalysesModule } from "../modules/analyses/AnalysesModule";
import { NativeAtelier } from "../modules/atelier/NativeAtelier";
import { CollaborationModule } from "../modules/collaboration/CollaborationModule";
import { DocumentsModule } from "../modules/documents/DocumentsModule";
import { ParcoursModule } from "../modules/parcours/ParcoursModule";
import { ProgrammeHypothesesPage, ProgrammeModelLinksPage } from "../modules/programmation/ProgrammeLinks";
import { ProgrammeRepartition, ProgrammeTransfer } from "../modules/programmation/ProgrammeRepartition";
import { ParcelleTool } from "../modules/projets-sources/ParcelleTool";
import { ProjectSources } from "../modules/projets-sources/StepSources";

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) throw new Error("projectId manquant dans l'URL");

  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const stepsQuery = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });

  // Le module ouvert vit dans l'URL (`?module=`), comme l'étape (`?etape=`) et la vue (`?vue=`) : les liens
  // entre modules (« Comparer au modèle dessiné », « Ouvrir l’Atelier »…) et le rechargement le respectent.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModule = searchParams.get("module");
  const activeModule = requestedModule && MODULES.some((m) => m.id === requestedModule) ? requestedModule : "parcours";
  const programmeView = searchParams.get("vue");
  function selectModule(id: string) {
    const next = new URLSearchParams();
    next.set("module", id);
    setSearchParams(next);
  }

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
            onClick={() => selectModule(m.id)}
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
            <h3 className="module-subtitle">Sources des étapes</h3>
            <ProjectSources projectId={projectId} stepTitle={(n) => stepsQuery.data?.find((s) => s.number === n)?.title ?? ""} />
          </>
        )}

        {activeModule === "programmation" && (
          <>
            <h2>Programmation</h2>
            {programmeView === "modele" ? (
              <ProgrammeModelLinksPage projectId={projectId} />
            ) : programmeView === "hypotheses" ? (
              <ProgrammeHypothesesPage projectId={projectId} />
            ) : (
              <>
                <ProgrammeRepartition projectId={projectId} />
                <ProgrammeTransfer projectId={projectId} />
              </>
            )}
          </>
        )}

        {activeModule === "analyses" && (
          <>
            <h2>Analyses métier</h2>
            <AnalysesModule projectId={projectId} />
          </>
        )}

        {activeModule === "documents" && (
          <>
            <h2>Documents</h2>
            <DocumentsModule projectId={projectId} />
          </>
        )}

        {activeModule === "collaboration" && (
          <>
            <h2>Collaboration</h2>
            <CollaborationModule projectId={projectId} />
          </>
        )}

        {!["parcours", "atelier", "programmation", "projets-sources", "analyses", "documents", "collaboration"].includes(activeModule) && descriptor && (
          <>
            <h2>{descriptor.label}</h2>
            <p>{descriptor.status}</p>
          </>
        )}
      </main>
    </div>
  );
}
