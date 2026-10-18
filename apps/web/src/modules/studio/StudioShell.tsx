/**
 * Studio — enveloppe autonome (lot I, ADR-STUDIO-NAV-01). Sous AppShell / RequireAuth comme les autres pages, sans
 * ProjectShell ni Parcours : aucune lecture des étapes, aucun mode immersif. Une erreur d'affichage reste
 * récupérable sans masquer la navigation de Fadi (NAV-008) ; un projet refusé ne divulgue rien (NAV-004).
 */
import { Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { api, ROLE_LABEL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLastDossier } from "../../lib/last-dossier";
import { denied } from "../accueil/dossier-data";
import { cheminProjetStudio, lireRouteStudio, RACINE_STUDIO } from "./routes-studio";
import "./studio.css";

class ErreurRecuperable extends Component<{ cle: string; children: ReactNode }, { erreur: boolean; cle: string }> {
  state = { erreur: false, cle: this.props.cle };
  static getDerivedStateFromError() {
    return { erreur: true };
  }
  static getDerivedStateFromProps(props: { cle: string }, state: { erreur: boolean; cle: string }) {
    // Changer d'adresse efface l'erreur de l'écran précédent.
    return props.cle !== state.cle ? { erreur: false, cle: props.cle } : null;
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <section className="panel" role="alert" data-studio-erreur>
        <h2>Studio n’a pas pu afficher cet écran.</h2>
        <p>La navigation de Fadi reste disponible ; aucune donnée n’a été modifiée.</p>
        <button type="button" onClick={() => this.setState({ erreur: false })}>Réessayer</button>
      </section>
    );
  }
}

export function StudioShell() {
  const { pathname } = useLocation();
  const route = lireRouteStudio(pathname);
  return (
    <main className="projects-page studio-page" data-studio={route.vue}>
      {route.vue !== "accueil" && (
        <nav className="studio-fil" aria-label="Fil d’Ariane Studio">
          <Link to={RACINE_STUDIO}>Studio</Link>
          {route.vue === "projet" && <FilProjet projectId={route.projectId} />}
        </nav>
      )}
      <ErreurRecuperable cle={pathname}>
        {route.vue === "accueil" && <StudioAccueil />}
        {route.vue === "projet" && <StudioProjet projectId={route.projectId} />}
        {route.vue === "inconnue" && (
          <section className="panel" role="alert" data-studio-inconnue>
            <h1>Adresse Studio non reconnue</h1>
            <p>Cette adresse ne correspond à aucun écran de Studio.</p>
            <Link to={RACINE_STUDIO}>Revenir à l’accueil de Studio</Link>
          </section>
        )}
      </ErreurRecuperable>
    </main>
  );
}

function useProjetStudio(projectId: string) {
  return useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry: (n, e) => !denied(e) && n < 1 });
}

function FilProjet({ projectId }: { projectId: string }) {
  const projet = useProjetStudio(projectId);
  // Tant que l'accès n'est pas confirmé, le fil ne nomme pas le projet.
  return <span aria-current="page"> / {projet.data && !denied(projet.error) ? <span translate="no">{projet.data.code}</span> : "Projet"}</span>;
}

function StudioAccueil() {
  const { user } = useAuth();
  const dernier = useLastDossier(user?.id);
  const projets = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, staleTime: 30_000 });
  // Le dernier dossier ouvert est une suggestion, jamais une permission : il n'apparaît que s'il est dans la liste autorisée.
  const suggestion = projets.data?.find((p) => p.id === dernier?.projectId);
  return (
    <>
      <div className="projects-heading">
        <h1>Studio</h1>
      </div>
      <section aria-labelledby="studio-projets" className="panel">
        <h2 id="studio-projets">Choisir un projet</h2>
        <p className="panel-sub">Studio s’ouvre sur un projet que vous êtes autorisé à consulter ; rien n’est créé à l’ouverture.</p>
        {projets.isPending && <p role="status">{projets.fetchStatus === "paused" ? "En attente de connexion" : "Chargement des projets…"}</p>}
        {projets.isError && (
          <p role="alert">
            Impossible de charger vos projets. <button type="button" className="link-button" onClick={() => void projets.refetch()}>Réessayer</button>
          </p>
        )}
        {projets.data?.length === 0 && (
          <p>
            Aucun projet pour l’instant. <Link to="/projets">Créer un projet</Link>
          </p>
        )}
        {suggestion && (
          <p className="studio-suggestion" data-studio-suggestion>
            Dernier projet ouvert : <Link to={cheminProjetStudio(suggestion.id)}><strong translate="no">{suggestion.code}</strong> — <span translate="no">{suggestion.name}</span></Link>
          </p>
        )}
        {!!projets.data?.length && (
          <ul className="project-list" data-studio-projets>
            {projets.data.map((p) => (
              <li key={p.id}>
                <Link to={cheminProjetStudio(p.id)}>
                  <strong translate="no">{p.code}</strong> — <span translate="no">{p.name}</span>
                </Link>
                <small>{ROLE_LABEL[p.role ?? "proprietaire"]}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StudioProjet({ projectId }: { projectId: string }) {
  const projet = useProjetStudio(projectId);
  if (projet.isPending) return <p role="status">Chargement du projet…</p>;
  if (!projet.data || denied(projet.error)) {
    return (
      <section className="panel" role="alert" data-studio-refus>
        <h1>Projet introuvable, ou vous n’y avez pas accès.</h1>
        <Link to={RACINE_STUDIO}>Choisir un autre projet</Link>
      </section>
    );
  }
  const p = projet.data;
  return (
    <>
      <div className="projects-heading">
        <h1>
          <span translate="no">{p.code}</span> — <span translate="no">{p.name}</span>
        </h1>
      </div>
      <section aria-labelledby="studio-etudes" className="panel" data-studio-projet={p.id}>
        <h2 id="studio-etudes">Études</h2>
        <p className="panel-sub">Votre rôle : {ROLE_LABEL[p.role ?? "proprietaire"]}.</p>
        <p data-studio-etudes-indisponible>Les études de Studio ne sont pas encore disponibles : leur création arrivera avec le lot suivant.</p>
      </section>
    </>
  );
}
