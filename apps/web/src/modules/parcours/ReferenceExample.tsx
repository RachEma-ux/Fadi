/**
 * Présentation protégée de l'exemple résolu (`demoP118V81.mode = "reference"`,
 * p118-resolved-app V8.1 → V8.19) — ce que le prototype affichait à la place
 * du formulaire et du panneau Harmonie générés :
 *
 * - `bookBlock` : « Réponses renseignées · NN » en lecture (schéma métier ou
 *   synthèse / transmissions), budget du scénario aux étapes 14 / 15, note
 *   « GO sous conditions » à l'étape 19 ;
 * - `panelHTML` : le panneau Harmonie de l'exemple — en-tête = récit
 *   (`storyHTML` : étiquette, titre, décision, actions « Voir le choix
 *   Harmonie et sa transmission », « Essayer une variante en copie »,
 *   « Dossier complet de l’exemple », pli « Cadre de démonstration et
 *   hypothèses »), avertissement de péremption, onglets « Choix illustré »
 *   (choix déjà arbitré, schéma du terrain et données de site à l'étape 01,
 *   indicateurs du programme à l'étape 07, bilan du bâtiment aux étapes
 *   10 / 11, budget aux étapes 14 / 15, intentions reçues et choix
 *   transmis), « Alternatives expliquées », « Intentions reçues /
 *   transmises ».
 *
 * Tout vient des données servies pour l'étape (récit, réponses, propositions
 * arbitrées à l'import, intentions reçues) : rien n'est pré-rendu ni
 * inventé. Les copies (« Essayer une variante en copie ») reçoivent les
 * formulaires et le panneau Harmonie modifiables.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { EXAMPLE_BUDGET_NOTE, exampleBudget, exampleBudgetDecision, exampleBudgetMissing, exampleBudgetRows, exampleNum, fmtFr } from "@parcours/domain-model";
import { ApiError, api, type ParcoursStep, type Project } from "../../lib/api";
import { COMPLETE_EXAMPLE_ID } from "../../lib/use-import-example";
import type { HarmonieTab } from "./HarmoniePanel";
import { SiteHero } from "./SiteHarmonie";
import { MapTilerCard } from "./MapTilerCard";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** « Réponses renseignées » : intitulé → valeur (`answerHTML` : schéma métier, sinon synthèse / transmissions comme le prototype). */
export function exampleAnswers(step: ParcoursStep): { label: string; value: string }[] {
  const fields = step.content.fields;
  const form = step.form;
  const keys = Object.keys(fields).filter((k) => k !== "decision");
  if (form && keys.every((k) => form.fields.some((f) => f.key === k))) {
    return form.fields.map((f) => ({ label: f.label, value: f.type === "number" ? exampleNum(fields[f.key]) : String(fields[f.key] ?? "Non applicable au scénario retenu.") }));
  }
  return keys.map((k, i) => ({ label: k === "summary" ? "Synthèse / réponse de l’exemple" : `Transmission ${i + 1}`, value: String(fields[k] ?? "Non applicable au scénario retenu.") }));
}

/**
 * Budget du scénario (`budgetHTML`, étapes 14 / 15) : référence et scénario
 * défavorable calculés sur les réponses courantes des deux étapes. Un poste
 * manquant est nommé, jamais compté pour zéro.
 */
export function ExampleBudget({ allSteps }: { allSteps: ParcoursStep[] }) {
  const s14 = allSteps.find((s) => s.number === 14);
  const s15 = allSteps.find((s) => s.number === 15);
  if (!s14 || !s15) return null;
  const budget = exampleBudget(s14.content.fields, s15.content.fields);
  const label = (step: ParcoursStep, key: string) => step.form?.fields.find((f) => f.key === key)?.label ?? key;
  return (
    <div className="ex81-budget">
      <p className="ex81-note">{EXAMPLE_BUDGET_NOTE}</p>
      {budget ? (
        <>
          <div className="ex81-table table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Indicateur</th>
                  <th scope="col">Référence</th>
                  <th scope="col">Scénario défavorable</th>
                </tr>
              </thead>
              <tbody>
                {exampleBudgetRows(budget).map(([k, a, b]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{exampleNum(a)} MAD</td>
                    <td>{exampleNum(b)} MAD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <b>Décision du cas :</b> {exampleBudgetDecision(budget)}
          </p>
        </>
      ) : (
        <p>
          Budget non calculé — postes manquants :{" "}
          {exampleBudgetMissing(s14.content.fields, s15.content.fields)
            .map((m) => `étape ${m.step} · ${label(m.step === 14 ? s14 : s15, m.key)}`)
            .join(" ; ")}
          . Une valeur inconnue n’est pas zéro.
        </p>
      )}
    </div>
  );
}

/** `bookBlock(p, id)` : les réponses de l'étape en lecture, à la place du formulaire. */
export function ReferenceAnswers({ step, allSteps }: { step: ParcoursStep; allSteps: ParcoursStep[] }) {
  const answers = exampleAnswers(step);
  const schema = step.form && step.form.fields.length > 1 ? step.form.fields.length : null;
  return (
    <section className="biz-card ex81 reference-answers">
      <h2>Réponses renseignées · {pad2(step.number)}</h2>
      <p className="biz-sub">
        {schema ? `${schema} rubriques complétées. ` : ""}Lecture du scénario ; les hypothèses et les données sources sont nommées.
      </p>
      {(step.number === 14 || step.number === 15) && <ExampleBudget allSteps={allSteps} />}
      {step.number === 19 && (
        <p className="ex81-note">
          <b>GO sous conditions — études uniquement.</b> Décision fictive. Aucune autorisation de construire ou d’exploiter.
        </p>
      )}
      <dl className="ex81-answers">
        {answers.map((a) => (
          <div key={a.label}>
            <dt>{a.label}</dt>
            <dd>{a.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * `storyHTML` : l'en-tête du panneau de l'exemple — étiquette, titre,
 * décision, actions du prototype, cadre de démonstration.
 */
export function StoryHeader({ projectId, step, allSteps, project, onShowTransmission }: { projectId: string; step: ParcoursStep; allSteps: ParcoursStep[]; project: Project | null; onShowTransmission: () => void }) {
  const content = step.content;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [copyError, setCopyError] = useState<string | null>(null);
  const copy = useMutation({
    mutationFn: () => api.copyProject(projectId),
    onSuccess: (created) => {
      setCopyError(null);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      // `copy()` puis `overview()` : la vue d'ensemble de la copie ; l'original n'a pas changé.
      navigate(`/projets/${created.id}?module=parcours`, { state: { notice: `Copie créée : « ${created.code} — ${created.name} ». L’exemple d’origine est conservé ; vous travaillez dans la copie.` } });
    },
    onError: (err) => setCopyError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "La copie n’a pas pu être créée (réseau indisponible ou serveur injoignable)."),
  });
  const dossier = project?.sourceExampleId === COMPLETE_EXAMPLE_ID;
  return (
    <section className="ex81 ex81-story ex83-integrated" aria-labelledby={`story-${step.number}`}>
      <span className="ex81-tag">EXEMPLE RÉSOLU · {pad2(step.number)} / {allSteps.length}</span>
      <h2 id={`story-${step.number}`}>{content.headline}</h2>
      <p className="ex81-decision">{content.decision}</p>
      <div className="ex81-actions">
        <button type="button" className="button-primary" onClick={onShowTransmission}>
          Voir le choix Harmonie et sa transmission
        </button>
        <button type="button" className="button-secondary" disabled={copy.isPending} onClick={() => copy.mutate()}>
          {copy.isPending ? "Copie en cours…" : "Essayer une variante en copie"}
        </button>
        {dossier && (
          <a className="button-secondary" href={api.exampleReportUrl(projectId)} download>
            Dossier complet de l’exemple
          </a>
        )}
      </div>
      {copyError && (
        <p className="ex81-note warn" role="alert">
          Action non réalisée : {copyError}
        </p>
      )}
      <details className="ex81-frame">
        <summary>Cadre de démonstration et hypothèses</summary>
        {content.why && <p>{content.why}</p>}
        {content.sourceStatus && <p>{content.sourceStatus}</p>}
        <p>Les 21 étapes sont renseignées ; « illustrée » ne signifie pas qu’une étude technique réelle a été réalisée.</p>
      </details>
    </section>
  );
}

/** Tableau du prototype (`table(heads, rows)`), classes `ex81-table`. */
function Table({ heads, rows }: { heads: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="ex81-table table-scroll" tabIndex={0}>
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `traceHTML(p, id)` : intentions reçues et utilisées, choix déjà transmis, destinations cliquables (`goto`). */
function TraceTables({ step, allSteps, onGoto }: { step: ParcoursStep; allSteps: ParcoursStep[]; onGoto: (n: number) => void }) {
  const title = (n: number) => `${pad2(n)} · ${allSteps.find((s) => s.number === n)?.title ?? `Étape ${n}`}`;
  const chosen = step.proposals.filter((q) => q.group === "parti" && q.retained);
  const goto = (n: number) => (
    <button key={n} type="button" className="btn ex81-goto" onClick={() => onGoto(n)}>
      {title(n)}
    </button>
  );
  return (
    <>
      <h3>Intentions reçues et utilisées</h3>
      {step.incoming.length ? (
        <Table
          heads={["Origine", "Choix transmis", "État"]}
          rows={step.incoming.map((q) => [
            <>
              {goto(q.origin)}
              <small>{q.ref}</small>
            </>,
            q.text,
            q.originStale ? "À réexaminer après modification" : "Retenu dans le scénario",
          ])}
        />
      ) : (
        <p className="ex81-note">
          {step.number === 1
            ? "Point de départ : le choix du site ne reçoit pas une intention d’un bâtiment déjà distribué. L’organisation du terrain est renseignée ci-dessus."
            : "Aucune transmission ciblée pour cet état de votre adaptation ; le scénario de référence en contient une. Aucun choix nouveau n’est imposé."}
        </p>
      )}
      <h3>Choix déjà transmis</h3>
      <Table heads={["Référence", "Réponse retenue", "Destinations"]} rows={chosen.map((q) => [q.ref, q.text, q.targets.length ? <div className="ex81-goto-list">{q.targets.map(goto)}</div> : "Équipe de conception détaillée — dossier préparé"])} />
    </>
  );
}

/** « Données de site déjà renseignées » (`assumptionsHTML(p, 1)`) : les hypothèses H-CONTEXTE / H-ACCES / H-TOPO / H-MOBILITE de l'exemple. */
function SiteAssumptions({ project }: { project: Project | null }) {
  const all = ((project as (Project & { sourceAttachment?: { assumptions?: { id: string; title: string; value: string; status: string }[] } }) | null)?.sourceAttachment?.assumptions ?? []).filter((a) => ["H-CONTEXTE", "H-ACCES", "H-TOPO", "H-MOBILITE"].includes(a.id));
  if (!all.length) return null;
  return (
    <Table
      heads={["Référence", "Réponse de travail", "Portée"]}
      rows={all.map((a) => [
        <>
          <b>{a.id}</b>
          <br />
          {a.title}
        </>,
        a.value,
        a.status,
      ])}
    />
  );
}

/** Indicateurs du programme à l'étape 07 (`L.sums` : total, espaces principaux, supports et circulations). */
function ProgrammeKpis({ projectId }: { projectId: string }) {
  const programme = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  const sums = programme.data?.programmeCase?.sums;
  if (!sums) return null;
  return (
    <>
      <div className="ex81-kpis">
        <div>
          <b>{fmtFr(sums.total)} m²</b>Total programme
        </div>
        <div>
          <b>{fmtFr(sums.principal)} m²</b>Espaces principaux
        </div>
        <div>
          <b>{fmtFr(sums.support)} m²</b>Supports et circulations
        </div>
      </div>
      <p>Décision déjà prise : aucun transfert de surface n’est nécessaire pour cette variante ; réduire la densité plutôt qu’inventer un transfert sans besoin identifié.</p>
    </>
  );
}

/**
 * `panelHTML(id, p)` de l'exemple : le panneau Harmonie en présentation
 * protégée. `focus` l'ouvre sur un onglet (« ◈ Harmonie de l’étape », « Voir
 * le choix Harmonie et sa transmission ») ; `bilan` reçoit les actions des
 * étapes 10 / 11 (« Lire le bilan du bâtiment conçu », « Voir les capacités
 * et ambiances des 62 zones », « Exporter le bilan »).
 */
export function ReferenceHarmoniePanel({
  projectId,
  step,
  allSteps,
  project,
  onGoto,
  focus = null,
  bilan = null,
  onShowTransmission,
}: {
  projectId: string;
  step: ParcoursStep;
  allSteps: ParcoursStep[];
  project: Project | null;
  onGoto: (n: number) => void;
  focus?: { tab: HarmonieTab; nonce: number } | null;
  bilan?: React.ReactNode;
  onShowTransmission: () => void;
}) {
  const [tab, setTab] = useState<HarmonieTab>("proposals");
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!focus) return;
    setOpen(true);
    setTab(focus.tab);
    const id = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLButtonElement>(`.h7-tabs button[data-tab="${focus.tab}"]`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [focus]);
  const content = step.content;
  const partis = step.proposals.filter((q) => q.group === "parti");
  const retained = partis.find((q) => q.retained) ?? null;
  const site = step.number === 1 ? step.site : null;
  return (
    <details className="h7-panel h7-panel-reference" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} ref={panelRef}>
      <summary>
        Harmonie · {step.scope ?? step.title} · {step.retainedCount} choix retenu(s)
        {step.stale ? " · à réexaminer" : ""}
      </summary>
      <div className="h7-content">
        <div className="h7-inner ex81">
          <header className="h7-head ex83-example-head">
            <StoryHeader projectId={projectId} step={step} allSteps={allSteps} project={project} onShowTransmission={onShowTransmission} />
          </header>
          {step.stale && <p className="ex81-note warn">Les données ont changé depuis le scénario résolu. Les réponses historiques restent visibles et les dépendances doivent être réexaminées ; elles ne sont pas artificiellement revalidées.</p>}
          <nav className="h7-tabs" aria-label="Harmonie · exemple résolu">
            {(
              [
                ["proposals", "Choix illustré"],
                ["compare", "Alternatives expliquées"],
                ["transfer", "Intentions reçues / transmises"],
              ] as [HarmonieTab, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? "sel" : ""} aria-pressed={tab === key} data-tab={key} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="h7-tab-content">
            {tab === "proposals" && (
              <>
                <div className="ex81-selected">
                  {content.choice && <span className="ex81-tag">CHOIX {content.choice} · DÉJÀ ARBITRÉ</span>}
                  <h3>Pourquoi ce choix</h3>
                  <p>{content.why}</p>
                  <details>
                    <summary>Alternatives et compromis</summary>
                    <p>{content.alternatives}</p>
                  </details>
                  {content.result?.donnee && (
                    <p className="step-card-donnee">
                      <strong>Donnée / calcul : </strong>
                      {content.result.donnee}
                    </p>
                  )}
                  {content.result?.hypothese && (
                    <p className="step-card-hypothese">
                      <strong>Hypothèse retenue : </strong>
                      {content.result.hypothese}
                    </p>
                  )}
                  {content.result?.raw && <p>{content.result.raw}</p>}
                  <p className="ex81-muted">
                    {content.owner}
                    {content.proof ? ` · ${content.proof}` : ""}
                  </p>
                </div>
                {site && (
                  <>
                    <SiteHero site={site} active={retained} />
                    <Table heads={["Zone du schéma", "Organisation du terrain", "Surface indicative"]} rows={(retained?.zoning?.zones ?? []).map((z, i) => [String(i + 1), z.name, `${fmtFr(z.area)} m²`])} />
                    <p className="ex81-note">Organisation du terrain, non plan de bâtiment. Le découpage est indicatif ; le gabarit constructible intervient à l’étape 02. Les couleurs représentent des hypothèses, pas des constats MapTiler.</p>
                    <details className="ex81-fold">
                      <summary>Données de site déjà renseignées</summary>
                      <SiteAssumptions project={project} />
                      <p>Géolocalisation de travail : longitude −7,319682 ; latitude 33,708221. Une clé MapTiler n’est pas nécessaire pour consulter le schéma et les choix.</p>
                      {/* « Carte MapTiler (connexion facultative) » (`A.showMap()`) : la carte du prototype, avec la clé de l'utilisateur. */}
                      <MapTilerCard projectId={projectId} step={step} active={retained} />
                    </details>
                  </>
                )}
                {step.number === 7 && <ProgrammeKpis projectId={projectId} />}
                {(step.number === 10 || step.number === 11) && (
                  <>
                    {bilan}
                    <p className="ex81-note">Méthode choisie : formes, transitions et usages. La lecture Ba Zhai / carte natale complète est volontairement non mobilisée dans ce cas collectif ; aucune donnée de naissance demandée.</p>
                  </>
                )}
                {(step.number === 14 || step.number === 15) && <ExampleBudget allSteps={allSteps} />}
                <details className="ex81-fold">
                  <summary>Intentions reçues ({step.incoming.length}) et choix transmis</summary>
                  <TraceTables step={step} allSteps={allSteps} onGoto={onGoto} />
                </details>
              </>
            )}
            {tab === "compare" && (
              <Table
                heads={["Option", "Parti", "Décision motivée"]}
                rows={partis.map((q) => [
                  q.key,
                  q.title,
                  <>
                    <b>{q.retained ? "Retenue dans l’exemple" : "Écartée pour cet exemple"}</b>
                    <p>{q.retained ? content.why : q.decision.notes}</p>
                  </>,
                ])}
              />
            )}
            {tab === "transfer" && <TraceTables step={step} allSteps={allSteps} onGoto={onGoto} />}
          </div>
          <p className="ex81-muted">Les faits du fichier sont distingués des hypothèses. Aucun effet sur la santé, la prospérité ou la conformité n’est garanti.</p>
        </div>
      </div>
    </details>
  );
}
