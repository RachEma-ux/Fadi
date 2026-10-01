import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, type ParcoursStep } from "../lib/api";
import { MODULES } from "../modules/module-registry";
import { AtelierPanel } from "../modules/atelier/AtelierPanel";

/**
 * Une étape, présentée en carte (conservé du Parcours d'origine — voir
 * AGENTS.md : « original phases, labels and mobile card presentation »).
 * Le contenu réel (décision retenue, justification, donnée vs hypothèse)
 * n'apparaît que si l'étape en a — vide par défaut, rempli par import
 * d'exemple. On ne fabrique jamais un contenu que l'étape n'a pas.
 */
function StepCard({ step }: { step: ParcoursStep }) {
  const { content } = step;
  const hasContent = step.status === "termine";
  return (
    <article className={`step-card step-card-${step.status}`}>
      <div className="step-card-head">
        <strong>{String(step.number).padStart(2, "0")}</strong>
        <div>
          <span className="step-card-phase">{step.phase}</span>
          <h3>{step.title}</h3>
        </div>
        <span className={`step-dot step-dot-${step.status}`} aria-label={step.status === "termine" ? "Étape documentée" : "À faire"} />
      </div>
      {step.goal && <p className="step-card-goal">{step.goal}</p>}
      {hasContent && (
        <details className="step-card-details">
          <summary>{content.headline ?? "Voir la décision retenue"}</summary>
          <div className="step-card-body">
            {content.decision && (
              <p>
                <strong>Décision : </strong>
                {content.decision}
              </p>
            )}
            {content.why && (
              <p>
                <strong>Pourquoi : </strong>
                {content.why}
              </p>
            )}
            {content.alternatives && (
              <p>
                <strong>Non retenu : </strong>
                {content.alternatives}
              </p>
            )}
            {content.result?.donnee && (
              <p className="step-card-donnee">
                <strong>Donnée / calcul : </strong>
                {content.result.donnee}
              </p>
            )}
            {content.result?.hypothese && (
              <p className="step-card-hypothese">
                <strong>Hypothèse retenue : </strong>
                {content.result.hypothese}
              </p>
            )}
            {content.result?.raw && <p>{content.result.raw}</p>}
            {content.owner && (
              <p className="step-card-meta">
                {content.owner}
                {content.proof ? ` · ${content.proof}` : ""}
              </p>
            )}
            {content.sourceStatus && <p className="step-card-source-status">{content.sourceStatus}</p>}
          </div>
        </details>
      )}
    </article>
  );
}

function ParcoursSteps({ projectId }: { projectId: string }) {
  const stepsQuery = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });

  if (stepsQuery.isLoading) {
    return <p role="status">Chargement des étapes…</p>;
  }
  if (stepsQuery.isError || !stepsQuery.data) {
    return <p role="alert">Impossible de charger les étapes du Parcours.</p>;
  }

  const done = stepsQuery.data.filter((s) => s.status === "termine").length;

  return (
    <>
      <p className="parcours-steps-summary">
        {done} / {stepsQuery.data.length} étapes documentées
      </p>
      <section className="cards" aria-label="Les 21 étapes du Parcours">
        {stepsQuery.data.map((step) => (
          <StepCard key={step.number} step={step} />
        ))}
      </section>
    </>
  );
}

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
            <ParcoursSteps projectId={projectId} />
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

        {activeModule !== "parcours" && activeModule !== "atelier" && descriptor && (
          <>
            <h2>{descriptor.label}</h2>
            <p>{descriptor.status}</p>
          </>
        )}
      </main>
    </div>
  );
}
