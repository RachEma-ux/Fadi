/**
 * Bilan Harmonie du bâtiment conçu (étapes 10 et 11) — `designHTML`,
 * `openReport`, `review`, `compassHTML` du prototype (h7-app / flow-v62) :
 * le pli « Bilan Harmonie du bâtiment conçu · modèle … », le bilan en ligne
 * (Bilan du bâtiment / Plans & niveaux / Locaux & Répartition / Hypothèses
 * & MapTiler / Transmission), « Actualiser la revue de conception »,
 * « Exporter le bilan HTML », le plan de lecture SVG et les références
 * directionnelles documentées (« Enregistrer les références »).
 *
 * Tout est calculé par le serveur sur le modèle courant ; les fragments HTML
 * et les plans SVG sont ceux du rapport (mêmes fonctions), composés avec
 * échappement côté moteur.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ApiError, api, type CompassInput, type DesignReviewView } from "../../lib/api";
import { HarmonieToast } from "../parcours/HarmoniePanel";

type Tab = "synthesis" | "levels" | "rooms" | "assumptions" | "flow";
const TABS: [Tab, string][] = [
  ["synthesis", "Bilan du bâtiment"],
  ["levels", "Plans & niveaux"],
  ["rooms", "Locaux & Répartition"],
  ["assumptions", "Hypothèses & MapTiler"],
  ["flow", "Transmission"],
];

const fmt = (v: number | null | undefined, n = 2) => (Number.isFinite(v as number) ? (v as number).toLocaleString("fr-FR", { maximumFractionDigits: n }) : "Non renseigné");

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** `compassHTML` : références directionnelles du bâtiment — saisie, enregistrement, état calculé par le moteur. */
function CompassTools({ projectId, view, onSaved }: { projectId: string; view: DesignReviewView; onSaved: (next: DesignReviewView, text: string) => void }) {
  const c = view.compass.values;
  const str = (k: string) => (c[k] === null || c[k] === undefined ? "" : String(c[k]));
  const [form, setForm] = useState<Record<string, string>>({
    facing: str("facing"),
    source: str("source"),
    facadeReason: str("facadeReason"),
    date: str("date"),
    uncertainty: str("uncertainty"),
    declination: str("declination"),
    declinationSource: str("declinationSource"),
    basis: str("basis"),
  });
  const [confirmed, setConfirmed] = useState(c["confirmed"] === true);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const input: CompassInput = {
        facing: form["facing"] ?? "",
        source: form["source"] ?? "",
        facadeReason: form["facadeReason"] ?? "",
        date: form["date"] ?? "",
        uncertainty: form["uncertainty"] ?? "",
        declination: form["declination"] ?? "",
        declinationSource: form["declinationSource"] ?? "",
        basis: (form["basis"] ?? "") as CompassInput["basis"],
        confirmed,
      };
      return api.putCompass(projectId, input);
    },
    onSuccess: (next) => {
      setError(null);
      onSaved(next, "Références enregistrées ; les calculs directionnels restent suspendus tant que les références manquent.");
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Les références n’ont pas pu être enregistrées."),
  });
  const fields: [string, string, string, Record<string, string | number>][] = [
    ["facing", "Azimut de façade (°)", "number", { min: 0, max: 359.999999, step: "any" }],
    ["source", "Source et méthode", "text", {}],
    ["facadeReason", "Motif du choix de façade", "text", {}],
    ["date", "Date de la mesure", "date", {}],
    ["uncertainty", "Incertitude (°)", "number", { min: 0, max: 45, step: "any" }],
    ["declination", "Déclinaison magnétique, est positif (°)", "number", { min: -180, max: 180, step: "any" }],
    ["declinationSource", "Source et époque de la déclinaison", "text", {}],
  ];
  return (
    <section className="v62-card design-compass">
      <h3>Références directionnelles du bâtiment</h3>
      <p className="h7-callout">
        La rotation de la caméra ne change pas la référence spatiale. Les valeurs héritées restent des hypothèses tant que leurs sources ne sont pas confirmées. Aucun déplacement automatique de local.
      </p>
      <div className="h7-form">
        {fields.map(([k, label, type, attrs]) => (
          <label key={k}>
            {label}
            <input type={type} value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} {...attrs} />
          </label>
        ))}
        <label>
          Référence du nord
          <select value={form["basis"] ?? ""} onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value }))}>
            <option value="">À préciser</option>
            <option value="magnetic">Magnétique</option>
            <option value="geographic">Géographique</option>
            <option value="grid">Grille / projet</option>
          </select>
        </label>
        <label className="h7-checkbox wide">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Je confirme la référence de façade et les sources saisies — ce n’est pas une certification
          technique.
        </label>
      </div>
      <div className="h7-actions">
        <button type="button" className="button-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          Enregistrer les références
        </button>
      </div>
      {error && (
        <p className="h7-error" role="alert">
          {error}
        </p>
      )}
      <pre className="h7-json">{JSON.stringify({ compass: view.compass.status, natal: view.natal }, null, 2)}</pre>
      <p className="h7-muted">
        La carte temporelle antérieure reste conservée. Le moteur hérité calcule une trame de période et contrôle des saisies ; il ne génère pas de carte natale montagne/eau complète. La trame seule
        n’est pas un diagnostic.
      </p>
    </section>
  );
}

/** `openReport(tab)` : le bilan en ligne, dans l'étape. */
function InlineReport({
  projectId,
  view,
  initialTab = "synthesis",
  onClose,
  onRefresh,
  refreshing,
  onGoto,
}: {
  projectId: string;
  view: DesignReviewView;
  initialTab?: Tab;
  onClose: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onGoto: (step: number) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const r = view.analysis;
  const [level, setLevel] = useState<string>(r.floors.some((f) => f.id === "rdc") ? "rdc" : (r.floors[0]?.id ?? ""));
  const [roomLevel, setRoomLevel] = useState<string>("");
  const plan = view.plans[level] ?? "";
  return (
    <section id="v62-report-host" className="h7-inline-building-report">
      <main className="v62" id="v62-report">
        <div className="v62-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Replier le bilan
          </button>
          <button type="button" className="button-secondary" onClick={() => onGoto(10)}>
            Atelier 10 ↗
          </button>
          <button type="button" className="button-secondary" disabled={refreshing} onClick={onRefresh}>
            Actualiser la revue de conception
          </button>
          <a className="button-secondary" href={api.designReportUrl(projectId)} download>
            Rapport HTML ↓
          </a>
        </div>
        <header className="v62-head">
          <div className="v62-kicker">{view.example ? "P.118 · FORMATION, BUREAUX & SERVICES" : `${r.name.toUpperCase()} · ${view.profileLabel.toUpperCase()}`}</div>
          <h1>Bilan Harmony du bâtiment conçu</h1>
          <p>
            Modèle {r.nativeHash} · {r.rooms.length} zones · {r.stale ? "Revue archivée à actualiser" : "Lecture documentaire courante"} · aucune validation technique implicite.
          </p>
        </header>
        <nav className="v62-tabs" aria-label="Bilan du bâtiment">
          {TABS.map(([k, n]) => (
            <button key={k} type="button" className={tab === k ? "active" : ""} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {n}
            </button>
          ))}
        </nav>
        <div dangerouslySetInnerHTML={{ __html: view.html.designTrace }} />
        <div className="v62-tab-content">
          {tab === "synthesis" && (
            <>
              <div dangerouslySetInnerHTML={{ __html: view.html.synthesis }} />
              <section className="v62-card">
                <h2>Actions prioritaires</h2>
                <div className="v62-issues">
                  {r.issues.map((x) => (
                    <article key={x.id} className="v62-issue">
                      <span className="v62-tag">{x.priority}</span>
                      <h3>{x.title}</h3>
                      <p>{x.body}</p>
                      <button type="button" className="button-secondary" onClick={() => onGoto(x.step)}>
                        Étape {String(x.step).padStart(2, "0")} ↗
                      </button>
                    </article>
                  ))}
                  {!r.issues.length && <p>Aucune réserve calculée ; la validation humaine reste requise.</p>}
                </div>
              </section>
            </>
          )}
          {tab === "levels" && (
            <section className="v62-card">
              <h2>Lecture par niveau</h2>
              <label className="v62-select">
                Niveau
                <select value={level} onChange={(e) => setLevel(e.target.value)}>
                  {r.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              {plan ? (
                <div className="v62-plan" dangerouslySetInnerHTML={{ __html: plan }} />
              ) : (
                <p className="v62-alert">Aucun contour exploitable : importez une parcelle et dessinez l’emprise dans l’Atelier.</p>
              )}
              <div className="v62-actions">
                <button type="button" className="button-secondary" disabled={!plan} onClick={() => download(`Plan_lecture_${level}_V7.svg`, "image/svg+xml;charset=utf-8", plan)}>
                  Plan de lecture SVG ↓
                </button>
                <button type="button" className="button-secondary" onClick={() => onGoto(10)}>
                  Agrandir dans l’Atelier 10
                </button>
              </div>
              <div dangerouslySetInnerHTML={{ __html: view.html.levelTable }} />
            </section>
          )}
          {tab === "rooms" && (
            <section className="v62-card">
              <h2>Locaux : dessin, objectifs et lecture d’usage</h2>
              <label className="v62-select">
                Niveau
                <select value={roomLevel} onChange={(e) => setRoomLevel(e.target.value)}>
                  <option value="">Tous les niveaux</option>
                  {r.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Les contacts de portes / baies sont indicatifs (tolérance 0,65 m aux limites de zones), sans simulation de parcours ou de lumière. Les capacités sont celles des libellés, non un
                effectif contrôlé.
              </p>
              <div dangerouslySetInnerHTML={{ __html: view.html.rooms[roomLevel] ?? view.html.rooms[""] ?? "" }} />
            </section>
          )}
          {tab === "assumptions" && (
            <>
              <section className="v62-card">
                <h2>Hypothèses de travail, pas faits observés</h2>
                <div dangerouslySetInnerHTML={{ __html: view.html.assumptions }} />
              </section>
              <section className="v62-card">
                <h2>MapTiler — repérage et collecte</h2>
                {view.georeference ? (
                  <p>
                    Centre calculé : latitude <b>{fmt(view.georeference.latitude, 7)}</b>, longitude <b>{fmt(view.georeference.longitude, 7)}</b>
                    {view.georeference.projectNorth !== null ? <> · nord géographique à {fmt(view.georeference.projectNorth, 3)}° du +Y de la grille</> : null}. Référence source sous hypothèse. Une
                    carte chargée n’est pas une validation des limites.
                  </p>
                ) : (
                  <p>Géoréférencement à documenter dans Parcelle ou l’étude solaire.</p>
                )}
                <p className="h7-muted">
                  Fond satellite et altimétrie MapTiler : la connexion reste celle de l’outil Parcelle (étape 01) ; aucune collecte externe n’est effectuée depuis ce bilan. Pour les voisins, routes et
                  masques, consigner une observation datée et faire contrôler sur place.
                </p>
              </section>
              <div dangerouslySetInnerHTML={{ __html: view.html.sources }} />
            </>
          )}
          {tab === "flow" && (
            <section className="v62-card">
              <h2>Contrôle de transmission du dossier actif</h2>
              <div dangerouslySetInnerHTML={{ __html: view.html.audit }} />
              <p>Ce tableau est un contrôle du dossier à la date de l’édition, pas un compte-rendu de tests indépendants du logiciel.</p>
              {view.review && (
                <p className="h7-muted">
                  Revue archivée : {view.review.name} · {new Date(view.review.at).toLocaleString("fr-FR")} · modèle {view.review.modelSignature} · {view.review.counts.rooms} zones ·{" "}
                  {view.history.length} revue(s) antérieure(s).
                </p>
              )}
            </section>
          )}
        </div>
      </main>
    </section>
  );
}

/** `designHTML(p)` : le pli de l'étape, avec le bilan en ligne et les outils directionnels. */
export function DesignReviewFold({ projectId, roomsAction = false }: { projectId: string; roomsAction?: boolean }) {
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const query = useQuery({ queryKey: ["design-review", projectId], queryFn: () => api.getDesignReview(projectId) });
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(false);
  const [reportTab, setReportTab] = useState<Tab>("synthesis");
  const [compass, setCompass] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const refresh = useMutation({
    mutationFn: () => api.refreshDesignReview(projectId),
    onSuccess: (next) => {
      queryClient.setQueryData(["design-review", projectId], next);
      setToast("Bilan de conception actualisé sans lever les réserves.");
    },
    onError: () => setToast("La revue de conception n’a pas pu être actualisée."),
  });
  function adopt(next: DesignReviewView, text: string) {
    queryClient.setQueryData(["design-review", projectId], next);
    void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
    setToast(text);
  }
  function goto(step: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("etape", String(step));
      return next;
    });
  }
  const v = query.data;
  if (!v) return null;
  const r = v.analysis;
  return (
    <>
      <details className="h7-fold design-review-fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Bilan Harmonie du bâtiment conçu · modèle {r.nativeHash}</summary>
        <div className="h7-fold-body">
          <p>
            {r.floors.length} niveaux et {r.rooms.length} zones analysables depuis le modèle courant. Les réserves de la version précédente restent conservées ; les améliorations figurent dans les
            propositions de cette étape.
          </p>
          {r.stale && <p className="v62-alert">Une donnée analysée a changé depuis la revue archivée : revue à actualiser.</p>}
          <div className="h7-actions">
            <button
              type="button"
              className="button-secondary"
              aria-pressed={report}
              onClick={() => {
                setReportTab("synthesis");
                setReport((o) => !o);
              }}
            >
              Lire le bilan du bâtiment
            </button>
            {roomsAction && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setReportTab("rooms");
                  setReport(true);
                }}
              >
                Capacités & ambiances des espaces
              </button>
            )}
            <a className="button-secondary" href={api.designReportUrl(projectId)} download>
              Exporter le bilan HTML
            </a>
            <button type="button" className="button-secondary" aria-pressed={compass} onClick={() => setCompass((o) => !o)}>
              Outils directionnels documentés
            </button>
          </div>
          <p className="h7-muted">
            Ba Zhai et Étoiles Volantes ne sont pas utilisés pour noter le site. Les références insuffisantes suspendent les calculs directionnels, et aucune carte natale complète n’est inventée.
          </p>
          {compass && <CompassTools projectId={projectId} view={v} onSaved={adopt} />}
        </div>
      </details>
      {report && <InlineReport key={reportTab} projectId={projectId} view={v} initialTab={reportTab} onClose={() => setReport(false)} onRefresh={() => refresh.mutate()} refreshing={refresh.isPending} onGoto={goto} />}
      <style>{v.css}</style>
      <HarmonieToast text={toast} onDone={() => setToast(null)} />
    </>
  );
}
