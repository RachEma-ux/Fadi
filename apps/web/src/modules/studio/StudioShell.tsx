/**
 * Studio — enveloppe autonome (ADR-STUDIO-NAV-01, portée sur l'API de Studio V1). Sous AppShell / RequireAuth comme
 * les autres pages, sans ProjectShell ni Parcours : aucun mode immersif ; seule la page d'une étude lit, par la route
 * Studio `…/studies/:s/steps`, les étapes du projet qu'elle peut lier (libellés du serveur). Une erreur
 * d'affichage reste récupérable sans masquer la navigation de Fadi (NAV-008) ; un refus ne divulgue rien (NAV-004) ;
 * une adresse inconnue donne un écran explicite (R-B). Le serveur reste seul juge des droits.
 * Cycle de vie : dériver une variante d'une révision (tête par défaut), renommer, archiver / désarchiver avec
 * confirmation (jamais de suppression) ; les archives s'affichent sur demande (`?archives=1`).
 * Chargement (B.3-02, B.3-03) : la coquille porte le catalogue léger et lit le profil d'outils ; la planche (éditeur
 * de variante) n'est chargée qu'à l'ouverture d'une variante (`chargement/`).
 * Contexte (NAV-006) : l'en-tête de Fadi nomme le projet (résolu depuis `/studio/projets/:projectId…`) ; le fil
 * d'Ariane de Studio nomme l'étude, la variante et la révision affichée, sans répéter le projet. Accueil : suggestion de
 * reprise (jamais de redirection), choix explicite, nouvelle étude (`accueil/AccueilStudio.tsx`).
 */
import { Component, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { StudioPhaseWorkflow } from "@parcours/atelier-model";
import { api, ApiError, ROLE_LABEL, type StudioVariantSummary } from "../../lib/api";
import type { DomaineStudio } from "./domaines/definitions";
import { LOCALE } from "../../lib/i18n";
import { cheminAccueilStudio, cheminComparaisonStudio, cheminConsoleStudio, cheminEtudeStudio, cheminOutilConsoleStudio, cheminProjetStudio, cheminVarianteStudio, estRouteConsole, lireRouteStudio, type RouteConsoleStudio } from "./routes-studio";
import { definitionDomaine, libelleNumeroteDomaine } from "./domaines/definitions";
import { ConsoleSandbox, ConsoleStudio } from "./console/ConsoleStudio";
import { LIBELLE_SANDBOX } from "./console/cartes";
import { StudioRefus } from "./studio-ecrans";
import { DemarrageStudio, PlancheDifferee } from "./chargement/DemarrageStudio";
import { PageComparaison } from "./comparaison/PageComparaison";
import { EtapesParcoursEtude } from "./liens/EtapesLiees";
import { PanneauPublications } from "./publication/PanneauPublications";
import { NouvelleEtude, StudioAccueil } from "./accueil/AccueilStudio";
import { libellePhase, PastilleWorkflow } from "./espace/EspaceStudio";
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
  const navigate = useNavigate();
  const route = lireRouteStudio(pathname, search);
  return (
    <div className="studio-shell" data-studio={route.vue}>
      <DemarrageStudio projectId={"projectId" in route ? route.projectId : null} />
      <StudioErrorBoundary cle={pathname + search}>
        {route.vue !== "accueil" && (
          <nav className="studio-fil" aria-label="Fil d’Ariane Studio">
            <Link to={cheminAccueilStudio()} data-studio-fil-accueil>Studio</Link>
            {estRouteConsole(route) && <FilConsole route={route} />}
            {route.vue !== "inconnue" && !estRouteConsole(route) && <FilProjet projectId={route.projectId} lien={route.vue !== "projet"} />}
            {(route.vue === "etude" || route.vue === "variante" || route.vue === "comparer") && <FilEtude projectId={route.projectId} studyId={route.studyId} lien={route.vue !== "etude"} />}
            {route.vue === "comparer" && <span aria-current="page"> / {"Comparer"}</span>}
            {route.vue === "variante" && <FilVariante projectId={route.projectId} studyId={route.studyId} variantId={route.variantId} revisionId={route.revisionId} />}
            {(route.vue === "etude" || route.vue === "variante") && <PastilleEtude projectId={route.projectId} studyId={route.studyId} variantId={route.vue === "variante" ? route.variantId : null} revisionId={route.vue === "variante" ? route.revisionId : null} />}
            {route.vue !== "inconnue" && !estRouteConsole(route) && <BadgeRole projectId={route.projectId} />}
          </nav>
        )}
        {route.vue === "accueil" && <StudioAccueil key={search} domaine={route.domaine} />}
        {route.vue === "projet" && <StudioProjet projectId={route.projectId} archives={route.archives} />}
        {route.vue === "etude" && <StudioEtude projectId={route.projectId} studyId={route.studyId} archives={route.archives} />}
        {/* Domaine et planche (I.4-03) hors de la clé : les changer ne recharge ni ne décharge la variante (brouillon, geste, sauvegarde gardés). Changer de domaine ajoute une entrée d'historique ; changer de planche la remplace. */}
        {route.vue === "variante" && <PlancheDifferee key={`${route.projectId}/${route.studyId}/${route.variantId}/${route.revisionId ?? ""}`} projectId={route.projectId} studyId={route.studyId} variantId={route.variantId} revisionId={route.revisionId} commentairesOuverts={route.commentaires}
          domaine={route.domaine} planche={route.planche}
          surAdresse={({ domaine, planche, commentaires }, { remplacer }) => navigate(cheminVarianteStudio(route.projectId, route.studyId, route.variantId, route.revisionId, { commentaires, domaine, planche }), { replace: remplacer })} />}
        {route.vue === "console" && <ConsoleStudio />}
        {route.vue === "console-sandbox" && <ConsoleSandbox />}
        {/* Console : l'outil du domaine SANS charger de projet (contexte local, rien lu ni enregistré). Clé fixe : changer de domaine ou de planche ne décharge pas ce qui est dessiné. */}
        {route.vue === "console-outil" && <PlancheDifferee key="console" autonome projectId="" studyId="" variantId="" revisionId={null}
          domaine={route.domaine} planche={route.planche}
          surEnregistreVersProjet={(c, { domaine, planche }) => navigate(cheminVarianteStudio(c.projectId, c.studyId, c.variantId, null, { domaine, planche }))}
          surAdresse={({ domaine, planche }, { remplacer }) => navigate(cheminOutilConsoleStudio(domaine, { planche }), { replace: remplacer })} />}
        {route.vue === "comparer" && <PageComparaison projectId={route.projectId} studyId={route.studyId} de={route.de} a={route.a} />}
        {route.vue === "inconnue" && (
          <section className="studio-welcome" role="alert" data-studio-inconnue>
            <h1>Adresse Studio non reconnue</h1>
            <p>Cette adresse ne correspond à aucun écran de Studio. Rien n’a été ouvert ni créé.</p>
            <Link to={cheminAccueilStudio()}>Revenir à l’accueil de Studio</Link>
          </section>
        )}
      </StudioErrorBoundary>
    </div>
  );
}

/** Fil d'Ariane de la Console : « Studio / Console », puis « Sandbox » ou le domaine ouvert (jamais de projet ni d'étude). */
function FilConsole({ route }: { route: RouteConsoleStudio }) {
  const suite = route.vue === "console-sandbox" ? LIBELLE_SANDBOX : route.vue === "console-outil" ? libelleNumeroteDomaine(definitionDomaine(route.domaine)) : null;
  return <span data-studio-fil-console> / {suite === null ? <span aria-current="page" translate="no">Console</span> : <><Link to={cheminConsoleStudio()} translate="no">Console</Link> / <span aria-current="page">{suite}</span></>}</span>;
}

const useProjet = (projectId: string) => useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry });
// Fil d'Ariane : archives comprises, pour nommer aussi une variante archivée ouverte par son adresse.
const useEtude = (projectId: string, studyId: string) => useQuery({ queryKey: ["studio-study", projectId, studyId, { archives: true }], queryFn: () => api.studioStudy(projectId, studyId, true), staleTime: 30_000, retry });

/**
 * Étape « projet » du fil : les études du projet. Le projet lui-même est nommé par l'en-tête de Fadi (NAV-006, sans
 * doublon) ; le code reste dans le nom accessible du lien, une fois l'accès confirmé.
 */
function FilProjet({ projectId, lien }: { projectId: string; lien: boolean }) {
  const projet = useProjet(projectId);
  const code = projet.data && !refused(projet.error) ? projet.data.code : null;
  const texte = <span data-studio-fil-projet>Études</span>;
  return <span> / {lien ? <Link to={cheminProjetStudio(projectId)} title={code ? `Études du projet ${code}` : undefined}>{texte}</Link> : <span aria-current="page">{texte}</span>}</span>;
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

/**
 * Phase déclarée de l'étude (workflow REF-01 §06), dans la barre de contexte en haut de l'espace : pastille et menu ;
 * déclaration réservée au propriétaire et aux éditeurs (droit relu par le serveur), jamais sur une révision historique ;
 * suggestions = liens vers les domaines de la variante affichée (ou de la variante initiale, depuis l'étude).
 */
function PastilleEtude({ projectId, studyId, variantId, revisionId }: { projectId: string; studyId: string; variantId: string | null; revisionId: string | null }) {
  const etude = useEtude(projectId, studyId);
  const client = useQueryClient();
  const navigate = useNavigate();
  if (refused(etude.error)) return null;
  const d = etude.data;
  const variante = variantId ?? d?.study.initialVariantId ?? null;
  const adresse = (domaine: DomaineStudio) => (variante ? cheminVarianteStudio(projectId, studyId, variante, variantId ? revisionId : null, { domaine }) : cheminEtudeStudio(projectId, studyId));
  async function declarer(phase: StudioPhaseWorkflow | null) {
    const lu = await api.setStudioStudyWorkflowPhase(projectId, studyId, phase);
    client.setQueryData(["studio-study", projectId, studyId, { archives: true }], (prev: typeof d) => (prev ? { ...prev, study: { ...prev.study, workflowPhase: lu.study.workflowPhase ?? null } } : prev));
    await Promise.all([client.invalidateQueries({ queryKey: ["studio-studies", projectId] }), client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId, { archives: false }] })]);
  }
  return <PastilleWorkflow phase={etude.isError ? null : d ? d.study.workflowPhase ?? null : undefined} declarer={d?.canWrite && !revisionId ? declarer : undefined}
    adresses={{ domaine: adresse, etude: cheminEtudeStudio(projectId, studyId), comparer: cheminComparaisonStudio(projectId, studyId) }} surDomaine={(x) => navigate(adresse(x), { replace: !!variantId })} />;
}

/** Variante et révision affichée (tête, ou révision historique de l'adresse). */
function FilVariante({ projectId, studyId, variantId, revisionId }: { projectId: string; studyId: string; variantId: string; revisionId: string | null }) {
  const etude = useEtude(projectId, studyId);
  const variante = !refused(etude.error) ? etude.data?.variants.find((v) => v.id === variantId) : undefined;
  const revision = revisionId ?? variante?.headRevisionId ?? null;
  return <span aria-current="page"> / {variante ? <span translate="no">{variante.name}</span> : "Variante"}
    {revision && <span className="studio-fil-revision" data-studio-fil-revision={revision}>{" · "}{revisionId ? "Révision historique" : "Révision"} <span translate="no" title={revision}>{revision.slice(-8)}</span></span>}
  </span>;
}

/** Message d'échec d'une action de cycle de vie, selon la réponse du serveur (seul juge). */
function echecAction(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "Action refusée : l’élément est archivé.";
  if (err instanceof ApiError && err.status < 500) return "Action refusée par le serveur.";
  return "Action non confirmée. Réessayez.";
}

/** Bascule « Afficher les archives » : change l'adresse (`?archives=1`), le serveur filtre. */
function BasculeArchives({ archives, vers }: { archives: boolean; vers: (archives: boolean) => string }) {
  const navigate = useNavigate();
  return (
    <label style={{ flexDirection: "row", alignItems: "center" }} data-studio-basculer-archives>
      <input type="checkbox" style={{ width: "auto" }} checked={archives} onChange={(e) => navigate(vers(e.target.checked), { replace: true })} />
      Afficher les archives
    </label>
  );
}

const BadgeArchive = () => <span className="studio-revision-tag" data-studio-badge-archive>Archivée</span>;

/** Renommage en ligne : nom épuré, 1 à 200 caractères ; le nom affiché est celui que relit le serveur. */
function RenommerEnLigne({ nom, enregistrer, attribut }: { nom: string; enregistrer: (nom: string) => Promise<unknown>; attribut: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState(nom);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  if (!ouvert) return <button type="button" onClick={() => { setValeur(nom); setErreur(""); setOuvert(true); }} data-studio-renommer={attribut}>Renommer</button>;
  async function valider(e: FormEvent) {
    e.preventDefault();
    const propre = valeur.trim();
    if (!propre || enCours) return;
    setEnCours(true); setErreur("");
    try { await enregistrer(propre); setOuvert(false); }
    catch (err) { setErreur(echecAction(err)); }
    finally { setEnCours(false); }
  }
  return (
    <form onSubmit={(e) => void valider(e)} data-studio-renommer-formulaire={attribut}>
      <label>Nouveau nom<input required maxLength={200} value={valeur} onChange={(e) => setValeur(e.target.value)} autoFocus /></label>
      {erreur && <p role="alert">{erreur}</p>}
      <button disabled={enCours || !valeur.trim()}>Enregistrer le nom</button>
      <button type="button" onClick={() => setOuvert(false)}>Annuler le renommage</button>
    </form>
  );
}

/** Archiver / désarchiver après confirmation ; rien n'est supprimé. */
function BoutonArchive({ archive, confirmation, basculer, attribut, desactive = false }: { archive: boolean; confirmation: string; basculer: (archiver: boolean) => Promise<unknown>; attribut: string; desactive?: boolean }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  async function agir() {
    if (enCours || !window.confirm(confirmation)) return;
    setEnCours(true); setErreur("");
    try { await basculer(!archive); }
    catch (err) { setErreur(echecAction(err)); }
    finally { setEnCours(false); }
  }
  return <>
    <button type="button" disabled={enCours || desactive} onClick={() => void agir()} data-studio-archiver={attribut} data-studio-archive-etat={archive ? "archivee" : "active"}>{archive ? "Désarchiver" : "Archiver"}</button>
    {erreur && <p role="alert">{erreur}</p>}
  </>;
}

const carte = { display: "flex", flexDirection: "column", gap: 8 } as const;
const actions = { display: "flex", flexWrap: "wrap", gap: 6 } as const;

function StudioProjet({ projectId, archives }: { projectId: string; archives: boolean }) {
  const projet = useProjet(projectId);
  const [creation, setCreation] = useState(false);
  const accessible = !!projet.data && !refused(projet.error);
  const client = useQueryClient();
  const etudes = useQuery({ queryKey: ["studio-studies", projectId, { archives }], queryFn: () => api.studioStudies(projectId, archives), enabled: accessible, retry,
    // Basculer les archives garde la liste affichée pendant la relecture (même projet seulement).
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === projectId ? prev : undefined) });
  const relire = (studyId: string) => Promise.all([
    client.invalidateQueries({ queryKey: ["studio-studies", projectId] }),
    client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] }),
  ]);
  if (projet.isPending) return <p role="status">Chargement du projet…</p>;
  if (!accessible) return projet.isError && !refused(projet.error) ? <p role="alert">Projet indisponible. <button type="button" onClick={() => void projet.refetch()}>Réessayer</button></p> : <StudioRefus quoi="projet" />;
  const p = projet.data!;
  const lecteur = p.role === "lecteur";
  return (
    <section className="studio-welcome studio-page" data-studio-projet={p.id}>
      <header className="studio-page-entete">
        <h1>Études du projet</h1>
        {!lecteur && <button type="button" className="studio-bouton-principal" aria-expanded={creation} onClick={() => setCreation((c) => !c)} disabled={etudes.isError} data-studio-nouvelle-etude>Nouvelle étude</button>}
      </header>
      {!lecteur && creation && <NouvelleEtude projectId={p.id} surAnnuler={() => setCreation(false)} />}
      {lecteur && <p data-studio-lecture-seule>Lecture seule : la création d’études est réservée au propriétaire et aux éditeurs.</p>}
      <BasculeArchives archives={archives} vers={(a) => cheminProjetStudio(p.id, { archives: a })} />
      {etudes.isPending && <p role="status">Chargement des études…</p>}
      {etudes.isError && <><p role="alert">Études indisponibles ou accès refusé.</p><button type="button" onClick={() => void etudes.refetch()}>Réessayer</button></>}
      {etudes.data?.studies.length === 0 && <p data-studio-aucune-etude>{archives ? "Aucune étude dans ce projet pour l’instant." : "Aucune étude active dans ce projet pour l’instant."}</p>}
      {!!etudes.data?.studies.length && (
        <ul className="studio-projects" data-studio-etudes>
          {etudes.data.studies.map((s) => (
            <li key={s.id} style={carte} data-studio-etude-carte={s.id} data-studio-archivee={s.archived || undefined}>
              <Link to={cheminEtudeStudio(p.id, s.id)}>
                <strong translate="no">{s.name}</strong>
                {s.archived && <BadgeArchive />}
                <small data-studio-etude-phase={s.workflowPhase ?? "non-declaree"}>{`Phase : ${libellePhase(s.workflowPhase)}`}</small>
              </Link>
              {!s.archived && <Link to={cheminVarianteStudio(p.id, s.id, s.initialVariantId)} className="studio-bouton-principal" data-studio-ouvrir-espace={s.id}>Ouvrir l’espace de travail</Link>}
              {!lecteur && (
                <div style={actions}>
                  {!s.archived && <RenommerEnLigne nom={s.name} attribut={s.id} enregistrer={async (nom) => { await api.renameStudioStudy(p.id, s.id, nom); await relire(s.id); }} />}
                  <BoutonArchive archive={s.archived} attribut={s.id}
                    confirmation={s.archived ? `Désarchiver l’étude « ${s.name} » ? Elle redeviendra modifiable.` : `Archiver l’étude « ${s.name} » ? Elle restera lisible par son adresse, sans modification possible ; rien n’est supprimé.`}
                    basculer={async (archiver) => { await api.setStudioStudyArchived(p.id, s.id, archiver); await relire(s.id); }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {p.role === "proprietaire" && etudes.data?.exemple && <ChargerExempleP118 key={p.id} projectId={p.id} etat={etudes.data.exemple.etat} />}
    </section>
  );
}

/** Motif d'un refus de l'installation de l'exemple, restitué en clair (statut et code du serveur). */
function echecExemple(err: unknown): string {
  if (!(err instanceof ApiError) || err.status >= 500) return "Chargement non confirmé. Réessayez : l’installation reprend sans doublon.";
  if (err.status === 423) return "Chargement refusé : un autre compte modifie ce projet en ce moment. Réessayez quand il aura terminé.";
  if (err.status === 403) return "Chargement refusé : seul le propriétaire du projet peut installer l’étude exemple.";
  if (err.status === 409 && err.code === "exemple_version_changee") return "Chargement refusé : l’installation interrompue vient d’une autre version de l’exemple. Archivez cette étude pour installer la version actuelle.";
  if (err.status === 409) return "Chargement refusé : ce projet ne vient pas de l’exemple P.118.";
  return "Chargement refusé par le serveur.";
}

type RapportExemple = Awaited<ReturnType<typeof api.installStudioExample>>;

/**
 * « Charger l’exemple Studio P.118 » : ACTION DE PAGE (comme « Créer l’étude »), pas un outil d’éditeur — elle ne
 * figure donc ni au registre des outils, ni dans une barre, et n’a pas de raccourci (la règle d’or porte sur les outils
 * et commandes de l’éditeur). Propriétaire seulement, projet issu de l’exemple (le serveur le dit : `exemple` de la
 * liste des études) tant que l’étude exemple n’est pas complète ; « Reprendre l’installation de l’exemple » si elle est
 * partielle. Le serveur installe l’étude (une variante par niveau, par le contrat de commandes), de façon idempotente ;
 * la page garde ensuite le lien vers l’étude et le rapport des éléments déclarés absents (replié).
 */
function ChargerExempleP118({ projectId, etat }: { projectId: string; etat: "absente" | "partielle" | "complete" }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resultat, setResultat] = useState<RapportExemple | null>(null);
  const client = useQueryClient();
  async function charger() {
    if (enCours) return;
    setEnCours(true); setErreur("");
    let r: RapportExemple | null = null;
    try {
      r = await api.installStudioExample(projectId);
    } catch (err) {
      setErreur(echecExemple(err));
    }
    // Résultat et fin du chargement dans le même rendu (aria-busy retombe avec l'annonce), puis relecture de la liste.
    if (r) setResultat(r);
    setEnCours(false);
    if (r) await client.invalidateQueries({ queryKey: ["studio-studies", projectId] });
  }
  if (etat === "complete" && !resultat) return null;
  // Nombre d’éléments absents (une entrée peut en regrouper plusieurs : son `nombre`), pas le nombre de lignes du rapport.
  const absents = resultat?.rapport.niveaux.reduce((n, x) => n + x.rapport.absents.reduce((m, a) => m + a.nombre, 0), 0) ?? 0;
  return (
    <div className="studio-create" data-studio-exemple-p118 data-studio-exemple-etat={resultat ? "complete" : etat} aria-busy={enCours}>
      <h3>Exemple Studio</h3>
      {!resultat && (
        <button type="button" disabled={enCours} aria-busy={enCours} onClick={() => void charger()} data-studio-charger-exemple>
          {enCours ? "Chargement de l’exemple…" : etat === "partielle" ? "Reprendre l’installation de l’exemple" : "Charger l’exemple Studio P.118"}
        </button>
      )}
      <p role="status" aria-live="polite" data-studio-exemple-statut>
        {enCours ? "Installation de l’étude exemple en cours : chaque niveau est dessiné par lots de commandes." : resultat ? "Étude exemple installée." : ""}
      </p>
      {erreur && <p role="alert">{erreur}</p>}
      {resultat && (
        <>
          <Link to={cheminEtudeStudio(projectId, resultat.etude.study.id)} data-studio-ouvrir-exemple>Ouvrir l’étude exemple →</Link>
          <details data-studio-exemple-rapport>
            <summary>{`Rapport de conversion : éléments déclarés absents (${absents})`}</summary>
            {resultat.rapport.niveaux.map((n) => (
              <section key={n.niveauId} data-studio-exemple-niveau={n.niveauId}>
                <h4 translate="no">{n.nom}</h4>
                {n.rapport.absents.length ? (
                  <ul translate="no">{n.rapport.absents.map((a, i) => <li key={`${i}-${a.famille}`}><code>{a.famille}</code> × {a.nombre} — {a.raison}</li>)}</ul>
                ) : <p>Aucun élément déclaré absent.</p>}
                {n.rapport.refus.length > 0 && <p>{`Éléments refusés : ${n.rapport.refus.length}.`}</p>}
              </section>
            ))}
          </details>
        </>
      )}
    </div>
  );
}

function StudioEtude({ projectId, studyId, archives }: { projectId: string; studyId: string; archives: boolean }) {
  const projet = useProjet(projectId);
  const etude = useQuery({ queryKey: ["studio-study", projectId, studyId, { archives }], queryFn: () => api.studioStudy(projectId, studyId, archives), staleTime: 30_000, retry,
    placeholderData: (prev) => (prev?.study.id === studyId && prev.study.projectId === projectId ? prev : undefined) });
  const client = useQueryClient();
  const [derivee, setDerivee] = useState<string | null>(null);
  if (projet.isPending || etude.isPending) return <p role="status">Chargement de l’étude…</p>;
  if (!projet.data || refused(projet.error)) return projet.isError && !refused(projet.error) ? <p role="alert">Projet indisponible. <button type="button" onClick={() => void projet.refetch()}>Réessayer</button></p> : <StudioRefus quoi="projet" />;
  if (!etude.data || refused(etude.error)) return etude.isError && !refused(etude.error) ? <p role="alert">Étude indisponible. <button type="button" onClick={() => void etude.refetch()}>Réessayer</button></p> : <StudioRefus quoi="etude" />;
  const { study, variants, canWrite, canManage } = etude.data;
  const relire = () => Promise.all([
    client.invalidateQueries({ queryKey: ["studio-study", projectId, study.id] }),
    client.invalidateQueries({ queryKey: ["studio-studies", projectId] }),
  ]);
  const nomVariante = (id: string) => variants.find((v) => v.id === id)?.name;
  return (
    <section className="studio-welcome" data-studio-etude={study.id} data-studio-archivee={study.archived || undefined}>
      <p className="studio-eyebrow">FADI / STUDIO</p>
      <h1><span translate="no">{study.name}</span>{study.archived && <> <BadgeArchive /></>}</h1>
      <p>Projet : <span translate="no">{projet.data.code} — {projet.data.name}</span></p>
      {study.archived && <p role="status" data-studio-etude-archivee>Étude archivée : lecture seule. Rien n’a été supprimé.</p>}
      {canManage && (
        <div style={actions}>
          {canWrite && <RenommerEnLigne nom={study.name} attribut={study.id} enregistrer={async (nom) => { await api.renameStudioStudy(projectId, study.id, nom); await relire(); }} />}
          <BoutonArchive archive={study.archived} attribut={study.id}
            confirmation={study.archived ? `Désarchiver l’étude « ${study.name} » ? Elle redeviendra modifiable.` : `Archiver l’étude « ${study.name} » ? Elle restera lisible par son adresse, sans modification possible ; rien n’est supprimé.`}
            basculer={async (archiver) => { await api.setStudioStudyArchived(projectId, study.id, archiver); await relire(); }} />
        </div>
      )}
      <h2>Variantes</h2>
      <BasculeArchives archives={archives} vers={(a) => cheminEtudeStudio(projectId, study.id, { archives: a })} />
      {variants.length === 0 && <p data-studio-aucune-variante>Aucune variante dans cette étude pour l’instant.</p>}
      {!!variants.length && (
        <ul className="studio-projects" data-studio-variantes>
          {variants.map((v) => {
            const initiale = v.id === study.initialVariantId;
            return (
              <li key={v.id} style={carte} data-studio-variante-carte={v.id} data-studio-archivee={v.archived || undefined}>
                <Link to={cheminVarianteStudio(projectId, study.id, v.id)}>
                  <strong translate="no">{v.name}</strong>
                  {initiale && <small>Variante initiale</small>}
                  {v.derivedFrom && <small data-studio-provenance={v.derivedFrom.variantId}>Dérivée de : <span translate="no">{`${nomVariante(v.derivedFrom.variantId) ?? v.derivedFrom.variantId.slice(-8)} · ${v.derivedFrom.revisionId.slice(-8)}`}</span></small>}
                  {v.archived && <BadgeArchive />}
                  <span>Ouvrir la planche →</span>
                </Link>
                {canManage && (
                  <div style={actions}>
                    {canWrite && <button type="button" aria-expanded={derivee === v.id} onClick={() => setDerivee(derivee === v.id ? null : v.id)} data-studio-deriver={v.id}>Dériver</button>}
                    {canWrite && !v.archived && <RenommerEnLigne nom={v.name} attribut={v.id} enregistrer={async (nom) => { await api.renameStudioVariant(projectId, study.id, v.id, nom); await relire(); }} />}
                    {(!initiale || v.archived) && (
                      <BoutonArchive archive={v.archived} attribut={v.id}
                        confirmation={v.archived ? `Désarchiver la variante « ${v.name} » ?` : `Archiver la variante « ${v.name} » ? Elle restera lisible par son adresse, sans modification possible ; rien n’est supprimé.`}
                        basculer={async (archiver) => { await api.setStudioVariantArchived(projectId, study.id, v.id, archiver); await relire(); }} />
                    )}
                    {initiale && !v.archived && <small>La variante initiale s’archive avec son étude.</small>}
                  </div>
                )}
                {canWrite && derivee === v.id && <DeriverVariante projectId={projectId} studyId={study.id} source={v} />}
              </li>
            );
          })}
        </ul>
      )}
      <p><Link to={cheminComparaisonStudio(projectId, study.id)} data-studio-lien-comparer>Comparer les variantes et révisions →</Link></p>
      <EtapesParcoursEtude projectId={projectId} studyId={study.id} />
      <PanneauPublications projectId={projectId} studyId={study.id} variants={variants} canWrite={canWrite} />
      {canWrite
        ? <CreerVariante projectId={projectId} studyId={study.id} />
        : <p data-studio-lecture-seule>{study.archived ? "Lecture seule : désarchivez l’étude pour y créer des variantes." : "Lecture seule : la création de variantes est réservée aux membres autorisés à modifier ce projet."}</p>}
    </section>
  );
}

const SOURCES_REVISION: Record<string, string> = {
  "study-initialization": "Création de l’étude", "variant-initialization": "Création de la variante",
  "variant-derivation": "Dérivation", "authenticated-session": "Enregistrement",
};

/**
 * Dériver une variante : son document initial est la copie, faite par le serveur, d'une révision de `source` — la tête
 * par défaut (lue au moment de la création), ou une révision choisie dans l'historique. Création rejouable sans doublon.
 */
function DeriverVariante({ projectId, studyId, source }: { projectId: string; studyId: string; source: StudioVariantSummary }) {
  const [name, setName] = useState("");
  const [revision, setRevision] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const enCours = useRef(false);
  const demande = useRef<{ nom: string; id: string } | null>(null);
  const navigate = useNavigate();
  const client = useQueryClient();
  const historique = useQuery({ queryKey: ["studio-revisions", projectId, studyId, source.id], queryFn: () => api.studioRevisions(projectId, studyId, source.id), retry });
  const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" }); };
  async function create(e: FormEvent) {
    e.preventDefault();
    const nom = name.trim();
    if (!nom || enCours.current) return;
    enCours.current = true; setCreating(true); setError("");
    try {
      const c = await api.createStudioVariant(projectId, studyId, nom, demandeId(demande, `${nom}\u0000${source.id}\u0000${revision}`), { fromVariantId: source.id, ...(revision ? { fromRevisionId: revision } : {}) });
      demande.current = null;
      navigate(cheminVarianteStudio(projectId, studyId, c.variant.id));
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? "Dérivation refusée par le serveur." : "Dérivation non confirmée. Réessayez : la même demande sera rejouée sans doublon.");
    } finally {
      enCours.current = false; setCreating(false);
      void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
    }
  }
  return (
    <form className="studio-create" style={{ marginTop: 8 }} onSubmit={(e) => void create(e)} data-studio-deriver-formulaire={source.id}>
      <h3>Dériver une variante</h3>
      <p>Copie d’une révision de : <span translate="no">{source.name}</span></p>
      <p>La variante source n’est pas modifiée.</p>
      <label htmlFor={`studio-deriver-revision-${source.id}`}>Révision source</label>
      <select id={`studio-deriver-revision-${source.id}`} value={revision} onChange={(e) => setRevision(e.target.value)} data-studio-deriver-revision>
        <option value="">Tête (version courante)</option>
        {historique.data?.revisions.filter((r) => r.id !== source.headRevisionId).map((r) => (
          <option key={r.id} value={r.id}>{`Révision ${r.id.slice(-8)} — ${date(r.createdAt)} — ${SOURCES_REVISION[r.source] ?? r.source}`}</option>
        ))}
      </select>
      {historique.isError && <p role="alert">Historique indisponible : seule la tête peut être choisie.</p>}
      <label htmlFor={`studio-deriver-nom-${source.id}`}>Nom de la variante dérivée</label>
      <input id={`studio-deriver-nom-${source.id}`} required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button disabled={creating || !name.trim()}>Créer la variante dérivée</button>
    </form>
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
