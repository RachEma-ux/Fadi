/**
 * Activité du projet (concept « Project activity and personal inbox ») : les événements autorisés du projet — messages,
 * demandes de précision, observations, tâches, décisions, revues et diffusions Studio — chacun avec un libellé qui dit son
 * sens (un commentaire, une tâche terminée et une approbation se distinguent) et sa source. Filtres : à traiter par moi,
 * questions non résolues, famille, auteur, date, étape. Une saisie hors ligne montre son heure de capture à côté de sa
 * réception : l'ordre des décisions n'est jamais réécrit en silence. Le fil sert à naviguer ; l'enregistrement d'origine
 * reste la référence. Revues liées (« Requests and reviews ») : état relu à Studio, jamais dupliqué.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { comApi, type FiltreActivite } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { cheminVarianteStudio } from "../../studio/routes-studio";

const FILTRES: { id: FiltreActivite; libelle: string }[] = [
  { id: "tout", libelle: "Tout" },
  { id: "a-traiter", libelle: "À traiter par moi" },
  { id: "questions-ouvertes", libelle: "Questions non résolues" },
  { id: "messages", libelle: "Messages" },
  { id: "demandes", libelle: "Demandes" },
  { id: "observations", libelle: "Observations et tâches" },
  { id: "revues", libelle: "Revues et diffusions" },
  { id: "decisions", libelle: "Décisions" },
];
const FAMILLE: Record<string, string> = { message: "Conversation", demande: "Demande de précision", observation: "Observation Studio", tache: "Tâche Studio", decision: "Décision Studio", revue: "Revue Studio", diffusion: "Diffusion Studio" };
const pad2 = (n: number) => String(n).padStart(2, "0");

export function ActivitePanel({ projectId }: { projectId: string }) {
  const [filtre, setFiltre] = useState<FiltreActivite>("tout");
  const [auteur, setAuteur] = useState("");
  const [depuis, setDepuis] = useState("");
  const [etape, setEtape] = useState("");
  const q = useQuery({ queryKey: ["com", projectId, "activite", filtre, auteur, depuis, etape], queryFn: () => comApi.activite(projectId, { filtre, auteur, depuis, etape }) });
  return (
    <div className="com-activite" data-com-activite>
      <nav className="h7-tabs" aria-label="Filtrer l’activité">
        {FILTRES.map((f) => <button key={f.id} type="button" className={filtre === f.id ? "sel" : ""} aria-pressed={filtre === f.id} data-com-filtre={f.id} onClick={() => setFiltre(f.id)}>{f.libelle}</button>)}
      </nav>
      <div className="com-options">
        <label>Auteur
          <select value={auteur} onChange={(e) => setAuteur(e.target.value)}>
            <option value="">Tous</option>
            {q.data?.auteurs.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </label>
        <label>Depuis le<input type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} /></label>
        <label>Étape
          <select value={etape} onChange={(e) => setEtape(e.target.value)}>
            <option value="">Toutes</option>
            {Array.from({ length: 21 }, (_, i) => String(i + 1)).map((n) => <option key={n} value={n}>{`Étape ${pad2(Number(n))}`}</option>)}
          </select>
        </label>
      </div>
      {q.isLoading && <p role="status">Lecture de l’activité…</p>}
      {q.isError && <p role="alert">Impossible de lire l’activité du projet.</p>}
      {q.data && q.data.items.length === 0 && <p className="h7-muted">Aucun événement pour ces filtres.</p>}
      {q.data && q.data.items.length > 0 && (
        <ol className="com-activite-liste">
          {q.data.items.map((i) => {
            const lien = i.lien.studyId && i.lien.variantId ? cheminVarianteStudio(projectId, i.lien.studyId, i.lien.variantId, null, { domaine: "documentation" }) : null;
            return (
              <li key={i.id} data-com-activite-item={i.famille} className={i.aTraiter ? "com-a-traiter" : undefined}>
                <span className="h7-chip">{FAMILLE[i.famille] ?? i.famille}</span>
                <b>{` ${i.libelle}`}</b>
                {i.aTraiter && <span className="h7-chip com-retard"> À traiter</span>}
                <span className="h7-muted">{" · "}<span translate="no">{i.auteur.email}</span>{` · ${new Date(i.at).toLocaleString(LOCALE)}`}</span>
                {i.capturedAt && <small className="h7-muted">{` · saisi le ${new Date(i.capturedAt).toLocaleString(LOCALE)}, reçu plus tard`}</small>}
                <div>{lien ? <Link to={lien}><span translate="no">{i.titre}</span></Link> : <span translate="no">{i.titre}</span>}</div>
                {i.texte && <p className="com-corps" translate="no">{i.texte}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const STATUT_REVUE: Record<string, string> = { travail: "en préparation", soumis: "soumis à approbation", approuve: "approuvé", refuse: "refusé", diffuse: "diffusé", retire: "retiré" };

export function RevuesPanel({ projectId }: { projectId: string }) {
  const q = useQuery({ queryKey: ["com", projectId, "revues"], queryFn: () => comApi.revues(projectId) });
  if (!q.data) return null;
  return (
    <div className="com-revues" data-com-revues>
      <h3>Revues liées (Studio)</h3>
      <p className="h7-muted">État relu à Studio, qui reste seul à enregistrer soumission, approbation et diffusion : une revue terminée n’est pas une approbation, une approbation porte sur une révision identifiée.</p>
      {q.data.length === 0 ? <p className="h7-muted">Aucun dossier Studio en revue.</p> : (
        <ul className="com-demandes-liste">{q.data.map((r) => (
          <li key={r.id} className="com-demande" data-com-revue={r.id} data-statut={r.statut}>
            <span className="h7-chip">{STATUT_REVUE[r.statut] ?? r.statut}</span>
            {" "}<Link to={cheminVarianteStudio(projectId, r.studyId, r.variantId, null, { domaine: "documentation" })}><b translate="no">{r.title}</b></Link>
            <small className="h7-muted">{" · "}<span translate="no">{`${r.etude} · ${r.variante}`}</span>{" · préparé par "}<span translate="no">{r.preparePar}</span></small>
            {r.approuvePar && <small className="h7-muted">{" · approuvé par "}<span translate="no">{r.approuvePar}</span>{r.approuveLe ? ` le ${new Date(r.approuveLe).toLocaleString(LOCALE)}` : ""}</small>}
            {r.diffusePar && <small className="h7-muted">{" · diffusé par "}<span translate="no">{r.diffusePar}</span>{r.diffuseLe ? ` le ${new Date(r.diffuseLe).toLocaleString(LOCALE)}` : ""}</small>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}
