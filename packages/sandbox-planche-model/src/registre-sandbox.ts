/**
 * Registre unique du Sandbox (lot 2 de la recommandation `Studio/Sandbox/Recommandation_Sandbox_Architecture.md`,
 * décisions du maître d'ouvrage du 20 octobre 2026) : les 86 entrées du catalogue de référence — 52 outils, 20 commandes
 * et 14 panneaux — avec, pour chacune, son identifiant, son pictogramme, sa famille, son raccourci, son emplacement par
 * défaut et sa disponibilité. Toute l'interface du Sandbox lit ce registre (barres, grille « ⋯ », « Outils ▾ »,
 * recherche, colonne de droite, barre d'actions, clavier) sans en garder de copie. Pur : ni React, ni DOM.
 *
 * Lot 2 : registre sans changement visible. Lot 3 : chaque entrée porte un **pictogramme** — icône Tabler (MIT, paquet
 * `@tabler/icons` à version figée) ou dessin sur mesure de Fadi dans le style Tabler (12 dessins validés le 20 octobre
 * 2026) —, jamais un caractère ni du texte, avec la **teinte de sa famille**. Lot 4 : **disposition par défaut proche
 * de SketchUp** (profil « Standard ») — seize outils essentiels dans la barre gauche, dans l'ordre de SketchUp, et chaque
 * panneau à un clic dans la colonne de droite, Info modèle en bas ; la sous-liste « Objets et vue » disparaît. Les
 * raccourcis restent ceux de l'interface actuelle (harmonisés au lot 6).
 *
 * Les outils sont dérivés du catalogue relevé (`OUTILS` : famille, emplacement, raccourci SketchUp) : le registre n'en
 * recopie rien et ne leur ajoute que ce que le relevé n'a pas — pictogramme et raccourci de la couche Fadi.
 */
import { OUTILS, type EmplacementOutil, type FamilleOutil } from "./catalogue-outils.js";

export type NatureEntree = "outil" | "commande" | "panneau";
/** Familles des commandes (« Outils ▾ », groupe « Objets ») et des panneaux. */
export type FamilleCommandeSandbox = "objet" | "contexte" | "lien" | "navigateur" | "vue" | "debit" | "piece" | "repere" | "controle" | "dynamique" | "emplacement" | "scripts" | "niveau" | "local" | "numerotation" | "mur" | "plan" | "feuille" | "reserve" | "enveloppe" | "consultation" | "fond" | "reference" | "pdf" | "accrochage" | "dxf" | "travaux" | "balise" | "scene" | "gabarit" | "echange" | "version" | "modelisation";
export type FamilleEntree = FamilleOutil | FamilleCommandeSandbox | "panneau";
/**
 * Emplacement par défaut : `barre` barre verticale gauche ; `grille` « ⋯ Plus d'outils » ; `menu-contextuel` clic droit ;
 * `actions` barre d'actions flottante ; `fil-ariane` fil d'Ariane d'un groupe ; `outils` « Outils ▾ » seulement ;
 * `panneau-navigateur`, `panneau-debit`, `panneau-controle` barre du panneau ; `barre-piece` bloc de la pièce ; `colonne` colonne de droite,
 * un clic par panneau ; `colonne-bas` bas de la colonne (Info modèle, comme le (i) de SketchUp). Tous les outils et
 * commandes figurent aussi dans « Outils ▾ ».
 */
export type EmplacementEntree = EmplacementOutil | "actions" | "fil-ariane" | "outils" | "panneau-navigateur" | "panneau-debit" | "panneau-controle" | "panneau-dynamique" | "panneau-emplacement" | "panneau-scripts" | "panneau-niveaux" | "panneau-locaux" | "panneau-numerotation" | "panneau-plan-vectoriel" | "panneau-feuilles" | "panneau-accrochage" | "panneau-metre" | "panneau-info-entite" | "panneau-reserves" | "panneau-enveloppe" | "panneau-consultations" | "panneau-fonds" | "panneau-references" | "panneau-pdf-recu" | "panneau-feuilles-dxf" | "panneau-statut-travaux" | "panneau-balises" | "panneau-scenes" | "panneau-gabarit" | "panneau-natif-image" | "panneau-versions" | "panneau-comparer" | "panneau-brouillon" | "panneau-fiche-projet" | "panneau-extrusion" | "panneau-composants-agence" | "panneau-soustraire" | "panneau-vues-mesures" | "barre-mur" | "barre-piece" | "colonne" | "colonne-bas" | "barre-reperes";
/** `livree` : l'entrée existe dans l'interface ; `prevue` : déclarée, pas encore offerte (aucune à ce jour). */
export type DisponibiliteEntree = "livree" | "prevue";

/**
 * Teinte d'un pictogramme, d'après la famille (validée le 20 octobre 2026) : Dessin bleu, Modification rouge (solides
 * compris), Mesure ocre (annotation comprise, comme la section « Construction » de la grille), Matériau orange, Caméra
 * vert, Sélection et Objets gris-bleu (toutes les commandes), Info gris (les panneaux).
 */
export type TeintePictogramme = "dessin" | "modification" | "mesure" | "materiau" | "camera" | "objets" | "info";
/** Pictogramme : icône Tabler (`nom` = nom Tabler) ou dessin sur mesure de Fadi (`nom` = fichier sans `.svg`). */
export interface Pictogramme {
  readonly source: "tabler" | "fadi";
  readonly nom: string;
  readonly teinte: TeintePictogramme;
}
/** Clé lisible et comparable d'un pictogramme (« tabler:pointer », « fadi:pousser »), sans la teinte. */
export const clePictogramme = (p: Pick<Pictogramme, "source" | "nom">): string => `${p.source}:${p.nom}`;

const TEINTES: Readonly<Record<string, TeintePictogramme>> = {
  dessin: "dessin",
  modification: "modification",
  solide: "modification",
  mesure: "mesure",
  annotation: "mesure",
  materiau: "materiau",
  camera: "camera",
  selection: "objets",
  panneau: "info",
};
export const teinteDeFamille = (famille: FamilleEntree): TeintePictogramme => TEINTES[famille] ?? "objets";

export interface EntreeSandbox {
  readonly nature: NatureEntree;
  readonly id: string;
  readonly famille: FamilleEntree;
  /** Pictogramme affiché (lot 3) : Tabler ou sur mesure, teinté par famille. */
  readonly pictogramme: Pictogramme;
  /** Raccourci canonique (« Alt+Maj+U ») ; `null` pour un panneau (aucun raccourci à ce stade). */
  readonly raccourci: string | null;
  readonly emplacement: EmplacementEntree;
  readonly disponibilite: DisponibiliteEntree;
  /** Hors des 86 entrées du catalogue : commande ajoutée après le relevé (zoom + / −). */
  readonly horsCatalogue?: true;
}

/**
 * Pictogrammes des outils : nom Tabler, ou `fadi:<fichier>` pour un dessin sur mesure (sans équivalent Tabler :
 * Pousser/Tirer, Décalage, Suivez-moi, Rapporteur ; outils propres à Fadi : Profilé, Onglet, Coupe par profil,
 * Allonger une pièce, Aligner une face, Épaissir). Barre gauche reprise de la planche de comparaison validée.
 */
const PICTOS_OUTILS: Readonly<Record<string, string>> = {
  selection: "pointer",
  lasso: "lasso",
  gomme: "eraser",
  ligne: "pencil",
  "main-levee": "scribble",
  rectangle: "rectangle",
  "rectangle-pivote": "square-rotated",
  cercle: "circle",
  polygone: "hexagon",
  arc: "vector-bezier-arc",
  "arc-2-points": "vector-bezier-2",
  "arc-3-points": "vector-bezier-circle",
  secteur: "chart-pie",
  "texte-3d": "badge-3d",
  profile: "fadi:profile",
  "profiles-aretes": "frame",
  mur: "wall",
  reserve: "pin",
  calage: "target-arrow",
  onglet: "fadi:onglet",
  "coupe-profil": "fadi:coupe-profil",
  "allonger-piece": "fadi:allonger",
  "aligner-face": "fadi:aligner",
  epaissir: "fadi:epaissir",
  interagir: "hand-click",
  "pousser-tirer": "fadi:pousser",
  deplacer: "arrows-move",
  "faire-pivoter": "rotate-3d",
  echelle: "resize",
  decalage: "fadi:decalage",
  "suivez-moi": "fadi:suivez",
  retourner: "flip-vertical",
  diviser: "divide",
  "enveloppe-exterieure": "box",
  intersection: "layers-intersect",
  union: "layers-union",
  soustraction: "layers-subtract",
  ajuster: "layers-difference",
  scinder: "slice",
  peinture: "bucket-droplet",
  "echantillon-matiere": "color-picker",
  metre: "ruler-measure",
  rapporteur: "fadi:rapporteur",
  axes: "axis-x",
  cotation: "dimensions",
  texte: "typography",
  "plan-de-coupe": "square-half",
  balise: "tag",
  orbite: "orbit",
  panoramique: "hand-move",
  zoom: "zoom-in",
  "zoom-etendu": "maximize",
  "zoom-fenetre": "zoom-in-area",
  "positionner-camera": "camera",
  "regarder-autour": "eye",
  marcher: "walk",
};

/**
 * Couche de raccourcis Fadi (écart Fadi déclaré, D-198, demande du maître d'ouvrage du 10 octobre 2026 : « chaque
 * élément doit avoir un raccourci »). Les raccourcis du catalogue sont le relevé SketchUp et restent intouchés ; un
 * outil dont le `raccourci` relevé vaut `null` reçoit ici une combinaison qui ne recouvre aucun raccourci relevé, ni
 * une touche de la Planche (G, K, Ctrl…, Maj + -), ni la frappe au champ Mesures (X et x en sont, donc Maj + X est
 * exclu) : **Maj + lettre** pour le dessin, la modification, les solides, la matière, la mesure et l'annotation ;
 * **Alt + Maj + lettre** pour les trois outils de caméra restants et les outils propres à Fadi ; **Ctrl + Maj + lettre**
 * (hors combinaisons du navigateur) une fois ces lettres épuisées (phase 1, lot 1).
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
  // Lot 6 : Maj+S passe à la recherche (comme SketchUp) ; D comme « différence », libéré par la commande Diviser.
  soustraction: "Alt+Maj+D",
  texte: "Maj+T",
  union: "Maj+U",
  retourner: "Maj+V",
  axes: "Maj+Y",
  // Lot 6 : Maj+Z passe au Zoom étendu (comme SketchUp) ; Texte 3D garde sa lettre, avec Alt.
  "texte-3d": "Alt+Maj+Z",
  "positionner-camera": "Alt+Maj+P",
  "regarder-autour": "Alt+Maj+L",
  marcher: "Alt+Maj+M",
  // Chaîne des profilés (lots L12 et L13, D-215, D-216) : outils propres à Fadi.
  profile: "Maj+Q",
  "profiles-aretes": "Alt+Maj+Q",
  // Cas 4, étape 4 : murs à épaisseur. Maj+W est le Zoom fenêtre, Maj+X commencerait une saisie : M comme « mur ».
  mur: "Ctrl+Maj+M",
  // Cas 4, étape 7b : réserves de chantier. Un outil se tape Maj (+ Alt ou Ctrl) + lettre (la maquette disait
  // Ctrl+Alt+Maj+9, forme refusée aux outils) ; parmi les lettres libres de Ctrl+Maj, V est la seule que le navigateur
  // ne garde pas (A, O, P et Q ouvrent ou ferment une fenêtre du navigateur).
  reserve: "Ctrl+Maj+V",
  // Cas 4, lot C4, étape 1 : calage d'image. Toutes les lettres des outils sont prises ; Ctrl+Alt+Maj+F1 à F12 sont la
  // dernière famille libre du cœur (Ctrl+Alt+lettre reste aux extensions).
  calage: "Ctrl+Alt+Maj+F2",
  onglet: "Alt+Maj+O",
  "coupe-profil": "Alt+Maj+B",
  "allonger-piece": "Alt+Maj+A",
  "aligner-face": "Alt+Maj+F",
  // Lot L21 (D-202) : outil propre à Fadi.
  epaissir: "Alt+Maj+J",
  // Phase 1, lot 1 : outil de l'extension « Composants dynamiques » (Interact de SketchUp n'a pas de raccourci par
  // défaut). Alt+Maj+F1…F12 restent aux extensions ajoutées ; toutes les lettres avec Maj ou Alt+Maj sont prises.
  interagir: "Ctrl+Maj+F",
};

/**
 * Lot 6 (harmonisation, recommandation §5) : raccourcis alignés sur SketchUp, prioritaires sur le relevé. Le relevé
 * garde ce qu'il a observé ; seul le registre, que lisent l'interface et le clavier, en change.
 */
export const RACCOURCIS_HARMONISES: Readonly<Record<string, string>> = {
  "zoom-etendu": "Maj+Z",
};

/** Recherche d'outil (lot 6) : Maj+S, comme SketchUp (relevé : Maj+-). Ce n'est pas une entrée du registre. */
export const RACCOURCI_RECHERCHE = "Maj+S";

/**
 * Combinaisons que le navigateur se réserve (fenêtre, onglet, outils de développement, lecture, plein écran) : aucune
 * entrée du registre ne les prend (lot 6). Ctrl+Maj+E est l'outil réseau de Firefox, F9 son mode lecture.
 */
export const RACCOURCIS_NAVIGATEUR: readonly string[] = Object.freeze([
  "Ctrl+N", "Ctrl+T", "Ctrl+W", "Ctrl+Q", "Ctrl+L", "Ctrl+R", "Ctrl+P", "Ctrl+F", "Ctrl+U", "Ctrl+O",
  "Ctrl+Maj+N", "Ctrl+Maj+T", "Ctrl+Maj+W", "Ctrl+Maj+R", "Ctrl+Maj+I", "Ctrl+Maj+J", "Ctrl+Maj+C", "Ctrl+Maj+E", "Ctrl+Maj+K", "Ctrl+Maj+S", "Ctrl+Maj+Y",
  "F1", "F3", "F5", "F6", "F7", "F9", "F10", "F11", "F12",
]);

/** Pictogramme d'une entrée : « fadi:<fichier> » désigne un dessin sur mesure, tout autre nom une icône Tabler. */
function pictogramme(nom: string, famille: FamilleEntree): Pictogramme {
  const fadi = nom.startsWith("fadi:");
  return { source: fadi ? "fadi" : "tabler", nom: fadi ? nom.slice(5) : nom, teinte: teinteDeFamille(famille) };
}

/**
 * Barre verticale gauche par défaut (lot 4, profil « Standard ») : les outils essentiels dans l'ordre de SketchUp, puis
 * « ⋯ » ; tout autre outil est dans la grille (ou au clic droit, comme Diviser).
 */
export const BARRE_GAUCHE_SANDBOX: readonly string[] = Object.freeze([
  "selection", "gomme", "ligne", "arc", "rectangle", "pousser-tirer", "decalage", "deplacer", "faire-pivoter", "echelle",
  "metre", "peinture", "orbite", "panoramique", "zoom", "zoom-etendu",
]);

/** Emplacement par défaut d'un outil : la barre gauche s'il y figure, sinon la grille (le clic droit reste le clic droit). */
function emplacementOutil(id: string, releve: EmplacementOutil): EmplacementOutil {
  if (BARRE_GAUCHE_SANDBOX.includes(id)) return "barre";
  return releve === "barre" ? "grille" : releve;
}

/** Outils d'une extension : hors du catalogue de base (comme les commandes et panneaux des extensions). */
const OUTILS_HORS_CATALOGUE: ReadonlySet<string> = new Set(["interagir"]);

const outils: EntreeSandbox[] = OUTILS.map((o) => ({
  nature: "outil",
  id: o.id,
  famille: o.famille,
  pictogramme: pictogramme(PICTOS_OUTILS[o.id] ?? "", o.famille),
  raccourci: RACCOURCIS_HARMONISES[o.id] ?? o.raccourci ?? RACCOURCIS_FADI_OUTILS[o.id] ?? null,
  emplacement: emplacementOutil(o.id, o.emplacement),
  disponibilite: "livree",
  ...(OUTILS_HORS_CATALOGUE.has(o.id) ? { horsCatalogue: true as const } : {}),
}));

const c = (id: string, famille: FamilleCommandeSandbox, picto: string, raccourci: string, emplacement: EmplacementEntree, horsCatalogue = false): EntreeSandbox => ({
  nature: "commande",
  id,
  famille,
  pictogramme: pictogramme(picto, famille),
  raccourci,
  emplacement,
  disponibilite: "livree",
  ...(horsCatalogue ? { horsCatalogue: true as const } : {}),
});

/** Commandes : elles agissent sur la sélection sans changer d'outil (groupe « Objets » d'« Outils ▾ »). */
const commandes: EntreeSandbox[] = [
  // Objets (O-1, O-3) : barre d'actions flottante, dans cet ordre.
  c("groupe", "objet", "brackets-contain", "Ctrl+G", "actions"),
  c("composant", "objet", "components", "G", "actions"),
  c("eclater", "objet", "fadi:eclater", "Ctrl+Maj+G", "actions"),
  c("rendre-unique", "objet", "fingerprint", "Alt+Maj+U", "actions"),
  // Lot 6 : la commande Diviser, doublon de l'outil Diviser, a disparu ; la barre d'actions et le clic droit lancent
  // l'outil (Maj+D), qui prend l'arête sélectionnée et demande le nombre de segments, comme SketchUp.
  c("diviser-courbe", "objet", "line-dashed", "Alt+Maj+C", "actions"),
  // Contexte d'édition (O-2) : fil d'Ariane.
  c("fermer", "contexte", "arrow-back-up", "Maj+Échap", "fil-ariane"),
  c("fermer-tout", "contexte", "arrow-bar-to-up", "Maj+Origine", "fil-ariane"),
  // Liens d'extrusion (O-2).
  c("detacher-lien", "lien", "unlink", "Alt+Maj+K", "outils"),
  // Navigateur (O-4).
  c("groupe-vide", "navigateur", "folder-plus", "Alt+Maj+G", "panneau-navigateur"),
  c("deplacer-vers", "navigateur", "folder-symlink", "Alt+Maj+V", "panneau-navigateur"),
  c("renommer", "navigateur", "cursor-text", "F2", "panneau-navigateur"),
  // Vue (O-5).
  c("isoler", "vue", "focus-2", "Alt+Maj+I", "actions"),
  c("masquer-reste", "vue", "eye-off", "Alt+Maj+R", "outils"),
  // Zoom avant / arrière par pas (lot 4) : barre d'actions flottante au toucher, clavier partout ; hors des 86 entrées.
  // Lot 6 : F8, touche libre que ni Chrome ni Firefox ne se réservent (Alt+Maj+Z passe au Texte 3D).
  c("zoom-plus", "vue", "plus", "F8", "actions", true),
  c("zoom-moins", "vue", "minus", "Alt+Maj+Y", "actions", true),
  // Liste de débit (L14) : barre du panneau Débit.
  c("liste-debit", "debit", "fadi:debit", "Alt+Maj+T", "panneau-debit"),
  c("renumeroter", "debit", "list-numbers", "Alt+Maj+N", "panneau-debit"),
  c("etiquettes", "debit", "tags", "Alt+Maj+E", "panneau-debit"),
  c("effacer-etiquettes", "debit", "tag-off", "Alt+Maj+W", "panneau-debit"),
  c("exporter-debit", "debit", "file-export", "Alt+Maj+X", "panneau-debit"),
  // Édition d'une pièce (L17) : bloc de la pièce dans l'Info entité.
  c("piece-section", "piece", "arrows-left-right", "Alt+Maj+S", "barre-piece"),
  c("piece-rotation", "piece", "rotate", "Alt+Maj+H", "barre-piece"),
  // Chantier Axes (AX-2, décision AX-D6) : barre « Axes et repères », hors des 86 entrées du catalogue. Toutes les
  // combinaisons Alt + Maj + lettre étant prises, Alt + Maj + chiffre (touche physique) et F4 ; Placer reste l'outil
  // Axes (Maj + Y). Dessins sur mesure dans le style Tabler (trièdre étiqueté par ses flèches).
  c("choisir-repere", "repere", "fadi:repere-actif", "Alt+Maj+1", "barre-reperes", true),
  c("aligner-repere", "repere", "fadi:repere-aligner", "Alt+Maj+2", "barre-reperes", true),
  c("pivoter-repere", "repere", "fadi:repere-pivoter", "Alt+Maj+3", "barre-reperes", true),
  c("plan-de-travail", "repere", "fadi:plan-travail", "Alt+Maj+4", "barre-reperes", true),
  c("verrouiller-plan", "repere", "fadi:plan-verrou", "Alt+Maj+5", "barre-reperes", true),
  c("vue-normale-plan", "repere", "fadi:vue-normale", "Alt+Maj+6", "barre-reperes", true),
  c("repere-precedent", "repere", "fadi:repere-precedent", "Alt+Maj+7", "barre-reperes", true),
  c("repere-modele", "repere", "fadi:repere-modele", "Alt+Maj+8", "barre-reperes", true),
  c("affichage-axes", "repere", "fadi:axes-affichage", "F4", "barre-reperes", true),
  // AX-3 : repères enregistrés (le gestionnaire est le panneau « Repères », même pictogramme, partage déclaré).
  c("enregistrer-repere", "repere", "fadi:repere-enregistrer", "Alt+Maj+9", "barre-reperes", true),
  c("gerer-reperes", "repere", "fadi:reperes-liste", "Alt+Maj+0", "barre-reperes", true),
  // AX-4 : origine et axes d'un composant (édition d'objet, menu contextuel « Changer les axes »).
  c("origine-composant", "repere", "fadi:origine-composant", "Maj+F4", "barre-reperes", true),
  // Extension « Contrôle et nettoyage » (25 novembre 2026) : barre de son panneau, hors des 86 entrées du catalogue.
  c("controler", "controle", "stethoscope", "Maj+F8", "panneau-controle", true),
  c("nettoyer", "controle", "sparkles", "Maj+F2", "panneau-controle", true),
  // Cas 2 du catalogue, lot 3 (27 novembre 2026) : parcours et correction des défauts, fond DAO, volumes, pièces du permis.
  // Ctrl+Maj+F2 à F6 et F12 étaient libres (F7 à F11 sont pris par les paquets d'essai d'extensions).
  c("defaut-precedent", "controle", "player-track-prev", "Ctrl+Maj+F2", "panneau-controle", true),
  c("defaut-suivant", "controle", "player-track-next", "Ctrl+Maj+F3", "panneau-controle", true),
  c("corriger-defaut", "controle", "tool", "Ctrl+Maj+F4", "panneau-controle", true),
  c("preparer-fond-dao", "controle", "vector-triangle", "Ctrl+Maj+F5", "panneau-controle", true),
  c("fusionner-volumes", "controle", "box-multiple", "Ctrl+Maj+F6", "panneau-controle", true),
  c("pieces-permis", "controle", "file-certificate", "Ctrl+Maj+F12", "panneau-controle", true),
  // Extension « Composants dynamiques » (25 novembre 2026) : barre de son panneau, hors des 86 entrées du catalogue.
  c("composant-dynamique", "dynamique", "math-function", "Maj+F7", "panneau-dynamique", true),
  c("redessiner-composant", "dynamique", "refresh", "Maj+F11", "panneau-dynamique", true),
  // Extension « Emplacement » (25 novembre 2026) : barre de son panneau, hors des 86 entrées du catalogue.
  c("emplacement", "emplacement", "map-pin", "Maj+F1", "panneau-emplacement", true),
  c("nord-arete", "emplacement", "compass", "Maj+F9", "panneau-emplacement", true),
  c("afficher-nord", "emplacement", "navigation-north", "Maj+F12", "panneau-emplacement", true),
  c("point-de-base", "emplacement", "current-location", "Ctrl+Maj+B", "panneau-emplacement", true),
  // Extension « Scripts » (25 novembre 2026) : barre de son panneau, hors des 86 entrées du catalogue.
  c("scripts", "scripts", "code", "Maj+F3", "panneau-scripts", true),
  c("executer-script", "scripts", "player-play", "Maj+F6", "panneau-scripts", true),
  // Cas 2 du catalogue, lot 1 (27 novembre 2026) : numérotation en série, barre de son panneau, hors des 86 entrées.
  c("numerotation", "numerotation", "numbers", "Alt+F6", "panneau-numerotation", true),
  c("numeroter-serie", "numerotation", "sort-ascending-numbers", "Alt+F7", "panneau-numerotation", true),
  // Niveaux d'étage (cas 4 du catalogue, étape 1, 27 novembre 2026) : barre du panneau « Niveaux », hors des 86 entrées
  // du catalogue. Combinaisons libres : Ctrl + Maj + L et Ctrl + Maj + X (aucune n'est réservée par le navigateur),
  // Maj + F5 et Maj + F10 (dernières Maj + F libres).
  c("niveaux", "niveau", "stack-2", "Ctrl+Maj+L", "panneau-niveaux", true),
  c("ajouter-niveau", "niveau", "stack-push", "Maj+F5", "panneau-niveaux", true),
  c("travailler-niveau", "niveau", "stack-front", "Maj+F10", "panneau-niveaux", true),
  c("rattacher-niveau", "niveau", "layers-linked", "Ctrl+Maj+X", "panneau-niveaux", true),
  c("supprimer-niveau", "niveau", "stack-pop", "Ctrl+F2", "panneau-niveaux", true),
  c("locaux", "local", "layout-board-split", "Ctrl+Maj+U", "panneau-locaux", true),
  c("creer-local", "local", "square-plus", "Ctrl+Maj+D", "panneau-locaux", true),
  c("supprimer-local", "local", "square-minus", "Ctrl+F3", "panneau-locaux", true),
  // Murs à épaisseur (cas 4, étape 4) : depuis la barre d'options de l'outil Mur.
  c("murs-depuis-aretes", "mur", "border-outer", "Ctrl+Maj+H", "barre-mur", true),
  // Plan vectoriel (cas 4, étape 5) : projection 2D, export SVG, motifs de hachure ; fonction du noyau.
  c("plan-vectoriel", "plan", "background", "Ctrl+F7", "panneau-plan-vectoriel", true),
  c("exporter-plan-svg", "plan", "file-vector", "Ctrl+F8", "panneau-plan-vectoriel", true),
  c("rafraichir-plan", "plan", "reload", "Ctrl+F1", "panneau-plan-vectoriel", true),
  c("motifs-hachure", "plan", "texture", "Ctrl+F9", "panneau-plan-vectoriel", true),
  c("nouveau-motif", "plan", "row-insert-bottom", "Ctrl+F10", "panneau-plan-vectoriel", true),
  c("importer-motif", "plan", "file-import", "Ctrl+F11", "panneau-plan-vectoriel", true),
  c("supprimer-motif", "plan", "row-remove", "Ctrl+F12", "panneau-plan-vectoriel", true),
  // Feuilles (cas 4, étape 6) : feuilles ISO, fenêtres de vue, PDF vectoriel ; ouvert depuis le panneau Plan vectoriel.
  c("feuilles", "feuille", "files", "Ctrl+Alt+Maj+1", "panneau-plan-vectoriel", true),
  c("nouvelle-feuille", "feuille", "file-plus", "Ctrl+Alt+Maj+2", "panneau-feuilles", true),
  c("supprimer-feuille", "feuille", "file-minus", "Ctrl+Alt+Maj+3", "panneau-feuilles", true),
  c("ajouter-fenetre", "feuille", "browser-plus", "Ctrl+Alt+Maj+4", "panneau-feuilles", true),
  c("supprimer-fenetre", "feuille", "browser-x", "Ctrl+Alt+Maj+5", "panneau-feuilles", true),
  c("exporter-feuille-pdf", "feuille", "file-type-pdf", "Ctrl+Alt+Maj+6", "panneau-feuilles", true),
  c("exporter-jeu-pdf", "feuille", "file-stack", "Ctrl+Alt+Maj+7", "panneau-feuilles", true),
  // Réserves de chantier (cas 4, étape 7b) : panneau hors colonne (Outils ▾ et raccourci), outil Réserve (Ctrl+Maj+V).
  c("reserves", "reserve", "clipboard-list", "Ctrl+Alt+Maj+8", "outils", true),
  c("lever-reserve", "reserve", "circle-check", "Ctrl+Alt+1", "panneau-reserves", true),
  c("supprimer-reserve", "reserve", "trash-x", "Ctrl+Alt+2", "panneau-reserves", true),
  // Contrôle de l'enveloppe (cas 4, étape 7c) : panneau hors colonne (Outils ▾ et raccourci), désigner l'enveloppe,
  // basculer le contrôle, ajouter / supprimer une règle de hauteur (seuils saisis avec leur source).
  c("enveloppe", "enveloppe", "home-shield", "Ctrl+Alt+Maj+0", "outils", true),
  c("definir-enveloppe", "enveloppe", "square-check", "Ctrl+Alt+3", "panneau-enveloppe", true),
  c("controler-enveloppe", "enveloppe", "shield-check", "Ctrl+Alt+4", "panneau-enveloppe", true),
  c("ajouter-regle-hauteur", "enveloppe", "playlist-add", "Ctrl+Alt+5", "panneau-enveloppe", true),
  c("supprimer-regle-hauteur", "enveloppe", "playlist-x", "Ctrl+Alt+6", "panneau-enveloppe", true),
  // Liens de consultation (cas 4, étape 7d) : copie figée en lecture seule, ouvrable sans compte ; panneau ouvert par
  // Fichier ▸ Partager un lien, Outils ▾ et son raccourci ; créer, copier et révoquer un lien.
  c("partager-lien", "consultation", "link", "Ctrl+Alt+7", "outils", true),
  c("creer-lien", "consultation", "link-plus", "Ctrl+Alt+Maj+9", "panneau-consultations", true),
  c("copier-lien", "consultation", "copy", "Ctrl+Alt+9", "panneau-consultations", true),
  c("revoquer-lien", "consultation", "link-off", "Ctrl+Alt+8", "panneau-consultations", true),
  // Fonds calés (cas 4, lot C4, étape 1) : panneau hors colonne (Fichier ▸ Importer un fond, Outils ▾ et raccourci),
  // outil Calage (Ctrl+Alt+Maj+F2) ; Ctrl+Alt+Maj+F1 à F12, dernière famille libre du cœur.
  c("fonds", "fond", "photo", "Ctrl+Alt+Maj+F1", "outils", true),
  c("importer-fond", "fond", "photo-plus", "Ctrl+Alt+Maj+F3", "panneau-fonds", true),
  c("caler-fond", "fond", "ruler-measure-2", "Ctrl+Alt+Maj+F4", "panneau-fonds", true),
  c("verrouiller-fond", "fond", "lock-square", "Ctrl+Alt+Maj+F5", "panneau-fonds", true),
  c("supprimer-point-calage", "fond", "point-off", "Ctrl+Alt+Maj+F6", "panneau-fonds", true),
  c("supprimer-fond", "fond", "photo-x", "Ctrl+Alt+Maj+F7", "panneau-fonds", true),
  // Lot C4, étape 2 : fiche de calage du projet et orthophoto posée d'après son fichier de calage d'image (F8 à F12 ;
  // Ctrl+Alt+Maj+F est alors épuisée ; Alt+F6 à F12 et Ctrl+Maj+F1 à F12 sont pris ou réservés : Alt+F3 pour Ignorer,
  // Alt+F2 pour Poser ; certains bureaux Linux gardent Alt+F2, la commande reste dans le panneau et la liste Outils).
  c("exporter-fiche", "fond", "file-description", "Ctrl+Alt+Maj+F8", "panneau-fonds", true),
  c("importer-fiche", "fond", "file-search", "Ctrl+Alt+Maj+F9", "panneau-fonds", true),
  c("importer-orthophoto", "fond", "map-2", "Ctrl+Alt+Maj+F10", "panneau-fonds", true),
  c("exporter-calage-fond", "fond", "grid-scan", "Ctrl+Alt+Maj+F11", "panneau-fonds", true),
  c("appliquer-fiche", "fond", "file-check", "Ctrl+Alt+Maj+F12", "panneau-fonds", true),
  c("ignorer-fiche", "fond", "file-x", "Alt+F3", "panneau-fonds", true),
  c("poser-orthophoto", "fond", "map-check", "Alt+F2", "panneau-fonds", true),
  // Lot C4, étape 3 : références verrouillées et contrôle de récolement ; raccourcis en deux temps (décision du maître
  // d'ouvrage du 27 novembre 2026 : Ctrl+Maj+Espace, puis une touche).
  c("references", "reference", "box-model-2", "Ctrl+Maj+Espace, R", "outils", true),
  c("charger-reference", "reference", "file-3d", "Ctrl+Maj+Espace, C", "panneau-references", true),
  c("recharger-reference", "reference", "refresh-dot", "Ctrl+Maj+Espace, Maj+C", "panneau-references", true),
  c("verrouiller-reference", "reference", "lock-cog", "Ctrl+Maj+Espace, L", "panneau-references", true),
  c("afficher-reference", "reference", "eye-table", "Ctrl+Maj+Espace, M", "panneau-references", true),
  c("controler-recolement", "reference", "radar-2", "Ctrl+Maj+Espace, K", "panneau-references", true),
  c("supprimer-reference", "reference", "box-off", "Ctrl+Maj+Espace, S", "panneau-references", true),
  // Lot C4, étape 4 : PDF reçu (page vectorielle en arêtes, échelle proposée puis confirmée, page scannée en fond).
  c("pdf-recu", "pdf", "file-arrow-right", "Ctrl+Maj+Espace, P", "outils", true),
  c("ouvrir-pdf", "pdf", "file-upload", "Ctrl+Maj+Espace, Maj+P", "panneau-pdf-recu", true),
  c("mesurer-pdf", "pdf", "ruler", "Ctrl+Maj+Espace, E", "panneau-pdf-recu", true),
  c("barre-echelle-pdf", "pdf", "arrows-horizontal", "Ctrl+Maj+Espace, B", "panneau-pdf-recu", true),
  c("confirmer-echelle-pdf", "pdf", "checks", "Ctrl+Maj+Espace, Maj+E", "panneau-pdf-recu", true),
  c("inserer-pdf", "pdf", "arrow-autofit-content", "Ctrl+Maj+Espace, I", "panneau-pdf-recu", true),
  c("poser-fond-pdf", "pdf", "photo-scan", "Ctrl+Maj+Espace, F", "panneau-pdf-recu", true),
  // Lot C4, étape 5 : feuilles en DXF (un fichier par feuille, calques normalisés) et statut des travaux (SIA 400).
  c("feuilles-dxf", "dxf", "vector", "Ctrl+Maj+Espace, D", "outils", true),
  c("exporter-dxf", "dxf", "file-download", "Ctrl+Maj+Espace, Maj+D", "panneau-feuilles-dxf", true),
  c("statut-travaux", "travaux", "home-cog", "Ctrl+Maj+Espace, T", "outils", true),
  c("statut-existant", "travaux", "home-check", "Ctrl+Maj+Espace, X", "panneau-statut-travaux", true),
  c("statut-a-demolir", "travaux", "home-x", "Ctrl+Maj+Espace, A", "panneau-statut-travaux", true),
  c("statut-projete", "travaux", "home-plus", "Ctrl+Maj+Espace, J", "panneau-statut-travaux", true),
  // Cas 2 du catalogue, lot 2 (27 novembre 2026) : accrochage et saisie, hors des 86 entrées. Panneaux contextuels
  // (« Accrochage », « Mètre · Mesure ») ouverts par leur commande : la colonne garde ses dix-sept panneaux. Alt + 1 à 6
  // forcent un seul genre d'accrochage pour le prochain point (n° 111) ; Alt + F8 à F12 étaient libres.
  c("accrochage", "accrochage", "magnet", "Alt+F8", "panneau-accrochage", true),
  c("forcer-sommet", "accrochage", "point", "Alt+1", "panneau-accrochage", true),
  c("forcer-milieu", "accrochage", "circle-half", "Alt+2", "panneau-accrochage", true),
  c("forcer-intersection", "accrochage", "crosshair", "Alt+3", "panneau-accrochage", true),
  c("forcer-quadrant", "accrochage", "circle-dot", "Alt+4", "panneau-accrochage", true),
  c("forcer-axe", "accrochage", "separator-vertical", "Alt+5", "panneau-accrochage", true),
  c("forcer-guide", "accrochage", "ruler-2", "Alt+6", "panneau-accrochage", true),
  c("metre-mesure", "accrochage", "ruler-3", "Alt+F9", "panneau-metre", true),
  c("guide-reseau", "accrochage", "layout-distribute-horizontal", "Alt+F10", "panneau-metre", true),
  c("repartir", "accrochage", "spacing-horizontal", "Alt+F11", "panneau-metre", true),
  c("remettre-echelle", "accrochage", "scale", "Alt+F12", "panneau-info-entite", true),
  // Cas 2 du catalogue, lot 4 (27 novembre 2026) : balises, scènes, plans de coupe et gabarit d'agence, hors des 86 entrées.
  // Ctrl + Alt + Maj + F1 à F12 étaient libres (Ctrl + Alt + lettre reste aux extensions et à AltGr des claviers suisses).
  c("verrouiller-balise", "balise", "lock", "Ctrl+Maj+1", "panneau-balises", true),
  c("balises-phase", "balise", "versions", "Ctrl+Maj+2", "panneau-balises", true),
  c("classer-selection", "balise", "tag-starred", "Ctrl+Maj+3", "panneau-balises", true),
  c("vue-etat", "balise", "eye-check", "Ctrl+Maj+4", "panneau-balises", true),
  c("scenes-types", "scene", "template", "Ctrl+Maj+5", "panneau-scenes", true),
  c("avancer-coupe", "scene", "chevrons-up", "Ctrl+Maj+6", "panneau-info-entite", true),
  c("reculer-coupe", "scene", "chevrons-down", "Ctrl+Maj+7", "panneau-info-entite", true),
  c("scene-face-coupe", "scene", "camera-plus", "Ctrl+Maj+8", "panneau-info-entite", true),
  c("gabarit", "gabarit", "file-settings", "Ctrl+Maj+9", "panneau-gabarit", true),
  c("importer-gabarit", "gabarit", "file-arrow-left", "Ctrl+Maj+0", "panneau-gabarit", true),
  c("enregistrer-gabarit", "gabarit", "file-pencil", "Alt+7", "panneau-gabarit", true),
  c("creer-planche-gabarit", "gabarit", "file-star", "Alt+8", "panneau-gabarit", true),
  // Cas 2 du catalogue, lot 6 (27 novembre 2026) : Planche complète au format natif (empreinte) et image de la vue ;
  // Alt + F1 était la dernière touche simple libre (les suivantes passent aux raccourcis en deux temps).
  c("natif-image", "echange", "file-database", "Alt+F1", "panneau-natif-image", true),
  // Cas 2 du catalogue, lot 7 (27 novembre 2026) : versions, jalons et brouillon ; raccourcis en deux temps
  // (Ctrl+Maj+Espace puis une touche), secondes touches accordées avec le cas 4 le 27 novembre.
  c("versions", "version", "history", "Ctrl+Maj+Espace, V", "panneau-versions", true),
  c("poser-jalon", "version", "flag", "Ctrl+Maj+Espace, Maj+J", "panneau-versions", true),
  c("consultation", "version", "lock-access", "Ctrl+Maj+Espace, G", "panneau-versions", true),
  c("comparer", "version", "git-compare", "Ctrl+Maj+Espace, Q", "panneau-comparer", true),
  c("brouillon", "version", "git-branch", "Ctrl+Maj+Espace, Maj+V", "panneau-brouillon", true),
  c("fiche-projet", "version", "id-badge-2", "Ctrl+Maj+Espace, Maj+F", "panneau-fiche-projet", true),
  // Brouillon ouvert (revue de #514, règle d'or) : appliquer, garder comme variante, abandonner.
  c("appliquer-brouillon", "version", "git-merge", "Ctrl+Maj+Espace, Maj+A", "panneau-brouillon", true),
  c("garder-brouillon", "version", "git-fork", "Ctrl+Maj+Espace, Maj+G", "panneau-brouillon", true),
  c("abandonner-brouillon", "version", "git-branch-deleted", "Ctrl+Maj+Espace, Maj+Z", "panneau-brouillon", true),
  // Cas 2 du catalogue, lot 8 (27 novembre 2026) : outils de modélisation et composants ; secondes touches en chiffres
  // (maquettes lot8-1 à lot8-4 acceptées), Maj+5 et Maj+6 pour les deux commandes ajoutées à la mise en œuvre.
  c("extrusion-hauteur", "modelisation", "arrow-autofit-height", "Ctrl+Maj+Espace, 1", "panneau-extrusion", true),
  c("creer-couches", "modelisation", "stack-3", "Ctrl+Maj+Espace, 2", "panneau-extrusion", true),
  c("prolonger-arete", "modelisation", "arrow-bar-to-right", "Ctrl+Maj+Espace, 3", "panneau-extrusion", true),
  c("composants-agence", "modelisation", "window", "Ctrl+Maj+Espace, 4", "panneau-composants-agence", true),
  c("ajuster-baie", "modelisation", "aspect-ratio", "Ctrl+Maj+Espace, 5", "panneau-composants-agence", true),
  c("remplacer-occurrences", "modelisation", "replace", "Ctrl+Maj+Espace, 6", "panneau-composants-agence", true),
  c("soustraire-garder", "modelisation", "cut", "Ctrl+Maj+Espace, 7", "panneau-soustraire", true),
  c("caler-deux-points", "modelisation", "vector-spline", "Ctrl+Maj+Espace, 8", "panneau-soustraire", true),
  c("selection-altitudes", "modelisation", "arrows-vertical", "Ctrl+Maj+Espace, 9", "panneau-soustraire", true),
  c("selection-boite", "modelisation", "box-margin", "Ctrl+Maj+Espace, Maj+9", "panneau-soustraire", true),
  c("miroir-lisible", "modelisation", "flip-horizontal", "Ctrl+Maj+Espace, 0", "panneau-soustraire", true),
  c("ecreter-enveloppe", "modelisation", "crop", "Ctrl+Maj+Espace, Maj+0", "panneau-soustraire", true),
  c("vue-ortho", "modelisation", "perspective-off", "Ctrl+Maj+Espace, Maj+1", "panneau-vues-mesures", true),
  c("eclater-axonometrie", "modelisation", "arrows-split", "Ctrl+Maj+Espace, Maj+2", "panneau-vues-mesures", true),
  c("echelle-graphique", "modelisation", "tallymarks", "Ctrl+Maj+Espace, Maj+3", "panneau-vues-mesures", true),
  c("aire-projetee", "modelisation", "chart-area", "Ctrl+Maj+Espace, Maj+4", "panneau-vues-mesures", true),
];

const p = (id: string, picto: string, emplacement: "colonne" | "colonne-bas" | "panneau-plan-vectoriel" | "outils", horsCatalogue = false): EntreeSandbox => ({
  nature: "panneau",
  id,
  famille: "panneau",
  pictogramme: pictogramme(picto, "panneau"),
  raccourci: null,
  emplacement,
  disponibilite: "livree",
  ...(horsCatalogue ? { horsCatalogue: true as const } : {}),
});

/**
 * Panneaux, dans l'ordre de la colonne de droite : chacun à un clic (lot 4, comme le plateau de SketchUp), Info modèle
 * en bas. La sous-liste « Objets et vue », qui demandait deux clics, a disparu.
 */
const panneaux: EntreeSandbox[] = [
  p("instructeur", "help", "colonne"),
  p("info-entite", "list-details", "colonne"),
  p("materiaux", "bucket-droplet", "colonne"),
  p("composants", "packages", "colonne"),
  p("styles", "palette", "colonne"),
  p("balises", "tag", "colonne"),
  p("scenes", "movie", "colonne"),
  p("ombres", "sun", "colonne"),
  p("affichage", "adjustments", "colonne"),
  p("adoucir", "blur", "colonne"),
  p("navigateur", "list-tree", "colonne"),
  p("debit", "fadi:debit", "colonne"),
  // Chantier Axes (AX-3) : gestionnaire des repères enregistrés, hors des 86 entrées du catalogue.
  p("reperes", "fadi:reperes-liste", "colonne", true),
  // Extension « Contrôle et nettoyage » : relevé de la Planche, hors des 86 entrées du catalogue.
  p("controle", "stethoscope", "colonne", true),
  // Extension « Composants dynamiques » : options et attributs du composant sélectionné.
  p("dynamique", "math-function", "colonne", true),
  // Extension « Emplacement » : position saisie de la Planche et nord vrai.
  p("emplacement", "map-pin", "colonne", true),
  // Niveaux d'étage (cas 4, étape 1) : niveaux nommés, altitude NGF, niveau de travail ; fonction du noyau, pas une extension.
  p("niveaux", "stack-2", "colonne", true),
  // Locaux (cas 4, étape 3) : pièces appuyées sur une face de sol, mesures calculées ; fonction du noyau.
  p("locaux", "layout-board-split", "colonne", true),
  // Plan vectoriel (cas 4, étape 5) : dessin 2D de la vue, coupe pochée, motifs de hachure ; fonction du noyau.
  p("plan-vectoriel", "background", "colonne", true),
  // Feuilles (cas 4, étape 6) : hors de la colonne (pleine), ouvert depuis Plan vectoriel, Outils ▾ et son raccourci.
  p("feuilles", "files", "panneau-plan-vectoriel", true),
  // Réserves (cas 4, étape 7b) : hors de la colonne (pleine), ouvert par Outils ▾, son raccourci et l'outil Réserve.
  p("reserves", "clipboard-list", "outils", true),
  // Enveloppe (cas 4, étape 7c) : hors de la colonne (pleine), ouvert par Outils ▾ et son raccourci.
  p("enveloppe", "home-shield", "outils", true),
  // Liens de consultation (cas 4, étape 7d) : hors de la colonne (pleine).
  p("consultations", "link", "outils", true),
  // Fonds calés (cas 4, lot C4, étape 1) : hors de la colonne (pleine).
  p("fonds", "photo", "outils", true),
  // Références verrouillées (cas 4, lot C4, étape 3) : hors de la colonne (pleine).
  p("references", "box-model-2", "outils", true),
  // PDF reçu (cas 4, lot C4, étape 4) : hors de la colonne (pleine).
  p("pdf-recu", "file-arrow-right", "outils", true),
  // Feuilles en DXF et statut des travaux (cas 4, lot C4, étape 5) : hors de la colonne (pleine).
  p("feuilles-dxf", "vector", "outils", true),
  p("statut-travaux", "home-cog", "outils", true),
  // Extension « Scripts » : scripts personnels écrits par la personne, exécutés sur une copie du dessin.
  p("scripts", "code", "colonne", true),
  // Cas 2, lot 1 : numérotation en série des locaux, menuiseries ou composants (préfixes, ordre de lecture, niveaux).
  p("numerotation", "numbers", "colonne", true),
  p("info-modele", "info-circle", "colonne-bas"),
];

/**
 * Pictogrammes partagés, seules exceptions admises à l'unicité : un outil ou une commande et le panneau qu'il ouvre,
 * quand ils portent le même objet (recommandation §5, liste de départ reprise du catalogue).
 */
export const PICTOGRAMMES_PARTAGES: readonly (readonly [string, string])[] = Object.freeze([
  ["outil:peinture", "panneau:materiaux"],
  ["outil:balise", "panneau:balises"],
  ["commande:liste-debit", "panneau:debit"],
  ["commande:gerer-reperes", "panneau:reperes"],
  ["commande:controler", "panneau:controle"],
  ["commande:composant-dynamique", "panneau:dynamique"],
  ["commande:emplacement", "panneau:emplacement"],
  ["commande:scripts", "panneau:scripts"],
  ["commande:numerotation", "panneau:numerotation"],
  ["commande:niveaux", "panneau:niveaux"],
  ["commande:locaux", "panneau:locaux"],
  ["commande:plan-vectoriel", "panneau:plan-vectoriel"],
  ["commande:feuilles", "panneau:feuilles"],
  ["commande:reserves", "panneau:reserves"],
  ["commande:enveloppe", "panneau:enveloppe"],
  ["commande:partager-lien", "panneau:consultations"],
  ["commande:fonds", "panneau:fonds"],
  ["commande:references", "panneau:references"],
  ["commande:pdf-recu", "panneau:pdf-recu"],
  ["commande:feuilles-dxf", "panneau:feuilles-dxf"],
  ["commande:statut-travaux", "panneau:statut-travaux"],
] as const);

/** Le registre : outils (ordre du catalogue relevé), commandes, panneaux. */
export const REGISTRE_SANDBOX: readonly EntreeSandbox[] = Object.freeze([...outils, ...commandes, ...panneaux]);


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
