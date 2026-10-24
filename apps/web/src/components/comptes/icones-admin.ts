/**
 * Icônes des commandes d'administration des comptes (règle d'or, AGENTS.md : chaque commande livrée a sa propre icône,
 * jamais partagée). Dessins au trait sur la grille 24 × 24, sans texte ; rendus par `IconeAdmin`. Pur : aucun DOM.
 */
export type CommandeAdmin = "corbeille" | "restaurer" | "anonymiser";

export const ICONES_ADMIN: Record<CommandeAdmin, readonly string[]> = {
  // Corbeille (section) : bac à couvercle.
  corbeille: ["M4 7h16", "M10 11v6", "M14 11v6", "M5 7l1 13h12l1-13", "M9 7V4h6v3"],
  // Restaurer : flèche de retour qui ressort du bac.
  restaurer: ["M4 13a8 8 0 1 0 2.4-5.7", "M4 4v5h5", "M12 9v4l3 2"],
  // Anonymiser maintenant : silhouette barrée (identité effacée, irréversible).
  anonymiser: ["M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M5 20a7 7 0 0 1 10.5-6", "M3 3l18 18"],
};
