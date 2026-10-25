/**
 * Historique de la variante, de la plus récente à la plus ancienne ; chaque révision s'ouvre en lecture seule. `adresse` :
 * domaine et planche inscrits dans l'adresse (I.4-03), repris par le lien de chaque révision.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { LOCALE } from "../../../lib/i18n";
import { cheminComparaisonStudio, cheminVarianteStudio, type OptionsDomaineVariante } from "../routes-studio";
import { refused } from "./etat-variante";

const SOURCES: Record<string, string> = { "study-initialization": "Création de l’étude", "variant-initialization": "Création de la variante", "variant-derivation": "Dérivation d’une variante", "authenticated-session": "Enregistrement", "agent-mcp": "Proposition d’agent (MCP) confirmée" };

export function RevisionsPanel({ projectId, studyId, variantId, headRevisionId, shownRevisionId, adresse = {} }: { projectId: string; studyId: string; variantId: string; headRevisionId: string; shownRevisionId: string; adresse?: OptionsDomaineVariante }) {
  const { user } = useAuth();
  const revisions = useQuery({ queryKey: ["studio-revisions", projectId, studyId, variantId], queryFn: () => api.studioRevisions(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1 });
  const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };
  return <section className="studio-revisions" aria-labelledby="studio-revisions-titre" data-studio-revisions>
    <h2 id="studio-revisions-titre">Historique des révisions</h2>
    <p className="studio-revisions-sub">De la plus récente à la plus ancienne. Une révision passée s’ouvre en lecture seule.</p>
    {revisions.isPending && <p role="status">Chargement de l’historique…</p>}
    {revisions.isError && <p role="alert">Historique indisponible. <button type="button" onClick={() => void revisions.refetch()}>Réessayer</button></p>}
    {revisions.data?.revisions.length === 0 && <p>Aucune révision.</p>}
    {!!revisions.data?.revisions.length && <ol className="studio-revisions-list">{revisions.data.revisions.map(r => {
      const head = r.id === headRevisionId, shown = r.id === shownRevisionId;
      return <li key={r.id} data-studio-revision={r.id} data-studio-revision-tete={head || undefined} aria-current={shown ? "true" : undefined}>
        <Link to={cheminVarianteStudio(projectId, studyId, variantId, head ? null : r.id, adresse)}><span>Révision</span> <span translate="no" title={r.id}>{r.id.slice(-8)}</span></Link>
        <span translate="no">{date(r.createdAt)}</span>
        {SOURCES[r.source] ? <span>{SOURCES[r.source]}</span> : <span translate="no">{r.source}</span>}
        <span>{user && r.authorId === user.id ? "par vous" : "par un autre membre"}</span>
        {head && <strong className="studio-revision-tag">Version courante</strong>}
        {shown && !head && <strong className="studio-revision-tag">Affichée</strong>}
        {!head && <Link to={cheminComparaisonStudio(projectId, studyId, { variantId, revisionId: r.id }, { variantId, revisionId: null })} data-studio-comparer-tete>Comparer avec la tête</Link>}
      </li>;
    })}</ol>}
  </section>;
}
