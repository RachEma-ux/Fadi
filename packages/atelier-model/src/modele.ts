/**
 * Modèle typé de l'Atelier (contrat `modele-atelier/1`) : identités définition / occurrence, propriétés typées
 * avec provenance et statut, relations porteuses de sens, références topologiques, site (parcelle, emprise,
 * hypothèses, sources, structure déclarée). Objet immuable : les réducteurs retournent un nouvel état.
 */
import type { OuvrantPorte } from "./ouvrants.js";
import type { Menuiserie } from "./menuiserie.js";
import type { Classe } from "./ontologie.js";
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
}

export interface ParamsTexte {
  position: Point2;
  texte: string;
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
export type ClasseDefinition = Classe | "bloc" | "composant" | "vue" | "feuille" | "reference-externe" | "vue-3d" | "referentiel-classification" | "ensemble-affichage" | "etat-calques";

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
  kind: "heberge-par" | "delimitee-par" | "joint-a" | "relie" | "contient" | "correspond-a" | "programme" | "contrainte";
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
  | "import";

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

export function niveauxOrdonnes(etat: ModeleAtelier): Niveau[] {
  return Object.values(etat.niveaux).sort((a, b) => a.ordre - b.ordre);
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
