/**
 * Les deux vues « montées » par building-library-app depuis la répartition
 * du dossier maître :
 *
 * - `modelView()` / `linkRoom()` — « Programme ↔ modèle dessiné » : chaque
 *   ligne du programme appliqué, ses zones liées (par identifiant, jamais
 *   par ressemblance du nom), la surface dessinée, l'écart et une zone à
 *   lier ; une zone ne peut pas être affectée à deux lignes.
 * - `hypothesisView()` — « Registre des hypothèses » : statut, responsable
 *   et preuve / motif de chaque hypothèse du cas ; une confirmation ou un
 *   écart exige responsable et preuve.
 *
 * Les règles s'exécutent côté serveur ; ses refus sont affichés tels quels.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HYPOTHESIS_STATUSES, fmtLib, type BuildingHypothesis } from "@parcours/domain-model";
import { api, ApiError, type ProgrammeModelLinksView } from "../../lib/api";
import { appliedCase } from "./ProgrammeCase";
import "../bibliotheque/building-library.css";

const fmt = fmtLib;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError && err.serverMessage ? err.serverMessage : fallback;
}

/** « Programme ↔ modèle dessiné » (`modelView`). */
export function ProgrammeModelLinksPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const links = useQuery({ queryKey: ["programme-links", projectId], queryFn: () => api.getProgrammeModelLinks(projectId) });
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = (next?: ProgrammeModelLinksView) => {
    if (next) queryClient.setQueryData(["programme-links", projectId], next);
    void queryClient.invalidateQueries({ queryKey: ["programme-links", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["programme", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["steps", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["design-review", projectId] });
  };
  const link = useMutation({
    mutationFn: async ({ spaceId, roomId, remove }: { spaceId: string; roomId: string; remove: boolean }) => {
      if (remove) await api.unlinkProgrammeRoom(projectId, spaceId, roomId);
      else await api.linkProgrammeRoom(projectId, spaceId, roomId);
    },
    onSuccess: () => {
      setNotice(null);
      refresh();
    },
    onError: (err) => setNotice(errorMessage(err, "Liaison refusée.")),
  });
  const base = `/projets/${projectId}`;
  const actions = (
    <div className="bl-actions">
      <Link className="bl-button" to={`${base}?module=parcours&etape=7`}>
        ← Répartition
      </Link>
      <Link className="bl-button" to={`${base}?module=atelier`}>
        Ouvrir l’Atelier
      </Link>
      <Link className="bl-button" to={`${base}?module=parcours&etape=7&harmonie=1`}>
        Ouvrir Harmony
      </Link>
    </div>
  );
  if (links.isLoading) return <p className="loading-notice">Chargement des liaisons…</p>;
  if (!links.data) return <p role="alert">Impossible de charger les liaisons programme ↔ modèle.</p>;
  const v = links.data;
  if (!v.applied) {
    return (
      <section className="bl programme-model-links" style={{ padding: 0, maxWidth: "none" }}>
        {actions}
        <section className="bl-card">
          <h1>Programme ↔ modèle dessiné</h1>
          <p className="bl-note warn">Appliquez d’abord un programme.</p>
        </section>
      </section>
    );
  }
  return (
    <section className="bl programme-model-links" id="bl-model-links" style={{ padding: 0, maxWidth: "none" }}>
      {actions}
      <section className="bl-card">
        <h1>Programme ↔ modèle dessiné</h1>
        <p>Reliez une ligne du programme à une zone dessinée. Une liaison se fait par identifiant, jamais par ressemblance du nom. Les surfaces sont comparées, pas certifiées.</p>
        <div className="bl-note warn">
          Une ligne portant plusieurs exemplaires peut être reliée à plusieurs zones. Une même zone ne peut pas être affectée à deux lignes. Les écarts comprennent les différences de convention et les
          surfaces non encore dessinées.
        </div>
        {v.title && (
          <p className="bl-small">
            {v.title} · {v.scenarioLabel} · révision {v.revision} · {v.roomCount} zones du modèle
          </p>
        )}
        {!v.hasModel || v.roomCount === 0 ? (
          <div className="bl-empty">Aucune zone « room » dans le modèle relié. Dessinez/importez le projet dans l’Atelier ; le programme et Harmony restent utilisables sans géométrie fictive.</div>
        ) : null}
        {notice && (
          <p className="bl-note danger" role="alert">
            {notice}
          </p>
        )}
        <div className="bl-table-wrap">
          <table className="bl-spaces bl-links">
            <thead>
              <tr>
                <th>Ligne programme / cible</th>
                <th>Zones liées / surface dessinée</th>
                <th>Écart (dessiné − cible)</th>
                <th>Lier une zone</th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.space.id} data-space={r.space.id}>
                  <td>
                    <b>{r.space.name}</b>
                    <small>{fmt(r.space.target, 3)} m² programmés</small>
                  </td>
                  <td>
                    {r.linked.length
                      ? r.linked.map((room, i) => (
                          <span key={room.id}>
                            {i > 0 && <br />}
                            {room.levelName} · {room.name}{" "}
                            <button
                              type="button"
                              className="bl-unlink"
                              aria-label="Délier cette zone"
                              disabled={link.isPending}
                              onClick={() => link.mutate({ spaceId: r.space.id, roomId: room.id, remove: true })}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      : "Non lié"}
                    <small>
                      {r.linked.length ? `${fmt(r.drawnArea ?? 0, 3)} m² calculés` : "—"}
                      {r.missing.length ? " · liaison(s) devenue(s) absente(s) du modèle" : ""}
                    </small>
                  </td>
                  <td className="num">{r.delta !== null ? `${fmt(r.delta, 3)} m²` : "Non calculable"}</td>
                  <td>
                    <select
                      aria-label={`Zone à lier à ${r.space.name}`}
                      value=""
                      disabled={link.isPending}
                      onChange={(e) => {
                        if (e.target.value) link.mutate({ spaceId: r.space.id, roomId: e.target.value, remove: false });
                      }}
                    >
                      <option value="">Choisir une zone…</option>
                      {r.options.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.levelName} · {room.name} · {fmt(room.area)} m²
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

const STATUSES: readonly string[] = HYPOTHESIS_STATUSES;

function HypothesisRow({ projectId, h, onError }: { projectId: string; h: BuildingHypothesis; onError: (message: string | null) => void }) {
  const queryClient = useQueryClient();
  const [owner, setOwner] = useState(h.owner ?? "");
  const [proof, setProof] = useState(h.proof ?? "");
  const [status, setStatus] = useState(h.status);
  const edit = useMutation({
    mutationFn: (patch: { status?: string; owner?: string; proof?: string }) => api.patchProgrammeHypothesis(projectId, h.id, patch),
    onSuccess: (next) => {
      onError(null);
      const mine = next.hypotheses.find((x) => x.id === h.id);
      if (mine) setStatus(mine.status);
      void queryClient.invalidateQueries({ queryKey: ["programme", projectId] });
    },
    onError: (err) => {
      // Le prototype remet le statut précédent et affiche le motif.
      setStatus(h.status);
      onError(errorMessage(err, "Modification refusée."));
    },
  });
  const knownStatus = STATUSES.includes(status);
  return (
    <tr data-hypothesis={h.id}>
      <td>
        <b>{h.topic || h.id}</b>
        <p>{h.value}</p>
      </td>
      <td>
        <select
          aria-label={`Statut ${h.id}`}
          value={status}
          disabled={edit.isPending}
          onChange={(e) => {
            setStatus(e.target.value);
            edit.mutate({ status: e.target.value });
          }}
        >
          {!knownStatus && (
            <option value={status} disabled>
              {status} · statut d’origine
            </option>
          )}
          {STATUSES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <input
          aria-label={`Responsable ${h.id}`}
          value={owner}
          maxLength={250}
          disabled={edit.isPending}
          onChange={(e) => setOwner(e.target.value)}
          onBlur={() => owner !== (h.owner ?? "") && edit.mutate({ owner })}
        />
      </td>
      <td>
        {h.check}
        <textarea
          aria-label={`Preuve ou motif ${h.id}`}
          placeholder="Référence de pièce, date, motif…"
          value={proof}
          maxLength={3000}
          disabled={edit.isPending}
          onChange={(e) => setProof(e.target.value)}
          onBlur={() => proof !== (h.proof ?? "") && edit.mutate({ proof })}
        />
      </td>
    </tr>
  );
}

/** « Registre des hypothèses » (`hypothesisView`). */
export function ProgrammeHypothesesPage({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId) });
  const [error, setError] = useState<string | null>(null);
  const base = `/projets/${projectId}`;
  const actions = (
    <div className="bl-actions">
      <Link className="bl-button" to={`${base}?module=parcours&etape=7`}>
        ← Répartition
      </Link>
      <Link className="bl-button" to={`${base}?module=parcours&etape=7&harmonie=1`}>
        Harmony
      </Link>
    </div>
  );
  if (query.isLoading) return <p className="loading-notice">Chargement du programme…</p>;
  const a = query.data ? appliedCase(query.data) : null;
  if (!a) {
    return (
      <section className="bl programme-hypotheses" style={{ padding: 0, maxWidth: "none" }}>
        {actions}
        <section className="bl-card">
          <h1>Registre des hypothèses</h1>
          <p className="bl-note warn">Appliquez d’abord un programme.</p>
        </section>
      </section>
    );
  }
  return (
    <section className="bl programme-hypotheses" id="bl-hypotheses" style={{ padding: 0, maxWidth: "none" }}>
      {actions}
      <section className="bl-card">
        <h1>Registre des hypothèses</h1>
        <p>
          {a.title} · {a.scenarioLabel}
        </p>
        {error && (
          <p className="bl-note danger" role="alert">
            {error}
          </p>
        )}
        <div className="bl-table-wrap">
          <table className="bl-hypotheses">
            <thead>
              <tr>
                <th>Hypothèse</th>
                <th>Statut / responsable</th>
                <th>Vérification à conduire</th>
              </tr>
            </thead>
            <tbody>
              {(a.hypotheses ?? []).map((h) => (
                <HypothesisRow key={`${h.id}-${(h as { updated?: string }).updated ?? ""}`} projectId={projectId} h={h} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="bl-note">Une confirmation exige une preuve ou un motif et un responsable. Elle ne vaut pas validation des contrôles Harmony ou techniques non examinés.</div>
      </section>
    </section>
  );
}
