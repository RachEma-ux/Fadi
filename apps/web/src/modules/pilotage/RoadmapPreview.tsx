import { Link } from "react-router-dom";
import type { ParcoursStep } from "../../lib/api";
import { COCKPIT_PHASES, COCKPIT_STATUS_LABEL, cockpitPhaseProgress, cockpitPhaseStatus, examplePosition } from "./roadmap";
import "./pilotage.css";

interface RoadmapPreviewProps {
  projectId: string;
  steps: readonly ParcoursStep[] | null;
  loading?: boolean;
}

/**
 * Same component for the Fadi home (last visited dossier) and project home.
 * Dates are an explicit design example until project planning is persisted.
 */
export function RoadmapPreview({ projectId, steps, loading = false }: RoadmapPreviewProps) {
  const complete = steps !== null;
  return <section className="cockpit-preview panel" aria-label="Planning de référence du dossier">
    <header className="cockpit-preview-header">
      <h2>Planning de référence · Exemple illustratif sur 12 semaines</h2>
      <div className="cockpit-status-legend" role="group" aria-label="Légende de l’avancement">
        <span><i className="cockpit-dot cockpit-dot-done" />Terminé</span>
        <span><i className="cockpit-dot cockpit-dot-doing" />En cours</span>
        <span><i className="cockpit-dot cockpit-dot-todo" />À faire</span>
        <span><i className="cockpit-dot cockpit-dot-blocked" />Bloqué</span>
      </div>
    </header>
    <div className="cockpit-preview-week-head" aria-hidden="true">
      <span>Phase</span>{Array.from({ length: 12 }, (_, index) => <span key={index}>S{index + 1}</span>)}
    </div>
    {COCKPIT_PHASES.map((phase, index) => {
      const status = cockpitPhaseStatus(steps, phase.first, phase.last);
      const count = cockpitPhaseProgress(steps, phase.first, phase.last);
      return <div key={phase.name} className="cockpit-preview-row">
        <div className="cockpit-preview-name">
          <span className={`cockpit-dot cockpit-dot-${status}`} aria-hidden="true" />
          <strong>{String(index + 1).padStart(2, "0")} · {phase.name}</strong>
          <span className="cockpit-preview-period">S{phase.start}–S{phase.end}</span>
        </div>
        <div className="cockpit-preview-track" role="img" aria-label={`${phase.name}, semaines ${phase.start} à ${phase.end}. Avancement : ${count === null ? "non évalué" : `${count} étapes terminées sur ${phase.last - phase.first + 1}`}. Statut : ${COCKPIT_STATUS_LABEL[status]}.`}>
          <span className="cockpit-preview-bar" style={{ ...examplePosition(phase.start, phase.end), backgroundColor: phase.color }} />
        </div>
      </div>;
    })}
    {!complete && <p className="cockpit-preview-unavailable" role="status">{loading ? "Chargement de l’avancement des 21 étapes…" : "Avancement non disponible : les 21 étapes ne sont pas intégralement vérifiées."}</p>}
    <footer className="cockpit-preview-footer">
      <small>Calendrier indicatif · Durées non contractuelles · Les couleurs des barres distinguent les phases.</small>
      <Link className="cockpit-preview-open" to={`/projets/${encodeURIComponent(projectId)}/pilotage`}>Ouvrir la feuille de route <span aria-hidden="true">→</span></Link>
    </footer>
  </section>;
}
