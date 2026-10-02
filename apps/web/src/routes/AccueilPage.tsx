import "../modules/bibliotheque/building-library.css";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ParcoursStep, type ParcoursStepStatus, type Project } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { MassingIllustration } from "../components/MassingIllustration";

/** Dérivé de l'adresse e-mail (aucun prénom n'est collecté à l'inscription) : la partie alphabétique avant le premier chiffre ou séparateur, mise en majuscule initiale. Pas un prénom inventé — littéralement ce que la personne a tapé. */
function greetingName(email: string): string {
  const local = email.split("@")[0] ?? email;
  const alpha = local.match(/^[a-zA-Z]+/)?.[0] ?? local;
  return alpha.charAt(0).toUpperCase() + alpha.slice(1);
}

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

type StepStatus = ParcoursStepStatus;

function StatusDot({ status }: { status: StepStatus }) {
  return <span className={`step-dot step-dot-${status}`} aria-hidden="true" />;
}

/**
 * État d'une phase du Parcours à partir de ses étapes : terminée si toutes
 * le sont, en cours dès qu'une étape est entamée ou terminée, à faire sinon.
 * La progression vient de l'état des étapes, jamais de la présence d'un
 * texte ou d'un mur dessiné.
 */
function phaseStatus(steps: ParcoursStep[]): StepStatus {
  if (steps.length && steps.every((s) => s.status === "termine")) return "termine";
  if (steps.some((s) => s.status !== "a-faire")) return "en-cours";
  return "a-faire";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function AccueilPage() {
  const { user } = useAuth();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const mostRecent: Project | undefined = useMemo(
    () => [...(projectsQuery.data ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    [projectsQuery.data],
  );

  const stepsQuery = useQuery({
    queryKey: ["steps", mostRecent?.id],
    queryFn: () => api.listSteps(mostRecent!.id),
    enabled: !!mostRecent,
  });
  const steps = stepsQuery.data ?? [];
  const doneCount = steps.filter((s) => s.status === "termine").length;
  const startedCount = steps.filter((s) => s.status !== "a-faire").length;
  const nextStep = steps.find((s) => s.status !== "termine") ?? null;

  const moduleLink = (moduleId: string) => (mostRecent ? `/projets/${mostRecent.id}?module=${moduleId}` : "/projets");
  const stepLink = (n: number) => (mostRecent ? `/projets/${mostRecent.id}?module=parcours&etape=${n}` : "/projets");

  // Les six phases du Parcours d'origine, dans l'ordre, avec l'état réel de leurs étapes.
  const phases = [...new Set(steps.map((s) => s.phase))].map((phase) => {
    const own = steps.filter((s) => s.phase === phase);
    return { label: phase, status: phaseStatus(own), href: stepLink(own.find((s) => s.status !== "termine")?.number ?? own[0]!.number), done: own.filter((s) => s.status === "termine").length, total: own.length };
  });

  const nextActions: { label: string; href: string }[] = !mostRecent
    ? [
        { label: "Créer votre premier projet", href: "/projets" },
        { label: "Importer un exemple", href: "/projets#examples-heading" },
      ]
    : nextStep
      ? [
          { label: `Poursuivre l'étape ${pad2(nextStep.number)} · ${nextStep.title}`, href: stepLink(nextStep.number) },
          { label: "Ouvrir l'Atelier architectural", href: moduleLink("atelier") },
        ]
      : [
          { label: "Les 21 étapes sont terminées — revoir le bilan (étape 18)", href: stepLink(18) },
          { label: "Ouvrir l'Atelier architectural", href: moduleLink("atelier") },
        ];

  return (
    <main className="home-page">
      <div className="home-greeting">
        <div>
          <h1>Bonjour{user ? ` ${greetingName(user.email)}` : ""},</h1>
          <p>Donnons forme à votre prochain projet.</p>
        </div>
        <Link to="/projets" className="button-primary">
          + Nouveau projet
        </Link>
      </div>

      <div className="home-grid">
        <div className="home-main-column">
          {projectsQuery.isLoading && <p role="status">Chargement…</p>}

          {projectsQuery.data && !mostRecent && (
            <section className="panel home-empty-state">
              <h2>Aucun projet pour l'instant</h2>
              <p>Créez votre premier projet pour commencer à structurer sa parcelle, son programme et sa conception, ou importez un exemple déjà travaillé pour voir le Parcours rempli de bout en bout.</p>
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

          {mostRecent && (
            <section className="panel resume-card">
              <span className="eyebrow">Reprendre mon projet</span>
              <div className="resume-card-top">
                <h2>
                  {mostRecent.code} — {mostRecent.name}
                </h2>
                <span className="badge">{doneCount === 21 ? "Parcours terminé" : startedCount > 0 ? "Étude en cours" : "Nouveau"}</span>
              </div>

              <MassingIllustration />

              <p className="resume-card-meta">
                Dernière modification {relativeDate(mostRecent.updatedAt)}
                {steps.length ? ` · ${doneCount} / ${steps.length} étapes terminées` : ""}
              </p>
              {steps.length > 0 && (
                <div className="progress" aria-label={`${doneCount} étapes terminées sur ${steps.length}`}>
                  <i style={{ width: `${(doneCount / steps.length) * 100}%` }} />
                </div>
              )}

              <div className="resume-card-actions">
                <Link to={`/projets/${mostRecent.id}`} className="button-primary">
                  Reprendre le projet →
                </Link>
                <Link to={moduleLink("atelier")} className="button-secondary">
                  Ouvrir l'Atelier
                </Link>
              </div>
            </section>
          )}

          <section aria-labelledby="quick-links-heading">
            <h2 id="quick-links-heading">Accès rapides</h2>
            <div className="quick-links">
              <Link to={moduleLink("projets-sources")} className="quick-link-card">
                <span className="quick-link-title">Explorer la parcelle</span>
                <span className="quick-link-sub">Site, limites et contexte</span>
              </Link>
              <Link to={moduleLink("programmation")} className="quick-link-card">
                <span className="quick-link-title">Organiser le programme</span>
                <span className="quick-link-sub">Espaces, surfaces et besoins</span>
              </Link>
              <Link to={moduleLink("atelier")} className="quick-link-card">
                <span className="quick-link-title">Concevoir dans l'Atelier</span>
                <span className="quick-link-sub">Plans, volumes et détails</span>
              </Link>
            </div>
          </section>

          {/* `enhance()` de building-library-app : l'entrée de la bibliothèque sur la page d'accueil. */}
          <section className="bl-summary-insert" id="bl-home-library">
            <b>Bibliothèque des bâtiments · 10 types / 21 cas</b>
            <span>Programme, dimensions, flux, références et scénarios reliés à Harmony et Répartition.</span>
            <div className="bl-actions">
              <Link className="bl-button" to="/bibliotheque/batiments">
                Explorer les exemples par type
              </Link>
            </div>
          </section>
        </div>

        <aside className="home-side-column">
          <section className="panel" aria-labelledby="parcours-heading">
            <h2 id="parcours-heading">Mon parcours</h2>
            <p className="panel-sub">{mostRecent ? `Les 6 phases du projet actif · ${doneCount} / ${steps.length || 21} étapes terminées` : "Les 6 phases, de la parcelle à l'engagement"}</p>
            {stepsQuery.isLoading && <p role="status">Chargement…</p>}
            <ul className="parcours-progress">
              {(phases.length
                ? phases
                : ["Comprendre le site", "Programmer", "Concevoir / Tester", "Prouver la faisabilité", "Arbitrer", "Engager"].map((label) => ({ label, status: "a-faire" as StepStatus, href: "/projets", done: 0, total: 0 }))
              ).map((phase) => (
                <li key={phase.label}>
                  <Link to={phase.href}>
                    <StatusDot status={phase.status} />
                    {phase.label}
                    {phase.total ? <small> {phase.done}/{phase.total}</small> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" aria-labelledby="next-actions-heading">
            <h2 id="next-actions-heading">Prochaines actions</h2>
            <ul className="next-actions">
              {nextActions.map((action) => (
                <li key={action.label}>
                  <Link to={action.href}>{action.label}</Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
