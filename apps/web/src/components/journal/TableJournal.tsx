/**
 * Tableau d'entrées du journal d'activité (phase 3 bis), partagé par l'administration, « Mon historique » et
 * l'historique de la participation d'un projet. N'affiche que ce que le serveur a projeté pour l'audience : aucune
 * adresse IP hors administration, aucun identifiant opaque. Les identités de compte et les codes techniques sont des
 * données (`translate="no"`) ; les libellés sont traduits à l'affichage. Disposition en cartes sur téléphone
 * (`.admin-table`, `data-label`).
 */
import { Link } from "react-router-dom";
import { LOCALE } from "../../lib/i18n";
import {
  actionLabel, actorLabel, DETAIL_LABEL, detailValue, familyLabel, isAccountData, SUBJECT_LABEL, type JournalEntry,
  type JournalPage,
} from "../../lib/journal-activite";
import "../comptes/comptes.css";

const when = (iso: string) => new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });

function Details({ e }: { e: JournalEntry }) {
  const subjects = Object.entries(e.subjects);
  const details = Object.entries(e.details);
  if (!subjects.length && !details.length) return <>—</>;
  return (
    <ul className="journal-details">
      {subjects.map(([k, a]) => (
        <li key={k}><span>{SUBJECT_LABEL[k] ?? k}</span>{" "}<b translate={isAccountData(a) ? "no" : undefined}>{actorLabel(a)}</b></li>
      ))}
      {details.map(([k, v]) => {
        const d = detailValue(v);
        return <li key={k}><span>{DETAIL_LABEL[k] ?? k}</span>{" "}{d.raw ? <code translate="no">{d.text}</code> : <b>{d.text}</b>}</li>;
      })}
    </ul>
  );
}

export function TableJournal({ pages, label, showProject = false, projectLinks = true, showIp = false, showFamily = true, empty }: {
  pages: readonly JournalPage[];
  label: string;
  showProject?: boolean;
  /** Lien vers le projet ; désactivé pour l'administration, qui n'ouvre jamais un projet (D-2). */
  projectLinks?: boolean;
  showIp?: boolean;
  showFamily?: boolean;
  empty: string;
}) {
  const entries = pages.flatMap((p) => p.entries);
  const projects = Object.assign({}, ...pages.map((p) => p.projects)) as JournalPage["projects"];
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      <table className="admin-table journal-table" data-journal-table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            {showFamily && <th>Famille</th>}
            <th>Acteur</th>
            {showProject && <th>Projet</th>}
            <th>Détails</th>
            {showIp && <th>Adresse IP</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const p = e.projectId ? projects[e.projectId] : undefined;
            return (
              <tr key={e.id} data-journal-entry={e.action} data-journal-actor={e.actor.kind}>
                <td data-label="Date">{when(e.at)}</td>
                <td data-label="Action"><b>{actionLabel(e.action)}</b></td>
                {showFamily && <td data-label="Famille">{familyLabel(e.family)}</td>}
                <td data-label="Acteur" translate={isAccountData(e.actor) ? "no" : undefined}>{actorLabel(e.actor)}</td>
                {showProject && (
                  <td data-label="Projet">
                    {p && e.projectId && !projectLinks ? <span translate="no">{`${p.code} — ${p.name}`}</span> : p && e.projectId ? <Link to={`/projets/${e.projectId}?module=collaboration`} translate="no">{`${p.code} — ${p.name}`}</Link> : "—"}
                  </td>
                )}
                <td data-label="Détails"><Details e={e} /></td>
                {showIp && <td data-label="Adresse IP" translate="no">{e.ip ?? "—"}</td>}
              </tr>
            );
          })}
          {entries.length === 0 && <tr><td colSpan={7} className="h7-muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
