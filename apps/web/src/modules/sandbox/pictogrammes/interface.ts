/**
 * Icônes de l'interface du Sandbox qui ne sont pas des entrées du registre (lot 3 : plus aucun caractère Unicode comme
 * icône) : boutons de la barre, bascules, poignées, fermetures, chevrons. Noms Tabler (`@tabler/icons`).
 */
export const ICONES_INTERFACE = {
  rechercher: "search",
  plusOutils: "dots",
  fichier: "menu-2",
  deplier: "chevrons-right",
  replier: "chevrons-left",
  sousMenu: "chevron-right",
  menu: "chevron-down",
  fermer: "x",
  poignee: "grip-vertical",
  reglages: "settings",
  annuler: "arrow-back",
  retablir: "arrow-forward",
  detacher: "picture-in-picture-on",
  rattacher: "picture-in-picture-off",
  coche: "square-check",
  caseVide: "square",
  actions: "dots-vertical",
  cibler: "focus-centered",
  typeGroupe: "folder",
  typeComposant: "puzzle",
  visible: "circle-dot",
  masque: "circle-dashed",
  verrou: "lock",
} as const;

export type IconeInterface = keyof typeof ICONES_INTERFACE;
