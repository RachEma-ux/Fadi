/**
 * Panneau « Commentaires » d'une variante Studio. Règles de la Collaboration, vérifiées par le serveur : tout membre du
 * projet commente (lecteur compris, même quand la planche est en lecture seule), répond en fil, et seul l'auteur
 * supprime son commentaire (suppression douce : le fil reste lisible). Un commentaire peut citer les objets
 * sélectionnés qui existent dans la révision affichée ; cliquer un commentaire ancré sélectionne ces objets.
 * Un envoi non confirmé se rejoue avec le même `requestId` : jamais de doublon.
 * Observations (E.2) : un commentaire d'origine peut devenir une observation suivie (responsable, échéance, statut,
 * journal) ; filtres « Mes observations », « Ouvertes », « À recontrôler » (`observations.ts`, `Observation.tsx`).
 * Audience (écart E1) : un nouveau fil est réservé à l'équipe (propriétaire et éditeurs) sauf « Visible par les lecteurs » ;
 * l'auteur ou le propriétaire change l'audience d'un fil ; un lecteur écrit pour tout le projet et ne reçoit jamais un fil de l'équipe.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StudioDocument } from "@parcours/atelier-model";
import { api, ApiError, type StudioComment } from "../../../lib/api";
import { declenche, propsRaccourci, type CommandeCollaboration } from "../../collaboration/commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "../../collaboration/IconeCollaboration";

/** Propriétaire ou éditeur : choisit l'audience d'un fil (le serveur en décide et filtre). */
const deLEquipe = (role: string | undefined) => role === "proprietaire" || role === "editeur";
import { LOCALE } from "../../../lib/i18n";
import { ancrageSelection, objetsPresents, regrouperFils } from "./fils";
import { ObservationCommentaire, type ContexteObservation } from "./Observation";
import { compterFiltres, FILTRE_LIBELLE, FILTRES, filtrerFils, type FiltreObservations } from "./observations";
import "./commentaires.css";

export interface PanneauCommentairesProps {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Révision affichée (tête ou révision historique) et son document enregistré. */
  revisionId: string;
  revision: StudioDocument;
  /** Dessin affiché (brouillon compris) : les objets cités y sont recherchés pour la sélection. */
  dessin: StudioDocument;
  selection: readonly string[];
  /** Droit de modifier la planche, relu par le serveur (les commentaires restent permis sans lui). */
  canWrite: boolean;
  surSelection: (ids: string[]) => void;
}

const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };

function demandeId(demande: { current: { cle: string; id: string } | null }, cle: string): string {
  if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
  return demande.current.id;
}

export function PanneauCommentaires(props: PanneauCommentairesProps) {
  const { projectId, studyId, variantId } = props;
  const cle = ["studio-comments", projectId, studyId, variantId];
  const client = useQueryClient();
  const comments = useQuery({ queryKey: cle, queryFn: () => api.studioComments(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1 });
  const [info, setInfo] = useState("");
  const [filtre, setFiltre] = useState<FiltreObservations>("tous");
  const tousFils = comments.data ? regrouperFils(comments.data.comments) : [];
  const fils = filtrerFils(tousFils, filtre);
  const comptes = compterFiltres(tousFils);
  const relire = () => client.invalidateQueries({ queryKey: cle });
  const archived = comments.data?.archived === true;
  const me = comments.data?.me;
  const contexte = (c: StudioComment): ContexteObservation => ({
    projectId, studyId, variantId, revisionId: props.revisionId, participants: comments.data?.participants ?? [], surModifie: relire,
    peutPromouvoir: !archived && (c.mine || me?.role === "proprietaire"),
  });

  function choisir(c: StudioComment) {
    if (!c.objectIds.length) return;
    const { presents, absents } = objetsPresents(c, props.dessin);
    props.surSelection(presents);
    setInfo(absents ? `${absents} objet(s) cité(s) absent(s) du dessin affiché.` : "");
  }

  return <section className="studio-revisions studio-commentaires" aria-labelledby="studio-commentaires-titre" data-studio-commentaires>
    <h2 id="studio-commentaires-titre">Commentaires</h2>
    <p className="studio-revisions-sub">Tout membre du projet peut commenter et répondre ; seul l’auteur supprime son commentaire.</p>
    {!props.canWrite && <p role="status" data-studio-commentaires-lecture-seule>Planche en lecture seule : vous ne pouvez pas modifier le dessin, mais vous pouvez commenter.</p>}
    <NouveauCommentaire {...props} equipe={deLEquipe(me?.role)} surEnvoye={relire} />
    {info && <p className="studio-info" role="status">{info}</p>}
    {comments.isPending && <p role="status">Chargement des commentaires…</p>}
    {comments.isError && <p role="alert">Commentaires indisponibles. <button type="button" onClick={() => void comments.refetch()}>Réessayer</button></p>}
    {archived && <p role="status" data-studio-observations-archive>Variante archivée : commentaires et observations en lecture seule.</p>}
    {tousFils.length > 0 && <div className="studio-commentaires-filtres" role="group" aria-label="Filtrer les observations" data-studio-filtres-observations>
      {FILTRES.map((f) => <button key={f} type="button" aria-pressed={filtre === f} onClick={() => setFiltre(f)} data-studio-filtre={f}>{`${FILTRE_LIBELLE[f]} (${comptes[f]})`}</button>)}
    </div>}
    {comments.data && tousFils.length === 0 && <p data-studio-aucun-commentaire>Aucun commentaire sur cette variante.</p>}
    {tousFils.length > 0 && fils.length === 0 && <p data-studio-aucune-observation>Aucune observation pour ce filtre.</p>}
    {fils.length > 0 && <ol className="studio-commentaires-fils">{fils.map((f) => <li key={f.origine.id} data-studio-fil={f.origine.id}>
      <Commentaire {...props} c={f.origine} surChoisir={choisir} surModifie={relire} equipe={deLEquipe(me?.role)} proprietaire={me?.role === "proprietaire"} />
      <ObservationCommentaire c={f.origine} ctx={contexte(f.origine)} />
      {f.reponses.length > 0 && <ol className="studio-commentaires-reponses">{f.reponses.map((r) => <li key={r.id}><Commentaire {...props} c={r} surChoisir={choisir} surModifie={relire} equipe={deLEquipe(me?.role)} proprietaire={me?.role === "proprietaire"} /></li>)}</ol>}
    </li>)}</ol>}
  </section>;
}

function NouveauCommentaire(props: PanneauCommentairesProps & { parentId?: string; equipe: boolean; surEnvoye: () => void; surFermer?: () => void }) {
  const [body, setBody] = useState("");
  const [ancrer, setAncrer] = useState(true);
  const [lecteurs, setLecteurs] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState("");
  const enCours = useRef(false);
  const demande = useRef<{ cle: string; id: string } | null>(null);
  const { citables, nonEnregistres } = ancrageSelection(props.selection, props.revision);
  const objets = !props.parentId && ancrer ? citables : [];
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    const texte = body.trim();
    if (!texte || enCours.current) return;
    enCours.current = true; setEnvoi(true); setError("");
    // Une réponse suit l'audience de son fil ; sans choix, le serveur réserve le fil à l'équipe (un lecteur : tout le projet).
    const input = { body: texte, ...(props.parentId ? { parentId: props.parentId } : {}), ...(objets.length ? { objectIds: objets, revisionId: props.revisionId } : {}), ...(!props.parentId && props.equipe && lecteurs ? { audience: "projet" as const } : {}) };
    try {
      await api.createStudioComment(props.projectId, props.studyId, props.variantId, { ...input, requestId: demandeId(demande, JSON.stringify(input)) });
      demande.current = null; setBody(""); setLecteurs(false);
      props.surEnvoye(); props.surFermer?.();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 && err.status !== 408 ? "Commentaire refusé par le serveur." : "Envoi non confirmé. Réessayez : le même commentaire sera rejoué sans doublon.");
    } finally { enCours.current = false; setEnvoi(false); }
  }
  const id = `studio-commentaire-${props.parentId ?? "nouveau"}`;
  // Règle d'or : Alt+Maj+1 coche ou décoche « Visible par les lecteurs » depuis le formulaire d'un nouveau fil.
  const raccourci = (e: KeyboardEvent) => { if (!props.parentId && props.equipe && declenche(e, "visible-lecteurs")) { e.preventDefault(); setLecteurs((v) => !v); } };
  return <form className="studio-commentaires-form" onKeyDown={raccourci} onSubmit={(e) => void envoyer(e)} data-studio-commenter={props.parentId ? "reponse" : "nouveau"}>
    <label htmlFor={id}>{props.parentId ? "Votre réponse" : "Nouveau commentaire"}</label>
    <textarea id={id} required maxLength={4000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
    {!props.parentId && citables.length > 0 && <label className="studio-commentaires-ancre"><input type="checkbox" checked={ancrer} onChange={(e) => setAncrer(e.target.checked)} data-studio-ancrer /> {`Citer la sélection (${citables.length} objet(s))`}</label>}
    {!props.parentId && ancrer && nonEnregistres.length > 0 && <p className="studio-info">{`${nonEnregistres.length} objet(s) non enregistré(s) ne peuvent pas être cités.`}</p>}
    {!props.parentId && props.equipe && <label className="studio-commentaires-ancre"><input type="checkbox" checked={lecteurs} onChange={(e) => setLecteurs(e.target.checked)} data-studio-audience {...propsRaccourci("visible-lecteurs")} /><IconeCollaboration commande="visible-lecteurs" /> Visible par les lecteurs <RaccourciCollaboration commande="visible-lecteurs" /></label>}
    {error && <p role="alert">{error}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || !body.trim()}>{props.parentId ? "Répondre" : "Commenter"}</button>
      {props.surFermer && <button type="button" onClick={props.surFermer}>Fermer</button>}
    </div>
  </form>;
}

function Commentaire(props: PanneauCommentairesProps & { c: StudioComment; equipe: boolean; proprietaire: boolean; surChoisir: (c: StudioComment) => void; surModifie: () => void }) {
  const { c } = props;
  const [repondre, setRepondre] = useState(false);
  const [error, setError] = useState("");
  const [suppression, setSuppression] = useState(false);
  const [bascule, setBascule] = useState(false);
  const audience = c.audience ?? "projet";
  async function basculer() {
    setBascule(true); setError("");
    try { await api.setStudioCommentAudience(props.projectId, props.studyId, props.variantId, c.id, audience === "projet" ? "equipe" : "projet"); props.surModifie(); }
    catch (err) { setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Audience non modifiée."); }
    finally { setBascule(false); }
  }
  async function supprimer() {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    setSuppression(true); setError("");
    try { await api.deleteStudioComment(props.projectId, props.studyId, props.variantId, c.id); props.surModifie(); }
    catch { setError("Suppression refusée ou non confirmée."); }
    finally { setSuppression(false); }
  }
  // Audience du fil : bouton, icône propre et raccourci Alt+Maj+2 depuis le fil (règle d'or).
  const peutBasculer = !c.parentId && props.equipe && (c.mine || props.proprietaire);
  const sens: CommandeCollaboration = audience === "projet" ? "reserver-equipe" : "rendre-visible";
  return <article className="studio-commentaire" data-studio-commentaire={c.id} data-studio-commentaire-supprime={c.deletedAt ? "" : undefined}
    onKeyDown={(e) => { if (peutBasculer && !bascule && declenche(e, sens)) { e.preventDefault(); void basculer(); } }}>
    <p className="studio-commentaire-entete">
      <strong>{c.mine ? "Vous" : <span translate="no">{c.authorEmail}</span>}</strong>
      <span translate="no">{date(c.createdAt)}</span>
      {c.revisionId && c.revisionId !== props.revisionId && <span>Révision <span translate="no" title={c.revisionId}>{c.revisionId.slice(-8)}</span></span>}
      {!c.parentId && <span data-studio-audience-etat={audience}>{audience === "projet" ? "Visible par les lecteurs" : "Équipe"}</span>}
    </p>
    {c.deletedAt ? <p className="studio-commentaire-supprime">Commentaire supprimé par son auteur.</p> : <p className="studio-commentaire-texte" translate="no">{c.body}</p>}
    <div className="studio-commentaires-actions">
      {c.objectIds.length > 0 && <button type="button" onClick={() => props.surChoisir(c)} data-studio-commentaire-objets={c.objectIds.join(" ")}>{`Sélectionner les objets cités (${c.objectIds.length})`}</button>}
      {!c.parentId && <button type="button" aria-expanded={repondre} onClick={() => setRepondre((v) => !v)}>Répondre</button>}
      {c.mine && !c.deletedAt && !c.observation && <button type="button" disabled={suppression} onClick={() => void supprimer()} data-studio-supprimer-commentaire>Supprimer</button>}
      {peutBasculer && <button type="button" disabled={bascule} onClick={() => void basculer()} data-studio-audience-basculer={c.id} {...propsRaccourci(sens)}><IconeCollaboration commande={sens} />{audience === "projet" ? "Réserver à l’équipe" : "Rendre visible aux lecteurs"} <RaccourciCollaboration commande={sens} /></button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {repondre && <NouveauCommentaire {...props} parentId={c.id} surEnvoye={props.surModifie} surFermer={() => setRepondre(false)} />}
  </article>;
}
