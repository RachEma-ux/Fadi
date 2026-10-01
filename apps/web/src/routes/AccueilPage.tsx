import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Project } from "../lib/api";
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

type StepStatus = "a-faire" | "en-cours";

function StatusDot({ status }: { status: StepStatus }) {
  return <span className={`step-dot step-dot-${status}`} aria-hidden="true" />;
}

export function AccueilPage() {
  const { user } = useAuth();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const mostRecent: Project | undefined = useMemo(
    () => [...(projectsQuery.data ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    [projectsQuery.data],
  );

  const levelsQuery = useQuery({
    queryKey: ["levels", mostRecent?.id],
    queryFn: () => api.listLevels(mostRecent!.id),
    enabled: !!mostRecent,
  });
  const groundLevel = levelsQuery.data?.[0];
  const objectsQuery = useQuery({
    queryKey: ["objects", mostRecent?.id, groundLevel?.id],
    queryFn: () => api.listObjects(mostRecent!.id, groundLevel!.id),
    enabled: !!mostRecent && !!groundLevel,
  });
  const hasBuiltSomething = (objectsQuery.data?.length ?? 0) > 0;

  const moduleLink = (moduleId: string) => (mostRecent ? `/projets/${mostRecent.id}?module=${moduleId}` : "/projets");

  const parcoursSteps: { label: string; status: StepStatus; href: string }[] = [
    { label: "Parcelle", status: "a-faire", href: moduleLink("projets-sources") },
    { label: "Programme", status: "a-faire", href: moduleLink("programmation") },
    { label: "Conception", status: hasBuiltSomething ? "en-cours" : "a-faire", href: moduleLink("atelier") },
    { label: "Analyse", status: "a-faire", href: moduleLink("analyses") },
    { label: "Documents", status: "a-faire", href: moduleLink("documents") },
  ];

  const nextActions: { label: string; href: string }[] = !mostRecent
    ? [
        { label: "Créer votre premier projet", href: "/projets" },
        { label: "Importer un exemple", href: "/projets#examples-heading" },
      ]
    : !hasBuiltSomething
      ? [
          { label: "Ajouter un premier mur dans l'Atelier", href: moduleLink("atelier") },
          { label: "Explorer les étapes du Parcours", href: moduleLink("parcours") },
        ]
      : [
          { label: "Poursuivre la conception dans l'Atelier", href: moduleLink("atelier") },
          { label: "Revoir les étapes du Parcours", href: moduleLink("parcours") },
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
                <span className="badge">{hasBuiltSomething ? "Étude en cours" : "Nouveau"}</span>
              </div>

              <MassingIllustration />

              <p className="resume-card-meta">Dernière modification {relativeDate(mostRecent.updatedAt)}</p>

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
        </div>

        <aside className="home-side-column">
          <section className="panel" aria-labelledby="parcours-heading">
            <h2 id="parcours-heading">Mon parcours</h2>
            <p className="panel-sub">5 grandes étapes du projet actif</p>
            <ul className="parcours-progress">
              {parcoursSteps.map((step) => (
                <li key={step.label}>
                  <Link to={step.href}>
                    <StatusDot status={step.status} />
                    {step.label}
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
