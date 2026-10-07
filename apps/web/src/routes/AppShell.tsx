import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type CurrentUser } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { NotificationBell } from "../components/NotificationBell";
import { Icon, type IconName } from "../components/Icon";
import { ChoixLangue } from "../components/ChoixLangue";

/** Initiales pour l'avatar : du nom affiché s'il est saisi (deux premiers mots), sinon de l'adresse (deux segments, ou deux lettres). */
export function initialsFrom(user: Pick<CurrentUser, "email" | "displayName">): string {
  const name = user.displayName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.length >= 2 ? [words[0]?.[0], words[1]?.[0]] : [name[0], name[1]];
    return letters.filter(Boolean).join("").toUpperCase();
  }
  const local = user.email.split("@")[0] ?? user.email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? [parts[0]?.[0], parts[1]?.[0]] : [local[0], local[1]];
  return letters.filter(Boolean).join("").toUpperCase();
}

/** Le nom montré dans la barre latérale et l'accueil : le nom affiché saisi, sinon ce que la personne a tapé avant le premier chiffre ou séparateur de son adresse (jamais un prénom inventé). */
export function shownName(user: Pick<CurrentUser, "email" | "displayName">): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const local = user.email.split("@")[0] ?? user.email;
  const alpha = local.match(/^[a-zA-Z]+/)?.[0] ?? local;
  return alpha.charAt(0).toUpperCase() + alpha.slice(1);
}

const NAV: { to: string; label: string; icon: IconName; end?: boolean; module?: string }[] = [
  { to: "/accueil", label: "Accueil", icon: "home" },
  { to: "/projets", label: "Mes projets", icon: "folder", end: true },
  { to: "", label: "Parcours", icon: "route", module: "parcours" },
  { to: "", label: "Atelier", icon: "atelier", module: "atelier" },
  { to: "", label: "Documents", icon: "file", module: "documents" },
  { to: "/bibliotheque/batiments", label: "Bibliothèque", icon: "book" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  // La liste des projets est réutilisée telle quelle par AccueilPage et
  // ProjectsPage (même clé de requête "projects") : un seul aller réseau,
  // mis en cache par TanStack Query, pas une resynchronisation séparée ici.
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const mostRecent = [...(projectsQuery.data ?? [])].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

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
            <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
              <path d="M14 2 26 9v10L14 26 2 19V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M14 2v24M2 9l12 7 12-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="app-brand-text">
            <span translate="no">Parcours</span>
            <small>Architecture &amp; projets</small>
          </span>
        </div>

        <nav aria-label="Navigation principale" className="app-nav">
          {NAV.map((item) => (
            <NavLink key={item.label} to={item.module ? moduleLink(item.module) : item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : undefined)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-nav-secondary">
          <NavLink to="/harmonie" className={({ isActive }) => (isActive ? "active" : undefined)}>
            <span className="sparkle" aria-hidden="true">
              <Icon name="sparkle" />
            </span>
            <span>
              Harmonie
              <small>Votre assistant de projet</small>
            </span>
          </NavLink>
          <NavLink to="/parametres" className={({ isActive }) => (isActive ? "active" : undefined)}>
            <Icon name="gear" />
            <span>Paramètres</span>
          </NavLink>
        </div>

        <div className="app-user">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="true" aria-expanded={menuOpen} aria-label={user ? `Compte ${user.email}` : "Compte"}>
            <span className="avatar" aria-hidden="true">
              {user ? initialsFrom(user) : ""}
            </span>
            <span className="app-user-name">
              {user ? shownName(user) : ""}
              <small className="app-user-email">{user?.email}</small>
            </span>
          </button>
          {menuOpen && (
            <div role="menu" className="app-user-menu">
              <button type="button" role="menuitem" onClick={() => navigate("/parametres")}>
                Paramètres du compte
              </button>
              <button type="button" role="menuitem" onClick={() => void logout()}>
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <span className="app-topbar-title">Espace de travail</span>
          <form role="search" onSubmit={onSearchSubmit}>
            <label htmlFor="global-search" className="sr-only">
              Rechercher un projet
            </label>
            <span className="app-search-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input id="global-search" type="search" placeholder="Rechercher un projet, un document…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>
          <div className="app-topbar-right">
            <ChoixLangue />
            <NotificationBell />
            <button type="button" className="avatar app-topbar-avatar" aria-label="Paramètres du compte" onClick={() => navigate("/parametres")}>
              {user ? initialsFrom(user) : ""}
            </button>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
}
