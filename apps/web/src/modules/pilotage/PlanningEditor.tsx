import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type ProjectPlanning, type ProjectPlanningStep } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import { scheduledStepCount } from "./planning-timeline";

const emptyStep = (): ProjectPlanningStep => ({ startDate: null, endDate: null, responsible: "", nextAction: "" });
const readStep = (plan: ProjectPlanning, number: number) => plan.steps[String(number)] ?? emptyStep();
const formattedAt = (value: string) => new Date(value).toLocaleString(LOCALE, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface PlanningEditorProps {
  projectId: string;
  stepNumber: number;
  plan: ProjectPlanning;
  canWrite: boolean;
  referenceProtected: boolean;
}

export function StepPlanningEditor({ projectId, stepNumber, plan, canWrite, referenceProtected }: PlanningEditorProps) {
  const client = useQueryClient();
  const [values, setValues] = useState<ProjectPlanningStep>(() => readStep(plan, stepNumber));
  const [conflict, setConflict] = useState<ProjectPlanning | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const stored = readStep(plan, stepNumber);
  const dirty = JSON.stringify(stored) !== JSON.stringify(values);
  const writable = canWrite && !referenceProtected;

  useEffect(() => {
    if (!dirty && !conflict) setValues(readStep(plan, stepNumber));
  }, [plan.revision, projectId, stepNumber, dirty, conflict]);

  const save = useMutation({
    mutationFn: (expectedRevision: number) => api.saveProjectPlanningStep(projectId, stepNumber, { ...values, expectedRevision }),
    onSuccess: (received) => {
      client.setQueryData(["project-planning", projectId], received);
      setValues(readStep(received, stepNumber));
      setConflict(null); setError("");
      setNotice("Planning enregistré sur le serveur.");
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        const body = failure.body as { current?: ProjectPlanning } | null;
        const server = body?.current;
        if (server?.projectId === projectId && Number.isInteger(server.revision)) setConflict(server);
        setError("Conflit de version : votre saisie est conservée, mais n’a pas été enregistrée.");
      } else if (failure instanceof ApiError && [401, 403, 423].includes(failure.status)) {
        setError(failure.serverMessage || "Enregistrement refusé : vérifiez vos droits, votre session ou la réservation d’édition.");
      } else {
        setError("Enregistrement non confirmé. Votre saisie reste visible dans ce formulaire ; réessayez lorsque le serveur répond.");
      }
      setNotice("");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable || save.isPending || !dirty) return;
    setError(""); setNotice("");
    save.mutate(plan.revision);
  }
  function adoptServer() {
    if (!conflict) return;
    client.setQueryData(["project-planning", projectId], conflict);
    setValues(readStep(conflict, stepNumber));
    setConflict(null); setError(""); setNotice("Version serveur chargée. Votre ancienne saisie n’a pas été enregistrée.");
  }
  function reviseServer() {
    if (!conflict || !writable || save.isPending) return;
    setError(""); setNotice("");
    client.setQueryData(["project-planning", projectId], conflict);
    save.mutate(conflict.revision);
  }

  return <section className="cockpit-planning-editor" aria-labelledby="cockpit-edit-heading">
    <h4 id="cockpit-edit-heading">Pilotage métier · Étape {String(stepNumber).padStart(2, "0")}</h4>
    <p className="cockpit-note">Les échéances, le responsable et l’action sont indépendants de la validation du Parcours.</p>
    <form onSubmit={submit}>
      <div className="cockpit-date-pair">
        <label>Début prévisionnel<input type="date" value={values.startDate ?? ""} disabled={!writable || save.isPending} onChange={(e) => { setValues((v) => ({ ...v, startDate: e.target.value || null })); setNotice(""); }} /></label>
        <label>Fin prévisionnelle<input type="date" value={values.endDate ?? ""} disabled={!writable || save.isPending} min={values.startDate ?? undefined} onChange={(e) => { setValues((v) => ({ ...v, endDate: e.target.value || null })); setNotice(""); }} /></label>
      </div>
      <label>Responsable (texte libre)<input type="text" maxLength={120} placeholder="À désigner" value={values.responsible} disabled={!writable || save.isPending} onChange={(e) => { setValues((v) => ({ ...v, responsible: e.target.value })); setNotice(""); }} /></label>
      <label>Prochaine action<textarea maxLength={1200} rows={3} placeholder="Action à mener…" value={values.nextAction} disabled={!writable || save.isPending} onChange={(e) => { setValues((v) => ({ ...v, nextAction: e.target.value })); setNotice(""); }} /></label>
      {dirty && <p className="cockpit-note" role="status">Modifications non enregistrées.</p>}
      {!writable && <p className="cockpit-note" role="status">{referenceProtected ? "Exemple protégé : créez une copie de travail pour modifier ce planning." : "Consultation seulement : écriture indisponible pour ce dossier."}</p>}
      {notice && <p role="status" className="cockpit-save-ok">{notice}</p>}
      {error && <p role="alert" className="cockpit-save-error">{error}</p>}
      {conflict && <div className="cockpit-conflict" role="group" aria-label="Conflit de planning">
        <strong>Version du serveur {conflict.revision}</strong>
        <p>Responsable : {readStep(conflict, stepNumber).responsible || "Non renseigné"} · Fin : {readStep(conflict, stepNumber).endDate || "Non renseignée"}</p>
        <p>Comparez la version du serveur à votre saisie avant de choisir.</p>
        <button type="button" onClick={adoptServer}>Charger la version serveur</button>
        <button type="button" disabled={save.isPending || !writable} onClick={reviseServer}>Réappliquer ma saisie</button>
      </div>}
      <div className="cockpit-editor-actions">
        <button type="submit" className="cockpit-action primary" disabled={!writable || !dirty || save.isPending || !!conflict}>{save.isPending ? "Enregistrement…" : "Enregistrer le suivi"}</button>
        <button type="button" className="cockpit-action" disabled={save.isPending || !dirty} onClick={() => { setValues(stored); setError(""); setNotice(""); setConflict(null); }}>Annuler</button>
      </div>
    </form>
  </section>;
}

export function PlanningBaselineControl({ projectId, plan, canWrite, referenceProtected }: { projectId: string; plan: ProjectPlanning; canWrite: boolean; referenceProtected: boolean }) {
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState("");
  const count = scheduledStepCount(plan.steps);
  const ready = count === 21;
  const allowed = canWrite && !referenceProtected;

  const history = useQuery({
    queryKey: ["planning-baselines", projectId],
    queryFn: () => api.listProjectPlanningBaselines(projectId),
    enabled: historyOpen,
    staleTime: 30_000,
  });
  const publish = useMutation({
    mutationFn: () => api.publishProjectPlanningBaseline(projectId, plan.revision),
    onSuccess: (saved) => {
      client.setQueryData(["project-planning", projectId], saved);
      void client.invalidateQueries({ queryKey: ["planning-baselines", projectId] });
      setConfirmation(false); setError("");
    },
    onError: (failure) => {
      setError(failure instanceof ApiError && failure.status === 409
        ? "Le planning a changé : actualisez la lecture avant de confirmer la référence."
        : failure instanceof ApiError && failure.status === 422
          ? "Référence refusée : chaque étape doit comporter ses deux dates."
          : "Publication non confirmée : le planning n’a pas été validé.");
    },
  });

  return <section className="cockpit-baseline" aria-label="Référence du planning">
    <div className="cockpit-baseline-summary">
      <div><strong>{count} / 21 étapes datées</strong><p>{plan.baseline ? <>Référence V{plan.baseline.version} · {formattedAt(plan.baseline.createdAt)}</> : "Aucune référence validée"}</p></div>
      {allowed && <button type="button" className="cockpit-action" disabled={!ready || publish.isPending} onClick={() => { setConfirmation(!confirmation); setError(""); }}>{plan.baseline ? "Réviser la référence" : "Fixer la référence"}</button>}
    </div>
    {!ready && <p className="cockpit-note">Les dates des 21 étapes sont nécessaires pour valider une référence. Le brouillon reste enregistrable étape par étape.</p>}
    {referenceProtected && <p className="cockpit-note">Référence de projet protégée : validation indisponible sans copie de travail.</p>}
    {confirmation && <div className="cockpit-baseline-confirm">
      <p>La référence proposée figera les 21 dates actuelles en version {plan.baseline ? plan.baseline.version + 1 : 1}. Les versions précédentes resteront consultables.</p>
      <button type="button" disabled={publish.isPending} className="cockpit-action primary" onClick={() => { setError(""); publish.mutate(); }}>{publish.isPending ? "Validation en cours…" : "Confirmer la référence"}</button>
      <button type="button" disabled={publish.isPending} className="cockpit-action" onClick={() => setConfirmation(false)}>Annuler</button>
    </div>}
    {error && <p className="cockpit-save-error" role="alert">{error} <button type="button" onClick={() => { setError(""); void client.invalidateQueries({ queryKey: ["project-planning", projectId] }); }}>Actualiser</button></p>}
    {plan.baseline && <div className="cockpit-baseline-history">
      <button type="button" className="cockpit-action" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? "Masquer les références" : "Historique des références"}</button>
      {historyOpen && (history.isPending ? <p role="status">Chargement des références…</p> :
        history.isError ? <p role="alert">Historique indisponible. <button type="button" onClick={() => void history.refetch()}>Réessayer</button></p> :
        <ol>{history.data?.map((b) => <li key={b.version}>Version {b.version} · {formattedAt(b.createdAt)} · Révision source {b.sourceRevision}</li>)}</ol>)}
    </div>}
  </section>;
}
