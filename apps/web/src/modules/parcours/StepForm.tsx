/**
 * Formulaire métier d'une étape (BIZ_SCHEMAS du prototype) : champs typés,
 * sauvegarde au `blur`/`change` comme le prototype sauvegarde au `change`,
 * indicateurs calculés (14 finance, 17 score), panneau de décision (19).
 * Les calculs viennent de `@parcours/domain-model` — mêmes fonctions que
 * le serveur.
 */
import { useEffect, useState } from "react";
import { DECISION_CHOICES, financeKpis, scoreKpis } from "@parcours/domain-model";
import type { ParcoursFieldValue, ParcoursFormField, ParcoursStep } from "../../lib/api";

const nf = new Intl.NumberFormat("fr-FR");

function toInputValue(v: ParcoursFieldValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function Field({
  field,
  value,
  onCommit,
}: {
  field: ParcoursFormField;
  value: ParcoursFieldValue | undefined;
  onCommit: (key: string, value: ParcoursFieldValue) => void;
}) {
  const [draft, setDraft] = useState(toInputValue(value));
  useEffect(() => setDraft(toInputValue(value)), [value]);
  const id = `biz-${field.key}`;

  function commit() {
    const trimmed = draft.trim();
    const current = toInputValue(value);
    if (trimmed === current) return;
    if (trimmed === "") {
      onCommit(field.key, null);
      return;
    }
    if (field.type === "number") {
      const n = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(n)) {
        setDraft(current);
        return;
      }
      onCommit(field.key, n);
      return;
    }
    onCommit(field.key, trimmed);
  }

  const wide = field.type === "textarea";
  return (
    <div className={`biz-field${wide ? " wide" : ""}`}>
      <label htmlFor={id}>{field.label}</label>
      {wide ? (
        <textarea id={id} value={draft} placeholder="À documenter…" onChange={(e) => setDraft(e.target.value)} onBlur={commit} rows={4} />
      ) : (
        <input
          id={id}
          type={field.type}
          inputMode={field.type === "number" ? "decimal" : undefined}
          min={field.type === "number" ? 0 : undefined}
          step={field.type === "number" ? "any" : undefined}
          value={draft}
          placeholder={field.type === "text" ? "À documenter…" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
    </div>
  );
}

function FinanceKpis({ fields }: { fields: Record<string, ParcoursFieldValue> }) {
  const k = financeKpis(fields);
  if (!k) {
    return (
      <div className="v62-alert" role="status">
        <b>Chiffrage incomplet.</b> Investissement, financement et solde non calculés tant que les postes nécessaires ne sont pas renseignés. Une
        valeur inconnue n’est pas zéro.
      </div>
    );
  }
  return (
    <div className="biz-kpis" role="group" aria-label="Indicateurs financiers">
      <div className="biz-kpi">
        <span>Investissement</span>
        <b>{nf.format(k.investissement)}</b>
      </div>
      <div className="biz-kpi">
        <span>Financement</span>
        <b>{nf.format(k.financement)}</b>
      </div>
      <div className="biz-kpi">
        <span>Solde</span>
        <b className={k.solde < 0 ? "status-no" : "status-ok"}>{nf.format(k.solde)}</b>
      </div>
    </div>
  );
}

function ScoreKpis({ step, allSteps }: { step: ParcoursStep; allSteps: ParcoursStep[] }) {
  const s = scoreKpis(step.content.fields);
  const dueDiligence = String(allSteps.find((x) => x.number === 16)?.content.fields["f10"] ?? "").trim();
  const decision = allSteps.find((x) => x.number === 19)?.content.fields["decision"];
  return (
    <div className="biz-kpis" role="group" aria-label="Évaluation">
      <div className="biz-kpi">
        <span>Note provisoire</span>
        <b>{s.average === null ? "—" : s.average.toFixed(2)} / 5</b>
        <small>
          {s.count}/{s.of} critères
        </small>
      </div>
      <div className="biz-kpi">
        <span>Due diligence</span>
        <b>{dueDiligence ? "Réserves" : "—"}</b>
      </div>
      <div className="biz-kpi">
        <span>Décision</span>
        <b>{decision ? String(decision) : "Non prise"}</b>
      </div>
    </div>
  );
}

function DecisionPanel({ value, onChoose, pending }: { value: ParcoursFieldValue | undefined; onChoose: (choice: string) => void; pending: boolean }) {
  return (
    <div className="decision-grid" role="group" aria-label="Décision">
      {DECISION_CHOICES.map((choice) => (
        <button
          key={choice}
          type="button"
          className={value === choice ? "sel" : ""}
          aria-pressed={value === choice}
          disabled={pending}
          onClick={() => onChoose(choice)}
        >
          {choice}
        </button>
      ))}
    </div>
  );
}

export function StepForm({
  step,
  allSteps,
  onCommit,
  pending,
  readOnly = false,
}: {
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  /** `baseline` : la valeur que l'écran affichait pour chaque champ modifié (contrôle de concurrence côté serveur). */
  onCommit: (fields: Record<string, ParcoursFieldValue>, baseline: Record<string, ParcoursFieldValue>) => void;
  pending: boolean;
  /** Projet partagé en lecture : les champs restent lisibles, aucune saisie n'est envoyée. */
  readOnly?: boolean;
}) {
  const form = step.form;
  if (!form) return null;
  const fields = step.content.fields;
  return (
    <section className="biz-card" aria-labelledby={`biz-title-${step.number}`}>
      <h2 id={`biz-title-${step.number}`}>{step.title}</h2>
      {form.intro && <p className="biz-sub">{form.intro}</p>}
      {step.number === 14 && <FinanceKpis fields={fields} />}
      {step.number === 17 && <ScoreKpis step={step} allSteps={allSteps} />}
      {step.number === 19 && <DecisionPanel value={fields["decision"]} onChoose={(c) => onCommit({ decision: c }, { decision: fields["decision"] ?? null })} pending={pending} />}
      {readOnly && <p className="h7-muted access-readonly-hint">Lecture seule : les valeurs saisies par le propriétaire ou les éditeurs sont affichées, sans modification possible.</p>}
      <fieldset className="biz-grid" disabled={readOnly}>
        {form.fields.map((f) => (
          <Field key={f.key} field={f} value={fields[f.key]} onCommit={(key, value) => onCommit({ [key]: value }, { [key]: fields[key] ?? null })} />
        ))}
      </fieldset>
    </section>
  );
}
