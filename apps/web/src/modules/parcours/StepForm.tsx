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
import { LOCALE } from "../../lib/i18n";

const nf = new Intl.NumberFormat(LOCALE);

function toInputValue(v: ParcoursFieldValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * Lecture d'un nombre saisi (lot Design L3, arbitrage 11) : virgule ou point décimal, espaces de milliers tolérées.
 * Toute autre saisie (« 1e », « abc », « 12,5,3 ») est refusée : `null`, jamais une valeur devinée. Le signe est libre :
 * aucune règle métier nouvelle (« -3 » reste accepté, comme avant).
 */
export function lireNombre(saisie: string): number | null {
  const s = saisie.replace(/[\s\u00a0\u202f]/g, "");
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const MESSAGE_NOMBRE = "Nombre attendu, par exemple 12,5. La valeur enregistrée n'a pas changé.";
const MESSAGE_DATE = "Date incomplète ou invalide. La valeur enregistrée n'a pas changé.";

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
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { setDraft(toInputValue(value)); setErreur(null); }, [value]);
  const id = `biz-${field.key}`;
  const idErreur = `${id}-erreur`;

  // Une saisie invalide n'est jamais enregistrée ni effacée en silence : le texte reste, un message relié au champ
  // l'explique (WCAG 3.3.1), et la valeur enregistrée ne change pas.
  function commit(saisieInvalide = false) {
    if (saisieInvalide) { setErreur(MESSAGE_DATE); return; }
    const trimmed = draft.trim();
    const current = toInputValue(value);
    if (trimmed === current) { setErreur(null); return; }
    if (trimmed === "") {
      setErreur(null);
      onCommit(field.key, null);
      return;
    }
    if (field.type === "number") {
      const n = lireNombre(trimmed);
      if (n === null) { setErreur(MESSAGE_NOMBRE); return; }
      setErreur(null);
      if (toInputValue(n) !== current) onCommit(field.key, n);
      return;
    }
    setErreur(null);
    onCommit(field.key, trimmed);
  }

  const wide = field.type === "textarea";
  const nombre = field.type === "number";
  return (
    <div className={`biz-field${wide ? " wide" : ""}`}>
      <label htmlFor={id}>{field.label}</label>
      {wide ? (
        <textarea id={id} value={draft} placeholder="À documenter…" onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()} rows={4} />
      ) : (
        <input
          id={id}
          // Champ nombre en texte + clavier décimal : `type="number"` lisait « 12,5 » comme 125 ou rendait une valeur vide.
          type={nombre ? "text" : field.type}
          inputMode={nombre ? "decimal" : undefined}
          autoComplete={nombre ? "off" : undefined}
          value={draft}
          placeholder={field.type === "text" ? "À documenter…" : undefined}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? idErreur : undefined}
          data-biz-erreur={erreur ? "" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(field.type === "date" && e.currentTarget.validity.badInput)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
      {erreur && <p id={idErreur} className="biz-erreur" role="alert">{erreur}</p>}
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
