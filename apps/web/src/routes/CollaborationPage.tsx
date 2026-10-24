import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useWorkspaceNavigation } from "../lib/workspace-navigation";

/** Workspace entry when no dossier has been consulted. A project is never selected silently. */
export function CollaborationPage() {
  const { openProjects } = useWorkspaceNavigation();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  return <main className="fadi-home"><section className="panel"><h2>Collaborer dans un projet</h2><p>Choisissez le dossier dont vous souhaitez consulter les membres, les conversations, les commentaires et les révisions.</p><button type="button" className="button-primary" onClick={openProjects}>Choisir un projet</button> <Link to="/boite" className="button-secondary" data-lien-boite>Ma boîte</Link>{projects.isPending && <p role="status">Chargement des projets…</p>}{projects.isError && <p role="alert">Impossible de charger vos projets.</p>}<ul className="search-results">{projects.data?.map((project) => <li key={project.id}><Link to={`/projets/${project.id}?module=collaboration`} translate="no">{project.code} — {project.name}</Link></li>)}</ul></section></main>;
}
