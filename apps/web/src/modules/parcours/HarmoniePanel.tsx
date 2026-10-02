/**
 * Harmonie · ‹périmètre› · N choix retenu(s) — le panneau d'une étape, tel
 * que `h7-app` le compose dans le prototype : données mobilisées et
 * intentions reçues, onglets Proposer / Comparer / Choix & transmission,
 * trois propositions A/B/C avec leurs arbitrages (retenir, adapter /
 * motiver, écarter avec motif, traduire au programme, dessiner, consigner
 * une vérification), « Actualiser les propositions », « Rapport de cette
 * étape », péremption (« Données pertinentes modifiées », « À réexaminer ·
 * choix conservé », « Source à réexaminer »), cadre de lecture. Les règles
 * s'exécutent côté serveur ; ses refus sont affichés tels quels sous la
 * proposition concernée.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, type HarmonieDecisionInput, type HarmonieProposal, type ParcoursStep, type SiteObservationsInput } from "../../lib/api";
import { SiteDataFold, SiteHero } from "./SiteHarmonie";

const fmt = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** `toast()` du prototype : un message d'état éphémère en bas de l'écran. */
export function HarmonieToast({ text, onDone }: { text: string | null; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => done.current(), 3600);
    return () => clearTimeout(t);
  }, [text]);
  if (!text) return null;
  return (
    <div className="h7-toast" role="status">
      {text}
    </div>
  );
}

type Tab = "proposals" | "compare" | "transfer";

const pad2 = (n: number) => String(n).padStart(2, "0");

function ProposalCard({
  q,
  stepNumber,
  onDecide,
  onView,
  pending,
  error,
}: {
  q: HarmonieProposal;
  stepNumber: number;
  onDecide: (proposalId: string, input: HarmonieDecisionInput) => void;
  /** Étape 01 : afficher le schéma de cette proposition (`view-site`). */
  onView: ((proposalId: string) => void) | null;
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
    <article className={`h7-proposal${q.recommended ? " recommended" : ""}${q.retained ? " retained" : ""}${q.stale ? " stale" : ""}`} aria-labelledby={`${q.id}-title`} data-proposal={q.id}>
      <div className="h7-proposal-top">
        <span className="h7-kicker">{q.group === "local" ? `${q.ref.split("-LOCAL-")[0]} · LOCAL` : `${q.ref} · ${q.key}`}</span>
        <span className={`h7-chip${q.stale ? " warn" : q.retained ? " ok" : ""}${!q.stale && q.decision.status === "dismissed" ? " off" : ""}`}>
          {q.stale ? "À réexaminer · choix conservé" : q.stateLabel}
        </span>
      </div>
      <h3 id={`${q.id}-title`}>{q.title}</h3>
      {q.recommended && <p className="h7-reco">Proposition de départ privilégiée · à arbitrer</p>}
      {q.orphaned && <p className="h7-muted">Proposition absente des données courantes (modèle modifié) : le choix est conservé tel qu'il a été pris.</p>}
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
        <button type="button" className="button-primary" disabled={pending} onClick={() => submit("retained")}>
          {q.retained ? "Confirmer ce choix" : "Retenir"}
        </button>
        <button type="button" className="button-secondary" aria-expanded={open} aria-controls={editorId} onClick={() => setOpen((o) => !o)}>
          Adapter / motiver
        </button>
        {onView && (
          <button type="button" className="button-secondary" onClick={() => onView(q.id)}>
            Voir le schéma
          </button>
        )}
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
            « Retenue », « traduite », « dessinée » et « vérifiée » ne sont pas équivalents. Une vérification est une déclaration accompagnée de preuve, pas une certification automatique.
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
      <small className="h7-muted h7-source">{q.source}</small>
    </article>
  );
}

/** `receivedHTML(id, p)` : les intentions reçues des étapes amont, « Source à réexaminer » quand l'origine est périmée, « Voir l’origine ». */
function ReceivedTable({ incoming, onGoto }: { incoming: ParcoursStep["incoming"]; onGoto: (stepNumber: number) => void }) {
  if (!incoming.length) {
    return <p className="h7-muted">Aucune intention amont retenue n’est encore transmise à cette étape. Les propositions restent possibles à partir de ses données disponibles.</p>;
  }
  return (
    <div className="h7-table-wrap">
      <table className="h7-table h7-received">
        <thead>
          <tr>
            <th>Origine</th>
            <th>Intention reçue</th>
            <th>État</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {incoming.map((q) => (
            <tr key={q.id}>
              <td>
                {q.originLabel}
                <br />
                <small>{q.ref}</small>
              </td>
              <td>{q.text}</td>
              <td>{q.originStale ? <span className="h7-chip warn">Source à réexaminer</span> : q.stateLabel}</td>
              <td>
                <button type="button" className="button-secondary" onClick={() => onGoto(q.origin)}>
                  Voir l’origine
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HarmoniePanel({
  projectId,
  step,
  allSteps,
  onDecide,
  onGenerate,
  onGoto,
  pending,
  errors,
  onSaveSite = null,
  siteError = null,
  afterProposals = null,
  initialOpen = null,
}: {
  projectId: string;
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  onDecide: (proposalId: string, input: HarmonieDecisionInput) => void;
  /** « Actualiser les propositions » (`generate`). */
  onGenerate: () => void;
  /** « Voir l’origine » : ouvrir l'étape d'origine d'une intention reçue (`goto`). */
  onGoto: (stepNumber: number) => void;
  pending: boolean;
  /** Dernier refus du serveur par proposition (message en français). */
  errors: Record<string, string>;
  /** Étape 01 : enregistrement des données du site (`save-site`). */
  onSaveSite?: ((input: SiteObservationsInput) => void) | null;
  siteError?: string | null;
  /** Étape 07 : le pli « Proposer un transfert surfacique à total constant » (`programmeTransferHTML`), sous les propositions. */
  afterProposals?: ReactNode;
  /** Panneau ouvert à l'arrivée (`H.open()` : liens « Ouvrir Harmony » des vues du programme). */
  initialOpen?: boolean | null;
}) {
  const [tab, setTab] = useState<Tab>("proposals");
  const [open, setOpen] = useState(initialOpen ?? (step.retainedCount === 0 && step.proposals.length > 0));
  // Étape 01 : la proposition dont le schéma est affiché (`ui.siteProposal` du prototype).
  const [siteProposal, setSiteProposal] = useState<string | null>(null);
  const [siteFoldOpen, setSiteFoldOpen] = useState(false);
  if (step.proposals.length === 0) return null;
  const retained = step.proposals.filter((q) => q.retained);
  const partis = step.proposals.filter((q) => q.group === "parti");
  const locals = step.proposals.filter((q) => q.group === "local");
  const stepScope = (n: number) => {
    const d = allSteps.find((s) => s.number === n);
    return d?.scope ?? d?.title ?? `Étape ${n}`;
  };
  const site = step.number === 1 ? step.site : null;
  const activeSite = site ? (partis.find((q) => q.id === siteProposal) ?? partis.find((q) => q.retained) ?? partis[0] ?? null) : null;
  const recommendation = site?.recommendation ??
    step.recommendation ?? {
      key: "A",
      reason: "Parti de départ visant les intentions documentées et une intervention limitée ; à arbitrer avec les alternatives.",
    };
  function viewSite(id: string) {
    setSiteProposal(id);
    document.querySelector(".h7-site-hero")?.scrollIntoView({ behavior: "smooth" });
  }
  // Étape 20 : sans décision favorable à l'étape 19, les missions restent préparatoires.
  const decision19 = allSteps.find((s) => s.number === 19)?.content.fields["decision"];
  const missionsPreparatory = step.number === 20 && !["GO", "GO sous conditions"].includes(String(decision19 ?? ""));

  return (
    <details className="h7-panel" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        Harmonie · {step.scope ?? step.title} · {step.retainedCount} choix retenu(s)
        {step.stale ? " · à réexaminer" : ""}
      </summary>
      <div className="h7-content">
        <header className="h7-head">
          <div>
            <span className="eyebrow">
              Harmonie · Étape {pad2(step.number)} · {step.scope}
            </span>
            <h2>Propositions pour cette étape</h2>
            {step.goal && <p className="h7-muted">{step.goal}</p>}
          </div>
          <div className="h7-actions">
            <button type="button" className="button-secondary" disabled={pending} onClick={onGenerate}>
              Actualiser les propositions
            </button>
            <a className="button-secondary h7-report" href={api.harmonieReportUrl(projectId, step.number)} download>
              Rapport de cette étape
            </a>
          </div>
        </header>
        {step.stale && (
          <div className="h7-callout warn h7-stale" role="status">
            <b>Données pertinentes modifiées.</b> Les choix sont conservés, mais doivent être réexaminés. Actualisez les propositions avant de les confirmer.
          </div>
        )}
        {missionsPreparatory && <div className="h7-callout warn">Les missions ci-dessous sont préparatoires. Aucune mission n’est engagée sans décision favorable.</div>}

        {site && onSaveSite ? (
          <SiteDataFold key={site.observations.observedAt ?? "initial"} step={step} onSave={onSaveSite} pending={pending} error={siteError} open={siteFoldOpen} onToggle={setSiteFoldOpen} />
        ) : (
          <details className="h7-fold">
            <summary>Données mobilisées et intentions reçues ({step.incoming.length})</summary>
            <div className="h7-fold-body">
              <p>
                <b>Objet :</b> {step.scope}. {step.inputs}
              </p>
              <p>
                <b>Type :</b> {step.profile.label}.
              </p>
              {step.programme && (
                <p>
                  Programme : {step.programme.spaceCount} fiches · {fmt(step.programme.total)} m² de cibles de travail, distincts de la géométrie.
                </p>
              )}
              {step.model && (
                <p>
                  Modèle courant : {step.model.floors.length} niveaux · {step.model.roomCount} zones · empreinte {step.model.nativeHash}.
                </p>
              )}
              <ReceivedTable incoming={step.incoming} onGoto={onGoto} />
              <p className="h7-muted">Les propositions utilisent seulement les données pertinentes à cette décision. Un changement de caméra ne modifie pas l’orientation du bâtiment.</p>
            </div>
          </details>
        )}

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
            {site && <SiteHero site={site} active={activeSite} />}
            <p className="h7-group">
              <b>{recommendation.key} · Proposition de départ</b> — {recommendation.reason}
            </p>
            <div className="h7-grid">
              {partis.map((q) => (
                <ProposalCard key={q.id} q={q} stepNumber={step.number} onDecide={onDecide} onView={site ? viewSite : null} pending={pending} error={errors[q.id] ?? null} />
              ))}
            </div>
            {locals.length > 0 && (
              <details className="h7-fold h7-locals">
                <summary>{locals.length} propositions localisées sur les usages du modèle</summary>
                <div className="h7-fold-body h7-grid">
                  {locals.map((q) => (
                    <ProposalCard key={q.id} q={q} stepNumber={step.number} onDecide={onDecide} onView={null} pending={pending} error={errors[q.id] ?? null} />
                  ))}
                </div>
              </details>
            )}
            {afterProposals}
          </>
        )}

        {tab === "compare" && (
          <div className="h7-table-wrap">
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
          </div>
        )}

        {tab === "transfer" && (
          <div className="h7-transfer">
            <h3>Intentions reçues</h3>
            <ReceivedTable incoming={step.incoming} onGoto={onGoto} />
            <h3>Choix à transmettre</h3>
            {retained.length ? (
              <div className="h7-table-wrap">
                <table className="h7-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Choix retenu</th>
                      <th>Destinations</th>
                      <th>État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retained.map((q) => (
                      <tr key={q.id}>
                        <td>{q.ref}</td>
                        <td>
                          <b>{q.title}</b>
                          <br />
                          {q.text}
                        </td>
                        <td>
                          {q.targets.length
                            ? q.targets.map((n) => (
                                <button key={n} type="button" className="h7-chip h7-goto" onClick={() => onGoto(n)}>
                                  {pad2(n)} · {stepScope(n)}
                                </button>
                              ))
                            : "Dossier de conception détaillée"}
                        </td>
                        <td>{q.stale ? "À réexaminer" : q.stateLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Aucune proposition retenue à cette étape. Retenir ou adapter une proposition crée sa transmission.</p>
            )}
            <p className="h7-callout">La transmission ajoute une intention liée au dossier. Elle ne remplace pas vos textes manuels et ne dessine pas automatiquement un aménagement.</p>
          </div>
        )}

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
              Les archives générales Harmony sont conservées dans le dossier, hors navigation. Les interprétations traditionnelles ne certifient ni sécurité, ni santé, ni prospérité.
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
