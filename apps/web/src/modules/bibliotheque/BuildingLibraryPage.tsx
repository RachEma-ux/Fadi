/**
 * Bibliothèque des bâtiments — Parcours V6.1 (`building-library-app` du
 * prototype) : recherche et filtre par type, cas par type (21 cas, 3
 * variantes), fiche d'un cas avec ses cinq rubriques (Programme & surfaces,
 * Adjacences & flux, Exigences & dessin, Harmony & parcours, Sources &
 * hypothèses), schéma d'adjacences et gabarit d'essai dimensionnel (SVG),
 * exports (rapport HTML du cas, programme CSV, fiche JSON, schémas SVG) et
 * « Utiliser ce scénario » : application de la variante au projet courant ou
 * à une nouvelle étude isolée, cadre territorial déclaré, textes déjà saisis
 * conservés par défaut.
 *
 * Les textes et la structure sont ceux du prototype ; les calculs (sommes,
 * schémas, CSV) viennent de `@parcours/domain-model`.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QueryClientProvider, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  LIBRARY_RELATION_LABELS,
  LIBRARY_SPACE_STATUS_LABELS,
  LIBRARY_TABS,
  PROGRAMME_BUCKET_LABELS,
  adjacencyGraphSvg,
  fmtLib,
  foldText,
  programmeCaseSums,
  programmeCsv,
  roomSketchSvg,
  type BuildingCase,
  type BuildingScenario,
  type LibrarySpace,
  type ProgrammeBucket,
} from "@parcours/domain-model";
import { api, ApiError, type ApplyProgrammeCaseInput, type BuildingCaseDetail } from "../../lib/api";
import "./building-library.css";
import libraryCss from "./building-library.css?raw";

const fmt = fmtLib;
const escHtml = (x: unknown) => String(x ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

/** Rendu statique d'un arbre React par le moteur déjà chargé (sans `react-dom/server`) : le HTML tel que l'écran l'afficherait. */
function staticMarkup(node: React.ReactNode): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(node));
  const html = host.innerHTML;
  root.unmount();
  return html;
}

/**
 * `report(c, s)` du prototype : le dossier complet du cas en un seul HTML —
 * les cinq rubriques (rendues par les mêmes vues que l'écran, plis ouverts,
 * boutons et champs masqués), la feuille de style de la bibliothèque, l'en-tête
 * « RAPPORT DE PROGRAMMATION » et la clôture du prototype.
 */
export async function caseReportHtml(queryClient: QueryClient, detail: BuildingCaseDetail, s: BuildingScenario, now = new Date().toISOString()): Promise<string> {
  const c = detail.case;
  // La rubrique Harmony lit l'index de la bibliothèque (les 21 étapes) : il doit être en cache avant le rendu statique.
  await queryClient.ensureQueryData({ queryKey: ["building-library"], queryFn: api.getBuildingLibrary, staleTime: Infinity });
  const sections = LIBRARY_TABS.map(([key]) =>
    staticMarkup(
      <QueryClientProvider client={queryClient}>
        {key === "relations" ? (
          <RelationsView c={c} />
        ) : key === "technique" ? (
          <TechniqueView c={c} s={s} />
        ) : key === "harmony" ? (
          <HarmonyView c={c} s={s} onApply={() => undefined} />
        ) : key === "sources" ? (
          <SourcesView detail={detail} />
        ) : (
          <ProgrammeView c={c} s={s} surfaceConvention={detail.surfaceConvention} />
        )}
      </QueryClientProvider>,
    ),
  )
    .join("")
    .replace(/<details /g, "<details open ");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(c.title)} · programme V6.1</title><style>${libraryCss}</style><style>body{margin:0;font:14px Arial;background:#f5f7f3}button,input,select,.bl-screen-only{display:none!important}h2,h3{break-after:avoid}a{color:#245d4d}details>div{display:block!important}summary{font-weight:bold}</style></head><body><main class="bl"><section class="bl-hero"><div><span class="bl-kicker">PARCOURS V6.1 · RAPPORT DE PROGRAMMATION</span><h1>${escHtml(c.title)}</h1><p>${escHtml(s.label)} · export ${escHtml(now)}</p><p>${escHtml(c.profile.label)} → ${escHtml(c.subtype)}</p></div></section><div class="bl-note warn"><b>Statut des valeurs.</b> ${escHtml(c.provenanceNotice)} Aucune validation Feng Shui, dimensionnelle ou réglementaire automatique.</div>${sections}<p>Fin du dossier · hypothèses de travail, non dossier d’autorisation ou d’exécution.</p></main></body></html>`;
}
function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Tag({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span className={`bl-tag ${cls}`}>{children}</span>;
}

/** Une cellule numérique (alignée à droite, chiffres tabulaires) se déclare `{ num }`. */
type Cell = React.ReactNode | { num: React.ReactNode };
const isNum = (cell: Cell): cell is { num: React.ReactNode } => typeof cell === "object" && cell !== null && !Array.isArray(cell) && "num" in cell && !("$$typeof" in cell);

function Table({ headers, rows, cls = "" }: { headers: string[]; rows: Cell[][]; cls?: string }) {
  return (
    <div className="bl-table-wrap" tabIndex={0}>
      <table className={cls}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) =>
                isNum(cell) ? (
                  <td key={j} className="num">
                    {cell.num}
                  </td>
                ) : (
                  <td key={j}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stats({ spaces }: { spaces: LibrarySpace[] }) {
  const t = programmeCaseSums(spaces);
  const items: [string, number, string][] = [
    ["Principaux", t.principal, "m²"],
    ["Support + circulation", t.support, "m²"],
    ["Programme hors parois", t.programme, "m²"],
    ["Parois séparées", t.parois, "m² alloués"],
  ];
  return (
    <div className="bl-stats">
      {items.map(([a, b, c]) => (
        <div className="bl-stat" key={a}>
          <span>{a}</span>
          <b>
            {a === "Parois séparées" && !b ? "Non chiffrées" : fmt(b)} <small>{a === "Parois séparées" && !b ? "0 m² alloué, pas 0 m² réel" : c}</small>
          </b>
        </div>
      ))}
    </div>
  );
}

export function SpaceTable({ spaces, onEdit }: { spaces: LibrarySpace[]; onEdit?: ((spaceId: string, key: "quantity" | "unitArea", value: string) => void) | undefined }) {
  return (
    <Table
      cls="bl-spaces"
      headers={["Repère / espace", "Quantité", "m² unité", "m² total", "Capacité / fonction", "Statut"]}
      rows={spaces.map((s) => [
        <>
          <b>{s.name}</b>
          <small>
            {s.id}
            {s.level ? ` · ${s.level}` : ""}
          </small>
        </>,
        onEdit ? (
          <input
            aria-label={`Quantité ${s.name}`}
            type="number"
            min={0}
            step={1}
            defaultValue={s.quantity}
            onBlur={(e) => e.target.value !== String(s.quantity) && onEdit(s.id, "quantity", e.target.value)}
          />
        ) : (
          { num: fmt(s.quantity, 0) }
        ),
        onEdit ? (
          <input
            aria-label={`Surface ${s.name}`}
            type="number"
            min={0}
            step={0.01}
            defaultValue={s.unitArea}
            onBlur={(e) => e.target.value !== String(s.unitArea) && onEdit(s.id, "unitArea", e.target.value)}
          />
        ) : (
          { num: fmt(s.unitArea, 3) }
        ),
        { num: fmt(s.quantity * s.unitArea, 3) },
        <>
          {s.capacity || "À préciser"}
          <small>{s.use}</small>
        </>,
        <>
          <Tag cls={s.status === "source" ? "source" : "hyp"}>{LIBRARY_SPACE_STATUS_LABELS[String(s.status)] ?? "Hypothèse"}</Tag>
          <small>{s.source}</small>
        </>,
      ])}
    />
  );
}

export function ProgrammeView({
  c,
  s,
  surfaceConvention,
  onEdit,
}: {
  c: BuildingCase;
  s: BuildingScenario;
  surfaceConvention: string;
  onEdit?: ((spaceId: string, key: "quantity" | "unitArea", value: string) => void) | undefined;
}) {
  const t = programmeCaseSums(s.spaces);
  return (
    <>
      <section className="bl-card">
        <h2>Type de bâtiment → sous-type → usagers / capacité</h2>
        <div className="bl-definition">
          <div className="term">Type / sous-type</div>
          <div>
            {c.profile.label} · {c.subtype}
          </div>
          <div className="term">Usagers / capacité</div>
          <div>
            {c.users}
            <br />
            <b>{c.capacity === null ? "Capacité à documenter" : `${fmt(c.capacity, 0)} ${c.unit}`}</b>
          </div>
          <div className="term">Base du programme</div>
          <div>
            {s.label} · {s.note}
          </div>
        </div>
        <div className="bl-note">
          Les places dans plusieurs salles utilisées successivement ne s’additionnent pas automatiquement. « Visites/jour », « lits », « postes », « palettes » et « personnes présentes » sont des
          unités différentes.
        </div>
      </section>
      <Stats spaces={s.spaces} />
      <section className="bl-card">
        <h2>Espaces principaux</h2>
        <SpaceTable spaces={s.spaces.filter((x) => x.role === "principal")} onEdit={onEdit} />
      </section>
      <section className="bl-card">
        <h2>Espaces support</h2>
        <p className="bl-small">
          Accueil, sanitaires, locaux techniques, autres supports et circulation sont distingués. Les surfaces privatives déjà comprises ne sont pas ajoutées une seconde fois.
        </p>
        <SpaceTable spaces={s.spaces.filter((x) => x.role === "support")} onEdit={onEdit} />
        {s.spaces.some((x) => x.role === "parois") && (
          <>
            <h3>Provisions de parois / gaines — hors surface utile</h3>
            <SpaceTable spaces={s.spaces.filter((x) => x.role === "parois")} onEdit={onEdit} />
          </>
        )}
      </section>
      <section className="bl-card">
        <h2>Ratios surfaciques</h2>
        <p>{surfaceConvention}</p>
        {!t.parois && (
          <div className="bl-note">
            Aucune provision de parois / gaines distincte n’est chiffrée. Les 0 m² alloués ne prouvent pas l’absence de parois ; le total reste partiel et ne dimensionne pas le bâtiment.
          </div>
        )}
        <div className="bl-table-wrap" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Famille</th>
                <th>Surface allouée</th>
                <th>% du total de travail</th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(PROGRAMME_BUCKET_LABELS) as [ProgrammeBucket, string][]).map(([key, label]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td className="num">{fmt(t[key], 3)} m²</td>
                  <td className="num">{t.total ? fmt((t[key] / t.total) * 100, 2) : "—"} %</td>
                </tr>
              ))}
              <tr>
                <th>Total de travail</th>
                <th className="num">{fmt(t.total, 3)} m²</th>
                <th className="num">100 %</th>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <b>Ratio calculé par unité de capacité :</b>{" "}
          {c.capacity && c.capacity > 0 ? `${fmt(t.programme / c.capacity, 2)} m² de programme / unité (« ${c.unit} »).` : "Non calculé : effectif non documenté."} Ce ratio décrit ce cas ; ce n’est
          pas une norme.
        </p>
        {c.sourceConvention && (
          <div className="bl-note">
            <b>Convention de la source, conservée :</b> {c.sourceConvention}
          </div>
        )}
      </section>
      {c.conflicts.length > 0 && (
        <section className="bl-card">
          <h2>Écarts et réserves à instruire</h2>
          {c.conflicts.map((x, i) => (
            <p className="bl-risk" key={i}>
              {x}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

function RelationsView({ c }: { c: BuildingCase }) {
  const svg = useMemo(() => adjacencyGraphSvg(c), [c]);
  return (
    <>
      <section className="bl-card">
        <h2>Adjacences</h2>
        <p>Relations proposées ou reprises des besoins source. Une relation non décrite reste à étudier ; elle n’est pas déclarée impossible.</p>
        <div className="bl-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        <button type="button" className="bl-screen-only" onClick={() => download(`Adjacences_${c.id}.svg`, "image/svg+xml", svg)}>
          Exporter ce schéma SVG
        </button>
        <Table headers={["Origine", "Destination", "Relation", "Justification"]} rows={c.adjacencies.map(([a, b, r, why]) => [a, b, LIBRARY_RELATION_LABELS[r] ?? r, why])} />
      </section>
      <section className="bl-card">
        <h2>Flux</h2>
        {c.flows.map((f, i) => (
          <div className="bl-note" key={i}>
            <b>Circuit {i + 1}</b>
            <p>{f}</p>
          </div>
        ))}
        <div className="bl-note warn">
          <b>Évacuation :</b> circuit à étudier séparément selon classement, effectifs et possibilités d’assistance. Un diagramme fonctionnel ne vérifie ni distances de fuite ni largeur des sorties.
        </div>
      </section>
    </>
  );
}

function TechniqueView({ c, s, openP118 }: { c: BuildingCase; s: BuildingScenario; openP118?: () => void }) {
  const p = c.profile;
  const rooms = s.spaces.filter((x) => x.role === "principal");
  const [room, setRoom] = useState(0);
  const [width, setWidth] = useState(4);
  const [widthError, setWidthError] = useState<string | null>(null);
  const sketch = useMemo(() => roomSketchSvg(s, room, width), [s, room, width]);
  return (
    <>
      <section className="bl-card">
        <h2>Dimensions minimales / recommandées</h2>
        <div className="bl-note warn">
          « Minimum projet » ci-dessous = seuil de travail proposé, pas minimum légal. La référence réglementaire, la largeur libre réelle, les portes ouvertes et les équipements doivent être
          vérifiés. Une dimension inconnue n’est jamais remplacée silencieusement par une cote inventée.
        </div>
        <Table
          headers={["Élément", "Minimum projet proposé", "Recommandé pour test", "Hauteur libre cible", "Minimum réglementaire", "Base / réserve"]}
          rows={c.dimensionChecks.map((d) => [
            d.element,
            d.minimumProjet === null ? "À définir" : `${fmt(d.minimumProjet, 2)} m`,
            d.recommande === null ? "À définir" : `${fmt(d.recommande, 2)} m`,
            d.hauteurLibre === null ? "À définir" : `${fmt(d.hauteurLibre, 2)} m`,
            "Non documenté",
            <>
              {d.note}
              <small>{d.source}</small>
            </>,
          ])}
        />
      </section>
      <section className="bl-card">
        <h2>Contraintes techniques</h2>
        <p>{p.tech}</p>
      </section>
      <div className="bl-grid">
        {(
          [
            ["Accessibilité", p.acc],
            ["Sécurité", p.safety],
            ["Acoustique", p.acoustic],
            ["Réseaux", p.networks],
          ] as [string, string][]
        ).map(([a, b]) => (
          <section className="bl-card" key={a}>
            <h2>{a}</h2>
            <p>{b}</p>
            <span className="bl-tag hyp">À instruire par spécialistes</span>
          </section>
        ))}
      </div>
      <section className="bl-card">
        <h2>Critères de performance</h2>
        <Table headers={["Critère", "Cible proposée", "Vérification", "Responsable"]} rows={p.performance.map(([a, b, d, e]) => [a, b, d, e])} />
        {c.requirements.length > 0 && (
          <details className="bl-fold">
            <summary>{c.requirements.length} exigences détaillées de la source</summary>
            <div>
              <Table headers={["Exigence", "Cible source", "Vérification"]} rows={c.requirements.map((x) => [x.name, x.target, x.verification])} />
            </div>
          </details>
        )}
      </section>
      <section className="bl-card">
        <h2>Dessin technique de bâtiment</h2>
        <p>{c.drawing.status}. Les documents géométriques de l’Atelier restent calculés depuis son modèle ; les exigences du programme ne remplacent pas les mesures.</p>
        <Table headers={["Livrables à produire"]} rows={c.drawing.deliverables.map((x) => [x])} />
        <Table headers={["Contrôles de cohérence"]} rows={c.drawing.checks.map((x) => [x])} />
      </section>
      <section className="bl-card">
        <h2>Gabarit d’essai dimensionnel</h2>
        {c.fixedGeometry ? (
          <>
            <div className="bl-note">P.118 conserve ses polygones réels. Aucun rectangle n’est généré à la place d’un local ou de la parcelle.</div>
            {openP118 && (
              <button type="button" onClick={openP118}>
                Ouvrir le modèle P.118
              </button>
            )}
          </>
        ) : (
          <>
            <p>
              Outil de test indépendant : le rectangle est une <b>hypothèse de local</b>, non une reconstruction du bâtiment ou de la parcelle. Choisissez un espace et une largeur ; la profondeur
              résulte de la surface.
            </p>
            <div className="bl-controls">
              <label>
                Espace principal
                <select value={room} onChange={(e) => setRoom(Number(e.target.value))}>
                  {rooms.map((r, i) => (
                    <option key={r.id} value={i}>
                      {r.name} · {fmt(r.unitArea)} m²/unité
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Largeur utile hypothétique (m)
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.05}
                  defaultValue={width}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n) || n < 0.5 || n > 100) {
                      setWidthError("Largeur attendue entre 0,50 m et 100 m.");
                      return;
                    }
                    setWidthError(null);
                    setWidth(n);
                  }}
                />
              </label>
            </div>
            {widthError && (
              <p className="bl-note warn" role="alert">
                {widthError}
              </p>
            )}
            <div className="bl-svg" dangerouslySetInnerHTML={{ __html: sketch }} />
            <button type="button" onClick={() => download(`Gabarit_hypothese_${c.id}.svg`, "image/svg+xml", sketch)}>
              Exporter ce gabarit SVG
            </button>
          </>
        )}
      </section>
    </>
  );
}

function HarmonyView({ c, s, onApply }: { c: BuildingCase; s: BuildingScenario; onApply: () => void }) {
  const library = useQuery({ queryKey: ["building-library"], queryFn: api.getBuildingLibrary, staleTime: Infinity });
  const phases: [string, string][] = [
    ["1 · Site", "Qualifier accès, voisins, eau, relief et protections ; aucune lecture négative automatique d’une forme irrégulière."],
    ["2 · Architecture", "Entrée, transitions et secteurs à étudier sur la géométrie réelle ; graphiques directionnels conditionnés aux données."],
    ["3 · Programmation intérieure", c.profile.harmony[1] ?? ""],
    ["4 · Décoration", c.profile.harmony[2] ?? ""],
  ];
  return (
    <>
      <section className="bl-card">
        <h2>Harmonie par étape, adaptée au type</h2>
        {c.profile.harmony.map((x, i) => (
          <div className="bl-note" key={i}>
            <b>{["Site : organiser le terrain", "Programme : organiser les usages", "Conception détaillée : composer les ambiances"][i]}</b>
            <p>{x}</p>
          </div>
        ))}
        <div className="bl-note warn">
          Façade, assise, nord de référence, dates et contexte extérieur restent à documenter. Ba Zhai / Étoiles Volantes ne sont pas prévalidés. Aucune année de naissance fictive n’est créée. Les
          variantes n’autorisent aucun compromis sur la sécurité, l’hygiène ou l’accessibilité.
        </div>
        <h3>Progression des propositions, du site aux ambiances</h3>
        <Table headers={["Phase", "Application"]} rows={phases.map(([a, b]) => [a, b])} />
      </section>
      <section className="bl-card">
        <h2>Répartition reliée au programme</h2>
        <p>
          La variante charge les surfaces par famille depuis les fiches espaces, non un pourcentage arbitraire. Principaux, circulation, technique, sanitaires, accueil, autres supports et parois
          restent distincts.
        </p>
        <Stats spaces={s.spaces} />
        <button type="button" className="primary" onClick={onApply}>
          Utiliser cette variante dans le parcours
        </button>
      </section>
      <section className="bl-card">
        <h2>Adaptation aux 21 étapes · Harmonie intégrée</h2>
        <Table
          headers={["Étape affichée", "Contenu transmis / limite"]}
          rows={(library.data?.steps ?? []).map((st) => [
            <b>
              {String(st.number).padStart(2, "0")} · {st.title}
            </b>,
            st.route,
          ])}
        />
        <p className="bl-small">Les identifiants historiques des étapes sont conservés pour ne pas déplacer les pièces et données enregistrées.</p>
      </section>
    </>
  );
}

function SourcesView({ detail }: { detail: BuildingCaseDetail }) {
  const c = detail.case;
  return (
    <>
      <section className="bl-card bl-links">
        <h2>Références réglementaires</h2>
        <p>
          <b>{c.regulatory.jurisdiction}</b> · {c.regulatory.status}
        </p>
        <Table
          headers={["Référence / éditeur", "Territoire / nature", "Portée vérifiée et reste à instruire"]}
          rows={detail.references.map((r) => [
            <>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.title}
              </a>
              <small>
                {r.publisher} · consultation {r.checked}
              </small>
            </>,
            <>
              {r.jurisdiction}
              <small>{r.kind}</small>
            </>,
            r.scope,
          ])}
        />
        <div className="bl-note warn">
          {c.regulatory.foreignScope} Les liens identifient des textes ou démarches ; aucune certification de l’applicabilité ni revue juridique exhaustive n’est incluse.
        </div>
        <h3>Documents locaux manquants</h3>
        {c.regulatory.localDocuments.map((x, i) => (
          <p key={i}>{x}</p>
        ))}
      </section>
      <section className="bl-card">
        <h2>Hypothèses / scénarios à confirmer</h2>
        <Table
          headers={["ID / thème", "Hypothèse et limite", "Responsable", "Mode de vérification / statut"]}
          rows={c.hypotheses.map((x) => [
            <>
              {x.id}
              <small>{x.topic}</small>
            </>,
            x.value,
            x.owner,
            <>
              {x.check}
              <small>{x.status}</small>
            </>,
          ])}
        />
      </section>
      {c.original && (
        <section className="bl-card">
          <h2>Source V6 conservée intégralement</h2>
          <p>Texte, allocations et anciens scénarios économiques n’ont pas été corrigés ou remplacés dans cette archive. Ils restent distincts des variantes programmatiques nouvelles.</p>
          <details className="bl-fold">
            <summary>Lire le dossier d’origine · {String((c.original as { title?: string }).title ?? "")}</summary>
            <div>
              <pre>{JSON.stringify(c.original, null, 2)}</pre>
            </div>
          </details>
          {Array.isArray((c.original as { sources?: unknown[] }).sources) && (
            <Table
              headers={["Référence d’origine", "Portée"]}
              rows={((c.original as { sources: { url?: string; title: string; scope?: string; jurisdiction?: string }[] }).sources ?? []).map((r) => [
                r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                ),
                <>
                  {r.scope || "Source fournie, à contrôler"}
                  <small>{r.jurisdiction ?? ""}</small>
                </>,
              ])}
            />
          )}
        </section>
      )}
    </>
  );
}

/** Boîte « Utiliser le programme de ce cas » (`showApply` du prototype). */
function ApplyDialog({ detail, s, projectId, projectName, onClose }: { detail: BuildingCaseDetail; s: BuildingScenario; projectId: string | null; projectName: string | null; onClose: () => void }) {
  const c = detail.case;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  const apply = useMutation({
    mutationFn: async (input: { destination: "new" | "current"; name: string; jurisdiction: ApplyProgrammeCaseInput["jurisdiction"]; replaceText: boolean }) => {
      let target = projectId;
      if (input.destination === "new") {
        const created = await api.createProject(`ETUDE-${Date.now().toString(36).toUpperCase()}`, input.name);
        target = created.id;
      }
      if (!target) throw new Error("Aucun projet actif.");
      await api.applyProgrammeCase(target, { caseId: c.id, scenarioId: s.id, jurisdiction: input.jurisdiction, replaceText: input.replaceText });
      return target;
    },
    onSuccess: (target) => {
      void queryClient.invalidateQueries({ queryKey: ["programme", target] });
      void queryClient.invalidateQueries({ queryKey: ["steps", target] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      dialog.current?.close();
      // `H.goto(7)` : le parcours s'ouvre à l'étape 07, le programme relié à Répartition et Harmony.
      navigate(`/projets/${target}?module=parcours&etape=7&programme=applique`);
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : err instanceof Error ? err.message : "Action interrompue."),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const destination = (form.elements.namedItem("destination") as HTMLSelectElement).value as "new" | "current";
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const jurisdiction = (form.elements.namedItem("jurisdiction") as HTMLSelectElement).value as ApplyProgrammeCaseInput["jurisdiction"];
    const replaceText = (form.elements.namedItem("replaceText") as HTMLInputElement).checked;
    if (!name) return;
    apply.mutate({ destination, name, jurisdiction, replaceText });
  }
  return (
    <dialog ref={dialog} className="bl-dialog" onClose={onClose}>
      <form className="bl" onSubmit={submit}>
        <h2>Utiliser le programme de ce cas</h2>
        <p>
          <b translate="no">{c.title}</b>
          <br />
          {s.label} · {fmt(programmeCaseSums(s.spaces).total)} m² de travail
        </p>
        <div className="bl-review-grid">
          <label>
            Destination
            <select name="destination" defaultValue={projectId ? "current" : "new"}>
              <option value="new">Créer une nouvelle étude isolée</option>
              <option value="current" disabled={!projectId}>
                Projet actuel : {projectName ?? "aucun"}
              </option>
            </select>
          </label>
          <label>
            Cadre territorial déclaré
            <select name="jurisdiction" defaultValue="Maroc">
              <option>Maroc</option>
              <option>France</option>
              <option>Suisse</option>
              <option>Autre / à préciser</option>
            </select>
          </label>
          <label>
            Nom de la nouvelle étude
            <input name="name" defaultValue={`${c.title} · ${s.label.charAt(0)}`} maxLength={150} required />
          </label>
        </div>
        <div className="bl-note warn">
          Le programme et Répartition seront remplacés par la variante choisie, avec historique. <b>La parcelle et les objets de l’Atelier restent inchangés.</b> Par défaut, les textes saisis
          manuellement et les observations Harmony sont conservés ; les différences sont signalées.
        </div>
        <label className="bl-check">
          <input name="replaceText" type="checkbox" />
          Remplacer aussi les textes métier déjà renseignés (uniquement pour une réinitialisation volontaire).
        </label>
        {error && (
          <p className="bl-note danger" role="alert">
            Action interrompue : {error}
          </p>
        )}
        <div className="bl-actions" style={{ marginTop: 20 }}>
          <button type="submit" className="primary" disabled={apply.isPending}>
            Appliquer le scénario
          </button>
          <button type="button" onClick={() => dialog.current?.close()}>
            Annuler
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function BuildingCasePage() {
  const { id = "" } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const projectId = params.get("projet");
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId!), enabled: !!projectId });
  const detail = useQuery({ queryKey: ["building-case", id], queryFn: () => api.getBuildingCase(id), staleTime: Infinity, enabled: id !== "" });
  // `openP118()` du prototype : ouvre le dossier source P.118 à l'étape 10 (Atelier) — le projet courant s'il en est issu, sinon la
  // référence de l'exemple du compte, sinon l'exemple est importé d'abord (« Dossier source absent » n'arrive donc pas).
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, enabled: id === "parcours_lot118" });
  const navigate = useNavigate();
  const importP118 = useMutation({
    mutationFn: () => api.importExample("p118-exemple-complet"),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projets/${created.id}?module=parcours&etape=10`, { state: { notice: "Exemple P.118 importé : dossier source ouvert à l’étape 10." } });
    },
  });
  function openP118() {
    const fromCurrent = project.data?.sourceExampleId === "p118-exemple-complet" ? project.data : null;
    // Le dossier source canonique : la première référence importée (comme `SEED888.id`), sinon la plus ancienne copie.
    const candidates = (projects.data ?? []).filter((p) => p.sourceExampleId === "p118-exemple-complet").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const target = fromCurrent ?? candidates.find((p) => p.exampleMode === "reference") ?? candidates[0] ?? null;
    if (target) navigate(`/projets/${target.id}?module=parcours&etape=10`);
    else if (!importP118.isPending) importP118.mutate();
  }
  const tab = params.get("rubrique") ?? "programme";
  const scenarioId = params.get("variante") ?? "base";
  const [applying, setApplying] = useState(false);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  if (detail.isError) {
    return (
      <main className="bl">
        <p role="alert">Cas introuvable.</p>
        <Link className="bl-button" to="/bibliotheque/batiments">
          ← Bibliothèque par types
        </Link>
      </main>
    );
  }
  if (!detail.data) return <p className="loading-notice">Chargement…</p>;
  const c = detail.data.case;
  const s = c.scenarios.find((x) => x.id === scenarioId) ?? c.scenarios[0]!;
  const backTo = projectId ? `/projets/${projectId}?module=parcours` : "/projets";
  return (
    <main className="bl" id="building-library-root">
      <div className="bl-actions bl-screen-only">
        <Link className="bl-button" to={projectId ? `/bibliotheque/batiments?projet=${encodeURIComponent(projectId)}` : "/bibliotheque/batiments"}>
          ← Bibliothèque par types
        </Link>
        <Link className="bl-button" to={backTo}>
          ← {projectId ? "Parcours actif" : "Projets"}
        </Link>
      </div>
      <section className="bl-hero" style={{ marginTop: 16 }}>
        <div>
          <span className="bl-kicker">
            {c.profile.label} → {c.subtype}
          </span>
          <h1 translate="no">{c.title}</h1>
          <p>{c.summary}</p>
          <Tag>{c.sourceKey ? "Source conservée + compléments" : "Cas hypothétique"}</Tag>
          <Tag>Scénarios non validés</Tag>
        </div>
        <div className="bl-actions">
          <button type="button" className="primary" onClick={() => setApplying(true)}>
            Utiliser ce scénario
          </button>
          <button type="button" onClick={() => void caseReportHtml(queryClient, detail.data!, s).then((html) => download(`Programme_${c.id}_${s.id}_V6_1.html`, "text/html;charset=utf-8", html))}>
            Rapport HTML
          </button>
          <button type="button" onClick={() => download(`Programme_${c.id}_${s.id}.csv`, "text/csv;charset=utf-8", programmeCsv(c, s))}>
            Programme CSV
          </button>
          <button
            type="button"
            onClick={() =>
              download(`Fiche_${c.id}_${s.id}.json`, "application/json", JSON.stringify({ schema: "Parcours.BuildingCase", version: detail.data!.version, case: c, selectedScenario: s.id }, null, 2))
            }
          >
            Fiche JSON
          </button>
          {c.id === "parcours_lot118" && (
            <button type="button" disabled={importP118.isPending} onClick={openP118}>
              {importP118.isPending ? "Import de l’exemple…" : "Ouvrir le modèle P.118"}
            </button>
          )}
        </div>
      </section>
      <div className="bl-note warn">
        <b>Statut des valeurs.</b> {c.provenanceNotice} Aucune validation Feng Shui, dimensionnelle ou réglementaire automatique.
      </div>
      <div className="bl-scenario-list">
        {c.scenarios.map((x) => {
          const t = programmeCaseSums(x.spaces);
          return (
            <section className={`bl-scenario${x.id === s.id ? " selected" : ""}`} key={x.id}>
              <b>{x.label}</b>
              <p>
                <strong>{fmt(t.total)} m²</strong> · total de travail
              </p>
              <div className="bl-small">{x.note}</div>
              <button type="button" onClick={() => setParam("variante", x.id)} aria-pressed={x.id === s.id}>
                {x.id === s.id ? "Variante affichée" : "Afficher cette variante"}
              </button>
            </section>
          );
        })}
      </div>
      <nav className="bl-tabs" role="tablist" aria-label="Rubriques du cas">
        {LIBRARY_TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParam("rubrique", key)}>
            {label}
          </button>
        ))}
      </nav>
      <section role="tabpanel">
        {tab === "relations" ? (
          <RelationsView c={c} />
        ) : tab === "technique" ? (
          <TechniqueView c={c} s={s} openP118={c.id === "parcours_lot118" ? openP118 : undefined} />
        ) : tab === "harmony" ? (
          <HarmonyView c={c} s={s} onApply={() => setApplying(true)} />
        ) : tab === "sources" ? (
          <SourcesView detail={detail.data} />
        ) : (
          <ProgrammeView c={c} s={s} surfaceConvention={detail.data.surfaceConvention} />
        )}
      </section>
      {applying && <ApplyDialog detail={detail.data} s={s} projectId={projectId} projectName={project.data?.name ?? null} onClose={() => setApplying(false)} />}
    </main>
  );
}

export function BuildingLibraryPage() {
  const [params] = useSearchParams();
  const projectId = params.get("projet");
  const library = useQuery({ queryKey: ["building-library"], queryFn: api.getBuildingLibrary, staleTime: Infinity });
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const data = library.data;
  const groups = useMemo(() => {
    if (!data) return [];
    const q = foldText(query);
    return data.profiles
      .filter((p) => type === "all" || p.id === type)
      .map((p) => ({ profile: p, cases: data.cases.filter((c) => c.type === p.id && (!q || foldText(`${c.title} ${c.subtype} ${c.users} ${p.tags}`).includes(q))) }))
      .filter((g) => g.cases.length > 0);
  }, [data, query, type]);
  const caseLink = (id: string) => `/bibliotheque/batiments/${encodeURIComponent(id)}${projectId ? `?projet=${encodeURIComponent(projectId)}` : ""}`;
  return (
    <main className="bl" id="building-library-root">
      <section className="bl-hero">
        <div>
          <span className="bl-kicker">PARCOURS V6.1 · PROGRAMMATION & DESSIN</span>
          <h1>Bibliothèque des bâtiments</h1>
          <p>Du type au programme, puis à la conception. Des cas sourcés, des hypothèses identifiées et un même dossier pour Répartition et Harmony.</p>
          <Tag>10 types</Tag>
          <Tag>{data?.cases.length ?? 21} cas</Tag>
          <Tag>63 variantes de programme</Tag>
          <Tag>10 sources conservées</Tag>
        </div>
        <div className="bl-actions">
          <Link className="bl-button" to={projectId ? `/projets/${projectId}?module=parcours` : "/projets"}>
            ← {projectId ? "Parcours" : "Projets"}
          </Link>
          <button type="button" disabled={!data} onClick={() => data && download("Bibliotheque_Batiments_V6_1.json", "application/json", JSON.stringify(data, null, 2))}>
            Exporter la bibliothèque JSON
          </button>
        </div>
      </section>
      <div className="bl-controls">
        <label>
          Rechercher un type, sous-type ou cas
          <input id="bl-search" type="search" value={query} placeholder="Ex. hôtel, consultations, P.118, école…" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Section de type
          <select id="bl-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Tous les types</option>
            {(data?.profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="bl-type-links" aria-label="Types de bâtiment">
        <button type="button" className={type === "all" ? "active" : ""} onClick={() => setType("all")}>
          Tous
        </button>
        {(data?.profiles ?? []).map((p) => (
          <button key={p.id} type="button" className={type === p.id ? "active" : ""} onClick={() => setType(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="bl-note">
        Les programmes n’imposent ni terrain ni implantation. Les dimensions non documentées restent inconnues ; les minima de travail proposés sont clairement distincts des minima réglementaires.
      </div>
      <div id="bl-results">
        {library.isPending && <p className="bl-small">Chargement de la bibliothèque…</p>}
        {data && groups.length === 0 && <div className="bl-empty">Aucun cas correspondant. Modifiez la recherche ou le type.</div>}
        {groups.map(({ profile, cases }) => (
          <details className="bl-type" open key={profile.id} id={`bl-type-${profile.id}`}>
            <summary>
              {profile.label}
              <small>
                {cases.length} cas · {cases.length * 3} variantes
              </small>
            </summary>
            <section className="bl-cards">
              {cases.map((c) => (
                <article className="bl-case-card" key={c.id}>
                  <Tag cls={c.sourceKey ? "source" : "hyp"}>{c.origin}</Tag>
                  <div className="bl-small">{c.subtype}</div>
                  <h3 translate="no">{c.title}</h3>
                  <p>
                    {c.capacity === null ? (
                      "Capacité à définir"
                    ) : (
                      <>
                        <strong>{fmt(c.capacity, 0)}</strong> {c.unit}
                      </>
                    )}
                  </p>
                  <p className="bl-small">
                    {fmt(c.programmeArea)} m² de programme hors parois{c.paroisArea ? ` · ${fmt(c.paroisArea)} m² de parois séparées` : ""}
                    <br />
                    {c.spaceCount} lignes d’espaces · 16 rubriques métier
                  </p>
                  <div className="bl-actions">
                    <Link className="bl-button primary" to={caseLink(c.id)}>
                      Ouvrir le cas
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          </details>
        ))}
      </div>
    </main>
  );
}
