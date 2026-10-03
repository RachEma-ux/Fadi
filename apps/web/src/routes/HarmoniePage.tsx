/**
 * « Harmonie · Assistant de projet » : l'entrée transversale de l'assistant.
 * Harmonie vit dans chaque étape du Parcours (panneau h7 : propositions
 * calculées sur les données de l'étape, arbitrages tracés, péremption) ;
 * cette page en donne l'état par projet à partir des étapes déjà servies
 * (mêmes requêtes que la vue d'ensemble, rien de recalculé ici) et renvoie
 * vers l'étape où se prend chaque décision.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, type ParcoursStep, type Project } from "../lib/api";

const pad2 = (n: number) => String(n).padStart(2, "0");

function stepState(step: ParcoursStep): { label: string; chip: string } {
  if (step.staleRetainedCount > 0) return { label: "À réexaminer · choix conservé", chip: "warn" };
  if (step.stale) return { label: "Données modifiées · propositions à actualiser", chip: "warn" };
  if (step.retainedCount > 0) return { label: "Choix retenu", chip: "ok" };
  if (step.proposals.length === 0) return { label: "Aucune proposition générée", chip: "" };
  return { label: "Aucun choix retenu", chip: "" };
}

export function HarmoniePage() {
  const [params, setParams] = useSearchParams();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const projects = useMemo(() => [...(projectsQuery.data ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [projectsQuery.data]);
  const requested = params.get("projet");
  const project: Project | undefined = projects.find((p) => p.id === requested) ?? projects[0];
  const stepsQuery = useQuery({ queryKey: ["steps", project?.id], queryFn: () => api.listSteps(project!.id), enabled: !!project });
  const steps = stepsQuery.data ?? [];
  const retained = steps.reduce((n, s) => n + s.retainedCount, 0);
  const withChoice = steps.filter((s) => s.retainedCount > 0).length;
  const toReview = steps.filter((s) => s.staleRetainedCount > 0 || s.stale).length;
  const stepLink = (n: number) => (project ? `/projets/${project.id}?module=parcours&etape=${n}` : "/projets");

  return (
    <main className="home-page harmonie-page">
      <div className="home-greeting">
        <div>
          <h1>Harmonie</h1>
          <p>
            L’assistant de projet est intégré à chaque étape du Parcours : il y propose des partis calculés sur les données de l’étape, trace vos arbitrages (retenir, écarter avec motif, adapter) et
            signale les choix à réexaminer quand les données changent. Une proposition reste une hypothèse tant qu’elle n’est pas retenue ; rien n’est présenté comme une donnée confirmée.
          </p>
        </div>
      </div>

      {projectsQuery.isLoading && <p role="status">Chargement…</p>}
      {projectsQuery.data && !project && (
        <section className="panel home-empty-state">
          <h2>Aucun projet pour l’instant</h2>
          <p>Créez un projet ou importez l’exemple P.118 : Harmonie apparaît dès l’étape 01, dans le panneau de chaque étape.</p>
          <div className="resume-card-actions">
            <Link to="/projets" className="button-primary">
              Créer mon premier projet
            </Link>
            <Link to="/projets#examples-heading" className="button-secondary">
              Importer un exemple
            </Link>
          </div>
        </section>
      )}

      {project && (
        <section className="panel harmonie-project" aria-labelledby="harmonie-project-heading">
          <div className="harmonie-project-top">
            <div>
              <span className="eyebrow">État des choix Harmonie</span>
              <h2 id="harmonie-project-heading">
                {project.code} — {project.name}
              </h2>
            </div>
            {projects.length > 1 && (
              <label className="harmonie-project-pick">
                Projet
                <select value={project.id} onChange={(e) => setParams({ projet: e.target.value })}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                      {p.role && p.role !== "proprietaire" ? ` (partagé par ${p.ownerEmail ?? "…"})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {stepsQuery.isLoading && <p role="status">Chargement des étapes…</p>}
          {steps.length > 0 && (
            <>
              <div className="biz-kpis" role="group" aria-label="Indicateurs Harmonie du projet">
                <div className="biz-kpi">
                  <span>Choix retenus</span>
                  <b>{retained}</b>
                </div>
                <div className="biz-kpi">
                  <span>Étapes avec un choix</span>
                  <b>
                    {withChoice} / {steps.length}
                  </b>
                </div>
                <div className="biz-kpi">
                  <span>Étapes à réexaminer</span>
                  <b className={toReview ? "status-no" : "status-ok"}>{toReview}</b>
                </div>
              </div>
              <div className="h7-actions">
                <a className="button-secondary" href={api.harmonieReportUrl(project.id, null)} download>
                  Exporter la synthèse des choix Harmonie
                </a>
                <Link className="button-secondary" to={stepLink(10)}>
                  Harmonie du bâtiment (étape 10)
                </Link>
              </div>
              <div className="table-scroll" tabIndex={0}>
                <table className="programme-table harmonie-table">
                  <caption className="sr-only">Harmonie par étape du Parcours</caption>
                  <thead>
                    <tr>
                      <th scope="col">Étape</th>
                      <th scope="col">Phase</th>
                      <th scope="col">Propositions</th>
                      <th scope="col">Choix retenus</th>
                      <th scope="col">État</th>
                      <th scope="col">
                        <span className="sr-only">Ouvrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step) => {
                      const state = stepState(step);
                      const chosen = step.proposals.filter((p) => p.retained);
                      return (
                        <tr key={step.number} data-step={step.number}>
                          <th scope="row">
                            {pad2(step.number)} · {step.title}
                            <small>{step.profile.label}</small>
                          </th>
                          <td>{step.phase}</td>
                          <td>{step.proposals.length}</td>
                          <td>
                            {chosen.length ? (
                              <ul className="harmonie-chosen">
                                {chosen.map((p) => (
                                  <li key={p.id}>
                                    <b>{p.key}</b> · {p.title}
                                    <small>{p.stateLabel}</small>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span className={`h7-chip ${state.chip}`.trim()}>{state.label}</span>
                          </td>
                          <td>
                            <Link to={stepLink(step.number)}>Ouvrir l’étape</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
