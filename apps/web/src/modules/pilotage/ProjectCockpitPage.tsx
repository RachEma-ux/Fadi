import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, type ParcoursStep } from "../../lib/api";
import { denied } from "../accueil/dossier-data";
import { useAuth } from "../../lib/auth-context";
import { rememberDossier } from "../../lib/last-dossier";
import { RoadmapPreview } from "./RoadmapPreview";
import { COCKPIT_CAPABILITIES, cockpitCapabilityHref, cockpitCapabilityLabel } from "./capabilities";
import { COCKPIT_PHASES, COCKPIT_STATUS_LABEL, cockpitPhaseProgress, cockpitPhaseStatus, cockpitStepStatus, cockpitSteps } from "./roadmap";
import "./pilotage.css";

type View = "board" | "table";
const pad = (value: number) => String(value).padStart(2, "0");

function Status({ status }: { status: "done" | "doing" | "todo" | "unavailable" }) {
  return <span className={`cockpit-dot cockpit-dot-${status}`} title={COCKPIT_STATUS_LABEL[status]} aria-hidden="true" />;
}

/** Native React integration; no iframe, shadow application or localStorage authority. */
export function ProjectCockpitPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) throw new Error("Identifiant du projet manquant");
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    staleTime: 30_000,
    retry: (count, error) => !denied(error) && count < 1,
  });
  const stepsQuery = useQuery({
    queryKey: ["steps", projectId],
    queryFn: () => api.listSteps(projectId),
    enabled: !!project.data && !denied(project.error),
    staleTime: 60_000,
    retry: (count, error) => !denied(error) && count < 1,
  });
  const [view, setView] = useState<View>("board");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const { user } = useAuth();
  const recordedProject = useRef<string | null>(null);
  useEffect(() => {
    setSelectedNumber(null);
    setView("board");
    setPanelOpen(true);
  }, [projectId]);
  useEffect(() => {
    // Opening a cockpit directly counts as consulting this project, without
    // replacing a deliberately selected Atelier / Programme work context.
    if (user && project.data?.id === projectId && !denied(project.error) && recordedProject.current !== `${user.id}:${projectId}`) {
      recordedProject.current = `${user.id}:${projectId}`;
      rememberDossier(user.id, projectId);
    }
  }, [user?.id, projectId, project.data?.id, project.error]);

  // Never display stale cached detail from a different project.
  const steps = project.data && !denied(project.error) && !denied(stepsQuery.error) ? cockpitSteps(stepsQuery.data) : null;
  const selected: ParcoursStep | null = steps?.find((step) => step.number === selectedNumber) ?? null;
  const done = steps?.filter((step) => step.status === "termine").length ?? null;
  const reexamine = steps?.filter((step) => step.stale || step.staleRetainedCount > 0).length ?? null;
  const projectRoot = `/projets/${encodeURIComponent(projectId)}`;
  const stepHref = (number: number) => `${projectRoot}?module=parcours&etape=${number}`;

  if (project.isPending) return <main className="cockpit-page"><p role="status">Chargement du projet…</p></main>;
  if (!project.data || denied(project.error)) return <main className="cockpit-page"><p role="alert">Projet introuvable ou accès refusé.</p><Link to="/projets">Retour aux projets</Link></main>;
  if (project.isError) return <main className="cockpit-page"><p role="alert">Impossible de vérifier les informations de ce projet.</p><button type="button" onClick={() => void project.refetch()}>Réessayer</button></main>;

  function select(number: number) {
    setSelectedNumber(number);
    setPanelOpen(true);
  }

  return <main className="cockpit-page">
    <div className="cockpit-header">
      <div className="cockpit-identity">
        <strong className="cockpit-code" translate="no">{project.data.code}</strong>
        <div><h2>{project.data.name}</h2><p>Feuille de route · Pilotage métier du dossier</p></div>
      </div>
      <div className="cockpit-header-actions">
        <Link className="cockpit-action" to={projectRoot} aria-label="Retour à l’accueil du projet">← <span className="sr-only">Accueil du projet</span></Link>
        <button type="button" className="cockpit-action primary" onClick={() => setView(view === "board" ? "table" : "board")}>{view === "board" ? "Vue tableau" : "Vue feuille de route"}</button>
        <button type="button" className="cockpit-action" aria-label={panelOpen ? "Masquer le panneau de pilotage" : "Afficher le panneau de pilotage"} aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>☷</button>
      </div>
    </div>
    {!steps && <p role="status" className="cockpit-note">{stepsQuery.isFetching || stepsQuery.isPending ? "Chargement de l’avancement du Parcours…" : "La liste complète des 21 étapes est indisponible. Les statuts ne sont pas déduits des valeurs manquantes."} {stepsQuery.isError && <button type="button" onClick={() => void stepsQuery.refetch()}>Réessayer</button>}</p>}
    <div className="cockpit-stage-shell">
      <div className="cockpit-stage-viewport">
        <div className="cockpit-stage" style={{ zoom: view === "board" ? zoom / 100 : 1 }}>
          {view === "board" ? <>
            <div className="cockpit-phase-strip" role="group" aria-label="Six phases du Parcours">
              {COCKPIT_PHASES.map((phase, index) => {
                const status = cockpitPhaseStatus(steps, phase.first, phase.last);
                const count = cockpitPhaseProgress(steps, phase.first, phase.last);
                const own = steps?.filter((step) => step.number >= phase.first && step.number <= phase.last) ?? [];
                return <section key={phase.name} className="cockpit-phase" style={{ "--phase-color": phase.color, "--phase-soft": phase.soft } as CSSProperties}>
                  <header className="cockpit-phase-head">
                    <small>PHASE {pad(index + 1)} / 06</small>
                    <h3>{phase.name}</h3>
                    <p>Étapes {pad(phase.first)}–{pad(phase.last)} · {COCKPIT_STATUS_LABEL[status]}</p>
                  </header>
                  <div className="cockpit-phase-steps">
                    {own.length ? own.map((step) => <button key={step.number} type="button" className={`cockpit-step${selectedNumber === step.number ? " selected" : ""}`} onClick={() => select(step.number)} aria-label={`Étape ${pad(step.number)} : ${step.title}, ${COCKPIT_STATUS_LABEL[cockpitStepStatus(step.status)]}`}>
                      <span className="cockpit-step-no">{pad(step.number)}</span>
                      <span className="cockpit-step-title">{step.title}<small>{step.stale || step.staleRetainedCount > 0 ? "À réexaminer" : "Ouvrir le suivi de l’étape"}</small></span>
                      <Status status={cockpitStepStatus(step.status)} />
                    </button>) : <p className="cockpit-note">Étapes non évaluées.</p>}
                  </div>
                  <div className="cockpit-phase-foot">
                    {count === null ? "Progression indisponible" : `${count} / ${phase.last - phase.first + 1} étapes terminées`}
                    {count !== null && <progress value={count} max={phase.last - phase.first + 1} aria-label={`Progression de la phase ${phase.name}`} />}
                  </div>
                </section>;
              })}
            </div>
            <div className="cockpit-board-planning">
              <RoadmapPreview projectId={projectId} steps={steps} loading={stepsQuery.isFetching} />
            </div>
          </> : <section className="cockpit-table" aria-label="Tableau de pilotage des 21 étapes">
            <h2>Tableau de pilotage</h2>
            <p className="cockpit-note">Les statuts proviennent du Parcours. Les responsables, échéances et prochaines actions personnalisées ne sont pas encore enregistrés par le module de planification.</p>
            <table><thead><tr><th>Étape</th><th>Phase</th><th>Statut</th><th>Action</th></tr></thead>
            <tbody>{steps?.map((step) => <tr key={step.number}>
              <td>{pad(step.number)} · {step.title}{(step.stale || step.staleRetainedCount > 0) && <small> · À réexaminer</small>}</td>
              <td>{step.phase}</td>
              <td>{COCKPIT_STATUS_LABEL[cockpitStepStatus(step.status)]}</td>
              <td><Link to={stepHref(step.number)}>Ouvrir l’étape</Link></td>
            </tr>) ?? <tr><td colSpan={4}>Les étapes ne sont pas disponibles.</td></tr>}</tbody></table>
          </section>}
        </div>
      </div>
      {panelOpen && <aside className="cockpit-side-panel" aria-label="Pilotage du projet">
        <h3>{selected ? `${pad(selected.number)} · ${selected.title}` : "Vue d’ensemble"}</h3>
        <p>{selected ? selected.phase : "Suivi opérationnel des étapes du dossier."}</p>
        <div className="cockpit-summary">
          <div><strong>{done === null ? "—" : `${done} / 21`}</strong><span>Étapes terminées</span></div>
          <div><strong>{reexamine ?? "—"}</strong><span>Étapes à réexaminer</span></div>
        </div>
        {selected ? <div className="cockpit-step-detail">
          <dl>
            <dt>Statut métier</dt><dd>{COCKPIT_STATUS_LABEL[cockpitStepStatus(selected.status)]}</dd>
            <dt>Objectif de l’étape</dt><dd>{selected.goal || "Non renseigné"}</dd>
            <dt>Livrable attendu</dt><dd>{selected.deliverable || "Non renseigné"}</dd>
            <dt>Responsable / échéance</dt><dd>Non planifiés dans ce module</dd>
          </dl>
          <Link className="cockpit-action primary" to={stepHref(selected.number)}>Ouvrir l’étape {pad(selected.number)} →</Link>
        </div> : <p className="cockpit-note">Sélectionnez une étape pour consulter ses informations métier réelles et accéder à son formulaire.</p>}
        <h3 style={{ marginTop: 22 }}>Outils du projet</h3>
        <div className="cockpit-tool-list">
          {COCKPIT_CAPABILITIES.map((capability) => {
            const href = cockpitCapabilityHref(projectId, capability);
            return href ? <Link key={capability.key} to={href} title={capability.note}>{capability.label}<small>{cockpitCapabilityLabel(capability.state)}</small></Link>
              : <span key={capability.key} title={capability.note}>{capability.label}<small>{cockpitCapabilityLabel(capability.state)}</small></span>;
          })}
        </div>
        <p className="cockpit-note">Les fonctions annoncées comme « à développer » ne disposent d’aucune action active. Aucun résultat métier n’est inventé.</p>
      </aside>}
    </div>
    <div className="cockpit-viewfoot">
      <p className="cockpit-note">Calendrier de 12 semaines purement illustratif · Aucun engagement enregistré. Les états de progression viennent de Fadi.</p>
      {view === "board" && <div className="cockpit-zoom" role="group" aria-label="Zoom de la feuille de route">
        <button type="button" disabled={zoom <= 60} aria-label="Réduire le zoom" onClick={() => setZoom((current) => Math.max(60, current - 10))}>−</button>
        <output>{zoom}%</output>
        <button type="button" disabled={zoom >= 130} aria-label="Augmenter le zoom" onClick={() => setZoom((current) => Math.min(130, current + 10))}>+</button>
      </div>}
    </div>
  </main>;
}
