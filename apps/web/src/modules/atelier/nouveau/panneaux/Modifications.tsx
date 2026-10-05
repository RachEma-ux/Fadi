/**
 * Panneau « Modifications et problèmes » (cahier §5.7, UX3) : file des lots avec leur état (local, envoi,
 * synchronisé, conflit, refusé) et la décision attendue, journal du projet, problèmes du modèle (références à
 * réparer, ouvertures sans hôte, écarts d'import), et le bilan du serveur (réserves Harmonie, revue périmée,
 * documents à régénérer). Les problèmes ne sont jamais corrigés en silence : chaque ligne mène à l'objet.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModeleAtelier, TypeProbleme } from "@parcours/atelier-model";
import { api, type ProjectComment } from "../../../../lib/api";
import type { InstantaneClient } from "../../bus/atelier-client";

export interface PropsModifications {
  projectId: string;
  instantane: InstantaneClient;
  readOnly: boolean;
  onDecider: (requestId: string, decision: "rejouer" | "abandonner") => void;
  onAller: (objetId: string) => void;
  /** Ouvre l'état du modèle à une révision passée, en lecture seule. */
  onConsulterRevision?: (revision: number) => void;
}

const ETATS_LOT: Record<string, string> = { local: "En attente d'envoi", synchronisation: "Envoi…", synchronise: "Enregistré", conflit: "Conflit", refuse: "Refusé" };
const TYPES: Record<TypeProbleme, string> = {
  "hote-introuvable": "Ouverture sans mur hôte",
  "niveau-arrivee-absent": "Niveau d'arrivée absent",
  "aire-ecart": "Écart d'aire à l'import",
  "role-inconnu": "Rôle inconnu",
  "reference-a-reparer": "Référence à réparer",
  "sans-correspondance": "Sans correspondance à l'import",
  "piece-non-fermee": "Pièce non fermée",
  import: "Import",
};

export function Modifications({ projectId, instantane, readOnly, onDecider, onAller, onConsulterRevision }: PropsModifications) {
  const etat: ModeleAtelier = instantane.etat;
  const bilan = useQuery({ queryKey: ["atelier-problemes", projectId, instantane.revisionServeur], queryFn: () => api.getAtelierProblemes(projectId), retry: false, enabled: instantane.chargement === "pret" });
  const lots = [...instantane.lots].reverse();
  const problemes = Object.values(etat.problemes);
  const parType = new Map<string, typeof problemes>();
  for (const p of problemes) parType.set(p.type, [...(parType.get(p.type) ?? []), p]);
  const journal = [...instantane.journal].reverse().slice(0, 30);
  // Commentaires attachés aux entrées du journal (D-055) : lus à l'ouverture du journal.
  const [journalOuvert, setJournalOuvert] = useState(false);
  const commentaires = useQuery({ queryKey: ["comments", projectId, "atelier"], queryFn: () => api.listComments(projectId, null), enabled: journalOuvert, retry: false });
  const parRevision = new Map<number, ProjectComment[]>();
  for (const c of commentaires.data ?? []) if (c.atelierRevision != null) parRevision.set(c.atelierRevision, [...(parRevision.get(c.atelierRevision) ?? []), c]);

  return (
    <section className="modifications" aria-label="Modifications et problèmes">
      <h3>Modifications</h3>
      <p className="mod-revision">
        Révision {instantane.revisionServeur}
        {instantane.revision !== instantane.revisionServeur && <> · {instantane.revision - instantane.revisionServeur} en attente</>}
        {instantane.envoiEnCours && <> · envoi…</>}
      </p>
      {lots.length > 0 && (
        <ul className="mod-lots" aria-label="Lots en attente">
          {lots.map((l) => (
            <li key={l.enveloppe.requestId} className={`lot lot-${l.etat}`}>
              <span className="lot-label">{l.enveloppe.label}</span>
              <span className="lot-etat">{ETATS_LOT[l.etat] ?? l.etat}</span>
              {(l.etat === "conflit" || l.etat === "refuse") && (
                <>
                  {l.detail && typeof l.detail["message"] === "string" && <span className="lot-detail">{l.detail["message"] as string}</span>}
                  <span className="lot-actions">
                    {l.etat === "conflit" && <button type="button" disabled={readOnly} onClick={() => onDecider(l.enveloppe.requestId, "rejouer")}>Rejouer sur la version actuelle</button>}
                    <button type="button" disabled={readOnly} onClick={() => onDecider(l.enveloppe.requestId, "abandonner")}>Abandonner</button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="mod-journal" onToggle={(e) => setJournalOuvert(e.currentTarget.open)}>
        <summary>Journal ({instantane.journal.length})</summary>
        <a className="lien journal-export" href={`/projects/${projectId}/atelier/journal.csv`} download data-export-journal>
          Exporter l'historique (CSV)
        </a>
        <ol>
          {journal.map((j) => (
            <li key={j.id}>
              <span className={`journal-kind journal-${j.kind}`}>{j.kind === "annulation" ? "Annulé" : j.kind === "retablissement" ? "Rétabli" : "Fait"}</span> {j.label} <span className="nav-detail">r{j.resultRevision}</span>
              {onConsulterRevision && j.resultRevision < instantane.revisionServeur && (
                <button type="button" className="lien journal-consulter" data-consulter-revision={j.resultRevision} onClick={() => onConsulterRevision(j.resultRevision)}>
                  Consulter
                </button>
              )}
              <FilEntree projectId={projectId} revision={j.resultRevision} commentaires={parRevision.get(j.resultRevision) ?? []} />
            </li>
          ))}
        </ol>
      </details>

      <h3>Problèmes</h3>
      {problemes.length === 0 ? (
        <p className="nav-vide">Aucun problème dans le modèle.</p>
      ) : (
        [...parType].map(([type, liste]) => (
          <details key={type} className="mod-problemes">
            <summary>
              {TYPES[type as TypeProbleme] ?? type} <span className="nav-detail">{liste.length}</span>
            </summary>
            <ul>
              {liste.slice(0, 100).map((p) => (
                <li key={p.id}>
                  {p.objetId && etat.objets[p.objetId] ? (
                    <button type="button" className="lien" onClick={() => onAller(p.objetId!)}>{p.message}</button>
                  ) : (
                    p.message
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
      {!!bilan.data?.collisions?.length && (
        <details className="mod-problemes mod-collisions" open>
          <summary>
            Collisions d'architecture <span className="nav-detail">{bilan.data.collisions.length}</span>
          </summary>
          <ul>
            {bilan.data.collisions.slice(0, 100).map((c) => (
              <li key={`${c.type}:${c.objets.join(",")}`} data-collision={c.type}>
                {etat.objets[c.objets[0]!] ? <button type="button" className="lien" onClick={() => onAller(c.objets[0]!)}>{c.message}</button> : c.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {bilan.data && (
        <div className="mod-bilan">
          <h4>Revue et documents</h4>
          <ul>
            <li>Réserves Harmonie : {bilan.data.bilan.reserves}{bilan.data.bilan.reservesPrioritaires ? ` dont ${bilan.data.bilan.reservesPrioritaires} prioritaire(s)` : ""}</li>
            <li>Écarts d'audit : {bilan.data.bilan.ecartsAudit}</li>
            {bilan.data.bilan.reviewStale && <li className="mod-alerte">La revue de conception est à relancer : le modèle a changé depuis.</li>}
            {bilan.data.documentsPerimes.map((d) => <li key={d.kind} className="mod-alerte">Document à régénérer : {d.label}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Fil de commentaires d'une entrée du journal (D-055) : lecture pour tous, écriture pour qui peut commenter. */
function FilEntree({ projectId, revision, commentaires }: { projectId: string; revision: number; commentaires: ProjectComment[] }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const envoyer = async () => {
    const corps = texte.trim();
    if (!corps) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.addComment(projectId, corps, null, null, revision);
      setTexte("");
      await queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Commentaire non enregistré.");
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <>
      <button type="button" className="lien journal-commenter" data-commenter-revision={revision} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {commentaires.length ? `Commentaires (${commentaires.length})` : "Commenter"}
      </button>
      {ouvert && (
        <div className="journal-fil" data-fil-revision={revision}>
          {commentaires.length > 0 && (
            <ul>
              {commentaires.map((c) => (
                <li key={c.id}>
                  <span className="nav-detail">{c.authorEmail} · {new Date(c.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span> {c.body}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => { e.preventDefault(); void envoyer(); }}>
            <label className="sr-only" htmlFor={`fil-${revision}`}>Commentaire sur la révision {revision}</label>
            <textarea id={`fil-${revision}`} rows={2} maxLength={4000} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={`Commentaire sur la révision ${revision}`} />
            <button type="submit" disabled={envoi || !texte.trim()}>Publier</button>
            {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
          </form>
        </div>
      )}
    </>
  );
}
