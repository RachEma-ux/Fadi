/**
 * Programme appliqué depuis la bibliothèque des bâtiments — `currentProgramme()`,
 * `transmission()` et le pli « Bibliothèque d’exemples par type de bâtiment »
 * de building-library-app : la répartition du dossier maître (révision,
 * type → sous-type, variante, territoire), les fiches espaces modifiables
 * (quantité, surface unitaire → ratios recalculés, revues à reprendre),
 * les ratios par famille, la décision à réexaminer, les écarts entre import
 * et textes conservés, l'historique des variantes appliquées.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WriteFieldset } from "../../components/WriteFieldset";
import { fmtLib, type BuildingScenario, type LibrarySpace } from "@parcours/domain-model";
import { api, ApiError, type ProgrammeCaseView, type ProgrammeView as ProgrammeViewData } from "../../lib/api";
import { ProgrammeView } from "../bibliotheque/BuildingLibraryPage";
import "../bibliotheque/building-library.css";

const fmt = fmtLib;

/** Le cas de programme appliqué, complet (jamais le cas en lecture seule d'une pièce jointe). */
export function appliedCase(view: ProgrammeViewData | undefined): (ProgrammeCaseView & { spaces: LibrarySpace[]; caseId: string; scenarioId: string }) | null {
  const c = view?.programmeCase;
  if (!c || c.readOnly || !Array.isArray(c.spaces) || !c.caseId || !c.scenarioId) return null;
  return c as ProgrammeCaseView & { spaces: LibrarySpace[]; caseId: string; scenarioId: string };
}

/** `transmission()` : bloc « Programme lié · … » inséré dans les étapes et à l'étape 10. */
export function ProgrammeTransmission({ projectId, view }: { projectId: string; view: ProgrammeViewData }) {
  const a = appliedCase(view);
  if (!a) return null;
  return (
    <section className="bl-summary-insert programme-transmission">
      <b>Programme lié · {a.title}</b>
      {a.scenarioLabel} · révision {a.revision} · {a.spaces.length} lignes · {fmt(a.sums.programme)} m² hors parois
      <br />
      <span>Objectifs de programme ≠ surfaces dessinées. Aucune modification géométrique automatique.</span>
      <div className="bl-actions">
        <Link className="bl-button" to={`/projets/${projectId}?module=parcours&etape=7`}>
          Répartition / fiches espaces
        </Link>
        <Link className="bl-button" to={`/projets/${projectId}?module=parcours&etape=6`}>
          Harmony
        </Link>
        <Link className="bl-button" to={`/projets/${projectId}?module=programmation&vue=modele`}>
          Comparer au modèle
        </Link>
        <Link className="bl-button" to={`/bibliotheque/batiments?projet=${encodeURIComponent(projectId)}`}>
          Bibliothèque par types
        </Link>
      </div>
    </section>
  );
}

/** Le pli des étapes ≥ 04 (`exampleBlock` de building-library-app) : le programme lié quand il existe, sinon l'entrée de la bibliothèque. */
export function LibraryFold({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  const [open, setOpen] = useState(false);
  if (query.data && appliedCase(query.data)) return <ProgrammeTransmission projectId={projectId} view={query.data} />;
  return (
    <details className="fold-card library-fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Bibliothèque d’exemples par type de bâtiment</summary>
      <div className="fold-card-body">
        <p>21 cas, 16 rubriques par cas et 3 variantes. Programme, Répartition et Harmony reliés ; géométrie conservée.</p>
        <Link className="bl-button" to={`/bibliotheque/batiments?projet=${encodeURIComponent(projectId)}`}>
          Ouvrir la bibliothèque
        </Link>
      </div>
    </details>
  );
}

/** Le pli des étapes 01–03 (h7-app) : la phrase de site du profil Harmonie et le renvoi vers la bibliothèque. */
export function SiteQualitiesFold({ projectId, siteText }: { projectId: string; siteText: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="fold-card library-fold" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Exemples · qualités du site par type de bâtiment</summary>
      <div className="fold-card-body">
        <p>{siteText}</p>
        <Link className="bl-button" to={`/bibliotheque/batiments?projet=${encodeURIComponent(projectId)}`}>
          Explorer la bibliothèque
        </Link>
      </div>
    </details>
  );
}

/** `currentProgramme()` : la répartition du dossier maître quand un cas de programme est appliqué (étapes 06 / 07, module Programmation). */
export function ProgrammeCaseEditor({ projectId, view }: { projectId: string; view: ProgrammeViewData }) {
  const queryClient = useQueryClient();
  const a = appliedCase(view)!;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const libraryCase = useQuery({ queryKey: ["building-case", a.caseId], queryFn: () => api.getBuildingCase(a.caseId), staleTime: Infinity });
  const edit = useMutation({
    mutationFn: ({ spaceId, key, value }: { spaceId: string; key: "quantity" | "unitArea"; value: string }) => api.patchProgrammeSpace(projectId, spaceId, { [key]: value }),
    onSuccess: (next) => {
      setError(null);
      setNotice("Surfaces et Répartition recalculées ; géométrie conservée, revues à reprendre.");
      queryClient.setQueryData(["programme", projectId], next);
      void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
    },
    onError: (err) => setError(err instanceof ApiError && err.serverMessage ? err.serverMessage : "Action interrompue."),
  });
  const c = libraryCase.data?.case;
  if (!c) return <p className="loading-notice">Chargement du programme…</p>;
  const base = c.scenarios.find((x) => x.id === a.scenarioId) ?? c.scenarios[0]!;
  const s: BuildingScenario = { ...base, spaces: a.spaces, label: a.scenarioLabel ?? base.label, note: a.scenarioNote ?? base.note };
  return (
    <section className="bl programme-case-editor" id="bl-programme-current" style={{ padding: 0, maxWidth: "none" }}>
      <section className="bl-card">
        <div className="bl-kicker">RÉPARTITION · DOSSIER MAÎTRE · RÉVISION {a.revision}</div>
        <h2>
          {c.profile.label} → {c.subtype}
        </h2>
        <p>
          {a.scenarioLabel} · territoire déclaré : {a.jurisdiction}
        </p>
        <div className="bl-actions">
          <Link className="bl-button" to={`/bibliotheque/batiments/${encodeURIComponent(c.id)}?projet=${encodeURIComponent(projectId)}`}>
            Changer de cas / variante
          </Link>
          <Link className="bl-button" to={`/projets/${projectId}?module=programmation&vue=modele`}>
            Comparer au modèle dessiné
          </Link>
          <a className="bl-button" href={api.documentUrl(projectId, "programme")} download>
            Exporter le programme CSV
          </a>
          <Link className="bl-button" to={`/projets/${projectId}?module=programmation&vue=hypotheses`}>
            Hypothèses et validation
          </Link>
        </div>
        <p className="bl-small">
          Modifier quantité ou surface ci-dessous actualise les ratios et signale les revues à reprendre. Les textes modifiés manuellement ne sont pas écrasés. Une quantité nulle retire une allocation ; une
          surface nulle ne signifie pas besoin satisfait.
        </p>
        {notice && (
          <p className="bl-note" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="bl-note danger" role="alert">
            Action interrompue : {error}
          </p>
        )}
      </section>
      <WriteFieldset projectId={projectId}>
        <ProgrammeView c={c} s={s} surfaceConvention={libraryCase.data!.surfaceConvention} onEdit={(spaceId, key, value) => edit.mutate({ spaceId, key, value })} />
      </WriteFieldset>
      {a.decisionReview?.required && (
        <section className="bl-card">
          <h2>Décision à réexaminer</h2>
          <p className="bl-note warn">{a.decisionReview.reason}</p>
          {(a.decisionHistoryCount ?? 0) > 0 && <p>{a.decisionHistoryCount} décision(s) antérieure(s) archivée(s) sans perte de texte.</p>}
          <Link className="bl-button" to={`/projets/${projectId}?module=parcours&etape=19`}>
            Ouvrir la décision
          </Link>
        </section>
      )}
      <section className="bl-card">
        <h2>Écarts entre import et textes conservés</h2>
        {a.conflicts && a.conflicts.length ? (
          <>
            <p>{a.conflicts.length} champ(s) déjà saisi(s) conservé(s). Comparez la proposition puis arbitrez dans l’étape concernée.</p>
            <details className="bl-fold">
              <summary>Consulter les différences</summary>
              <div>
                <div className="bl-table-wrap" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>
                        <th>Étape</th>
                        <th>Champ / valeur conservée</th>
                        <th>Proposition de programme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.conflicts.map((x, i) => (
                        <tr key={i}>
                          <td>{String(x.stage).padStart(2, "0")}</td>
                          <td>
                            <b>{x.field}</b>
                            <small>{x.current}</small>
                          </td>
                          <td>{x.proposed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </>
        ) : (
          <p>Aucun conflit de remplissage enregistré.</p>
        )}
      </section>
      <section className="bl-card">
        <h2>Historique des variantes appliquées</h2>
        <div className="bl-table-wrap" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Cas / variante</th>
                <th>Révision</th>
              </tr>
            </thead>
            <tbody>
              {(a.history ?? []).length ? (
                (a.history ?? []).map((x) => (
                  <tr key={x.revision}>
                    <td>{new Date(x.archived).toLocaleString("fr-FR")}</td>
                    <td>
                      {x.title} · {x.scenarioLabel}
                    </td>
                    <td>{x.revision}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>Aucune variante antérieure.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
