import { NavLink } from "react-router-dom";

/** Navigation de l'administration de la plateforme : utilisateurs, journal d'activité (phase 3 bis). */
export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Pages de l’administration">
      <NavLink to="/admin/utilisateurs" className={({ isActive }) => (isActive ? "active" : undefined)} end>Utilisateurs</NavLink>
      <NavLink to="/admin/journal" className={({ isActive }) => (isActive ? "active" : undefined)} end data-nav-admin-journal>Journal d’activité</NavLink>
    </nav>
  );
}
