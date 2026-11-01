import { COMMANDES_COLLABORATION, type CommandeCollaboration } from "./commandes-collaboration";

/** Icône d'une commande de collaboration (décorative : la commande porte son libellé). */
export function IconeCollaboration({ commande }: { commande: CommandeCollaboration }) {
  return (
    <svg className="collab-icon" data-icone-collaboration={commande} aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {COMMANDES_COLLABORATION[commande].icone.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** Raccourci affiché à côté de la commande (le libellé « Maj » est traduit à l'affichage). */
export function RaccourciCollaboration({ commande }: { commande: CommandeCollaboration }) {
  return <kbd className="collab-raccourci" data-raccourci-collaboration={commande}>{COMMANDES_COLLABORATION[commande].raccourci.libelle}</kbd>;
}
