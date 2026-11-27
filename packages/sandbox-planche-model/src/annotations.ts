/**
 * Annotations et attributs de la Planche (lots 4 à 6) — types purs, rangés dans `Modele.annotations` :
 * guides du Mètre et du Rapporteur, cotes, textes, plans de coupe, matières d'apparence (C15), balises (P-9 : une
 * balise correspond à un calque de l'Atelier ; la correspondance est faite à la persistance, lot 7) et repère de
 * saisie des Axes (R5 : jamais le repère des coordonnées stockées). Les identifiants sortent du même compteur que la
 * géométrie (`prochainId`), préfixés : `g` guide, `c` cote, `t` texte, `p` plan de coupe, `m` matière, `b` balise.
 *
 * Les opérations sont dans `geometrie-libre.ts` (`modifierAnnotations`, `peindreFaces`, `peindreOccurrences`,
 * `baliserOccurrences`, `redimensionner`) : elles passent par le chantier `Travail`, donc par un pas d'annulation.
 */
import type { Emplacement } from "./emplacement.js";
import type { PointDeBase } from "./point-de-base.js";
import type { RepereEnregistre } from "./reperes.js";
import type { Id } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

export type Guide =
  /** Ligne de guide infinie (depuis une arête) : point et direction unitaire. */
  | { readonly id: Id; readonly genre: "ligne"; readonly origine: Vec3; readonly direction: Vec3 }
  /** Guide fini (depuis un point) : segment. */
  | { readonly id: Id; readonly genre: "segment"; readonly origine: Vec3; readonly fin: Vec3 }
  /** Point de guide. */
  | { readonly id: Id; readonly genre: "point"; readonly origine: Vec3 };

/**
 * (Cas 2, lot 1 « Cotation ») Champs communs à toutes les cotes : texte forcé (remplace la valeur affichée, la valeur
 * mesurée reste lisible dans l'Info entité), style de cote nommé (`ReglagesPlanche.stylesCote`), chemin du contexte
 * ouvert à la création (association aux sommets d'un groupe ou d'un composant ouvert ; absent = racine).
 */
export interface ChampsCote {
  readonly texteForce?: string;
  readonly style?: Id;
  readonly chemin?: readonly Id[];
  /** (Protocole 1.3) Balise de l'annotation : la balise cachée, l'annotation l'est aussi ; absent = toujours montrée. */
  readonly balise?: Id;
}

/** Direction mesurée d'une cote linéaire : vraie longueur, composante horizontale, dénivelé, ou selon un axe du repère. */
export type DirectionCote = "alignee" | "horizontale" | "verticale" | "axe-x" | "axe-y" | "axe-z";

/** Plage gardée d'une cote (saisie par l'utilisateur, jamais fournie par la Planche) : bornes en mètres, au moins une. */
export interface PlageCote {
  readonly min?: number;
  readonly max?: number;
}

export type Cote =
  /** Cote linéaire entre deux points ; `sommets` = association aux sommets (la valeur suit leur déplacement). */
  | (ChampsCote & {
      readonly id: Id;
      readonly genre: "lineaire";
      readonly a: Vec3;
      readonly b: Vec3;
      readonly sommets?: readonly [Id, Id];
      /** Point par lequel passe la ligne de cote (décalage par rapport au segment mesuré). */
      readonly position: Vec3;
      /** (Cas 2, lot 1) Direction mesurée ; absent = alignée. */
      readonly direction?: DirectionCote;
      /** (Cas 2, lot 1) Plage gardée : une opération qui sort la cote de sa plage est signalée, jamais corrigée. */
      readonly plage?: PlageCote;
    })
  /** Cote de diamètre d'une courbe fermée (cercle, polygone). */
  | (ChampsCote & {
      readonly id: Id;
      readonly genre: "diametre";
      readonly courbe: Id;
      readonly centre: Vec3;
      readonly rayon: number;
      readonly normale: Vec3;
      readonly position: Vec3;
    })
  /** (Cas 2, lot 1) Cote de niveau : altitude d'un point rapportée au ±0,00 du projet (z = 0) ou à l'altitude NGF déclarée. */
  | (ChampsCote & {
      readonly id: Id;
      readonly genre: "niveau";
      readonly point: Vec3;
      readonly sommet?: Id;
      readonly reference: "projet" | "ngf";
      readonly position: Vec3;
    })
  /** (Cas 2, lot 1) Cote de pente entre deux points : dénivelé / distance horizontale en %, flèche dans le sens de la descente. */
  | (ChampsCote & {
      readonly id: Id;
      readonly genre: "pente";
      readonly a: Vec3;
      readonly b: Vec3;
      readonly sommets?: readonly [Id, Id];
      readonly position: Vec3;
    })
  /** (Cas 2, lot 1) Cote angulaire (Rapporteur) : sommet de l'angle et un point sur chacun des deux côtés. */
  | (ChampsCote & {
      readonly id: Id;
      readonly genre: "angulaire";
      readonly centre: Vec3;
      readonly a: Vec3;
      readonly b: Vec3;
      readonly normale: Vec3;
      readonly position: Vec3;
    });

export type TexteAnnotation =
  /** Texte avec repère : ancre sur une entité (ou un point), position du texte, ligne de rappel entre les deux. */
  | {
      readonly id: Id;
      readonly genre: "repere";
      readonly ancre: Vec3;
      readonly entite?: Id;
      /** (Cas 2, lot 1) Chemin du contexte de l'entité (racine si absent) : l'ancre suit l'entité quand elle bouge. */
      readonly chemin?: readonly Id[];
      readonly position: Vec3;
      readonly texte: string;
      readonly etiquettePiece?: boolean;
      /** (Protocole 1.3) Balise du texte : la balise cachée, le texte l'est aussi ; absent = toujours montré. */
      readonly balise?: Id;
    }
  /** Texte écran : fixé en pixels, ne suit pas la caméra. */
  | { readonly id: Id; readonly genre: "ecran"; readonly ecran: { readonly x: number; readonly y: number }; readonly texte: string };

export interface PlanDeCoupe {
  readonly id: Id;
  readonly origine: Vec3;
  /** Normale unitaire : la partie du modèle du côté de la normale est coupée (cachée) quand la coupe est active. */
  readonly normale: Vec3;
  /** Axes unitaires du rectangle dessiné et ses demi-tailles (épouse la face d'origine). */
  readonly u: Vec3;
  readonly w: Vec3;
  readonly demiU: number;
  readonly demiW: number;
  readonly actif: boolean;
  readonly inverse: boolean;
  readonly nom: string;
}

/** Matière d'apparence : nom et couleur unie (`#rrggbb`), jamais une donnée de projet (C15, P-8). */
export interface Materiau {
  readonly id: Id;
  readonly nom: string;
  readonly couleur: string;
  /** (Cas 4, étape 5) Motif de hachure de la matière coupée (`annotations.motifs`) ; absent = aplat gris. */
  readonly motif?: Id;
}

export interface Balise {
  readonly id: Id;
  readonly nom: string;
  readonly couleur: string;
  readonly visible: boolean;
  /** (Cas 2, lot 2) Balise exclue de l'accrochage : ses objets restent affichés, rien ne s'y accroche. */
  readonly horsAccrochage?: boolean;
}

/** Repère de saisie (outil Axes) : origine et axes unitaires rouge / vert / bleu dans le repère stocké. */
export interface Repere {
  readonly origine: Vec3;
  readonly x: Vec3;
  readonly y: Vec3;
  readonly z: Vec3;
}

/** Scène (panneau §6.8) : caméra enregistrée par commande, comme une vue 3D (D-053). */
export interface Scene {
  readonly id: Id;
  readonly nom: string;
  readonly position: Vec3;
  readonly cible: Vec3;
  readonly champDeVision: number;
  readonly projection: "perspective" | "parallele";
  /** Ombres affichées dans la scène (sinon option d'affichage, R10). */
  readonly ombres?: boolean;
  /**
   * (Chantier Axes, AX-3) Repère de travail rappelé par la scène, sur option explicite : instantané (jamais modifié
   * ensuite), identifiant et révision du repère enregistré d'origine s'il y en avait un, plan et verrou. Absent : la
   * scène ne rappelle que la caméra (scènes antérieures inchangées).
   */
  readonly repere?: CaptureRepere;
}

/**
 * Correspondance source → modèle consignée à l'import (chantier Axes, AX-5 ; concept § 9) : format, nom du fichier,
 * mètres par unité du fichier. Seule cette correspondance explicite permet un export « en coordonnées d'origine » ;
 * aucune correspondance géographique n'est déduite.
 */
export interface CorrespondanceImport {
  readonly id: Id;
  readonly format: "obj" | "stl" | "ifc";
  readonly fichier: string;
  readonly metresParUnite: number;
}

/** Capture de repère d'une scène (chantier Axes, AX-3). */
export interface CaptureRepere {
  readonly instantane: Repere;
  readonly id?: Id;
  readonly revision?: number;
  readonly plan: "xy" | "xz" | "yz";
  readonly verrou: boolean;
}

/** Réglages de la Planche (panneau Info modèle §6.11) : données de la Planche ; la précision d'affichage reste une préférence (R10). */
export interface ReglagesPlanche {
  readonly accrochageLongueur: number | null;
  readonly accrochageAngle: number | null;
  readonly extremitesTexte: "aucune" | "barre" | "fleche-ouverte" | "fleche-fermee" | "point";
  readonly alignerTexte: "ecran" | "epingle";
  readonly extremitesCote: "aucune" | "barre" | "fleche-ouverte" | "fleche-fermee" | "point";
  readonly alignerCote: "dessus" | "centre" | "exterieur" | "ecran";
  /** (Cas 2, lot 1) Format des valeurs de cote ; absent = mètres. */
  readonly formatCote?: FormatCote;
  /** (Cas 2, lot 1) Style appliqué aux cotes sans style propre ; absent = réglages ci-dessus. */
  readonly styleCote?: Id;
  /** (Cas 2, lot 1) Styles de cote nommés ; absent = aucun. */
  readonly stylesCote?: Readonly<Record<Id, StyleCote>>;
  /** (Extension « Emplacement ») Position saisie de la Planche et nord vrai ; absent = non renseigné. */
  readonly emplacement?: Emplacement;
  /** (Protocole des extensions, lot 5) Données attachées au projet par les extensions : `{ <extension> : { <clé> : valeur } }`. */
  readonly donneesExtensions?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** (Cas 4, étape 2) Point de base du projet : coordonnées projetées déclarées de l'origine ; absent = non déclaré. */
  readonly pointDeBase?: PointDeBase;
  /** (Cas 2, lot 2) Unité d'affichage et de saisie des longueurs ; absent = mètres. Les valeurs stockées restent en mètres. */
  readonly uniteSaisie?: UniteSaisie;
  /** (Cas 2, lot 2) Paramètres nommés du projet (valeurs saisies par l'utilisateur, en mètres). */
  readonly parametres?: Readonly<Record<Id, ParametreProjet>>;
  /** (Cas 2, lot 2) Ressaut maximal à signaler, saisi par l'utilisateur avec sa source ; absent = « non évalué ». */
  readonly ressautMax?: { readonly valeur: number; readonly source: string };
  /** (Cas 2, lot 3) Tolérances du relevé du Contrôle, saisies dans le panneau ; absent = tolérances d'origine. */
  readonly controle?: import("./controle-l3.js").ReglagesControle;
  /** (Cas 2, lot 3) Fichier de règles des pièces du permis, sourcé, archivé tel quel ; absent = complétude non évaluée. */
  readonly reglesPieces?: import("./controle-l3.js").ReglesPieces;
}
/** (Cas 2, lot 2) Unité d'affichage et de saisie. */
export type UniteSaisie = "m" | "cm" | "mm" | "pieds-pouces";
/** (Cas 2, lot 2) Paramètre nommé du projet (épaisseur de mur, hauteur sous plafond, module…), valeur en mètres. */
export interface ParametreProjet {
  readonly id: Id;
  readonly nom: string;
  readonly valeur: number;
}
/** Format des valeurs de cote : mètres, mètres avec le millimètre en exposant (à la française), centimètres sans unité. */
export type FormatCote = "metres" | "metres-mm" | "centimetres";

/** (Cas 2, lot 1) Style de cote nommé : extrémités, alignement du texte et format, appliqués cote par cote. */
export interface StyleCote {
  readonly id: Id;
  readonly nom: string;
  readonly extremites: ReglagesPlanche["extremitesCote"];
  readonly aligner: ReglagesPlanche["alignerCote"];
  readonly format: FormatCote;
}

export const REGLAGES_DEFAUT: ReglagesPlanche = { accrochageLongueur: 0.01, accrochageAngle: 15, extremitesTexte: "fleche-fermee", alignerTexte: "epingle", extremitesCote: "barre", alignerCote: "centre" };

/**
 * Lien d'une surface étendue depuis des arêtes (Pousser/Tirer d'arêtes, écart Fadi D-196) : quand les arêtes sources
 * bougent, la surface est recalculée ; si la surface elle-même est modifiée (sommets créés déplacés ou effacés,
 * géométrie étrangère rattachée), le lien est rompu et la surface devient de la géométrie libre ordinaire.
 */
export interface Extrusion {
  readonly id: Id;
  readonly genre: "balayage" | "couronne";
  /** Arêtes sources (contexte racine). */
  readonly sources: readonly Id[];
  /** Balayage : déplacement ; couronne : `distance` (> 0 vers l'extérieur). */
  readonly vecteur?: Vec3;
  readonly distance?: number;
  readonly symetrique: boolean;
  /** Positions des sommets sources et des sommets créés au dernier calcul. */
  readonly sommetsSources: Readonly<Record<Id, Vec3>>;
  readonly sommetsCrees: Readonly<Record<Id, Vec3>>;
  /** Nombre de faces touchant un sommet créé au dernier calcul (une face effacée ou découpée rompt le lien). */
  readonly faces: number;
}

/**
 * (Lot L11) Lien d'une pièce de profilé (occurrence de la racine) à son arête source : la pièce suit l'arête tant
 * qu'elle n'est pas modifiée elle-même. Indexé par l'identifiant de l'occurrence ; l'arête n'est jamais portée par la
 * définition, partagée entre copies.
 */
export interface LienPiece {
  /** Identifiant de l'occurrence (pièce). */
  readonly id: Id;
  readonly arete: Id;
  /** Sommets de l'arête dans le sens de la pièce (A → B) et leurs positions au dernier calcul. */
  readonly a: Id;
  readonly b: Id;
  readonly posA: Vec3;
  readonly posB: Vec3;
  /** Arêtes voisines coupées en onglet au début / à la fin, et la position de leur autre sommet au dernier calcul. */
  readonly ongletDebut?: { readonly arete: Id; readonly sommet: Id; readonly pos: Vec3 };
  readonly ongletFin?: { readonly arete: Id; readonly sommet: Id; readonly pos: Vec3 };
  /** Instantané de la pièce au dernier calcul : toute modification de la pièce elle-même rompt le lien. */
  readonly definition: Id;
  readonly transformation: readonly number[];
  readonly empreinte: string;
  /** Normale de la boucle (repère des pièces posées sur une boucle), sinon absente (« haut » = Z). */
  readonly haut?: Vec3;
}

/**
 * (Cas 4 du catalogue, étape 1 : niveaux d'étage, D4-F5-001) Niveau d'étage nommé : altitude relative au ±0,00 du
 * dessin (z = 0, en mètres) et hauteur d'étage déclarée. Les objets de la racine qui portent ce niveau
 * (`Occurrence.niveau`) suivent son altitude. Opérations dans `niveaux.ts`.
 */
export interface Niveau {
  readonly id: Id;
  readonly nom: string;
  readonly altitude: number;
  readonly hauteur: number;
}

/**
 * (Cas 4 du catalogue, étape 3 : locaux, D9-F10-016) Local (pièce) : numéro, nom, usage, appuyé sur une face de sol de
 * la racine (`face`). Surface, périmètre, niveau et hauteur sous plafond mesurée sont **calculés** depuis la géométrie
 * (`locaux.ts`), jamais stockés ; seule une hauteur sous plafond **déclarée** peut l'être.
 */
export interface Local {
  readonly id: Id;
  readonly numero: string;
  readonly nom: string;
  readonly usage?: string;
  readonly face: Id;
  /** Hauteur sous plafond déclarée (m) ; absente = mesurée si possible, sinon non évaluée. */
  readonly hauteur?: number;
}

/**
 * (Cas 4 du catalogue, étape 4 : murs à épaisseur, D4-F5-003) Mur : axe (polyligne horizontale), épaisseur, hauteur,
 * côté de référence ; sa géométrie est le groupe `occurrence`, dont `signature` relève les sommets à la pose (un groupe
 * modifié à la main n'est jamais régénéré). Opérations dans `murs.ts`.
 */
export interface Mur {
  readonly id: Id;
  readonly axe: readonly Vec3[];
  readonly ferme: boolean;
  readonly epaisseur: number;
  readonly hauteur: number;
  readonly reference: "axe" | "interieur" | "exterieur";
  readonly occurrence: Id;
  readonly signature: string;
}

/**
 * (Cas 4 du catalogue, étape 5 : D7-S-001) Famille de lignes d'un motif de hachure, en mm papier : angle (degrés), point
 * de départ, décalage entre lignes (dx le long, dy perpendiculaire) et tirets (positif trait, négatif blanc ; vide = trait
 * continu) — la forme des fichiers .pat. Aucun motif n'est fourni par Fadi : chacun est saisi ou importé.
 */
export interface FamilleHachure {
  readonly angle: number;
  readonly x0: number;
  readonly y0: number;
  readonly dx: number;
  readonly dy: number;
  readonly tirets: readonly number[];
}
export interface MotifHachure {
  readonly id: Id;
  readonly nom: string;
  readonly familles: readonly FamilleHachure[];
  /** Origine : saisi dans le panneau, ou importé d'un fichier .pat (nom du fichier). */
  readonly source: { readonly genre: "saisie" } | { readonly genre: "pat"; readonly fichier: string };
}

export interface Annotations {
  readonly guides: Readonly<Record<Id, Guide>>;
  readonly cotes: Readonly<Record<Id, Cote>>;
  readonly textes: Readonly<Record<Id, TexteAnnotation>>;
  readonly plansDeCoupe: Readonly<Record<Id, PlanDeCoupe>>;
  readonly materiaux: Readonly<Record<Id, Materiau>>;
  readonly balises: Readonly<Record<Id, Balise>>;
  /**
   * Ancien repère de saisie unique (outil Axes avant AX-1) : lu une seule fois comme contexte de travail initial
   * (AX-D4), jamais réécrit. Le contexte de travail est désormais personnel, hors du document (AX-D3).
   */
  readonly repere?: Repere;
  /** (Chantier Axes) Repères enregistrés, nommés et révisés ; absent = aucun. */
  readonly reperes?: Readonly<Record<Id, RepereEnregistre>>;
  /** (Chantier Axes, AX-5) Correspondances consignées à l'import (unité source) ; absent = aucun import consigné. */
  readonly correspondances?: Readonly<Record<Id, CorrespondanceImport>>;
  /** Scènes enregistrées (lot 5). */
  readonly scenes?: Readonly<Record<Id, Scene>>;
  /** Réglages de la Planche (lot 5) ; absent = `REGLAGES_DEFAUT`. */
  readonly reglages?: ReglagesPlanche;
  /** Surfaces liées à leurs arêtes sources (D-196) ; absent = aucune. */
  readonly extrusions?: Readonly<Record<Id, Extrusion>>;
  /** (Lot L11) Pièces de profilé liées à leur arête source ; absent = aucune. */
  readonly pieces?: Readonly<Record<Id, LienPiece>>;
  /** (Cas 4, niveaux d'étage) Niveaux d'étage nommés ; absent = aucun. */
  readonly niveaux?: Readonly<Record<Id, Niveau>>;
  /** (Cas 4, étape 3) Locaux (pièces) appuyés sur une face de sol de la racine ; absent = aucun. */
  readonly locaux?: Readonly<Record<Id, Local>>;
  /** (Cas 4, étape 4) Murs à épaisseur : tracé d'axe et paramètres, géométrie dans un groupe de la racine. */
  readonly murs?: Readonly<Record<Id, Mur>>;
  readonly motifs?: Readonly<Record<Id, MotifHachure>>;
}

export const ANNOTATIONS_VIDES: Annotations = Object.freeze({
  guides: {},
  cotes: {},
  textes: {},
  plansDeCoupe: {},
  materiaux: {},
  balises: {},
});

/** Version mutable, utilisée par le chantier. */
export interface AnnotationsMutables {
  guides: Record<Id, Guide>;
  cotes: Record<Id, Cote>;
  textes: Record<Id, TexteAnnotation>;
  plansDeCoupe: Record<Id, PlanDeCoupe>;
  materiaux: Record<Id, Materiau>;
  balises: Record<Id, Balise>;
  repere?: Repere;
  reperes: Record<Id, RepereEnregistre>;
  correspondances: Record<Id, CorrespondanceImport>;
  scenes: Record<Id, Scene>;
  reglages?: ReglagesPlanche;
  extrusions: Record<Id, Extrusion>;
  pieces: Record<Id, LienPiece>;
  niveaux: Record<Id, Niveau>;
  locaux: Record<Id, Local>;
  murs: Record<Id, Mur>;
  motifs: Record<Id, MotifHachure>;
}

export const annotationsDe = (a: Annotations | undefined): Annotations => a ?? ANNOTATIONS_VIDES;

/** Genre d'annotation d'après le préfixe de l'identifiant (ou null pour une entité géométrique). */
export function genreAnnotation(id: Id): "guide" | "cote" | "texte" | "plan" | "materiau" | "balise" | "scene" | null {
  switch (id.charAt(0)) {
    case "v":
      return "scene";
    case "g":
      return "guide";
    case "c":
      return "cote";
    case "t":
      return "texte";
    case "p":
      return "plan";
    case "m":
      return "materiau";
    case "b":
      return "balise";
    default:
      return null;
  }
}

export const COULEUR_MATERIAU_DEFAUT = "#ffffff";
export const NOM_MATERIAU_DEFAUT = "Matière par défaut";
