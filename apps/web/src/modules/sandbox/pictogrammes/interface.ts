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
  // Cas 2, lot 1 : pavé numérique de la Cotation au toucher.
  effacerSaisie: "backspace",
  caseVide: "square",
  actions: "dots-vertical",
  cibler: "focus-centered",
  typeGroupe: "folder",
  typeComposant: "puzzle",
  visible: "circle-dot",
  masque: "circle-dashed",
  verrou: "lock",
  // Menu de la Planche (Ouvrir, Enregistrer, Partager, Exporter, Informations…).
  menuOuvrir: "folder-open",
  menuNouvelle: "file-plus",
  menuEnregistrer: "device-floppy",
  menuEnregistrerSous: "copy",
  menuRenommer: "pencil",
  menuSupprimer: "trash",
  menuPartager: "share",
  menuExporter: "file-export",
  menuImporter: "file-import",
  menuInformations: "info-circle",
  menuImage: "photo-down",
  menuExtensions: "puzzle",
  menuRetour: "arrow-left",
  menuHistorique: "history",
  // Barre d'état (pied de page façon SketchUp) : langue et périphérique en icônes, la liste s'ouvre au clic.
  langue: "world",
  peripherique: "mouse",
  // Ordre des entrées d'une barre personnelle (panneau « Personnaliser les outils »).
  monter: "arrow-up",
  descendre: "arrow-down",
} as const;

export type IconeInterface = keyof typeof ICONES_INTERFACE;
