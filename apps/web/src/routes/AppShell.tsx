import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { NotificationBell } from "../components/NotificationBell";

/** Initiales pour l'avatar, à partir de l'e-mail (pas de nom complet collecté à l'inscription). */
function initialsFrom(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? [parts[0]?.[0], parts[1]?.[0]] : [local[0], local[1]];
  return letters.filter(Boolean).join("").toUpperCase();
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // La liste des projets est réutilisée telle quelle par AccueilPage et
  // ProjectsPage (même clé de requête "projects") : un seul aller réseau,
  // mis en cache par TanStack Query, pas une resynchronisation séparée ici.
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const mostRecent = [...(projectsQuery.data ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];

  function moduleLink(moduleId: string): string {
    return mostRecent ? `/projets/${mostRecent.id}?module=${moduleId}` : "/projets";
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(query.trim() ? `/projets?q=${encodeURIComponent(query.trim())}` : "/projets");
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2 26 9v10L14 26 2 19V9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M14 2v24M2 9l12 7 12-7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="app-brand-text">
            Parcours
            <small>Architecture &amp; projets</small>
          </span>
        </div>

        <nav aria-label="Navigation principale" className="app-nav">
          <NavLink to="/accueil" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Accueil
          </NavLink>
          <NavLink to="/projets" end className={({ isActive }) => (isActive ? "active" : undefined)}>
            Mes projets
          </NavLink>
          <NavLink to={moduleLink("parcours")}>Parcours</NavLink>
          <NavLink to={moduleLink("atelier")}>Atelier</NavLink>
          <NavLink to={moduleLink("documents")}>Documents</NavLink>
        </nav>

        <div className="app-nav-secondary">
          <NavLink to="/harmonie" className={({ isActive }) => (isActive ? "active" : undefined)}>
            <span className="sparkle" aria-hidden="true">
              ✦
            </span>
            Harmonie
            <small>Assistant de projet</small>
          </NavLink>
          <NavLink to="/parametres" className={({ isActive }) => (isActive ? "active" : undefined)}>
            Paramètres
          </NavLink>
        </div>

        <div className="app-user">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="true" aria-expanded={menuOpen}>
            <span className="avatar" aria-hidden="true">
              {user ? initialsFrom(user.email) : ""}
            </span>
            <span className="app-user-email">{user?.email}</span>
          </button>
          {menuOpen && (
            <div role="menu" className="app-user-menu">
              <button type="button" role="menuitem" onClick={() => void logout()}>
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <form role="search" onSubmit={onSearchSubmit}>
            <label htmlFor="global-search" className="sr-only">
              Rechercher un projet
            </label>
            <input
              id="global-search"
              type="search"
              placeholder="Rechercher un projet…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <NotificationBell />
        </header>

        <Outlet />
      </div>
    </div>
  );
}
