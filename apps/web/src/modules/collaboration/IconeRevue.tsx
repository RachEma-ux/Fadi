import { COMMANDES_REVUE, type CommandeRevue } from "./commandes-revue";

/** Icône d'une commande de revue externe (décorative : la commande porte son libellé). */
export function IconeRevue({ commande }: { commande: CommandeRevue }) {
  return (
    <svg className="collab-icon" data-icone-revue={commande} aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {COMMANDES_REVUE[commande].icone.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** Raccourci affiché à côté de la commande (le libellé « Maj » est traduit à l'affichage). */
export function RaccourciRevue({ commande }: { commande: CommandeRevue }) {
  return <kbd className="collab-raccourci" data-raccourci-revue={commande}>{COMMANDES_REVUE[commande].raccourci.libelle}</kbd>;
}
