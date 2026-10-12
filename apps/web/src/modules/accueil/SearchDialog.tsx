import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { MODULES } from "../module-registry";
import { Dialog } from "./Dialog";
import { useOnline, useReachable } from "../../components/SyncIndicator";
import { denied } from "./dossier-data";
import { reachability } from "../../lib/reachability";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function SearchDialog({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const online = useOnline();
  const connected = useReachable() && online;
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, enabled: !projectId });
  const steps = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId!), enabled: !!projectId });
  const documents = useQuery({ queryKey: ["documents", projectId], queryFn: () => api.getDocuments(projectId!), enabled: !!projectId });
  const q = normalize(query.trim());
  const candidates = projectId ? [
    ...MODULES.map((m) => ({ id: m.id, title: m.label, context: "Module du projet", href: `/projets/${projectId}?module=${m.id}` })),
    ...(denied(steps.error) ? [] : steps.data ?? []).map((s) => ({ id: `step-${s.number}`, title: `${String(s.number).padStart(2, "0")} — ${s.title}`, context: "Parcours", href: `/projets/${projectId}?module=parcours&etape=${s.number}` })),
    ...(denied(documents.error) ? [] : documents.data?.documents ?? []).map((d, i) => ({ id: `document-${i}`, title: d.label, context: "Documents", href: `/projets/${projectId}?module=documents` })),
  ] : (denied(projects.error) ? [] : projects.data ?? []).map((p) => ({ id: p.id, title: `${p.code} — ${p.name}`, context: "Projet", href: `/projets/${p.id}` }));
  const results = candidates.filter((item) => normalize(`${item.title} ${item.context}`).includes(q));
  const loading = projectId ? steps.isPending || documents.isPending : projects.isPending;
  const error = projectId ? steps.isError || documents.isError : projects.isError;
  const title = projectId ? "Rechercher dans ce projet" : "Rechercher un projet";
  return <Dialog title={title} onClose={onClose} className="search-dialog"><form role="search" onSubmit={(e) => e.preventDefault()}><label className="sr-only" htmlFor="dossier-search">{title}</label><input id="dossier-search" type="search" autoFocus value={query} placeholder={title} onChange={(e) => setQuery(e.target.value)} /></form>
    {projectId && <p className="resource-note">Recherche dans les titres des étapes, des modules et des documents de ce projet.</p>}
    {loading && <p role="status">{connected ? "Chargement des résultats…" : "En attente de connexion · les résultats déjà lus restent disponibles."}</p>}
    {!connected && <p role="status">Recherche dans les titres déjà lus sur cet appareil. <button type="button" disabled={!online} onClick={() => void reachability.probeNow()}>Vérifier la connexion</button></p>}
    {error && <p role="alert">Certains résultats sont indisponibles. <button type="button" disabled={!connected} onClick={() => { if (projectId) { void steps.refetch(); void documents.refetch(); } else void projects.refetch(); }}>Réessayer</button></p>}
    {!results.length && !loading && !error && <p>Aucun résultat pour cette recherche.</p>}
    <ul className="search-results">{results.map((item) => <li key={item.id}><Link to={item.href} onClick={onClose}><span translate={!projectId ? "no" : undefined}>{item.title}</span><small>{item.context}</small></Link></li>)}</ul>
  </Dialog>;
}
