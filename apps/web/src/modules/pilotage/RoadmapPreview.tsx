import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ParcoursStep } from "../../lib/api";
import { denied } from "../accueil/dossier-data";
import { COCKPIT_PHASES, COCKPIT_STATUS_LABEL, cockpitPhaseProgress, cockpitPhaseStatus, examplePosition } from "./roadmap";
import { phaseBarPosition, phaseDatesLabel, planningTimeline, scheduledStepCount, stepRange } from "./planning-timeline";
import "./pilotage.css";

interface RoadmapPreviewProps {
  projectId: string;
  steps: readonly ParcoursStep[] | null;
  loading?: boolean;
}

/** Shared between the two homepages and the full cockpit: exactly one server-backed schedule. */
export function RoadmapPreview({ projectId, steps, loading = false }: RoadmapPreviewProps) {
  const planQuery = useQuery({
    queryKey: ["project-planning", projectId],
    queryFn: () => api.getProjectPlanning(projectId),
    staleTime: 30_000,
    retry: (count, error) => !denied(error) && count < 1,
  });
  const readable = !denied(planQuery.error);
  const fetching = planQuery.isPending;
  const failed = !readable || (!planQuery.data && planQuery.isError);
  const timeline = planningTimeline(readable ? planQuery.data : null);
  const illustrative = timeline.mode === "example" && !fetching && !failed;
  const actual = timeline.mode !== "example" && !fetching && !failed;
  const complete = steps !== null;
  return <section className="cockpit-preview panel" aria-label="Planning du dossier">
    <header className="cockpit-preview-header">
      <h2>{fetching ? "Chargement du planning…" : failed ? "Planning indisponible" : illustrative ? "Planning de référence · Exemple illustratif sur 12 semaines" :
        timeline.mode === "draft" ? "Planning prévisionnel · Non validé" : <>Planning de référence · Version {timeline.version}</>}</h2>
      <div className="cockpit-status-legend" role="group" aria-label="Légende de l’avancement">
        <span><i className="cockpit-dot cockpit-dot-done" />Terminé</span>
        <span><i className="cockpit-dot cockpit-dot-doing" />En cours</span>
        <span><i className="cockpit-dot cockpit-dot-todo" />À faire</span>
        <span><i className="cockpit-dot cockpit-dot-blocked" />Bloqué</span>
      </div>
    </header>
    {!fetching && !failed && <div className="cockpit-preview-week-head" aria-hidden="true">
      <span>Phase</span>{timeline.labels.map((label, index) => <span key={index}>{label}</span>)}
    </div>}
    {COCKPIT_PHASES.map((phase, index) => {
      const status = cockpitPhaseStatus(steps, phase.first, phase.last);
      const count = cockpitPhaseProgress(steps, phase.first, phase.last);
      const current = actual ? stepRange(timeline.current, phase.first, phase.last) : null;
      const baseline = actual && timeline.reference ? stepRange(timeline.reference, phase.first, phase.last) : null;
      const position = actual ? phaseBarPosition(current, timeline) : null;
      const baselinePosition = actual ? phaseBarPosition(baseline, timeline) : null;
      const period = illustrative ? `S${phase.start}–S${phase.end}` : phaseDatesLabel(current ?? baseline);
      return <div key={phase.name} className="cockpit-preview-row">
        <div className="cockpit-preview-name">
          <span className={`cockpit-dot cockpit-dot-${status}`} aria-hidden="true" />
          <strong>{String(index + 1).padStart(2, "0")} · {phase.name}</strong>
          <span className="cockpit-preview-period">{fetching || failed ? "—" : period}</span>
        </div>
        <div className="cockpit-preview-track" role="img" aria-label={`${phase.name} · ${fetching || failed ? "Planning en attente" : period}. ${count === null ? "Avancement non évalué" : `${count} étapes terminées sur ${phase.last - phase.first + 1}`}. Statut : ${COCKPIT_STATUS_LABEL[status]}.`}>
          {illustrative && <span className="cockpit-preview-bar" style={{ ...examplePosition(phase.start, phase.end), backgroundColor: phase.color }} />}
          {actual && baselinePosition && <span className="cockpit-preview-baseline-bar" style={baselinePosition} />}
          {actual && position && <span className="cockpit-preview-bar" style={{ ...position, backgroundColor: phase.color }} />}
        </div>
      </div>;
    })}
    {fetching && <p className="cockpit-preview-unavailable" role="status">Lecture du calendrier de ce projet en cours…</p>}
    {failed && <p className="cockpit-preview-unavailable" role="status">Calendrier non disponible. Aucune date de référence n’est supposée.</p>}
    {planQuery.isError && planQuery.data && readable && <p className="cockpit-preview-unavailable">Copie du planning à actualiser ; dernière lecture conservée.</p>}
    {!complete && <p className="cockpit-preview-unavailable" role="status">{loading ? "Chargement de l’avancement des 21 étapes…" : "Avancement non disponible : les 21 étapes ne sont pas intégralement vérifiées."}</p>}
    <footer className="cockpit-preview-footer">
      <small>{illustrative ? "Calendrier indicatif · Durées non contractuelles." :
        timeline.mode === "draft" && actual ? `${scheduledStepCount(timeline.current)} / 21 étapes datées · Prévisions non validées.` :
        actual ? "Barres colorées : prévisions · Ligne grise : référence approuvée." : "Les dates n’ont pas pu être confirmées."} Les couleurs distinguent les phases.</small>
      <Link className="cockpit-preview-open" to={`/projets/${encodeURIComponent(projectId)}/pilotage`}>Ouvrir la feuille de route <span aria-hidden="true">→</span></Link>
    </footer>
  </section>;
}
