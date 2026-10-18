/**
 * Studio — enveloppe autonome (lot I, ADR-STUDIO-NAV-01). Sous AppShell / RequireAuth comme les autres pages, sans
 * ProjectShell ni Parcours : aucune lecture des étapes, aucun mode immersif. Une erreur d'affichage reste
 * récupérable sans masquer la navigation de Fadi (NAV-008) ; un projet refusé ne divulgue rien (NAV-004).
 */
import { Component, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, ROLE_LABEL } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLastDossier } from "../../lib/last-dossier";
import { denied } from "../accueil/dossier-data";
import { cheminEtudeStudio, cheminProjetStudio, lireRouteStudio, RACINE_STUDIO } from "./routes-studio";
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
          {(route.vue === "projet" || route.vue === "etude") && <FilProjet projectId={route.projectId} lien={route.vue === "etude"} />}
          {route.vue === "etude" && <FilEtude projectId={route.projectId} etudeId={route.etudeId} />}
        </nav>
      )}
      <ErreurRecuperable cle={pathname}>
        {route.vue === "accueil" && <StudioAccueil />}
        {route.vue === "projet" && <StudioProjet projectId={route.projectId} />}
        {route.vue === "etude" && <StudioEtude projectId={route.projectId} etudeId={route.etudeId} />}
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

function useEtudeStudio(projectId: string, etudeId: string) {
  return useQuery({ queryKey: ["studio-etude", projectId, etudeId], queryFn: () => api.getEtudeStudio(projectId, etudeId), staleTime: 30_000, retry: (n, e) => !denied(e) && n < 1 });
}

function FilProjet({ projectId, lien }: { projectId: string; lien: boolean }) {
  const projet = useProjetStudio(projectId);
  // Tant que l'accès n'est pas confirmé, le fil ne nomme pas le projet.
  const nom = projet.data && !denied(projet.error) ? <span translate="no">{projet.data.code}</span> : "Projet";
  return <span> / {lien ? <Link to={cheminProjetStudio(projectId)}>{nom}</Link> : <span aria-current="page">{nom}</span>}</span>;
}

function FilEtude({ projectId, etudeId }: { projectId: string; etudeId: string }) {
  const etude = useEtudeStudio(projectId, etudeId);
  return <span aria-current="page"> / {etude.data && !denied(etude.error) ? <span translate="no">{etude.data.nom}</span> : "Étude"}</span>;
}

const Refus = ({ quoi }: { quoi: "projet" | "etude" }) => (
  <section className="panel" role="alert" data-studio-refus>
    <h1>{quoi === "projet" ? "Projet introuvable, ou vous n’y avez pas accès." : "Étude introuvable, ou vous n’y avez pas accès."}</h1>
    <Link to={RACINE_STUDIO}>Choisir un autre projet</Link>
  </section>
);

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
  const etudes = useQuery({ queryKey: ["studio-etudes", projectId], queryFn: () => api.listEtudesStudio(projectId), enabled: !!projet.data && !denied(projet.error), staleTime: 30_000 });
  if (projet.isPending) return <p role="status">Chargement du projet…</p>;
  if (!projet.data || denied(projet.error)) return <Refus quoi="projet" />;
  const p = projet.data;
  const role = p.role ?? "proprietaire";
  const peutCreer = role === "proprietaire" || role === "editeur";
  return (
    <>
      <div className="projects-heading">
        <h1>
          <span translate="no">{p.code}</span> — <span translate="no">{p.name}</span>
        </h1>
      </div>
      <section aria-labelledby="studio-etudes" className="panel" data-studio-projet={p.id}>
        <h2 id="studio-etudes">Études</h2>
        <p className="panel-sub">Votre rôle : {ROLE_LABEL[role]}.</p>
        {etudes.isPending && <p role="status">Chargement des études…</p>}
        {etudes.isError && (
          <p role="alert">
            Impossible de charger les études. <button type="button" className="link-button" onClick={() => void etudes.refetch()}>Réessayer</button>
          </p>
        )}
        {etudes.data?.length === 0 && <p data-studio-aucune-etude>Aucune étude dans ce projet pour l’instant.</p>}
        {!!etudes.data?.length && (
          <ul className="project-list" data-studio-etudes>
            {etudes.data.map((e) => (
              <li key={e.id}>
                <Link to={cheminEtudeStudio(p.id, e.id)}><strong translate="no">{e.nom}</strong></Link>
                {e.description && <small translate="no">{e.description}</small>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {peutCreer ? <CreerEtude projectId={p.id} /> : <p className="panel-sub" data-studio-lecture-seule>Ce projet vous est partagé en lecture : la création d’études est réservée à son propriétaire et à ses éditeurs.</p>}
    </>
  );
}

function CreerEtude({ projectId }: { projectId: string }) {
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const creer = useMutation({
    mutationFn: () => api.creerEtudeStudio(projectId, nom.trim(), description.trim()),
    onSuccess: (etude) => {
      void client.invalidateQueries({ queryKey: ["studio-etudes", projectId] });
      navigate(cheminEtudeStudio(projectId, etude.id));
    },
  });
  const erreur = creer.error instanceof ApiError ? (creer.error.serverMessage ?? "La création de l’étude a échoué.") : creer.error ? "La création de l’étude a échoué." : null;
  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim() || creer.isPending) return;
    creer.mutate();
  }
  return (
    <section aria-labelledby="studio-nouvelle-etude" className="panel">
      <h2 id="studio-nouvelle-etude">Nouvelle étude</h2>
      <form onSubmit={envoyer} noValidate data-studio-creer-etude>
        <label htmlFor="studio-etude-nom">Nom de l’étude</label>
        <input id="studio-etude-nom" required maxLength={120} value={nom} onChange={(e) => setNom(e.target.value)} />
        <label htmlFor="studio-etude-description">Description (facultative)</label>
        <textarea id="studio-etude-description" maxLength={2000} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        {erreur && <p role="alert" className="form-error">{erreur}</p>}
        <button type="submit" disabled={!nom.trim() || creer.isPending}>{creer.isPending ? "Création…" : "Créer l’étude"}</button>
      </form>
    </section>
  );
}

function StudioEtude({ projectId, etudeId }: { projectId: string; etudeId: string }) {
  const projet = useProjetStudio(projectId);
  const etude = useEtudeStudio(projectId, etudeId);
  if (projet.isPending || etude.isPending) return <p role="status">Chargement de l’étude…</p>;
  if (!projet.data || denied(projet.error)) return <Refus quoi="projet" />;
  if (!etude.data || denied(etude.error)) return <Refus quoi="etude" />;
  const e = etude.data;
  return (
    <>
      <div className="projects-heading">
        <h1 translate="no">{e.nom}</h1>
      </div>
      <section aria-labelledby="studio-cadrage" className="panel" data-studio-etude={e.id}>
        <h2 id="studio-cadrage">Cadrage</h2>
        {e.description ? <p translate="no">{e.description}</p> : <p className="panel-sub">Aucune description.</p>}
        <p className="panel-sub">Projet : <span translate="no">{projet.data.code} — {projet.data.name}</span></p>
      </section>
      <section aria-labelledby="studio-variantes" className="panel">
        <h2 id="studio-variantes">Variantes</h2>
        <p data-studio-variantes-indisponible>Les variantes et l’espace de conception arrivent avec le lot suivant.</p>
      </section>
    </>
  );
}
