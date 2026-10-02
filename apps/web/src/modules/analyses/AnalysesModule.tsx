/**
 * Module Analyses métier — quantités dérivées du modèle courant, contrôles
 * traçables (domaine, source, version, résultat), résultats calculés des
 * étapes, dossier de structure et circulations déclarés, comparaison des
 * variantes de programme. Tout vient du serveur (`GET …/analyses`), calculé
 * à la lecture et tagué de la révision du modèle : l'écran n'estime rien.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CHECK_STATUS_LABELS, type CheckStatus, type TraceableCheck } from "@parcours/domain-model";
import { api, type AnalysesView } from "../../lib/api";

const fmt = (v: number | null | undefined, digits = 2) => (Number.isFinite(v as number) ? (v as number).toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "Non renseigné");
const m2 = (v: number | null | undefined, digits = 2) => (Number.isFinite(v as number) ? `${fmt(v, digits)} m²` : "Non renseigné");
const pad2 = (n: number) => String(n).padStart(2, "0");

const STATUS_ORDER: CheckStatus[] = ["non-conforme", "a-verifier", "non-evalue", "conforme", "sans-objet"];
const STATUS_CHIP: Record<CheckStatus, string> = { conforme: "ok", "non-conforme": "off", "a-verifier": "warn", "non-evalue": "", "sans-objet": "" };
const KIND_LABEL: Record<TraceableCheck["kind"], string> = { donnee: "Donnée", regle: "Règle", etude: "Étude" };
const STATEMENT_LABEL: Record<string, string> = { exigence: "Exigence", hypothese: "Hypothèse", representation: "Représentation", etat: "État" };

function StatusChip({ status }: { status: CheckStatus }) {
  return <span className={`h7-chip ${STATUS_CHIP[status]}`.trim()}>{CHECK_STATUS_LABELS[status]}</span>;
}

function ChecksTable({ projectId, checks }: { projectId: string; checks: TraceableCheck[] }) {
  const sorted = [...checks].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.step - b.step);
  return (
    <div className="table-scroll">
      <table className="programme-table analyses-checks">
        <thead>
          <tr>
            <th>Domaine</th>
            <th>Contrôle</th>
            <th>Résultat</th>
            <th>Constat</th>
            <th>Source · version</th>
            <th>Étape</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} data-check={c.id} data-status={c.status}>
              <td>
                <b>{c.domain}</b>
                <br />
                <small>{KIND_LABEL[c.kind]}</small>
              </td>
              <td>{c.label}</td>
              <td>
                <StatusChip status={c.status} />
                {c.priority && (
                  <>
                    <br />
                    <small>{c.priority}</small>
                  </>
                )}
              </td>
              <td>
                {c.detail}
                {c.refs.length > 0 && (
                  <small>
                    {" "}
                    · {c.refs.length} objet(s) : {c.refs.slice(0, 4).join(", ")}
                    {c.refs.length > 4 ? "…" : ""}
                  </small>
                )}
              </td>
              <td>
                <small>
                  {c.source} · v{c.version}
                </small>
              </td>
              <td>
                <Link to={`/projets/${projectId}?module=parcours&etape=${c.step}`}>{pad2(c.step)}</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysesModule({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["analyses", projectId], queryFn: () => api.getAnalyses(projectId) });
  if (query.isLoading) return <p role="status">Calcul des analyses…</p>;
  if (query.isError || !query.data) return <p role="alert">Impossible de calculer les analyses du projet.</p>;
  const v: AnalysesView = query.data;
  const q = v.quantities;
  const base = `/projets/${projectId}`;
  return (
    <div className="analyses-module">
      <section className="biz-card" aria-labelledby="analyses-title">
        <h2 id="analyses-title">Contrôles traçables</h2>
        <p className="biz-sub">
          Révision du modèle {v.modelRevision} · empreinte {v.nativeHash} · entrées {v.inputHash} · calculé le {new Date(v.computedAt).toLocaleString("fr-FR")} · profil {v.profileLabel}
        </p>
        <p className="analyses-totals">
          {STATUS_ORDER.map((s) => (
            <span key={s} className={`h7-chip ${STATUS_CHIP[s]}`.trim()} data-total={s}>
              {CHECK_STATUS_LABELS[s]} · {v.totals[s]}
            </span>
          ))}
        </p>
        <p className="programme-note">
          Chaque contrôle indique sa règle d'origine et sa version. Une donnée manquante donne « Non évalué », une règle qui ne s'applique pas au dossier « Sans objet » ; aucune valeur réglementaire
          n'est présumée.
        </p>
        <ChecksTable projectId={projectId} checks={v.checks} />
      </section>

      <section className="biz-card" aria-labelledby="analyses-quantities">
        <h2 id="analyses-quantities">Quantités dérivées du modèle</h2>
        <p className="biz-sub">{q.method}</p>
        <div className="biz-kpis" role="group" aria-label="Quantités du bâtiment">
          <div className="biz-kpi">
            <span>Parcelle calculée</span>
            <b>{m2(q.parcel.area)}</b>
            <small>{q.parcel.officialArea !== null ? `${m2(q.parcel.officialArea, 0)} déclarés` : "contenance non déclarée"}</small>
          </div>
          <div className="biz-kpi">
            <span>Emprise dessinée</span>
            <b>{m2(q.parcel.footprint)}</b>
            <small>{q.parcel.inside === null ? "inclusion non évaluée" : q.parcel.inside ? "dans le contour" : "hors contour"}</small>
          </div>
          <div className="biz-kpi">
            <span>Dalles brutes</span>
            <b>{m2(q.building.gross)}</b>
            <small>{q.building.levels} niveau(x)</small>
          </div>
          <div className="biz-kpi">
            <span>Dalles nettes</span>
            <b>{m2(q.building.net)}</b>
            <small>hors vides</small>
          </div>
          <div className="biz-kpi">
            <span>Zones dessinées</span>
            <b>{m2(q.building.roomArea)}</b>
            <small>{q.building.roomCount} zone(s)</small>
          </div>
          <div className="biz-kpi">
            <span>Hauteur du modèle</span>
            <b>{Number.isFinite(q.building.height as number) ? `${fmt(q.building.height)} m` : "Non renseigné"}</b>
            <small>reculs {q.parcel.setbacks.length ? q.parcel.setbacks.map((d) => fmt(d)).join(" / ") + " m" : "non calculés"}</small>
          </div>
        </div>
        {q.levels.length ? (
          <div className="table-scroll">
            <table className="programme-table analyses-levels">
              <thead>
                <tr>
                  <th>Niveau</th>
                  <th>Altitude</th>
                  <th>Hauteur</th>
                  <th>Dalle brute</th>
                  <th>Dalle nette</th>
                  <th>Vides</th>
                  <th>Zones</th>
                  <th>Surface des zones</th>
                  <th>Objets</th>
                </tr>
              </thead>
              <tbody>
                {q.levels.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <b>{l.name}</b>
                    </td>
                    <td>{Number.isFinite(l.elevation as number) ? `${fmt(l.elevation)} m` : "—"}</td>
                    <td>{Number.isFinite(l.height as number) ? `${fmt(l.height)} m` : "—"}</td>
                    <td>{m2(l.gross)}</td>
                    <td>{m2(l.slabNet)}</td>
                    <td>{Number.isFinite(l.voidArea as number) ? m2(l.voidArea) : "—"}</td>
                    <td>{l.rooms}</td>
                    <td>{m2(l.roomArea)}</td>
                    <td>{l.objects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="programme-note">Aucun niveau dessiné : les besoins ne sont pas des surfaces mesurées.</p>
        )}
        {q.programme && (
          <p className="programme-note">
            <b>Programme appliqué :</b> {m2(q.programme.programme)} hors parois ({m2(q.programme.total)} avec parois, support {m2(q.programme.support)}) ; {q.programme.linkedRooms} local(aux) lié(s) :{" "}
            {m2(q.programme.linkedTarget)} de cibles pour {m2(q.programme.linkedDrawn)} dessinés. <Link to={`${base}?module=programmation&vue=modele`}>Programme ↔ modèle dessiné</Link>
          </p>
        )}
      </section>

      <section className="biz-card" aria-labelledby="analyses-results">
        <h2 id="analyses-results">Résultats calculés des étapes</h2>
        <div className="biz-kpis" role="group" aria-label="Résultats des étapes">
          <div className="biz-kpi">
            <span>Investissement (14)</span>
            <b>{v.results.finance ? fmt(v.results.finance.investissement, 0) : "Chiffrage incomplet"}</b>
            <small>{v.results.finance ? `financement ${fmt(v.results.finance.financement, 0)} · solde ${fmt(v.results.finance.solde, 0)}` : "une valeur inconnue n'est pas zéro"}</small>
          </div>
          <div className="biz-kpi">
            <span>Note provisoire (17)</span>
            <b>{v.results.score.average !== null ? `${fmt(v.results.score.average)} / 5` : "Non notée"}</b>
            <small>
              {v.results.score.count}/{v.results.score.of} critères
            </small>
          </div>
          <div className="biz-kpi">
            <span>Décision (19)</span>
            <b>{v.results.decision ?? "Non prise"}</b>
            <small>
              <Link to={`${base}?module=parcours&etape=19`}>ouvrir l'étape</Link>
            </small>
          </div>
        </div>
      </section>

      {v.structure && (
        <section className="biz-card" aria-labelledby="analyses-structure">
          <h2 id="analyses-structure">Structure — exigences et hypothèses enregistrées</h2>
          <p className="biz-sub">{v.structure.source}</p>
          <div className="table-scroll">
            <table className="programme-table analyses-structure">
              <thead>
                <tr>
                  <th>Nature</th>
                  <th>Élément</th>
                  <th>Valeur enregistrée</th>
                </tr>
              </thead>
              <tbody>
                {v.structure.statements.map((s) => (
                  <tr key={s.label} data-kind={s.kind}>
                    <td>
                      <span className={`h7-chip ${s.kind === "hypothese" ? "warn" : s.kind === "exigence" ? "ok" : ""}`.trim()}>{STATEMENT_LABEL[s.kind] ?? s.kind}</span>
                    </td>
                    <td>{s.label}</td>
                    <td>{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {v.circulation && (
        <section className="biz-card" aria-labelledby="analyses-circulation">
          <h2 id="analyses-circulation">Circulations mesurées</h2>
          <p className="biz-sub">{v.circulation.source}</p>
          <div className="table-scroll">
            <table className="programme-table analyses-circulation">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Espace</th>
                  <th>Niveaux</th>
                  <th>Surface</th>
                  <th>Dimension</th>
                  <th>Usage</th>
                </tr>
              </thead>
              <tbody>
                {v.circulation.spaces.map((s, i) => (
                  <tr key={`${s.code}-${s.levels.join("-")}-${i}`}>
                    <td>{s.code}</td>
                    <td>{s.name}</td>
                    <td>{s.levels.join(", ")}</td>
                    <td>{m2(s.area, 3)}</td>
                    <td>{s.dimension}</td>
                    <td>{s.use || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="programme-note">
            {Object.entries(v.circulation.totals)
              .map(([k, n]) => `${k === "aboveGround" ? "Hors sol" : k === "basement" ? "Sous-sol" : k} : ${m2(n, 3)}`)
              .join(" · ")}
            {v.circulation.revision !== null ? ` · révision ${v.circulation.revision}` : ""}
            {v.circulation.note ? ` — ${v.circulation.note}` : ""}
          </p>
        </section>
      )}

      <section className="biz-card" aria-labelledby="analyses-scenarios">
        <h2 id="analyses-scenarios">Variantes de programme</h2>
        {v.scenarios.length ? (
          <div className="table-scroll">
            <table className="programme-table analyses-scenarios">
              <thead>
                <tr>
                  <th>Révision</th>
                  <th>Cas · variante</th>
                  <th>Programme hors parois</th>
                  <th>Total de travail</th>
                  <th>Écart / courante</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {v.scenarios.map((s) => (
                  <tr key={s.revision} className={s.current ? "programme-total" : undefined}>
                    <td>{s.revision}</td>
                    <td>
                      {s.title} · {s.scenarioLabel}
                    </td>
                    <td>{m2(s.sums.programme)}</td>
                    <td>{m2(s.sums.total)}</td>
                    <td>{s.current ? "—" : `${s.deltaProgramme > 0 ? "+" : ""}${fmt(s.deltaProgramme)} m²`}</td>
                    <td>{s.current ? "Courante" : `Archivée le ${new Date(s.archived ?? s.updated).toLocaleDateString("fr-FR")}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="programme-note">
            Aucun cas de programme appliqué. <Link to={`/bibliotheque/batiments?projet=${encodeURIComponent(projectId)}`}>Bibliothèque des bâtiments</Link>
          </p>
        )}
      </section>
    </div>
  );
}
