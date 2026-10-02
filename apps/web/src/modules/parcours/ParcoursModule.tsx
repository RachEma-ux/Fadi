/**
 * Module Parcours — les 21 étapes d'un projet : grille de cartes (vue
 * d'ensemble) et vue d'une étape avec son contenu réel : panneau Harmonie,
 * formulaire métier, indicateurs, répartition programmatique (06/07),
 * récit de l'exemple importé, navigation Précédente / Marquer terminée /
 * Suivante. L'étape ouverte vit dans l'URL (`?etape=N`) pour survivre à un
 * rechargement et aux boutons Précédent/Suivant du navigateur.
 */
import { lazy, Suspense, useState } from "react";
import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api, type ParcoursStep, type SiteObservationsInput } from "../../lib/api";
import { MUTATION_KEYS, adoptStep, recordConflict, type DecideVars, type StepPatchVars } from "../../lib/mutations";
import { AtelierHarmonyPage } from "../atelier/AtelierHarmonyPage";
import { DesignReviewFold } from "../atelier/DesignReview";
import { useProjectAccess } from "../../lib/access";
import { StepComments } from "../collaboration/CollaborationModule";
import { ImportProjectButton } from "../projets-sources/ImportProjectButton";
import { ParcelleTool } from "../projets-sources/ParcelleTool";
import { StepSources } from "../projets-sources/StepSources";
import { ProgrammeRepartition, ProgrammeTransfer } from "../programmation/ProgrammeRepartition";
import { LibraryFold, SiteQualitiesFold } from "../programmation/ProgrammeCase";
import { ProgrammeTransferFold } from "../programmation/ProgrammeTransferFold";
import { HarmoniePanel, HarmonieToast } from "./HarmoniePanel";
import { StepForm } from "./StepForm";

// Le moteur de l'Atelier (scripts, markup, feuille de style) n'est chargé qu'à la première ouverture des étapes 10 / 11 ou de l'Atelier.
const NativeAtelier = lazy(() => import("../atelier/NativeAtelier").then((m) => ({ default: m.NativeAtelier })));

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
        {step.retainedCount > 0 && (
          <p className="step-card-meta">
            Harmonie · {step.retainedCount} choix retenu(s){step.stale || step.staleRetainedCount > 0 ? " · à réexaminer" : ""}
          </p>
        )}
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
  onOpen,
  harmonieOpen,
}: {
  projectId: string;
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  index: number;
  total: number;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** `goto` : ouvrir une autre étape (origine d'une intention, destination d'un choix). */
  onOpen: (stepNumber: number) => void;
  /** `?harmonie=1` : arriver panneau Harmonie ouvert (« Ouvrir Harmony » depuis les vues du programme). */
  harmonieOpen: boolean;
}) {
  const queryClient = useQueryClient();
  const [harmonieErrors, setHarmonieErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  // Étape 10 : la sous-page « Harmonie du bâtiment » de l'Atelier (V8.4) réunit le panneau Harmonie, le programme lié et le bilan.
  const [harmonyPage, setHarmonyPage] = useState(false);
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), enabled: step.number === 10 });

  // Les arbitrages ont des effets sur d'autres étapes (cibles remises à faire, décision rétrogradée) : l'étape renvoyée remplace la sienne, le reste se relit.
  const adopt = (updated: ParcoursStep) => adoptStep(queryClient, projectId, updated);

  // Mutations à clé : mises en pause sans réseau, persistées et rejouées après rechargement (`lib/mutations.ts`).
  const patch = useMutation({
    mutationKey: MUTATION_KEYS.stepPatch,
    mutationFn: (v: StepPatchVars) => api.patchStep(v.projectId, v.stepNumber, v.body),
    onSuccess: adopt,
    onError: (err, v) => recordConflict(queryClient, projectId, err, `Étape ${pad2(step.number)} · saisie`, step.number, { attempted: v.body.fields ?? {} }),
  });
  const decide = useMutation({
    mutationKey: MUTATION_KEYS.decide,
    mutationFn: (v: DecideVars) => api.decideHarmonie(v.projectId, v.stepNumber, v.proposalId, v.input),
    onSuccess: (updated, { proposalId }) => {
      setHarmonieErrors((e) => {
        const { [proposalId]: _dropped, ...rest } = e;
        return rest;
      });
      adopt(updated);
      setToast("Choix enregistré et transmis comme intention ; aucun objet dessiné modifié.");
    },
    onError: (err, { proposalId, input }) => {
      const { expectedVersion, ...rest } = input;
      if (
        recordConflict(queryClient, projectId, err, `Étape ${pad2(step.number)} · arbitrage ${proposalId}`, step.number, {
          decision: { proposalId, input: rest, expectedVersion: expectedVersion ?? null },
        })
      )
        return;
      const message = err instanceof ApiError && err.serverMessage ? err.serverMessage : "L’arbitrage n’a pas pu être enregistré.";
      setHarmonieErrors((e) => ({ ...e, [proposalId]: message }));
    },
  });
  // Envois de cette étape en pause (hors-ligne) : visibles, jamais perdus en silence.
  const paused = useMutationState({
    filters: {
      status: "pending",
      predicate: (m) =>
        m.state.isPaused &&
        (m.state.variables as { projectId?: string; stepNumber?: number } | undefined)?.projectId === projectId &&
        (m.state.variables as { stepNumber?: number } | undefined)?.stepNumber === step.number,
    },
    select: (m) => m.mutationId,
  });
  const generate = useMutation({
    mutationFn: () => api.generateHarmonie(projectId, step.number),
    onSuccess: (updated) => {
      adopt(updated);
      setToast("Propositions actualisées ; les choix antérieurs sont conservés pour réexamen.");
    },
    onError: () => setToast("Les propositions n’ont pas pu être actualisées."),
  });

  const [siteError, setSiteError] = useState<string | null>(null);
  const saveSite = useMutation({
    mutationFn: (input: SiteObservationsInput) => api.putSiteObservations(projectId, input),
    onSuccess: (updated) => {
      setSiteError(null);
      adopt(updated);
      setToast("Données du site enregistrées ; propositions actualisées sous leurs hypothèses.");
    },
    onError: (err) => setSiteError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Les données du site n’ont pas pu être enregistrées."),
  });

  // Un envoi en pause (hors-ligne) ne bloque pas la suite du travail : il attend le réseau.
  // Projet partagé en lecture : les commandes d'écriture sont désactivées (le serveur les refuserait, 403).
  const access = useProjectAccess(projectId);
  const pending = !access.canWrite || (patch.isPending && !patch.isPaused) || (decide.isPending && !decide.isPaused) || generate.isPending || saveSite.isPending;
  const done = step.status === "termine";
  const intro =
    step.number === 1 ? "Point de départ autonome : importez directement la parcelle. Aucun PMO préalable n’est requis." : "Cette étape poursuit le dossier maître créé à partir de la parcelle.";

  return (
    <div className={`step-detail${harmonyPage ? " ah84-active-work" : ""}`}>
      <div className="step-detail-top">
        <button type="button" className="button-secondary" onClick={onBack}>
          ← Vue d'ensemble
        </button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1} aria-label={`Étape ${pad2(index + 1)} sur ${total}`}>
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

      {/* Étape 01 : l'outil Parcelle d'abord, puis Harmonie (prototype : `module.after(panel)`). */}
      {step.number === 1 && <ParcelleTool projectId={projectId} />}
      {step.number === 10 ? (
        /* Étape 10 : le panneau Harmonie, le programme lié et le bilan vivent dans la sous-page « Harmonie du bâtiment » de l'Atelier (bouton « Harmonie » de la barre d'outils, groupe Analyser). */
        <AtelierHarmonyPage
          projectName={projectQuery.data?.name ?? ""}
          open={harmonyPage}
          onOpenChange={setHarmonyPage}
          choices={
            <HarmoniePanel
              projectId={projectId}
              step={step}
              allSteps={allSteps}
              pending={pending}
              errors={harmonieErrors}
              onDecide={(proposalId, input) => decide.mutate({ projectId, stepNumber: step.number, proposalId, input })}
              onGenerate={() => generate.mutate()}
              onGoto={onOpen}
            />
          }
          programme={<ProgrammeTransfer projectId={projectId} />}
          bilan={<DesignReviewFold projectId={projectId} roomsAction />}
        />
      ) : (
        <HarmoniePanel
          projectId={projectId}
          step={step}
          allSteps={allSteps}
          pending={pending}
          errors={harmonieErrors}
          onDecide={(proposalId, input) => decide.mutate({ projectId, stepNumber: step.number, proposalId, input })}
          onGenerate={() => generate.mutate()}
          onGoto={onOpen}
          onSaveSite={step.number === 1 ? (input) => saveSite.mutate(input) : null}
          siteError={siteError}
          afterProposals={step.number === 7 ? <ProgrammeTransferFold projectId={projectId} onApplied={setToast} /> : null}
          initialOpen={harmonieOpen ? true : null}
        />
      )}
      <HarmonieToast text={toast} onDone={() => setToast(null)} />

      {step.number === 10 && !harmonyPage && (
        <p className="ah84-entry">
          <button type="button" className="button-secondary" id="ah84-open" aria-controls="atelier-harmonie-page" aria-expanded={harmonyPage} onClick={() => setHarmonyPage(true)}>
            ◈ Harmonie du bâtiment
          </button>
          <span className="h7-muted">Choix & intentions, programme lié et bilan du bâtiment — aussi depuis « Analyser → Harmonie » dans l’Atelier.</span>
        </p>
      )}
      {/* Étape 11 : bilan Harmonie du bâtiment conçu (flow-v62 `designHTML`) dans le flux de l'étape. */}
      {step.number === 11 && <DesignReviewFold projectId={projectId} />}
      {(step.number === 10 || step.number === 11) && (
        <Suspense fallback={<p role="status">Chargement de l’Atelier…</p>}>
          <NativeAtelier projectId={projectId} stage={step.number} readOnly={!access.canWrite} />
        </Suspense>
      )}

      <StepStory step={step} />

      {paused.length > 0 && (
        <p className="offline-banner offline-banner-inline" role="status">
          {paused.length} envoi(s) de cette étape en attente du réseau : enregistré(s) sur cet appareil, transmis au retour de la connexion (même après rechargement).
        </p>
      )}
      <StepForm
        step={step}
        allSteps={allSteps}
        pending={pending}
        readOnly={!access.canWrite}
        onCommit={(fields, baseline) => patch.mutate({ projectId, stepNumber: step.number, body: { fields, baseline } })}
      />
      {(step.number === 6 || step.number === 7) && <ProgrammeRepartition projectId={projectId} />}

      {/* Bibliothèque des bâtiments : « Exemples · qualités du site » (01–03) ou « Bibliothèque d’exemples par type de bâtiment » / programme lié (≥ 04). */}
      {step.number <= 3 ? <SiteQualitiesFold projectId={projectId} siteText={step.profile.site} /> : <LibraryFold projectId={projectId} />}
      <StepSources projectId={projectId} stepNumber={step.number} />
      <StepComments projectId={projectId} stepNumber={step.number} />

      {patch.isError && !(patch.error instanceof ApiError && patch.error.status === 409) && (
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
            onClick={() => patch.mutate({ projectId, stepNumber: step.number, body: { status: done ? "en-cours" : "termine" } })}
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

/** « Documents de base intégrés » de la vue d'ensemble du projet d'exemple (prototype) : les fichiers du prototype, sources des étapes 01 et 02. */
function BaseDocuments({ projectId }: { projectId: string }) {
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const base = project.data?.baseDocuments;
  if (!base) return null;
  return (
    <div className="seed888">
      <strong>Documents de base intégrés</strong>
      <div className="biz-actions">
        {base.files.map((f) => (
          <a
            key={f.id}
            className="button-secondary"
            href={api.stepFileUrl(projectId, f.stepNumber, f.id)}
            download={f.name}
            title={`${f.note} · source de l'étape ${String(f.stepNumber).padStart(2, "0")}`}
          >
            {f.name}
          </a>
        ))}
      </div>
      <p>{base.caption}</p>
    </div>
  );
}

export function ParcoursModule({ projectId }: { projectId: string }) {
  const stepsQuery = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });
  const [searchParams, setSearchParams] = useSearchParams();
  // Message transmis par la page précédente (« Import créé dans un nouveau dossier… »), affiché une fois.
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const etapeParam = searchParams.get("etape");
  const openNumber = etapeParam ? Number(etapeParam) : null;
  const harmonieOpen = searchParams.get("harmonie") === "1";

  function openStep(number: number | null) {
    const next = new URLSearchParams(searchParams);
    if (number) next.set("etape", String(number));
    else next.delete("etape");
    setSearchParams(next, { replace: false });
  }

  if (stepsQuery.isLoading) {
    return <p role="status">Chargement des étapes…</p>;
  }
  if (!stepsQuery.data) {
    return <p role="alert">Impossible de charger les étapes du Parcours.</p>;
  }

  const steps = stepsQuery.data;
  const done = steps.filter((s) => s.status === "termine").length;

  if (openNumber) {
    const index = steps.findIndex((s) => s.number === openNumber);
    const step = steps[index];
    if (step) {
      return (
        <>
          <HarmonieToast text={notice} onDone={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })} />
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
            onOpen={openStep}
            harmonieOpen={harmonieOpen}
          />
        </>
      );
    }
  }

  const phases = [...new Set(steps.map((s) => s.phase))];
  return (
    <>
      <HarmonieToast text={notice} onDone={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })} />
      <BaseDocuments projectId={projectId} />
      <div className="overview-progress">
        <span className="parcours-steps-summary">
          {done} / {steps.length} étapes terminées
        </span>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label={`${done} étapes terminées sur ${steps.length}`}>
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
      {/* « Outils du projet » de la vue d'ensemble : sauvegarde / import JSON (module Projets et sources) et synthèse des choix Harmonie. */}
      <details className="fold-card project-tools" id="parcours-project-tools">
        <summary>Outils du projet</summary>
        <div className="fold-card-body">
          <div className="h7-actions">
            <a className="button-secondary" href={api.projectArchiveUrl(projectId)} download>
              Sauvegarder projet JSON
            </a>
            <ImportProjectButton />
            <a className="button-secondary" href={api.harmonieReportUrl(projectId, null)} download>
              Exporter la synthèse des choix Harmonie
            </a>
          </div>
        </div>
      </details>
    </>
  );
}
