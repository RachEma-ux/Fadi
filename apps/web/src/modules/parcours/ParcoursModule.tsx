/**
 * Module Parcours — les 21 étapes d'un projet : grille de cartes (vue
 * d'ensemble) et vue d'une étape avec son contenu réel : panneau Harmonie,
 * formulaire métier, indicateurs, répartition programmatique (06/07),
 * récit de l'exemple importé, navigation Précédente / Marquer terminée /
 * Suivante. L'étape ouverte vit dans l'URL (`?etape=N`) pour survivre à un
 * rechargement et aux boutons Précédent/Suivant du navigateur.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ApiError, api, type HarmonieDecisionInput, type ParcoursFieldValue, type ParcoursStep } from "../../lib/api";
import { ProgrammeRepartition, ProgrammeTransfer } from "../programmation/ProgrammeRepartition";
import { HarmoniePanel } from "./HarmoniePanel";
import { StepForm } from "./StepForm";

const pad2 = (n: number) => String(n).padStart(2, "0");

const STATUS_LABEL: Record<ParcoursStep["status"], string> = {
  "a-faire": "À faire",
  "en-cours": "En cours",
  termine: "Terminée",
};

/**
 * Une étape, présentée en carte (conservé du Parcours d'origine — voir
 * AGENTS.md : « original phases, labels and mobile card presentation »).
 * La carte est un aperçu cliquable ; la vue détaillée porte le contenu.
 */
function StepCard({ step, onOpen }: { step: ParcoursStep; onOpen: () => void }) {
  return (
    <article className={`step-card step-card-${step.status}`}>
      <button type="button" className="step-card-open" onClick={onOpen}>
        <div className="step-card-head">
          <strong>{pad2(step.number)}</strong>
          <div>
            <span className="step-card-phase">{step.phase}</span>
            <h3>{step.title}</h3>
          </div>
          <span className={`step-dot step-dot-${step.status}`} aria-label={STATUS_LABEL[step.status]} />
        </div>
        {step.goal && <p className="step-card-goal">{step.goal}</p>}
        {step.content.headline && <p className="step-card-headline">{step.content.headline} →</p>}
        {step.retainedCount > 0 && <p className="step-card-meta">Harmonie · {step.retainedCount} choix retenu(s)</p>}
      </button>
    </article>
  );
}

/** Le récit de l'exemple importé (décision, justification, donnée vs hypothèse) — jamais fabriqué pour une étape qui n'en a pas. */
function StepStory({ step }: { step: ParcoursStep }) {
  const content = step.content;
  if (!content.decision && !content.headline && !content.result) return null;
  return (
    <section className="ex81 ex81-story" aria-labelledby={`story-${step.number}`}>
      {content.headline && <h2 id={`story-${step.number}`}>{content.headline}</h2>}
      <div className="step-detail-body">
        {content.decision && (
          <p>
            <strong>Décision : </strong>
            {content.decision}
          </p>
        )}
        {content.why && (
          <>
            <h3>Pourquoi ce choix</h3>
            <p>{content.why}</p>
          </>
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
    </section>
  );
}

function StepDetail({
  projectId,
  step,
  allSteps,
  index,
  total,
  onBack,
  onPrev,
  onNext,
}: {
  projectId: string;
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  index: number;
  total: number;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const queryClient = useQueryClient();
  const [harmonieErrors, setHarmonieErrors] = useState<Record<string, string>>({});

  function adopt(updated: ParcoursStep) {
    queryClient.setQueryData<ParcoursStep[]>(["steps", projectId], (list) => (list ?? []).map((s) => (s.number === updated.number ? updated : s)));
    // Les arbitrages ont des effets sur d'autres étapes (cibles remises à faire, décision rétrogradée).
    void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
  }

  const patch = useMutation({
    mutationFn: (body: { status?: ParcoursStep["status"]; fields?: Record<string, ParcoursFieldValue> }) => api.patchStep(projectId, step.number, body),
    onSuccess: adopt,
  });
  const decide = useMutation({
    mutationFn: ({ proposalId, input }: { proposalId: string; input: HarmonieDecisionInput }) => api.decideHarmonie(projectId, step.number, proposalId, input),
    onSuccess: (updated, { proposalId }) => {
      setHarmonieErrors((e) => {
        const { [proposalId]: _dropped, ...rest } = e;
        return rest;
      });
      adopt(updated);
    },
    onError: (err, { proposalId }) => {
      const message = err instanceof ApiError && err.serverMessage ? err.serverMessage : "L’arbitrage n’a pas pu être enregistré.";
      setHarmonieErrors((e) => ({ ...e, [proposalId]: message }));
    },
  });

  const pending = patch.isPending || decide.isPending;
  const done = step.status === "termine";
  const intro =
    step.number === 1
      ? "Point de départ autonome : importez directement la parcelle. Aucun PMO préalable n’est requis."
      : "Cette étape poursuit le dossier maître créé à partir de la parcelle.";

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
          Étape {pad2(index + 1)} / {total} · {step.phase}
        </span>
      </div>

      <h3 className="step-detail-title">{step.title}</h3>
      <p className="step-card-goal">{intro}</p>
      {step.goal && (
        <p className="step-card-meta">
          <strong>Objectif : </strong>
          {step.goal}
          {step.deliverable ? (
            <>
              {" "}
              <strong>Livrable : </strong>
              {step.deliverable}
            </>
          ) : null}
        </p>
      )}

      <HarmoniePanel
        step={step}
        allSteps={allSteps}
        pending={pending}
        errors={harmonieErrors}
        onDecide={(proposalId, input) => decide.mutate({ proposalId, input })}
      />

      {step.number === 10 && <ProgrammeTransfer projectId={projectId} />}
      {(step.number === 1 || step.number === 10 || step.number === 11) && (
        <section className="biz-card tool-pending" aria-live="polite">
          <h2>{step.number === 1 ? "Parcelle-1 · Import KML/KMZ + MapTiler" : "Atelier architectural"}</h2>
          <p className="biz-sub">
            {step.number === 1
              ? "L’outil cartographique de la parcelle du prototype (bornes, cotes, fond satellite) n’est pas encore porté dans Fadi ; les bornes P.118 et leurs coordonnées sont conservées avec le projet importé."
              : "Les outils de dessin de l’Atelier du prototype ne sont pas encore portés dans Fadi ; le module Atelier affiche pour l’instant les murs du modèle importé."}
          </p>
        </section>
      )}

      <StepStory step={step} />

      <StepForm step={step} allSteps={allSteps} pending={pending} onCommit={(fields) => patch.mutate({ fields })} />
      {(step.number === 6 || step.number === 7) && <ProgrammeRepartition projectId={projectId} />}

      {patch.isError && (
        <p role="alert" className="h7-error">
          {patch.error instanceof ApiError && patch.error.serverMessage ? patch.error.serverMessage : "La saisie n’a pas pu être enregistrée."}
        </p>
      )}

      <nav className="step-detail-nav" aria-label="Navigation entre étapes">
        <button type="button" className="button-secondary" onClick={onPrev ?? undefined} disabled={!onPrev}>
          ← Précédente
        </button>
        <span className="step-detail-nav-right">
          <button
            type="button"
            className={done ? "button-secondary step-done" : "button-secondary"}
            aria-pressed={done}
            disabled={pending}
            onClick={() => patch.mutate({ status: done ? "en-cours" : "termine" })}
          >
            {done ? "Terminée ✓" : "Marquer terminée"}
          </button>
          <button type="button" className="button-primary" onClick={onNext ?? undefined} disabled={!onNext}>
            Suivante →
          </button>
        </span>
      </nav>
    </div>
  );
}

export function ParcoursModule({ projectId }: { projectId: string }) {
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
          key={step.number}
          projectId={projectId}
          step={step}
          allSteps={steps}
          index={index}
          total={steps.length}
          onBack={() => openStep(null)}
          onPrev={index > 0 ? () => openStep(steps[index - 1]!.number) : null}
          onNext={index < steps.length - 1 ? () => openStep(steps[index + 1]!.number) : null}
        />
      );
    }
  }

  const phases = [...new Set(steps.map((s) => s.phase))];
  return (
    <>
      <div className="overview-progress">
        <span className="parcours-steps-summary">{done} / {steps.length} étapes terminées</span>
        <div className="progress">
          <i style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>
      <div className="overview-phases" aria-label="Phases">
        {phases.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
      <section className="cards" aria-label="Les 21 étapes du Parcours">
        {steps.map((step) => (
          <StepCard key={step.number} step={step} onOpen={() => openStep(step.number)} />
        ))}
      </section>
    </>
  );
}
