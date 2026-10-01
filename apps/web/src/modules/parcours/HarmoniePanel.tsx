/**
 * Harmonie · ‹périmètre› · N choix retenu(s) — le panneau d'une étape, tel
 * que `h7-app` le compose dans le prototype : données mobilisées et
 * intentions reçues, onglets Proposer / Comparer / Choix & transmission,
 * trois propositions A/B/C avec leurs arbitrages (retenir, adapter /
 * motiver, écarter avec motif, traduire au programme, dessiner, consigner
 * une vérification), cadre de lecture. Les règles s'exécutent côté serveur ;
 * ses refus sont affichés tels quels sous la proposition concernée.
 */
import { useState, type FormEvent } from "react";
import type { HarmonieDecisionInput, HarmonieProposal, ParcoursStep } from "../../lib/api";

type Tab = "proposals" | "compare" | "transfer";

const pad2 = (n: number) => String(n).padStart(2, "0");

function ProposalCard({
  q,
  stepNumber,
  onDecide,
  pending,
  error,
}: {
  q: HarmonieProposal;
  stepNumber: number;
  onDecide: (proposalId: string, input: HarmonieDecisionInput) => void;
  pending: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(q.decision.notes);
  const [owner, setOwner] = useState(q.decision.owner);
  const [link, setLink] = useState(q.decision.link);
  const [proof, setProof] = useState(q.decision.proof);
  const editorId = `editor-${q.id}`;

  function submit(status: HarmonieDecisionInput["status"]) {
    onDecide(q.id, { status, notes, owner, link, proof });
  }

  return (
    <article className={`h7-proposal${q.recommended ? " recommended" : ""}${q.retained ? " retained" : ""}`} aria-labelledby={`${q.id}-title`}>
      <div className="h7-proposal-top">
        <span className="h7-kicker">
          {q.ref} · {q.key}
        </span>
        <span className={`h7-chip${q.retained ? " ok" : ""}${q.decision.status === "dismissed" ? " off" : ""}`}>{q.stateLabel}</span>
      </div>
      <h3 id={`${q.id}-title`}>{q.title}</h3>
      {q.recommended && <p className="h7-reco">Proposition de départ privilégiée · à arbitrer</p>}
      <p>{q.text}</p>
      <dl>
        <dt>Pourquoi ici</dt>
        <dd>{q.why}</dd>
        <dt>Intérêt</dt>
        <dd>{q.benefit}</dd>
        <dt>Compromis</dt>
        <dd>{q.tradeoff}</dd>
        <dt>Conditions</dt>
        <dd>{q.conditions}</dd>
      </dl>
      <div className="h7-actions">
        <button type="button" className="button-primary" disabled={pending || q.decision.status === "retained"} onClick={() => submit("retained")}>
          Retenir
        </button>
        <button type="button" className="button-secondary" aria-expanded={open} aria-controls={editorId} onClick={() => setOpen((o) => !o)}>
          Adapter / motiver
        </button>
      </div>
      <details className="h7-editor" id={editorId} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Arbitrage, responsable et preuve</summary>
        <form
          className="h7-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            submit("adapted");
          }}
        >
          <label className="wide">
            Adaptation proposée ou motif
            <textarea value={notes} maxLength={6000} rows={3} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label>
            Responsable
            <input value={owner} maxLength={250} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <label>
            Référence d’objet / fiche
            <input value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} />
          </label>
          <label className="wide">
            Preuve / référence de revue
            <textarea value={proof} maxLength={3000} rows={2} onChange={(e) => setProof(e.target.value)} />
          </label>
          <div className="h7-actions">
            <button type="submit" className="button-primary" disabled={pending}>
              Retenir l’adaptation
            </button>
            <button type="button" className="button-secondary" disabled={pending} onClick={() => submit("dismissed")}>
              Écarter avec motif
            </button>
            {stepNumber >= 6 && (
              <button type="button" className="button-secondary" disabled={pending} onClick={() => submit("translated")}>
                Traduite au programme
              </button>
            )}
            {stepNumber >= 10 && (
              <button type="button" className="button-secondary" disabled={pending} onClick={() => submit("drawn")}>
                Dessinée — référence requise
              </button>
            )}
            <button type="button" className="button-secondary" disabled={pending} onClick={() => submit("verified")}>
              Consigner une vérification
            </button>
          </div>
          <p className="h7-muted">
            « Retenue », « traduite », « dessinée » et « vérifiée » ne sont pas équivalents. Une vérification est une déclaration accompagnée de preuve,
            pas une certification automatique.
          </p>
        </form>
      </details>
      {error && (
        <p className="h7-error" role="alert">
          {error}
        </p>
      )}
      {q.decision.history.length > 0 && (
        <small className="h7-muted">
          Version {q.decision.decisionVersion}
          {q.decision.updatedAt ? ` · ${new Date(q.decision.updatedAt).toLocaleString("fr-FR")}` : ""}
          {q.decision.owner ? ` · ${q.decision.owner}` : ""}
        </small>
      )}
    </article>
  );
}

export function HarmoniePanel({
  step,
  allSteps,
  onDecide,
  pending,
  errors,
}: {
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  onDecide: (proposalId: string, input: HarmonieDecisionInput) => void;
  pending: boolean;
  /** Dernier refus du serveur par proposition (message en français). */
  errors: Record<string, string>;
}) {
  const [tab, setTab] = useState<Tab>("proposals");
  const [open, setOpen] = useState(step.retainedCount === 0 && step.proposals.length > 0);
  if (step.proposals.length === 0) return null;
  const retained = step.proposals.filter((q) => q.retained);
  const stepTitle = (n: number) => allSteps.find((s) => s.number === n)?.title ?? `Étape ${n}`;

  return (
    <details className="h7-panel" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        Harmonie · {step.scope ?? step.title} · {step.retainedCount} choix retenu(s)
      </summary>
      <div className="h7-content">
        <span className="eyebrow">
          Harmonie · Étape {pad2(step.number)} · {step.scope}
        </span>
        <h2>Propositions pour cette étape</h2>
        {step.goal && <p className="h7-muted">{step.goal}</p>}

        <details className="h7-fold">
          <summary>Données mobilisées et intentions reçues ({step.incoming.length})</summary>
          <div className="h7-fold-body">
            <p>
              <b>Objet :</b> {step.scope}. {step.inputs}
            </p>
            <p>
              <b>Type :</b> {step.profile.label}.
            </p>
            {step.incoming.length ? (
              <table className="h7-table">
                <thead>
                  <tr>
                    <th>Origine</th>
                    <th>Intention reçue</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {step.incoming.map((q) => (
                    <tr key={q.id}>
                      <td>
                        {q.originLabel}
                        <br />
                        <small>{q.ref}</small>
                      </td>
                      <td>{q.text}</td>
                      <td>{q.stateLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="h7-muted">
                Aucune intention amont retenue n’est encore transmise à cette étape. Les propositions restent possibles à partir de ses données disponibles.
              </p>
            )}
            <p className="h7-muted">Les propositions utilisent seulement les données pertinentes à cette décision. Un changement de caméra ne modifie pas l’orientation du bâtiment.</p>
          </div>
        </details>

        <nav className="h7-tabs" aria-label="Harmonie">
          {(
            [
              ["proposals", "Proposer"],
              ["compare", "Comparer"],
              ["transfer", "Choix & transmission"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? "sel" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "proposals" && (
          <>
            <p className="h7-group">
              <b>A · Proposition de départ</b> — Parti de départ visant les intentions documentées et une intervention limitée ; à arbitrer avec les
              alternatives.
            </p>
            <div className="h7-grid">
              {step.proposals.map((q) => (
                <ProposalCard key={q.id} q={q} stepNumber={step.number} onDecide={onDecide} pending={pending} error={errors[q.id] ?? null} />
              ))}
            </div>
          </>
        )}

        {tab === "compare" && (
          <table className="h7-table">
            <thead>
              <tr>
                <th>Proposition</th>
                <th>Intérêt</th>
                <th>Compromis</th>
                <th>Conditions</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {step.proposals.map((q) => (
                <tr key={q.id}>
                  <td>
                    <b>{q.title}</b>
                    <br />
                    <small>{q.ref}</small>
                  </td>
                  <td>{q.benefit}</td>
                  <td>{q.tradeoff}</td>
                  <td>{q.conditions}</td>
                  <td>{q.stateLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "transfer" &&
          (retained.length ? (
            <table className="h7-table">
              <thead>
                <tr>
                  <th>Choix retenu</th>
                  <th>État</th>
                  <th>Transmis aux étapes</th>
                </tr>
              </thead>
              <tbody>
                {retained.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <b>{q.title}</b>
                      <br />
                      <small>{q.ref}</small>
                    </td>
                    <td>{q.stateLabel}</td>
                    <td>{q.targets.map((n) => `${pad2(n)} · ${stepTitle(n)}`).join(" ; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="h7-muted">Aucun choix retenu à cette étape : rien n’est encore transmis.</p>
          ))}

        <details className="h7-fold">
          <summary>Cadre de lecture et éléments antérieurs conservés</summary>
          <div className="h7-fold-body">
            {step.method && <p>{step.method}</p>}
            {step.deliverable && (
              <p>
                <b>Livrable :</b> {step.deliverable}
              </p>
            )}
            <p className="h7-muted">
              Les archives générales Harmony sont conservées dans le dossier, hors navigation. Les interprétations traditionnelles ne certifient ni sécurité,
              ni santé, ni prospérité.
            </p>
          </div>
        </details>
        <footer className="h7-footer">
          Révision {step.content.harmonie.revision}
          {step.content.harmonie.generatedAt ? ` · ${new Date(step.content.harmonie.generatedAt).toLocaleString("fr-FR")}` : ""}
          {step.deliverable ? ` · ${step.deliverable}` : ""}
        </footer>
      </div>
    </details>
  );
}
