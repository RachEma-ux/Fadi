import { Link } from "react-router-dom";
import type { PhasePilotageKpi, PilotageKpiSnapshot, StepPilotageKpi } from "./kpi-model";

const show = (n: number | null, total?: number) => n === null ? "Non évalué" : total === undefined ? String(n) : String(n) + " / " + String(total);

const sums = (phases: readonly PhasePilotageKpi[], key: "finished" | "dated" | "assigned" | "pastDue" | "withKnownDeadline" | "toReview"): number | null => {
  if (phases.some((p) => p[key] === null)) return null;
  return phases.reduce((value, phase) => value + (phase[key] ?? 0), 0);
};

/** Brief cockpit, not a second matrix of 21 rows. All metrics have explicit provenance. */
export function PilotageKpiOverview({ snapshot, projectId }: { snapshot: PilotageKpiSnapshot; projectId: string }) {
  const done = sums(snapshot.phases, "finished");
  const dates = sums(snapshot.phases, "dated");
  const owners = sums(snapshot.phases, "assigned");
  const overdue = sums(snapshot.phases, "pastDue");
  const deadlines = sums(snapshot.phases, "withKnownDeadline");
  const toReview = sums(snapshot.phases, "toReview");
  const tech = snapshot.analysis;
  const root = "/projets/" + encodeURIComponent(projectId);
  return <section className="cockpit-kpi-overview" aria-labelledby="cockpit-kpi-title">
    <header>
      <h3 id="cockpit-kpi-title">Indicateurs métier · État vérifié du dossier</h3>
      <p>Les compteurs indiquent des données effectivement présentes, pas une certification de résultat. Date d'évaluation : {snapshot.today}.</p>
    </header>
    <div className="cockpit-kpi-totals">
      <div><strong>{show(done, done === null ? undefined : 21)}</strong><span>Étapes déclarées terminées</span></div>
      <div><strong>{show(dates, dates === null ? undefined : 21)}</strong><span>Étapes avec dates complètes</span></div>
      <div><strong>{show(owners, owners === null ? undefined : 21)}</strong><span>Responsables renseignés</span></div>
      <div><strong>{show(overdue)}</strong><span>Échéances dépassées sur {show(deadlines)} dates connues, étapes non terminées</span></div>
    </div>
    <p className="cockpit-kpi-review">{toReview === null ? "Étapes à réexaminer : non évaluées." : toReview + " étape(s) à réexaminer d'après Parcours."}</p>
    <details className="cockpit-kpi-trace">
      <summary>Contrôles techniques et traçabilité des sources</summary>
      <div className="cockpit-kpi-trace-body">
        <p>Lecture du serveur : Parcours <strong>{snapshot.sourceStatus.parcours === "known" ? "lisible" : "indisponible"}</strong> · Planning <strong>{snapshot.sourceStatus.planning === "known" ? "lisible" : "indisponible"}</strong> · Documents <strong>{snapshot.sourceStatus.documents === "known" ? "lisible" : "indisponible"}</strong> · Analyses <strong>{snapshot.sourceStatus.analyses === "known" ? "lisibles" : "indisponibles"}</strong>.</p>
        {tech ? <>
          <p><strong>{show(tech.evaluated, tech.total)}</strong> contrôles métier évalués · {tech.conform} conformes dans leur périmètre · {tech.nonConform} non conformes · {tech.toVerify} à vérifier · {tech.notEvaluated} non évalués · {tech.notApplicable} sans objet.</p>
          <p>Analyses : version {tech.version} · révision modèle {tech.modelRevision} · calcul {tech.computedAt} · empreinte d'entrée <code>{tech.inputHash.slice(0, 12)}</code> · empreinte modèle <code>{tech.nativeHash.slice(0, 12)}</code>.</p>
        </> : <p>Contrôles techniques : non évalués ou incohérents avec la révision courante. Aucun taux de conformité n'est calculé.</p>}
        <p>Aucune conformité réglementaire automatique n'est certifiée par ce tableau. Les documents produits prouvent une production, pas leur acceptation technique.</p>
        <div className="cockpit-kpi-links"><Link to={root + "?module=analyses"}>Consulter les contrôles et leurs sources →</Link><Link to={root + "?module=documents"}>Consulter les pièces et leur actualité →</Link></div>
      </div>
    </details>
  </section>;
}

export function PhaseKpiIndicators({ phase }: { phase: PhasePilotageKpi }) {
  return <div className="cockpit-kpi-phase" data-r4-phase={phase.first} aria-label={"Indicateurs de phase : " + phase.title}>
    <div>Planning : <strong>{show(phase.dated, phase.dated === null ? undefined : phase.total)}</strong> datées · <strong>{show(phase.assigned, phase.assigned === null ? undefined : phase.total)}</strong> responsables</div>
    <div>Échéances dépassées : <strong>{show(phase.pastDue)}</strong> · À réexaminer : <strong>{show(phase.toReview)}</strong></div>
    <div>Documents produits à jour : <strong>{show(phase.currentDocuments)}</strong>{phase.staleDocuments !== null && phase.staleDocuments > 0 ? " · " + phase.staleDocuments + " périmés" : ""}</div>
  </div>;
}

export function StepKpiEvidence({ data, projectId }: { data: StepPilotageKpi | null; projectId: string }) {
  if (!data) return <p className="cockpit-note" role="status">Indicateurs de l'étape non évalués : lecture Parcours incomplète.</p>;
  const state = (b: boolean | null) => b === null ? "Non évalué" : b ? "Oui" : "Non";
  const root = "/projets/" + encodeURIComponent(projectId);
  return <section className="cockpit-kpi-step" aria-label={"Indicateurs vérifiés de l’étape " + data.number}>
    <h4>Indicateurs de l'étape</h4>
    <dl>
      <div><dt>Planning daté</dt><dd>{state(data.scheduled)}</dd></div>
      <div><dt>Responsable désigné</dt><dd>{state(data.assigned)}</dd></div>
      <div><dt>Action renseignée</dt><dd>{state(data.actionDefined)}</dd></div>
      <div><dt>Échéance passée, étape inachevée</dt><dd>{state(data.outstandingPastDue)}{data.dueDate ? " · " + data.dueDate : ""}</dd></div>
      <div><dt>À réexaminer dans Parcours</dt><dd>{state(data.toReview)}</dd></div>
      <div><dt>Pièces produites</dt><dd>{show(data.documentProduced)} · {show(data.documentCurrent)} à jour · {show(data.documentStale)} périmées</dd></div>
    </dl>
    {data.documentNames?.length ? <details><summary>Pièces rattachées à cette étape ({data.documentNames.length})</summary><ul>{data.documentNames.map((doc, i) => <li key={i}>{doc.label} — {doc.freshness === "a-jour" ? "À jour" : "Périmé"}</li>)}</ul></details> : null}
    <Link to={root + "?module=documents"}>Vérifier les documents du dossier →</Link>
    <p className="cockpit-note">Source : Parcours, planning R2 et catalogue Documents. Le statut « terminé » n'atteste pas à lui seul la validité technique du livrable.</p>
  </section>;
}
