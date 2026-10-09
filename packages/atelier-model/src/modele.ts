/**
 * Modèle typé de l'Atelier (contrat `modele-atelier/1`) : identités définition / occurrence, propriétés typées
 * avec provenance et statut, relations porteuses de sens, références topologiques, site (parcelle, emprise,
 * hypothèses, sources, structure déclarée). Objet immuable : les réducteurs retournent un nouvel état.
 */
import type { Cintre } from "./cintres.js";
import type { ProfilVertical } from "./profils-verticaux.js";
import type { OuvrantPorte } from "./ouvrants.js";
import type { Menuiserie } from "./menuiserie.js";
import type { Classe, Ontologie } from "./ontologie.js";
import type { Angle, Longueur, Point2, SommetParcelle, Surface } from "./unites.js";

export type Provenance = "saisie" | "import" | "calcul" | "regle";
export type StatutPropriete = "declaree" | "verifiee" | "a-verifier";

export interface Propriete {
  valeur: unknown;
  unite?: string;
  provenance: Provenance;
  statut: StatutPropriete;
}

export interface Niveau {
  id: string;
  nom: string;
  /** Altitude en mètres, repère local, décimale conservée (ex. −3,2). */
  elevation: number;
  hauteur: number | null;
  ordre: number;
}

export interface Calque {
  id: string;
  nom: string;
  couleur: string | null;
  remplissage: string | null;
  visible: boolean;
  verrouille: boolean;
  ordre: number;
  /** Calque parent (D-080, calques imbriqués) ; absent : à la racine. */
  parentId?: string;
  /**
   * Calque gelé (D-103) : ses objets sortent de tout l'affichage (plan, 3D, accrochage, sélection), des vues et des
   * exports, et ne se modifient plus ; absent : non gelé. Le masquage (`visible`) ne vaut que pour le plan et les vues.
   */
  gele?: boolean;
  /** Propriétés du calque (D-088), mêmes règles que celles des objets ; absent : aucune. */
  proprietes?: Record<string, Propriete>;
}

export type AlignementMur = "gauche" | "axe" | "droite";

export interface ParamsMur {
  a: Point2;
  b: Point2;
  epaisseur: Longueur;
  /** Hauteur absente = « non évaluée » (mur tracé en plan, exclu des volumes), jamais une valeur par défaut. */
  hauteur: Longueur | null;
  niveauHautId: string | null;
  alignement: AlignementMur;
  exterieur: boolean;
  nom: string | null;
  /**
   * Mur courbe (D-086) : renflement de l'axe a → b (b = tan(θ/4), convention DXF ; > 0 : sens direct), |b| ≤ 1
   * (demi-cercle au plus) ; absent = mur droit.
   */
  renflement?: number;
}

export interface ParamsOuverture {
  murHoteId: string;
  /** Position paramétrique le long de l'axe du mur hôte, 0 = a, 1 = b. */
  position: number;
  largeur: Longueur;
  hauteur: Longueur;
  allege: Longueur | null;
  repere: string | null;
  /** Porte seulement : sens d'ouverture (D-037) ; absent ou null : non renseigné. */
  ouvrant?: OuvrantPorte | null;
  /** Fenêtre et porte : menuiserie paramétrée (D-101, D-113) ; absente : panneau simple, menuiserie non évaluée. */
  menuiserie?: Menuiserie | null;
  /** Haut cintré (D-141) : plein cintre, surbaissé ou ogive ; absent : baie rectangulaire. `hauteur` va jusqu'à la clé. */
  cintre?: Cintre | null;
}

export interface Contour {
  contour: Point2[];
  trous: Point2[][];
}

export interface ParamsDalle extends Contour {
  epaisseur: Longueur;
  decalageBase: Longueur;
  nom: string | null;
  /** Usage déclaré (D-059) : plancher ou dalle isolée, pour filtrer et quantifier ; absent = non renseigné. */
  usage?: UsageDalle;
  /**
   * Dalle inclinée (D-140) : pente (degrés, 0 à 60) et direction de montée (degrés, 0 = +x) ; le dessous part de la
   * hauteur de base au point le plus bas et monte selon la pente ; l'épaisseur reste mesurée à la verticale.
   */
  pente?: PenteDalle;
  /** Sens de l'épaisseur (D-144) : « bas » = dessus à la base (épaisseur sous la base) ; absent = vers le haut. */
  sens?: "bas";
  /** Retombée de rive (D-144) : bande sous la dalle le long du contour extérieur ; absente = aucune. */
  retombee?: { largeur: Longueur; hauteur: Longueur };
}

export interface PenteDalle {
  angle: Angle;
  direction: Angle;
}

export const USAGES_DALLE = ["plancher", "dalle-isolee"] as const;
export type UsageDalle = (typeof USAGES_DALLE)[number];

export type TypeToiture = "plate" | "monopente" | "bipente";

export interface ParamsToiture extends Contour {
  type: TypeToiture;
  epaisseur: Longueur;
  pente: Angle | null;
  decalageBase: Longueur;
  nom: string | null;
}

export interface ParamsEscalier {
  a: Point2;
  b: Point2;
  largeur: Longueur;
  hauteurAFranchir: Longueur;
  marches: number | null;
  contremarches: number | null;
  epaisseurPaillasse: Longueur | null;
  decalageBase: Longueur;
  niveauDepartId: string;
  niveauArriveeId: string | null;
  groupe: string | null;
  referencePlanSeulement: boolean;
  nom: string | null;
}

export interface ParamsPiece extends Contour {
  code: string | null;
  nom: string;
  categorie: string | null;
  aireDeclaree: Surface | null;
  notes: string | null;
  etiquette: Point2 | null;
  /** Hauteur propre déclarée (D-059) : volume = aire nette × hauteur ; absente = volume non évalué. */
  hauteur?: Longueur;
}

export interface ParamsEspace {
  polygones: Contour[];
  code: string | null;
  nom: string;
  categorie: string | null;
  aireDeclaree: Surface | null;
  notes: string | null;
  etiquette: Point2 | null;
  /** Hauteur propre déclarée (D-059). */
  hauteur?: Longueur;
  /** Espace sur plusieurs niveaux (D-142) : monte jusqu'à ce niveau (double hauteur, vide, gaine) ; exclusif de `hauteur`. */
  niveauHautId?: string;
}

export interface ParamsZone extends Contour {
  nom: string;
  categorie: string | null;
}

export interface ParamsPoteau {
  point: Point2;
  /**
   * Forme de la section (D-139) : rectangle (par défaut, dont « basic-square » importé), « cercle » (diamètre =
   * largeur), profilés « I », « T », « L », « U » (largeur × profondeur, parois d'épaisseur `epaisseurProfil`).
   */
  formeId: string;
  /** Épaisseur des parois d'un profilé I, T, L ou U (saisie, jamais supposée) ; absente pour les autres formes. */
  epaisseurProfil?: Longueur;
  largeur: Longueur;
  profondeur: Longueur;
  hauteur: Longueur | null;
  angle: Angle;
  nom: string | null;
  statutConception: string | null;
  /** Section retournée (D-146) : profilé L symétrisé (retournement de l'axe local y avant rotation) ; absent = non. */
  miroir?: true;
}

export interface ParamsSolide extends Contour {
  ferme: boolean;
  hauteur: Longueur | null;
  decalageBase: Longueur;
  epaisseur: Longueur | null;
  /** Rôle conservé tel quel (`solid`, `clearance`, `core-zone`, `ramp-*`…) ; un rôle inconnu est listé à l'import. */
  role: string;
  nom: string | null;
  couleur: string | null;
  /** Solide associé (D-114) : esquisse fermée dont il suit le profil ; absent : solide libre. */
  sourceId?: string;
  /** Dépouille (D-148), degrés : > 0 la face haute se resserre, < 0 elle s'évase ; absente = droite. */
  depouille?: Angle;
  /** Extrusion oblique (D-148) : axe penché de `angle` (degrés) vers `direction` (degrés, 0 = +x) ; absente = verticale. */
  inclinaison?: { angle: Angle; direction: Angle };
  /**
   * Profil vertical extrudé horizontalement (D-154) : emprise (contour), hauteur et base en sont dérivées ; le
   * volume est celui du profil, pas le prisme de l'emprise.
   */
  profilVertical?: ProfilVertical;
}

export type FormeEsquisse = "ligne" | "polyligne" | "arc" | "cercle" | "rectangle" | "polygone" | "spline" | "construction" | "hachure" | "ellipse";

export interface ParamsEsquisse {
  forme: FormeEsquisse;
  points: Point2[];
  ferme: boolean;
  centre: Point2 | null;
  rayon: Longueur | null;
  angleDebut: Angle | null;
  angleFin: Angle | null;
  motif: string | null;
  /** Ellipse (D-046) : `rayon` = demi-grand axe, `rayonB` = demi-petit axe, `rotation` = angle du grand axe. */
  rayonB?: Longueur | null;
  rotation?: Angle | null;
  /**
   * Polyligne à segments en arc (D-063) : renflement de chaque segment (b = tan(θ/4), convention DXF ; 0 = droit),
   * un par segment (fermeture comprise) ; absent = tous droits.
   */
  renflements?: number[];
  /** Hachure associative (D-092) : objet dont la hachure suit le contour fermé ; absent : hachure libre. */
  sourceId?: string;
  /** Courbe (D-082) : tangente imposée à chaque point (vecteur en m), null = libre ; absent = toutes libres. */
  tangentes?: ({ x: number; y: number } | null)[];
  /**
   * Dégradé d'une hachure (D-120) : remplissage du gris `de` au gris `a` (0 = noir, 1 = blanc) selon la direction
   * `angle` ; il remplace le motif. Convention graphique, jamais une donnée de projet. Absent : motif de traits.
   */
  degrade?: DegradeHachure;
  /**
   * Lignes d'un motif nommé importé (D-121, DXF) : familles de traits parallèles (angle en degrés, pas en mètres
   * modèle — le motif suit le dessin, pas la feuille) ; absent : motif du catalogue désigné par `motif`.
   */
  motifLignes?: { angle: number; pas: number }[];
  /**
   * Axe associé (D-132) : ligne de construction passant par le centre d'un cercle, d'un arc ou d'une ellipse
   * (`sourceId`), dans la direction `angle` (degrés, relative à l'orientation d'une ellipse), dépassant le contour de
   * `debord` mètres ; elle suit sa source. Source supprimée : l'axe garde sa place et perd le lien.
   */
  axeDe?: { sourceId: string; angle: number; debord: number };
}

export interface DegradeHachure {
  de: number;
  a: number;
  angle: Angle;
}

export interface ParamsReferencePlan extends Contour {
  source: string | null;
  echelle: number | null;
  nom: string | null;
}

export interface ParamsCotation {
  a: Point2;
  b: Point2;
  decalage: Longueur;
  /**
   * Cote rattachée à une référence externe (D-153) : extrémités dans le repère local de la source, a et b dérivés par
   * le calage de la référence ; `aVerifier` quand la référence épingle depuis une autre publication de la source.
   */
  externe?: { referenceId: string; a: { x: number; y: number }; b: { x: number; y: number }; revisionSource: number; aVerifier?: true };
}

export interface ParamsTexte {
  position: Point2;
  texte: string;
  /** Orientation (D-146), degrés, sens direct depuis +x ; absente = horizontale. */
  angle?: Angle;
}

export interface ParamsEtiquette {
  position: Point2;
  texte: string;
  objetId: string | null;
}

export interface ParamsBlocOccurrence {
  position: Point2;
  angle: Angle;
  echelle: number;
  /** Occurrence symétrisée (D-071) : contenu retourné autour de l'axe x local avant rotation ; absent = non. */
  miroir?: true;
}

/** Garde-corps simple (lot 5) : tracé en plan, hauteur saisie (jamais déduite d'une règle), remplissage. */
export interface ParamsGardeCorps {
  points: Point2[];
  ferme: boolean;
  hauteur: Longueur;
  epaisseur: Longueur;
  remplissage: "barreaudage" | "plein" | "vitre";
  decalageBase: Longueur;
  nom: string | null;
}

/**
 * Représentation importée (lot 6, D-006) : un produit IFC lu par web-ifc, gardé tel quel — classe et GlobalId
 * d'origine, maillage triangulé (repère local, z relatif au niveau), emprise au sol ; aucun paramètre ni historique
 * paramétrique inventé.
 */
export interface ParamsObjetImporte {
  ifcClasse: string;
  globalId: string;
  nom: string | null;
  type: string | null;
  maillage: { positions: number[]; indices: number[] };
  empreinte: Point2[];
  source: string | null;
}

/**
 * Solide exact (P2-1, D-177) : géométrie canonique **B-rep** (binaire OCCT en base64, repère local du niveau, z
 * relatif au niveau, avant pose) produite par le noyau `@parcours/geometry-exact` et revalidée par le serveur ;
 * maillage, volume, aire, faces : dérivés du brep par le même noyau (jamais recalculés par le modèle pur) ; pose en
 * plan (position, angle autour de z) appliquée à l'usage ; emprise = enveloppe convexe du maillage posé. Une
 * seule géométrie canonique (R15) : un objet paramétrique n'est jamais converti en brep, son extrusion sert d'opérande.
 */
export interface ParamsSolideExact {
  nom: string | null;
  couleur: string | null;
  brep: string;
  moteur: string;
  versionMoteur: string;
  empreinteBrep: string;
  maillage: { positions: number[]; indices: number[] };
  volume: number;
  aire: number;
  faces: number;
  position: Point2;
  angle: Angle;
  emprise: Point2[];
  /** Opération d'origine (provenance) : type, objets sources, libellé ; jamais rejouée par le modèle. */
  operation: { type: string; sources: string[]; libelle: string };
}

/** Pose rigide 3D (P2-2) : translation (m) et rotation vectorielle (rad, axe × angle) dans le repère de l'assemblage. */
export interface Pose3 { x: number; y: number; z: number; rx: number; ry: number; rz: number }
export interface Vecteur3 { x: number; y: number; z: number }

/**
 * Pièce mécanique (P2-2, DA-10-01) : géométrie canonique copiée de sa source à la création (brep exact et maillage
 * d'un `solide-exact`, ou maillage dérivé d'un solide paramétrique), jamais recalculée par le modèle ; posée dans son
 * assemblage (pose rigide) ; emprise en plan dérivée (enveloppe convexe du maillage posé, repère du niveau).
 */
export interface ParamsPieceMecanique {
  nom: string;
  /** Référence (numéro de pièce, DA-10-13 / 14) ; null tant que non numérotée. */
  reference: string | null;
  numero: number | null;
  /** Matériau déclaré (nom seulement : aucune propriété inventée, R3). */
  materiau: string | null;
  /** Objet source de la géométrie (provenance) ; peut avoir disparu. */
  sourceId: string | null;
  brep: string | null;
  empreinteBrep: string | null;
  moteur: string | null;
  versionMoteur: string | null;
  maillage: { positions: number[]; indices: number[]};
  volume: number | null;
  assemblageId: string | null;
  /** Pièce fixe (bâti) : le solveur ne la déplace pas. */
  fixe: boolean;
  pose: Pose3;
  emprise: Point2[];
  /** Masse volumique déclarée avec sa source (kg/m³) pour la masse et les inerties (DA-17-10) ; absente : « non évaluées ». */
  masseVolumique?: { valeur: number; source: string } | null;
}

/** Assemblage (P2-2, DA-10-06 / 07) : repère dans le niveau (position, angle autour de z, décalage z), numérotation, éclaté. */
export interface ParamsAssemblage {
  nom: string;
  numero: string | null;
  position: Point2;
  angle: Angle;
  z: number;
  /** Diagnostic du dernier solveur sur cet assemblage (bien contraint, sous-contraint…), null sans liaison. */
  diagnostic: string | null;
}

export type TypeLiaison = "encastrement" | "pivot" | "glissiere" | "rotule" | "coincidence" | "concentrique" | "parallele" | "angle" | "distance" | "plan";

/** Liaison entre deux pièces d'un même assemblage (DA-10-08 / 09) : références locales (point, axe, direction secondaire), valeur de pilotage. */
export interface ParamsLiaison {
  type: TypeLiaison;
  a: string;
  b: string;
  pa: Vecteur3;
  da: Vecteur3;
  ea: Vecteur3;
  pb: Vecteur3;
  db: Vecteur3;
  eb: Vecteur3;
  /** Pilotage : angle (°) pour pivot / angle, course ou distance (m) pour glissière / distance ; null sinon. */
  valeur: number | null;
  /** Diagnostic du solveur après la dernière résolution ; null tant que non résolue. */
  etat: string | null;
  /** Degrés de liberté laissés par la liaison. */
  ddl: number;
}

// ---------------------------------------------------------------------------
// Ontologie structure (P2-3, DA-08-01 à 19, DA-03-14, DA-10-10)
// ---------------------------------------------------------------------------

export type FormeSection = "rectangle" | "cercle" | "I" | "H" | "T" | "L" | "U" | "tube";
export type MateriauStructure = "acier" | "beton" | "bois" | "autre";

/**
 * Section d'un élément de structure : forme et dimensions saisies (m) ou copiées d'une ligne de catalogue sourcé
 * (D-180). Aucune valeur par défaut : une dimension absente refuse la commande. `profil` garde la provenance
 * (catalogue du projet, désignation, source citée) ; `masseLineique` (kg/m) n'existe que sourcée par le catalogue.
 */
export interface SectionStructure {
  forme: FormeSection;
  /** Dimension dans le plan de la section selon l'axe local y (largeur d'aile, côté, diamètre). */
  largeur: Longueur;
  /** Dimension selon l'axe local z (hauteur de section) ; égale à la largeur pour un cercle. */
  hauteur: Longueur;
  /** Épaisseur d'âme (I, H, T, L, U) ou de paroi (tube) ; absente pour rectangle et cercle. */
  epaisseur: Longueur | null;
  /** Épaisseur d'aile (I, H, T, U) ; absente sinon. */
  epaisseurAile: Longueur | null;
  profil: { catalogueId: string; designation: string; source: string } | null;
  masseLineique: number | null;
}

export type RolePoutre = "poutre" | "longrine" | "contreventement" | "tirant" | "lisse" | "panne" | "chevron" | "diagonale";

/** Élément linéaire de structure (DA-08-01, 03, 06, 07, 08) : axe 3D (a → b, altitudes relatives au niveau), section, matériau déclaré. */
export interface ParamsPoutre {
  nom: string | null;
  role: RolePoutre;
  a: Point2;
  b: Point2;
  /** Altitude de l'axe en a et en b, relative au niveau (m) : différentes pour un élément incliné. */
  za: number;
  zb: number;
  section: SectionStructure;
  /** Rotation de la section autour de l'axe (degrés) ; 0 = hauteur verticale. */
  rotation: Angle;
  materiau: MateriauStructure;
  /** Nom déclaré du matériau (nuance, classe), sans propriété inventée. */
  materiauNom: string | null;
  /** Élément préfabriqué (DA-08-15) ; sinon coulé ou monté en place. */
  prefabrique: boolean;
  trameId: string | null;
}

export interface AxeTrame {
  nom: string;
  /** Position le long de la direction de la trame (files : selon u ; rangs : selon n), m depuis l'origine. */
  position: number;
}

/** Trame structurale (DA-08-04, 05) : origine, orientation, files (selon u) et rangs (selon n) nommés ; génération contrôlée de poteaux et de poutres. */
export interface ParamsTrame {
  nom: string;
  origine: Point2;
  angle: Angle;
  files: AxeTrame[];
  rangs: AxeTrame[];
  /** Dernière génération faite depuis cette trame (compte des objets créés), null tant qu'aucune. */
  generation: { poteaux: number; poutres: number; hauteur: number } | null;
}

/** Plaque (DA-08-09) : contour dans le plan, épaisseur, base relative au niveau. */
export interface ParamsPlaque extends Contour {
  nom: string | null;
  epaisseur: Longueur;
  z: number;
  materiau: MateriauStructure;
  materiauNom: string | null;
  prefabrique: boolean;
}

export type TypeAssemblageStructurel = "platine-about" | "platine-pied" | "gousset" | "cornieres" | "eclisse";

/** Assemblage paramétrique (DA-08-10, 12, 13) : géométrie seulement (platine, boulons) ; aucune vérification de résistance. */
export interface ParamsAssemblageStructurel {
  nom: string | null;
  type: TypeAssemblageStructurel;
  /** Éléments reliés (poutres, poteaux), 1 à 4. */
  elements: string[];
  position: Point2;
  z: number;
  angle: Angle;
  platine: { largeur: Longueur; hauteur: Longueur; epaisseur: Longueur };
  boulons: { rangees: number; parRangee: number; diametre: Longueur; entraxe: Longueur; longueur: Longueur } | null;
}

export type TypeSoudure = "angle" | "bout-a-bout" | "bouchon";

/** Soudure (DA-08-11, DA-10-10) : relie deux éléments ; gorge et longueur saisies ; symbole en plan, pas de volume. */
export interface ParamsSoudure {
  type: TypeSoudure;
  a: string;
  b: string;
  gorge: Longueur;
  longueur: Longueur;
  position: Point2;
  z: number;
  intermittente: boolean;
}

export type FormeArmature = "droite" | "cadre" | "etrier" | "epingle" | "u";

/** Armature (DA-08-14, 18) : barres comme objets ; tracé en plan, diamètre, nombre et espacement saisis ; nuance déclarée. */
export interface ParamsArmature {
  nom: string | null;
  hoteId: string | null;
  forme: FormeArmature;
  diametre: Longueur;
  points: Point2[];
  z: number;
  nombre: number;
  /** Espacement entre barres répétées (m) ; null pour une barre unique. */
  espacement: Longueur | null;
  nuance: string | null;
}

/** Coulage (DA-08-16) ou lot préfabriqué (DA-08-15) : groupe d'éléments en béton. */
export interface ParamsCoulage {
  nom: string;
  numero: string | null;
  elements: string[];
  prefabrique: boolean;
}

// ---------------------------------------------------------------------------
// Ontologie bois (P2-4, DA-09-01 à 08)
// ---------------------------------------------------------------------------

export type RoleBois = "montant" | "lisse" | "sabliere" | "traverse" | "linteau" | "appui" | "poteau" | "poutre" | "solive" | "entretoise" | "panne" | "chevron" | "faitiere" | "diagonale" | "autre";

/** Section d'une pièce de bois : rectangle (largeur × hauteur, m) saisi ou tiré d'un catalogue sourcé ; essence et classe déclarées (noms seulement). */
export interface SectionBois {
  largeur: Longueur;
  hauteur: Longueur;
  profil: { catalogueId: string; designation: string; source: string } | null;
  essence: string | null;
  classe: string | null;
}

/** Pièce de bois (DA-09-01) : axe 3D, section, rôle ; `ossatureId` si générée par une ossature ; `repere` de débit. */
export interface ParamsElementBois {
  nom: string | null;
  role: RoleBois;
  a: Point2;
  b: Point2;
  za: number;
  zb: number;
  section: SectionBois;
  rotation: Angle;
  ossatureId: string | null;
  repere: string | null;
}

export type GenreOssature = "mur" | "toit";

/** Ossature (DA-09-02, 07, 08) : hôte (mur ou toiture), entraxe, sections ; génération contrôlée après aperçu. */
export interface ParamsOssature {
  nom: string;
  genre: GenreOssature;
  hoteId: string;
  position: Point2;
  entraxe: Longueur;
  sectionMontant: SectionBois;
  /** Section des lisses, sablières, linteaux, appuis (mur) ou des pannes (toit) ; null : celle des montants / chevrons. */
  sectionLisse: SectionBois | null;
  generation: { elements: number } | null;
}

export type PoseClt = "mur" | "plancher";

/** Panneau CLT (DA-09-03) : vertical (axe a → b, hauteur) ou horizontal (contour) ; épaisseur et nombre de couches déclarés. */
export interface ParamsPanneauClt {
  nom: string | null;
  pose: PoseClt;
  a: Point2 | null;
  b: Point2 | null;
  hauteur: Longueur | null;
  contour: Point2[];
  trous: Point2[][];
  z: number;
  epaisseur: Longueur;
  couches: number;
  essence: string | null;
  classe: string | null;
  profil: { catalogueId: string; designation: string; source: string } | null;
}

export type TypeAssemblageBois = "tenon-mortaise" | "mi-bois" | "embrevement" | "queue-d-aronde" | "enture" | "equerre" | "sabot" | "plaque" | "ferrure" | "boulon-broche" | "vis";
export type NatureAssemblageBois = "bois-bois" | "bois-metal";

/** Assemblage bois (DA-09-04 / 05 / 06) : deux pièces, type, quincaillerie déclarée ; platine dessinée pour le bois–métal. */
export interface ParamsAssemblageBois {
  nom: string | null;
  type: TypeAssemblageBois;
  nature: NatureAssemblageBois;
  a: string;
  b: string;
  position: Point2;
  z: number;
  quincaillerie: { designation: string; nombre: number; source: string | null }[];
  platine: { largeur: Longueur; hauteur: Longueur; epaisseur: Longueur } | null;
}

// ---------------------------------------------------------------------------
// Ontologie tôlerie (P2-4, DA-11-01 à 05)
// ---------------------------------------------------------------------------

export type BordTole = "x0" | "x1" | "y0" | "y1";

/** Pli sur un bord de la face de base : angle signé (> 0 vers le haut), longueur d'aile au-delà de la zone pliée, rayon intérieur propre facultatif. */
export interface PliTole {
  bord: BordTole;
  angle: Angle;
  longueur: Longueur;
  rayon: Longueur | null;
}

/**
 * Tôle pliée (DA-11-01 / 02) : face de base (longueur × largeur) posée (position, angle, z), épaisseur, rayon intérieur,
 * plis ; paramètres de pliage : table sourcée du projet (catalogue) ou facteur K déclaré avec sa source ; null → développé
 * « non évalué » (R3 : aucune valeur de pliage n'est connue du code).
 */
export interface ParamsTole {
  nom: string | null;
  repere: string | null;
  position: Point2;
  angle: Angle;
  z: number;
  longueur: Longueur;
  largeur: Longueur;
  epaisseur: Longueur;
  materiau: string | null;
  rayonInterieur: Longueur;
  plis: PliTole[];
  pliage: { catalogueId: string } | { facteurK: number; source: string } | null;
}

// ---------------------------------------------------------------------------
// Ontologie réseaux (P2-5, DA-12-01 à 14, 16 à 21 ; DA-03-16)
// ---------------------------------------------------------------------------

export type SystemeReseau = "gaine" | "tuyau" | "chemin-de-cables" | "conduit";
export type SensPort = "entree" | "sortie" | "indifferent";
export type SensSegment = "a-vers-b" | "b-vers-a" | "indifferent";
/** Section d'un segment ou d'un port : circulaire (diamètre extérieur, épaisseur facultative) ou rectangulaire. */
export type SectionReseau = { forme: "circulaire"; diametre: Longueur; epaisseur: Longueur | null } | { forme: "rectangulaire"; largeur: Longueur; hauteur: Longueur };
/** Provenance catalogue d'une section (tubes-raccords.csv sourcé, D-180) : diamètre nominal déclaré par le catalogue. */
export interface ProfilReseau { catalogueId: string; designation: string; source: string; diametreNominal: string | null }
/** Point 3D du repère local du niveau (m) : z relatif au niveau. */
/** Point 3D en **repère local du niveau** (m ; z depuis l'élévation du niveau) — jamais cadastral ni géographique : un point étiqueté d'un autre repère est refusé à la validation. */
export interface Point3Reseau { x: number; y: number; z: number }
/**
 * Port d'un raccord ou d'un équipement : position relative au point de pose (déjà tournée de l'angle de l'objet à la
 * lecture), sens, section propre (null : celle de l'objet), système et fluide propres (null : ceux de l'objet).
 */
export interface PortReseau {
  id: string;
  dx: number;
  dy: number;
  dz: number;
  sens: SensPort;
  section: SectionReseau | null;
  /** Système déclaré du port (jamais supposé : la validation le refuse absent). */
  systeme: SystemeReseau;
  fluide: string | null;
}

/** Segment routé (DA-12-02, 04, 06, 13, 14) : polyligne 3D, section, fluide et matériau déclarés, spécification facultative. */
export interface ParamsSegmentReseau {
  nom: string | null;
  repere: string | null;
  systeme: SystemeReseau;
  sommets: Point3Reseau[];
  section: SectionReseau;
  profil: ProfilReseau | null;
  fluide: string | null;
  materiau: string | null;
  sens: SensSegment;
  specificationId: string | null;
}

export type TypeRaccordReseau = "coude" | "te" | "croix" | "reduction" | "manchon" | "bouchon";
export const PORTS_PAR_RACCORD: Record<TypeRaccordReseau, number> = { coude: 2, te: 3, croix: 4, reduction: 2, manchon: 2, bouchon: 1 };

/** Raccord (DA-12-08) : type, ports explicites autour du point de pose ; section nominale. */
export interface ParamsRaccordReseau {
  nom: string | null;
  type: TypeRaccordReseau;
  systeme: SystemeReseau;
  position: Point2;
  z: number;
  angle: Angle;
  section: SectionReseau;
  ports: PortReseau[];
  profil: ProfilReseau | null;
  fluide: string | null;
  materiau: string | null;
  specificationId: string | null;
}

export type TypeVanne = "arret" | "reglage" | "anti-retour" | "securite" | "trois-voies";

/** Vanne (DA-12-09) : sur un tuyau, longueur face à face saisie, deux ports (trois pour une trois-voies). */
export interface ParamsVanne {
  nom: string | null;
  repere: string | null;
  type: TypeVanne;
  position: Point2;
  z: number;
  angle: Angle;
  section: SectionReseau;
  longueur: Longueur;
  fluide: string | null;
  materiau: string | null;
  specificationId: string | null;
  profil: ProfilReseau | null;
}

export type CategorieEquipement = "terminal" | "mouvement" | "conversion" | "stockage" | "traitement" | "controle";

/** Équipement (DA-12-10, 11) : boîte posée, type déclaré, catégorie IFC, ports explicites (système et fluide par port). */
export interface ParamsEquipementReseau {
  nom: string;
  repere: string | null;
  type: string;
  categorie: CategorieEquipement;
  position: Point2;
  z: number;
  angle: Angle;
  longueur: Longueur;
  largeur: Longueur;
  hauteur: Longueur;
  ports: PortReseau[];
}

export type TypeSupport = "collier" | "suspente" | "rail" | "console";

/** Support (DA-12-12) : attaché à un segment, point d'accrochage, longueur de suspente facultative. */
export interface ParamsSupportReseau {
  nom: string | null;
  type: TypeSupport;
  porteId: string;
  position: Point2;
  z: number;
  longueur: Longueur | null;
}

// ---------------------------------------------------------------------------
// Bâtiment P2 et coordination (P2-6, DA-07-08, 09, 11, 13, 14, 18, 19, 21, 23 ; DA-17-14)
// ---------------------------------------------------------------------------

/** Plafond (DA-07-08) : contour en plan, hauteur sous plafond depuis le niveau, épaisseur ; suspendu ou non (déclaré). */
export interface ParamsPlafond extends Contour {
  nom: string | null;
  hauteur: Longueur;
  epaisseur: Longueur;
  suspendu: boolean;
  materiau: string | null;
}

/** Coque architecturale (DA-07-09) : contour en plan, base, flèche au centre (surface en dôme paraboloïdal déclaré), épaisseur. */
export interface ParamsCoque extends Contour {
  nom: string | null;
  decalageBase: Longueur;
  fleche: Longueur;
  epaisseur: Longueur;
  materiau: string | null;
}

/** Rampe (DA-07-11) : axe a → b, largeur, hauteur à franchir (montée de a vers b), épaisseur de la paillasse, base. */
export interface ParamsRampe {
  nom: string | null;
  a: Point2;
  b: Point2;
  largeur: Longueur;
  hauteurAFranchir: Longueur;
  epaisseur: Longueur;
  decalageBase: Longueur;
  /** Pente déclarée en pourcentage (dérivée : hauteur / longueur) — jamais comparée à une règle. */
}

/** Échelle (DA-07-13) : pied en a, direction du mur d'appui vers b (plan), hauteur, largeur, entraxe des barreaux déclaré. */
export interface ParamsEchelle {
  nom: string | null;
  a: Point2;
  b: Point2;
  hauteur: Longueur;
  largeur: Longueur;
  entraxeBarreaux: Longueur;
  decalageBase: Longueur;
  /** Crinoline déclarée (cage) : dessinée au-dessus de la hauteur donnée. */
  crinolineDepuis: Longueur | null;
}

/** Mur-rideau (DA-07-14) : axe a → b, hauteur, trame des montants et des traverses, profils, base ; remplissage vitré par défaut. */
export interface ParamsMurRideau {
  nom: string | null;
  a: Point2;
  b: Point2;
  hauteur: Longueur;
  entraxeMontants: Longueur;
  entraxeTraverses: Longueur;
  /** Largeur et profondeur des profils (montants et traverses). */
  largeurProfil: Longueur;
  profondeurProfil: Longueur;
  epaisseurVitrage: Longueur;
  decalageBase: Longueur;
  remplissage: "vitre" | "opaque";
}

/** Terrain (DA-07-18, 19) : semis de points 3D (z depuis le niveau), triangulé (Delaunay) ; aucune altitude interpolée hors du semis. */
export interface ParamsTerrain {
  nom: string | null;
  points: Point3Reseau[];
  /** Épaisseur de représentation sous la surface (m), déclarée ; 0 : surface seule. */
  epaisseur: Longueur;
  source: string | null;
}

/** Réservation (coordination, cahier P2 §4) : volume réservé dans un mur, une dalle ou un poteau pour un passage de réseau ; les collisions qu'elle couvre ne sont pas signalées. */
export interface ParamsReservation extends Contour {
  nom: string | null;
  hoteId: string | null;
  z: number;
  hauteur: Longueur;
  /** Réseau pour lequel la réservation est prévue (identifiant d'objet), facultatif. */
  pourId: string | null;
  statut: "demandee" | "accordee" | "refusee";
}

export type TypeInstallationChantier = "grue" | "base-vie" | "stockage" | "cloture" | "acces" | "levage" | "autre";

/** Installation de chantier (DA-07-23) : emprise, type, hauteur, période déclarée (dates ISO), phase de chantier. */
export interface ParamsInstallationChantier extends Contour {
  nom: string;
  type: TypeInstallationChantier;
  hauteur: Longueur | null;
  debut: string | null;
  fin: string | null;
  phaseChantier: string | null;
}

/**
 * Surface libre (DA-03-03, 05, 06, 07, 20) : maillage de contrôle (sommets 3D relatifs au niveau, faces triangulaires ou
 * quadrangulaires) subdivisé `niveaux` fois (Loop sur les triangles, après triangulation des quads) ; édition directe des
 * sommets de contrôle (morphing) ; conversion métier explicite depuis un objet (`surfaceLibre.depuisObjet`).
 */
export interface ParamsSurfaceLibre {
  nom: string | null;
  sommets: Point3Reseau[];
  faces: number[][];
  niveaux: number;
  /** Objet d'origine d'une conversion explicite (classe et identifiant), null pour une surface dessinée. */
  origine: { classe: string; id: string } | null;
  ferme: boolean;
}

export interface ParamsParClasse {
  mur: ParamsMur;
  porte: ParamsOuverture;
  fenetre: ParamsOuverture;
  ouverture: ParamsOuverture;
  dalle: ParamsDalle;
  toiture: ParamsToiture;
  escalier: ParamsEscalier;
  piece: ParamsPiece;
  espace: ParamsEspace;
  zone: ParamsZone;
  poteau: ParamsPoteau;
  solide: ParamsSolide;
  esquisse: ParamsEsquisse;
  "reference-plan": ParamsReferencePlan;
  cotation: ParamsCotation;
  texte: ParamsTexte;
  etiquette: ParamsEtiquette;
  "bloc-occurrence": ParamsBlocOccurrence;
  "garde-corps": ParamsGardeCorps;
  "objet-importe": ParamsObjetImporte;
  "solide-exact": ParamsSolideExact;
  "piece-mecanique": ParamsPieceMecanique;
  assemblage: ParamsAssemblage;
  liaison: ParamsLiaison;
  poutre: ParamsPoutre;
  trame: ParamsTrame;
  plaque: ParamsPlaque;
  "assemblage-structurel": ParamsAssemblageStructurel;
  soudure: ParamsSoudure;
  armature: ParamsArmature;
  coulage: ParamsCoulage;
  "element-bois": ParamsElementBois;
  ossature: ParamsOssature;
  "panneau-clt": ParamsPanneauClt;
  "assemblage-bois": ParamsAssemblageBois;
  tole: ParamsTole;
  "segment-reseau": ParamsSegmentReseau;
  "raccord-reseau": ParamsRaccordReseau;
  vanne: ParamsVanne;
  "equipement-reseau": ParamsEquipementReseau;
  "support-reseau": ParamsSupportReseau;
  plafond: ParamsPlafond;
  coque: ParamsCoque;
  rampe: ParamsRampe;
  echelle: ParamsEchelle;
  "mur-rideau": ParamsMurRideau;
  terrain: ParamsTerrain;
  reservation: ParamsReservation;
  "installation-chantier": ParamsInstallationChantier;
  "surface-libre": ParamsSurfaceLibre;
}

export interface Occurrence<C extends Classe = Classe> {
  id: string;
  classe: C;
  niveauId: string | null;
  definitionId: string | null;
  calqueId: string | null;
  groupeId: string | null;
  phase: string | null;
  params: ParamsParClasse[C];
  /** Propriétés typées hors paramètres canoniques (BIM, classification, provenance d'import). */
  proprietes: Record<string, Propriete>;
  /** Objet verrouillé (D-052) : aucune commande ne le modifie ni ne le supprime avant déverrouillage. Absent : libre. */
  verrouille?: true;
}

export type OccurrenceQuelconque = { [C in Classe]: Occurrence<C> }[Classe];

/** Définitions : types d'objets, blocs et composants (lot 5), vues et feuilles des documents dérivés (lot 5). */
export type ClasseDefinition = Classe | "bloc" | "composant" | "vue" | "feuille" | "reference-externe" | "vue-3d" | "referentiel-classification" | "ensemble-affichage" | "etat-calques" | "planche" | "famille" | "regle" | "catalogue" | "specification";

export interface Definition {
  id: string;
  classe: ClasseDefinition;
  nom: string;
  params: Record<string, unknown>;
  /** Version du catalogue (T15) : incrémentée à chaque modification de la définition. */
  version: number;
}

export interface Relation {
  id: string;
  kind: "heberge-par" | "delimitee-par" | "joint-a" | "relie" | "contient" | "correspond-a" | "programme" | "contrainte" | "pose" | "connecte";
  sourceId: string;
  targetId: string;
  params: Record<string, unknown>;
}

export type EtatReference = "ok" | "a-reparer" | "libre";

/** Référence d'une annotation (ou d'une contrainte) vers une caractéristique nommée d'un objet. */
export interface Reference {
  id: string;
  proprietaireId: string;
  objetId: string | null;
  caracteristique: string | null;
  etat: EtatReference;
  propositions: { objetId: string; caracteristique: string }[];
}

export interface Groupe {
  id: string;
  nom: string;
  /** Groupe verrouillé (D-052) : ses membres sont tenus comme des objets verrouillés. Absent : libre. */
  verrouille?: true;
  /** Propriétés du groupe (D-088), mêmes règles que celles des objets ; absent : aucune. */
  proprietes?: Record<string, Propriete>;
  /** Réseau associatif (D-115) : paramètres et copies (membres du groupe) ; absent : groupe ordinaire. */
  reseau?: ParametresReseau & { copies: string[] };
}

/** Paramètres d'un réseau associatif (D-115) : rectangulaire (pas dx, dy en m) ou polaire (centre, angle en °). */
export interface ParametresReseau {
  sources: string[];
  nombre: number;
  dx?: number;
  dy?: number;
  centre?: Point2 | null;
  angle?: number;
}

export interface Hypothese {
  id: string;
  domaine: string;
  texte: string;
  statut: "a-confirmer" | "confirmee" | "rejetee";
}

export interface SourceProjet {
  id: string;
  champs: Record<string, unknown>;
}

export interface CoordonneeCadastrale {
  x: number;
  y: number;
  frame: "cadastral";
  crs: string;
  unit: "m";
}

export interface Parcelle {
  sommets: SommetParcelle[];
  crs: string;
  sourceCrs: string | null;
  /**
   * Origine du repère local exprimée dans le repère cadastral : la transformation explicite est
   * `local = cadastral − origineLocale` (le prototype prenait le centroïde de la parcelle, sans rotation).
   */
  origineLocale: CoordonneeCadastrale;
  aire: Surface | null;
  aireOfficielle: Surface | null;
  /** Champs restants de la parcelle native, conservés tels quels (R7). */
  champs: Record<string, unknown>;
}

export interface Emprise {
  /** Sommets dans le repère local (dérivés par la transformation explicite de la parcelle). */
  sommets: Point2[];
  /** Sommets d'origine dans le repère cadastral, conservés. */
  sommetsCadastraux: CoordonneeCadastrale[];
  champs: Record<string, unknown>;
}

export interface Site {
  parcelle: Parcelle | null;
  emprise: Emprise | null;
  hypotheses: Hypothese[];
  sources: SourceProjet[];
  /** Structure déclarée du prototype (système, portée, charges « à confirmer »), jamais une exigence. */
  structure: Record<string, unknown> | null;
}

export type TypeProbleme =
  | "hote-introuvable"
  | "niveau-arrivee-absent"
  | "aire-ecart"
  | "role-inconnu"
  | "reference-a-reparer"
  | "sans-correspondance"
  | "piece-non-fermee"
  | "import"
  | "collision-mecanique"
  | "regle"
  | "reseau";

export interface Probleme {
  id: string;
  type: TypeProbleme;
  objetId: string | null;
  message: string;
}

export interface ModeleAtelier {
  version: 1;
  niveaux: Record<string, Niveau>;
  objets: Record<string, OccurrenceQuelconque>;
  relations: Record<string, Relation>;
  definitions: Record<string, Definition>;
  calques: Record<string, Calque>;
  groupes: Record<string, Groupe>;
  references: Record<string, Reference>;
  problemes: Record<string, Probleme>;
  site: Site;
  /** Propriétés de projet (méta du prototype conservées, provenance `import`). */
  proprietes: Record<string, Propriete>;
  /** Ontologies activées par le projet en plus du socle (P2-2, `ontologie.activer`) ; absent : socle seul. */
  ontologies?: Ontologie[];
}

export function modeleVide(): ModeleAtelier {
  return {
    version: 1,
    niveaux: {},
    objets: {},
    relations: {},
    definitions: {},
    calques: {},
    groupes: {},
    references: {},
    problemes: {},
    site: { parcelle: null, emprise: null, hypotheses: [], sources: [], structure: null },
    proprietes: {},
  };
}

/** Niveaux par `ordre`, puis par identifiant à ordre égal : un ordre total, indépendant de l'ordre de lecture. */
export function niveauxOrdonnes(etat: ModeleAtelier): Niveau[] {
  return Object.values(etat.niveaux).sort((a, b) => a.ordre - b.ordre || (a.id < b.id ? -1 : 1));
}

export function objetsDuNiveau(etat: ModeleAtelier, niveauId: string): OccurrenceQuelconque[] {
  return Object.values(etat.objets).filter((o) => o.niveauId === niveauId);
}

export function objetsDeClasse<C extends Classe>(etat: ModeleAtelier, classe: C, niveauId?: string): Occurrence<C>[] {
  const out: Occurrence<C>[] = [];
  for (const o of Object.values(etat.objets)) {
    if (o.classe === classe && (niveauId === undefined || o.niveauId === niveauId)) out.push(o as Occurrence<C>);
  }
  return out;
}

export function ouverturesDuMur(etat: ModeleAtelier, murId: string): Occurrence<"porte" | "fenetre" | "ouverture">[] {
  const out: Occurrence<"porte" | "fenetre" | "ouverture">[] = [];
  for (const o of Object.values(etat.objets)) {
    if ((o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && o.params.murHoteId === murId) out.push(o);
  }
  return out;
}

export function relationsDe(etat: ModeleAtelier, objetId: string, kind?: Relation["kind"]): Relation[] {
  return Object.values(etat.relations).filter((r) => (r.sourceId === objetId || r.targetId === objetId) && (kind === undefined || r.kind === kind));
}

export function referencesVers(etat: ModeleAtelier, objetId: string): Reference[] {
  return Object.values(etat.references).filter((r) => r.objetId === objetId);
}
