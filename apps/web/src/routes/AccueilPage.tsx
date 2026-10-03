/**
 * Accueil : « Bonjour … », reprendre mon projet (aperçu conceptuel dessiné
 * depuis le modèle réel), Mon parcours (les 6 phases et leurs 21 étapes,
 * état réel), À poursuivre (étapes à réexaminer puis à faire), accès rapides
 * illustrés par les données du projet (parcelle, programme, plan du modèle).
 * Rien n'est inventé : sans modèle, sans parcelle ou sans programme, la
 * vignette le dit.
 */
import "../modules/bibliotheque/building-library.css";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type ParcoursStep, type ParcoursStepStatus, type Project } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { COMPLETE_EXAMPLE_ID, IMPORT_PROGRESS_TEXT, useImportExample } from "../lib/use-import-example";
import { ImportProjectButton } from "../modules/projets-sources/ImportProjectButton";
import { Icon, type IconName } from "../components/Icon";
import { shownName } from "./AppShell";

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

type StepStatus = ParcoursStepStatus;

/**
 * État d'une phase du Parcours à partir de ses étapes : terminée si toutes
 * le sont, en cours dès qu'une étape est entamée ou terminée, à faire sinon.
 * La progression vient de l'état des étapes, jamais de la présence d'un
 * texte ou d'un mur dessiné.
 */
function phaseStatus(steps: ParcoursStep[]): StepStatus {
  if (steps.length && steps.every((s) => s.status === "termine")) return "termine";
  if (steps.some((s) => s.status !== "a-faire")) return "en-cours";
  return "a-faire";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Les six phases du Parcours d'origine (ordre et libellés du prototype), avec leur icône. */
const PHASES: { label: string; icon: IconName }[] = [
  { label: "Comprendre le site", icon: "site" },
  { label: "Programmer", icon: "programme" },
  { label: "Concevoir / Tester", icon: "design" },
  { label: "Prouver la faisabilité", icon: "proof" },
  { label: "Arbitrer", icon: "scale" },
  { label: "Engager", icon: "flag" },
];
const phaseIcon = (phase: string): IconName => PHASES.find((p) => p.label === phase)?.icon ?? "route";

const STATUS_LABEL: Record<StepStatus, string> = { "a-faire": "à faire", "en-cours": "en cours", termine: "terminée" };

function StatusMark({ status, current }: { status: StepStatus; current: boolean }) {
  return (
    <span className={`phase-mark phase-mark-${status}${current ? " phase-mark-current" : ""}`} aria-hidden="true">
      {status === "termine" ? <Icon name="check" size={13} /> : null}
    </span>
  );
}

/** Vignette « Explorer la parcelle » : le contour réel transmis à l'étape 01 (repère local), sinon l'absence est dite. */
function ParcelThumb({ step }: { step: ParcoursStep | undefined }) {
  const local = step?.site?.parcel.local;
  if (!local || local.length < 3) return <ThumbEmpty text="Aucune parcelle transmise" />;
  const xs = local.map((p) => p[0]);
  const ys = local.map((p) => p[1]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const W = 160;
  const H = 120;
  const pad = 12;
  const k = Math.min((W - 2 * pad) / Math.max(1e-6, xmax - xmin), (H - 2 * pad) / Math.max(1e-6, ymax - ymin));
  const ox = pad + (W - 2 * pad - (xmax - xmin) * k) / 2;
  const oy = pad + (H - 2 * pad - (ymax - ymin) * k) / 2;
  const pt = (p: readonly [number, number]) => [ox + (p[0] - xmin) * k, H - oy - (p[1] - ymin) * k] as const;
  const points = local
    .map((p) =>
      pt(p)
        .map((v) => v.toFixed(1))
        .join(","),
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="quick-thumb" role="img" aria-label={`Parcelle ${step?.site?.parcel.parcelNumber ?? ""} : contour transmis, ${local.length} sommets`}>
      <rect width={W} height={H} fill="#eef3ec" />
      <polygon points={points} fill="#dbe7d9" stroke="#2f4a40" strokeWidth="1.4" />
      {local.map((p, i) => {
        const [x, y] = pt(p);
        return <circle key={i} cx={x} cy={y} r="2.2" fill="#2f4a40" />;
      })}
    </svg>
  );
}

/** Vignette « Organiser le programme » : les surfaces par famille de la répartition courante (barres proportionnelles). */
function ProgrammeThumb({ projectId }: { projectId: string }) {
  const programme = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  const rows = programme.data?.rows ?? [];
  const total = rows.reduce((n, r) => n + r.area, 0);
  if (!rows.length || total <= 0) return <ThumbEmpty text={programme.isLoading ? "Chargement…" : "Aucune répartition"} />;
  const W = 160;
  const H = 120;
  const barH = Math.min(14, (H - 24) / rows.length - 4);
  const maxArea = Math.max(...rows.map((r) => r.area));
  const PALETTE = ["#2f6b55", "#5f9478", "#9bbd9f", "#c9d9c3", "#b3872f", "#d8c48a", "#8aa5b5", "#c5d2db"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="quick-thumb" role="img" aria-label={`Programme : ${rows.length} familles de surfaces, ${Math.round(total)} m² au total`}>
      <rect width={W} height={H} fill="#eef3ec" />
      {rows.map((r, i) => {
        const y = 12 + i * ((H - 24) / rows.length);
        const w = Math.max(3, ((W - 56) * r.area) / maxArea);
        return (
          <g key={r.key}>
            <rect x="12" y={y} width={w} height={barH} rx="2" fill={PALETTE[i % PALETTE.length]} />
            <text x={16 + w} y={y + barH - 3} fontSize="8" fill="#41584f">
              {Math.round(r.area)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ThumbEmpty({ text }: { text: string }) {
  return (
    <span className="quick-thumb quick-thumb-empty" role="img" aria-label={text}>
      <span>{text}</span>
    </span>
  );
}

/** Vignette « Concevoir dans l'Atelier » : le plan compact du niveau de référence, depuis les polygones réels. */
function PlanThumb({ plan, level, loading }: { plan: string | null | undefined; level: string | null | undefined; loading: boolean }) {
  if (!plan) return <ThumbEmpty text={loading ? "Chargement…" : "Aucun modèle dessiné"} />;
  return <span className="quick-thumb quick-thumb-svg" role="img" aria-label={`Plan du niveau ${level ?? ""} du modèle`} dangerouslySetInnerHTML={{ __html: plan }} />;
}

export function AccueilPage() {
  const { user, updateProfile } = useAuth();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  // Premier contact : l'exemple P.118 s'importe d'un geste depuis l'accueil, avec le même suivi que la carte de « Mes projets ».
  const importExample = useImportExample();

  const mostRecent: Project | undefined = useMemo(() => [...(projectsQuery.data ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0], [projectsQuery.data]);

  const stepsQuery = useQuery({
    queryKey: ["steps", mostRecent?.id],
    queryFn: () => api.listSteps(mostRecent!.id),
    enabled: !!mostRecent,
  });
  // Aperçu conceptuel : relu quand le projet change (date de mise à jour dans la clé), gardé hors-ligne par le cache persistant.
  const previewQuery = useQuery({
    queryKey: ["concept-preview", mostRecent?.id, mostRecent?.updatedAt],
    queryFn: () => api.getConceptPreview(mostRecent!.id),
    enabled: !!mostRecent,
    staleTime: 5 * 60_000,
  });
  const steps = stepsQuery.data ?? [];
  const doneCount = steps.filter((s) => s.status === "termine").length;
  const startedCount = steps.filter((s) => s.status !== "a-faire").length;
  const nextStep = steps.find((s) => s.status !== "termine") ?? null;
  const staleSteps = steps.filter((s) => s.stale || s.staleRetainedCount > 0);
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  // Nom du salut : modifiable sur place (même réglage que Paramètres → Compte), jamais déduit au-delà du début de l'adresse.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  async function saveName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameSaving(true);
    setNameError(null);
    try {
      await updateProfile(nameDraft.trim() || null);
      setEditingName(false);
    } catch {
      setNameError("Le nom n’a pas pu être enregistré (serveur injoignable ou refus).");
    } finally {
      setNameSaving(false);
    }
  }

  const moduleLink = (moduleId: string) => (mostRecent ? `/projets/${mostRecent.id}?module=${moduleId}` : "/projets");
  const stepLink = (n: number) => (mostRecent ? `/projets/${mostRecent.id}?module=parcours&etape=${n}` : "/projets");

  // Les six phases du Parcours d'origine, dans l'ordre, avec l'état réel de leurs étapes.
  const phases = PHASES.map((phase) => {
    const own = steps.filter((s) => s.phase === phase.label);
    const next = own.find((s) => s.status !== "termine") ?? own[0];
    return {
      ...phase,
      status: own.length ? phaseStatus(own) : ("a-faire" as StepStatus),
      href: next ? stepLink(next.number) : "/projets",
      done: own.filter((s) => s.status === "termine").length,
      total: own.length,
      steps: own,
    };
  });
  const currentPhase = phases.find((p) => p.status !== "termine")?.label ?? null;

  // « À poursuivre » : d'abord les étapes à réexaminer (une donnée amont a changé), puis les prochaines étapes à faire ; trois au plus.
  const toPursue: { key: string; label: string; detail: string; icon: IconName; href: string }[] = [];
  for (const s of staleSteps) toPursue.push({ key: `stale-${s.number}`, label: s.title, detail: `Étape ${pad2(s.number)} · à réexaminer`, icon: phaseIcon(s.phase), href: stepLink(s.number) });
  for (const s of steps.filter((s) => s.status !== "termine" && !staleSteps.includes(s))) {
    if (toPursue.length >= 3) break;
    toPursue.push({ key: `next-${s.number}`, label: s.title, detail: `Étape ${pad2(s.number)} · ${STATUS_LABEL[s.status]}`, icon: phaseIcon(s.phase), href: stepLink(s.number) });
  }
  if (mostRecent && steps.length && toPursue.length === 0) {
    toPursue.push({ key: "docs", label: "Produire les documents", detail: "Dossier, bilan, tableaux", icon: "file", href: moduleLink("documents") });
    toPursue.push({ key: "atelier", label: "Revoir le bâtiment conçu", detail: "Bilan Harmonie de l'Atelier", icon: "atelier", href: stepLink(18) });
  }
  const preview = previewQuery.data;
  const stage = nextStep ? `${nextStep.phase} • Étape ${pad2(nextStep.number)} — ${nextStep.title}` : steps.length ? `Parcours terminé • ${doneCount} / ${steps.length} étapes` : "";

  return (
    <main className="home-page">
      <div className="home-greeting">
        <div>
          <h1>
            Bonjour{user ? ` ${shownName(user)}` : ""},
            {user && !editingName && (
              <button type="button" className="home-name-edit" aria-label="Changer le nom affiché" title="Changer le nom affiché" onClick={() => setEditingName(true)}>
                <Icon name="design" size={16} />
              </button>
            )}
          </h1>
          {editingName ? (
            <form className="home-name-form" onSubmit={(e) => void saveName(e)}>
              <label htmlFor="home-display-name">Comment vous appeler ?</label>
              <input id="home-display-name" type="text" maxLength={60} autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Prénom ou nom" autoComplete="name" />
              <button type="submit" className="button-primary" disabled={nameSaving}>
                {nameSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" className="button-secondary" onClick={() => setEditingName(false)}>
                Annuler
              </button>
              {nameError && (
                <small className="h7-error" role="alert">
                  {nameError}
                </small>
              )}
            </form>
          ) : (
            <p>Donnons forme à votre prochain projet.</p>
          )}
        </div>
        <div className="home-greeting-actions">
          <ImportProjectButton
            className="button-secondary"
            label={
              <>
                <Icon name="upload" size={18} /> Importer
              </>
            }
          />
          <Link to="/projets" className="button-primary">
            <Icon name="plus" size={18} /> Nouveau projet
          </Link>
        </div>
      </div>

      <div className="home-grid">
        <div className="home-main-column">
          {projectsQuery.isLoading && <p role="status">Chargement…</p>}

          {projectsQuery.data && !mostRecent && (
            <section className="panel home-empty-state" aria-busy={importExample.importingId !== null}>
              <h2>Aucun projet pour l'instant</h2>
              <p>
                Créez votre premier projet pour commencer à structurer sa parcelle, son programme et sa conception, ou importez l’exemple P.118 (21 étapes illustrées, modèle de l’Atelier, parcelle)
                pour voir le Parcours rempli de bout en bout.
              </p>
              <div className="resume-card-actions">
                <button type="button" className="button-primary" disabled={importExample.importingId !== null} onClick={() => importExample.start(COMPLETE_EXAMPLE_ID)}>
                  {importExample.importingId ? "Import en cours…" : "Importer l’exemple P.118 et l’ouvrir"}
                </button>
                <Link to="/projets" className="button-secondary">
                  Créer mon premier projet
                </Link>
              </div>
              {importExample.importingId && (
                <p className="example-card-progress" role="status">
                  <span className="example-card-spinner" aria-hidden="true" /> {IMPORT_PROGRESS_TEXT}
                </p>
              )}
              {importExample.error && (
                <p className="h7-error" role="alert">
                  {importExample.error.message}
                </p>
              )}
            </section>
          )}

          {mostRecent && (
            <section className="panel resume-card" aria-labelledby="resume-heading">
              <span className="eyebrow">Reprendre mon projet</span>
              <div className="resume-card-top">
                <h2 id="resume-heading">
                  {mostRecent.code} — {mostRecent.name}
                </h2>
                <span className={`badge badge-${doneCount === steps.length && steps.length ? "done" : startedCount > 0 ? "active" : "new"}`}>
                  <i aria-hidden="true" />
                  {steps.length && doneCount === steps.length ? "Parcours terminé" : startedCount > 0 ? "Étude en cours" : "Nouveau projet"}
                </span>
              </div>

              <figure className={`resume-preview${preview?.svg ? "" : " resume-preview-empty"}`}>
                {preview?.svg ? (
                  <div className="resume-preview-svg" dangerouslySetInnerHTML={{ __html: preview.svg }} />
                ) : (
                  <div className="resume-preview-placeholder">
                    <Icon name="cube" size={34} />
                    <p>
                      {previewQuery.isLoading
                        ? "Lecture du modèle…"
                        : previewQuery.isError
                          ? "Aperçu indisponible (serveur injoignable)."
                          : "Aucun modèle dessiné pour l’instant : l’aperçu apparaîtra dès les premiers murs dans l’Atelier."}
                    </p>
                  </div>
                )}
                <figcaption>
                  {preview?.svg ? `Aperçu conceptuel · ${preview.levels} niveau${preview.levels > 1 ? "x" : ""} · ${preview.rooms} zones · modèle ${preview.nativeHash}` : "Aperçu conceptuel"}
                </figcaption>
              </figure>

              <div className="resume-card-foot">
                <p className="resume-card-meta">
                  {stage ? <span className="resume-stage">{stage}</span> : null}
                  <span className="resume-updated">Modifié {relativeDate(mostRecent.updatedAt)}</span>
                </p>
                <div className="resume-card-actions">
                  <Link to={nextStep ? stepLink(nextStep.number) : `/projets/${mostRecent.id}`} className="button-primary">
                    Reprendre le projet <Icon name="arrow-right" size={18} />
                  </Link>
                  <Link to={moduleLink("atelier")} className="button-secondary">
                    <Icon name="cube" size={18} /> Ouvrir l’Atelier
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="home-side-column">{parcoursPanel()}</aside>

        <section aria-labelledby="quick-links-heading" className="quick-access">
          <h2 id="quick-links-heading">Accès rapides</h2>
          <div className="quick-links">
            <Link to={mostRecent ? stepLink(1) : "/projets"} className="quick-link-card">
              <ParcelThumb step={steps.find((s) => s.number === 1)} />
              <span className="quick-link-text">
                <span className="quick-link-title">Explorer la parcelle</span>
                <span className="quick-link-sub">Site, limites et contexte</span>
              </span>
              <span className="quick-link-arrow" aria-hidden="true">
                <Icon name="arrow-right" size={18} />
              </span>
            </Link>
            <Link to={moduleLink("programmation")} className="quick-link-card">
              {mostRecent ? <ProgrammeThumb projectId={mostRecent.id} /> : <ThumbEmpty text="Aucun projet" />}
              <span className="quick-link-text">
                <span className="quick-link-title">Organiser le programme</span>
                <span className="quick-link-sub">Espaces, surfaces et besoins</span>
              </span>
              <span className="quick-link-arrow" aria-hidden="true">
                <Icon name="arrow-right" size={18} />
              </span>
            </Link>
            <Link to={moduleLink("atelier")} className="quick-link-card">
              {mostRecent ? <PlanThumb plan={preview?.plan} level={preview?.planLevel} loading={previewQuery.isLoading} /> : <ThumbEmpty text="Aucun projet" />}
              <span className="quick-link-text">
                <span className="quick-link-title">Concevoir dans l’Atelier</span>
                <span className="quick-link-sub">Plans, volumes et détails</span>
              </span>
              <span className="quick-link-arrow" aria-hidden="true">
                <Icon name="arrow-right" size={18} />
              </span>
            </Link>
          </div>
        </section>

        {/* `enhance()` de building-library-app : l'entrée de la bibliothèque sur la page d'accueil. */}
        <section className="bl-summary-insert" id="bl-home-library">
          <b>Bibliothèque des bâtiments · 10 types / 21 cas</b>
          <span>Programme, dimensions, flux, références et scénarios reliés à Harmony et Répartition.</span>
          <div className="bl-actions">
            <Link className="bl-button" to="/bibliotheque/batiments">
              Explorer les exemples par type
            </Link>
          </div>
        </section>
      </div>
    </main>
  );

  /** « Mon parcours » et « À poursuivre » (colonne de droite) — rendu par appel, pas un composant imbriqué (pas de remontage à chaque rendu). */
  function parcoursPanel() {
    return (
      <section className="panel home-parcours" aria-labelledby="parcours-heading">
        <h2 id="parcours-heading">Mon parcours</h2>
        <p className="panel-sub">{mostRecent && steps.length ? `21 étapes pour structurer le projet · ${doneCount} terminée${doneCount > 1 ? "s" : ""}` : "21 étapes pour structurer le projet"}</p>
        {stepsQuery.isLoading && <p role="status">Chargement…</p>}
        <ol className="parcours-phases">
          {phases.map((phase) => {
            const current = phase.label === currentPhase;
            const open = openPhase === phase.label;
            return (
              <li key={phase.label} className={`parcours-phase parcours-phase-${phase.status}${current ? " parcours-phase-current" : ""}`}>
                <div className="parcours-phase-row">
                  <Link to={phase.href} className="parcours-phase-link">
                    <StatusMark status={phase.status} current={current} />
                    <span className="parcours-phase-label">{phase.label}</span>
                    {phase.total ? <small>{`${phase.done}/${phase.total}`}</small> : null}
                  </Link>
                  <button
                    type="button"
                    className="parcours-phase-toggle"
                    aria-expanded={open}
                    aria-controls={`phase-steps-${phase.icon}`}
                    aria-label={`${open ? "Replier" : "Déplier"} les étapes de la phase ${phase.label}`}
                    onClick={() => setOpenPhase(open ? null : phase.label)}
                    disabled={!phase.total}
                  >
                    <Icon name={current && !open ? "chevron-right" : "chevron-down"} size={18} />
                  </button>
                </div>
                {open && phase.total > 0 && (
                  <ul className="parcours-phase-steps" id={`phase-steps-${phase.icon}`}>
                    {phase.steps.map((s) => (
                      <li key={s.number}>
                        <Link to={stepLink(s.number)}>
                          <span className={`step-dot step-dot-${s.status}`} aria-hidden="true" />
                          <span className="parcours-step-number">{pad2(s.number)}</span>
                          <span className="parcours-step-title">{s.title}</span>
                          {s.stale || s.staleRetainedCount > 0 ? <small>à réexaminer</small> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        <h3 className="home-pursue-heading">À poursuivre</h3>
        {toPursue.length ? (
          <ul className="home-pursue">
            {toPursue.map((item) => (
              <li key={item.key}>
                <Link to={item.href}>
                  <span className="home-pursue-icon" aria-hidden="true">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="home-pursue-text">
                    <span className="home-pursue-label">{item.label}</span>
                    <small>{item.detail}</small>
                  </span>
                  <Icon name="chevron-right" size={18} className="home-pursue-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="home-pursue">
            <li>
              <Link to="/projets">
                <span className="home-pursue-icon" aria-hidden="true">
                  <Icon name="folder" size={18} />
                </span>
                <span className="home-pursue-text">
                  <span className="home-pursue-label">Créer votre premier projet</span>
                  <small>ou importer l’exemple P.118</small>
                </span>
                <Icon name="chevron-right" size={18} className="home-pursue-chevron" />
              </Link>
            </li>
          </ul>
        )}
        <Link className="home-see-steps" to={mostRecent ? `/projets/${mostRecent.id}?module=parcours` : "/projets"}>
          Voir les étapes <Icon name="arrow-right" size={16} />
        </Link>
      </section>
    );
  }
}
