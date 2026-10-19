/**
 * Observation d'un commentaire Studio (E.2) : promotion d'un commentaire d'origine (responsable, échéance), statut,
 * journal complet et passages permis. Le serveur fait autorité : seuls les passages qu'il renvoie dans `possibles`
 * sont proposés, et chaque refus (rôle, statut, révision, archive) est affiché tel quel. Un envoi non confirmé se rejoue
 * avec le même `requestId`.
 */
import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type StudioComment, type StudioObservationTransition, type StudioParticipant } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { enRetard, JOURNAL_LIBELLE, PASSAGE_AVEC_REVISION, PASSAGE_LIBELLE, STATUT_LIBELLE } from "./observations";

export interface ContexteObservation {
  projectId: string;
  studyId: string;
  variantId: string;
  /** Révision affichée : proposée par défaut pour une correction ou un recontrôle. */
  revisionId: string;
  participants: readonly StudioParticipant[];
  /** Promotion possible : auteur du commentaire ou propriétaire, variante non archivée. */
  peutPromouvoir: boolean;
  surModifie: () => void;
}

const jour = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(LOCALE, { dateStyle: "medium" }); };
const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };
const court = (id: string) => id.slice(-8);
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function messageRefus(err: unknown, defaut: string): string {
  if (err instanceof ApiError && err.status < 500 && err.status !== 408) return err.serverMessage ?? defaut;
  return "Envoi non confirmé. Réessayez : la même demande sera rejouée sans doublon.";
}

function demandeId(demande: { current: { cle: string; id: string } | null }, cle: string): string {
  if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
  return demande.current.id;
}

export function ObservationCommentaire({ c, ctx }: { c: StudioComment; ctx: ContexteObservation }) {
  const o = c.observation;
  const [promouvoir, setPromouvoir] = useState(false);
  if (!o) {
    if (c.parentId || c.deletedAt || !ctx.peutPromouvoir) return null;
    return <div className="studio-observation" data-studio-observation-absente>
      {!promouvoir && <button type="button" onClick={() => setPromouvoir(true)} data-studio-promouvoir>Faire une observation</button>}
      {promouvoir && <Promotion c={c} ctx={ctx} surFermer={() => setPromouvoir(false)} />}
    </div>;
  }
  const retard = enRetard(o.echeance, o.statut, aujourdhui());
  return <div className="studio-observation" data-studio-observation={o.id} data-statut={o.statut}>
    <p className="studio-observation-entete">
      <strong className={`studio-observation-statut studio-observation-${o.statut}`} data-studio-observation-statut={o.statut}>{STATUT_LIBELLE[o.statut]}</strong>
      <span>Responsable : <span translate="no">{o.assignedToMe ? "Vous" : o.responsableEmail}</span></span>
      {o.echeance && <span data-studio-observation-retard={retard ? "" : undefined}>{retard ? "Échéance dépassée : " : "Échéance : "}<span translate="no">{jour(o.echeance)}</span></span>}
      {o.correctionRevisionId && <span>Corrigée en révision <span translate="no" title={o.correctionRevisionId}>{court(o.correctionRevisionId)}</span></span>}
      {o.recontroleRevisionId && <span>Recontrôlée en révision <span translate="no" title={o.recontroleRevisionId}>{court(o.recontroleRevisionId)}</span></span>}
    </p>
    <details className="studio-observation-journal">
      <summary>{`Journal (${o.journal.length})`}</summary>
      <ol data-studio-observation-journal>{o.journal.map((e) => <li key={e.seq} data-seq={e.seq} data-action={e.action}>
        <strong>{JOURNAL_LIBELLE[e.action]}</strong> <span translate="no">{e.actorEmail}</span> <span translate="no">{date(e.at)}</span>
        {e.revisionId && <> · Révision <span translate="no" title={e.revisionId}>{court(e.revisionId)}</span></>}
        {e.responsableId && <> · Responsable <span translate="no">{ctx.participants.find((p) => p.id === e.responsableId)?.email ?? e.responsableId}</span></>}
        {e.note && <> · <span translate="no">{e.note}</span></>}
      </li>)}</ol>
    </details>
    {o.possibles.length > 0 && <Passages c={c} ctx={ctx} />}
  </div>;
}

function Promotion({ c, ctx, surFermer }: { c: StudioComment; ctx: ContexteObservation; surFermer: () => void }) {
  const assignables = ctx.participants.filter((p) => p.assignable);
  const [responsableId, setResponsable] = useState(assignables[0]?.id ?? "");
  const [echeance, setEcheance] = useState("");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState("");
  const demande = useRef<{ cle: string; id: string } | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!responsableId || envoi) return;
    setEnvoi(true); setError("");
    const input = { responsableId, ...(echeance ? { echeance } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    try {
      await api.createStudioObservation(ctx.projectId, ctx.studyId, ctx.variantId, c.id, { ...input, requestId: demandeId(demande, JSON.stringify(input)) });
      demande.current = null; surFermer(); ctx.surModifie();
    } catch (err) { setError(messageRefus(err, "Observation refusée par le serveur.")); }
    finally { setEnvoi(false); }
  }
  const id = `studio-observation-${c.id}`;
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-promotion>
    <label htmlFor={`${id}-responsable`}>Responsable</label>
    <select id={`${id}-responsable`} required value={responsableId} onChange={(e) => setResponsable(e.target.value)}>
      {assignables.map((p) => <option key={p.id} value={p.id} translate="no">{p.email}</option>)}
    </select>
    {assignables.length === 0 && <p className="studio-info">Aucun membre ne peut être responsable (propriétaire ou éditeur requis).</p>}
    <label htmlFor={`${id}-echeance`}>Échéance (facultative)</label>
    <input id={`${id}-echeance`} type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
    <label htmlFor={`${id}-note`}>Note (facultative)</label>
    <textarea id={`${id}-note`} maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
    {error && <p role="alert">{error}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || !responsableId}>Ouvrir l’observation</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}

function Passages({ c, ctx }: { c: StudioComment; ctx: ContexteObservation }) {
  const o = c.observation!;
  const [action, setAction] = useState<StudioObservationTransition | null>(null);
  return <>
    <div className="studio-commentaires-actions" data-studio-observation-passages>
      {o.possibles.map((a) => <button key={a} type="button" aria-expanded={action === a} onClick={() => setAction((v) => (v === a ? null : a))} data-studio-passage={a}>{PASSAGE_LIBELLE[a]}</button>)}
    </div>
    {action && <Passage key={action} c={c} ctx={ctx} action={action} surFermer={() => setAction(null)} />}
  </>;
}

function Passage({ c, ctx, action, surFermer }: { c: StudioComment; ctx: ContexteObservation; action: StudioObservationTransition; surFermer: () => void }) {
  const avecRevision = PASSAGE_AVEC_REVISION[action];
  const revisions = useQuery({
    queryKey: ["studio-observation-revisions", ctx.projectId, ctx.studyId, ctx.variantId],
    queryFn: () => api.studioRevisions(ctx.projectId, ctx.studyId, ctx.variantId),
    enabled: avecRevision,
  });
  const [revisionId, setRevision] = useState(ctx.revisionId);
  const reattribuer = action === "reattribuer";
  const cloturer = action === "cloturer";
  const candidats = ctx.participants.filter((p) => p.assignable && p.id !== c.observation?.responsableId);
  const [responsableId, setResponsable] = useState(candidats[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [error, setError] = useState("");
  const demande = useRef<{ cle: string; id: string } | null>(null);
  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (envoi || (reattribuer && !responsableId) || (cloturer && !note.trim())) return;
    setEnvoi(true); setError("");
    const input = { action, ...(avecRevision ? { revisionId } : {}), ...(reattribuer ? { responsableId } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
    try {
      await api.transitionStudioObservation(ctx.projectId, ctx.studyId, ctx.variantId, c.id, { ...input, requestId: demandeId(demande, JSON.stringify(input)) });
      demande.current = null; surFermer(); ctx.surModifie();
    } catch (err) { setError(messageRefus(err, "Passage refusé par le serveur.")); }
    finally { setEnvoi(false); }
  }
  const id = `studio-passage-${c.id}`;
  const liste = revisions.data?.revisions ?? [];
  return <form className="studio-commentaires-form" onSubmit={(e) => void envoyer(e)} data-studio-passage-form={action}>
    {avecRevision && <>
      <label htmlFor={`${id}-revision`}>{action === "corriger" ? "Révision de la correction" : "Révision recontrôlée"}</label>
      <select id={`${id}-revision`} required value={revisionId} onChange={(e) => setRevision(e.target.value)}>
        {!liste.some((r) => r.id === revisionId) && <option value={revisionId} translate="no">{court(revisionId)}</option>}
        {liste.map((r) => <option key={r.id} value={r.id} translate="no">{`${court(r.id)} · ${date(r.createdAt)}`}</option>)}
      </select>
    </>}
    {reattribuer && <>
      <label htmlFor={`${id}-responsable`}>Nouveau responsable</label>
      <select id={`${id}-responsable`} required value={responsableId} onChange={(e) => setResponsable(e.target.value)} data-studio-nouveau-responsable>
        {candidats.map((p) => <option key={p.id} value={p.id} translate="no">{p.email}</option>)}
      </select>
      {candidats.length === 0 && <p className="studio-info">Aucun autre membre ne peut être responsable (propriétaire ou éditeur requis).</p>}
    </>}
    {/* La clôture est une décision du propriétaire : son motif est exigé et consigné au journal des décisions (E.2-04). */}
    <label htmlFor={`${id}-note`}>{cloturer ? "Motif de la décision de clôture" : "Note (facultative)"}</label>
    <textarea id={`${id}-note`} required={cloturer} maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-studio-passage-note />
    {error && <p role="alert">{error}</p>}
    <div className="studio-commentaires-actions">
      <button type="submit" disabled={envoi || (reattribuer && !responsableId) || (cloturer && !note.trim())}>{PASSAGE_LIBELLE[action]}</button>
      <button type="button" onClick={surFermer}>Fermer</button>
    </div>
  </form>;
}
