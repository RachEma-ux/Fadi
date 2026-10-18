/** Shared project navigation, always directly below the main project header.
 * Roadmap is a separate route; business modules keep their existing buttons
 * and URL contract. This component also owns the shared project layout CSS.
 */
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { MODULES } from "../modules/module-registry";
import "./project-layout.css";

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
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = nav.current;
    if (!element) return;
    const revealCurrent = () => {
      const current = element.querySelector<HTMLElement>('[aria-current="page"]');
      if (!current || element.scrollWidth <= element.clientWidth) return;
      const item = current.getBoundingClientRect();
      const strip = element.getBoundingClientRect();
      // Scroll the navigation only; scrollIntoView would also move the page.
      if (item.left < strip.left) element.scrollLeft -= strip.left - item.left + 8;
      else if (item.right > strip.right) element.scrollLeft += item.right - strip.right + 8;
    };
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeModule]);

  return <nav ref={nav} aria-label="Modules du projet" className="module-nav">
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
