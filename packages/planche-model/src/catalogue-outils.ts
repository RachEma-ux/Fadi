/**
 * Catalogue déclaratif des outils et panneaux de SketchUp pour le Web, tels que relevés dans
 * `docs/planche/reference/*.md` (sessions en direct du 2026-10-06 et documentation officielle).
 *
 * Règles de rédaction :
 * - rien n'est inventé : un fait absent des références vaut `null` ou porte le statut `non-verifie` ;
 * - `consigneSketchUp` est le texte original de la barre d'état (`#prompt`) ; `consigne` en est la traduction
 *   française fidèle ; une consigne non relevée vaut `null` ;
 * - `statutReleve` : `observe` (vu en direct), `instructor` (texte du panneau Instructor, non éprouvé),
 *   `non-verifie` (documentation seule, ou rien de relevé) ;
 * - les modificateurs portent leur propre statut ; `mode` vaut `null` quand la façon d'agir (bascule ou
 *   maintien) n'a pas été constatée ; `appui` désigne une touche qui agit une fois par pression (Ctrl +/-) ;
 * - `raccourci` est le raccourci Web par défaut relevé, en notation canonique française (`Maj+Espace`,
 *   `Ctrl+Maj+E`), ou `null` ;
 * - les commandes sans étape relevée (AI Assistant, AI Render, Make Component, Weld Edges…) ne figurent pas
 *   dans le catalogue des outils.
 */
import type { ContexteSaisie } from "./saisie-vcb.js";

export type FamilleOutil =
  | "selection"
  | "dessin"
  | "modification"
  | "mesure"
  | "annotation"
  | "camera"
  | "solide"
  | "materiau";

/** `menu-contextuel` : commande lancée depuis le clic droit (Divide). */
export type EmplacementOutil = "barre" | "grille" | "menu-contextuel";
/** `fadi` : écart propre à Fadi, absent de SketchUp, déclaré (cahier-planche, légende des statuts). */
export type StatutReleve = "observe" | "instructor" | "non-verifie" | "fadi";
export type Offre = "gratuite" | "payante";

export type ToucheModificatrice =
  | "Maj"
  | "Ctrl"
  | "Alt"
  | "Maj+Ctrl"
  | "Maj+Alt"
  | "Ctrl +"
  | "Ctrl -"
  | "Flèche haut"
  | "Flèche bas"
  | "Flèche gauche"
  | "Flèche droite";

export type ModeModificateur = "bascule" | "maintenu" | "appui";

export type InferenceId =
  | "origine"
  | "extremite"
  | "milieu"
  | "sur-arete"
  | "sur-face"
  | "centre"
  | "axe-rouge"
  | "axe-vert"
  | "axe-bleu"
  | "depuis-point"
  | "parallele"
  | "perpendiculaire"
  | "parallele-arete"
  | "tangente-sommet"
  | "carre"
  | "section-doree"
  | "demi-cercle"
  | "sur-ligne"
  | "contraint-ligne"
  | "contraint-plan"
  | "plan-libre";

/** Libellés originaux des infobulles d'inférence (outils-dessin § 4, § 15.3 ; outils-modification § 0.6). */
export const INFERENCES: Readonly<Record<InferenceId, { readonly libelle: string; readonly libelleSketchUp: string | null }>> = {
  origine: { libelle: "Origine", libelleSketchUp: "Origin" },
  extremite: { libelle: "Extrémité", libelleSketchUp: "Endpoint" },
  milieu: { libelle: "Milieu", libelleSketchUp: "Midpoint" },
  "sur-arete": { libelle: "Sur l'arête", libelleSketchUp: "On Edge" },
  "sur-face": { libelle: "Sur la face", libelleSketchUp: "On Face" },
  centre: { libelle: "Centre", libelleSketchUp: "Center" },
  "axe-rouge": { libelle: "Sur l'axe rouge", libelleSketchUp: "On Red Axis" },
  "axe-vert": { libelle: "Sur l'axe vert", libelleSketchUp: "On Green Axis" },
  "axe-bleu": { libelle: "Sur l'axe bleu", libelleSketchUp: "On Blue Axis" },
  "depuis-point": { libelle: "Depuis le point", libelleSketchUp: "From Point" },
  parallele: { libelle: "Parallèle", libelleSketchUp: null },
  perpendiculaire: { libelle: "Perpendiculaire", libelleSketchUp: null },
  "parallele-arete": { libelle: "Parallèle à l'arête", libelleSketchUp: "Parallel to Edge" },
  "tangente-sommet": { libelle: "Tangente au sommet", libelleSketchUp: "Tangent at Vertex" },
  carre: { libelle: "Carré", libelleSketchUp: "Square" },
  "section-doree": { libelle: "Section dorée", libelleSketchUp: "Golden Section" },
  "demi-cercle": { libelle: "Demi-cercle", libelleSketchUp: "Half Circle" },
  "sur-ligne": { libelle: "Sur la ligne", libelleSketchUp: "On Line" },
  "contraint-ligne": { libelle: "Contraint sur la ligne", libelleSketchUp: "Constrained on Line" },
  "contraint-plan": { libelle: "Contraint sur le plan", libelleSketchUp: "Constrained on Plane" },
  "plan-libre": { libelle: "Plan non verrouillé", libelleSketchUp: "Unlocked plane" },
};

export interface EtapeOutil {
  /** Variante d'état (ex. « avec sélection préalable », « mode copie ») ; null pour l'étape nominale. */
  readonly condition: string | null;
  readonly consigne: string | null;
  readonly consigneSketchUp: string | null;
  readonly libelleMesures: string | null;
  readonly libelleMesuresSketchUp: string | null;
  /** Valeur affichée dans le champ Mesures à l'entrée de l'étape, si relevée. */
  readonly valeurInitiale: string | null;
  /** Ce que le champ Mesures accepte à cette étape ; null si non relevé. */
  readonly saisie: ContexteSaisie | null;
}

export interface Modificateur {
  readonly touche: ToucheModificatrice;
  readonly mode: ModeModificateur | null;
  readonly effet: string;
  readonly statutReleve: StatutReleve;
}

export interface Outil {
  readonly id: string;
  readonly libelle: string;
  readonly libelleSketchUp: string;
  readonly famille: FamilleOutil;
  readonly raccourci: string | null;
  readonly emplacement: EmplacementOutil;
  readonly etapes: readonly EtapeOutil[];
  readonly modificateurs: readonly Modificateur[];
  readonly inferences: readonly InferenceId[];
  readonly apresFin: string | null;
  readonly offre: Offre;
  readonly sourceReference: string;
  readonly statutReleve: StatutReleve;
}

// ---------------------------------------------------------------------------------------------------------
// Aides de rédaction

interface OptionsEtape {
  readonly condition?: string;
  readonly valeurInitiale?: string;
}

function e(
  consigneSketchUp: string | null,
  consigne: string | null,
  libelleMesuresSketchUp: string | null,
  libelleMesures: string | null,
  attendu: ContexteSaisie["attendu"] | null,
  options: OptionsEtape = {},
): EtapeOutil {
  return {
    condition: options.condition ?? null,
    consigne,
    consigneSketchUp,
    libelleMesures,
    libelleMesuresSketchUp,
    valeurInitiale: options.valeurInitiale ?? null,
    saisie: attendu === null ? null : { attendu },
  };
}

const m = (
  touche: ToucheModificatrice,
  mode: ModeModificateur | null,
  effet: string,
  statutReleve: StatutReleve,
): Modificateur => ({ touche, mode, effet, statutReleve });

/** Flèches de verrouillage de direction (→ rouge, ← vert, ↑ bleu, ↓ parallèle/perpendiculaire). */
function flechesDirection(statut: StatutReleve, quoi = "la direction d'inférence"): Modificateur[] {
  return [
    m("Flèche droite", "bascule", `Verrouille ${quoi} sur l'axe rouge (2e appui : déverrouille).`, statut),
    m("Flèche gauche", "bascule", `Verrouille ${quoi} sur l'axe vert (2e appui : déverrouille).`, statut),
    m("Flèche haut", "bascule", `Verrouille ${quoi} sur l'axe bleu (2e appui : déverrouille).`, statut),
    m(
      "Flèche bas",
      "bascule",
      `Verrouille ${quoi} parallèlement/perpendiculairement à la dernière arête survolée.`,
      statut,
    ),
  ];
}

/** Flèches de verrouillage du plan ou de la normale (formes, rapporteur avant le 1er clic). */
function flechesPlan(statut: StatutReleve, quoi = "le plan de dessin"): Modificateur[] {
  return [
    m("Flèche droite", "bascule", `Verrouille ${quoi} perpendiculairement à l'axe rouge.`, statut),
    m("Flèche gauche", "bascule", `Verrouille ${quoi} perpendiculairement à l'axe vert.`, statut),
    m("Flèche haut", "bascule", `Verrouille ${quoi} perpendiculairement à l'axe bleu.`, statut),
    m("Flèche bas", "bascule", `Verrouille ${quoi} parallèlement à la géométrie inférée.`, statut),
  ];
}

const SEGMENTS_PLUS_MOINS = (statut: StatutReleve): Modificateur[] => [
  m("Ctrl +", "appui", "Ajoute un segment (bornes 3 à 999).", statut),
  m("Ctrl -", "appui", "Retire un segment (bornes 3 à 999).", statut),
];

const SEG_EN = "Use Ctrl '+' or Ctrl '-' to change the number of segments.";
const SEG_FR = "Utilisez Ctrl « + » ou Ctrl « - » pour changer le nombre de segments.";
const FLECHES_DIR_EN = "Arrow Keys = Toggle Lock Inference Direction.";
const FLECHES_DIR_FR = "Flèches = Verrouiller/déverrouiller la direction d'inférence.";
const FLECHES_PLAN_EN = "Arrow Keys = Toggle Lock Drawing Plane.";
const FLECHES_PLAN_FR = "Flèches = Verrouiller/déverrouiller le plan de dessin.";

const R_DESSIN = "outils-dessin.md";
const R_MODIF = "outils-modification.md";
const R_COMPL = "complements-modification.md";
const R_MESURE = "mesure-camera-panneaux.md";
const R_DOC = "doc-officielle.md";
const R_PANN = "complements-panneaux.md";

// ---------------------------------------------------------------------------------------------------------
// Outils

export const OUTILS: readonly Outil[] = [
  // ----- Sélection
  {
    id: "selection",
    libelle: "Sélectionner",
    libelleSketchUp: "Select",
    famille: "selection",
    raccourci: "Espace",
    emplacement: "barre",
    etapes: [
      e(
        "Click or drag to select objects. Shift = Add/Subtract. Ctrl = Add. Shift + Ctrl = Subtract.",
        "Cliquez ou faites glisser pour sélectionner des objets. Maj = Ajouter/Retirer. Ctrl = Ajouter. Maj + Ctrl = Retirer.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
    ],
    modificateurs: [
      m("Maj", "maintenu", "Bascule : ajoute l'élément s'il est absent, le retire s'il est présent.", "observe"),
      m("Ctrl", "maintenu", "Ajoute uniquement (un élément déjà sélectionné le reste).", "observe"),
      m("Maj+Ctrl", "maintenu", "Retire uniquement.", "observe"),
    ],
    inferences: [],
    apresFin:
      "Sans modificateur, un clic remplace la sélection ; clic dans le vide = tout désélectionner. Double-clic sur une face = face + arêtes bordantes ; triple-clic = tout le connecté. Fenêtre gauche → droite = entièrement contenu ; droite → gauche = tout ce qui est touché. Double-clic sur un groupe = l'éditer ; Échap en sort.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 1 ; ${R_COMPL} § 3.2`,
    statutReleve: "observe",
  },
  {
    id: "lasso",
    libelle: "Lasso",
    libelleSketchUp: "Lasso",
    famille: "selection",
    raccourci: "Maj+Espace",
    emplacement: "grille",
    etapes: [
      e(
        "Click or click and drag to draw selection bounds. | Shift = Add/Subtract. | Ctrl = Add. | Shift + Ctrl = Subtract.",
        "Cliquez, ou cliquez et faites glisser, pour tracer le contour de sélection. | Maj = Ajouter/Retirer. | Ctrl = Ajouter. | Maj + Ctrl = Retirer.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e(
        "Double click to close selection bounds.",
        "Double-cliquez pour fermer le contour de sélection.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
    ],
    modificateurs: [
      m("Maj", null, "Ajoute/retire (mêmes modificateurs que Select).", "instructor"),
      m("Ctrl", null, "Ajoute.", "instructor"),
      m("Maj+Ctrl", null, "Retire.", "instructor"),
    ],
    inferences: [],
    apresFin:
      "Contour polygonal par clics, fermé par double-clic. Sens horaire à l'écran = sélection fenêtre ; anti-horaire = sélection croisée.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 2`,
    statutReleve: "observe",
  },
  {
    id: "gomme",
    libelle: "Gomme",
    libelleSketchUp: "Eraser",
    famille: "modification",
    raccourci: "E",
    emplacement: "barre",
    etapes: [
      e(
        "Click or drag to erase items. | Ctrl = Toggle Soften/Smooth. | Alt = Toggle Unsmooth/Unhide. | Shift = Toggle Hide.",
        "Cliquez ou faites glisser pour effacer des éléments. | Ctrl = Adoucir/lisser. | Alt = Annuler le lissage/réafficher. | Maj = Masquer.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e(
        "Click or drag to soften/smooth edges.",
        "Cliquez ou faites glisser pour adoucir/lisser des arêtes.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Ctrl maintenu" },
      ),
      e(
        "Click or drag to hide items.",
        "Cliquez ou faites glisser pour masquer des éléments.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Maj maintenu" },
      ),
      e(
        "Click or drag to unsmooth/unhide items.",
        "Cliquez ou faites glisser pour annuler le lissage/réafficher des éléments.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Alt maintenu" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "maintenu", "Adoucit/lisse les arêtes au lieu de les effacer.", "observe"),
      m("Maj", "maintenu", "Masque au lieu d'effacer.", "observe"),
      m("Alt", "maintenu", "Annule le lissage / réaffiche.", "observe"),
      m("Maj+Ctrl", null, "Retire de la liste en cours de gommage.", "instructor"),
    ],
    inferences: [],
    apresFin:
      "L'arête est effacée avec les faces qui en dépendent ; une courbe (polygone, arc) est effacée en entier. En glisser, l'effacement a lieu au relâchement.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 3 ; ${R_COMPL} § 4`,
    statutReleve: "observe",
  },

  // ----- Dessin
  {
    id: "ligne",
    libelle: "Ligne",
    libelleSketchUp: "Line",
    famille: "dessin",
    raccourci: "L",
    emplacement: "barre",
    etapes: [
      e(
        `Click to set first endpoint. | ${FLECHES_DIR_EN}`,
        `Cliquez pour placer la première extrémité. | ${FLECHES_DIR_FR}`,
        "Length",
        "Longueur",
        null,
      ),
      e(
        `Click to set second endpoint or enter length. | Alt = Toggle Linear Inferences (All On). | ${FLECHES_DIR_EN}`,
        `Cliquez pour placer la seconde extrémité ou saisissez la longueur. | Alt = Inférences linéaires (toutes actives). | ${FLECHES_DIR_FR}`,
        "Length",
        "Longueur",
        "longueur-ou-point",
      ),
    ],
    modificateurs: [
      ...flechesDirection("observe"),
      m("Maj", "maintenu", "Verrouille la direction de l'inférence courante.", "observe"),
      m(
        "Alt",
        "bascule",
        "Cycle des inférences linéaires au relâchement : toutes actives → toutes désactivées → parallèle/perpendiculaire seulement.",
        "observe",
      ),
    ],
    inferences: [
      "origine",
      "extremite",
      "milieu",
      "sur-arete",
      "sur-face",
      "axe-rouge",
      "axe-vert",
      "axe-bleu",
      "depuis-point",
      "parallele",
      "perpendiculaire",
      "contraint-ligne",
    ],
    apresFin:
      "Enchaînement : le point final devient le départ du segment suivant. Fermer une boucle coplanaire crée la face et termine la chaîne ; une ligne en travers d'une face la coupe en deux.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 4 ; ${R_COMPL} § 7`,
    statutReleve: "observe",
  },
  {
    id: "main-levee",
    libelle: "Main levée",
    libelleSketchUp: "Freehand",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        `Click and drag to draw a freehand curve. | ${FLECHES_PLAN_EN}`,
        `Cliquez et faites glisser pour tracer une courbe à main levée. | ${FLECHES_PLAN_FR}`,
        "Measurements",
        "Mesures",
        "aucune",
      ),
    ],
    modificateurs: [
      ...flechesPlan("instructor"),
      m("Ctrl -", "appui", "Diminue le nombre de segments de la dernière courbe, juste après sa création.", "instructor"),
      m("Ctrl +", "appui", "Augmente le nombre de segments de la dernière courbe, juste après sa création.", "instructor"),
    ],
    inferences: [],
    apresFin: "Une courbe polyligne est créée le long du trajet ; l'outil reste actif.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 13`,
    statutReleve: "observe",
  },
  {
    id: "rectangle",
    libelle: "Rectangle",
    libelleSketchUp: "Rectangle",
    famille: "dessin",
    raccourci: "R",
    emplacement: "barre",
    etapes: [
      e(
        `Click to set first corner. | Ctrl = Toggle Select Center. | ${FLECHES_PLAN_EN}`,
        `Cliquez pour placer le premier coin. | Ctrl = Partir du centre. | ${FLECHES_PLAN_FR}`,
        "Dimensions",
        "Dimensions",
        null,
      ),
      e(
        `Click to set opposite corner or enter length, width. | Ctrl = Toggle Draw From Center. | ${FLECHES_PLAN_EN}`,
        `Cliquez pour placer le coin opposé ou saisissez longueur, largeur. | Ctrl = Dessiner depuis le centre. | ${FLECHES_PLAN_FR}`,
        "Dimensions",
        "Dimensions",
        "dimensions2",
      ),
      e("Click to set center.", "Cliquez pour placer le centre.", "Dimensions", "Dimensions", null, {
        condition: "mode centre",
      }),
      e(
        "Click to set corner or enter length, width.",
        "Cliquez pour placer un coin ou saisissez longueur, largeur.",
        "Dimensions",
        "Dimensions",
        "dimensions2",
        { condition: "mode centre" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Dessin depuis le centre ; le mode reste actif jusqu'au prochain appui.", "observe"),
      m("Flèche droite", "bascule", "Verrouille le plan de dessin perpendiculairement à l'axe rouge.", "observe"),
      m("Flèche gauche", "bascule", "Verrouille le plan de dessin perpendiculairement à l'axe vert.", "instructor"),
      m("Flèche haut", "bascule", "Verrouille le plan de dessin perpendiculairement à l'axe bleu.", "instructor"),
      m("Flèche bas", "bascule", "Verrouille le plan de dessin parallèlement à la géométrie inférée.", "instructor"),
      m("Maj", "maintenu", "Verrouille le plan inféré courant.", "instructor"),
    ],
    inferences: ["parallele-arete", "carre", "section-doree", "contraint-plan"],
    apresFin:
      "La face est créée ; l'outil reste actif. Le sens suit le quadrant du curseur (1re valeur sur le rouge, 2e sur le vert). Le champ garde la saisie (4m,3m).",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 5`,
    statutReleve: "observe",
  },
  {
    id: "rectangle-pivote",
    libelle: "Rectangle pivoté",
    libelleSketchUp: "Rotated Rectangle",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e("Select first corner.", "Sélectionnez le premier coin.", null, null, null),
      e(
        "Select second corner or enter value. Alt = lock protractor plane.",
        "Sélectionnez le deuxième coin ou saisissez une valeur. Alt = verrouiller le plan du rapporteur.",
        "Length, Angle",
        "Longueur, angle",
        "longueur-angle",
      ),
      e(
        "Select third corner or enter value(s). Alt = set protractor baseline.",
        "Sélectionnez le troisième coin ou saisissez une ou des valeurs. Alt = définir la ligne de base du rapporteur.",
        "Width, Angle",
        "Largeur, angle",
        "longueur-angle",
      ),
    ],
    modificateurs: [
      m("Alt", null, "Après le 1er clic : verrouille le plan du 1er côté ; après le 2e : définit la ligne de base du rapporteur.", "instructor"),
      m("Maj", null, "Verrouille l'inférence.", "instructor"),
      ...flechesPlan("instructor", "l'axe de rotation du rapporteur (avant le 1er clic)"),
    ],
    inferences: ["plan-libre", "sur-ligne"],
    apresFin: "La face est créée ; le champ affiche ensuite « Dimensions » (ex. 3.00 m, 2.00 m).",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 6`,
    statutReleve: "observe",
  },
  {
    id: "cercle",
    libelle: "Cercle",
    libelleSketchUp: "Circle",
    famille: "dessin",
    raccourci: "C",
    emplacement: "grille",
    etapes: [
      e(`Select center point. ${SEG_EN}`, `Sélectionnez le centre. ${SEG_FR}`, "Sides", "Côtés", "cotes", {
        valeurInitiale: "24",
      }),
      e(`Select point on edge. ${SEG_EN}`, `Sélectionnez un point sur le bord. ${SEG_FR}`, "Radius", "Rayon", "rayon"),
    ],
    modificateurs: [
      ...SEGMENTS_PLUS_MOINS("observe"),
      m("Flèche gauche", "bascule", "Avant le 1er clic : normale verrouillée sur l'axe vert (cercle vertical).", "observe"),
      m("Flèche droite", "bascule", "Avant le 1er clic : normale verrouillée sur l'axe rouge.", "instructor"),
      m("Flèche haut", "bascule", "Avant le 1er clic : normale verrouillée sur l'axe bleu.", "instructor"),
      m("Flèche bas", "bascule", "Avant le 1er clic : normale parallèle à la géométrie inférée.", "instructor"),
      m("Maj", null, "Verrouille l'inférence.", "instructor"),
    ],
    inferences: [],
    apresFin:
      "La face est créée. Le nombre de côtés est mémorisé pour le cercle suivant ; un rayon ou « Ns » tapé juste après modifie le dernier cercle. Hors bornes : alerte « Curve segments must be in the range from 3 to 999 ».",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 7`,
    statutReleve: "observe",
  },
  {
    id: "polygone",
    libelle: "Polygone",
    libelleSketchUp: "Polygon",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(`Select center point. ${SEG_EN}`, `Sélectionnez le centre. ${SEG_FR}`, "Sides", "Côtés", "cotes", {
        valeurInitiale: "6",
      }),
      e(
        `Select point on edge. Ctrl = circumscribed. ${SEG_EN}`,
        `Sélectionnez un point sur le bord. Ctrl = circonscrit. ${SEG_FR}`,
        "Inscribed Radius",
        "Rayon inscrit",
        "rayon",
      ),
      e(
        `Select point on edge. Ctrl = inscribed. ${SEG_EN}`,
        `Sélectionnez un point sur le bord. Ctrl = inscrit. ${SEG_FR}`,
        "Circumscribed Radius",
        "Rayon circonscrit",
        "rayon",
        { condition: "après Ctrl (mode circonscrit)" },
      ),
    ],
    modificateurs: [
      m(
        "Ctrl",
        "bascule",
        "Bascule rayon inscrit (jusqu'à un sommet, défaut) / circonscrit (jusqu'au milieu d'un côté, apothème).",
        "observe",
      ),
      ...SEGMENTS_PLUS_MOINS("instructor"),
      ...flechesPlan("instructor", "la normale (avant le 1er clic)"),
    ],
    inferences: [],
    apresFin: "La face est créée ; le polygone est une seule courbe (la gomme efface tout le polygone et sa face).",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 8`,
    statutReleve: "observe",
  },
  {
    id: "arc",
    libelle: "Arc",
    libelleSketchUp: "Arc",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(`Select center point. ${SEG_EN}`, `Sélectionnez le centre. ${SEG_FR}`, "Sides", "Côtés", "cotes", {
        valeurInitiale: "12",
      }),
      e(
        "Select first arc point or enter radius.",
        "Sélectionnez le premier point de l'arc ou saisissez le rayon.",
        "Length",
        "Longueur",
        "arc",
      ),
      e(
        "Select second arc point or enter angle.",
        "Sélectionnez le second point de l'arc ou saisissez l'angle.",
        "Angle",
        "Angle",
        "angle-arc",
      ),
    ],
    modificateurs: [
      ...SEGMENTS_PLUS_MOINS("instructor"),
      ...flechesPlan("instructor", "l'axe de rotation du rapporteur (avant le 1er clic)"),
    ],
    inferences: ["plan-libre", "axe-rouge", "extremite"],
    apresFin: "Une courbe seule, sans face ni rayons.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 9`,
    statutReleve: "observe",
  },
  {
    id: "arc-2-points",
    libelle: "Arc 2 points",
    libelleSketchUp: "2 Point Arc",
    famille: "dessin",
    raccourci: "A",
    emplacement: "grille",
    etapes: [
      e(
        `Click to set start point. | ${SEG_EN} | ${FLECHES_DIR_EN}`,
        `Cliquez pour placer le point de départ. | ${SEG_FR} | ${FLECHES_DIR_FR}`,
        "Sides",
        "Côtés",
        "cotes",
        { valeurInitiale: "12" },
      ),
      e(
        "Click to set end point or enter length.",
        "Cliquez pour placer le point final ou saisissez la longueur.",
        "Length",
        "Longueur",
        "arc",
      ),
      e(
        "Click to set bulge or enter distance.",
        "Cliquez pour fixer la flèche ou saisissez la distance.",
        "Bulge",
        "Flèche",
        "arc",
      ),
    ],
    modificateurs: [
      ...SEGMENTS_PLUS_MOINS("observe"),
      m(
        "Alt",
        "bascule",
        "Verrouille la tangence (partant d'une extrémité) : 2 clics suffisent et les arcs tangents s'enchaînent.",
        "observe",
      ),
      ...flechesDirection("instructor", "la direction"),
      m("Maj", null, "Verrouille l'inférence.", "instructor"),
    ],
    inferences: ["extremite", "tangente-sommet", "demi-cercle"],
    apresFin:
      "Une courbe sans face. Un double-clic au point final, depuis l'extrémité d'un arc, crée directement l'arc tangent. « Ns » tapé juste après reconstruit l'arc.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 10 ; ${R_COMPL} § 8`,
    statutReleve: "observe",
  },
  {
    id: "arc-3-points",
    libelle: "Arc 3 points",
    libelleSketchUp: "3 Point Arc",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e("Click to set start point.", "Cliquez pour placer le point de départ.", "Sides", "Côtés", "cotes", {
        valeurInitiale: "12",
      }),
      e(
        "Click to set second point or enter length.",
        "Cliquez pour placer le deuxième point ou saisissez la longueur.",
        "Length",
        "Longueur",
        "longueur",
      ),
      e(
        "Click to set end point or enter angle.",
        "Cliquez pour placer le point final ou saisissez l'angle.",
        "Angle",
        "Angle",
        "angle-arc",
      ),
    ],
    modificateurs: [
      m("Alt", null, "Verrouille la tangence.", "instructor"),
      m("Maj", null, "Verrouille l'inférence.", "instructor"),
      ...SEGMENTS_PLUS_MOINS("instructor"),
    ],
    inferences: [],
    apresFin: "L'arc passe toujours par le 2e point ; une courbe sans face.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 11`,
    statutReleve: "observe",
  },
  {
    id: "secteur",
    libelle: "Secteur",
    libelleSketchUp: "Pie",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(`Select center point. ${SEG_EN}`, `Sélectionnez le centre. ${SEG_FR}`, "Sides", "Côtés", "cotes", {
        valeurInitiale: "12",
      }),
      e(
        "Select first arc point or enter radius.",
        "Sélectionnez le premier point de l'arc ou saisissez le rayon.",
        "Length",
        "Longueur",
        "arc",
      ),
      e(
        "Select second arc point or enter angle.",
        "Sélectionnez le second point de l'arc ou saisissez l'angle.",
        "Angle",
        "Angle",
        "angle-arc",
      ),
    ],
    modificateurs: [...SEGMENTS_PLUS_MOINS("non-verifie")],
    inferences: ["plan-libre"],
    apresFin: "Un secteur fermé (arc + 2 rayons) avec sa face, créée automatiquement.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 12`,
    statutReleve: "observe",
  },
  {
    id: "texte-3d",
    libelle: "Texte 3D",
    libelleSketchUp: "3D Text",
    famille: "dessin",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(null, null, null, null, null, { condition: "boîte de dialogue « CREATE 3D TEXT »" }),
      e("Place 3D text 3D Text.", "Placez le texte 3D.", null, null, null),
    ],
    modificateurs: [],
    inferences: ["extremite"],
    apresFin:
      "Le texte (un composant) suit le curseur puis est posé au clic ; il est alors sélectionné et l'outil passe à Move.",
    offre: "gratuite",
    sourceReference: `${R_DESSIN} § 14`,
    statutReleve: "observe",
  },

  // ----- Modification
  {
    id: "pousser-tirer",
    libelle: "Pousser/Tirer",
    libelleSketchUp: "Push/Pull",
    famille: "modification",
    raccourci: "P",
    emplacement: "barre",
    etapes: [
      e(
        "Click to select the face that you want to push or pull. | Ctrl = Toggle Create New Starting Face. | Alt = Toggle Stretch Mode.",
        "Cliquez sur la face à pousser ou tirer. | Ctrl = Créer une nouvelle face de départ. | Alt = Mode étirement.",
        "Distance",
        "Distance",
        "longueur",
        { valeurInitiale: "0.00 m" },
      ),
      e(
        "Click to set face or enter distance. | Ctrl = Toggle Create New Starting Face. | Alt = Toggle Stretch Mode.",
        "Cliquez pour fixer la face ou saisissez la distance. | Ctrl = Créer une nouvelle face de départ. | Alt = Mode étirement.",
        "Distance",
        "Distance",
        "longueur",
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Crée une nouvelle face de départ (arête conservée à l'ancien niveau).", "observe"),
      m("Alt", "bascule", "Mode étirement : étire les faces voisines au lieu d'en créer.", "instructor"),
      m("Maj", "bascule", "Tube sans fond : la face cliquée disparaît et son contour est tiré en surface (écart Fadi).", "fadi"),
      m("Alt", "bascule", "Sur une arête : surface des deux côtés (écart Fadi).", "fadi"),
      m("Flèche bas", "bascule", "Sur une arête : le long de l'arête, pour l'allonger (écart Fadi).", "fadi"),
    ],
    inferences: ["extremite"],
    apresFin:
      "L'outil reste actif à l'étape 1, la face extrudée reste sélectionnée. Une distance tapée juste après redimensionne l'extrusion ; double-clic sur une autre face = répéter la distance ; pousser jusqu'à une face opposée parallèle perce un trou.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 1`,
    statutReleve: "observe",
  },
  {
    id: "deplacer",
    libelle: "Déplacer",
    libelleSketchUp: "Move",
    famille: "modification",
    raccourci: "M",
    emplacement: "barre",
    etapes: [
      e(
        `Click something to begin moving it. | Ctrl = Cycle Copy/Stamp/Move. | Alt = Toggle Autofold. | ${FLECHES_DIR_EN}`,
        `Cliquez sur un élément pour commencer à le déplacer. | Ctrl = Cycle Copier/Tamponner/Déplacer. | Alt = Pliage automatique. | ${FLECHES_DIR_FR}`,
        "Distance",
        "Distance",
        "distance-reseau",
      ),
      e(
        "Click to begin moving the pre-selected items. | Ctrl = Cycle Copy/Stamp/Move.",
        "Cliquez pour commencer à déplacer les éléments présélectionnés. | Ctrl = Cycle Copier/Tamponner/Déplacer.",
        "Distance",
        "Distance",
        "distance-reseau",
        { condition: "avec sélection préalable" },
      ),
      e(
        `Click to place the items you're moving or enter a distance. | Ctrl = Copy. | Alt = Toggle Autofold. | ${FLECHES_DIR_EN}`,
        `Cliquez pour placer les éléments déplacés ou saisissez une distance. | Ctrl = Copier. | Alt = Pliage automatique. | ${FLECHES_DIR_FR}`,
        "Distance",
        "Distance",
        "distance-reseau",
      ),
      e(
        "Click to begin copying the pre-selected items. | Ctrl = Cycle Copy/Stamp/Move.",
        "Cliquez pour commencer à copier les éléments présélectionnés. | Ctrl = Cycle Copier/Tamponner/Déplacer.",
        "Distance",
        "Distance",
        "distance-reseau",
        { condition: "mode copie armé avant le clic" },
      ),
      e(
        "Click to place the items you're copying or enter a distance. | Ctrl = Move.",
        "Cliquez pour placer les éléments copiés ou saisissez une distance. | Ctrl = Déplacer.",
        "Distance",
        "Distance",
        "distance-reseau",
        { condition: "pendant une copie" },
      ),
      e(
        "Click to make multiple copies. | Ctrl = Cycle Copy/Stamp/Move.",
        "Cliquez pour faire plusieurs copies. | Ctrl = Cycle Copier/Tamponner/Déplacer.",
        "Distance",
        "Distance",
        null,
        { condition: "mode tampon (Stamp)" },
      ),
      e(
        `Click to place the items you're moving or enter a distance. | Alt = Toggle Autofold. | ${FLECHES_DIR_EN}`,
        `Cliquez pour placer les éléments déplacés ou saisissez une distance. | Alt = Pliage automatique. | ${FLECHES_DIR_FR}`,
        "Distance",
        "Distance",
        "distance-reseau",
        { condition: "déplacement d'un sommet (pas de copie)" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Cycle Copier → Tamponner → Déplacer (3 appuis = retour à Déplacer).", "observe"),
      m("Alt", "bascule", "Pliage automatique (autofold) ; au survol d'un objet, fait défiler les poignées.", "instructor"),
      m("Flèche droite", "bascule", "Verrouille le déplacement sur l'axe rouge.", "observe"),
      m("Flèche gauche", "bascule", "Verrouille le déplacement sur l'axe vert.", "observe"),
      m("Flèche haut", "bascule", "Verrouille le déplacement sur l'axe bleu.", "observe"),
      m("Flèche bas", "bascule", "Verrouille parallèlement/perpendiculairement.", "instructor"),
      m("Maj", null, "Verrouille la direction d'inférence courante.", "instructor"),
    ],
    inferences: ["extremite", "milieu", "contraint-ligne"],
    apresFin:
      "Clic-clic, pas de glisser. Après un déplacement, la sélection reste active et le champ garde la saisie. Après une copie, « x3 », « 3x » ou « /3 » crée un réseau ; retaper une distance ré-espace tout le réseau ; la sélection est alors vidée. Un réseau s'annule en un seul pas ; en mode tampon, chaque copie est un pas distinct.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 2`,
    statutReleve: "observe",
  },
  {
    id: "faire-pivoter",
    libelle: "Faire pivoter",
    libelleSketchUp: "Rotate",
    famille: "modification",
    raccourci: "Q",
    emplacement: "barre",
    etapes: [
      e(
        "Click something to select it and set the center point of rotation. | Ctrl = Toggle Copy. | Arrow Keys = Toggle Lock Rotation Plane.",
        "Cliquez sur un élément pour le sélectionner et fixer le centre de rotation. | Ctrl = Copie. | Flèches = Verrouiller/déverrouiller le plan de rotation.",
        "Angle",
        "Angle",
        null,
      ),
      e(
        "Click to set the center point of rotation. | Ctrl = Toggle Copy. | Arrow Keys = Toggle Lock Rotation Plane.",
        "Cliquez pour fixer le centre de rotation. | Ctrl = Copie. | Flèches = Verrouiller/déverrouiller le plan de rotation.",
        "Angle",
        "Angle",
        null,
        { condition: "avec sélection préalable" },
      ),
      e(
        "Move cursor to locate start point of rotation and click to begin rotating. | Ctrl = Toggle Copy.",
        "Déplacez le curseur jusqu'au point de départ de la rotation et cliquez pour commencer à faire pivoter. | Ctrl = Copie.",
        "Angle",
        "Angle",
        null,
      ),
      e(
        "Click to set the rotation or enter angle. | Ctrl = Toggle Copy.",
        "Cliquez pour fixer la rotation ou saisissez l'angle. | Ctrl = Copie.",
        "Angle",
        "Angle",
        "angle-reseau",
      ),
      e(
        "Click to set the rotated copy or enter angle. | Ctrl = Toggle Copy.",
        "Cliquez pour placer la copie pivotée ou saisissez l'angle. | Ctrl = Copie.",
        "Angle",
        "Angle",
        "angle-reseau",
        { condition: "mode copie" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Copie ; suivie de « xN » ou « /N », donne un réseau polaire.", "observe"),
      m("Flèche gauche", "bascule", "Avant le 1er clic : plan de rotation verrouillé sur le vert.", "observe"),
      m("Flèche droite", "bascule", "Avant le 1er clic : plan de rotation verrouillé sur le rouge.", "instructor"),
      m("Flèche haut", "bascule", "Avant le 1er clic : plan de rotation verrouillé sur le bleu.", "instructor"),
      m("Flèche bas", "bascule", "Avant le 1er clic : plan parallèle ; après : parallèle/perpendiculaire.", "instructor"),
      m("Maj", "maintenu", "Avant le 1er clic : verrouille l'inférence du rapporteur.", "instructor"),
    ],
    inferences: ["origine", "axe-rouge", "axe-vert", "plan-libre"],
    apresFin:
      "Retour à l'étape 1, la sélection est conservée. L'angle s'accroche sur les axes. Sans sélection préalable, un clic sur une face ne sélectionne que cette face (la géométrie connectée est étirée).",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 3`,
    statutReleve: "observe",
  },
  {
    id: "echelle",
    libelle: "Échelle",
    libelleSketchUp: "Scale",
    famille: "modification",
    raccourci: "S",
    emplacement: "barre",
    etapes: [
      e(
        "Click the item or object you want to scale. | Ctrl = Toggle Scale About Center. | Shift = Toggle Uniform Scale.",
        "Cliquez sur l'élément ou l'objet à mettre à l'échelle. | Ctrl = Échelle depuis le centre. | Maj = Échelle uniforme.",
        null,
        null,
        null,
        { condition: "sans sélection" },
      ),
      e(
        "Click a scale grip to begin scaling. | Ctrl = Toggle Scale About Center. | Shift = Toggle Uniform Scale.",
        "Cliquez sur une poignée pour commencer la mise à l'échelle. | Ctrl = Échelle depuis le centre. | Maj = Échelle uniforme.",
        null,
        null,
        null,
      ),
      e(
        "Click to finish scaling uniformly, or enter a scale factor or dimension. | Ctrl = Toggle Scale About Center. | Shift = Toggle Uniform Scale.",
        "Cliquez pour terminer la mise à l'échelle uniforme, ou saisissez un facteur ou une dimension. | Ctrl = Échelle depuis le centre. | Maj = Échelle uniforme.",
        "Scale",
        "Échelle",
        "echelle",
        { condition: "poignée de coin" },
      ),
      e(
        "Click to finish scaling, or enter a scale factor or dimension.",
        "Cliquez pour terminer la mise à l'échelle, ou saisissez un facteur ou une dimension.",
        "Blue Scale",
        "Échelle bleue",
        "echelle",
        { condition: "poignée de face (un axe)" },
      ),
      e(
        "Click to finish scaling about center, or enter a scale factor or dimension.",
        "Cliquez pour terminer la mise à l'échelle depuis le centre, ou saisissez un facteur ou une dimension.",
        "Scale",
        "Échelle",
        "echelle",
        { condition: "après Ctrl (depuis le centre)" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Mise à l'échelle depuis le centre de la boîte.", "observe"),
      m("Maj", "maintenu", "Inverse le mode par défaut de la poignée (uniforme / non uniforme).", "observe"),
    ],
    inferences: [],
    apresFin:
      "Boîte englobante jaune à 26 poignées vertes (8 coins, 12 milieux d'arêtes, 6 centres de faces). Un nombre seul = facteur ; une longueur avec unité = dimension cible. Après la fin, la sélection et les poignées restent.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 4`,
    statutReleve: "observe",
  },
  {
    id: "decalage",
    libelle: "Décalage",
    libelleSketchUp: "Offset",
    famille: "modification",
    raccourci: "F",
    emplacement: "grille",
    etapes: [
      e(
        "Select face or edges to offset. Alt = Allow overlap.",
        "Sélectionnez la face ou les arêtes à décaler. Alt = Autoriser le chevauchement.",
        "Distance",
        "Distance",
        null,
      ),
      e(
        "Pick point from which offset will be measured. Alt = Allow overlap.",
        "Choisissez le point à partir duquel le décalage sera mesuré. Alt = Autoriser le chevauchement.",
        "Distance",
        "Distance",
        null,
        { condition: "arêtes présélectionnées" },
      ),
      e(
        "Pick point to define offset or enter value. Alt = Allow overlap.",
        "Choisissez un point pour définir le décalage ou saisissez une valeur. Alt = Autoriser le chevauchement.",
        "Distance",
        "Distance",
        "longueur",
      ),
    ],
    modificateurs: [m("Alt", "bascule", "Autorise / supprime les chevauchements.", "instructor")],
    inferences: [],
    apresFin:
      "La face est divisée (anneau + face intérieure) ; des arêtes donnent une polyligne ouverte sans face. Le sens suit le côté du curseur. Double-clic sur une autre face = même distance. Retour à l'étape 1.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 5`,
    statutReleve: "observe",
  },
  {
    id: "suivez-moi",
    libelle: "Suivez-moi",
    libelleSketchUp: "Follow Me",
    famille: "modification",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Click the profile that you want to extrude.",
        "Cliquez sur le profil à extruder.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
    ],
    modificateurs: [m("Alt", null, "Utilise le périmètre de la face comme chemin.", "instructor")],
    inferences: [],
    apresFin: "Avec une face présélectionnée, le profil est extrudé sur tout son périmètre (coins à onglet). L'outil reste actif.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 6`,
    statutReleve: "observe",
  },
  {
    id: "retourner",
    libelle: "Retourner",
    libelleSketchUp: "Flip",
    famille: "modification",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Click or drag a plane to flip the selection. | Ctrl = Toggle Flip / Copy. | Arrow Keys = Flip about a plane.",
        "Cliquez ou faites glisser un plan pour retourner la sélection. | Ctrl = Retourner / copier. | Flèches = Retourner selon un plan.",
        "Distance",
        "Distance",
        null,
      ),
      e(
        "Click or drag a plane to flip and copy the selection.",
        "Cliquez ou faites glisser un plan pour retourner et copier la sélection.",
        "Distance",
        "Distance",
        null,
        { condition: "après Ctrl (copie)" },
      ),
      e(
        "Enter a distance to adjust mirror plane offset.",
        "Saisissez une distance pour ajuster le décalage du plan miroir.",
        "Distance",
        "Distance",
        "longueur",
        { condition: "après glisser d'un plan" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Retourner / copie retournée.", "observe"),
      m("Flèche gauche", null, "Retourne selon le plan vert.", "non-verifie"),
      m("Flèche droite", null, "Retourne selon le plan rouge.", "non-verifie"),
      m("Flèche haut", null, "Retourne selon le plan bleu.", "non-verifie"),
      m("Alt", null, "Bascule axes de l'objet / axes du contexte parent.", "non-verifie"),
    ],
    inferences: [],
    apresFin: "Trois plans semi-transparents (rouge, vert, bleu) passent par le centre de la sélection ; clic = miroir en place.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 7 ; ${R_DOC} § 3.7`,
    statutReleve: "observe",
  },
  {
    id: "diviser",
    libelle: "Diviser",
    libelleSketchUp: "Divide",
    famille: "modification",
    raccourci: null,
    emplacement: "menu-contextuel",
    etapes: [
      e(
        "Select or enter number of segments.",
        "Sélectionnez ou saisissez le nombre de segments.",
        "Segments",
        "Segments",
        "segments",
        { valeurInitiale: "5" },
      ),
    ],
    modificateurs: [],
    inferences: [],
    apresFin: "L'arête est divisée ; l'outil Select revient.",
    offre: "gratuite",
    sourceReference: `${R_MODIF} § 10.2`,
    statutReleve: "observe",
  },

  // ----- Solides
  {
    id: "enveloppe-exterieure",
    libelle: "Enveloppe extérieure",
    libelleSketchUp: "Outer Shell",
    famille: "solide",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e("Select first solid.", "Sélectionnez le premier solide.", "Measurements", "Mesures", "aucune"),
      e("Select second solid.", "Sélectionnez le deuxième solide.", "Measurements", "Mesures", "aucune"),
    ],
    modificateurs: [],
    inferences: [],
    apresFin:
      "Un seul groupe solide (instance nommée « OuterShell ») ; le matériau du groupe revient à « Default material », ceux des faces sont conservés. Échap ramène à « Select first solid. ».",
    offre: "gratuite",
    sourceReference: `${R_COMPL} § 2`,
    statutReleve: "observe",
  },
  ...(
    [
      ["intersection", "Intersection", "Intersect", "Ne garde que le volume commun."],
      ["union", "Union", "Union", "Fusionne en un solide (peut conserver des vides internes)."],
      ["soustraction", "Soustraction", "Subtract", "Le 1er solide cliqué est l'outil de coupe et disparaît ; le 2e garde le creux."],
      ["ajuster", "Ajuster", "Trim", "Comme Subtract, mais le 1er solide est conservé."],
      ["scinder", "Scinder", "Split", "Découpe selon les intersections en plusieurs groupes."],
    ] as const
  ).map(
    ([id, libelle, libelleSketchUp, effet]): Outil => ({
      id,
      libelle,
      libelleSketchUp,
      famille: "solide",
      raccourci: null,
      emplacement: "grille",
      etapes: [e(null, null, null, null, null)],
      modificateurs: [],
      inferences: [],
      apresFin: `${effet} (documentation officielle ; grisé dans l'offre gratuite).`,
      offre: "payante",
      sourceReference: `${R_DOC} § 3.8 ; ${R_DESSIN} § 0`,
      statutReleve: "non-verifie",
    }),
  ),

  // ----- Matériaux
  {
    id: "peinture",
    libelle: "Pot de peinture",
    libelleSketchUp: "Paint Bucket",
    famille: "materiau",
    raccourci: "B",
    emplacement: "barre",
    etapes: [
      e(
        "Click to paint an item or object. | Alt = Sample Material. | Shift = Paint All Matching. | Ctrl = Paint All Connected. | Shift + Ctrl = Paint All on Same Object.",
        "Cliquez pour peindre un élément ou un objet. | Alt = Prélever la matière. | Maj = Peindre toutes les faces correspondantes. | Ctrl = Peindre tout le connecté. | Maj + Ctrl = Peindre tout sur le même objet.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e(
        "Click to paint connected faces with matching material.",
        "Cliquez pour peindre les faces connectées de même matière.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Ctrl maintenu" },
      ),
      e(
        "Click to paint matching faces.",
        "Cliquez pour peindre les faces correspondantes.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Maj maintenu" },
      ),
      e(
        "Click to paint matching faces of the same object.",
        "Cliquez pour peindre les faces correspondantes du même objet.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Maj + Ctrl maintenus" },
      ),
      e(
        "Click a face to load its material into the Paint Bucket.",
        "Cliquez sur une face pour charger sa matière dans le pot de peinture.",
        "Measurements",
        "Mesures",
        "aucune",
        { condition: "Alt maintenu" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "maintenu", "Peint toutes les faces connectées de même matière.", "observe"),
      m("Maj", "maintenu", "Remplace la matière sur toutes les faces correspondantes du modèle.", "observe"),
      m("Maj+Ctrl", "maintenu", "Remplace la matière sur les faces correspondantes du même objet.", "observe"),
      m("Alt", "maintenu", "Prélève la matière de la face cliquée.", "observe"),
    ],
    inferences: [],
    apresFin:
      "Un clic simple ne peint que la face. Peint de l'extérieur, un groupe affiche sa matière sur ses faces sans matière ; la matière d'une face l'emporte sur celle du groupe.",
    offre: "gratuite",
    sourceReference: `${R_COMPL} § 1`,
    statutReleve: "observe",
  },
  {
    id: "echantillon-matiere",
    libelle: "Prélever la matière",
    libelleSketchUp: "Sample Material",
    famille: "materiau",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Click a face to load its material into the Paint Bucket.",
        "Cliquez sur une face pour charger sa matière dans le pot de peinture.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
    ],
    modificateurs: [],
    inferences: [],
    apresFin: "La matière est chargée et l'outil bascule aussitôt vers le pot de peinture.",
    offre: "gratuite",
    sourceReference: `${R_COMPL} § 1`,
    statutReleve: "observe",
  },

  // ----- Mesure
  {
    id: "metre",
    libelle: "Mètre",
    libelleSketchUp: "Tape Measure",
    famille: "mesure",
    raccourci: "T",
    emplacement: "barre",
    etapes: [
      e(
        `Click to create a guide. | Ctrl = Cycle Guide Lines/Guide Points/Measure. | ${FLECHES_DIR_EN}`,
        `Cliquez pour créer un guide. | Ctrl = Cycle Lignes de guide/Points de guide/Mesure. | ${FLECHES_DIR_FR}`,
        "Area",
        "Aire",
        null,
        { condition: "mode lignes de guide (défaut)" },
      ),
      e(
        `Double-click or click and measure to create a guide point | Ctrl = Cycle Guide Lines/Guide Points/Measure. | ${FLECHES_DIR_EN}`,
        `Double-cliquez, ou cliquez et mesurez, pour créer un point de guide | Ctrl = Cycle Lignes de guide/Points de guide/Mesure. | ${FLECHES_DIR_FR}`,
        null,
        null,
        null,
        { condition: "mode points de guide" },
      ),
      e(
        `Click an item to measure from. | Ctrl = Cycle Guide Lines/Guide Points/Measure. | ${FLECHES_DIR_EN}`,
        `Cliquez sur l'élément depuis lequel mesurer. | Ctrl = Cycle Lignes de guide/Points de guide/Mesure. | ${FLECHES_DIR_FR}`,
        null,
        null,
        null,
        { condition: "mode mesure seule" },
      ),
      e(
        "Click to place guide or enter distance.",
        "Cliquez pour placer le guide ou saisissez la distance.",
        "Length",
        "Longueur",
        "longueur",
      ),
      e(
        "Click to create a guide or enter distance to resize model.",
        "Cliquez pour créer un guide ou saisissez une distance pour redimensionner le modèle.",
        "Length",
        "Longueur",
        "longueur",
        { condition: "après une mesure point à point" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Cycle Lignes de guide → Points de guide → Mesure seule.", "observe"),
      m("Maj", "maintenu", "Verrouille la direction d'inférence courante.", "instructor"),
      ...flechesDirection("instructor"),
    ],
    inferences: ["extremite", "milieu", "sur-face", "axe-rouge", "axe-bleu"],
    apresFin:
      "Depuis une arête : ligne de guide infinie parallèle ; depuis un point : guide fini. Au survol d'une face, le champ affiche son aire. Une distance saisie après une mesure point à point redimensionne le modèle (non testé).",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.1`,
    statutReleve: "observe",
  },
  {
    id: "rapporteur",
    libelle: "Rapporteur",
    libelleSketchUp: "Protractor",
    famille: "mesure",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Click to set center of Protractor. | Ctrl = Toggle Create Guides. | Arrow Keys = Toggle Lock Rotation Plane.",
        "Cliquez pour placer le centre du rapporteur. | Ctrl = Créer des guides. | Flèches = Verrouiller/déverrouiller le plan de rotation.",
        "Angle",
        "Angle",
        null,
      ),
      e(null, null, "Angle", "Angle", null, { condition: "après le clic du centre (consigne non relevée)" }),
      e(
        "Click to place guide or enter angle. | Ctrl = Toggle Create Guides.",
        "Cliquez pour placer le guide ou saisissez l'angle. | Ctrl = Créer des guides.",
        "Angle",
        "Angle",
        "angle",
        { valeurInitiale: "0.0" },
      ),
    ],
    modificateurs: [
      m("Ctrl", "bascule", "Active ou désactive la création de guides.", "instructor"),
      m("Maj", "maintenu", "Avant le 1er clic : verrouille l'inférence du rapporteur.", "instructor"),
      ...flechesPlan("instructor", "le plan du rapporteur (avant le 1er clic)"),
    ],
    inferences: ["plan-libre"],
    apresFin: "Retour à l'étape 1 ; le champ garde la saisie. Création du guide angulaire non confirmée à l'écran.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.3`,
    statutReleve: "observe",
  },
  {
    id: "axes",
    libelle: "Axes",
    libelleSketchUp: "Axes",
    famille: "mesure",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Click to define new origin or double-click to place axes as currently oriented.",
        "Cliquez pour définir la nouvelle origine ou double-cliquez pour placer les axes avec leur orientation actuelle.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e(
        "Click to set red axis or double-click to set axes as oriented. Alt = Alternate axis orientation.",
        "Cliquez pour fixer l'axe rouge ou double-cliquez pour placer les axes tels qu'orientés. Alt = Autre orientation des axes.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e(
        "Click to set green axis. Alt = Alternate axis orientation (red axis is locked).",
        "Cliquez pour fixer l'axe vert. Alt = Autre orientation des axes (l'axe rouge est verrouillé).",
        "Measurements",
        "Mesures",
        "aucune",
      ),
    ],
    modificateurs: [m("Alt", null, "Donne l'autre orientation des axes après le clic d'origine.", "instructor")],
    inferences: [],
    apresFin: "Les axes du modèle sont déplacés et l'outil précédent revient ; l'action se défait avec Undo.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.4`,
    statutReleve: "observe",
  },

  // ----- Annotation
  {
    id: "cotation",
    libelle: "Cotation",
    libelleSketchUp: "Dimensions",
    famille: "annotation",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Select an edge, curve, or two points to dimension, or drag one to move.",
        "Sélectionnez une arête, une courbe ou deux points à coter, ou faites glisser une cote pour la déplacer.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e(
        "Select second point for linear dimension.",
        "Sélectionnez le second point de la cote linéaire.",
        "Measurements",
        "Mesures",
        "aucune",
      ),
      e("Place the dimension.", "Placez la cote.", "Measurements", "Mesures", "aucune"),
    ],
    modificateurs: [],
    inferences: ["extremite", "centre"],
    apresFin:
      "La cote est créée (texte centré sur la ligne de cote) et l'outil revient au repos. Un clic sur la courbe d'un cercle donne une cote de diamètre « DIA ».",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.2`,
    statutReleve: "observe",
  },
  {
    id: "texte",
    libelle: "Texte",
    libelleSketchUp: "Text",
    famille: "annotation",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Select object to attach text to or position on screen.",
        "Sélectionnez l'objet auquel attacher le texte ou une position à l'écran.",
        null,
        null,
        null,
      ),
      e("Position Text.", "Positionnez le texte.", null, null, null, { condition: "texte avec repère" }),
      e("Enter text string.", "Saisissez le texte.", null, null, null),
    ],
    modificateurs: [],
    inferences: [],
    apresFin:
      "Texte avec repère : texte par défaut = aire de la face. Texte écran (clic dans le vide) : fixe à l'écran. Un clic en dehors valide.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.5`,
    statutReleve: "observe",
  },
  {
    id: "plan-de-coupe",
    libelle: "Plan de coupe",
    libelleSketchUp: "Section Plane",
    famille: "annotation",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Place section plane on face.  Shift = Lock to plane.",
        "Placez le plan de coupe sur une face.  Maj = Verrouiller sur le plan.",
        null,
        null,
        null,
      ),
    ],
    modificateurs: [
      m("Maj", "maintenu", "Avant le 1er clic : verrouille l'orientation.", "instructor"),
      ...flechesPlan("instructor", "l'orientation"),
    ],
    inferences: [],
    apresFin: "La coupe est active tout de suite et l'outil passe à Select avec le plan sélectionné (orange).",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.6`,
    statutReleve: "observe",
  },
  {
    id: "balise",
    libelle: "Balise",
    libelleSketchUp: "Tag",
    famille: "annotation",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Select or sample a tag to begin tagging. | Alt = Toggle Sample Tag.",
        "Sélectionnez ou prélevez une balise pour commencer à baliser. | Alt = Prélever une balise.",
        null,
        null,
        null,
        { condition: "aucune balise choisie" },
      ),
      e(
        "Click an object to apply a tag. | Alt = Toggle Sample Tag. | Shift = Toggle Replace Matching. | Ctrl = Toggle Tag All Instances.",
        "Cliquez sur un objet pour lui appliquer une balise. | Alt = Prélever une balise. | Maj = Remplacer les correspondances. | Ctrl = Baliser toutes les instances.",
        null,
        null,
        null,
        { condition: "balise choisie dans le panneau Tags" },
      ),
    ],
    modificateurs: [
      m("Alt", null, "Prélève la balise d'un objet.", "instructor"),
      m("Maj", null, "Remplace la balise de tous les éléments du contexte qui la partagent.", "instructor"),
      m("Ctrl", null, "Applique la balise à toutes les instances d'un composant.", "instructor"),
    ],
    inferences: [],
    apresFin: null,
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 1.7`,
    statutReleve: "observe",
  },

  // ----- Caméra
  {
    id: "orbite",
    libelle: "Orbite",
    libelleSketchUp: "Orbit",
    famille: "camera",
    raccourci: "O",
    emplacement: "barre",
    etapes: [
      e(
        "Drag to orbit. Shift = Pan, Ctrl = suspend gravity.",
        "Faites glisser pour orbiter. Maj = Panoramique, Ctrl = suspendre la gravité.",
        null,
        null,
        null,
      ),
    ],
    modificateurs: [
      m("Maj", "maintenu", "Passe en panoramique.", "instructor"),
      m("Ctrl", "maintenu", "Suspend la gravité (les verticales ne restent pas verticales).", "instructor"),
    ],
    inferences: [],
    apresFin: "Échap rend l'outil précédent.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
  {
    id: "panoramique",
    libelle: "Panoramique",
    libelleSketchUp: "Pan",
    famille: "camera",
    raccourci: "H",
    emplacement: "barre",
    etapes: [e("Drag in direction to pan", "Faites glisser dans une direction pour vous déplacer", null, null, null)],
    modificateurs: [],
    inferences: [],
    apresFin: "Échap rend l'outil précédent.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2 ; ${R_MODIF} § 12`,
    statutReleve: "observe",
  },
  {
    id: "zoom",
    libelle: "Zoom",
    libelleSketchUp: "Zoom",
    famille: "camera",
    raccourci: "Z",
    emplacement: "grille",
    etapes: [
      e(
        "Drag cursor to zoom.  Up is in, down is out. Shift to change Field of View.",
        "Faites glisser le curseur pour zoomer.  Vers le haut : avant, vers le bas : arrière. Maj pour changer le champ de vision.",
        "Field of View",
        "Champ de vision",
        "champ-vision",
        { valeurInitiale: "35.00 deg." },
      ),
    ],
    modificateurs: [m("Maj", "maintenu", "Change le champ de vision en degrés.", "instructor")],
    inferences: [],
    apresFin: null,
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
  {
    id: "zoom-etendu",
    libelle: "Zoom étendu",
    libelleSketchUp: "Zoom Extents",
    famille: "camera",
    raccourci: "Ctrl+Maj+E",
    emplacement: "grille",
    etapes: [e(null, null, null, null, null, { condition: "action immédiate" })],
    modificateurs: [],
    inferences: [],
    apresFin: "La vue est cadrée sur tout le modèle (sans tenir compte des panneaux de droite).",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
  {
    id: "zoom-fenetre",
    libelle: "Zoom fenêtre",
    libelleSketchUp: "Zoom Window",
    famille: "camera",
    raccourci: "Maj+W",
    emplacement: "grille",
    etapes: [e("Drag window area to zoom to", "Faites glisser une fenêtre sur la zone à agrandir", null, null, null)],
    modificateurs: [],
    inferences: [],
    apresFin: "Zoom sur la zone puis retour à l'outil précédent.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
  {
    id: "positionner-camera",
    libelle: "Positionner la caméra",
    libelleSketchUp: "Position Camera",
    famille: "camera",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e("Select the camera position.", "Sélectionnez la position de la caméra.", "Height Offset", "Hauteur", "longueur", {
        valeurInitiale: "~ 1.68 m",
      }),
    ],
    modificateurs: [],
    inferences: [],
    apresFin: "L'œil est placé au-dessus du point cliqué et Look Around s'active automatiquement.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
  {
    id: "regarder-autour",
    libelle: "Regarder autour",
    libelleSketchUp: "Look Around",
    famille: "camera",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Drag in direction to turn camera",
        "Faites glisser dans une direction pour tourner la caméra",
        "Eye Height",
        "Hauteur d'œil",
        "longueur",
      ),
    ],
    modificateurs: [],
    inferences: [],
    apresFin: "Échap rend l'outil précédent.",
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
  {
    id: "marcher",
    libelle: "Marcher",
    libelleSketchUp: "Walk",
    famille: "camera",
    raccourci: null,
    emplacement: "grille",
    etapes: [
      e(
        "Click and drag to walk. Ctrl = run, Shift = move vertically or sideways, Alt = disable collision detection",
        "Cliquez et faites glisser pour marcher. Ctrl = courir, Maj = se déplacer verticalement ou latéralement, Alt = désactiver la détection de collision",
        "Eye Height",
        "Hauteur d'œil",
        "longueur",
      ),
    ],
    modificateurs: [
      m("Ctrl", null, "Courir.", "instructor"),
      m("Maj", null, "Monter/descendre au lieu d'avancer/reculer.", "instructor"),
      m("Alt", null, "Traverser les objets (détection de collision désactivée).", "instructor"),
    ],
    inferences: [],
    apresFin: null,
    offre: "gratuite",
    sourceReference: `${R_MESURE} § 2`,
    statutReleve: "observe",
  },
];

// ---------------------------------------------------------------------------------------------------------
// Panneaux

export type TypeChamp =
  | "case"
  | "curseur"
  | "liste"
  | "nombre"
  | "texte"
  | "lecture"
  | "bouton"
  | "boutons-exclusifs"
  | "onglets";

export interface ChampPanneau {
  readonly libelle: string;
  readonly libelleSketchUp: string;
  readonly type: TypeChamp;
  /** Valeur relevée sur un modèle neuf (gabarit « Decimal - Meters ») ; null si non relevée. */
  readonly defaut: string | number | boolean | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly choix: readonly string[] | null;
  readonly note: string | null;
}

export interface SectionPanneau {
  readonly titre: string;
  readonly titreSketchUp: string | null;
  readonly champs: readonly ChampPanneau[];
}

export interface Panneau {
  readonly id: string;
  readonly libelle: string;
  readonly libelleSketchUp: string;
  /** Rang dans la colonne de droite (1 = haut), null si absent de la colonne relevée. */
  readonly ordre: number | null;
  readonly offre: Offre;
  readonly sections: readonly SectionPanneau[];
  readonly sourceReference: string;
  readonly statutReleve: StatutReleve;
}

interface OptionsChamp {
  readonly defaut?: string | number | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly choix?: readonly string[];
  readonly note?: string;
}

function c(libelleSketchUp: string, libelle: string, type: TypeChamp, o: OptionsChamp = {}): ChampPanneau {
  return {
    libelle,
    libelleSketchUp,
    type,
    defaut: o.defaut ?? null,
    min: o.min ?? null,
    max: o.max ?? null,
    choix: o.choix ?? null,
    note: o.note ?? null,
  };
}

const s = (titreSketchUp: string | null, titre: string, champs: readonly ChampPanneau[]): SectionPanneau => ({
  titre,
  titreSketchUp,
  champs,
});

/** Polices relevées (Entity Info des cotes et textes, boîte 3D Text). */
export const POLICES: readonly string[] = [
  "Architects Daughter",
  "Concert One",
  "Lato",
  "Lora",
  "Merriweather",
  "Montserrat",
  "Noto Sans",
  "Open Sans",
  "Oswald",
  "PT Sans",
  "Permanent Marker",
  "Playball",
  "Prompt",
  "Raleway",
  "Roboto",
];
const EXTREMITES = ["None", "Slash", "Open arrow", "Closed arrow", "Dot"] as const;
const TAILLES = ["9", "10", "11", "12", "14", "18", "20", "24", "32"] as const;
const MATIERES_TY = [
  "Default material",
  "Ty_Blue1",
  "Ty_Blue2",
  "Ty_Blue3",
  "Ty_Blue4",
  "Ty_Brown1",
  "Ty_Brown2",
  "Ty_Gray1",
  "Ty_Gray2",
  "Ty_Green",
  "Ty_Orange",
  "Ty_Red",
  "Ty_Skin",
  "Ty_Yellow",
] as const;

const CHAMPS_MATIERE_BALISE = [
  c("Materials — Front", "Matière — recto", "liste", { defaut: "Default material" }),
  c("Tags", "Balises", "liste", { defaut: "Untagged" }),
];

export const PANNEAUX: readonly Panneau[] = [
  {
    id: "info-entite",
    libelle: "Info entité",
    libelleSketchUp: "Entity Info",
    ordre: 1,
    offre: "gratuite",
    sections: [
      s("No Selection", "Aucune sélection", []),
      s("Face", "Face", [
        c("Area", "Aire", "lecture"),
        c("Materials — Front", "Matière — recto", "liste", { defaut: "Default material" }),
        c("Materials — Back", "Matière — verso", "liste", { defaut: "Default material" }),
        c("Tags", "Balises", "liste", { defaut: "Untagged" }),
        c("Cast Shadows", "Projette des ombres", "case", { defaut: true }),
        c("Receive Shadows", "Reçoit des ombres", "case", { defaut: true }),
      ]),
      s("Arc", "Arc", [
        c("Arc length", "Longueur d'arc", "lecture"),
        c("Radius", "Rayon", "nombre"),
        c("Segments", "Segments", "nombre", { defaut: 12 }),
        ...CHAMPS_MATIERE_BALISE,
        c("Cast Shadows", "Projette des ombres", "case"),
      ]),
      s("Radial Dimension", "Cote", [
        c("Font", "Police", "liste", { defaut: "Architects Daughter", choix: POLICES }),
        c("Style", "Style", "liste", { defaut: "Regular" }),
        c("Size", "Taille", "liste", { defaut: "12", choix: TAILLES }),
        c("Align to", "Aligner sur", "boutons-exclusifs", {
          choix: ["Align text centered on dimension line", "Align text to the screen"],
        }),
        c("Endpoints", "Extrémités", "boutons-exclusifs", { choix: EXTREMITES }),
        ...CHAMPS_MATIERE_BALISE,
      ]),
      s("Text", "Texte avec repère", [
        c("Font", "Police", "liste", { defaut: "Architects Daughter", choix: POLICES }),
        c("Size", "Taille", "liste", { choix: TAILLES }),
        c("Endpoints", "Extrémités", "boutons-exclusifs", {
          defaut: "Closed arrow",
          choix: ["None", "Slash", "Open arrow", "Closed arrow"],
        }),
        c("Align to", "Aligner sur", "boutons-exclusifs", {
          defaut: "Align Leader Text to Pin",
          choix: ["Align Leader Text to the Screen", "Align Leader Text to Pin"],
        }),
        ...CHAMPS_MATIERE_BALISE,
      ]),
      s("Section Plane", "Plan de coupe", [
        c("Instance Name", "Nom d'instance", "texte"),
        c("Symbol", "Symbole", "texte"),
        c("Tags", "Balises", "liste"),
      ]),
      s("Solid Component", "Composant", [
        c("Volume", "Volume", "lecture"),
        c("Instance", "Instance", "texte"),
        c("Definition", "Définition", "texte", { defaut: "Component" }),
        ...CHAMPS_MATIERE_BALISE,
        c("Shadows", "Ombres", "case", { note: "Cast / Receive" }),
        c("Unlocked", "Déverrouillé", "lecture"),
      ]),
    ],
    sourceReference: `${R_MESURE} § 4.1, § 1.2, § 1.5, § 1.6 ; ${R_PANN} « Entity Info (arc) » ; ${R_COMPL} § 3.3`,
    statutReleve: "observe",
  },
  {
    id: "composants",
    libelle: "Composants",
    libelleSketchUp: "Components",
    ordre: 2,
    offre: "gratuite",
    sections: [
      s(null, "Actions", [
        c("Edit Component Details", "Modifier les détails du composant", "bouton", {
          note: "grisé sans composant sélectionné",
        }),
        c("Open 3D Warehouse", "Ouvrir 3D Warehouse", "bouton"),
      ]),
      s(null, "Liste du modèle", [
        c("Overflow", "Menu ⋮", "bouton", { choix: ["Edit Component Details", "Upload to 3D Warehouse"] }),
      ]),
    ],
    sourceReference: `${R_MESURE} § 4.2`,
    statutReleve: "observe",
  },
  {
    id: "instructeur",
    libelle: "Instructeur",
    libelleSketchUp: "Instructor",
    ordre: 3,
    offre: "gratuite",
    sections: [
      s(null, "Contenu", [
        c("Tool Operation", "Fonctionnement de l'outil", "lecture"),
        c("Modifier Keys", "Touches modificatrices", "lecture"),
        c("Tips", "Astuces", "lecture"),
      ]),
    ],
    sourceReference: `${R_MESURE} § 4.3`,
    statutReleve: "observe",
  },
  {
    id: "entrepot-3d",
    libelle: "3D Warehouse",
    libelleSketchUp: "3D Warehouse",
    ordre: 4,
    offre: "gratuite",
    sections: [],
    sourceReference: `${R_MESURE} § 4.4 ; ${R_PANN} § 6`,
    statutReleve: "non-verifie",
  },
  {
    id: "materiaux",
    libelle: "Matériaux",
    libelleSketchUp: "Materials",
    ordre: 5,
    offre: "gratuite",
    sections: [
      s(null, "En-tête", [
        c("Tabs", "Onglets", "onglets", { defaut: "In Model", choix: ["In Model", "Browse", "3D Warehouse"] }),
        c("Delete Materials", "Supprimer des matières", "bouton"),
        c("Import Material", "Importer une matière", "bouton"),
      ]),
      s("Materials In Use", "Matières utilisées", [
        c("Materials In Use", "Matières utilisées", "liste", {
          defaut: "Default material",
          choix: MATIERES_TY,
          note: "grille de vignettes 4 par ligne ; les Ty_* viennent du personnage d'échelle",
        }),
      ]),
      s("Browse", "Parcourir", [
        c("Categories", "Catégories", "liste", {
          choix: [
            "Asphalt & Concrete",
            "Brick",
            "Fabric",
            "Glass",
            "Ground",
            "Metal",
            "Patterns",
            "Plaster",
            "Plastic",
            "Roofing",
            "Solid Colors",
            "Stone",
            "Tile",
            "Wood",
          ],
        }),
      ]),
    ],
    sourceReference: `${R_MESURE} § 4.5 ; ${R_COMPL} § 1`,
    statutReleve: "observe",
  },
  {
    id: "styles",
    libelle: "Styles",
    libelleSketchUp: "Styles",
    ordre: 6,
    offre: "gratuite",
    sections: [],
    sourceReference: `${R_MESURE} § 4.6 ; ${R_PANN} § 1`,
    statutReleve: "non-verifie",
  },
  {
    id: "balises",
    libelle: "Balises",
    libelleSketchUp: "Tags",
    ordre: 7,
    offre: "gratuite",
    sections: [
      s(null, "Barre d'icônes", [
        c("Toggle Master Visibility", "Visibilité générale", "bouton"),
        c("Create Tag", "Créer une balise", "bouton"),
        c("Create Folder", "Créer un dossier", "bouton", { note: "grisé" }),
        c("Sort Tags", "Trier les balises", "bouton"),
        c("Color by Tag", "Couleur par balise", "bouton"),
        c("Purge unused", "Purger les inutilisées", "bouton"),
        c("Search tags...", "Rechercher des balises…", "texte"),
      ]),
      s("Create New Tag", "Créer une balise", [
        c("Tag Name", "Nom de la balise", "texte", { defaut: "Tag1" }),
        c("Choose tag color", "Couleur de la balise", "liste"),
        c("Choose dash pattern", "Motif de pointillé", "liste"),
      ]),
      s(null, "Ligne d'une balise", [
        c("View Tags", "Visibilité", "case"),
        c("Overflow", "Menu ⋮", "bouton", { choix: ["Apply", "Edit", "Delete"] }),
      ]),
    ],
    sourceReference: `${R_MESURE} § 4.7`,
    statutReleve: "observe",
  },
  {
    id: "ombres",
    libelle: "Ombres",
    libelleSketchUp: "Shadows",
    ordre: 8,
    offre: "gratuite",
    sections: [
      s(null, "Ombres", [
        c("Shadows", "Ombres", "case", { defaut: false }),
        c("On face", "Sur les faces", "case", { defaut: true }),
        c("On ground", "Sur le sol", "case", { defaut: true }),
        c("From edges", "Depuis les arêtes", "case", { defaut: false }),
        c("Use sun for shading", "Utiliser le soleil pour l'ombrage", "case", { defaut: false }),
        c("Timezone", "Fuseau horaire", "lecture", { note: "« UTC-7:00 » relevé ; modifiable via Add Location" }),
        c("Time", "Heure", "curseur", {
          min: 0,
          max: 600,
          note: "valeur relevée 406 ≈ 1:30 PM ; bornes affichées selon lever/coucher (6:44 AM – 4:44 PM)",
        }),
        c("Date", "Date", "curseur", { min: 1, max: 365, note: "valeur relevée 312 (11/08)" }),
        c("Light", "Clair", "curseur", { defaut: 80, min: 0, max: 100 }),
        c("Dark", "Sombre", "curseur", { defaut: 45, min: 0, max: 100 }),
        c("Add Location", "Ajouter un lieu", "bouton"),
      ]),
      s("Fog Settings", "Brouillard", [
        c("Show Fog", "Afficher le brouillard", "case", { defaut: false }),
        c("Use Background Color", "Utiliser la couleur de fond", "case", { defaut: true }),
        c("Distance", "Distance", "curseur", { note: "curseur double" }),
      ]),
    ],
    sourceReference: `${R_PANN} « Shadows »`,
    statutReleve: "observe",
  },
  {
    id: "scenes",
    libelle: "Scènes",
    libelleSketchUp: "Scenes",
    ordre: 9,
    offre: "gratuite",
    sections: [
      s(null, "Barre", [
        c("Add Scene", "Ajouter une scène", "bouton"),
        c("Update Active Scene", "Mettre à jour la scène active", "bouton"),
        c("Play Scenes Animation", "Lire l'animation des scènes", "bouton"),
        c("Edit Animation Settings", "Réglages de l'animation", "bouton"),
      ]),
      s("Camera", "Caméra", [
        c("Projection", "Projection", "boutons-exclusifs", {
          choix: ["Perspective", "Parallel Projection", "Two-Point Perspective"],
          note: "Perspective {on} dans la recherche",
        }),
        c("Field Of View (FOV)", "Champ de vision", "curseur", { defaut: 30, min: 0, max: 120 }),
      ]),
      s("Standard Views", "Vues standard", [
        c("Standard Views", "Vues standard", "bouton", {
          choix: [
            "Plan View (Top)",
            "South Elevation (Front)",
            "East Elevation (Right)",
            "North Elevation (Back)",
            "West Elevation (Left)",
            "Bottom View",
            "Iso",
          ],
        }),
      ]),
      s("My Scenes", "Mes scènes", [c("Add Scene", "Ajouter une scène", "bouton")]),
      s("Animation Settings", "Réglages de l'animation", [
        c("Enable Scene Transitions", "Activer les transitions", "case", { defaut: true }),
        c("Transition Time (s)", "Durée de transition (s)", "curseur", { defaut: 2, min: 0, max: 100 }),
        c("Delay Time (s)", "Délai (s)", "curseur", { defaut: 1, min: 0, max: 100 }),
      ]),
    ],
    sourceReference: `${R_PANN} « Scenes »`,
    statutReleve: "observe",
  },
  {
    id: "affichage",
    libelle: "Affichage",
    libelleSketchUp: "Display",
    ordre: 10,
    offre: "gratuite",
    sections: [
      s("Unhide", "Réafficher", [
        c("Unhide", "Réafficher", "bouton", { choix: ["All", "Selected", "Last"] }),
      ]),
      s("View", "Voir", [
        c("Hidden Objects", "Objets masqués", "case", { defaut: false }),
        c("Hidden Geometry", "Géométrie masquée", "case", { defaut: false }),
        c("Color By Tags", "Couleur par balise", "case", { defaut: false }),
        c("Section Planes", "Plans de coupe", "case", { defaut: false }),
        c("Section Cuts", "Coupes", "case", { defaut: true }),
        c("Section Cuts — number", "Coupes — nombre", "nombre", { defaut: 3, min: 1, max: 20 }),
        c("Section Fill", "Remplissage des coupes", "case", { defaut: true }),
        c("Axes", "Axes", "case", { defaut: true }),
        c("True North", "Nord géographique", "case", { defaut: false }),
        c("Guides", "Guides", "case", { defaut: true }),
        c("Delete all guides", "Supprimer tous les guides", "bouton"),
      ]),
      s("Component Edit", "Édition de composant", [
        c("Hide Rest of Model", "Masquer le reste du modèle", "case", { defaut: false }),
        c("Hide Similar Components", "Masquer les composants similaires", "case", { defaut: false }),
      ]),
    ],
    sourceReference: `${R_PANN} « Display »`,
    statutReleve: "observe",
  },
  {
    id: "adoucir-lisser",
    libelle: "Adoucir / Lisser",
    libelleSketchUp: "Soften / Smooth",
    ordre: 11,
    offre: "gratuite",
    sections: [
      s(null, "Arêtes", [
        c("Soften Coplanar Edges", "Adoucir les arêtes coplanaires", "case", { defaut: false }),
        c("Smooth Edges", "Lisser les arêtes", "case", { defaut: false }),
        c("Angle", "Angle", "curseur", { defaut: 30, min: 0, max: 180 }),
        c("Status", "État", "lecture", { choix: ["No softened edges", "No smoothed edges"] }),
      ]),
    ],
    sourceReference: `${R_PANN} « Soften / Smooth »`,
    statutReleve: "observe",
  },
  {
    id: "info-modele",
    libelle: "Info modèle",
    libelleSketchUp: "Model Info",
    ordre: 12,
    offre: "gratuite",
    sections: [
      s("Length Units", "Unités de longueur", [
        c("Format", "Format", "liste", { defaut: "Meter" }),
        c("Display Precision", "Précision d'affichage", "liste", { defaut: "0.00 m" }),
        c("Length Snapping", "Accrochage de longueur", "case", { defaut: true }),
        c("Length Snapping — value", "Accrochage de longueur — pas", "liste", { defaut: "0.01 m" }),
      ]),
      s("Area Units", "Unités d'aire", [
        c("Format", "Format", "liste", { defaut: "Square Meter" }),
        c("Display Precision", "Précision d'affichage", "liste", { defaut: "0.00 m²" }),
      ]),
      s("Volume Units", "Unités de volume", [
        c("Format", "Format", "liste", { defaut: "Cubic Meter" }),
        c("Display Precision", "Précision d'affichage", "liste", { defaut: "0.00 m³" }),
      ]),
      s("Angle Units", "Unités d'angle", [
        c("Precision", "Précision", "liste", { defaut: "0.0" }),
        c("Angle Snapping", "Accrochage d'angle", "case", { defaut: true }),
        c("Angle Snapping — value", "Accrochage d'angle — pas", "liste", { defaut: "15°" }),
      ]),
      s("Text Settings — Screen Text", "Texte écran", [
        c("Font", "Police", "liste", { defaut: "Architects Daughter", choix: POLICES }),
        c("Style", "Style", "liste", { defaut: "Regular" }),
        c("Size", "Taille", "liste", { defaut: "9" }),
        c("Update All Screen Text", "Mettre à jour tous les textes écran", "bouton"),
      ]),
      s("Text Settings — Leader Text", "Texte avec repère", [
        c("Font", "Police", "liste", { defaut: "Architects Daughter", choix: POLICES }),
        c("Style", "Style", "liste", { defaut: "Regular" }),
        c("Size", "Taille", "liste", { defaut: "9" }),
        c("Endpoints", "Extrémités", "boutons-exclusifs", { choix: EXTREMITES }),
        c("Align to", "Aligner sur", "boutons-exclusifs", { choix: ["Screen", "Pin"] }),
        c("Update All Leader Text", "Mettre à jour tous les textes avec repère", "bouton"),
      ]),
      s("Dimensions Settings", "Cotes", [
        c("Font", "Police", "liste", { defaut: "Architects Daughter", choix: POLICES }),
        c("Style", "Style", "liste", { defaut: "Regular" }),
        c("Size", "Taille", "liste", { defaut: "12" }),
        c("Align to", "Aligner sur", "boutons-exclusifs", { choix: ["above", "centered", "outside", "screen"] }),
        c("Endpoints", "Extrémités", "boutons-exclusifs", { choix: EXTREMITES }),
        c("Update All Dimensions", "Mettre à jour toutes les cotes", "bouton"),
      ]),
    ],
    sourceReference: `${R_PANN} « Model Info »`,
    statutReleve: "observe",
  },
  {
    id: "outliner",
    libelle: "Structure (Outliner)",
    libelleSketchUp: "Outliner",
    ordre: null,
    offre: "payante",
    sections: [],
    sourceReference: `${R_MESURE} § 4 ; ${R_PANN} § 7 ; ${R_DOC} § 9`,
    statutReleve: "non-verifie",
  },
  {
    id: "inspecteur-solides",
    libelle: "Inspecteur de solides",
    libelleSketchUp: "Solid Inspector",
    ordre: null,
    offre: "payante",
    sections: [],
    sourceReference: `${R_MESURE} § 4 ; ${R_PANN} § 7 ; ${R_DOC} § 9`,
    statutReleve: "non-verifie",
  },
  {
    id: "commentaires",
    libelle: "Commentaires",
    libelleSketchUp: "Comments",
    ordre: null,
    offre: "payante",
    sections: [],
    sourceReference: `${R_MESURE} § 4 ; ${R_PANN} § 7`,
    statutReleve: "non-verifie",
  },
  {
    id: "environnements",
    libelle: "Environnements",
    libelleSketchUp: "Environments",
    ordre: null,
    offre: "gratuite",
    sections: [],
    sourceReference: `${R_DOC} § 9`,
    statutReleve: "non-verifie",
  },
];

// ---------------------------------------------------------------------------------------------------------
// Recherche

/** Minuscules, sans accents, espaces réduits. */
export function normaliserTexte(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/+]+/g, " ")
    .trim();
}

const ORDRE_MODIFS = ["ctrl", "alt", "maj"] as const;
const SYNONYMES: Readonly<Record<string, string>> = {
  shift: "maj",
  maj: "maj",
  control: "ctrl",
  ctrl: "ctrl",
  alt: "alt",
  space: "espace",
  espace: "espace",
};
const AFFICHAGE: Readonly<Record<string, string>> = { ctrl: "Ctrl", alt: "Alt", maj: "Maj", espace: "Espace" };

/** Forme canonique d'un raccourci : modificateurs dans l'ordre Ctrl, Alt, Maj, puis la touche (`Ctrl+Maj+E`). */
export function normaliserRaccourci(r: string): string {
  const morceaux = r
    .split("+")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  const modifs = new Set<string>();
  let touche = "";
  for (const brut of morceaux) {
    const k = SYNONYMES[brut.toLowerCase()] ?? brut.toLowerCase();
    if ((ORDRE_MODIFS as readonly string[]).includes(k)) modifs.add(k);
    else touche = k;
  }
  const tete = ORDRE_MODIFS.filter((k) => modifs.has(k)).map((k) => AFFICHAGE[k] ?? k);
  const pied = touche === "" ? [] : [AFFICHAGE[touche] ?? touche.toUpperCase()];
  return [...tete, ...pied].join("+");
}

export function outilParId(id: string): Outil | null {
  return OUTILS.find((o) => o.id === id) ?? null;
}

export function outilParRaccourci(raccourci: string): Outil | null {
  const cible = normaliserRaccourci(raccourci);
  if (cible === "") return null;
  return OUTILS.find((o) => o.raccourci !== null && normaliserRaccourci(o.raccourci) === cible) ?? null;
}

export function panneauParId(id: string): Panneau | null {
  return PANNEAUX.find((p) => p.id === id) ?? null;
}

/**
 * Recherche d'outils par libellé français ou anglais (ou identifiant), insensible à la casse et aux accents.
 * Tous les mots de la requête doivent figurer ; tri : correspondance exacte, puis début de libellé, puis le reste.
 */
export function rechercherOutil(texte: string): Outil[] {
  const q = normaliserTexte(texte);
  if (q === "") return [];
  const mots = q.split(" ");
  const notes: { outil: Outil; note: number; rang: number }[] = [];
  OUTILS.forEach((outil, rang) => {
    const libelles = [outil.libelle, outil.libelleSketchUp, outil.id.replace(/-/g, " ")].map(normaliserTexte);
    const tout = libelles.join(" ");
    if (!mots.every((mot) => tout.includes(mot))) return;
    const note = libelles.some((l) => l === q) ? 0 : libelles.some((l) => l.startsWith(q)) ? 1 : 2;
    notes.push({ outil, note, rang });
  });
  return notes.sort((a, b) => a.note - b.note || a.rang - b.rang).map((n) => n.outil);
}
