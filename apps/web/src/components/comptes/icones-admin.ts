/**
 * Icônes des commandes d'administration des comptes (règle d'or, AGENTS.md : chaque commande livrée a sa propre icône,
 * jamais partagée). Dessins au trait sur la grille 24 × 24, sans texte ; rendus par `IconeAdmin`. Pur : aucun DOM.
 */
export type CommandeAdmin = "corbeille" | "restaurer" | "anonymiser" | "renvoyer" | "copier-lien" | "comptes-test" | "auto-controle";

export const ICONES_ADMIN: Record<CommandeAdmin, readonly string[]> = {
  // Corbeille (section) : bac à couvercle.
  corbeille: ["M4 7h16", "M10 11v6", "M14 11v6", "M5 7l1 13h12l1-13", "M9 7V4h6v3"],
  // Restaurer : flèche de retour qui ressort du bac.
  restaurer: ["M4 13a8 8 0 1 0 2.4-5.7", "M4 4v5h5", "M12 9v4l3 2"],
  // Anonymiser maintenant : silhouette barrée (identité effacée, irréversible).
  anonymiser: ["M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M5 20a7 7 0 0 1 10.5-6", "M3 3l18 18"],
  // Renvoyer une invitation (UM-31) : enveloppe et flèche circulaire (nouveau lien).
  renvoyer: ["M3 6h12v9H3z", "M3 6l6 5 6-5", "M21 12a4 4 0 0 1-4 4h-1", "M18 18l-2-2 2-2"],
  // Copier le lien qui vient d'être émis : deux maillons.
  "copier-lien": ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"],
  // Masquer les comptes de test : fiole de laboratoire.
  "comptes-test": ["M9 3h6", "M10 3v6l-5 10a1 1 0 0 0 .9 1.5h12.2a1 1 0 0 0 .9-1.5L14 9V3", "M7.5 15h9"],
  // Auto-contrôle (OP-6) : silhouette et coche (la même personne produit et approuve).
  "auto-controle": ["M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M3 20a6 6 0 0 1 10-4.5", "M15 17l2.5 2.5L22 15"],
};
