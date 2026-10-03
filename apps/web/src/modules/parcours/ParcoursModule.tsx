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
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api, type ParcoursStep, type Project, type SiteObservationsInput } from "../../lib/api";
import { ReferenceAnswers, ReferenceHarmoniePanel } from "./ReferenceExample";
import { useImmersive } from "../../lib/use-immersive";
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
import { HarmoniePanel, HarmonieToast, type HarmonieTab } from "./HarmoniePanel";
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
 * Bandeau du prototype (`header.top.atelier-stage-header`) : titre
 * « Parcours du projet » (« Atelier Architectural » aux étapes 10 / 11),
 * « ÉTAPE NN / 21 · phase » dans une étape, et ses actions : « ◈ Harmonie
 * de l’étape » (ouvre le panneau), « ← » (retour au parcours), « ⌂ »
 * (accueil · projets). Même disposition sur ordinateur et téléphone.
 */
export function StageStrip({ title, stage, subtitle = null, onHarmonie = null, onBack, onHome }: { title: string; stage: { number: number; total: number; phase: string } | null; /** Sans étape : le projet (code — nom), lisible quand l'en-tête de Fadi est masqué (téléphone). */ subtitle?: string | null; onHarmonie?: (() => void) | null; onBack: () => void; onHome: () => void }) {
  return (
    <header className="top atelier-stage-header">
      <div className="atelier-stage-titleblock">
        <div className="atelier-stage-title">{title}</div>
        {stage ? <div className="top-stage">{`ÉTAPE ${pad2(stage.number)} / ${stage.total} · ${stage.phase}`}</div> : subtitle ? <div className="top-stage top-stage-project">{subtitle}</div> : null}
      </div>
      <div className="atelier-stage-actions">
        {onHarmonie && (
          <button type="button" id="h7-shortcut" className="h7-btn on-dark" onClick={onHarmonie}>
            ◈ Harmonie de l’étape
          </button>
        )}
        <button type="button" className="stage-icon-btn workflow-back" aria-label="Retour au parcours" title="Retour au parcours" onClick={onBack}>
          ←
        </button>
        <button type="button" className="stage-icon-btn" aria-label="Accueil · Projets" title="Accueil · Projets" onClick={onHome}>
          ⌂
        </button>
      </div>
    </header>
  );
}

/**
 * Une étape de la grille de la vue d'ensemble (`overview-step` du prototype,
 * conservé — AGENTS.md : « original phases, labels and mobile card
 * presentation ») : numéro, phase, intitulé (suffixe « · à réexaminer »
 * quand l'étape ou un choix retenu est périmé), terminée = liseré haut.
 */
function StepCard({ step, onOpen }: { step: ParcoursStep; onOpen: () => void }) {
  const stale = step.stale || step.staleRetainedCount > 0;
  return (
    <button type="button" className={`overview-step step-card step-card-${step.status}${step.status === "termine" ? " done" : ""}`} data-n={step.number} aria-label={`${pad2(step.number)} · ${step.title} · ${STATUS_LABEL[step.status]}`} onClick={onOpen}>
      <span className="on">{pad2(step.number)}</span>
      <span className="op">{step.phase}</span>
      <span className="ot">
        {step.title}
        {stale ? " · à réexaminer" : ""}
      </span>
    </button>
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
  project,
  onHome,
}: {
  projectId: string;
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  /** Le projet (mode référence d'un exemple, provenance) ; `null` tant qu'il n'est pas lu. */
  project: Project | null;
  index: number;
  total: number;
  onBack: () => void;
  /** « ⌂ » du bandeau : accueil · projets. */
  onHome: () => void;
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
  // « Voir le choix Harmonie et sa transmission » : le panneau s'ouvre sur l'onglet demandé (à l'étape 10, dans la sous-page « Harmonie du bâtiment »).
  const [harmonieFocus, setHarmonieFocus] = useState<{ tab: HarmonieTab; nonce: number } | null>(null);
  function showTransmission() {
    if (step.number === 10) setHarmonyPage(true);
    setHarmonieFocus((f) => ({ tab: "transfer", nonce: (f?.nonce ?? 0) + 1 }));
  }
  // Référence protégée de l'exemple (`isRead(p)`) : présentation du prototype — réponses en lecture, panneau Harmonie de l'exemple,
  // « Étape illustrée ✓ » ; les copies (« Essayer une variante en copie ») ont les formulaires et le panneau modifiables.
  const reference = project?.exampleMode === "reference";
  // Actions du panneau de l'exemple aux étapes 10 / 11 (« Lire le bilan du bâtiment conçu », « Voir les capacités et ambiances ») → bilan ouvert.
  const [bilanRequest, setBilanRequest] = useState<{ action: "building" | "rooms"; nonce: number } | null>(null);
  const bilanActions =
    step.number === 10 || step.number === 11 ? (
      <div className="ex81-actions">
        <button type="button" className="button-primary" onClick={() => setBilanRequest((r) => ({ action: "building", nonce: (r?.nonce ?? 0) + 1 }))}>
          Lire le bilan du bâtiment conçu
        </button>
        <button type="button" className="button-secondary" onClick={() => setBilanRequest((r) => ({ action: "rooms", nonce: (r?.nonce ?? 0) + 1 }))}>
          Voir les capacités et ambiances des {step.model?.roomCount ?? 62} zones
        </button>
        <a className="button-secondary" href={api.designReportUrl(projectId)} download>
          Exporter le bilan
        </a>
      </div>
    ) : null;

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

  // « ◈ Harmonie de l’étape » du bandeau (`A.open(cur)`) : panneau ouvert sur « Proposer », amené à l'écran.
  function openHarmonie() {
    if (step.number === 10) setHarmonyPage(true);
    setHarmonieFocus((f) => ({ tab: "proposals", nonce: (f?.nonce ?? 0) + 1 }));
  }
  const atelierStep = step.number === 10 || step.number === 11;
  // Étapes 10 / 11 : la page est l'Atelier Architectural (prototype) — enveloppe de Fadi effacée, titre et intro repliés sous le dessin (`stage10-fold`).
  useImmersive(atelierStep);

  return (
    <div className={`step-detail${atelierStep ? " step-detail-atelier" : ""}`}>
      <StageStrip title={atelierStep ? "Atelier Architectural" : "Parcours du projet"} stage={{ number: index + 1, total, phase: step.phase }} onHarmonie={step.number === 10 ? null : openHarmonie} onBack={onBack} onHome={onHome} />
      <div className={`work${harmonyPage ? " ah84-active-work" : ""}`}>
      {!atelierStep && (
        <>
          <h1 className="step-detail-title">{step.title}</h1>
          <p className="step-intro">{intro}</p>
        </>
      )}

      {(() => {
        const panel = reference ? (
          <ReferenceHarmoniePanel projectId={projectId} step={step} allSteps={allSteps} project={project} onGoto={onOpen} focus={harmonieFocus} bilan={bilanActions} onShowTransmission={showTransmission} />
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
            focus={harmonieFocus}
          />
        );
        if (step.number === 1) {
          /* Étape 01 : l'outil Parcelle, le panneau Harmonie dans sa colonne gauche (prototype : `ParcoursSectionsV82.place`). */
          return <ParcelleTool projectId={projectId} harmonie={panel} />;
        }
        return step.number === 10 ? (
          /* Étape 10 : le panneau Harmonie, le programme lié et le bilan vivent dans la sous-page « Harmonie du bâtiment » de l'Atelier (bouton « Harmonie » de la barre d'outils, groupe Analyser). */
          <AtelierHarmonyPage projectName={project?.name ?? ""} open={harmonyPage} onOpenChange={setHarmonyPage} choices={panel} programme={<ProgrammeTransfer projectId={projectId} />} bilan={<DesignReviewFold projectId={projectId} roomsAction request={bilanRequest} />} />
        ) : (
          panel
        );
      })()}
      <HarmonieToast text={toast} onDone={() => setToast(null)} />

      {(step.number === 10 || step.number === 11) && (
        <Suspense fallback={<p role="status">Chargement de l’Atelier…</p>}>
          <NativeAtelier projectId={projectId} stage={step.number} readOnly={!access.canWrite} />
        </Suspense>
      )}
      {step.number === 10 && !harmonyPage && (
        <p className="ah84-entry">
          <button type="button" className="button-secondary" id="ah84-open" aria-controls="atelier-harmonie-page" aria-expanded={harmonyPage} onClick={() => setHarmonyPage(true)}>
            ◈ Harmonie du bâtiment
          </button>
          <span className="h7-muted">Choix & intentions, programme lié et bilan du bâtiment — aussi depuis « Analyser → Harmonie » dans l’Atelier.</span>
        </p>
      )}
      {/* Étape 11 : bilan Harmonie du bâtiment conçu (flow-v62 `designHTML`) dans le flux de l'étape. */}
      {step.number === 11 && <DesignReviewFold projectId={projectId} roomsAction={reference} request={bilanRequest} />}
      {atelierStep && (
        <details className="stage10-fold">
          <summary>{step.title}</summary>
          <div className="stage10-fold-body">
            <p className="stage10-intro">{intro}</p>
          </div>
        </details>
      )}

      {paused.length > 0 && (
        <p className="offline-banner offline-banner-inline" role="status">
          {paused.length} envoi(s) de cette étape en attente du réseau : enregistré(s) sur cet appareil, transmis au retour de la connexion (même après rechargement).
        </p>
      )}
      {/* Référence de l'exemple : `bookBlock` (réponses en lecture) à la place du formulaire ; les étapes outillées (01, 10, 11) gardent leur outil. */}
      {reference && !atelierStep && step.number !== 1 ? (
        <ReferenceAnswers step={step} allSteps={allSteps} />
      ) : (
        <StepForm
          step={step}
          allSteps={allSteps}
          pending={pending}
          readOnly={!access.canWrite}
          onCommit={(fields, baseline) => patch.mutate({ projectId, stepNumber: step.number, body: { fields, baseline } })}
        />
      )}
      {(step.number === 6 || step.number === 7) && <ProgrammeRepartition projectId={projectId} />}

      {/* Bibliothèque des bâtiments : « Exemples · qualités du site » (01–03) ou « Bibliothèque d’exemples par type de bâtiment » / programme lié (≥ 04) — absents de la référence (`exampleBlock` vide en mode référence). */}
      {!reference && (step.number <= 3 ? <SiteQualitiesFold projectId={projectId} siteText={step.profile.site} /> : <LibraryFold projectId={projectId} />)}
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
            disabled={pending || (reference && done)}
            onClick={() => patch.mutate({ projectId, stepNumber: step.number, body: { status: done ? "en-cours" : "termine" } })}
          >
            {done ? (reference ? "Étape illustrée ✓" : "Terminée ✓") : "Marquer terminée"}
          </button>
          <button type="button" className="button-primary" onClick={onNext ?? undefined} disabled={!onNext}>
            Suivante →
          </button>
        </span>
      </nav>
      </div>
    </div>
  );
}

/** « Documents de base intégrés » de la vue d'ensemble du projet d'exemple (`seed888` du prototype) : les fichiers du prototype, sources des étapes 01 et 02. */
function BaseDocuments({ project }: { project: Project | null }) {
  const base = project?.baseDocuments;
  if (!base) return null;
  return (
    <div className="seed888">
      <strong>Documents de base intégrés</strong>
      <div className="biz-actions">
        {base.files.map((f) => (
          <a
            key={f.id}
            className="button-secondary"
            href={api.stepFileUrl(project!.id, f.stepNumber, f.id)}
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
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const project = projectQuery.data ?? null;
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
            project={project}
            onHome={() => navigate("/projets")}
          />
        </>
      );
    }
  }

  const phases = [...new Set(steps.map((s) => s.phase))];
  // Vue d'ensemble du prototype (`overview()`) : « ← Projets » / « Exemples », kicker, documents de base, titre, sous-titre, progression, phases, grille des 21 étapes.
  return (
    <>
      <HarmonieToast text={notice} onDone={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })} />
      <StageStrip title="Parcours du projet" stage={null} subtitle={project ? `${project.code} — ${project.name}` : null} onBack={() => navigate("/projets")} onHome={() => navigate("/projets")} />
      <main className="overview">
        <div className="overview-actions">
          <Link className="btn back-overview" to="/projets">
            ← Projets
          </Link>
          <Link className="btn" to="/projets#exemples">
            Exemples
          </Link>
        </div>
        <section className="overview-head">
          <div className="overview-kicker">PARCOURS DU PROJET</div>
          <BaseDocuments project={project} />
          <h1>Étude du potentiel de la parcelle</h1>
          <p className="overview-sub">Un flux métier unique, de la parcelle existante jusqu’à la décision puis à l’engagement du projet.</p>
          <div className="overview-progress">
            <span className="parcours-steps-summary">
              {/* Référence de l'exemple entièrement illustrée : libellé du prototype (`stampUI`). */}
              {project?.exampleMode === "reference" && done === steps.length ? `${done} / ${steps.length} étapes illustrées · réponses complètes, validations réelles distinctes` : `${done} / ${steps.length} étapes terminées`}
            </span>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label={`${done} étapes terminées sur ${steps.length}`}>
              <i style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
          </div>
          <div className="overview-phases" aria-label="Phases" tabIndex={0}>
            {phases.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </section>
        <section className="overview-grid" aria-label="Les 21 étapes du Parcours">
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
      </main>
    </>
  );
}
