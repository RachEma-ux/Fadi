import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, type ParcoursStep } from "../lib/api";
import { MODULES } from "../modules/module-registry";
import { AtelierPanel } from "../modules/atelier/AtelierPanel";

/**
 * Une étape, présentée en carte (conservé du Parcours d'origine — voir
 * AGENTS.md : « original phases, labels and mobile card presentation »).
 * La carte est un aperçu cliquable, pas le contenu complet : ouvrir l'étape
 * mène à la vue détaillée (StepDetail) avec navigation précédent/suivant —
 * c'est elle qui porte le contenu réel (décision, justification, donnée vs
 * hypothèse), jamais fabriqué pour une étape qui n'en a pas.
 */
function StepCard({ step, onOpen }: { step: ParcoursStep; onOpen: () => void }) {
  return (
    <article className={`step-card step-card-${step.status}`}>
      <button type="button" className="step-card-open" onClick={onOpen}>
        <div className="step-card-head">
          <strong>{String(step.number).padStart(2, "0")}</strong>
          <div>
            <span className="step-card-phase">{step.phase}</span>
            <h3>{step.title}</h3>
          </div>
          <span className={`step-dot step-dot-${step.status}`} aria-label={step.status === "termine" ? "Étape documentée" : "À faire"} />
        </div>
        {step.goal && <p className="step-card-goal">{step.goal}</p>}
        {step.status === "termine" && step.content.headline && <p className="step-card-headline">{step.content.headline} →</p>}
      </button>
    </article>
  );
}

/** Le contenu complet d'une étape — jamais fabriqué pour une étape qui n'en a pas (voir StepCard). */
function StepContentBody({ content }: { content: ParcoursStep["content"] }) {
  return (
    <div className="step-detail-body">
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
      {!content.decision && !content.headline && !content.result && (
        <p className="step-card-meta">Rien de documenté pour l'instant sur cette étape.</p>
      )}
    </div>
  );
}

/**
 * Vue d'une seule étape, avec navigation précédent/suivant — c'est le
 * « passage d'étape en étape » du Parcours d'origine : un flux séquentiel,
 * pas seulement une grille statique.
 */
function StepDetail({
  step,
  index,
  total,
  onBack,
  onPrev,
  onNext,
}: {
  step: ParcoursStep;
  index: number;
  total: number;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  return (
    <div className="step-detail">
      <div className="step-detail-top">
        <button type="button" className="button-secondary" onClick={onBack}>
          ← Vue d'ensemble
        </button>
        <div className="progress">
          <i style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <span className="step-detail-count">
          {index + 1} / {total}
        </span>
      </div>

      <span className="eyebrow">{step.phase}</span>
      <h3>
        {String(step.number).padStart(2, "0")} — {step.title}
      </h3>
      {step.goal && <p className="step-card-goal">{step.goal}</p>}
      {step.deliverable && (
        <p className="step-card-meta">
          <strong>Livrable attendu : </strong>
          {step.deliverable}
        </p>
      )}

      <StepContentBody content={step.content} />

      {step.harmonieOptions.length > 0 && (
        <details className="step-card-details">
          <summary>Propositions Harmonie pour cette étape ({step.harmonieOptions.length})</summary>
          <div className="step-detail-body">
            {step.harmonieOptions.map((opt, i) => (
              <div key={i} className="harmonie-option">
                <strong>{opt.title}</strong>
                <p>{opt.proposal}</p>
                <p className="step-card-meta">
                  {opt.benefit} · {opt.tradeoff}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      <nav className="step-detail-nav" aria-label="Navigation entre étapes">
        <button type="button" className="button-secondary" onClick={onPrev ?? undefined} disabled={!onPrev}>
          ← Étape précédente
        </button>
        <button type="button" className="button-primary" onClick={onNext ?? undefined} disabled={!onNext}>
          Étape suivante →
        </button>
      </nav>
    </div>
  );
}

function ParcoursSteps({ projectId }: { projectId: string }) {
  const stepsQuery = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });
  const [searchParams, setSearchParams] = useSearchParams();
  const etapeParam = searchParams.get("etape");
  const openNumber = etapeParam ? Number(etapeParam) : null;

  function openStep(number: number | null) {
    const next = new URLSearchParams(searchParams);
    if (number) next.set("etape", String(number));
    else next.delete("etape");
    setSearchParams(next, { replace: false });
  }

  if (stepsQuery.isLoading) {
    return <p role="status">Chargement des étapes…</p>;
  }
  if (stepsQuery.isError || !stepsQuery.data) {
    return <p role="alert">Impossible de charger les étapes du Parcours.</p>;
  }

  const steps = stepsQuery.data;
  const done = steps.filter((s) => s.status === "termine").length;

  if (openNumber) {
    const index = steps.findIndex((s) => s.number === openNumber);
    const step = steps[index];
    if (step) {
      return (
        <StepDetail
          step={step}
          index={index}
          total={steps.length}
          onBack={() => openStep(null)}
          onPrev={index > 0 ? () => openStep(steps[index - 1]!.number) : null}
          onNext={index < steps.length - 1 ? () => openStep(steps[index + 1]!.number) : null}
        />
      );
    }
  }

  return (
    <>
      <p className="parcours-steps-summary">
        {done} / {steps.length} étapes documentées
      </p>
      <section className="cards" aria-label="Les 21 étapes du Parcours">
        {steps.map((step) => (
          <StepCard key={step.number} step={step} onOpen={() => openStep(step.number)} />
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
