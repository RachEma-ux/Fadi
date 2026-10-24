import { ICONES_ADMIN, type CommandeAdmin } from "./icones-admin";

/** Icône d'une commande d'administration (décorative : le bouton porte son libellé). */
export function IconeAdmin({ commande }: { commande: CommandeAdmin }) {
  return (
    <svg className="admin-icon" data-icone-admin={commande} aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONES_ADMIN[commande].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
