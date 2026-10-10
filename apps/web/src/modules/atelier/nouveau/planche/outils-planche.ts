/**
 * Outils du mode Planche (cahier-planche §3.2, §3.3, §5.10, lot 2) : composition de la barre et de la grille à partir
 * du catalogue déclaratif (`@parcours/planche-model`), disponibilité (R20 : un outil sans machine d'états n'est jamais
 * actif, il est grisé avec le lot qui le livre), lecture du clavier (raccourcis, touches modificatrices, frappe au
 * champ Mesures). Pur : ni DOM, ni React, ni three.js.
 */
import { OUTILS, machineParId, normaliserRaccourci, outilParId, outilParRaccourci, type Outil, type Touche } from "@parcours/planche-model";
import { LANGUE_INTERFACE, t, type Langue } from "../messages";

/** Outils de caméra pris en charge par l'interface (navigation D-157) ; ils n'ont pas de machine d'états. */
export type OutilCamera = "orbite" | "panoramique" | "zoom" | "zoom-etendu" | "zoom-fenetre" | "positionner-camera" | "regarder-autour" | "marcher";
export const OUTILS_CAMERA: ReadonlySet<string> = new Set<OutilCamera>(["orbite", "panoramique", "zoom", "zoom-etendu", "zoom-fenetre", "positionner-camera", "regarder-autour", "marcher"]);
/** Outils de caméra temporaires (§4.34) : après l'action, l'outil précédent revient (Positionner la caméra → Regarder autour). */
export const OUTILS_CAMERA_TEMPORAIRES: ReadonlySet<string> = new Set(["zoom-etendu", "zoom-fenetre", "positionner-camera"]);
export const estOutilCamera = (id: string): id is OutilCamera => OUTILS_CAMERA.has(id);
/** Outils de solides (lot 6) : le moteur booléen (manifold-3d) est chargé à la demande au premier choix de l'un d'eux. */
export const OUTILS_SOLIDES: ReadonlySet<string> = new Set(["enveloppe-exterieure", "union", "soustraction", "ajuster", "intersection", "scinder"]);

/** Outils permis à un lecteur (C25) : navigation et sélection seulement. */
const OUTILS_LECTURE: ReadonlySet<string> = new Set(["selection", "lasso", "metre", "orbite", "panoramique", "zoom", "zoom-etendu", "zoom-fenetre", "positionner-camera", "regarder-autour", "marcher"]);

/** Ordre relevé de la barre de gauche (cahier-planche §3.2) ; un outil « barre » absent de la liste est ajouté à la fin. */
const ORDRE_BARRE = ["selection", "gomme", "ligne", "rectangle", "pousser-tirer", "deplacer", "faire-pivoter", "echelle", "peinture", "orbite", "panoramique", "metre"];

export function outilsBarre(catalogue: readonly Outil[] = OUTILS): Outil[] {
  const barre = catalogue.filter((o) => o.emplacement === "barre");
  const rang = (o: Outil) => {
    const i = ORDRE_BARRE.indexOf(o.id);
    return i < 0 ? ORDRE_BARRE.length + barre.indexOf(o) : i;
  };
  return [...barre].sort((a, b) => rang(a) - rang(b));
}

/** Sections de la grille « … » (cahier-planche §3.3) : regroupement par famille du catalogue. */
const SECTIONS: { libelle: string; familles: readonly Outil["famille"][] }[] = [
  { libelle: "Sélection", familles: ["selection", "materiau"] },
  { libelle: "Dessin", familles: ["dessin"] },
  { libelle: "Modification", familles: ["modification", "solide"] },
  { libelle: "Construction", familles: ["mesure", "annotation"] },
  { libelle: "Caméra", familles: ["camera"] },
];

/**
 * Un outil du menu contextuel (Diviser) n'est atteignable que par ce menu, livré au lot 5 (§5.8) : tant qu'il n'existe
 * pas, un outil de menu contextuel dont la machine est livrée est AUSSI offert dans la grille (choix Fadi, lot 3).
 */
export function sectionsGrille(
  catalogue: readonly Outil[] = OUTILS,
  aMachine: (id: string) => boolean = (id) => machineParId(id) !== undefined,
): { libelle: string; outils: Outil[] }[] {
  const grille = catalogue.filter((o) => o.emplacement === "grille" || (o.emplacement === "menu-contextuel" && aMachine(o.id)));
  return SECTIONS.map((s) => ({ libelle: s.libelle, outils: grille.filter((o) => s.familles.includes(o.famille)) })).filter((s) => s.outils.length > 0);
}

/** Lot qui livre chaque outil (cahier-planche §4 et §8). */
const LOT_PAR_ID: Readonly<Record<string, string>> = {
  "texte-3d": "2 ou 5 (décision P-7)",
  diviser: "3",
  "zoom-etendu": "4",
  "zoom-fenetre": "4",
  "positionner-camera": "4",
  "regarder-autour": "4",
  marcher: "4",
  balise: "5",
};
const LOT_PAR_FAMILLE: Readonly<Record<Outil["famille"], string>> = {
  selection: "2",
  dessin: "2",
  modification: "3",
  mesure: "4",
  annotation: "4",
  camera: "4",
  materiau: "5",
  solide: "6",
};

export function lotPrevu(o: Outil): string {
  // La Gomme est rangée dans la famille « modification » du catalogue mais livrée au lot 2 (§4.3).
  if (o.id === "gomme") return "2";
  return LOT_PAR_ID[o.id] ?? LOT_PAR_FAMILLE[o.famille];
}

export interface OptionsDisponibilite {
  lecture: boolean;
  /** Présence d'une machine d'états (par défaut : le registre `MACHINES`). */
  aMachine?: (id: string) => boolean;
}

/** Motif d'indisponibilité d'un outil (`null` = disponible). */
export function disponibilite(o: Outil, { lecture, aMachine = (id) => machineParId(id) !== undefined }: OptionsDisponibilite): string | null {
  if (!estOutilCamera(o.id) && !aMachine(o.id)) return t("planche.prevu", { outil: o.libelle, lot: lotPrevu(o) });
  if (lecture && !OUTILS_LECTURE.has(o.id)) return t("planche.lecture", { outil: o.libelle });
  return null;
}

/**
 * Couche de raccourcis Fadi (écart Fadi déclaré, D-198, demande du maître d'ouvrage du 10 octobre 2026 : « chaque
 * élément doit avoir un raccourci »). Les raccourcis du catalogue sont le relevé SketchUp et restent intouchés ; un
 * outil dont le `raccourci` relevé vaut `null` reçoit ici une combinaison qui ne recouvre aucun raccourci relevé, ni
 * une touche de la Planche (G, K, Ctrl…, Maj + -), ni la frappe au champ Mesures (`commenceSaisie` : X et x en sont,
 * donc Maj + X est exclu) : **Maj + lettre** pour le dessin, la modification, les solides, la matière, la mesure et
 * l'annotation ; **Alt + Maj + lettre** pour les trois outils de caméra restants. Liste : `docs/planche/lots/barre-outils.md`.
 */
export const RACCOURCIS_FADI: Readonly<Record<string, string>> = {
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
};

/** Raccourci effectif d'un outil : celui du catalogue (relevé), sinon celui de la couche Fadi, sinon `null`. */
export function raccourciOutil(o: Pick<Outil, "id" | "raccourci">): string | null {
  return o.raccourci ?? RACCOURCIS_FADI[o.id] ?? null;
}

/** Outil désigné par un raccourci de la couche Fadi (forme canonique), ou `null`. */
export function outilParRaccourciFadi(raccourci: string, catalogue: readonly Outil[] = OUTILS): Outil | null {
  const cible = normaliserRaccourci(raccourci);
  if (cible === "") return null;
  const id = Object.keys(RACCOURCIS_FADI).find((k) => normaliserRaccourci(RACCOURCIS_FADI[k]!) === cible);
  return id ? (catalogue.find((o) => o.id === id && o.raccourci === null) ?? null) : null;
}

/**
 * Nom d'un outil dans la langue de l'interface (D-163) : le libellé français du catalogue, ou en anglais son nom de
 * référence (`libelleSketchUp`). Écrit par le code et non par le traducteur du DOM, qui n'observe que la page : la
 * Planche détachée (autre document) garde ainsi ses noms dans la langue choisie.
 */
export function nomOutil(o: Pick<Outil, "libelle" | "libelleSketchUp">, langue: Langue = LANGUE_INTERFACE): string {
  return langue === "en" ? o.libelleSketchUp : o.libelle;
}

/** Raccourci affiché dans la langue de l'interface : notation canonique française (`Maj+L`), en anglais `Shift+L`. */
export function afficherRaccourci(r: string, langue: Langue = LANGUE_INTERFACE): string {
  if (langue !== "en") return r;
  return r
    .split("+")
    .map((x) => (x === "Maj" ? "Shift" : x === "Espace" ? "Space" : x))
    .join("+");
}

/** Titre d'un bouton d'outil : « Nom (raccourci) » (relevé, ou couche Fadi), suivi du motif d'indisponibilité. */
export function titreOutil(o: Outil, raison: string | null): string {
  const r = raccourciOutil(o);
  return `${o.libelle}${r ? ` (${r})` : ""}${raison ? ` — ${raison}` : ""}`;
}

/** Pictogrammes (dessins propres à Fadi, §3.6 : choix Fadi). */
const PICTOS: Readonly<Record<string, string>> = {
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
export const pictoOutil = (id: string): string => PICTOS[id] ?? "•";

// -----------------------------------------------------------------------------------------------------------------
// Clavier

/** Événement clavier réduit à ce qui compte (pas de dépendance au DOM). */
export interface Cle {
  key: string;
  code?: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey?: boolean;
}

const TOUCHES_ETAT: Readonly<Record<string, Touche>> = {
  Shift: "Maj",
  Control: "Ctrl",
  Alt: "Alt",
  ArrowUp: "FlecheHaut",
  ArrowDown: "FlecheBas",
  ArrowLeft: "FlecheGauche",
  ArrowRight: "FlecheDroite",
};

/** Touche d'état suivie par enfoncement / relâchement (SketchUp lit keydown / keyup, cahier-planche §5.5). */
export function toucheEtat(key: string): Touche | null {
  return TOUCHES_ETAT[key] ?? null;
}

/** Raccourci canonique d'un événement (`Maj+Espace`, `L`, `Ctrl+Maj+E`), lu sur le caractère (§5.10, choix Fadi). */
export function raccourciClavier(c: Cle): string {
  const parts: string[] = [];
  if (c.ctrlKey || c.metaKey) parts.push("Ctrl");
  if (c.altKey) parts.push("Alt");
  if (c.shiftKey) parts.push("Maj");
  if (c.key === " " || c.key === "Spacebar") parts.push("Espace");
  // Alt + lettre : sur macOS, Option change le caractère (Alt + Maj + P donne « ∏ ») ; la lettre est alors relue sur la
  // touche physique (`code`). Une lettre lisible dans `key` reste prioritaire (dispositions AZERTY, QWERTZ…).
  else if (c.altKey && !/^[a-z]$/i.test(c.key) && c.code && /^Key[A-Z]$/.test(c.code)) parts.push(c.code.slice(3));
  else if (c.key.length === 1) parts.push(c.key.toUpperCase());
  else return "";
  return normaliserRaccourci(parts.join("+"));
}

/** Outil désigné par un raccourci clavier (catalogue relevé d'abord, puis couche Fadi), ou `null`. */
export function outilDuClavier(c: Cle): Outil | null {
  const r = raccourciClavier(c);
  return r ? (outilParRaccourci(r) ?? outilParRaccourciFadi(r)) : null;
}

/** Recherche d'outil : Maj + - (relevé `Shift+-`), quelle que soit la disposition du clavier. */
export function estRecherche(c: Cle): boolean {
  return c.shiftKey && !c.ctrlKey && !c.metaKey && !c.altKey && (c.code === "Minus" || c.key === "_");
}

/**
 * Un caractère tapé hors du champ commence une saisie au champ Mesures (§5.3 : on tape sans cliquer dans le champ) :
 * chiffres, séparateurs, signes et préfixes de réseau ou de coordonnées. Une fois la saisie commencée, tout caractère
 * imprimable s'y ajoute (unités, « s », « r », espaces) au lieu de choisir un outil.
 */
export function commenceSaisie(key: string): boolean {
  return /^[0-9.,;:+\-[<*/xX]$/.test(key);
}

/** Libellé d'un outil pour les messages (repli sur l'identifiant). */
export const libelleOutil = (id: string): string => outilParId(id)?.libelle ?? id;
