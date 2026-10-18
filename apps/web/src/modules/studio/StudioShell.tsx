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
import { cheminEtudeStudio, cheminProjetStudio, cheminVarianteStudio, DOMAINES_STUDIO, lireRouteStudio, PLANCHES_STUDIO, RACINE_STUDIO, type DomaineStudio, type PlancheStudio } from "./routes-studio";
import { Planche2D } from "./planche2d/Planche2D";
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
  const { pathname, search } = useLocation();
  const route = lireRouteStudio(pathname, search);
  return (
    <main className="projects-page studio-page" data-studio={route.vue}>
      {route.vue !== "accueil" && (
        <nav className="studio-fil" aria-label="Fil d’Ariane Studio">
          <Link to={RACINE_STUDIO}>Studio</Link>
          {route.vue !== "inconnue" && <FilProjet projectId={route.projectId} lien={route.vue !== "projet"} />}
          {(route.vue === "etude" || route.vue === "variante") && <FilEtude projectId={route.projectId} etudeId={route.etudeId} lien={route.vue === "variante"} />}
          {route.vue === "variante" && <FilVariante projectId={route.projectId} etudeId={route.etudeId} variantId={route.variantId} />}
        </nav>
      )}
      <ErreurRecuperable cle={pathname}>
        {route.vue === "accueil" && <StudioAccueil />}
        {route.vue === "projet" && <StudioProjet projectId={route.projectId} />}
        {route.vue === "etude" && <StudioEtude projectId={route.projectId} etudeId={route.etudeId} />}
        {route.vue === "variante" && <StudioVariante {...route} />}
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

function useVarianteStudio(projectId: string, etudeId: string, variantId: string) {
  return useQuery({ queryKey: ["studio-variante", projectId, etudeId, variantId], queryFn: () => api.getVarianteStudio(projectId, etudeId, variantId), staleTime: 30_000, retry: (n, e) => !denied(e) && n < 1 });
}

const peutModifier = (role: string | undefined) => (role ?? "proprietaire") === "proprietaire" || role === "editeur";

function FilProjet({ projectId, lien }: { projectId: string; lien: boolean }) {
  const projet = useProjetStudio(projectId);
  // Tant que l'accès n'est pas confirmé, le fil ne nomme pas le projet.
  const nom = projet.data && !denied(projet.error) ? <span translate="no">{projet.data.code}</span> : "Projet";
  return <span> / {lien ? <Link to={cheminProjetStudio(projectId)}>{nom}</Link> : <span aria-current="page">{nom}</span>}</span>;
}

function FilEtude({ projectId, etudeId, lien }: { projectId: string; etudeId: string; lien: boolean }) {
  const etude = useEtudeStudio(projectId, etudeId);
  const nom = etude.data && !denied(etude.error) ? <span translate="no">{etude.data.nom}</span> : "Étude";
  return <span> / {lien ? <Link to={cheminEtudeStudio(projectId, etudeId)}>{nom}</Link> : <span aria-current="page">{nom}</span>}</span>;
}

function FilVariante({ projectId, etudeId, variantId }: { projectId: string; etudeId: string; variantId: string }) {
  const variante = useVarianteStudio(projectId, etudeId, variantId);
  return <span aria-current="page"> / {variante.data && !denied(variante.error) ? <span translate="no">{variante.data.nom}</span> : "Variante"}</span>;
}

const MESSAGES_REFUS = {
  projet: "Projet introuvable, ou vous n’y avez pas accès.",
  etude: "Étude introuvable, ou vous n’y avez pas accès.",
  variante: "Variante introuvable, ou vous n’y avez pas accès.",
} as const;

const Refus = ({ quoi }: { quoi: keyof typeof MESSAGES_REFUS }) => (
  <section className="panel" role="alert" data-studio-refus>
    <h1>{MESSAGES_REFUS[quoi]}</h1>
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
  const peutCreer = peutModifier(p.role);
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
      <VariantesEtude projectId={projectId} etudeId={e.id} peutCreer={peutModifier(projet.data.role)} />
    </>
  );
}

function VariantesEtude({ projectId, etudeId, peutCreer }: { projectId: string; etudeId: string; peutCreer: boolean }) {
  const variantes = useQuery({ queryKey: ["studio-variantes", projectId, etudeId], queryFn: () => api.listVariantesStudio(projectId, etudeId), staleTime: 30_000 });
  return (
    <>
      <section aria-labelledby="studio-variantes" className="panel">
        <h2 id="studio-variantes">Variantes</h2>
        {variantes.isPending && <p role="status">Chargement des variantes…</p>}
        {variantes.isError && (
          <p role="alert">
            Impossible de charger les variantes. <button type="button" className="link-button" onClick={() => void variantes.refetch()}>Réessayer</button>
          </p>
        )}
        {variantes.data?.length === 0 && <p data-studio-aucune-variante>Aucune variante dans cette étude pour l’instant.</p>}
        {!!variantes.data?.length && (
          <ul className="project-list" data-studio-variantes>
            {variantes.data.map((v) => (
              <li key={v.id}>
                <Link to={cheminVarianteStudio(projectId, etudeId, v.id)}><strong translate="no">{v.nom}</strong></Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {peutCreer ? <CreerVariante projectId={projectId} etudeId={etudeId} /> : <p className="panel-sub" data-studio-lecture-seule>Ce projet vous est partagé en lecture : la création de variantes est réservée à son propriétaire et à ses éditeurs.</p>}
    </>
  );
}

function CreerVariante({ projectId, etudeId }: { projectId: string; etudeId: string }) {
  const [nom, setNom] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const creer = useMutation({
    mutationFn: () => api.creerVarianteStudio(projectId, etudeId, nom.trim()),
    onSuccess: (variante) => {
      void client.invalidateQueries({ queryKey: ["studio-variantes", projectId, etudeId] });
      navigate(cheminVarianteStudio(projectId, etudeId, variante.id));
    },
  });
  const erreur = creer.error instanceof ApiError ? (creer.error.serverMessage ?? "La création de la variante a échoué.") : creer.error ? "La création de la variante a échoué." : null;
  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim() || creer.isPending) return;
    creer.mutate();
  }
  return (
    <section aria-labelledby="studio-nouvelle-variante" className="panel">
      <h2 id="studio-nouvelle-variante">Nouvelle variante</h2>
      <form onSubmit={envoyer} noValidate data-studio-creer-variante>
        <label htmlFor="studio-variante-nom">Nom de la variante</label>
        <input id="studio-variante-nom" required maxLength={120} value={nom} onChange={(e) => setNom(e.target.value)} />
        {erreur && <p role="alert" className="form-error">{erreur}</p>}
        <button type="submit" disabled={!nom.trim() || creer.isPending}>{creer.isPending ? "Création…" : "Créer la variante"}</button>
      </form>
    </section>
  );
}

const LIBELLES_DOMAINE: Record<DomaineStudio, string> = { dessin: "Dessin", bim: "BIM", visualisation: "Visualisation", documentation: "Documentation" };
const LIBELLES_PLANCHE: Record<PlancheStudio, string> = { "2d": "Planche 2D", "3d": "Planche 3D" };

function StudioVariante({ projectId, etudeId, variantId, domaine, planche, revision }: { projectId: string; etudeId: string; variantId: string; domaine: DomaineStudio; planche: PlancheStudio | null; revision: string | null }) {
  const projet = useProjetStudio(projectId);
  const etude = useEtudeStudio(projectId, etudeId);
  const variante = useVarianteStudio(projectId, etudeId, variantId);
  if (projet.isPending || etude.isPending || variante.isPending) return <p role="status">Chargement de la variante…</p>;
  if (!projet.data || denied(projet.error)) return <Refus quoi="projet" />;
  if (!etude.data || denied(etude.error)) return <Refus quoi="etude" />;
  if (!variante.data || denied(variante.error)) return <Refus quoi="variante" />;
  const v = variante.data;
  return (
    <>
      <div className="projects-heading">
        <h1 translate="no">{v.nom}</h1>
      </div>
      {/* Chaque domaine est une adresse : précédent / suivant et l'actualisation restituent le même écran. */}
      <nav className="studio-domaines" aria-label="Domaines de la variante" data-studio-domaines>
        {DOMAINES_STUDIO.map((d) => (
          <Link key={d} to={cheminVarianteStudio(projectId, etudeId, v.id, d, d === "dessin" ? planche : null)} aria-current={d === domaine ? "page" : undefined} data-studio-domaine={d}>
            {LIBELLES_DOMAINE[d]}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="studio-domaine" className="panel" data-studio-variante={v.id} data-studio-domaine-actif={domaine}>
        <h2 id="studio-domaine">{LIBELLES_DOMAINE[domaine]}</h2>
        {domaine === "dessin" ? (
          <>
            <p className="panel-sub">Choisissez la planche de travail ; ce choix ne crée aucune géométrie.</p>
            <div className="studio-planches" role="group" aria-label="Planche de travail">
              {PLANCHES_STUDIO.map((pl) => (
                <Link key={pl} to={cheminVarianteStudio(projectId, etudeId, v.id, "dessin", pl)} aria-current={pl === planche ? "true" : undefined} data-studio-planche={pl}>
                  {LIBELLES_PLANCHE[pl]}
                </Link>
              ))}
            </div>
            {planche ? <p data-studio-planche-active={planche}>{`${LIBELLES_PLANCHE[planche]} retenue pour cette variante.`}</p> : <p data-studio-planche-aucune>Aucune planche choisie.</p>}
            {planche === "2d" && <Planche2D projectId={projectId} etudeId={etudeId} variantId={v.id} revision={revision} peutEcrire={peutModifier(projet.data.role)} />}
            {planche === "3d" && <p className="panel-sub" data-studio-3d-indisponible>La Planche 3D n’est pas encore disponible dans Studio.</p>}
          </>
        ) : (
          <p data-studio-domaine-vide>Ce domaine ne contient encore rien pour cette variante.</p>
        )}
      </section>
    </>
  );
}
