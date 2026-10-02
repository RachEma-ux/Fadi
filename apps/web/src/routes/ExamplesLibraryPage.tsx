/**
 * Bibliothèque d'exemples (`examplesLibrary()` / `exampleDetail()` du
 * prototype) : les 10 cas issus des trois fichiers sources — 8 programmes
 * complets, 1 démonstration Opportunité et 1 exemple parcellaire Parcours —
 * et la fiche d'un cas (besoin et objectif, programme, flux et exploitation,
 * marché / site / concertation / benchmark, espaces, scénarios, exigences,
 * risques, sources).
 */
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function ExamplesLibraryPage() {
  const navigate = useNavigate();
  const examples = useQuery({ queryKey: ["source-examples", "library"], queryFn: api.listSourceExamples, staleTime: Infinity });
  return (
    <main className="example-library">
      <div className="example-bar">
        <div>
          <h1>Bibliothèque d’exemples</h1>
          <p>10 cas issus des trois fichiers sources : 8 programmes complets, 1 démonstration Opportunité et 1 exemple parcellaire Parcours.</p>
        </div>
        <button type="button" className="button-secondary" onClick={() => navigate(-1)}>
          ← Retour au parcours
        </button>
      </div>
      {examples.isPending && <p className="example-meta">Chargement…</p>}
      <section className="example-grid">
        {(examples.data ?? []).map((e) => (
          <article className="example-card" key={e.key}>
            <div className="example-meta">
              {e.origin} · {e.location}
            </div>
            <h2>{e.title}</h2>
            <p>{e.summary}</p>
            <p>
              <strong>
                {dash(e.capacity)} {e.unit}
              </strong>
            </p>
            <Link className="button-secondary" to={`/bibliotheque/exemples/${encodeURIComponent(e.key)}`}>
              Ouvrir le cas
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}

export function ExampleDetailPage() {
  const { key = "" } = useParams<{ key: string }>();
  const example = useQuery({ queryKey: ["source-example", key], queryFn: () => api.getSourceExample(key), staleTime: Infinity, enabled: key !== "" });
  const e = example.data;
  if (example.isError) {
    return (
      <main className="example-library">
        <p role="alert">Cas introuvable.</p>
        <Link className="button-secondary" to="/bibliotheque/exemples">
          ← Bibliothèque
        </Link>
      </main>
    );
  }
  if (!e) return <p className="example-meta">Chargement…</p>;
  const spaces = e.spaces ?? [];
  const scenarios = e.scenarios ?? [];
  return (
    <main className="example-library">
      <div className="example-bar">
        <div>
          <h1>{e.title}</h1>
          <p>
            {e.origin} · {e.location ?? ""}
          </p>
        </div>
        <Link className="button-secondary" to="/bibliotheque/exemples">
          ← Bibliothèque
        </Link>
      </div>
      <section className="example-detail">
        <p>{e.summary ?? ""}</p>
        <h3>Besoin et objectif</h3>
        <div className="example-pre">{[e.need, e.objective].filter(Boolean).join("\n\n")}</div>
        <h3>Programme</h3>
        <div className="example-pre">{e.programmeNarrative ?? ""}</div>
        <h3>Flux et exploitation</h3>
        <div className="example-pre">{[e.flows, e.operatingModel].filter(Boolean).join("\n\n")}</div>
        <h3>Marché, site, concertation et benchmark</h3>
        <div className="example-pre">{[e.marketStudy, e.siteDiagnostic, e.consultationPlan, e.benchmark].filter(Boolean).join("\n\n")}</div>
        <h3>Espaces</h3>
        <table className="example-table">
          <thead>
            <tr>
              <th>Espace</th>
              <th>Qté</th>
              <th>m² unité</th>
              <th>Capacité</th>
            </tr>
          </thead>
          <tbody>
            {spaces.length ? (
              spaces.map((x, i) => (
                <tr key={i}>
                  <td>{x.name}</td>
                  <td>{x.quantity ?? 1}</td>
                  <td>{dash(x.area)}</td>
                  <td>{x.capacity ?? ""}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Non détaillé dans ce cas.</td>
              </tr>
            )}
          </tbody>
        </table>
        <h3>Scénarios</h3>
        <table className="example-table">
          <thead>
            <tr>
              <th>Scénario</th>
              <th>Option</th>
              <th>m²</th>
              <th>Mois</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.length ? (
              scenarios.map((x, i) => (
                <tr key={i}>
                  <td>{x.name}</td>
                  <td>{x.option ?? ""}</td>
                  <td>{dash(x.areaNumeric)}</td>
                  <td>{dash(x.months)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Non détaillé dans ce cas.</td>
              </tr>
            )}
          </tbody>
        </table>
        <h3>Risques</h3>
        <div className="example-pre">{(e.risks ?? []).map((x) => `${x.name} [${x.level ?? ""}] — ${x.action ?? ""}`).join("\n") || "Non détaillé."}</div>
        <h3>Hypothèses</h3>
        <ul>
          {(e.assumptions ?? []).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
        <h3>Décision / enseignements</h3>
        <div className="example-pre">{e.decisionRationale ?? ""}</div>
        <h3>Sources du cas</h3>
        <ul>
          {(e.sources ?? []).map((x, i) => (
            <li key={i}>
              <strong>{x.id}</strong> — {x.title} — {x.scope ?? ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
