/**
 * Classes de l'ontologie et leurs paramètres canoniques (cahier §5.2 ; fiches DA-05-*, DA-07-*, DA-01-*,
 * DA-15-*). Liste fermée : une classe inconnue est refusée (DA-05-02).
 *
 * Chaque objet porte : identifiant stable, classe, ontologie, `params` (canoniques, unités typées), provenance
 * et statut (R3), propriétés typées, et selon la classe niveau, calque, groupe, définition de type.
 * Les relations sont dans `EtatModele.relations` (voir `relations.ts`), sauf les identifiants canoniques qui
 * font partie de la définition de l'objet (`murHoteId`, `niveauDepartId`…), d'où les relations sont dérivées.
 *
 * Aucune valeur par défaut n'est fournie ici (R3) : les champs facultatifs absents sont « non renseignés ».
 */
import type { Evaluable, Tracabilite } from "./provenance.js";
import type { Classification, Propriete } from "./proprietes.js";
import type { PointCadastral, PointLocal, Polygone, PolygoneAvecTrous, Segment, TrouPolygone } from "./reperes.js";
import type { Aire, Angle, ChargeSurfacique, Longueur } from "./unites.js";

export type IdObjet = string;

export const ONTOLOGIES = ["building.architecture", "building.structure", "drawing", "annotation", "projet"] as const;
export type Ontologie = (typeof ONTOLOGIES)[number];

export const CLASSES_ESQUISSE = [
  "esquisse.ligne",
  "esquisse.polyligne",
  "esquisse.arc",
  "esquisse.cercle",
  "esquisse.rectangle",
  "esquisse.polygone",
  "esquisse.spline",
  "esquisse.construction",
  "esquisse.hachure",
] as const;
export type ClasseEsquisse = (typeof CLASSES_ESQUISSE)[number];

export const CLASSES_OBJET = [
  "niveau",
  "mur",
  "porte",
  "fenetre",
  "ouverture",
  "dalle",
  "toiture",
  "escalier",
  "poteau",
  "piece",
  "espace",
  "zone",
  "solide",
  ...CLASSES_ESQUISSE,
  "reference-plan",
  "cotation",
  "texte",
  "etiquette",
  "calque",
  "groupe",
  "parcelle",
  "emprise",
  "hypothese",
  "source",
  "structureDeclaree",
] as const;
export type ClasseObjet = (typeof CLASSES_OBJET)[number];

export function estClasseObjet(x: unknown): x is ClasseObjet {
  return typeof x === "string" && (CLASSES_OBJET as readonly string[]).includes(x);
}

export const CLASSES_BAIE = ["porte", "fenetre", "ouverture"] as const;
export type ClasseBaie = (typeof CLASSES_BAIE)[number];

/** Couleur sRVB `#rrggbb` (sans unité). */
export type Couleur = string;
export const MOTIF_COULEUR = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------------------
// Paramètres canoniques par classe
// ---------------------------------------------------------------------------

export interface ParamsNiveau {
  readonly nom: string;
  /** Altitude relative au zéro du projet (repère local), décimale, négative permise. */
  readonly elevation: Longueur;
  readonly hauteur: Longueur;
  /** Entier ≥ 0, unique. */
  readonly ordre: number;
}

export type AlignementMur = "gauche" | "axe" | "droite";

export interface ParamsMur {
  readonly axe: Segment<PointLocal>;
  readonly epaisseur: Longueur;
  /** L'un de `hauteur` ou `niveauHaut` est obligatoire (DA-07-01), jamais deviné. */
  readonly hauteur?: Longueur;
  readonly niveauHaut?: IdObjet;
  /**
   * Position de l'axe tracé a→b par rapport au mur (DA-02-07) : normale gauche n = (−dy, dx) / L ; « gauche » =
   * l'axe tracé est la face gauche (le corps du mur est du côté −n) ; « droite » = l'axe est la face droite (corps
   * côté +n) ; « axe » = faces à ±e/2. « non évaluée » admise (D-024).
   */
  readonly alignement: Evaluable<AlignementMur>;
  /** Définition du catalogue (`cloison`, `mur`, `non-type`…), voir `definitions.ts`. */
  readonly typeId: string;
  /** D'après `exteriorWallIds` à l'import. */
  readonly exterieur: boolean;
  readonly nom?: string;
}

/** Position d'une baie : `t` ∈ [0, 1] le long de l'axe ; `distance` dérivée = t × longueur, de `mur:arete-debut` au centre de la baie. */
export interface PositionBaie {
  readonly t: number;
  readonly distance?: Longueur;
}

export interface ParamsBaie {
  readonly murHoteId: IdObjet;
  readonly position: PositionBaie;
  readonly largeur: Longueur;
  readonly hauteur: Longueur;
  /** ≥ 0 ; obligatoire pour une fenêtre (DA-07-03). */
  readonly allege: Longueur;
  /** Repère (mark) : `P02`, `F02`… */
  readonly repere?: string;
  readonly typeId: string;
}

export type UsageDalle = "plancher" | "ordinaire";

export interface ParamsDalle {
  readonly contour: Polygone<PointLocal>;
  readonly trous: readonly TrouPolygone<PointLocal>[];
  readonly epaisseur: Longueur;
  /** Sous-face par rapport à l'altitude du niveau ; négatif = sous le niveau. */
  readonly decalageBase: Longueur;
  readonly usage?: UsageDalle;
  readonly typeId?: string;
}

export type TypeToiture = "plate" | "monopente" | "bipente";

export interface ParamsToiture {
  readonly contour: Polygone<PointLocal>;
  readonly trous: readonly TrouPolygone<PointLocal>[];
  readonly type: TypeToiture;
  readonly epaisseur: Longueur;
  readonly pente: Evaluable<Angle>;
  readonly decalageBase: Longueur;
}

export interface ParamsEscalier {
  /** Sens de montée de `a` vers `b`. */
  readonly axe: Segment<PointLocal>;
  readonly largeur: Longueur;
  /** Dérivée des altitudes (escalier complet) ou déclarée (volée partielle). */
  readonly hauteurAFranchir: Evaluable<Longueur>;
  readonly marches: Evaluable<number>;
  readonly contremarches: Evaluable<number>;
  readonly epaisseurPaillasse: Evaluable<Longueur>;
  readonly decalageBase: Longueur;
  /** Absents → pas de relation `relie`, problème listé (D-021). */
  readonly niveauDepartId?: IdObjet;
  readonly niveauArriveeId?: IdObjet;
  readonly groupe?: string;
  /** Occurrence de vue en plan d'un escalier physique (P.118 : 32 occurrences) ; « non évaluée » admise (D-024). */
  readonly referencePlanSeulement: Evaluable<boolean>;
  readonly nom?: string;
}

export interface ParamsPoteau {
  readonly point: PointLocal;
  readonly formeId: string;
  readonly largeur: Longueur;
  readonly profondeur: Longueur;
  readonly hauteur: Longueur;
  readonly angle: Angle;
  readonly nom?: string;
  /** Statut de conception déclaré par la source (texte), jamais une valeur structurelle. */
  readonly statutConception?: string;
}

export interface ParamsPiece {
  /** Géométrie courante, repère local du projet. Vide = pièce sans tracé courant (problème listé, D-021). */
  readonly polygones: readonly PolygoneAvecTrous<PointLocal>[];
  /**
   * Polygones conservés de la source dans leur propre repère local nommé (D-021 : `rooms[].polygons`,
   * registration 8.19). Jamais mélangés avec `polygones` ; non utilisés pour les quantités.
   */
  readonly polygonesSource?: readonly PolygoneAvecTrous<PointLocal>[];
  readonly code?: string;
  readonly nom: string;
  readonly categorie?: string;
  /** Aire déclarée par la source (provenance `prototype` à l'import, voir `annotations`). */
  readonly aireDeclaree?: Aire;
  /** Dérivée (jamais saisie) ; absente tant que non calculée. */
  readonly aireCalculee?: Aire;
  readonly notes?: string;
  readonly etiquette?: PointLocal;
}

export interface ParamsEspace {
  readonly polygones: readonly PolygoneAvecTrous<PointLocal>[];
  readonly nom: string;
  readonly categorie?: string;
}

export type ParamsZone = ParamsEspace;

export interface ParamsSolide {
  readonly contour: Polygone<PointLocal>;
  readonly trous: readonly TrouPolygone<PointLocal>[];
  readonly ferme: boolean;
  readonly hauteur: Longueur;
  readonly decalageBase: Longueur;
  readonly epaisseur?: Longueur;
  /** Conservé tel quel (`solid`, `clearance`, `core-zone`, `ramp-*`, rôle inconnu…), jamais reclassé. */
  readonly role: string;
  readonly nom?: string;
  readonly couleur?: Couleur;
}

// Esquisse (drawing) — DA-01-02 à DA-01-11.
export interface ParamsEsquisseLigne {
  readonly a: PointLocal;
  readonly b: PointLocal;
  readonly nom?: string;
}
export interface ParamsEsquissePolyligne {
  readonly points: readonly PointLocal[];
  readonly ferme: boolean;
  readonly nom?: string;
}
export type SensArc = "trigo" | "horaire";
export interface ParamsEsquisseArc {
  readonly centre: PointLocal;
  readonly rayon: Longueur;
  readonly angleDebut: Angle;
  readonly angleFin: Angle;
  readonly sens: SensArc;
  readonly nom?: string;
}
export interface ParamsEsquisseCercle {
  readonly centre: PointLocal;
  readonly rayon: Longueur;
  readonly nom?: string;
}
export interface ParamsEsquisseRectangle {
  readonly origine: PointLocal;
  readonly largeur: Longueur;
  readonly profondeur: Longueur;
  readonly angle: Angle;
  readonly nom?: string;
}
export interface ParamsEsquissePolygone {
  readonly centre: PointLocal;
  readonly nombreCotes: number;
  readonly rayon: Longueur;
  readonly mode: "inscrit" | "circonscrit";
  readonly angle: Angle;
  readonly nom?: string;
}
export interface ParamsEsquisseSpline {
  readonly points: readonly PointLocal[];
  readonly mode: "controle" | "passage";
  readonly degre: number;
  readonly ferme: boolean;
  readonly nom?: string;
}
export type ParamsEsquisseConstruction =
  | { readonly nature: "axe"; readonly a: PointLocal; readonly b: PointLocal; readonly depassement?: Longueur; readonly nom?: string }
  | {
      readonly nature: "construction";
      readonly point: PointLocal;
      readonly direction: Angle;
      readonly etendue: "droite" | "demi-droite";
      readonly nom?: string;
    };
export interface ParamsEsquisseHachure {
  readonly contour: Polygone<PointLocal>;
  readonly trous: readonly TrouPolygone<PointLocal>[];
  readonly motifId: string;
  readonly angle: Angle;
  readonly espacement: Longueur;
  /** `#rrggbb` ; absent = couleur du calque. */
  readonly couleur?: Couleur;
  readonly fond?: Couleur;
}

export interface ParamsReferencePlan {
  readonly contour?: PolygoneAvecTrous<PointLocal>;
  /** Image de fond (identifiant de volume), facultative. */
  readonly imageId?: string;
  /** Source de la référence (texte ou identifiant `source` du projet). */
  readonly source?: string;
  /** Échelle (rapport sans unité), absente si non déclarée. */
  readonly echelle?: number;
  readonly nom?: string;
}

/** Références topologiques : voir `caracteristiques.ts` et `contrats/references.ts`. */
export interface ReferenceExtremite {
  readonly extremite: "a" | "b";
  readonly objetId: IdObjet;
  readonly caracteristique: string;
}

/** `libre` : cote non rattachée (toutes les cotes P.118, D-019) ; `rattachee` ; `a-reparer` (R12). */
export type EtatCotation = "libre" | "rattachee" | "a-reparer";

export interface ParamsCotation {
  readonly a: PointLocal;
  readonly b: PointLocal;
  /** Signé : côté gauche de a→b positif. */
  readonly decalage: Longueur;
  readonly references: readonly ReferenceExtremite[];
  readonly etat: EtatCotation;
  readonly texteRemplacement?: string;
  /**
   * Références détachées par l'utilisateur (`reference.reparer` avec `nouvelle: null`), une au plus par
   * extrémité, sans référence active sur la même extrémité : gardées pour la traçabilité, la résolution de
   * l'extrémité est alors `detachee` (D-026). Un nouveau rattachement de l'extrémité les retire.
   */
  readonly referencesDetachees?: readonly ReferenceExtremite[];
}

export interface ParamsTexte {
  /** Coin bas-gauche (convention du prototype). */
  readonly position: PointLocal;
  readonly texte: string;
}

export interface ParamsEtiquette {
  readonly position: PointLocal;
  /** Objet étiqueté et caractéristique éventuelle. */
  readonly objetId?: IdObjet;
  readonly caracteristique?: string;
  readonly texte?: string;
}

export interface ParamsCalque {
  readonly nom: string;
  readonly couleur: Couleur;
  /** Absent = « non renseigné », jamais une couleur inventée (DA-05-01). */
  readonly remplissage?: Couleur;
  readonly visible: boolean;
  readonly verrouille: boolean;
  readonly ordre: number;
  /** Niveaux où le calque est présent dans la source (D-021) ; absent = calque de projet sans restriction. */
  readonly niveauxPresence?: readonly IdObjet[];
}

export interface ParamsGroupe {
  readonly nom?: string;
  readonly membres: readonly IdObjet[];
}

export interface ParamsParcelle {
  readonly numero?: string;
  readonly commune?: string;
  /** CRS déclaré par la source (ex. `EPSG:26191`) et libellé source (« … sous hypothèse »). */
  readonly crs: string;
  readonly crsSource?: string;
  readonly sommetsCadastraux: Polygone<PointCadastral>;
  /** Sommets en repère local, seulement par conversion explicite (domain-model) ; absents sinon. */
  readonly sommetsLocaux?: Polygone<PointLocal>;
  readonly identifiantsSommets?: readonly string[];
  /** Aire calculée (source `area`), conservée séparément de l'aire officielle. */
  readonly aire?: Aire;
  readonly aireOfficielle?: Aire;
  /** `correctedAreaPrinted` de P.118. */
  readonly aireCorrigeeImprimee?: Aire;
  readonly recul?: Longueur;
  readonly enveloppeRecul?: Polygone<PointCadastral>;
}

export interface ParamsEmprise {
  readonly sommetsCadastraux?: Polygone<PointCadastral>;
  readonly sommetsLocaux?: Polygone<PointLocal>;
  readonly revisionArchitecture?: number;
}

/** Hypothèse de projet (H01…) — jamais une exigence (R4). */
export interface ParamsHypothese {
  readonly code: string;
  readonly theme?: string;
  readonly texte: string;
  /** Valeur retenue si la source en fournit une (ex. `loadNature`), conservée telle quelle. */
  readonly valeur?: string | number | boolean;
}

/** Source de projet (CAD-S01, S01…) : identifiant et champs conservés. */
export interface ParamsSource {
  readonly code: string;
  readonly fichier?: string;
  readonly titre?: string;
  readonly fourni?: string;
  readonly usage?: string;
  readonly inspectee?: boolean;
}

/** Structure déclarée par la source (`meta.structure`) : statut « à confirmer », jamais une exigence. */
export interface ParamsStructureDeclaree {
  readonly systeme?: string;
  readonly porteeRequise?: Longueur;
  readonly charges?: readonly ChargeSurfacique[];
  readonly natureCharge?: string;
  readonly poidsPropreInclus?: boolean;
  readonly reglePoteaux?: string;
  readonly statutEpaisseur?: string;
  readonly statutConception?: string;
}

export interface ParamsParClasse {
  niveau: ParamsNiveau;
  mur: ParamsMur;
  porte: ParamsBaie;
  fenetre: ParamsBaie;
  ouverture: ParamsBaie;
  dalle: ParamsDalle;
  toiture: ParamsToiture;
  escalier: ParamsEscalier;
  poteau: ParamsPoteau;
  piece: ParamsPiece;
  espace: ParamsEspace;
  zone: ParamsZone;
  solide: ParamsSolide;
  "esquisse.ligne": ParamsEsquisseLigne;
  "esquisse.polyligne": ParamsEsquissePolyligne;
  "esquisse.arc": ParamsEsquisseArc;
  "esquisse.cercle": ParamsEsquisseCercle;
  "esquisse.rectangle": ParamsEsquisseRectangle;
  "esquisse.polygone": ParamsEsquissePolygone;
  "esquisse.spline": ParamsEsquisseSpline;
  "esquisse.construction": ParamsEsquisseConstruction;
  "esquisse.hachure": ParamsEsquisseHachure;
  "reference-plan": ParamsReferencePlan;
  cotation: ParamsCotation;
  texte: ParamsTexte;
  etiquette: ParamsEtiquette;
  calque: ParamsCalque;
  groupe: ParamsGroupe;
  parcelle: ParamsParcelle;
  emprise: ParamsEmprise;
  hypothese: ParamsHypothese;
  source: ParamsSource;
  structureDeclaree: ParamsStructureDeclaree;
}

// ---------------------------------------------------------------------------
// Objet (occurrence)
// ---------------------------------------------------------------------------

/** Représentation dérivée ou importée (cahier §5.2, « Identités »). Une seule géométrie canonique (R15). */
export interface Representation {
  readonly usage: "plan-2d" | "solide-3d" | "symbole" | "brep";
  readonly autorite: "parametrique" | "derivee" | "importee";
  readonly moteur: string;
  readonly versionMoteur: string;
  readonly empreinteEntrees: string;
}

/** Objet du modèle, discriminé par `classe`. */
export interface ObjetDe<C extends ClasseObjet> extends Tracabilite {
  /** Identifiant stable `${projectId}_${id}`, jamais réutilisé. */
  readonly id: IdObjet;
  readonly classe: C;
  readonly ontologie: Ontologie;
  readonly params: ParamsParClasse[C];
  /** Niveau porteur (objets d'un niveau) ; absent pour les objets de projet (calque, parcelle, hypothèse…). */
  readonly niveauId?: IdObjet;
  readonly calqueId?: IdObjet;
  readonly groupeId?: IdObjet;
  /** Définition de type (catalogue versionné). */
  readonly definitionId?: string;
  readonly proprietes: readonly Propriete[];
  readonly classifications?: readonly Classification[];
  /**
   * Traçabilité d'un paramètre canonique particulier quand elle diffère de celle de l'objet
   * (ex. dalle importée : `epaisseur` « à vérifier » ; pièce : `aireDeclaree` provenance `prototype`).
   */
  readonly annotations?: Readonly<Partial<Record<string, Tracabilite>>>;
  readonly representations?: readonly Representation[];
}

export type ObjetModele = { [C in ClasseObjet]: ObjetDe<C> }[ClasseObjet];

export type ObjetNiveau = ObjetDe<"niveau">;
export type ObjetMur = ObjetDe<"mur">;
export type ObjetBaie = ObjetDe<ClasseBaie>;
export type ObjetDalle = ObjetDe<"dalle">;
export type ObjetToiture = ObjetDe<"toiture">;
export type ObjetEscalier = ObjetDe<"escalier">;
export type ObjetPoteau = ObjetDe<"poteau">;
export type ObjetPiece = ObjetDe<"piece">;
export type ObjetEspace = ObjetDe<"espace">;
export type ObjetZone = ObjetDe<"zone">;
export type ObjetSolide = ObjetDe<"solide">;
export type ObjetEsquisse = ObjetDe<ClasseEsquisse>;
export type ObjetCotation = ObjetDe<"cotation">;
export type ObjetTexte = ObjetDe<"texte">;
export type ObjetEtiquette = ObjetDe<"etiquette">;
export type ObjetCalque = ObjetDe<"calque">;
export type ObjetGroupe = ObjetDe<"groupe">;
export type ObjetParcelle = ObjetDe<"parcelle">;
export type ObjetEmprise = ObjetDe<"emprise">;
export type ObjetHypothese = ObjetDe<"hypothese">;
export type ObjetSource = ObjetDe<"source">;
export type ObjetStructureDeclaree = ObjetDe<"structureDeclaree">;

export function estDeClasse<C extends ClasseObjet>(o: ObjetModele, classe: C): o is Extract<ObjetModele, { classe: C }> {
  return o.classe === classe;
}
