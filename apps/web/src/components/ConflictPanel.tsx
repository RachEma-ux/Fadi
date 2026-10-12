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
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type HarmonieProposalStatus, type ParcoursFieldValue } from "../lib/api";
import { adoptStep, canReplayFieldConflict, clearConflict, MUTATION_KEYS, recordConflictRetryFailure, type DecideVars, type StepPatchVars, type SyncConflict } from "../lib/mutations";
import type { LotEnAttente } from "@parcours/atelier-model";
import { deciderLot, useFileAtelier } from "../modules/atelier/bus/etat-projet";
import { useOnline, useReachable, useSyncConflicts } from "./SyncIndicator";
import { useProjectAccess } from "../lib/access";
import { LOCALE } from "../lib/i18n";

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

interface ReplayAccess { allowed: boolean; reason: string | null }

function FieldConflict({ projectId, c, labelOf, access }: { projectId: string; c: SyncConflict; labelOf: (stepNumber: number | null, key: string) => string; access: ReplayAccess }) {
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
      recordConflictRetryFailure(queryClient, v.projectId, c.id, err, `Étape ${pad2(v.stepNumber)} · saisie`, v.stepNumber, { attempted: v.body.fields ?? {} });
    },
  });
  const keys = [...new Set([...Object.keys(c.attempted ?? {}), ...Object.keys(c.current ?? {})])];
  const canRetry = canReplayFieldConflict(c);
  return (
    <li data-conflict={c.id} data-kind="saisie">
      <b>{c.where}</b> · {new Date(c.at).toLocaleString(LOCALE)} — {c.message}
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
        <button type="button" className="button-secondary" disabled={retry.isPending} onClick={() => clearConflict(queryClient, projectId, c.id)}>
          Garder le serveur
        </button>
        {canRetry && (
          <button
            type="button"
            className="button-primary"
            disabled={retry.isPending || !access.allowed}
            onClick={() => { if (access.allowed && canRetry) retry.mutate({ projectId, stepNumber: c.stepNumber!, body: { fields: c.attempted!, baseline: c.current! } }); }}
          >
            Reprendre ma saisie
          </button>
        )}
        {c.stepNumber !== null && <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}`}>ouvrir l’étape</Link>}
      </span>
      {access.reason && <p className="h7-muted">{access.reason}</p>}
      {!canRetry && <p className="h7-muted">La version du serveur est indisponible. Ouvrez l’étape pour la relire avant de reprendre votre saisie.</p>}
      {retry.error && <p role="alert">La reprise a échoué. Le conflit et votre saisie restent conservés.</p>}
    </li>
  );
}

function DecisionConflict({ projectId, c, access }: { projectId: string; c: SyncConflict; access: ReplayAccess }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationKey: MUTATION_KEYS.decide,
    mutationFn: (v: DecideVars) => api.decideHarmonie(v.projectId, v.stepNumber, v.proposalId, v.input),
    onSuccess: (updated, v) => {
      adoptStep(queryClient, v.projectId, updated);
      clearConflict(queryClient, v.projectId, c.id);
    },
    onError: (err, v) => {
      const { expectedVersion, ...input } = v.input;
      recordConflictRetryFailure(queryClient, v.projectId, c.id, err, `Étape ${pad2(v.stepNumber)} · arbitrage ${v.proposalId}`, v.stepNumber, {
        decision: { proposalId: v.proposalId, input, expectedVersion: expectedVersion ?? null },
      });
    },
  });
  const d = c.decision!;
  return (
    <li data-conflict={c.id} data-kind="arbitrage">
      <b>{c.where}</b> · {new Date(c.at).toLocaleString(LOCALE)} — {c.message}
      <small>
        Votre arbitrage : {STATUS_LABEL[d.input.status]}
        {d.input.notes ? ` · motif / adaptation : ${d.input.notes}` : ""}
        {d.input.owner ? ` · responsable ${d.input.owner}` : ""}
        {d.input.proof ? ` · preuve : ${d.input.proof}` : ""} — fondé sur la version {d.expectedVersion ?? "?"}
        {c.currentVersion !== null ? `, le serveur est à la version ${c.currentVersion}` : ""}.
      </small>
      <span className="conflict-actions">
        <button type="button" className="button-secondary" disabled={retry.isPending} onClick={() => clearConflict(queryClient, projectId, c.id)}>
          Garder l’arbitrage courant
        </button>
        {c.stepNumber !== null && c.currentVersion !== null && (
          <button
            type="button"
            className="button-primary"
            disabled={retry.isPending || !access.allowed}
            onClick={() => { if (access.allowed) retry.mutate({ projectId, stepNumber: c.stepNumber!, proposalId: d.proposalId, input: { ...d.input, expectedVersion: c.currentVersion! } }); }}
          >
            Réappliquer sur la version courante
          </button>
        )}
        {c.stepNumber !== null && <Link to={`/projets/${projectId}?module=parcours&etape=${c.stepNumber}&harmonie=1`}>ouvrir le panneau Harmonie</Link>}
      </span>
      {access.reason && <p className="h7-muted">{access.reason}</p>}
      {retry.error && <p role="alert">La reprise a échoué. Le conflit et votre saisie restent conservés.</p>}
    </li>
  );
}

function ModelConflictItem({ projectId, c, access, canWrite, saved }: { projectId: string; c: LotEnAttente; access: ReplayAccess; canWrite: boolean; saved: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function decide(decision: "rejouer" | "abandonner") {
    if (busy || (decision === "rejouer" && !access.allowed)) return;
    setBusy(true);setError(null);
    try { await deciderLot(projectId, c.enveloppe.requestId, decision, canWrite); }
    catch { setError("La reprise a échoué. Le conflit et votre saisie restent conservés."); }
    finally { setBusy(false); }
  }
  const motif = c.detail && typeof c.detail["message"] === "string" ? (c.detail["message"] as string) : c.detail && Array.isArray(c.detail["conflits"]) ? ((c.detail["conflits"] as { motif?: string }[])[0]?.motif ?? "") : "";
  return (
    <li data-conflict={c.enveloppe.requestId} data-kind="modele">
      <b>Atelier · {c.enveloppe.label || "lot de commandes"}</b> · {new Date(c.creeA).toLocaleString(LOCALE)} — {c.etat === "conflit" ? "ne s’applique plus sur la version du serveur" : "refusé par le serveur"}
      {motif ? ` (${motif})` : ""}. {saved ? "Le lot est conservé sur cet appareil." : "Le lot reste en mémoire ; sa sauvegarde locale n’est pas confirmée."}
      <span className="conflict-actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => void decide("abandonner")}>
          Garder le serveur
        </button>
        {c.etat === "conflit" && (
          <button type="button" className="button-primary" disabled={busy || !access.allowed || !saved} onClick={() => void decide("rejouer")}>
            Réappliquer sur la version courante
          </button>
        )}
        <Link to={`/projets/${projectId}?module=atelier`}>ouvrir l’Atelier</Link>
      </span>
      {access.reason && <p className="h7-muted">{access.reason}</p>}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}

export function ConflictPanel({ projectId }: { projectId: string }) {
  const conflicts = useSyncConflicts(projectId);
  const file = useFileAtelier(projectId), model = file.aTraiter;
  const projectAccess = useProjectAccess(projectId), online = useOnline(), reachable = useReachable();
  const access: ReplayAccess = { allowed: projectAccess.known && projectAccess.canWrite && online && reachable, reason: !projectAccess.known ? "Les droits de ce dossier doivent être vérifiés avant une reprise." : !projectAccess.canWrite ? "La reprise exige un accès en écriture à ce projet." : !online || !reachable ? "Rétablissez la connexion avant de reprendre ce conflit." : null };
  const steps = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });
  const labelOf = (stepNumber: number | null, key: string) => steps.data?.find((s) => s.number === stepNumber)?.form?.fields.find((f) => f.key === key)?.label ?? key;
  const total = conflicts.length + model.length;
  if (total === 0) return null;
  return (
    <section className="conflict-banner" role="alert" aria-label="Conflits de synchronisation">
      <p>
        <b>{total} écriture(s) à examiner</b> : comparez le refus et les valeurs conservées, puis décidez : garder le serveur, ou reprendre votre saisie sur
        l’état courant.
      </p>
      <ul>
        {conflicts.map((c) =>
          c.kind === "arbitrage" && c.decision ? <DecisionConflict key={c.id} projectId={projectId} c={c} access={access} /> : <FieldConflict key={c.id} projectId={projectId} c={c} labelOf={labelOf} access={access} />,
        )}
        {model.map((c) => (
          <ModelConflictItem key={c.enveloppe.requestId} projectId={projectId} c={c} access={access} canWrite={projectAccess.known && projectAccess.canWrite} saved={file.lecture === "ready" && !file.erreurLocale} />
        ))}
      </ul>
    </section>
  );
}
