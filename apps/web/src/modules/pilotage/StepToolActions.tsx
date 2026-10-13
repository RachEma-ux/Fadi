import { Link } from "react-router-dom";
import { resolveStepTools, STEP_TOOL_STATUS, type StepToolContext } from "./step-tools";

export function StepToolActions({ projectId, stepNumber, context }: { projectId: string; stepNumber: number; context: StepToolContext }) {
  const actions = resolveStepTools(projectId, stepNumber, context);
  return <section className="cockpit-step-tools" aria-label={`Outils de l’étape ${String(stepNumber).padStart(2, "0")}`}>
    <h4>Action utile et outils métier</h4>
    <p className="cockpit-note">Les accès ouvrent les modules du même dossier. Les fonctions non disponibles n’activent aucun lien fictif.</p>
    <div className="cockpit-step-tools-list">
      {actions.map((action) => <div key={action.key} className={`cockpit-step-tool cockpit-step-tool-${action.status}`}>
        {action.href ? <Link to={action.href} className={`cockpit-step-tool-link${action.key === "parcours" ? "" : " highlighted"}`}>
          <span>{action.label}</span><span aria-hidden="true">↗</span>
        </Link> : <strong className="cockpit-step-tool-disabled">{action.label}</strong>}
        <span className="cockpit-step-tool-status">{STEP_TOOL_STATUS[action.status]}</span>
        <p>{action.detail}</p>
        {action.recovery && <Link className="cockpit-tool-recovery" to={action.recovery.href}>{action.recovery.label} →</Link>}
      </div>)}
    </div>
  </section>;
}
