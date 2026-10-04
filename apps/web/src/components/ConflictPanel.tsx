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
 * - modèle (Atelier) : un lot de commandes en conflit ou refusé reste dans
 *   la file locale ; « Garder le serveur » l'abandonne, « Réappliquer sur la
 *   version courante » le rejoue sur l'état du serveur (lot en conflit).
 *
 * Rien n'est écrasé sans décision explicite ; une reprise refusée à nouveau
 * revient ici avec l'état relu.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type HarmonieProposalStatus, type ParcoursFieldValue } from "../lib/api";
import { adoptStep, clearConflict, MUTATION_KEYS, recordConflict, type DecideVars, type StepPatchVars, type SyncConflict } from "../lib/mutations";
import type { LotEnAttente } from "@parcours/atelier-model";
import { deciderLot, useFileAtelier } from "../modules/atelier/bus/etat-projet";
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

const pad2 = (n: number) => String(n).padStart(2, "0");

function FieldConflict({ projectId, c, labelOf }: { projectId: string; c: SyncConflict; labelOf: (stepNumber: number | null, key: string) => string }) {
  const queryClient = useQueryClient();
  // Les suites (adopter l'étape, enregistrer un nouveau refus, retirer ce conflit) sont posées sur la mutation elle-même :
  // elles s'exécutent même si ce bandeau a été démonté entre-temps.
  const retry = useMutation({
    mutationKey: MUTATION_KEYS.stepPatch,
    mutationFn: (v: StepPatchVars) => api.patchStep(v.projectId, v.stepNumber, v.body),
    onSuccess: (updated, v) => {
      adoptStep(queryClient, v.projectId, updated);
      clearConflict(queryClient, v.projectId, c.id);
    },
    onError: (err, v) => {
      clearConflict(queryClient, v.projectId, c.id);
      recordConflict(queryClient, v.projectId, err, `Étape ${pad2(v.stepNumber)} · saisie`, v.stepNumber, { attempted: v.body.fields ?? {} });
    },
  });
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
            onClick={() => retry.mutate({ projectId, stepNumber: c.stepNumber!, body: { fields: c.attempted!, baseline: c.current ?? {} } })}
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
  const retry = useMutation({
    mutationKey: MUTATION_KEYS.decide,
    mutationFn: (v: DecideVars) => api.decideHarmonie(v.projectId, v.stepNumber, v.proposalId, v.input),
    onSuccess: (updated, v) => {
      adoptStep(queryClient, v.projectId, updated);
      clearConflict(queryClient, v.projectId, c.id);
    },
    onError: (err, v) => {
      clearConflict(queryClient, v.projectId, c.id);
      const { expectedVersion, ...input } = v.input;
      recordConflict(queryClient, v.projectId, err, `Étape ${pad2(v.stepNumber)} · arbitrage ${v.proposalId}`, v.stepNumber, {
        decision: { proposalId: v.proposalId, input, expectedVersion: expectedVersion ?? null },
      });
    },
  });
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
            onClick={() => retry.mutate({ projectId, stepNumber: c.stepNumber!, proposalId: d.proposalId, input: { ...d.input, expectedVersion: c.currentVersion! } })}
          >
            Réappliquer sur la version courante
          </button>
        )}
        {c.stepNumber !== null && <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}&harmonie=1`}>ouvrir le panneau Harmonie</Link>}
      </span>
    </li>
  );
}

function ModelConflictItem({ projectId, c }: { projectId: string; c: LotEnAttente }) {
  const motif = c.detail && typeof c.detail["message"] === "string" ? (c.detail["message"] as string) : c.detail && Array.isArray(c.detail["conflits"]) ? ((c.detail["conflits"] as { motif?: string }[])[0]?.motif ?? "") : "";
  return (
    <li data-conflict={c.enveloppe.requestId} data-kind="modele">
      <b>Atelier · {c.enveloppe.label || "lot de commandes"}</b> · {new Date(c.creeA).toLocaleString("fr-FR")} — {c.etat === "conflit" ? "ne s’applique plus sur la version du serveur" : "refusé par le serveur"}
      {motif ? ` (${motif})` : ""}. Le lot est conservé sur cet appareil.
      <span className="conflict-actions">
        <button type="button" className="button-secondary" onClick={() => deciderLot(projectId, c.enveloppe.requestId, "abandonner")}>
          Garder le serveur
        </button>
        {c.etat === "conflit" && (
          <button type="button" className="button-primary" onClick={() => deciderLot(projectId, c.enveloppe.requestId, "rejouer")}>
            Réappliquer sur la version courante
          </button>
        )}
        <Link to={`/projets/${projectId}?module=atelier`}>ouvrir l’Atelier</Link>
      </span>
    </li>
  );
}

export function ConflictPanel({ projectId }: { projectId: string }) {
  const conflicts = useSyncConflicts(projectId);
  const model = useFileAtelier(projectId).aTraiter;
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
          <ModelConflictItem key={c.enveloppe.requestId} projectId={projectId} c={c} />
        ))}
      </ul>
    </section>
  );
}
