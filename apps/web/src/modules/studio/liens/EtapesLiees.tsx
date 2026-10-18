/**
 * Liens de lecture entre une étude Studio et des étapes du Parcours du même projet (aucune donnée d'étape écrite).
 * - `EtapesParcoursEtude` : sur la page de l'étude, choix multiple des étapes du projet ; les libellés viennent du
 *   serveur (définitions du Parcours), jamais ressaisis ici. Le serveur reste seul juge du droit de modifier.
 * - `EtudesStudioLiees` : petit bloc facultatif d'une étape du Parcours, affiché seulement s'il existe au moins un lien.
 * Ni l'un ni l'autre n'importe le module Parcours (frontière ADR-STUDIO-NAV-01) : seules les routes Studio sont lues.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../../lib/api";
import { cheminEtudeStudio } from "../routes-studio";

const numero = (n: number) => String(n).padStart(2, "0");

export function EtapesParcoursEtude({ projectId, studyId }: { projectId: string; studyId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["studio-study-steps", projectId, studyId], queryFn: () => api.studioStudySteps(projectId, studyId), retry: false });
  const [choix, setChoix] = useState<number[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const enregistres = query.data?.steps.map((s) => s.number) ?? [];
  useEffect(() => { setChoix(null); }, [query.data]);
  if (query.isPending) return <p role="status">Chargement des étapes du Parcours…</p>;
  if (query.isError || !query.data) return <p role="alert">Étapes du Parcours indisponibles. <button type="button" onClick={() => void query.refetch()}>Réessayer</button></p>;
  const { available, canWrite } = query.data;
  const courant = choix ?? enregistres;
  const modifie = courant.length !== enregistres.length || courant.some((n) => !enregistres.includes(n));
  const basculer = (n: number, coche: boolean) => {
    setMessage("");
    setChoix((coche ? [...courant, n] : courant.filter((x) => x !== n)).sort((a, b) => a - b));
  };
  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (envoi || !modifie) return;
    setEnvoi(true); setErreur(""); setMessage("");
    try {
      const vue = await api.setStudioStudySteps(projectId, studyId, courant);
      client.setQueryData(["studio-study-steps", projectId, studyId], vue);
      setMessage("Étapes liées enregistrées.");
    } catch (err) {
      setErreur(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Enregistrement des étapes liées non confirmé. Réessayez.");
    } finally {
      setEnvoi(false);
      void client.invalidateQueries({ queryKey: ["studio-step-studies", projectId] });
    }
  }
  return (
    <form className="studio-create" onSubmit={(e) => void enregistrer(e)} data-studio-etapes-liees>
      <fieldset disabled={!canWrite || envoi}>
        <legend>Étapes du Parcours liées</legend>
        {available.length === 0 && <p>Aucune étape du Parcours dans ce projet.</p>}
        <ul className="studio-etapes-liste">
          {available.map((s) => (
            <li key={s.number}>
              <label data-studio-etape={s.number}>
                <input type="checkbox" checked={courant.includes(s.number)} onChange={(e) => basculer(s.number, e.target.checked)} />
                <span translate="no">{numero(s.number)}</span> <span>{s.title}</span> <small>{s.phase}</small>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {canWrite
        ? <button disabled={envoi || !modifie} data-studio-enregistrer-etapes>Enregistrer les étapes liées</button>
        : <p data-studio-etapes-lecture-seule>Lecture seule : les liens vers le Parcours sont réservés aux membres autorisés à modifier ce projet.</p>}
      {message && <p role="status">{message}</p>}
      {erreur && <p role="alert">{erreur}</p>}
    </form>
  );
}

export function EtudesStudioLiees({ projectId, stepNumber }: { projectId: string; stepNumber: number }) {
  const query = useQuery({ queryKey: ["studio-step-studies", projectId, stepNumber], queryFn: () => api.studioStudiesOfStep(projectId, stepNumber), retry: false, staleTime: 30_000 });
  const etudes = query.data?.studies ?? [];
  // Rien n'est affiché sans lien (ni pendant le chargement, ni en cas d'échec) : l'écran de l'étape reste inchangé.
  if (!etudes.length) return null;
  return (
    <section className="fold-card studio-etudes-liees" aria-labelledby={`studio-etudes-liees-${stepNumber}`} data-studio-etudes-liees={stepNumber}>
      <div className="fold-card-body">
        <h3 id={`studio-etudes-liees-${stepNumber}`}>Études Studio liées</h3>
        <ul>
          {etudes.map((s) => (
            <li key={s.id}><Link to={cheminEtudeStudio(projectId, s.id)} data-studio-etude-liee={s.id}><span translate="no">{s.name}</span></Link></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
