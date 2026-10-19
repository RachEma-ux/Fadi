/**
 * Accueil de Studio (`/studio`, Plan d'implémentation §2.2, NAV-003) : un seul écran, sans redirection automatique.
 *
 * - « Reprendre : projet › étude › variante » : la dernière variante ouverte par ce compte sur cet appareil
 *   (`accueil/dernier-contexte.ts`), proposée seulement après relecture par le serveur (droits, étude et variante non
 *   archivées). C'est une SUGGESTION, jamais une permission ni un remplacement de l'adresse demandée : rien ne s'ouvre
 *   sans clic, et une adresse directe est toujours respectée. Refusée ou introuvable, elle est oubliée.
 * - Choix explicite : un projet (liste compacte), puis une de ses études et une de ses variantes (liens directs vers
 *   l'espace de travail).
 * - « Nouvelle étude » dans le projet choisi : nom prérempli modifiable, puis « Ouvrir ». Le clic est le choix explicite
 *   qui crée l'étude et sa variante initiale (aucun projet fictif, rien n'est créé à l'ouverture de Studio). La planche
 *   (2D / 3D) se choisit dans le domaine 01, pas ici.
 * - `?domaine=` (menu « Studio » de la barre latérale, sans variante affichée) : le domaine dans lequel s'ouvrent la
 *   variante reprise, la variante choisie ou l'étude créée.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, ROLE_LABEL, type Project } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { LOCALE } from "../../../lib/i18n";
import { cheminProjetStudio, cheminVarianteStudio } from "../routes-studio";
import { type DomaineStudio } from "../domaines/definitions";
import { contextesDuCompte, oublierContexte, type ContexteStudio } from "./dernier-contexte";

const refuse = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const reessai = (n: number, e: unknown) => !refuse(e) && n < 1;

/** Une création non confirmée (réseau, 5xx) se rejoue avec le même requestId : le serveur rend la même étude, sans doublon. */
function demandeId(demande: { current: { nom: string; id: string } | null }, cle: string): string {
  if (demande.current?.nom !== cle) demande.current = { nom: cle, id: crypto.randomUUID() };
  return demande.current.id;
}

/** Adresse d'ouverture d'une variante, dans un domaine demandé (et, pour la reprise, sa dernière planche). */
export function adresseOuverture(c: Pick<ContexteStudio, "projectId" | "studyId" | "variantId">, domaine: DomaineStudio | null, planche: ContexteStudio["planche"] = null): string {
  if (!domaine) return cheminVarianteStudio(c.projectId, c.studyId, c.variantId);
  return cheminVarianteStudio(c.projectId, c.studyId, c.variantId, null, { domaine, planche: domaine === "dessin" ? planche : null });
}

/**
 * Vérification serveur d'une suggestion. `valide` : étude et variante actives ; `archivee` : la variante (ou son étude)
 * est archivée — toujours consultable, en lecture seule, donc gardée et signalée ; `refusee` : accès refusé (403) ou
 * introuvable (404, ou variante absente de l'étude) — oubliée ; `inverifiable` : le serveur n'a pas répondu.
 */
function useVerification(c: ContexteStudio | undefined) {
  const q = useQuery({
    queryKey: ["studio-study", c?.projectId ?? "", c?.studyId ?? "", { archives: true }], queryFn: () => api.studioStudy(c!.projectId, c!.studyId, true),
    enabled: !!c, staleTime: 30_000, retry: reessai,
  });
  const variante = q.data?.variants.find((v) => v.id === c?.variantId);
  const archivee = !!variante && (variante.archived || !!q.data?.study.archived);
  const etat: "attente" | "valide" | "archivee" | "refusee" | "inverifiable" = !c ? "refusee" : q.isPending ? "attente"
    : variante ? (archivee ? "archivee" : "valide") : q.isError && !refuse(q.error) ? "inverifiable" : "refusee";
  return { etat, etude: q.data?.study, variante };
}

export function StudioAccueil({ domaine }: { domaine: DomaineStudio | null }) {
  const { user } = useAuth();
  const dernier = useMemo(() => contextesDuCompte(user?.id)[0], [user?.id]);
  const verif = useVerification(dernier);
  // Suggestion refusée par le serveur (droit retiré, introuvable) : oubliée. Archivée : gardée, signalée en lecture seule.
  useEffect(() => { if (dernier && verif.etat === "refusee") oublierContexte(user?.id, dernier); }, [dernier, verif.etat, user?.id]);
  const projets = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, staleTime: 30_000 });
  const [choix, setChoix] = useState<string | null>(null);
  const liste = projets.data ?? [];
  // Projet choisi : celui de l'utilisateur, sinon celui de la suggestion, sinon le premier (aucun n'est créé).
  const projet = liste.find((p) => p.id === choix) ?? liste.find((p) => p.id === dernier?.projectId) ?? liste[0];
  const codeReprise = liste.find((p) => p.id === dernier?.projectId)?.code ?? dernier?.noms?.projet;
  return (
    <section className="studio-lanceur" aria-labelledby="studio-lanceur-titre" data-studio-lanceur data-studio-lanceur-domaine={domaine ?? undefined}>
      <h1 id="studio-lanceur-titre" className="studio-masque">Accueil Studio</h1>
      {dernier && verif.etat === "attente" && <p role="status" data-studio-reprise-attente>Vérification de la dernière variante…</p>}
      {dernier && (verif.etat === "valide" || verif.etat === "archivee" || verif.etat === "inverifiable") && <div className="studio-lanceur-reprise" data-studio-reprendre-bloc data-studio-reprise-verifiee={verif.etat === "inverifiable" ? "non" : "oui"} data-studio-reprise-archivee={verif.etat === "archivee" ? "" : undefined}>
        <Link to={adresseOuverture(dernier, domaine ?? dernier.domaine, dernier.planche)} className="studio-bouton-principal" data-studio-reprendre>
          <span>Reprendre :</span> <span translate="no">{[codeReprise, verif.etude?.name ?? dernier.noms?.etude, verif.variante?.name ?? dernier.noms?.variante].filter(Boolean).join(" › ")}</span>
        </Link>
        {verif.etat === "archivee" && <small className="studio-revision-tag" data-studio-reprise-lecture-seule>Archivée — lecture seule</small>}
        {verif.etat === "inverifiable" && <small>Non vérifiée : le serveur n’a pas répondu ; l’accès sera contrôlé à l’ouverture.</small>}
      </div>}
      <section className="studio-lanceur-section" aria-labelledby="studio-projets-titre">
        <h2 id="studio-projets-titre">Projets</h2>
        {projets.isPending && <p role="status">{projets.fetchStatus === "paused" ? "En attente de connexion" : "Chargement des projets…"}</p>}
        {projets.isError && <p role="alert">Impossible de charger vos projets. <button type="button" onClick={() => void projets.refetch()}>Réessayer</button></p>}
        {projets.data?.length === 0 && <p data-studio-aucun-projet>Aucun projet disponible. <Link to="/projets">Créez un projet dans Projets.</Link></p>}
        {liste.length > 0 && <div className="studio-lanceur-projets" role="group" aria-label="Projets" data-studio-projets>
          {liste.map((p) => <button key={p.id} type="button" aria-pressed={p.id === projet?.id} onClick={() => setChoix(p.id)} data-studio-choix-projet-id={p.id}>
            <strong translate="no">{p.code}</strong> <span translate="no">{p.name}</span> <small>{ROLE_LABEL[p.role ?? "proprietaire"]}</small>
          </button>)}
        </div>}
      </section>
      {projet && <EtudesDuProjet key={projet.id} projet={projet} domaine={domaine} />}
      {projet && (projet.role === "lecteur"
        ? <p data-studio-lecture-seule>Lecture seule : la création d’études est réservée au propriétaire et aux éditeurs.</p>
        : <NouvelleEtude key={`n-${projet.id}`} projectId={projet.id} domaine={domaine} />)}
    </section>
  );
}

/** Études du projet choisi et leurs variantes : choix explicite d'une variante (lien vers l'espace de travail). */
function EtudesDuProjet({ projet, domaine }: { projet: Project; domaine: DomaineStudio | null }) {
  const etudes = useQuery({ queryKey: ["studio-studies", projet.id, { archives: false }], queryFn: () => api.studioStudies(projet.id, false), retry: reessai });
  return (
    <section className="studio-lanceur-section" aria-labelledby="studio-etudes-titre" data-studio-lanceur-etudes={projet.id}>
      <h2 id="studio-etudes-titre">Études et variantes — <span translate="no">{projet.code}</span></h2>
      {etudes.isPending && <p role="status">Chargement des études…</p>}
      {etudes.isError && <p role="alert">Études indisponibles ou accès refusé.</p>}
      {etudes.data?.studies.length === 0 && <p data-studio-aucune-etude>Aucune étude active dans ce projet pour l’instant.</p>}
      {!!etudes.data?.studies.length && <ul className="studio-lanceur-liste">
        {etudes.data.studies.map((s) => <VariantesEtude key={s.id} projectId={projet.id} studyId={s.id} nom={s.name} domaine={domaine} />)}
      </ul>}
      <p><Link to={cheminProjetStudio(projet.id)} data-studio-gerer-etudes>Gérer les études du projet</Link></p>
    </section>
  );
}

function VariantesEtude({ projectId, studyId, nom, domaine }: { projectId: string; studyId: string; nom: string; domaine: DomaineStudio | null }) {
  const etude = useQuery({ queryKey: ["studio-study", projectId, studyId, { archives: false }], queryFn: () => api.studioStudy(projectId, studyId, false), retry: reessai, staleTime: 30_000 });
  return <li className="studio-lanceur-etude" data-studio-lanceur-etude={studyId}>
    <strong translate="no">{nom}</strong>
    <span className="studio-lanceur-variantes">
      {etude.isPending && <small role="status">Chargement…</small>}
      {etude.data?.variants.map((v) => <Link key={v.id} to={adresseOuverture({ projectId, studyId, variantId: v.id }, domaine)} data-studio-ouvrir-variante={v.id}><span translate="no">{v.name}</span></Link>)}
    </span>
  </li>;
}

/** Nom prérempli d'une nouvelle étude (modifiable) : « Étude » et la date du jour. */
const nomPropose = () => `Étude ${new Date().toLocaleDateString(LOCALE)}`;

/**
 * Nouvelle étude (projet fixé par l'accueil ou la page du projet) : nom prérempli, puis « Ouvrir ». Ouvre la variante
 * initiale dans Dessin et modélisation (ou le domaine demandé), sans planche imposée : elle se choisit dans le domaine 01.
 * Création rejouable sans doublon ; le serveur reste seul juge du droit.
 */
export function NouvelleEtude({ projectId, domaine = null, surAnnuler }: { projectId: string; domaine?: DomaineStudio | null; surAnnuler?: () => void }) {
  const [nom, setNom] = useState(nomPropose);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState("");
  const verrou = useRef(false);
  const demande = useRef<{ nom: string; id: string } | null>(null);
  const navigate = useNavigate();
  const client = useQueryClient();
  async function ouvrir(e: FormEvent) {
    e.preventDefault();
    const propre = nom.trim();
    if (!propre || verrou.current) return;
    verrou.current = true; setEnCours(true); setEchec("");
    try {
      const c = await api.createStudioStudy(projectId, propre, demandeId(demande, `${projectId}\u0000${propre}`));
      demande.current = null;
      navigate(adresseOuverture({ projectId, studyId: c.study.id, variantId: c.variant.id }, domaine));
    } catch (err) {
      setEchec(err instanceof ApiError && err.status < 500 ? "Création refusée par le serveur." : "Création non confirmée. Réessayez : la même demande sera rejouée sans doublon.");
    } finally {
      verrou.current = false; setEnCours(false);
      void client.invalidateQueries({ queryKey: ["studio-studies", projectId] });
    }
  }
  return (
    <form className="studio-nouvelle-etude" onSubmit={(e) => void ouvrir(e)} aria-labelledby="studio-nouvelle-etude-titre" data-studio-creer-etude>
      <h2 id="studio-nouvelle-etude-titre">Nouvelle étude</h2>
      <label htmlFor="studio-etude-nom">Nom de l’étude</label>
      <input id="studio-etude-nom" required maxLength={160} value={nom} onChange={(e) => setNom(e.target.value)} />
      {echec && <p role="alert">{echec}</p>}
      <div className="studio-nouvelle-etude-actions">
        <button className="studio-bouton-principal" disabled={enCours || !nom.trim()} data-studio-ouvrir-etude>{enCours ? "Ouverture…" : "Ouvrir"}</button>
        {surAnnuler && <button type="button" onClick={surAnnuler} data-studio-annuler-creation>Annuler</button>}
      </div>
    </form>
  );
}
