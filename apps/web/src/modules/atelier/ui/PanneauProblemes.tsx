/**
 * Panneau des modifications et problèmes (repère 5) : résumé permanent, puis détail — problèmes et réserves
 * Harmonie, journal (lots locaux au-dessus des entrées validées), annuler / rétablir, états de synchronisation et
 * conflits (`SyncIndicator`, `ConflictPanel` branchés sur le bus).
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { EtatModele, IdObjet } from "@parcours/atelier-model";
import { ConflictPanel } from "../../../components/ConflictPanel";
import { SyncIndicator } from "../../../components/SyncIndicator";
import type { ClientAtelierCommandes } from "../../../lib/api/atelier-commandes";
import { harmonieApi } from "../../../lib/api/harmonie";
import { sourceConflits, sourceSynchro, type BusAtelier } from "../bus";
import type { ErreurLisible } from "../socle";
import { Erreurs } from "./Erreurs";
import { useBus } from "./hooks";
import { groupesProblemes, LIBELLES_ETAT_JOURNAL, lignesJournal, reservesHarmonie, resumePanneau } from "./problemes";

const messageErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PanneauProblemes({
  projetId,
  bus,
  client,
  etat,
  ouvert,
  onBasculer,
  onAllerObjets,
  onAnnuler,
  onRetablir,
  erreursHistorique,
  enCoursHistorique,
}: {
  projetId: string;
  bus: BusAtelier;
  client: Pick<ClientAtelierCommandes, "lireJournal" | "lireProblemes">;
  etat: EtatModele | null;
  ouvert: boolean;
  onBasculer: () => void;
  onAllerObjets: (ids: readonly IdObjet[]) => void;
  onAnnuler: () => void;
  onRetablir: () => void;
  erreursHistorique: readonly ErreurLisible[];
  enCoursHistorique: boolean;
}) {
  useBus(bus);
  const resumeBus = bus.resume();
  const queryClient = useQueryClient();
  const synchro = useMemo(() => sourceSynchro(bus), [bus]);
  const conflits = useMemo(() => sourceConflits(bus), [bus]);
  const journal = useQuery({ queryKey: ["atelier-journal", projetId], queryFn: () => client.lireJournal(projetId, 0) });
  const problemes = useQuery({ queryKey: ["atelier-problemes", projetId], queryFn: () => client.lireProblemes(projetId) });
  const bilan = useQuery({ queryKey: ["design-review", projetId], queryFn: () => harmonieApi.getDesignReview(projetId), retry: false });

  // Journal et problèmes sont relus à chaque nouvelle révision confirmée (commande validée, annulation par le serveur).
  useEffect(() => {
    if (resumeBus.revisionConfirmee === null) return;
    void queryClient.invalidateQueries({ queryKey: ["atelier-journal", projetId] });
    void queryClient.invalidateQueries({ queryKey: ["atelier-problemes", projetId] });
  }, [resumeBus.revisionConfirmee, projetId, queryClient]);

  const liste = problemes.data?.problemes ?? [];
  const reserves = reservesHarmonie(bilan.data);
  const resume = resumePanneau(liste, reserves.reserves.length, resumeBus.conflits, resumeBus.enAttente);
  const lignes = lignesJournal(bus.entrees(), journal.data?.entrees ?? []);
  const groupes = groupesProblemes(liste);
  const nom = (id: IdObjet) => {
    const o = etat?.objets[id];
    const p = o?.params as { nom?: unknown } | undefined;
    return typeof p?.nom === "string" && p.nom ? p.nom : id;
  };
  const revisionProblemes = problemes.data?.revision ?? null;
  const problemesPerimes = revisionProblemes !== null && resumeBus.revisionConfirmee !== null && revisionProblemes !== resumeBus.revisionConfirmee;

  return (
    <>
      <div className="atl-panneau-resume">
        <h2 id="atl-panneau-titre" tabIndex={-1}>
          Modifications et problèmes
        </h2>
        <span className="atl-compte atl-h" data-testid="atl-compte-harmonie">
          {bilan.isError ? "Réserves Harmonie : non évaluées" : `${resume.harmonie} réserve(s) Harmonie`}
        </span>
        <span className="atl-compte atl-i">{problemes.isError ? "Problèmes : indisponibles" : `${resume.references} référence(s) à réparer`}</span>
        <span className="atl-compte atl-i">{resume.documents} document(s) à recalculer</span>
        {resume.autres > 0 && <span className="atl-compte atl-a">{resume.autres} autre(s) problème(s)</span>}
        <span className={`atl-compte ${resume.conflits ? "atl-r" : "atl-i"}`} data-testid="atl-compte-conflits">
          Conflits : {resume.conflits || "aucun"}
        </span>
        <span className={`atl-compte ${resume.enAttente ? "atl-a" : "atl-i"}`}>{resume.enAttente} lot(s) en attente d'envoi</span>
        <button type="button" className="atl-bascule" aria-expanded={ouvert} aria-controls="atl-panneau-corps" onClick={onBasculer} data-testid="atl-panneau-detail">
          {ouvert ? "Replier" : "Détail"}
        </button>
      </div>
      <div id="atl-panneau-corps" className="atl-panneau-corps" hidden={!ouvert}>
        <section className="atl-colonne" aria-labelledby="atl-col-problemes">
          <h3 id="atl-col-problemes">Problèmes et réserves</h3>
          {problemesPerimes && (
            <p className="atl-message atl-alerte">
              Calculés à la révision {revisionProblemes} — modèle en révision {resumeBus.revisionConfirmee} : à recalculer.
            </p>
          )}
          {problemes.isPending && <p className="atl-muet">Chargement des problèmes…</p>}
          {problemes.isError && <p className="atl-message atl-erreur">Problèmes indisponibles : {messageErreur(problemes.error)}.</p>}
          {groupes.map((g) => (
            <div key={g.categorie} data-testid={`atl-problemes-${g.categorie}`}>
              <h4>
                {g.libelle} ({g.problemes.length})
              </h4>
              <ul className="atl-liste">
                {g.problemes.map((p, i) => (
                  <li key={`${p.code}-${i}`} className="atl-pb">
                    <span className={`atl-etat atl-gravite-${p.gravite}`}>{p.gravite}</span>
                    <span>
                      <b>{p.message}</b>
                      {p.objetIds.length > 0 && <span className="atl-det">Objets : {p.objetIds.slice(0, 8).map(nom).join(", ")}{p.objetIds.length > 8 ? ` et ${p.objetIds.length - 8} autre(s)` : ""}</span>}
                    </span>
                    {p.objetIds.length > 0 && (
                      <button type="button" onClick={() => onAllerObjets(p.objetIds)}>
                        Voir
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {problemes.isSuccess && groupes.length === 0 && <p className="atl-muet">Aucun problème signalé par le serveur.</p>}
          <h4>Réserves Harmonie ({reserves.reserves.length})</h4>
          {bilan.isPending && <p className="atl-muet">Chargement du bilan Harmonie…</p>}
          {bilan.isError && <p className="atl-muet">Bilan Harmonie non évalué : {messageErreur(bilan.error)}.</p>}
          {reserves.perime && <p className="atl-message atl-alerte">Bilan calculé le {reserves.calculeLe} sur un modèle antérieur : à recalculer à l'étape 10.</p>}
          <ul className="atl-liste" data-testid="atl-reserves-harmonie">
            {reserves.reserves.map((r) => (
              <li key={r.id} className="atl-pb">
                <span className="atl-etat atl-harmonie">Harmonie</span>
                <span>
                  <b>{r.titre}</b> · {r.priorite}
                  <span className="atl-det">{r.detail}</span>
                </span>
                <Link to={`/projets/${encodeURIComponent(projetId)}?module=parcours&etape=${r.etape}&harmonie=1`}>Ouvrir</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="atl-colonne" aria-labelledby="atl-col-journal">
          <h3 id="atl-col-journal">Journal</h3>
          <div className="atl-historique" role="group" aria-label="Historique">
            <button type="button" onClick={onAnnuler} disabled={enCoursHistorique} data-testid="atl-panneau-annuler">
              Annuler <kbd className="atl-kbd">Ctrl/⌘ Z</kbd>
            </button>
            <button type="button" onClick={onRetablir} disabled={enCoursHistorique} data-testid="atl-panneau-retablir">
              Rétablir <kbd className="atl-kbd">Ctrl/⌘ Maj Z</kbd>
            </button>
          </div>
          <Erreurs erreurs={erreursHistorique} titre="Annulation ou rétablissement refusé" />
          {journal.isPending && <p className="atl-muet">Chargement du journal…</p>}
          {journal.isError && <p className="atl-message atl-erreur">Journal indisponible : {messageErreur(journal.error)}. Les lots locaux restent listés.</p>}
          <ul className="atl-journal" data-testid="atl-journal">
            {lignes.map((l) => (
              <li key={l.cle}>
                <span className="atl-rev">{l.revision}</span>
                <span>
                  {l.libelle}
                  {l.types.length > 0 && l.libelle !== l.types.join(", ") && <code className="atl-types">{l.types.join(", ")}</code>}
                  {l.detail && <span className="atl-det">{l.detail}</span>}
                </span>
                <span className={`atl-etat atl-etat-${l.etat}`}>{LIBELLES_ETAT_JOURNAL[l.etat]}</span>
              </li>
            ))}
            {journal.isSuccess && lignes.length === 0 && <li className="atl-muet">Aucune modification.</li>}
          </ul>
          <p className="atl-muet atl-petit">Annuler / rétablir agissent sur vos propres modifications, par le serveur ; chaque ligne garde sa révision.</p>
        </section>

        <section className="atl-colonne" aria-labelledby="atl-col-etats">
          <h3 id="atl-col-etats">Synchronisation et conflits</h3>
          <SyncIndicator projectId={projetId} atelier={synchro} />
          <ConflictPanel projectId={projetId} atelier={conflits} />
          {resume.conflits === 0 && <p className="atl-muet">Aucun conflit en attente.</p>}
          <dl className="atl-legende">
            <dt>
              <span className="atl-etat atl-etat-local">local</span>
            </dt>
            <dd>appliqué ici, pas encore reçu par le serveur</dd>
            <dt>
              <span className="atl-etat atl-etat-synchronise">synchronisé</span>
            </dt>
            <dd>reçu et validé par le serveur</dd>
            <dt>
              <span className="atl-etat atl-etat-conflit">conflit</span>
            </dt>
            <dd>refusé (409) : garder le serveur ou rejouer vos commandes</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
