/**
 * Outils du mode Planche (cahier-planche §3.2, §3.3, §5.10, lot 2) : composition de la barre et de la grille à partir
 * du catalogue déclaratif (`@parcours/planche-model`), disponibilité (R20 : un outil sans machine d'états n'est jamais
 * actif, il est grisé avec le lot qui le livre), lecture du clavier (raccourcis, touches modificatrices, frappe au
 * champ Mesures). Pur : ni DOM, ni React, ni three.js.
 */
import { OUTILS, machineParId, normaliserRaccourci, outilParId, outilParRaccourci, type Outil, type Touche } from "@parcours/planche-model";
import { t } from "../messages";

/** Outils de caméra pris en charge par l'interface (navigation D-157) ; ils n'ont pas de machine d'états. */
export type OutilCamera = "orbite" | "panoramique" | "zoom";
export const OUTILS_CAMERA: ReadonlySet<string> = new Set<OutilCamera>(["orbite", "panoramique", "zoom"]);
export const estOutilCamera = (id: string): id is OutilCamera => OUTILS_CAMERA.has(id);

/** Outils permis à un lecteur (C25) : navigation et sélection seulement. */
const OUTILS_LECTURE: ReadonlySet<string> = new Set(["selection", "lasso", "orbite", "panoramique", "zoom"]);

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

/** Titre d'un bouton d'outil : « Nom (raccourci) » (relevé), suivi du motif d'indisponibilité. */
export function titreOutil(o: Outil, raison: string | null): string {
  return `${o.libelle}${o.raccourci ? ` (${o.raccourci})` : ""}${raison ? ` — ${raison}` : ""}`;
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
  else if (c.key.length === 1) parts.push(c.key.toUpperCase());
  else return "";
  return normaliserRaccourci(parts.join("+"));
}

/** Outil désigné par un raccourci clavier (catalogue relevé), ou `null`. */
export function outilDuClavier(c: Cle): Outil | null {
  const r = raccourciClavier(c);
  return r ? outilParRaccourci(r) : null;
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
