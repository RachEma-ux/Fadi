/**
 * Panneau « Observations » d'une variante Studio (E.2-01 à E.2-05), ouvert avec les commentaires.
 *
 * - Identité unique (E.2-01) : une observation suit un ou plusieurs éléments de domaines (objet du modèle, ligne de
 *   métré, exigence BIM, revue) ; un élément déjà suivi renvoie vers l'observation existante, réemployée, jamais doublée.
 * - Contexte et responsable (E.2-02) : étude, variante, révision et objets d'ancrage, vue citée (plan ou 3D), responsable.
 * - Tâches et décisions distinctes (E.2-03) : tâches attribuées avec leur journal ; propositions (éditeur) et décisions
 *   (propriétaire) dans un journal à part des passages.
 * - Correction, recontrôle et clôture (E.2-04 / E.2-05) : mêmes passages que le fil des commentaires
 *   (`ObservationCommentaire`) ; la clôture, réservée au propriétaire, est motivée.
 * Le serveur fait autorité : seuls les gestes qu'il permet (`possibles`, `peut`) sont proposés, chaque refus est affiché
 * tel quel, et un envoi non confirmé se rejoue avec le même `requestId`.
 */
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StudioDocument } from "@parcours/atelier-model";
import { api, ApiError, type StudioComment, type StudioParticipant } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { declenche, propsRaccourci } from "../../collaboration/commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "../../collaboration/IconeCollaboration";
import { ObservationCommentaire } from "../commentaires/Observation";
import { STATUT_LIBELLE } from "../commentaires/observations";
import { apiExigences } from "../exigences/api-exigences";
import { apiObservations, type DomaineObservation, type NatureDecision, type ObservationSuivie, type PassageTache, type PorteeDecision, type RapprochementLu, type TacheObservation, type VueObservation } from "./api-observations";
import {
  compterSuivi, dernierRapprochement, LIBELLE_SUIVI_RAPPROCHEMENT, DOMAINES, FILTRES_SUIVI, libelleDecision, libelleLien, LIBELLE_DOMAINE, LIBELLE_FILTRE_SUIVI, LIBELLE_JOURNAL_TACHE, LIBELLE_PASSAGE_TACHE,
  LIBELLE_STATUT_TACHE, LIBELLE_VUE, lireRefus, optionsLien, passeFiltreSuivi, suiviPar, type FiltreSuivi, type SourcesLien,
} from "./suivi-ui";
import "./observations.css";

export interface PanneauObservationsProps {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Révision affichée (enregistrée) et son document : objets et métré proposés y sont lus. */
  revisionId: string;
  revision: StudioDocument;
  selection: readonly string[];
  /** Vue courante de l'espace de travail, citée à l'ouverture. */
  vue: VueObservation;
  surSelection: (ids: string[]) => void;
}

interface Ctx extends PanneauObservationsProps {
  participants: readonly StudioParticipant[]; meId: string | undefined; equipe: boolean; sources: SourcesLien; liste: readonly ObservationSuivie[]; relire: () => void; montrer: (id: string) => void;
  /** Dernier rapprochement consigné de chaque observation (EX-086). */
  rapprochements: ReadonlyMap<string, RapprochementLu>;
}

const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
const court = (id: string) => id.slice(-8);
const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };
const jour = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(LOCALE, { dateStyle: "medium" }); };

function useDemande() {
  const ref = useRef<{ cle: string; id: string } | null>(null);
  return {
    id: (cle: string) => { if (ref.current?.cle !== cle) ref.current = { cle, id: crypto.randomUUID() }; return ref.current.id; },
    oublier: () => { ref.current = null; },
  };
}

export function PanneauObservations(props: PanneauObservationsProps) {
  const { projectId, studyId, variantId } = props;
  const cle = ["studio-observations", projectId, studyId, variantId];
  const client = useQueryClient();
  const lecture = useQuery({ queryKey: cle, queryFn: () => apiObservations.lire(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1 });
  const exigences = useQuery({ queryKey: ["studio-observations-exigences", projectId, studyId], queryFn: () => apiExigences.lire(projectId, studyId), retry: false });
  const publications = useQuery({ queryKey: ["studio-observations-publications", projectId, studyId], queryFn: () => api.studioPublications(projectId, studyId), retry: false });
  const rapprochements = useQuery({ queryKey: [...cle, "rapprochements"], queryFn: () => apiObservations.rapprochements(projectId, studyId, variantId), retry: false });
  const [filtre, setFiltre] = useState<FiltreSuivi>("toutes");
  const [ouvrir, setOuvrir] = useState(false);
  const [rapprochement, setRapprochement] = useState<{ enCours: boolean; message: string | null }>({ enCours: false, message: null });
  const liste = lecture.data?.observations ?? [];
  const comptes = compterSuivi(liste);
  const visibles = liste.filter((o) => passeFiltreSuivi(o, filtre));
  const archived = lecture.data?.archived === true;
  const ctx: Ctx = {
    ...props, participants: lecture.data?.participants ?? [], meId: lecture.data?.me.id, liste,
    // Audience (écart E1) : propriétaire et éditeurs choisissent ; un lecteur ouvre toujours pour tout le projet.
    equipe: lecture.data?.me.role === "proprietaire" || lecture.data?.me.role === "editeur",
    sources: {
      revision: props.revision, selection: props.selection,
      exigences: (exigences.data?.courante?.exigences ?? []).map((x) => ({ id: x.id, libelle: x.libelle })),
      publications: (publications.data?.publications ?? []).filter((p) => p.variantId === variantId).map((p) => ({ id: p.id, title: p.title })),
    },
    // Le fil des commentaires montre aussi les observations : les deux lectures sont relues ensemble.
    relire: () => { void client.invalidateQueries({ queryKey: cle }); void client.invalidateQueries({ queryKey: ["studio-comments", projectId, studyId, variantId] }); },
    rapprochements: dernierRapprochement(rapprochements.data?.rapprochements ?? []),
    montrer: (id) => {
      setFiltre("toutes");
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-studio-suivi="${CSS.escape(id)}"]`)?.focus());
    },
  };

  // Rapprochement avec la révision affichée (EX-086) : propriétaire ou éditeur ; aucun statut d'observation n'est modifié.
  const peutRapprocher = ctx.equipe && !archived && liste.length > 0;
  async function rapprocher() {
    if (rapprochement.enCours) return;
    setRapprochement({ enCours: true, message: null });
    try {
      const r = await apiObservations.rapprocher(projectId, studyId, variantId, props.revisionId);
      const disparus = r.resultats.filter((x) => x.suivi === "objet-disparu").length;
      setRapprochement({ enCours: false, message: `${r.resultats.length} observation(s) rapprochée(s) avec la révision ${court(r.revisionId)} ; ${disparus} avec un objet disparu (aucune n’est close).` });
      void client.invalidateQueries({ queryKey: [...cle, "rapprochements"] });
    } catch (err) { setRapprochement({ enCours: false, message: lireRefus(err, "Rapprochement refusé par le serveur.").message }); }
  }
  return <section className="studio-revisions studio-observations" aria-labelledby="studio-observations-titre" data-studio-observations tabIndex={-1}
    onKeyDown={(e) => { if (peutRapprocher && declenche(e, "rapprocher-observations")) { e.preventDefault(); void rapprocher(); } }}>
    <h2 id="studio-observations-titre">Observations</h2>
    <p className="studio-revisions-sub">Une observation garde la même identité dans chaque domaine (objet, métré, exigence, revue). Seul le propriétaire du projet la clôture ; un éditeur propose.</p>
    {lecture.isPending && <p role="status">Chargement des observations…</p>}
    {lecture.isError && <p role="alert">Observations indisponibles. <button type="button" onClick={() => void lecture.refetch()}>Réessayer</button></p>}
    {archived && <p role="status">Variante archivée : observations en lecture seule.</p>}
    {lecture.data && !archived && <div className="studio-commentaires-actions">
      <button type="button" aria-expanded={ouvrir} onClick={() => setOuvrir((v) => !v)} data-studio-suivi-ouvrir>Ouvrir une observation</button>
      {peutRapprocher && <button type="button" disabled={rapprochement.enCours} onClick={() => void rapprocher()} data-studio-suivi-rapprocher {...propsRaccourci("rapprocher-observations")}>
        <IconeCollaboration commande="rapprocher-observations" /> Rapprocher avec la révision courante <RaccourciCollaboration commande="rapprocher-observations" />
      </button>}
    </div>}
    {rapprochement.message && <p role="status" data-studio-suivi-rapprochement-message>{rapprochement.message}</p>}
    {ouvrir && <Ouverture ctx={ctx} surFermer={() => setOuvrir(false)} />}
    {liste.length > 0 && <div className="studio-commentaires-filtres" role="group" aria-label="Filtrer le suivi des observations" data-studio-suivi-filtres>
      {FILTRES_SUIVI.map((f) => <button key={f} type="button" aria-pressed={filtre === f} onClick={() => setFiltre(f)} data-studio-suivi-filtre={f}>{`${LIBELLE_FILTRE_SUIVI[f]} (${comptes[f]})`}</button>)}
    </div>}
    {lecture.data && liste.length === 0 && <p data-studio-suivi-aucune>Aucune observation sur cette variante.</p>}
    {liste.length > 0 && visibles.length === 0 && <p>Aucune observation pour ce filtre.</p>}
    {visibles.length > 0 && <ol className="studio-commentaires-fils">{visibles.map((o) => <li key={o.id}><Fiche o={o} ctx={ctx} /></li>)}</ol>}
  </section>;
}

/** Choix d'un élément de domaine : domaine, puis élément proposé ; signale l'observation qui le suit déjà. */
function ChoixLien({ ctx, domaine, refLien, surDomaine, surRef, sauf }: { ctx: Ctx; domaine: DomaineObservation | ""; refLien: string; surDomaine: (d: DomaineObservation | "") => void; surRef: (r: string) => void; sauf?: string }) {
  const options = domaine ? optionsLien(domaine, ctx.sources) : [];
  const deja = domaine && refLien ? suiviPar(ctx.liste, domaine, refLien) : null;
  const id = `studio-suivi-${sauf ?? "nouvelle"}`;
  return <>
    <label htmlFor={`${id}-domaine`}>Domaine suivi</label>
    <select id={`${id}-domaine`} value={domaine} onChange={(e) => { surDomaine(e.target.value as DomaineObservation | ""); surRef(""); }} data-studio-suivi-domaine>
      <option value="">Aucun</option>
      {DOMAINES.map((d) => <option key={d} value={d}>{LIBELLE_DOMAINE[d]}</option>)}
    </select>
    {domaine && <>
      <label htmlFor={`${id}-ref`}>Élément</label>
      <select id={`${id}-ref`} value={refLien} onChange={(e) => surRef(e.target.value)} data-studio-suivi-ref>
        <option value="">Choisir…</option>
        {options.map((o) => <option key={o.ref} value={o.ref} translate="no">{o.libelle}</option>)}
      </select>
      {options.length === 0 && <p className="studio-info">{domaine === "objet" || domaine === "metre" ? "Sélectionnez d’abord, sur la planche, un objet enregistré dans la révision affichée." : "Aucun élément disponible pour ce domaine."}</p>}
    </>}
    {deja && deja.id !== sauf && <p className="studio-info" role="status" data-studio-suivi-deja={deja.id}>
      Cet élément est déjà suivi par une observation de la variante : réemployez-la. <button type="button" onClick={() => ctx.montrer(deja.id)}>Voir l’observation</button>
    </p>}
  </>;
}

function Ouverture({ ctx, surFermer }: { ctx: Ctx; surFermer: () => void }) {
  const assignables = ctx.participants.filter((p) => p.assignable);
  const [body, setBody] = useState("");
  const [responsableId, setResponsable] = useState(assignables[0]?.id ?? "");
  const [echeance, setEcheance] = useState("");
  const [citer, setCiter] = useState(true);
  const [lecteurs, setLecteurs] = useState(false);
  const [domaine, setDomaine] = useState<DomaineObservation | "">("");
  const [refLien, setRef] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<{ message: string; observationId: string | null } | null>(null);
  const demande = useDemande();
  const known = new Set([...ctx.revision.objects.map((o) => o.id), ...(ctx.revision.dimensions ?? []).map((d) => d.id)]);
  const citables = ctx.selection.filter((id) => known.has(id));
  const deja = domaine && refLien ? suiviPar(ctx.liste, domaine, refLien) : null;
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || !responsableId || envoi || deja) return;
    setEnvoi(true); setRefus(null);
    const input = {
      body: body.trim(), responsableId, ...(echeance ? { echeance } : {}), vue: { mode: ctx.vue },
      ...(citer && citables.length ? { objectIds: citables, revisionId: ctx.revisionId } : {}),
      ...(domaine && refLien ? { liens: [{ domaine, ref: refLien, ...(domaine === "objet" || domaine === "metre" ? { revisionId: ctx.revisionId } : {}) }] } : {}),
      ...(ctx.equipe && lecteurs ? { audience: "projet" as const } : {}),
    };
    try {
      await apiObservations.ouvrir(ctx.projectId, ctx.studyId, ctx.variantId, { ...input, requestId: demande.id(JSON.stringify(input)) });
      demande.oublier(); surFermer(); ctx.relire();
    } catch (err) { setRefus(lireRefus(err, "Observation refusée par le serveur.")); }
    finally { setEnvoi(false); }
  }
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-suivi-ouverture
    onKeyDown={(e) => { if (ctx.equipe && declenche(e, "visible-lecteurs")) { e.preventDefault(); setLecteurs((v) => !v); } }}>
    <label htmlFor="studio-suivi-texte">Observation</label>
    <textarea id="studio-suivi-texte" required maxLength={4000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
    <label htmlFor="studio-suivi-responsable">Responsable</label>
    <select id="studio-suivi-responsable" required value={responsableId} onChange={(e) => setResponsable(e.target.value)} data-studio-suivi-responsable>
      {assignables.map((p) => <option key={p.id} value={p.id} translate="no">{p.email}</option>)}
    </select>
    {assignables.length === 0 && <p className="studio-info">Aucun membre ne peut être responsable (propriétaire ou éditeur requis).</p>}
    <label htmlFor="studio-suivi-echeance">Échéance (facultative)</label>
    <input id="studio-suivi-echeance" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
    {citables.length > 0 && <label className="studio-commentaires-ancre"><input type="checkbox" checked={citer} onChange={(e) => setCiter(e.target.checked)} /> {`Citer la sélection (${citables.length} objet(s))`}</label>}
    <p className="studio-info">{`Vue citée : ${LIBELLE_VUE[ctx.vue]}`}</p>
    {ctx.equipe && <label className="studio-commentaires-ancre"><input type="checkbox" checked={lecteurs} onChange={(e) => setLecteurs(e.target.checked)} data-studio-audience {...propsRaccourci("visible-lecteurs")} /><IconeCollaboration commande="visible-lecteurs" /> Visible par les lecteurs <RaccourciCollaboration commande="visible-lecteurs" /></label>}
    <ChoixLien ctx={ctx} domaine={domaine} refLien={refLien} surDomaine={setDomaine} surRef={setRef} />
    {refus && <p role="alert">{refus.message} {refus.observationId && <button type="button" onClick={() => ctx.montrer(refus.observationId!)}>Voir l’observation</button>}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || !body.trim() || !responsableId || deja !== null} data-studio-suivi-envoyer>Ouvrir l’observation</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}

/** Commentaire d'origine reconstitué : les passages (corriger … clôturer) réemploient le composant du fil. */
function commentaireDe(o: ObservationSuivie, meId: string | undefined): StudioComment {
  return {
    id: o.id, variantId: o.contexte.variantId, parentId: null, revisionId: o.contexte.revisionId, objectIds: o.contexte.objectIds, authorId: o.authorId,
    authorEmail: o.authorEmail, body: o.body, createdAt: o.createdAt, deletedAt: null, mine: meId !== undefined && o.authorId === meId, observation: o,
    ...(o.audience ? { audience: o.audience } : {}),
  };
}

function Fiche({ o, ctx }: { o: ObservationSuivie; ctx: Ctx }) {
  const [geste, setGeste] = useState<"lier" | "tache" | "decision" | null>(null);
  const basculer = (g: typeof geste) => setGeste((v) => (v === g ? null : g));
  return <article className="studio-commentaire studio-suivi" data-studio-suivi={o.id} data-statut={o.statut} tabIndex={-1}>
    <p className="studio-commentaire-entete">
      <strong>{STATUT_LIBELLE[o.statut]}</strong>
      <span>Auteur : <span translate="no">{o.authorEmail}</span></span>
      <span translate="no">{date(o.createdAt)}</span>
      <span data-studio-audience-etat={o.audience ?? "projet"}>{(o.audience ?? "projet") === "projet" ? "Visible par les lecteurs" : "Équipe"}</span>
    </p>
    <p className="studio-commentaire-texte" translate="no">{o.body}</p>
    <p className="studio-suivi-contexte" data-studio-suivi-contexte>
      {o.contexte.revisionId && <span>Révision <span translate="no" title={o.contexte.revisionId}>{court(o.contexte.revisionId)}</span></span>}
      {o.contexte.objectIds.length > 0 && <button type="button" onClick={() => ctx.surSelection(o.contexte.objectIds)}>{`Sélectionner les objets cités (${o.contexte.objectIds.length})`}</button>}
      {o.vue && <span data-studio-suivi-vue={o.vue.mode}>{`Vue : ${LIBELLE_VUE[o.vue.mode]}`}</span>}
    </p>
    {ctx.rapprochements.get(o.id) && <p className={`studio-suivi-rapprochement suivi-${ctx.rapprochements.get(o.id)!.suivi}`} data-studio-suivi-rapprochement={ctx.rapprochements.get(o.id)!.suivi}>
      <span>{LIBELLE_SUIVI_RAPPROCHEMENT[ctx.rapprochements.get(o.id)!.suivi]}</span>{" "}
      <span translate="no">{`· ${court(ctx.rapprochements.get(o.id)!.revisionId)} · ${date(ctx.rapprochements.get(o.id)!.createdAt)}`}</span>
    </p>}
    <ObservationCommentaire c={commentaireDe(o, ctx.meId)} ctx={{ projectId: ctx.projectId, studyId: ctx.studyId, variantId: ctx.variantId, revisionId: ctx.revisionId, participants: ctx.participants, peutPromouvoir: false, surModifie: ctx.relire }} />
    <h3 className="studio-suivi-titre">{`Domaines suivis (${o.liens.length})`}</h3>
    {o.liens.length > 0 ? <ul className="studio-suivi-liste" data-studio-suivi-liens>{o.liens.map((l) => <li key={l.id} data-domaine={l.domaine} data-ref={l.ref}>
      <span translate="no">{libelleLien(l.domaine, l.ref)}</span>
      {l.revisionId && <> · Révision <span translate="no" title={l.revisionId}>{court(l.revisionId)}</span></>}
      {l.controleId && <> · Contrôle <span translate="no" title={l.controleId}>{court(l.controleId)}</span></>}
    </li>)}</ul> : <p className="studio-info">Aucun domaine suivi.</p>}
    <h3 className="studio-suivi-titre">{`Tâches (${o.taches.length})`}</h3>
    {o.taches.length > 0 ? <ul className="studio-suivi-liste" data-studio-suivi-taches>{o.taches.map((t) => <li key={t.id}><Tache o={o} t={t} ctx={ctx} /></li>)}</ul> : <p className="studio-info">Aucune tâche.</p>}
    <h3 className="studio-suivi-titre">{`Décisions (${o.decisions.length})`}</h3>
    {o.decisions.length > 0 ? <ol className="studio-suivi-liste" data-studio-suivi-decisions>{o.decisions.map((d) => <li key={d.seq} data-nature={d.nature} data-portee={d.portee}>
      <strong>{libelleDecision(d)}</strong> <span translate="no">{d.actorEmail}</span> ({d.actorRole === "proprietaire" ? "propriétaire" : "éditeur"}) <span translate="no">{date(d.at)}</span>
      {d.revisionId && <> · Révision <span translate="no" title={d.revisionId}>{court(d.revisionId)}</span></>}
      {" · "}<span translate="no">{d.texte}</span>
    </li>)}</ol> : <p className="studio-info">Aucune décision.</p>}
    <div className="studio-commentaires-actions" data-studio-suivi-gestes>
      {o.peut.lier && <button type="button" aria-expanded={geste === "lier"} onClick={() => basculer("lier")} data-studio-suivi-geste="lier">Lier un domaine</button>}
      {o.peut.creerTache && <button type="button" aria-expanded={geste === "tache"} onClick={() => basculer("tache")} data-studio-suivi-geste="tache">Ajouter une tâche</button>}
      {o.peut.proposer && <button type="button" aria-expanded={geste === "decision"} onClick={() => basculer("decision")} data-studio-suivi-geste="decision">{o.peut.decider ? "Proposer ou décider" : "Proposer"}</button>}
    </div>
    {geste === "lier" && <Lier o={o} ctx={ctx} surFermer={() => setGeste(null)} />}
    {geste === "tache" && <NouvelleTache o={o} ctx={ctx} surFermer={() => setGeste(null)} />}
    {geste === "decision" && <Decision o={o} ctx={ctx} surFermer={() => setGeste(null)} />}
  </article>;
}

function Lier({ o, ctx, surFermer }: { o: ObservationSuivie; ctx: Ctx; surFermer: () => void }) {
  const [domaine, setDomaine] = useState<DomaineObservation | "">("");
  const [refLien, setRef] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [refus, setRefus] = useState<{ message: string; observationId: string | null } | null>(null);
  const demande = useDemande();
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!domaine || !refLien || envoi) return;
    setEnvoi(true); setRefus(null);
    const input = { domaine, ref: refLien, ...(domaine === "objet" || domaine === "metre" ? { revisionId: ctx.revisionId } : {}) };
    try {
      await apiObservations.lier(ctx.projectId, ctx.studyId, ctx.variantId, o.id, { ...input, requestId: demande.id(JSON.stringify(input)) });
      demande.oublier(); surFermer(); ctx.relire();
    } catch (err) { setRefus(lireRefus(err, "Lien refusé par le serveur.")); }
    finally { setEnvoi(false); }
  }
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-suivi-lier>
    <ChoixLien ctx={ctx} domaine={domaine} refLien={refLien} surDomaine={setDomaine} surRef={setRef} sauf={o.id} />
    {refus && <p role="alert">{refus.message} {refus.observationId && refus.observationId !== o.id && <button type="button" onClick={() => ctx.montrer(refus.observationId!)}>Voir l’observation</button>}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || !domaine || !refLien}>Lier</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}

function NouvelleTache({ o, ctx, surFermer }: { o: ObservationSuivie; ctx: Ctx; surFermer: () => void }) {
  const assignables = ctx.participants.filter((p) => p.assignable);
  const [libelle, setLibelle] = useState("");
  const [assigneeId, setAssignee] = useState(o.responsableId);
  const [echeance, setEcheance] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState("");
  const demande = useDemande();
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!libelle.trim() || !assigneeId || envoi) return;
    setEnvoi(true); setError("");
    const input = { libelle: libelle.trim(), assigneeId, ...(echeance ? { echeance } : {}) };
    try {
      await apiObservations.creerTache(ctx.projectId, ctx.studyId, ctx.variantId, o.id, { ...input, requestId: demande.id(JSON.stringify(input)) });
      demande.oublier(); surFermer(); ctx.relire();
    } catch (err) { setError(lireRefus(err, "Tâche refusée par le serveur.").message); }
    finally { setEnvoi(false); }
  }
  const id = `studio-tache-${o.id}`;
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-suivi-tache-form>
    <label htmlFor={`${id}-libelle`}>Tâche</label>
    <input id={`${id}-libelle`} required maxLength={500} value={libelle} onChange={(e) => setLibelle(e.target.value)} />
    <label htmlFor={`${id}-personne`}>Personne chargée</label>
    <select id={`${id}-personne`} required value={assigneeId} onChange={(e) => setAssignee(e.target.value)}>
      {assignables.map((p) => <option key={p.id} value={p.id} translate="no">{p.email}</option>)}
    </select>
    <label htmlFor={`${id}-echeance`}>Échéance (facultative)</label>
    <input id={`${id}-echeance`} type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
    {error && <p role="alert">{error}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || !libelle.trim() || !assigneeId}>Ajouter la tâche</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}

function Tache({ o, t, ctx }: { o: ObservationSuivie; t: TacheObservation; ctx: Ctx }) {
  const [action, setAction] = useState<PassageTache | null>(null);
  return <div className="studio-suivi-tache" data-studio-suivi-tache={t.id} data-statut={t.statut}>
    <strong>{LIBELLE_STATUT_TACHE[t.statut]}</strong> <span translate="no">{t.libelle}</span>
    {" · "}<span>Chargée : <span translate="no">{t.assignedToMe ? "Vous" : t.assigneeEmail}</span></span>
    {t.echeance && <> · Échéance : <span translate="no">{jour(t.echeance)}</span></>}
    <details className="studio-observation-journal">
      <summary>{`Journal (${t.journal.length})`}</summary>
      <ol>{t.journal.map((e) => <li key={e.seq} data-action={e.action}>
        <strong>{LIBELLE_JOURNAL_TACHE[e.action]}</strong> <span translate="no">{e.actorEmail}</span> <span translate="no">{date(e.at)}</span>
        {e.note && <> · <span translate="no">{e.note}</span></>}
      </li>)}</ol>
    </details>
    {t.possibles.length > 0 && <div className="studio-commentaires-actions">
      {t.possibles.map((a) => <button key={a} type="button" aria-expanded={action === a} onClick={() => setAction((v) => (v === a ? null : a))} data-studio-tache-passage={a}>{LIBELLE_PASSAGE_TACHE[a]}</button>)}
    </div>}
    {action && <PassageTacheForm key={action} o={o} t={t} ctx={ctx} action={action} surFermer={() => setAction(null)} />}
  </div>;
}

function PassageTacheForm({ o, t, ctx, action, surFermer }: { o: ObservationSuivie; t: TacheObservation; ctx: Ctx; action: PassageTache; surFermer: () => void }) {
  const candidats = ctx.participants.filter((p) => p.assignable && p.id !== t.assigneeId);
  const [assigneeId, setAssignee] = useState(candidats[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState("");
  const demande = useDemande();
  const reattribuer = action === "reattribuer";
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (envoi || (reattribuer && !assigneeId)) return;
    setEnvoi(true); setError("");
    const input = { action, ...(reattribuer ? { assigneeId } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    try {
      await apiObservations.passerTache(ctx.projectId, ctx.studyId, ctx.variantId, o.id, t.id, { ...input, requestId: demande.id(JSON.stringify(input)) });
      demande.oublier(); surFermer(); ctx.relire();
    } catch (err) { setError(lireRefus(err, "Passage refusé par le serveur.").message); }
    finally { setEnvoi(false); }
  }
  const id = `studio-tache-passage-${t.id}`;
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-tache-passage-form={action}>
    {reattribuer && <>
      <label htmlFor={`${id}-personne`}>Nouvelle personne chargée</label>
      <select id={`${id}-personne`} required value={assigneeId} onChange={(e) => setAssignee(e.target.value)}>
        {candidats.map((p) => <option key={p.id} value={p.id} translate="no">{p.email}</option>)}
      </select>
    </>}
    <label htmlFor={`${id}-note`}>Note (facultative)</label>
    <textarea id={`${id}-note`} maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    {error && <p role="alert">{error}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || (reattribuer && !assigneeId)}>{LIBELLE_PASSAGE_TACHE[action]}</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}

function Decision({ o, ctx, surFermer }: { o: ObservationSuivie; ctx: Ctx; surFermer: () => void }) {
  const [nature, setNature] = useState<NatureDecision>("proposition");
  const [portee, setPortee] = useState<PorteeDecision>("autre");
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState("");
  const demande = useDemande();
  // La décision de clôture se prend par le passage « Clôturer » (après recontrôle) : jamais ici.
  const porteeAdmise = nature === "decision" ? "autre" : portee;
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!texte.trim() || envoi) return;
    setEnvoi(true); setError("");
    const input = { nature, portee: porteeAdmise, texte: texte.trim(), revisionId: ctx.revisionId };
    try {
      await apiObservations.decider(ctx.projectId, ctx.studyId, ctx.variantId, o.id, { ...input, requestId: demande.id(JSON.stringify(input)) });
      demande.oublier(); surFermer(); ctx.relire();
    } catch (err) { setError(lireRefus(err, "Décision refusée par le serveur.").message); }
    finally { setEnvoi(false); }
  }
  const id = `studio-decision-${o.id}`;
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-suivi-decision-form>
    {o.peut.decider && <>
      <label htmlFor={`${id}-nature`}>Nature</label>
      <select id={`${id}-nature`} value={nature} onChange={(e) => setNature(e.target.value as NatureDecision)} data-studio-decision-nature>
        <option value="proposition">Proposition</option>
        <option value="decision">Décision</option>
      </select>
    </>}
    {nature === "proposition" && <>
      <label htmlFor={`${id}-portee`}>Portée</label>
      <select id={`${id}-portee`} value={portee} onChange={(e) => setPortee(e.target.value as PorteeDecision)} data-studio-decision-portee>
        <option value="autre">Autre</option>
        <option value="cloture">Clôture de l’observation</option>
      </select>
    </>}
    {nature === "decision" && <p className="studio-info">La décision de clôture se prend par le passage « Clôturer », après recontrôle.</p>}
    <label htmlFor={`${id}-texte`}>Texte</label>
    <textarea id={`${id}-texte`} required maxLength={2000} rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} />
    {error && <p role="alert">{error}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || !texte.trim()}>{nature === "decision" ? "Consigner la décision" : "Proposer"}</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}
