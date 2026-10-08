/**
 * Contrat des machines d'états PURES des outils de la Planche (lot 2, fiches PL-02-xx).
 * Le rendu (apps/web) ne fait que traduire les événements du pointeur / clavier en `EvenementOutil`,
 * appeler `traiter`, puis afficher `vue(etat)` ; toute la logique de l'outil est ici, testable sans DOM.
 *
 * Règles communes (cahier-planche §5) :
 * - le point reçu est un rayon caméra → curseur ; la machine fait elle-même l'inférence (`inferer`) avec son
 *   point de départ et ses verrous ;
 * - une saisie au champ Mesures s'applique à l'étape en cours, ou corrige la dernière opération terminée
 *   (un seul pas d'annulation) ;
 * - Ctrl et Alt sont des bascules à l'appui ; Maj agit tant qu'elle est maintenue ;
 * - Échap annule l'opération en cours (sinon : sans effet, l'interface gère le retour à l'outil précédent).
 */
import type { Modele } from "../geometrie-libre.js";
import type { Maillage } from "../maillage.js";
import type { Repere } from "../annotations.js";
import type { Inference, ModeAlt, Verrou } from "../inference.js";
import type { ContexteSaisie } from "../saisie-vcb.js";
import type { Vec3 } from "../vecteur.js";

export interface Rayon {
  readonly origine: Vec3;
  readonly direction: Vec3;
}

export type Touche =
  | "Maj"
  | "Ctrl"
  | "Alt"
  | "FlecheHaut"
  | "FlecheBas"
  | "FlecheGauche"
  | "FlecheDroite"
  | "CtrlPlus"
  | "CtrlMoins"
  | "Entree"
  | "Suppr";

export type EvenementOutil =
  /** Déplacement du pointeur ; `tolerance` = rayon d'accrochage en mètres à la profondeur visée. */
  | {
      readonly genre: "survol";
      readonly rayon: Rayon;
      readonly tolerance: number;
      /** (Ajout lot 2, optionnel) Position écran du pointeur, en pixels : élastique du Lasso. */
      readonly ecran?: { x: number; y: number };
    }
  | {
      readonly genre: "clic";
      readonly rayon: Rayon;
      readonly tolerance: number;
      readonly double?: boolean;
      /** (Ajout lot 2, optionnel) Troisième clic rapproché (`MouseEvent.detail === 3`) : Sélection « tout le connecté ». */
      readonly triple?: boolean;
      /** (Ajout lot 2, optionnel) Position écran du clic, en pixels : sommets du contour du Lasso. */
      readonly ecran?: { x: number; y: number };
    }
  /** Début / fin d'un glisser (sélection fenêtre, gomme glissée, main levée). */
  | { readonly genre: "appui"; readonly rayon: Rayon; readonly tolerance: number; readonly ecran: { x: number; y: number } }
  | { readonly genre: "glisser"; readonly rayon: Rayon; readonly tolerance: number; readonly ecran: { x: number; y: number } }
  | { readonly genre: "relache"; readonly rayon: Rayon; readonly tolerance: number; readonly ecran: { x: number; y: number } }
  | { readonly genre: "touche"; readonly touche: Touche; readonly etat: "enfoncee" | "relachee" }
  /** Texte validé (Entrée) dans le champ Mesures. */
  | { readonly genre: "saisie"; readonly texte: string }
  | { readonly genre: "echap" };

/** Ce que le rendu affiche ; jamais une donnée de projet (R10). */
export interface VueOutil {
  /** Consigne de la barre d'état (français, fidèle au relevé). */
  readonly consigne: string;
  /** Libellé et valeur courante du champ Mesures (`null` = champ inactif pour cette étape). */
  readonly mesures: { readonly libelle: string; readonly valeur: string; readonly saisie: ContexteSaisie } | null;
  /** Inférence courante (point, couleur, infobulle). */
  readonly inference: Inference | null;
  /** Aperçu provisoire : segments (polylignes) et faces à dessiner en surimpression. */
  readonly apercu: {
    readonly lignes: readonly (readonly Vec3[])[];
    readonly faces: readonly (readonly Vec3[])[];
    /** Rectangle de sélection à l'écran (pixels) et son genre : fenêtre (gauche → droite) ou croisée. */
    readonly cadre?: { readonly de: { x: number; y: number }; readonly a: { x: number; y: number }; readonly genre: "fenetre" | "croisee" };
    /** (Ajout lot 2, optionnel) Contour du Lasso à l'écran (pixels), curseur compris ; carré rouge au premier point. */
    readonly contour?: { readonly points: readonly { x: number; y: number }[]; readonly genre: "fenetre" | "croisee" };
    /** (Ajout, optionnel) Poignées (monde) : petits carrés aux extrémités d'une arête sélectionnée, à glisser. */
    readonly points?: readonly Vec3[];
    /** (Ajout, optionnel) Lignes en pointillé (monde) : trajet d'un point glissé, de sa position d'origine au curseur. */
    readonly pointilles?: readonly (readonly Vec3[])[];
    /** (Lot 4) Étiquettes de texte à afficher près d'un point monde (longueur du Mètre, angle du Rapporteur…). */
    readonly etiquettes?: readonly { readonly point: Vec3; readonly texte: string }[];
    /** (Lot 4) Plan de coupe en aperçu : rectangle à languettes sur la face survolée (origine, normale, demi-tailles). */
    readonly plan?: { readonly origine: Vec3; readonly normale: Vec3; readonly u: Vec3; readonly w: Vec3; readonly demiU: number; readonly demiW: number; readonly couleur: string };
    /** (Lot 4) Rapporteur en aperçu : centre, normale, rayon, direction de départ, angle balayé (rad). */
    readonly rapporteur?: { readonly centre: Vec3; readonly normale: Vec3; readonly rayon: number; readonly depart: Vec3; readonly angle: number; readonly couleur: string };
  };
  /** Ids sélectionnés / survolés, à surligner. */
  readonly selection: readonly string[];
  readonly survol: readonly string[];
  /** Message d'erreur transitoire (saisie refusée…), annoncé par `aria-live`. */
  readonly erreur: string | null;
}

/** Contexte partagé fourni par le rendu à chaque événement. */
export interface ContexteOutil {
  readonly modele: Modele;
  /** Sélection courante (ids d'entités ou d'occurrences), tenue par l'interface. */
  readonly selection: readonly string[];
  /** Locale du champ Mesures. */
  readonly separateurDecimal: "." | ",";
  /** Sélection de cadre : l'interface fournit les ids dont la projection écran est dans / touche le cadre. */
  readonly entitesDansCadre?: (de: { x: number; y: number }, a: { x: number; y: number }, genre: "fenetre" | "croisee") => readonly string[];
  /** (Ajout lot 2, optionnel) Même chose pour un contour polygonal quelconque (Lasso). */
  readonly entitesDansContour?: (contour: readonly { x: number; y: number }[], genre: "fenetre" | "croisee") => readonly string[];
  /** (Ajout lot 2, optionnel) Occurrence (groupe / composant) en cours d'édition ; absent = racine (§5.6). */
  readonly dans?: string;
  /** (Lot 5) Matière courante du pot de peinture (id dans `annotations.materiaux`) ; absent = matière par défaut. */
  readonly materiauCourant?: string;
  /** (Lot 5) Balise choisie dans le panneau Balises ; absent = aucune. */
  readonly baliseCourante?: string;
  /** (Lot 4) Repère de saisie courant (Axes) ; absent = repère du modèle. */
  readonly repere?: Repere;
  /** (Lot 6) Moteur booléen injecté par l'interface (manifold-3d) ; absent = outils de solides indisponibles. */
  readonly booleens?: AdaptateurBooleens;
  /** (Lot 4) Hauteur d'œil courante (m) pour les outils caméra, lue par la vue. */
  readonly hauteurOeil?: number;
  /** Lecteur (droit `read`, C25) : mesure sans rien créer (CA-MET-4). */
  readonly lecture?: boolean;
}

/** Moteur booléen de maillages (lot 6, MO-4) : synchrone une fois chargé ; les maillages sont en coordonnées monde. */
export interface AdaptateurBooleens {
  union(a: Maillage, b: Maillage): Maillage;
  difference(a: Maillage, b: Maillage): Maillage;
  intersection(a: Maillage, b: Maillage): Maillage;
}

export interface Transition<E> {
  readonly etat: E;
  /** Nouveau modèle si l'opération a été validée (sinon inchangé). */
  readonly modele?: Modele;
  /** Nouvelle sélection si l'outil la change. */
  readonly selection?: readonly string[];
  /** `true` si ce pas remplace le précédent dans l'historique (correction au champ Mesures). */
  readonly remplaceDernier?: boolean;
  /** Libellé de l'opération pour l'historique (« Ligne », « Rectangle »…). */
  readonly operation?: string;
  /** (Ajout lot 2, optionnel) Nouveau contexte d'édition : id d'occurrence, ou `null` = retour à la racine. */
  readonly dans?: string | null;
  /** (Ajout lot 3, optionnel) Outil à activer après cette transition (Diviser rend la main à Sélection). */
  readonly outil?: string;
  /** (Lot 4) `true` : revenir à l'outil précédent (Axes, outils temporaires). */
  readonly outilPrecedent?: boolean;
  /** (Lot 5) Nouvelle matière courante du pot de peinture (Prélever) ; `null` = matière par défaut. */
  readonly materiauCourant?: string | null;
  /** (Lot 5) Nouvelle balise courante (Alt = prélever). */
  readonly baliseCourante?: string | null;
  /** (Lot 4) Texte à faire saisir par l'interface (outil Texte) : l'interface renvoie le résultat par `saisie`. */
  readonly editerTexte?: { readonly id: string; readonly texte: string };
}

export interface MachineOutil<E> {
  readonly id: string;
  initial(): E;
  traiter(etat: E, ev: EvenementOutil, ctx: ContexteOutil): Transition<E>;
  vue(etat: E, ctx: ContexteOutil): VueOutil;
}

export type { Inference, ModeAlt, Verrou };
