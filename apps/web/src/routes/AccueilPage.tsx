import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { dossierChoiceIsPersisted, useLastDossier } from "../lib/last-dossier";
import { useWorkspaceNavigation } from "../lib/workspace-navigation";
import { COMPLETE_EXAMPLE_ID, IMPORT_PROGRESS_TEXT, useImportExample } from "../lib/use-import-example";
import { ImportProjectButton } from "../modules/projets-sources/ImportProjectButton";
import { DossierDashboard } from "../modules/accueil/DossierDashboard";
import { Icon } from "../components/Icon";

export function AccueilPage() {
  const { user } = useAuth();
  const last = useLastDossier(user?.id);
  const { openProjects } = useWorkspaceNavigation();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const example = useImportExample();
  return <main className="fadi-home" data-home="application">
    <div className="workspace-entry-actions"><button type="button" className="button-secondary" onClick={openProjects}><Icon name="folder" size={18} />Choisir un projet</button><ImportProjectButton className="button-secondary" label={<><Icon name="upload" size={18} />Importer</>} /><Link to="/projets" className="button-primary"><Icon name="plus" size={18} />Nouveau projet</Link></div>
    {last ? <><DossierDashboard key={last.projectId} projectId={last.projectId} applicationHome />{user && !dossierChoiceIsPersisted(user.id) && <p className="dossier-notice" role="status">Votre choix reste disponible dans cet onglet. Le navigateur n’a pas confirmé sa conservation après un rechargement.</p>}</> : <section className="panel dossier-unavailable"><h2>Dernier dossier consulté</h2><p>Aucun dossier consulté pour l’instant. Choisissez un projet pour ouvrir son accueil et le retrouver ici.</p><button className="button-primary" type="button" onClick={openProjects}>Choisir un projet</button>{projects.isPending && <p role="status">{projects.fetchStatus === "paused" ? "En attente de connexion" : "Chargement des projets…"}</p>}{projects.isError && <p role="alert">Impossible de charger vos projets. <button type="button" onClick={() => void projects.refetch()}>Réessayer</button></p>}{projects.data?.length === 0 && <div className="home-empty-state"><h3>Aucun projet pour l’instant</h3><p>Créez votre premier projet, ou importez l’exemple P.118 pour découvrir les 21 étapes, le programme et l’Atelier.</p><button type="button" className="button-secondary" disabled={!!example.importingId} onClick={() => example.start(COMPLETE_EXAMPLE_ID)}>{example.importingId ? "Import en cours…" : "Importer l’exemple P.118 et l’ouvrir"}</button>{example.importingId && <p role="status">{IMPORT_PROGRESS_TEXT}</p>}{example.error && <p role="alert">{example.error.message}</p>}</div>}</section>}
    <section className="workspace-entry" aria-labelledby="workspace-entry-heading"><h2 id="workspace-entry-heading">Votre espace de travail</h2><div><Link className="panel" to="/projets"><Icon name="folder" size={24} /><h3>Projets</h3><p>Créer un dossier ou retrouver vos projets et les projets partagés.</p></Link><Link className="panel" to="/bibliotheque/batiments"><Icon name="book" size={24} /><h3>Bibliothèque</h3><p>Explorer les exemples, les programmes et les références.</p></Link><Link className="panel" to="/harmonie"><Icon name="sparkle" size={24} /><h3>Harmonie</h3><p>Retrouver votre assistant et les repères du Parcours.</p></Link></div></section>
  </main>;
}
