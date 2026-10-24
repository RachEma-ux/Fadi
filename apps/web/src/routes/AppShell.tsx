import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useLastDossier } from "../lib/last-dossier";
import { WorkspaceNavigation } from "../lib/workspace-navigation";
import { Icon } from "../components/Icon";
import { initialsFrom, shownName } from "../lib/user-display";
import { HomeTopbar } from "../modules/accueil/HomeTopbar";
import { denied } from "../modules/accueil/dossier-data";
import { MenuStudio } from "./MenuStudio";
import { useAdminEnabled } from "../lib/use-platform-role";

export { initialsFrom, shownName } from "../lib/user-display";

export function AppShell() {
  const { user, logout } = useAuth();
  const adminEnabled = useAdminEnabled();
  const navigate = useNavigate();
  const location = useLocation();
  const projectMatch = useMatch("/projets/:projectId");
  const cockpitMatch = useMatch("/projets/:projectId/pilotage");
  // Routes Studio (`/studio/projets/:projectId…`) : l'en-tête nomme le projet, comme pour les pages du projet (NAV-006).
  const studioMatch = useMatch("/studio/projets/:projectId/*");
  const projectId = projectMatch?.params.projectId ?? cockpitMatch?.params.projectId ?? studioMatch?.params.projectId;
  const last = useLastDossier(user?.id);
  const [expanded, setExpanded] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 68, top: 126 });
  const projectButton = useRef<HTMLButtonElement>(null);
  const flyout = useRef<HTMLDivElement>(null);
  const focusedProjectItem = useRef<HTMLElement | null>(null);
  const account = useRef<HTMLDivElement>(null);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, staleTime: 30_000 });
  const collaborationActive = location.pathname === "/collaboration" || !!projectId && new URLSearchParams(location.search).get("module") === "collaboration";

  function openProjects() {
    if (window.matchMedia("(max-width: 700px)").matches) setExpanded(false);
    setAccountOpen(false);
    setProjectsOpen(true);
  }
  function closeProjects(restore = true) {
    setProjectsOpen(false);
    focusedProjectItem.current = null;
    if (restore) projectButton.current?.focus();
  }
  useEffect(() => { setProjectsOpen(false); setAccountOpen(false); }, [location.pathname, location.search]);
  useLayoutEffect(() => {
    if (!projectsOpen) return;
    const position = () => {
      const bounds = projectButton.current?.getBoundingClientRect();
      if (bounds) setMenuPosition({ left: bounds.right + 10, top: Math.max(12, Math.min(bounds.top, window.innerHeight - 300)) });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    flyout.current?.querySelector<HTMLElement>('[aria-current="page"], [role="menuitem"]')?.focus();
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [projectsOpen, expanded]);
  useLayoutEffect(() => {
    // A refreshed/revoked list must not leave keyboard focus on a removed link.
    if (projectsOpen && focusedProjectItem.current && !focusedProjectItem.current.isConnected) closeProjects();
  }, [projectsOpen, projects.data, projects.error]);
  useEffect(() => {
    if (!projectsOpen && !accountOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!flyout.current?.contains(target) && !projectButton.current?.contains(target)) setProjectsOpen(false);
      if (!account.current?.contains(target)) setAccountOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [projectsOpen, accountOpen]);
  function menuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "ArrowLeft") { event.preventDefault(); closeProjects(); return; }
    if (event.key === "Tab") { event.preventDefault(); closeProjects(); if (!event.shiftKey) (projectButton.current?.nextElementSibling as HTMLElement | null)?.focus(); return; }
    const items = [...(flyout.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index - 1 + items.length) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
  }
  const collaborationLink = projectId || last?.projectId ? `/projets/${projectId ?? last?.projectId}?module=collaboration` : "/collaboration";
  return <WorkspaceNavigation.Provider value={{ openProjects }}>
    <div className="app-shell fadi-shell" data-sidebar={expanded ? "expanded" : "collapsed"}>
      <a className="fadi-skip" href="#workspace-content">Aller au contenu</a>
      <aside className="app-sidebar" aria-label="Barre latérale">
        <Link to="/accueil" className="app-brand" aria-label="Fadi · Accueil" title="Fadi · Accueil"><Icon name="home" size={28} /><span className="sidebar-label app-brand-text" translate="no">Fadi</span></Link>
        <button type="button" className="sidebar-toggle" aria-expanded={expanded} aria-controls="workspace-navigation" aria-label={expanded ? "Replier la barre latérale" : "Déplier la barre latérale"} title={expanded ? "Replier la barre latérale" : "Déplier la barre latérale"} onClick={() => { setExpanded(!expanded); closeProjects(false); }}>
          <Icon name="chevron-right" size={18} /><span className="sidebar-label">Replier</span>
        </button>
        <nav id="workspace-navigation" aria-label="Navigation principale" className="app-nav">
          <NavLink to="/accueil" className={({ isActive }) => isActive ? "active" : undefined} title="Accueil" aria-label="Accueil"><Icon name="home" /><span className="sidebar-label">Accueil</span></NavLink>
          <button ref={projectButton} type="button" className={`sidebar-projects${location.pathname.startsWith("/projets") && !collaborationActive ? " active" : ""}`} aria-label="Projets" title="Projets" aria-haspopup="menu" aria-expanded={projectsOpen} aria-controls={projectsOpen ? "projects-menu" : undefined} onClick={() => projectsOpen ? closeProjects() : openProjects()} onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); openProjects(); } }}>
            <Icon name="folder" /><span className="sidebar-label">Projets</span><Icon name="chevron-right" size={14} className="sidebar-label" />
          </button>
          <MenuStudio surNavigation={() => { if (window.matchMedia("(max-width: 700px)").matches) setExpanded(false); }} />
          <Link to={collaborationLink} className={collaborationActive ? "active" : undefined} aria-current={collaborationActive ? "page" : undefined} title="Collaboration" aria-label="Collaboration"><Icon name="people" /><span className="sidebar-label">Collaboration</span></Link>
        </nav>
        <div className="app-nav-secondary">
          <NavLink to="/bibliotheque/batiments" title="Bibliothèque" aria-label="Bibliothèque" className={({ isActive }) => isActive ? "active" : undefined}><Icon name="book" /><span className="sidebar-label">Bibliothèque</span></NavLink>
          {/* Espace d'organisation (concept partie 5) : équipe interne, groupes, gabarits ; n'ouvre aucun projet. */}
          <NavLink to="/organisations" title="Organisations" aria-label="Organisations" className={({ isActive }) => isActive ? "active" : undefined} data-nav-organisations><Icon name="organization" /><span className="sidebar-label">Organisations</span></NavLink>
          <NavLink to="/parametres" title="Paramètres" aria-label="Paramètres" className={({ isActive }) => isActive ? "active" : undefined}><Icon name="gear" /><span className="sidebar-label">Paramètres</span></NavLink>
          {/* Entrée visible seulement pour un administrateur, administration activée (FADI_ADMIN_ENABLED) ; la protection reste au serveur (404 sinon). */}
          {adminEnabled && <NavLink to="/admin/utilisateurs" title="Administration" aria-label="Administration" className={({ isActive }) => isActive ? "active" : undefined} data-nav-admin><Icon name="admin" /><span className="sidebar-label">Administration</span></NavLink>}
        </div>
        <div className="app-user" ref={account} onKeyDown={(e) => { if (e.key === "Escape") { setAccountOpen(false); account.current?.querySelector("button")?.focus(); } }}>
          <button type="button" title={user ? shownName(user) : "Compte"} aria-label="Compte" aria-expanded={accountOpen} onClick={() => { if (window.matchMedia("(max-width: 700px)").matches) setExpanded(false); setAccountOpen(!accountOpen); setProjectsOpen(false); }}><span className="avatar" aria-hidden="true">{user ? initialsFrom(user) : ""}</span><span className="sidebar-label app-user-name" translate="no">{user ? shownName(user) : ""}</span></button>
          {accountOpen && <div className="app-user-menu"><button type="button" onClick={() => navigate("/parametres")}>Paramètres du compte</button><button type="button" onClick={() => void logout()}>Se déconnecter</button></div>}
        </div>
      </aside>
      {projectsOpen && <div id="projects-menu" className="projects-flyout" role="menu" aria-label="Projets" ref={flyout} style={{ left: menuPosition.left, top: menuPosition.top, maxWidth: `calc(100vw - ${menuPosition.left + 10}px)`, maxHeight: `calc(100dvh - ${menuPosition.top + 12}px)` }} onKeyDown={menuKeys} onFocusCapture={(event) => { focusedProjectItem.current = event.target.closest<HTMLElement>('[role="menuitem"]'); }}>
        <p className="projects-flyout-title">Choisir un projet</p>
        {projects.isPending && <p role="status">{projects.fetchStatus === "paused" ? "En attente de connexion" : "Chargement des projets…"}</p>}
        {projects.isError && <><p role="alert">Impossible d’actualiser les projets.</p><button role="menuitem" type="button" onClick={() => void projects.refetch()}>Réessayer</button></>}
        {projects.data?.length === 0 && <p>Aucun projet pour l’instant.</p>}
        {!denied(projects.error) && projects.data?.map((p) => <Link key={p.id} role="menuitem" to={`/projets/${p.id}`} aria-current={projectId === p.id ? "page" : undefined} className="project-menu-item"><Icon name="folder" size={18} /><span translate="no"><strong>{p.code}</strong><span>{p.name}</span></span>{projectId === p.id && <Icon name="check" size={18} />}</Link>)}
        <Link role="menuitem" className="projects-flyout-all" to="/projets"><Icon name="plus" size={18} />Tous les projets / Créer un projet</Link>
      </div>}
      <div className="app-main" data-route-studio={studioMatch || location.pathname === "/studio" ? "" : undefined}><HomeTopbar projectId={projectId} /><div id="workspace-content" tabIndex={-1}><Outlet /></div></div>
    </div>
  </WorkspaceNavigation.Provider>;
}
