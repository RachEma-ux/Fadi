/**
 * Registre unique du Sandbox (lot 2 de la recommandation `Studio/Sandbox/Recommandation_Sandbox_Architecture.md`,
 * décisions du maître d'ouvrage du 20 octobre 2026) : les 86 entrées du catalogue de référence — 52 outils, 20 commandes
 * et 14 panneaux — avec, pour chacune, son identifiant, son pictogramme, sa famille, son raccourci, son emplacement par
 * défaut et sa disponibilité. Toute l'interface du Sandbox lit ce registre (barres, grille « ⋯ », « Outils ▾ »,
 * recherche, colonne de droite, barre d'actions, clavier) sans en garder de copie. Pur : ni React, ni DOM.
 *
 * Lot 2 = aucun changement visible : pictogrammes (caractères Unicode, remplacés au lot 3), raccourcis (harmonisés au
 * lot 6) et emplacements (disposition proche de SketchUp au lot 4) sont ceux de l'interface actuelle.
 *
 * Les outils sont dérivés du catalogue relevé (`OUTILS` : famille, emplacement, raccourci SketchUp) : le registre n'en
 * recopie rien et ne leur ajoute que ce que le relevé n'a pas — pictogramme et raccourci de la couche Fadi.
 */
import { OUTILS, type EmplacementOutil, type FamilleOutil } from "./catalogue-outils.js";

export type NatureEntree = "outil" | "commande" | "panneau";
/** Familles des commandes (« Outils ▾ », groupe « Objets ») et des panneaux. */
export type FamilleCommandeSandbox = "objet" | "contexte" | "lien" | "navigateur" | "vue" | "debit" | "piece";
export type FamilleEntree = FamilleOutil | FamilleCommandeSandbox | "panneau";
/**
 * Emplacement par défaut : `barre` barre verticale gauche ; `grille` « ⋯ Plus d'outils » ; `menu-contextuel` clic droit ;
 * `actions` barre d'actions flottante ; `fil-ariane` fil d'Ariane d'un groupe ; `outils` « Outils ▾ » seulement ;
 * `panneau-navigateur`, `panneau-debit` barre du panneau ; `barre-piece` bloc de la pièce ; `colonne` colonne de droite ;
 * `objets-et-vue` sous-liste « Objets et vue » de la colonne. Tous les outils et commandes figurent aussi dans « Outils ▾ ».
 */
export type EmplacementEntree = EmplacementOutil | "actions" | "fil-ariane" | "outils" | "panneau-navigateur" | "panneau-debit" | "barre-piece" | "colonne" | "objets-et-vue";
/** `livree` : l'entrée existe dans l'interface ; `prevue` : déclarée, pas encore offerte (aucune à ce jour). */
export type DisponibiliteEntree = "livree" | "prevue";

export interface EntreeSandbox {
  readonly nature: NatureEntree;
  readonly id: string;
  readonly famille: FamilleEntree;
  /** Pictogramme affiché (lot 2 : caractère Unicode actuel). */
  readonly picto: string;
  /** Raccourci canonique (« Alt+Maj+U ») ; `null` pour un panneau (aucun raccourci à ce stade). */
  readonly raccourci: string | null;
  readonly emplacement: EmplacementEntree;
  readonly disponibilite: DisponibiliteEntree;
  /** Hors des 86 entrées du catalogue (doublon à harmoniser au lot 6). */
  readonly horsCatalogue?: true;
}

/** Pictogrammes des outils (dessins propres à Fadi, cahier-planche §3.6 : choix Fadi). */
const PICTOS_OUTILS: Readonly<Record<string, string>> = {
  selection: "↖",
  lasso: "➰",
  gomme: "⌫",
  ligne: "╱",
  "main-levee": "〰",
  rectangle: "▭",
  "rectangle-pivote": "◇",
  cercle: "◯",
  polygone: "⬡",
  arc: "◠",
  "arc-2-points": "⌒",
  "arc-3-points": "◡",
  secteur: "◔",
  "texte-3d": "A",
  "pousser-tirer": "⇕",
  deplacer: "✥",
  "faire-pivoter": "⟳",
  echelle: "⤢",
  decalage: "⧈",
  "suivez-moi": "↬",
  profile: "▰",
  "profiles-aretes": "⫴",
  onglet: "◸",
  "coupe-profil": "⧄",
  "allonger-piece": "⇿",
  "aligner-face": "⫠",
  epaissir: "▥",
  retourner: "⇋",
  diviser: "÷",
  "enveloppe-exterieure": "⬚",
  union: "∪",
  soustraction: "⊖",
  ajuster: "⊘",
  intersection: "∩",
  scinder: "⫛",
  peinture: "▨",
  "echantillon-matiere": "◉",
  metre: "↔",
  rapporteur: "∡",
  axes: "⊹",
  cotation: "⟷",
  texte: "T",
  "plan-de-coupe": "⊟",
  balise: "⌖",
  orbite: "⟲",
  panoramique: "✣",
  zoom: "⊕",
  "zoom-etendu": "⤧",
  "zoom-fenetre": "⧉",
  "positionner-camera": "◎",
  "regarder-autour": "◐",
  marcher: "⇡",
};

/**
 * Couche de raccourcis Fadi (écart Fadi déclaré, D-198, demande du maître d'ouvrage du 10 octobre 2026 : « chaque
 * élément doit avoir un raccourci »). Les raccourcis du catalogue sont le relevé SketchUp et restent intouchés ; un
 * outil dont le `raccourci` relevé vaut `null` reçoit ici une combinaison qui ne recouvre aucun raccourci relevé, ni
 * une touche de la Planche (G, K, Ctrl…, Maj + -), ni la frappe au champ Mesures (X et x en sont, donc Maj + X est
 * exclu) : **Maj + lettre** pour le dessin, la modification, les solides, la matière, la mesure et l'annotation ;
 * **Alt + Maj + lettre** pour les trois outils de caméra restants et les outils propres à Fadi.
 */
export const RACCOURCIS_FADI_OUTILS: Readonly<Record<string, string>> = {
  arc: "Maj+A",
  balise: "Maj+B",
  cotation: "Maj+C",
  diviser: "Maj+D",
  "enveloppe-exterieure": "Maj+E",
  "suivez-moi": "Maj+F",
  scinder: "Maj+G",
  "arc-3-points": "Maj+H",
  intersection: "Maj+I",
  ajuster: "Maj+J",
  "plan-de-coupe": "Maj+K",
  "main-levee": "Maj+L",
  "echantillon-matiere": "Maj+M",
  secteur: "Maj+N",
  rapporteur: "Maj+O",
  polygone: "Maj+P",
  "rectangle-pivote": "Maj+R",
  soustraction: "Maj+S",
  texte: "Maj+T",
  union: "Maj+U",
  retourner: "Maj+V",
  axes: "Maj+Y",
  "texte-3d": "Maj+Z",
  "positionner-camera": "Alt+Maj+P",
  "regarder-autour": "Alt+Maj+L",
  marcher: "Alt+Maj+M",
  // Chaîne des profilés (lots L12 et L13, D-215, D-216) : outils propres à Fadi.
  profile: "Maj+Q",
  "profiles-aretes": "Alt+Maj+Q",
  onglet: "Alt+Maj+O",
  "coupe-profil": "Alt+Maj+B",
  "allonger-piece": "Alt+Maj+A",
  "aligner-face": "Alt+Maj+F",
  // Lot L21 (D-202) : outil propre à Fadi.
  epaissir: "Alt+Maj+J",
};

const outils: EntreeSandbox[] = OUTILS.map((o) => ({
  nature: "outil",
  id: o.id,
  famille: o.famille,
  picto: PICTOS_OUTILS[o.id] ?? "",
  raccourci: o.raccourci ?? RACCOURCIS_FADI_OUTILS[o.id] ?? null,
  emplacement: o.emplacement,
  disponibilite: "livree",
}));

const c = (id: string, famille: FamilleCommandeSandbox, picto: string, raccourci: string, emplacement: EmplacementEntree, horsCatalogue = false): EntreeSandbox => ({
  nature: "commande",
  id,
  famille,
  picto,
  raccourci,
  emplacement,
  disponibilite: "livree",
  ...(horsCatalogue ? { horsCatalogue: true as const } : {}),
});

/** Commandes : elles agissent sur la sélection sans changer d'outil (groupe « Objets » d'« Outils ▾ »). */
const commandes: EntreeSandbox[] = [
  // Objets (O-1, O-3) : barre d'actions flottante, dans cet ordre.
  c("groupe", "objet", "⊞", "Ctrl+G", "actions"),
  c("composant", "objet", "❖", "G", "actions"),
  c("eclater", "objet", "⊠", "Ctrl+Maj+G", "actions"),
  c("rendre-unique", "objet", "⎘", "Alt+Maj+U", "actions"),
  // Doublon de l'outil Diviser (même nom) : hors des 86 entrées, à harmoniser au lot 6.
  c("diviser", "objet", "⦙", "Alt+Maj+D", "actions", true),
  c("diviser-courbe", "objet", "⌇", "Alt+Maj+C", "actions"),
  // Contexte d'édition (O-2) : fil d'Ariane.
  c("fermer", "contexte", "⤴", "Maj+Échap", "fil-ariane"),
  c("fermer-tout", "contexte", "⤒", "Maj+Origine", "fil-ariane"),
  // Liens d'extrusion (O-2).
  c("detacher-lien", "lien", "⛓", "Alt+Maj+K", "outils"),
  // Navigateur (O-4).
  c("groupe-vide", "navigateur", "⊡", "Alt+Maj+G", "panneau-navigateur"),
  c("deplacer-vers", "navigateur", "⇲", "Alt+Maj+V", "panneau-navigateur"),
  c("renommer", "navigateur", "✎", "F2", "panneau-navigateur"),
  // Vue (O-5).
  c("isoler", "vue", "⦿", "Alt+Maj+I", "actions"),
  c("masquer-reste", "vue", "⬒", "Alt+Maj+R", "outils"),
  // Liste de débit (L14) : barre du panneau Débit.
  c("liste-debit", "debit", "☷", "Alt+Maj+T", "panneau-debit"),
  c("renumeroter", "debit", "№", "Alt+Maj+N", "panneau-debit"),
  c("etiquettes", "debit", "🏷", "Alt+Maj+E", "panneau-debit"),
  c("effacer-etiquettes", "debit", "⌧", "Alt+Maj+W", "panneau-debit"),
  c("exporter-debit", "debit", "⇩", "Alt+Maj+X", "panneau-debit"),
  // Édition d'une pièce (L17) : bloc de la pièce dans l'Info entité.
  c("piece-section", "piece", "⇆", "Alt+Maj+S", "barre-piece"),
  c("piece-rotation", "piece", "⥁", "Alt+Maj+H", "barre-piece"),
];

const p = (id: string, picto: string, emplacement: "colonne" | "objets-et-vue"): EntreeSandbox => ({
  nature: "panneau",
  id,
  famille: "panneau",
  picto,
  raccourci: null,
  emplacement,
  disponibilite: "livree",
});

/** Panneaux, dans l'ordre d'affichage : colonne de droite, puis sous-liste « Objets et vue ». */
const panneaux: EntreeSandbox[] = [
  p("instructeur", "?", "colonne"),
  p("materiaux", "▨", "colonne"),
  p("balises", "⌖", "colonne"),
  p("objets", "▤", "colonne"),
  p("info-entite", "ⓘ", "objets-et-vue"),
  p("composants", "❖", "objets-et-vue"),
  p("styles", "◐", "objets-et-vue"),
  p("ombres", "☀", "objets-et-vue"),
  p("scenes", "🎞", "objets-et-vue"),
  p("affichage", "👁", "objets-et-vue"),
  p("adoucir", "◠", "objets-et-vue"),
  p("info-modele", "⚙", "objets-et-vue"),
  p("navigateur", "☰", "objets-et-vue"),
  p("debit", "☷", "objets-et-vue"),
];

/** Le registre : outils (ordre du catalogue relevé), commandes, panneaux. */
export const REGISTRE_SANDBOX: readonly EntreeSandbox[] = Object.freeze([...outils, ...commandes, ...panneaux]);

/** Ordre de la barre verticale gauche par défaut (cahier-planche §3.2) ; un outil « barre » absent est ajouté à la fin. */
export const BARRE_GAUCHE_SANDBOX: readonly string[] = Object.freeze(["selection", "gomme", "ligne", "rectangle", "pousser-tirer", "deplacer", "faire-pivoter", "echelle", "peinture", "orbite", "panoramique", "metre"]);

/** Entrée du registre par nature et identifiant (`undefined` si absente). */
export function entreeSandbox(nature: NatureEntree, id: string): EntreeSandbox | undefined {
  return REGISTRE_SANDBOX.find((e) => e.nature === nature && e.id === id);
}

function exiger(nature: NatureEntree, id: string): EntreeSandbox {
  const e = entreeSandbox(nature, id);
  if (!e) throw new Error(`Registre du Sandbox : ${nature} « ${id} » absent`);
  return e;
}
/** Entrée d'un outil, d'une commande ou d'un panneau ; une entrée absente est une erreur de programmation. */
export const entreeOutil = (id: string): EntreeSandbox => exiger("outil", id);
export const entreeCommande = (id: string): EntreeSandbox => exiger("commande", id);
export const entreePanneau = (id: string): EntreeSandbox => exiger("panneau", id);

/** Entrées d'une nature, dans l'ordre du registre. */
export const entreesSandbox = (nature: NatureEntree): readonly EntreeSandbox[] => REGISTRE_SANDBOX.filter((e) => e.nature === nature);
