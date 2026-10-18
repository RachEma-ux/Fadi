/**
 * Studio — enveloppe autonome (ADR-STUDIO-NAV-01, portée sur l'API de Studio V1). Sous AppShell / RequireAuth comme
 * les autres pages, sans ProjectShell ni Parcours : aucun mode immersif ; seule la page d'une étude lit, par la route
 * Studio `…/studies/:s/steps`, les étapes du projet qu'elle peut lier (libellés du serveur). Une erreur
 * d'affichage reste récupérable sans masquer la navigation de Fadi (NAV-008) ; un refus ne divulgue rien (NAV-004) ;
 * une adresse inconnue donne un écran explicite (R-B). Le serveur reste seul juge des droits.
 */
import { Component, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError, ROLE_LABEL } from "../../lib/api";
import { cheminComparaisonStudio, cheminEtudeStudio, cheminProjetStudio, cheminVarianteStudio, lireRouteStudio, RACINE_STUDIO } from "./routes-studio";
import { StudioRefus } from "./studio-ecrans";
import { VariantWorkspace } from "./VariantWorkspace";
import { PageComparaison } from "./comparaison/PageComparaison";
import { EtapesParcoursEtude } from "./liens/EtapesLiees";
import "./studio.css";

/** Une création non confirmée (réseau, 5xx) se rejoue avec le même requestId : le serveur rend la même étude ou variante, sans doublon. */
function demandeId(demande: { current: { nom: string; id: string } | null }, nom: string): string {
  if (demande.current?.nom !== nom) demande.current = { nom, id: crypto.randomUUID() };
  return demande.current.id;
}

const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const retry = (n: number, e: unknown) => !refused(e) && n < 1;

/** Limite d'erreur de Studio (ADR R-C) : changer d'adresse efface l'erreur de l'écran précédent. */
class StudioErrorBoundary extends Component<{ cle: string; children: ReactNode }, { erreur: boolean; cle: string }> {
  state = { erreur: false, cle: this.props.cle };
  static getDerivedStateFromError() {
    return { erreur: true };
  }
  static getDerivedStateFromProps(props: { cle: string }, state: { erreur: boolean; cle: string }) {
    return props.cle !== state.cle ? { erreur: false, cle: props.cle } : null;
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <section className="studio-welcome" role="alert" data-studio-erreur>
        <h1>Studio n’a pas pu afficher cet écran.</h1>
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
    <div className="studio-shell" data-studio={route.vue}>
      <StudioErrorBoundary cle={pathname + search}>
        {route.vue !== "accueil" && (
          <nav className="studio-fil" aria-label="Fil d’Ariane Studio">
            <Link to={RACINE_STUDIO}>Studio</Link>
            {route.vue !== "inconnue" && <FilProjet projectId={route.projectId} lien={route.vue !== "projet"} />}
            {(route.vue === "etude" || route.vue === "variante" || route.vue === "comparer") && <FilEtude projectId={route.projectId} studyId={route.studyId} lien={route.vue !== "etude"} />}
            {route.vue === "comparer" && <span aria-current="page"> / {"Comparer"}</span>}
            {route.vue === "variante" && <FilVariante projectId={route.projectId} studyId={route.studyId} variantId={route.variantId} />}
            {route.vue !== "inconnue" && <BadgeRole projectId={route.projectId} />}
          </nav>
        )}
        {route.vue === "accueil" && <StudioAccueil />}
        {route.vue === "projet" && <StudioProjet projectId={route.projectId} />}
        {route.vue === "etude" && <StudioEtude projectId={route.projectId} studyId={route.studyId} />}
        {route.vue === "variante" && <VariantWorkspace key={`${route.projectId}/${route.studyId}/${route.variantId}/${route.revisionId ?? ""}`} projectId={route.projectId} studyId={route.studyId} variantId={route.variantId} revisionId={route.revisionId} commentairesOuverts={route.commentaires} />}
        {route.vue === "comparer" && <PageComparaison projectId={route.projectId} studyId={route.studyId} de={route.de} a={route.a} />}
        {route.vue === "inconnue" && (
          <section className="studio-welcome" role="alert" data-studio-inconnue>
            <h1>Adresse Studio non reconnue</h1>
            <p>Cette adresse ne correspond à aucun écran de Studio. Rien n’a été ouvert ni créé.</p>
            <Link to={RACINE_STUDIO}>Revenir à l’accueil de Studio</Link>
          </section>
        )}
      </StudioErrorBoundary>
    </div>
  );
}

const useProjet = (projectId: string) => useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry });
const useEtude = (projectId: string, studyId: string) => useQuery({ queryKey: ["studio-study", projectId, studyId], queryFn: () => api.studioStudy(projectId, studyId), staleTime: 30_000, retry });

function FilProjet({ projectId, lien }: { projectId: string; lien: boolean }) {
  const projet = useProjet(projectId);
  // Tant que l'accès n'est pas confirmé, le fil ne nomme pas le projet.
  const nom = projet.data && !refused(projet.error) ? <span translate="no">{projet.data.code}</span> : "Projet";
  return <span> / {lien ? <Link to={cheminProjetStudio(projectId)}>{nom}</Link> : <span aria-current="page">{nom}</span>}</span>;
}

/** Rôle de l'utilisateur sur le projet, tel que le serveur le renvoie avec le projet (jamais déduit côté client). */
function BadgeRole({ projectId }: { projectId: string }) {
  const projet = useProjet(projectId);
  if (!projet.data || refused(projet.error)) return null;
  const role = projet.data.role ?? "proprietaire";
  return <span className="studio-revision-tag studio-role" style={{ marginLeft: "auto" }} data-studio-role={role}>{`Votre rôle : ${ROLE_LABEL[role]}`}</span>;
}

function FilEtude({ projectId, studyId, lien }: { projectId: string; studyId: string; lien: boolean }) {
  const etude = useEtude(projectId, studyId);
  const nom = etude.data && !refused(etude.error) ? <span translate="no">{etude.data.study.name}</span> : "Étude";
  return <span> / {lien ? <Link to={cheminEtudeStudio(projectId, studyId)}>{nom}</Link> : <span aria-current="page">{nom}</span>}</span>;
}

function FilVariante({ projectId, studyId, variantId }: { projectId: string; studyId: string; variantId: string }) {
  const etude = useEtude(projectId, studyId);
  const variante = !refused(etude.error) ? etude.data?.variants.find((v) => v.id === variantId) : undefined;
  return <span aria-current="page"> / {variante ? <span translate="no">{variante.name}</span> : "Variante"}</span>;
}

function StudioAccueil() {
  const projets = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, staleTime: 30_000 });
  return (
    <section className="studio-welcome" aria-labelledby="studio-choisir">
      <p className="studio-eyebrow">FADI / STUDIO</p>
      <h2 id="studio-choisir">Choisir un projet</h2>
      <p>Studio s’ouvre sur un projet que vous êtes autorisé à consulter ; rien n’est créé à l’ouverture.</p>
      {projets.isPending && <p role="status">{projets.fetchStatus === "paused" ? "En attente de connexion" : "Chargement des projets…"}</p>}
      {projets.isError && <p role="alert">Impossible de charger vos projets. <button type="button" onClick={() => void projets.refetch()}>Réessayer</button></p>}
      {projets.data?.length === 0 && <p>Aucun projet disponible. <Link to="/projets">Créez un projet dans Projets.</Link></p>}
      {!!projets.data?.length && (
        <ul className="studio-projects" data-studio-projets>
          {projets.data.map((p) => (
            <li key={p.id}>
              <Link to={cheminProjetStudio(p.id)}>
                <span className="studio-project-icon" aria-hidden="true">▱</span>
                <strong translate="no">{p.code}</strong>
                <span translate="no">{p.name}</span>
                <small>{ROLE_LABEL[p.role ?? "proprietaire"]}</small>
                <span>Ouvrir les études →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudioProjet({ projectId }: { projectId: string }) {
  const projet = useProjet(projectId);
  const accessible = !!projet.data && !refused(projet.error);
  const etudes = useQuery({ queryKey: ["studio-studies", projectId], queryFn: () => api.studioStudies(projectId), enabled: accessible, retry });
  if (projet.isPending) return <p role="status">Chargement du projet…</p>;
  if (!accessible) return projet.isError && !refused(projet.error) ? <p role="alert">Projet indisponible. <button type="button" onClick={() => void projet.refetch()}>Réessayer</button></p> : <StudioRefus quoi="projet" />;
  const p = projet.data!;
  const lecteur = p.role === "lecteur";
  return (
    <section className="studio-welcome" data-studio-projet={p.id}>
      <p className="studio-eyebrow">FADI / STUDIO</p>
      <h1><span translate="no">{p.code}</span> — <span translate="no">{p.name}</span></h1>
      <p>Votre rôle : {ROLE_LABEL[p.role ?? "proprietaire"]}.</p>
      <h2>Études du projet</h2>
      {etudes.isPending && <p role="status">Chargement des études…</p>}
      {etudes.isError && <><p role="alert">Études indisponibles ou accès refusé.</p><button type="button" onClick={() => void etudes.refetch()}>Réessayer</button></>}
      {etudes.data?.studies.length === 0 && <p data-studio-aucune-etude>Aucune étude dans ce projet pour l’instant.</p>}
      {!!etudes.data?.studies.length && (
        <ul className="studio-projects" data-studio-etudes>
          {etudes.data.studies.map((s) => (
            <li key={s.id}>
              <Link to={cheminEtudeStudio(p.id, s.id)}>
                <strong translate="no">{s.name}</strong>
                <span>Ouvrir l’étude →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {lecteur
        ? <p data-studio-lecture-seule>Ce projet vous est partagé en lecture : la création d’études est réservée à son propriétaire et à ses éditeurs.</p>
        : <CreerEtude projectId={p.id} indisponible={etudes.isError} />}
    </section>
  );
}

function CreerEtude({ projectId, indisponible }: { projectId: string; indisponible: boolean }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const enCours = useRef(false);
  const demande = useRef<{ nom: string; id: string } | null>(null);
  const navigate = useNavigate();
  const client = useQueryClient();
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || enCours.current) return;
    enCours.current = true; setCreating(true); setError("");
    try {
      const c = await api.createStudioStudy(projectId, name.trim(), demandeId(demande, name.trim()));
      demande.current = null;
      navigate(cheminVarianteStudio(projectId, c.study.id, c.variant.id));
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? "Création refusée par le serveur." : "Création non confirmée. Réessayez : la même demande sera rejouée sans doublon.");
    } finally {
      enCours.current = false; setCreating(false);
      void client.invalidateQueries({ queryKey: ["studio-studies", projectId] });
    }
  }
  return (
    <form className="studio-create" onSubmit={(e) => void create(e)} data-studio-creer-etude>
      <h3>Nouvelle étude</h3>
      <label htmlFor="studio-etude-nom">Nom de l’étude</label>
      <input id="studio-etude-nom" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button disabled={creating || !name.trim() || indisponible}>Créer l’étude et sa variante initiale</button>
      <p>Une action explicite crée une étude vide et sa première variante.</p>
    </form>
  );
}

function StudioEtude({ projectId, studyId }: { projectId: string; studyId: string }) {
  const projet = useProjet(projectId);
  const etude = useEtude(projectId, studyId);
  if (projet.isPending || etude.isPending) return <p role="status">Chargement de l’étude…</p>;
  if (!projet.data || refused(projet.error)) return projet.isError && !refused(projet.error) ? <p role="alert">Projet indisponible. <button type="button" onClick={() => void projet.refetch()}>Réessayer</button></p> : <StudioRefus quoi="projet" />;
  if (!etude.data || refused(etude.error)) return etude.isError && !refused(etude.error) ? <p role="alert">Étude indisponible. <button type="button" onClick={() => void etude.refetch()}>Réessayer</button></p> : <StudioRefus quoi="etude" />;
  const { study, variants, canWrite } = etude.data;
  return (
    <section className="studio-welcome" data-studio-etude={study.id}>
      <p className="studio-eyebrow">FADI / STUDIO</p>
      <h1 translate="no">{study.name}</h1>
      <p>Projet : <span translate="no">{projet.data.code} — {projet.data.name}</span></p>
      <h2>Variantes</h2>
      {variants.length === 0 && <p data-studio-aucune-variante>Aucune variante dans cette étude pour l’instant.</p>}
      {!!variants.length && (
        <ul className="studio-projects" data-studio-variantes>
          {variants.map((v) => (
            <li key={v.id}>
              <Link to={cheminVarianteStudio(projectId, study.id, v.id)}>
                <strong translate="no">{v.name}</strong>
                {v.id === study.initialVariantId && <small>Variante initiale</small>}
                <span>Ouvrir la planche →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p><Link to={cheminComparaisonStudio(projectId, study.id)} data-studio-lien-comparer>Comparer les variantes et révisions →</Link></p>
      <EtapesParcoursEtude projectId={projectId} studyId={study.id} />
      {canWrite
        ? <CreerVariante projectId={projectId} studyId={study.id} />
        : <p data-studio-lecture-seule>Lecture seule : la création de variantes est réservée aux membres autorisés à modifier ce projet.</p>}
    </section>
  );
}

function CreerVariante({ projectId, studyId }: { projectId: string; studyId: string }) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const enCours = useRef(false);
  const demande = useRef<{ nom: string; id: string } | null>(null);
  const navigate = useNavigate();
  const client = useQueryClient();
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || enCours.current) return;
    enCours.current = true; setCreating(true); setError("");
    try {
      const c = await api.createStudioVariant(projectId, studyId, name.trim(), demandeId(demande, name.trim()));
      demande.current = null;
      navigate(cheminVarianteStudio(projectId, studyId, c.variant.id));
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? "Création refusée par le serveur." : "Création non confirmée. Réessayez : la même demande sera rejouée sans doublon.");
    } finally {
      enCours.current = false; setCreating(false);
      void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
    }
  }
  return (
    <form className="studio-create" onSubmit={(e) => void create(e)} data-studio-creer-variante>
      <h3>Nouvelle variante</h3>
      <label htmlFor="studio-variante-nom">Nom de la variante</label>
      <input id="studio-variante-nom" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button disabled={creating || !name.trim()}>Créer la variante</button>
      <p>Une action explicite crée une variante au document vide.</p>
    </form>
  );
}
