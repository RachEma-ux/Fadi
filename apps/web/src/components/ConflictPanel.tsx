/**
 * Résolution assistée des conflits de synchronisation, dans l'en-tête du
 * projet. Chaque refus 409 est montré côte à côte avec l'état du serveur :
 *
 * - saisie : par champ, la valeur du serveur et la vôtre ; « Garder le
 *   serveur » retire le conflit, « Reprendre ma saisie » la renvoie fondée
 *   sur la valeur courante (acceptée sauf nouvelle écriture entre-temps) ;
 * - arbitrage : votre arbitrage (statut, motif, responsable) face à la
 *   version courante ; « Réappliquer sur la version courante » le renvoie
 *   avec cette version ;
 * - modèle (Atelier) : la version du serveur a repris la clé, la vôtre est
 *   conservée en copie de secours ; « Garder le serveur » retire la copie,
 *   « Reprendre ma version » la réécrit sur la clé à partir de la révision
 *   courante.
 *
 * Rien n'est écrasé sans décision explicite ; une reprise refusée à nouveau
 * revient ici avec l'état relu.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type HarmonieProposalStatus, type ParcoursFieldValue } from "../lib/api";
import { clearConflict, MUTATION_KEYS, type DecideVars, type StepPatchVars, type SyncConflict } from "../lib/mutations";
import { atelierStorage, type ModelConflict } from "../modules/atelier/native/engine";
import { useSyncConflicts } from "./SyncIndicator";

const STATUS_LABEL: Record<HarmonieProposalStatus, string> = {
  proposed: "proposée",
  retained: "retenue",
  adapted: "adaptée et retenue",
  dismissed: "écartée avec motif",
  translated: "traduite au programme",
  drawn: "dessinée",
  verified: "vérifiée",
};

const show = (v: ParcoursFieldValue | undefined) => (v === null || v === undefined || v === "" ? "vide" : String(v));

/** Les conflits du modèle en attente dans le moteur de l'Atelier. */
export function useModelConflicts(): ModelConflict[] {
  const [conflicts, setConflicts] = useState<ModelConflict[]>([]);
  useEffect(() => atelierStorage.subscribeConflicts(setConflicts), []);
  return conflicts;
}

function FieldConflict({ projectId, c, labelOf }: { projectId: string; c: SyncConflict; labelOf: (stepNumber: number | null, key: string) => string }) {
  const queryClient = useQueryClient();
  const retry = useMutation<unknown, unknown, StepPatchVars>({ mutationKey: MUTATION_KEYS.stepPatch });
  const keys = [...new Set([...Object.keys(c.attempted ?? {}), ...Object.keys(c.current ?? {})])];
  const canRetry = c.stepNumber !== null && c.attempted !== null && Object.keys(c.attempted).length > 0;
  return (
    <li data-conflict={c.id} data-kind="saisie">
      <b>{c.where}</b> · {new Date(c.at).toLocaleString("fr-FR")} — {c.message}
      {keys.length > 0 && (
        <table className="conflict-table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Valeur du serveur</th>
              <th>Votre saisie</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td>{labelOf(c.stepNumber, k)}</td>
                <td>{show(c.current?.[k])}</td>
                <td>{c.attempted && k in c.attempted ? show(c.attempted[k]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <span className="conflict-actions">
        <button type="button" className="button-secondary" onClick={() => clearConflict(queryClient, projectId, c.id)}>
          Garder le serveur
        </button>
        {canRetry && (
          <button
            type="button"
            className="button-primary"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(
                { projectId, stepNumber: c.stepNumber!, body: { fields: c.attempted!, baseline: c.current ?? {} } },
                { onSuccess: () => clearConflict(queryClient, projectId, c.id), onError: () => clearConflict(queryClient, projectId, c.id) },
              )
            }
          >
            Reprendre ma saisie
          </button>
        )}
        {c.stepNumber !== null && <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}`}>ouvrir l’étape</Link>}
      </span>
    </li>
  );
}

function DecisionConflict({ projectId, c }: { projectId: string; c: SyncConflict }) {
  const queryClient = useQueryClient();
  const retry = useMutation<unknown, unknown, DecideVars>({ mutationKey: MUTATION_KEYS.decide });
  const d = c.decision!;
  return (
    <li data-conflict={c.id} data-kind="arbitrage">
      <b>{c.where}</b> · {new Date(c.at).toLocaleString("fr-FR")} — {c.message}
      <small>
        Votre arbitrage : {STATUS_LABEL[d.input.status]}
        {d.input.notes ? ` · motif / adaptation : ${d.input.notes}` : ""}
        {d.input.owner ? ` · responsable ${d.input.owner}` : ""}
        {d.input.proof ? ` · preuve : ${d.input.proof}` : ""} — fondé sur la version {d.expectedVersion ?? "?"}
        {c.currentVersion !== null ? `, le serveur est à la version ${c.currentVersion}` : ""}.
      </small>
      <span className="conflict-actions">
        <button type="button" className="button-secondary" onClick={() => clearConflict(queryClient, projectId, c.id)}>
          Garder l’arbitrage courant
        </button>
        {c.stepNumber !== null && c.currentVersion !== null && (
          <button
            type="button"
            className="button-primary"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(
                { projectId, stepNumber: c.stepNumber!, proposalId: d.proposalId, input: { ...d.input, expectedVersion: c.currentVersion! } },
                { onSuccess: () => clearConflict(queryClient, projectId, c.id), onError: () => clearConflict(queryClient, projectId, c.id) },
              )
            }
          >
            Réappliquer sur la version courante
          </button>
        )}
        {c.stepNumber !== null && <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}&harmonie=1`}>ouvrir le panneau Harmonie</Link>}
      </span>
    </li>
  );
}

function ModelConflictItem({ projectId, c }: { projectId: string; c: ModelConflict }) {
  return (
    <li data-conflict={c.backupKey} data-kind="modele">
      <b>Atelier · {c.key.split(".").pop()}</b> · {new Date(c.at).toLocaleString("fr-FR")} — la version du serveur (révision {c.serverRevision}) a repris cette clé ; votre version est conservée sous «{" "}
      {c.backupKey} ».
      <span className="conflict-actions">
        <button type="button" className="button-secondary" onClick={() => atelierStorage.resolveConflict(c.backupKey, "serveur")}>
          Garder le serveur
        </button>
        <button type="button" className="button-primary" onClick={() => atelierStorage.resolveConflict(c.backupKey, "mienne")}>
          Reprendre ma version
        </button>
        <Link to={`/projets/${projectId}?module=atelier`}>ouvrir l’Atelier</Link>
      </span>
    </li>
  );
}

export function ConflictPanel({ projectId }: { projectId: string }) {
  const conflicts = useSyncConflicts(projectId);
  const model = useModelConflicts();
  const steps = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });
  const labelOf = (stepNumber: number | null, key: string) => steps.data?.find((s) => s.number === stepNumber)?.form?.fields.find((f) => f.key === key)?.label ?? key;
  const total = conflicts.length + model.length;
  if (total === 0) return null;
  return (
    <section className="conflict-banner" role="alert" aria-label="Conflits de synchronisation">
      <p>
        <b>{total} écriture(s) refusée(s)</b> : le serveur portait une version plus récente. Rien n’a été écrasé — comparez les deux versions et décidez : garder le serveur, ou reprendre la vôtre sur
        l’état courant.
      </p>
      <ul>
        {conflicts.map((c) =>
          c.kind === "arbitrage" && c.decision ? <DecisionConflict key={c.id} projectId={projectId} c={c} /> : <FieldConflict key={c.id} projectId={projectId} c={c} labelOf={labelOf} />,
        )}
        {model.map((c) => (
          <ModelConflictItem key={c.backupKey} projectId={projectId} c={c} />
        ))}
      </ul>
    </section>
  );
}
