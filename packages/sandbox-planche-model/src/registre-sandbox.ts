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
export type FamilleCommandeSandbox = "objet" | "contexte" | "lien" | "navigateur" | "vue" | "debit" | "piece" | "repere";
export type FamilleEntree = FamilleOutil | FamilleCommandeSandbox | "panneau";
/**
 * Emplacement par défaut : `barre` barre verticale gauche ; `grille` « ⋯ Plus d'outils » ; `menu-contextuel` clic droit ;
 * `actions` barre d'actions flottante ; `fil-ariane` fil d'Ariane d'un groupe ; `outils` « Outils ▾ » seulement ;
 * `panneau-navigateur`, `panneau-debit` barre du panneau ; `barre-piece` bloc de la pièce ; `colonne` colonne de droite,
 * un clic par panneau ; `colonne-bas` bas de la colonne (Info modèle, comme le (i) de SketchUp). Tous les outils et
 * commandes figurent aussi dans « Outils ▾ ».
 */
export type EmplacementEntree = EmplacementOutil | "actions" | "fil-ariane" | "outils" | "panneau-navigateur" | "panneau-debit" | "barre-piece" | "colonne" | "colonne-bas" | "barre-reperes";
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
  onglet: "fadi:onglet",
  "coupe-profil": "fadi:coupe-profil",
  "allonger-piece": "fadi:allonger",
  "aligner-face": "fadi:aligner",
  epaissir: "fadi:epaissir",
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
  onglet: "Alt+Maj+O",
  "coupe-profil": "Alt+Maj+B",
  "allonger-piece": "Alt+Maj+A",
  "aligner-face": "Alt+Maj+F",
  // Lot L21 (D-202) : outil propre à Fadi.
  epaissir: "Alt+Maj+J",
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

const outils: EntreeSandbox[] = OUTILS.map((o) => ({
  nature: "outil",
  id: o.id,
  famille: o.famille,
  pictogramme: pictogramme(PICTOS_OUTILS[o.id] ?? "", o.famille),
  raccourci: RACCOURCIS_HARMONISES[o.id] ?? o.raccourci ?? RACCOURCIS_FADI_OUTILS[o.id] ?? null,
  emplacement: emplacementOutil(o.id, o.emplacement),
  disponibilite: "livree",
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
];

const p = (id: string, picto: string, emplacement: "colonne" | "colonne-bas", horsCatalogue = false): EntreeSandbox => ({
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
