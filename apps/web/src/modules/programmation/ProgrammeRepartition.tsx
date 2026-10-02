/**
 * Répartition programmatique par type de bâtiment (étapes 06 et 07) —
 * `programmeContent()` du prototype : type, surface de référence, position
 * dans la fourchette, ratios éditables, indicateurs, tableau par famille,
 * matrice d'adjacence. Le serveur calcule et persiste ; l'écran affiche ce
 * qu'il renvoie. Pour un projet importé qui porte un cas de programme
 * (P.118), la vue devient « Répartition renseignée et liée au modèle » :
 * sommes calculées depuis les fiches d'espaces, jamais recopiées.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WriteFieldset } from "../../components/WriteFieldset";
import { api, ApiError, type ProgrammeMode, type ProgrammeView } from "../../lib/api";
import { ProgrammeCaseEditor, ProgrammeTransmission, appliedCase } from "./ProgrammeCase";

const m2 = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;
const m2cents = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
const pct = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

function RatioInput({ family, value, onCommit }: { family: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={0}
      max={100}
      step={0.1}
      aria-label={`Ratio projet ${family}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft.replace(",", "."));
        if (Number.isFinite(n) && n !== value) onCommit(Math.min(100, Math.max(0, n)));
        else setDraft(String(value));
      }}
    />
  );
}

/** Les fiches d'espaces de l'exemple (`roomsHTML`), chargées à l'ouverture du pli. */
function ResolvedRoomsFold({ projectId, count }: { projectId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const review = useQuery({ queryKey: ["design-review", projectId], queryFn: () => api.getDesignReview(projectId), enabled: open });
  return (
    <details className="ex81-fold programme-rooms-fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{count} fiches d’espaces — capacités, dimensions et ambiances choisies</summary>
      {open && (review.data?.html.exampleRooms ? <div className="v62-tab-content" dangerouslySetInnerHTML={{ __html: review.data.html.exampleRooms }} /> : review.isLoading ? <p className="loading-notice">Chargement des fiches…</p> : <p className="ex81-note">Fiches d’espaces indisponibles pour ce dossier.</p>)}
    </details>
  );
}

/**
 * `projectProgramme(p)` de p118-resolved-app : la présentation protégée de
 * la référence d'un exemple résolu — sommes calculées depuis les fiches,
 * fiches d'espaces, export CSV et « Essayer une autre répartition en copie »
 * (`copy()` : un nouveau projet modifiable, la référence intacte).
 */
function CaseSummary({ projectId, view }: { projectId: string; view: ProgrammeView }) {
  const navigate = useNavigate();
  const c = view.programmeCase!;
  const spaces = (Array.isArray(c.spaces) ? c.spaces : null) as Record<string, unknown>[] | null;
  const [error, setError] = useState<string | null>(null);
  const copy = useMutation({
    mutationFn: () => api.copyProject(projectId),
    onSuccess: (created) => navigate(`/projets/${created.id}?module=parcours`, { state: { notice: `Copie modifiable créée · ${created.name}` } }),
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "La copie n’a pas pu être créée."),
  });
  const rows: [string, number][] = [
    ["Espaces principaux", c.sums.principal],
    ["Circulation", c.sums.circulation],
    ["Technique", c.sums.technique],
    ["Sanitaires", c.sums.sanitaires],
    ["Convivialité", c.sums.convivialite],
    ["Autres supports / bandes", c.sums.supportAutres],
  ];
  return (
    <section className="biz-card programme-case ex81-block" aria-labelledby="programme-case-title">
      <h2 id="programme-case-title">Répartition renseignée et liée au modèle</h2>
      {c.users && <p>{c.users}</p>}
      <table className="programme-table">
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Surface de programme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{m2cents(v)}</td>
            </tr>
          ))}
          <tr className="programme-total">
            <td>Total des zones</td>
            <td>{m2cents(c.sums.programme)}</td>
          </tr>
        </tbody>
      </table>
      <p className="programme-note">
        Pas de provision fictive de parois : le modèle conserve ses noyaux, vides et parois hors des zones décrites. Ne pas additionner la parcelle, les
        dalles et le programme.
      </p>
      {spaces && <ResolvedRoomsFold projectId={projectId} count={spaces.length} />}
      {spaces && (
        <div className="ex81-actions">
          <a className="button-secondary" href={api.documentUrl(projectId, "fiches")} download>
            Exporter les fiches CSV
          </a>
          <button type="button" className="button-primary" disabled={copy.isPending} onClick={() => copy.mutate()}>
            Essayer une autre répartition en copie
          </button>
        </div>
      )}
      {error && (
        <p className="ex81-note warn" role="alert">
          Action non réalisée : {error}
        </p>
      )}
      <p className="step-card-meta">
        {c.title}
        {c.scenarioLabel ? ` · ${c.scenarioLabel}` : ""}
        {c.revision !== null ? ` · révision ${c.revision}` : ""} · {c.spaceCount} fiches d’espaces
      </p>
    </section>
  );
}

export function ProgrammeRepartition({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  const save = useMutation({
    mutationFn: (rep: { type: string; baseArea: number; mode: ProgrammeMode; custom: Record<string, number> }) => api.putProgramme(projectId, rep),
    onSuccess: (view) => {
      queryClient.setQueryData(["programme", projectId], view);
      // Le type de bâtiment pilote le profil Harmonie de toutes les étapes.
      void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
    },
  });
  const [areaDraft, setAreaDraft] = useState<string | null>(null);

  if (query.isLoading) return <p role="status">Chargement de la répartition…</p>;
  if (!query.data) return <p role="alert">Impossible de charger la répartition programmatique.</p>;
  const view = query.data;
  if (view.programmeCase && (view.resolvedExample || view.programmeCase.readOnly)) return <CaseSummary projectId={projectId} view={view} />;
  if (appliedCase(view)) return <ProgrammeCaseEditor projectId={projectId} view={view} />;

  const rep = view.repartition;
  const commit = (patch: Partial<{ type: string; baseArea: number; mode: ProgrammeMode; custom: Record<string, number> }>) =>
    save.mutate({ type: rep.type, baseArea: rep.baseArea, mode: rep.mode, custom: rep.custom, ...patch });

  return (
    <section className="biz-card" aria-labelledby="programme-title">
      <h2 id="programme-title">Répartition programmatique par type de bâtiment</h2>
      <p className="biz-sub">{view.reference.subtitle}</p>
      <WriteFieldset projectId={projectId}>
      <div className="programme-controls">
        <label>
          Type de bâtiment
          <select id="programme-type" value={rep.type} disabled={save.isPending} onChange={(e) => commit({ type: e.target.value, custom: {} })}>
            {view.reference.types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Surface de référence (m²)
          <input
            id="programme-area"
            type="number"
            min={0}
            step={0.1}
            value={areaDraft ?? String(rep.baseArea)}
            onChange={(e) => setAreaDraft(e.target.value)}
            onBlur={() => {
              if (areaDraft === null) return;
              const n = Number(areaDraft.replace(",", "."));
              setAreaDraft(null);
              if (Number.isFinite(n) && n >= 0 && n !== rep.baseArea) commit({ baseArea: n });
            }}
          />
        </label>
        <label>
          Position dans la fourchette
          <select id="programme-mode" value={rep.mode} disabled={save.isPending} onChange={(e) => commit({ mode: e.target.value as ProgrammeMode, custom: {} })}>
            {view.reference.modes.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="programme-grid" role="group" aria-label="Indicateurs de répartition">
        <div className="programme-kpi">
          <span>Surface référence</span>
          <b>{m2(view.totals.baseArea)}</b>
        </div>
        <div className="programme-kpi">
          <span>Fonctions support</span>
          <b>{pct(view.totals.supportPercent)}</b>
        </div>
        <div className="programme-kpi">
          <span>Support calculé</span>
          <b>{m2(view.totals.supportArea)}</b>
        </div>
        <div className="programme-kpi">
          <span>Solde programmable</span>
          <b>{m2(view.totals.netArea)}</b>
        </div>
      </div>
      <div className="table-scroll">
        <table className="programme-table">
          <thead>
            <tr>
              <th>Famille</th>
              <th>Fourchette</th>
              <th>Ratio projet</th>
              <th>Surface</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <b>{r.label}</b>
                </td>
                <td>
                  {r.range[0]}–{r.range[1]} %
                </td>
                <td>
                  <RatioInput family={r.label} value={r.ratio} onCommit={(v) => commit({ custom: { ...rep.custom, [r.key]: v } })} /> %
                </td>
                <td>{m2(r.area)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="programme-panel">
        <b>Matrice d’adjacence à transmettre à la conception</b>
        <div className="programme-adj">
          {view.reference.adjacency.map(([pair, rule]) => (
            <div key={pair}>
              <b>{pair}</b>
              <br />
              {rule}
            </div>
          ))}
        </div>
      </div>
      <p className="programme-note">
        <b>Statut :</b> {view.reference.statusNote.replace(/^Statut : /, "")}
      </p>
      </WriteFieldset>
      {save.isError && (
        <p role="alert" className="h7-error">
          {save.error instanceof ApiError && save.error.serverMessage ? save.error.serverMessage : "La répartition n’a pas pu être enregistrée."}
        </p>
      )}
    </section>
  );
}

/** Bloc « Programme transmis à l'Atelier Architectural » (étape 10) — badges et règles actives, depuis le réglage courant. */
export function ProgrammeTransfer({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  if (!query.data) return null;
  const v = query.data;
  if (appliedCase(v) && !v.resolvedExample) return <ProgrammeTransmission projectId={projectId} view={v} />;
  if (v.programmeCase) {
    const c = v.programmeCase;
    return (
      <section className="programme-transfer">
        <h3>Programme lié · {c.title}</h3>
        <p>
          {c.scenarioLabel ? <span className="programme-badge">{c.scenarioLabel}</span> : null}
          {c.revision !== null ? <span className="programme-badge">révision {c.revision}</span> : null}
          <span className="programme-badge">{c.spaceCount} lignes</span>
          <span className="programme-badge">{m2(c.sums.programme)} hors parois</span>
        </p>
        <p>Objectifs de programme ≠ surfaces dessinées. Aucune modification géométrique automatique.</p>
      </section>
    );
  }
  return (
    <section className="programme-transfer">
      <h3>{v.reference.transfer.title}</h3>
      <p>
        <span className="programme-badge">{v.typeLabel}</span>
        <span className="programme-badge">{m2(v.totals.baseArea)} référence</span>
        <span className="programme-badge">{pct(v.totals.supportPercent)} support</span>
      </p>
      <p>
        <b>Règles actives :</b> {v.reference.transfer.rules.replace(/^Règles actives : /, "")}
      </p>
      <p>
        <b>Contrôle de conception :</b> {v.reference.transfer.control.replace(/^Contrôle de conception : /, "")}
      </p>
    </section>
  );
}
