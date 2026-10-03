/**
 * Panneau « Modifications et problèmes » (cahier §5.7, UX3) : file des lots avec leur état (local, envoi,
 * synchronisé, conflit, refusé) et la décision attendue, journal du projet, problèmes du modèle (références à
 * réparer, ouvertures sans hôte, écarts d'import), et le bilan du serveur (réserves Harmonie, revue périmée,
 * documents à régénérer). Les problèmes ne sont jamais corrigés en silence : chaque ligne mène à l'objet.
 */
import { useQuery } from "@tanstack/react-query";
import type { ModeleAtelier, TypeProbleme } from "@parcours/atelier-model";
import { api } from "../../../../lib/api";
import type { InstantaneClient } from "../../bus/atelier-client";

export interface PropsModifications {
  projectId: string;
  instantane: InstantaneClient;
  readOnly: boolean;
  onDecider: (requestId: string, decision: "rejouer" | "abandonner") => void;
  onAller: (objetId: string) => void;
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

export function Modifications({ projectId, instantane, readOnly, onDecider, onAller }: PropsModifications) {
  const etat: ModeleAtelier = instantane.etat;
  const bilan = useQuery({ queryKey: ["atelier-problemes", projectId, instantane.revisionServeur], queryFn: () => api.getAtelierProblemes(projectId), retry: false, enabled: instantane.chargement === "pret" });
  const lots = [...instantane.lots].reverse();
  const problemes = Object.values(etat.problemes);
  const parType = new Map<string, typeof problemes>();
  for (const p of problemes) parType.set(p.type, [...(parType.get(p.type) ?? []), p]);
  const journal = [...instantane.journal].reverse().slice(0, 30);

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
      <details className="mod-journal">
        <summary>Journal ({instantane.journal.length})</summary>
        <ol>
          {journal.map((j) => (
            <li key={j.id}>
              <span className={`journal-kind journal-${j.kind}`}>{j.kind === "annulation" ? "Annulé" : j.kind === "retablissement" ? "Rétabli" : "Fait"}</span> {j.label} <span className="nav-detail">r{j.resultRevision}</span>
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
