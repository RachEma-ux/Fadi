/**
 * Projet > Collaboration > Demandes de précision (Collaboration partagée, COM-D10) : question, références, demandeur,
 * répondant tenu, échéance, réponse et journal de clôture. Le serveur décide de l'audience (E1) et des droits ; une
 * échéance dépassée laisse la demande ouverte, signalée « en retard ». Règle d'or : chaque commande porte son icône,
 * son raccourci et son gestionnaire clavier.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, comApi, type CommentAudience, type Demande } from "../../../lib/api";
import { useProjectAccess } from "../../../lib/access";
import { LOCALE } from "../../../lib/i18n";
import { declenche } from "../commandes-collaboration";
import { BoutonCommande, Reference } from "./CommunicationPanel";
import { LIBELLE_STATUT_DEMANDE, nouvelIdRequete } from "./etats";

const erreur = (err: unknown, repli: string) => (err instanceof ApiError && err.serverMessage ? err.serverMessage : repli);
const ACTION_JOURNAL: Record<string, string> = { ouvrir: "a ouvert la demande", repondre: "a répondu", cloturer: "a clôturé", rouvrir: "a rouvert", reattribuer: "a réattribué" };

export function DemandesPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const access = useProjectAccess(projectId);
  const q = useQuery({ queryKey: ["com", projectId, "demandes"], queryFn: () => comApi.demandes(projectId) });
  const membres = useQuery({ queryKey: ["com", projectId, "conversations", "tout"], queryFn: () => comApi.conversations(projectId) });
  const [creation, setCreation] = useState(false);
  const mayWrite = access.known && access.role !== "support";
  const relire = () => { void queryClient.invalidateQueries({ queryKey: ["com", projectId] }); void queryClient.invalidateQueries({ queryKey: ["com-boite"] }); };
  if (q.isLoading) return <p role="status">Lecture des demandes…</p>;
  if (!q.data) return <p role="alert">Impossible de lire les demandes de précision.</p>;
  return (
    <div className="com-demandes" data-com-demandes onKeyDown={(e) => { if (mayWrite && declenche(e, "nouvelle-demande")) { e.preventDefault(); setCreation(true); } }}>
      <div className="h7-actions">
        {mayWrite && <BoutonCommande commande="nouvelle-demande" libelle="Nouvelle demande de précision" onClick={() => setCreation((v) => !v)} />}
      </div>
      {creation && <NouvelleDemande projectId={projectId} membres={membres.data?.membres ?? []} lecteur={access.role === "lecteur"} onFin={(ok) => { setCreation(false); if (ok) relire(); }} />}
      {q.data.length === 0 ? <p className="h7-muted">Aucune demande de précision que vous puissiez lire.</p> : (
        <ul className="com-demandes-liste">{q.data.map((d) => <DemandeLigne key={d.id} projectId={projectId} d={d} membres={membres.data?.membres ?? []} onChange={relire} />)}</ul>
      )}
    </div>
  );
}

function NouvelleDemande({ projectId, membres, lecteur, onFin }: { projectId: string; membres: { id: string; email: string; role: string }[]; lecteur: boolean; onFin: (ok: boolean) => void }) {
  const [question, setQuestion] = useState("");
  const [audience, setAudience] = useState<CommentAudience>(lecteur ? "projet" : "equipe");
  const repondants = membres.filter((m) => audience === "projet" || m.role !== "lecteur");
  const [responderId, setResponderId] = useState(repondants[0]?.id ?? "");
  const [echeance, setEcheance] = useState("");
  const [requestId] = useState(nouvelIdRequete);
  const [error, setError] = useState<string | null>(null);
  const creer = useMutation({
    mutationFn: () => comApi.creerDemande(projectId, { question: question.trim(), responderId, audience, echeance: echeance || null, clientRequestId: requestId }),
    onSuccess: () => onFin(true),
    onError: (err) => setError(erreur(err, "La demande n’a pas pu être créée.")),
  });
  return (
    <form className="comment-form" data-com-demande-creation onSubmit={(e: FormEvent) => { e.preventDefault(); if (question.trim() && responderId) creer.mutate(); }}>
      <label>Question<textarea rows={3} maxLength={4000} value={question} onChange={(e) => setQuestion(e.target.value)} required /></label>
      <label>Audience
        <select value={audience} onChange={(e) => setAudience(e.target.value as CommentAudience)}>
          {!lecteur && <option value="equipe">Équipe — propriétaire et éditeurs</option>}
          <option value="projet">Tout le projet — lecteurs compris</option>
        </select>
      </label>
      <label>Répondant désigné
        <select value={responderId} onChange={(e) => setResponderId(e.target.value)}>{repondants.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select>
      </label>
      <label>Échéance (facultative)<input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} /></label>
      <p className="h7-muted">Une échéance dépassée ne ferme jamais la demande : elle reste ouverte, signalée en retard.</p>
      <div className="h7-actions">
        <button type="submit" className="button-primary" disabled={creer.isPending || !question.trim() || !responderId}>Adresser la demande</button>
        <button type="button" className="button-secondary" onClick={() => onFin(false)}>Annuler</button>
      </div>
      {error && <p className="h7-error" role="alert">{error}</p>}
    </form>
  );
}

function DemandeLigne({ projectId, d, membres, onChange }: { projectId: string; d: Demande; membres: { id: string; email: string; role: string }[]; onChange: () => void }) {
  const [saisie, setSaisie] = useState<null | "repondre" | "cloturer" | "rouvrir" | "reattribuer">(null);
  const [texte, setTexte] = useState("");
  const [cible, setCible] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [journal, setJournal] = useState(false);
  const detail = useQuery({ queryKey: ["com", projectId, "demande", d.id], queryFn: () => comApi.demande(projectId, d.id), enabled: journal });
  const passer = useMutation({
    mutationFn: () => comApi.transitionDemande(projectId, d.id, { action: saisie!, ...(texte.trim() ? { body: texte.trim() } : {}), ...(saisie === "reattribuer" ? { responderId: cible } : {}) }),
    onSuccess: () => { setSaisie(null); setTexte(""); setError(null); onChange(); },
    onError: (err) => setError(erreur(err, "Le passage a été refusé.")),
  });
  const ouvrir = (a: NonNullable<typeof saisie>) => { setSaisie(a); setTexte(""); setCible(""); };
  const candidats = membres.filter((m) => m.id !== d.responder.id && (d.audience === "projet" || m.role !== "lecteur"));
  return (
    <li
      className="com-demande"
      data-com-demande={d.id}
      data-statut={d.statut}
      onKeyDown={(e) => {
        if (d.peut.repondre && declenche(e, "repondre-demande")) { e.preventDefault(); ouvrir("repondre"); }
        else if (d.peut.cloturer && declenche(e, "cloturer-demande")) { e.preventDefault(); ouvrir("cloturer"); }
        else if (d.peut.rouvrir && declenche(e, "rouvrir-demande")) { e.preventDefault(); ouvrir("rouvrir"); }
        else if (d.peut.reattribuer && declenche(e, "reattribuer-demande")) { e.preventDefault(); ouvrir("reattribuer"); }
      }}
    >
      <div className="comment-meta">
        <span className="h7-chip" data-statut={d.statut}>{LIBELLE_STATUT_DEMANDE[d.statut]}</span>
        {d.enRetard && <span className="h7-chip com-retard"> En retard</span>}
        <span className="h7-chip">{d.audience === "projet" ? "Tout le projet" : "Équipe"}</span>
        {" "}<span translate="no">{d.requester.email}</span>{" → "}<span translate="no">{d.responder.email}</span>
        {!d.responder.aAcces && <small className="h7-muted"> (répondant sans accès : à réattribuer)</small>}
        {d.echeance && <small className="h7-muted">{` · échéance ${new Date(`${d.echeance}T12:00:00`).toLocaleDateString(LOCALE)}`}</small>}
      </div>
      <p className="com-corps" translate="no">{d.question}</p>
      {d.refs.length > 0 && <p className="com-refs">{d.refs.map((r) => <Reference key={`${r.type}:${r.id}`} projectId={projectId} r={r} />)}</p>}
      <div className="h7-actions">
        {d.peut.repondre && <BoutonCommande commande="repondre-demande" libelle="Répondre à la demande" onClick={() => ouvrir("repondre")} />}
        {d.peut.cloturer && <BoutonCommande commande="cloturer-demande" libelle="Clôturer la demande" onClick={() => ouvrir("cloturer")} />}
        {d.peut.rouvrir && <BoutonCommande commande="rouvrir-demande" libelle="Rouvrir la demande" onClick={() => ouvrir("rouvrir")} />}
        {d.peut.reattribuer && <BoutonCommande commande="reattribuer-demande" libelle="Réattribuer la demande" onClick={() => ouvrir("reattribuer")} />}
        <button type="button" className="link-button" aria-expanded={journal} onClick={() => setJournal((v) => !v)}>{journal ? "Masquer le journal" : "Voir le journal"}</button>
      </div>
      {saisie && (
        <form className="comment-form" onSubmit={(e: FormEvent) => { e.preventDefault(); passer.mutate(); }}>
          {saisie === "reattribuer" && (
            <label>Nouveau répondant
              <select value={cible} onChange={(e) => setCible(e.target.value)} required><option value="">—</option>{candidats.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}</select>
            </label>
          )}
          <label>{saisie === "repondre" ? "Réponse" : saisie === "cloturer" ? (d.statut === "ouverte" ? "Motif de clôture (exigé sans réponse)" : "Note de clôture (facultative)") : "Motif (facultatif)"}
            <textarea rows={2} maxLength={4000} value={texte} onChange={(e) => setTexte(e.target.value)} required={saisie === "repondre" || (saisie === "cloturer" && d.statut === "ouverte")} />
          </label>
          <p className="h7-muted">La question et les réponses ne sont jamais réécrites : une correction passe par une réouverture et une nouvelle réponse.</p>
          <div className="h7-actions">
            <button type="submit" className="button-primary" disabled={passer.isPending}>Enregistrer</button>
            <button type="button" className="button-secondary" onClick={() => setSaisie(null)}>Annuler</button>
          </div>
        </form>
      )}
      {journal && detail.data?.journal && (
        <ol className="com-journal-demande">{detail.data.journal.map((e) => (
          <li key={e.id}>{`${new Date(e.at).toLocaleString(LOCALE)} · `}<span translate="no">{e.acteur}</span>{` ${ACTION_JOURNAL[e.action] ?? e.action}`}{e.vers && e.action === "reattribuer" ? <> → <span translate="no">{e.vers}</span></> : null}{e.body ? <> : <span translate="no">{e.body}</span></> : null}</li>
        ))}</ol>
      )}
      {error && <p className="h7-error" role="alert">{error}</p>}
    </li>
  );
}

/** Continuité (COM-7) : responsabilités ouvertes de chaque personne, y compris celles qui n'ont plus accès (propriétaire). */
export function ResponsabilitesPanel({ projectId }: { projectId: string }) {
  const q = useQuery({ queryKey: ["com", projectId, "responsabilites"], queryFn: () => comApi.responsabilites(projectId), retry: false });
  if (!q.data) return null;
  return (
    <section className="biz-card" aria-labelledby="collab-responsabilites" data-com-responsabilites>
      <h2 id="collab-responsabilites">Responsabilités à suivre</h2>
      <p className="biz-sub">Demandes à répondre, demandes ouvertes, conversations animées et accusés attendus, par personne. Retirer quelqu’un d’une conversation et transférer sa responsabilité sont deux opérations distinctes ; l’auteur historique n’est jamais réécrit.</p>
      {q.data.length === 0 ? <p className="h7-muted">Aucune responsabilité ouverte.</p> : (
        <ul className="com-responsabilites">{q.data.map((p) => (
          <li key={p.userId} data-com-responsable={p.email} data-acces={p.aAcces ? "oui" : "non"}>
            <b translate="no">{p.email}</b>{!p.aAcces && <span className="h7-chip com-retard"> N’a plus accès au projet</span>}
            <small className="h7-muted">{` · ${p.demandesARepondre.length} demande(s) à répondre · ${p.demandesOuvertes.length} demande(s) ouverte(s) · ${p.conversationsAnimees.length} conversation(s) animée(s) · ${p.accusesAttendus.length} accusé(s) attendu(s)`}</small>
          </li>
        ))}</ul>
      )}
    </section>
  );
}
