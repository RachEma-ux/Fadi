/**
 * Navigation transversale d'un même dossier : Parcours et Cockpit R1–R4.
 * L'onglet de pilotage est un accès à une vraie route, non un huitième
 * module métier. Conserver les boutons de modules existants (et leur contrat
 * clavier/Playwright) ; seul le lien de la feuille de route utilise <Link>.
 */
import { Link } from "react-router-dom";
import { MODULES } from "../modules/module-registry";

export function ProjectModuleNav({
  projectId,
  activeModule,
  onHome,
  onModule,
}: {
  projectId: string;
  activeModule: string;
  onHome: () => void;
  onModule: (id: string) => void;
}) {
  return <nav aria-label="Modules du projet" className="module-nav">
    <button type="button" aria-current={activeModule === "accueil" ? "page" : undefined} onClick={onHome}>Accueil du projet</button>
    <Link className="module-nav-pilotage" to={`/projets/${encodeURIComponent(projectId)}/pilotage`}
      aria-current={activeModule === "pilotage" ? "page" : undefined}>Feuille de route</Link>
    {MODULES.map((module) => <button
      key={module.id}
      type="button"
      aria-current={module.id === activeModule ? "page" : undefined}
      onClick={() => onModule(module.id)}
    >{module.label}</button>)}
  </nav>;
}
