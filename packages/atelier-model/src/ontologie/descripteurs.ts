/**
 * Descripteurs de classes : la déclaration exécutable de l'ontologie (DA-05-02) — ontologie, paramètres
 * obligatoires et facultatifs avec leur nature (unité, repère), relations et caractéristiques, classe IFC,
 * admission d'un type, d'un niveau, d'un calque. Sert à la validation des objets (réducteurs, importeur, API).
 *
 * Version de l'ontologie : `VERSION_ONTOLOGIE` (incrémentée à tout changement de descripteur).
 */
import { CARACTERISTIQUES_PAR_CLASSE } from "./caracteristiques.js";
import { CLASSES_ESQUISSE, type ClasseObjet, type Ontologie } from "./classes.js";
import { CLASSES_IFC, type CorrespondanceIfc } from "./ifc.js";
import { estClasseTypee } from "./definitions.js";

export const VERSION_ONTOLOGIE = 1;

export type NatureParametre =
  | "longueur"
  | "aire"
  | "angle"
  | "reel"
  | "entier"
  | "fraction" // nombre dans [0, 1]
  | "texte"
  | "booleen"
  | "identifiant"
  | "enum"
  | "couleur"
  | "point-local"
  | "segment-local"
  | "liste-points-local"
  | "polygone-local"
  | "trous-local"
  | "polygones-avec-trous-local"
  | "polygone-avec-trous-local"
  | "polygone-cadastral"
  | "position-baie"
  | "evaluable-longueur"
  | "evaluable-entier"
  | "evaluable-angle"
  | "liste-identifiants"
  | "liste-charges"
  | "references-extremites"
  | "valeur-simple";

export interface DeclarationParametre {
  readonly nom: string;
  readonly nature: NatureParametre;
  readonly obligatoire: boolean;
  /** Pour `enum`. */
  readonly valeurs?: readonly string[];
  /** Pour une longueur : strictement positive (`>0`) ou positive (`>=0`). */
  readonly signe?: ">0" | ">=0";
  /**
   * Vrai si les coordonnées locales peuvent être dans un repère local nommé autre que celui du projet
   * (D-021 : `piece.polygonesSource`). Sinon, toute coordonnée locale doit être dans le repère du projet.
   */
  readonly repereLocalLibre?: boolean;
  /** Paramètre dérivé (jamais saisi). */
  readonly derive?: boolean;
}

export interface DescripteurClasse {
  readonly classe: ClasseObjet;
  readonly ontologie: Ontologie;
  readonly libelle: string;
  readonly parametres: readonly DeclarationParametre[];
  /** L'objet appartient à un niveau (`niveauId` obligatoire). */
  readonly porteNiveau: boolean;
  readonly admetCalque: boolean;
  readonly admetType: boolean;
  readonly ifc: CorrespondanceIfc | null;
  readonly caracteristiques: readonly string[];
  /** Contrainte « l'un de » (ex. mur : `hauteur` ou `niveauHaut`). */
  readonly unDe?: readonly (readonly string[])[];
}

const p = (nom: string, nature: NatureParametre, obligatoire = true, extra: Partial<DeclarationParametre> = {}): DeclarationParametre => ({
  nom,
  nature,
  obligatoire,
  ...extra,
});

const baie = (): readonly DeclarationParametre[] => [
  p("murHoteId", "identifiant"),
  p("position", "position-baie"),
  p("largeur", "longueur", true, { signe: ">0" }),
  p("hauteur", "longueur", true, { signe: ">0" }),
  p("allege", "longueur", true, { signe: ">=0" }),
  p("repere", "texte", false),
  p("typeId", "identifiant"),
];

const polygonal = (): readonly DeclarationParametre[] => [
  p("polygones", "polygones-avec-trous-local"),
  p("nom", "texte"),
  p("categorie", "texte", false),
];

const PARAMETRES: Readonly<Record<ClasseObjet, { ontologie: Ontologie; libelle: string; porteNiveau: boolean; admetCalque: boolean; parametres: readonly DeclarationParametre[]; unDe?: readonly (readonly string[])[] }>> = {
  niveau: {
    ontologie: "building.architecture",
    libelle: "Niveau",
    porteNiveau: false,
    admetCalque: false,
    parametres: [p("nom", "texte"), p("elevation", "longueur"), p("hauteur", "longueur", true, { signe: ">0" }), p("ordre", "entier")],
  },
  mur: {
    ontologie: "building.architecture",
    libelle: "Mur",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("axe", "segment-local"),
      p("epaisseur", "longueur", true, { signe: ">0" }),
      p("hauteur", "longueur", false, { signe: ">0" }),
      p("niveauHaut", "identifiant", false),
      p("alignement", "enum", true, { valeurs: ["gauche", "axe", "droite"] }),
      p("typeId", "identifiant"),
      p("exterieur", "booleen"),
      p("nom", "texte", false),
    ],
    unDe: [["hauteur", "niveauHaut"]],
  },
  porte: { ontologie: "building.architecture", libelle: "Porte", porteNiveau: true, admetCalque: true, parametres: baie() },
  fenetre: { ontologie: "building.architecture", libelle: "Fenêtre", porteNiveau: true, admetCalque: true, parametres: baie() },
  ouverture: { ontologie: "building.architecture", libelle: "Ouverture", porteNiveau: true, admetCalque: true, parametres: baie() },
  dalle: {
    ontologie: "building.architecture",
    libelle: "Dalle",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("contour", "polygone-local"),
      p("trous", "trous-local"),
      p("epaisseur", "longueur", true, { signe: ">0" }),
      p("decalageBase", "longueur"),
      p("usage", "enum", false, { valeurs: ["plancher", "ordinaire"] }),
      p("typeId", "identifiant", false),
    ],
  },
  toiture: {
    ontologie: "building.architecture",
    libelle: "Toiture",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("contour", "polygone-local"),
      p("trous", "trous-local"),
      p("type", "enum", true, { valeurs: ["plate", "monopente", "bipente"] }),
      p("epaisseur", "longueur", true, { signe: ">0" }),
      p("pente", "evaluable-angle"),
      p("decalageBase", "longueur"),
    ],
  },
  escalier: {
    ontologie: "building.architecture",
    libelle: "Escalier",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("axe", "segment-local"),
      p("largeur", "longueur", true, { signe: ">0" }),
      p("hauteurAFranchir", "evaluable-longueur"),
      p("marches", "evaluable-entier"),
      p("contremarches", "evaluable-entier"),
      p("epaisseurPaillasse", "evaluable-longueur"),
      p("decalageBase", "longueur"),
      p("niveauDepartId", "identifiant", false),
      p("niveauArriveeId", "identifiant", false),
      p("groupe", "texte", false),
      p("referencePlanSeulement", "booleen"),
      p("nom", "texte", false),
    ],
  },
  poteau: {
    ontologie: "building.structure",
    libelle: "Poteau",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("point", "point-local"),
      p("formeId", "identifiant"),
      p("largeur", "longueur", true, { signe: ">0" }),
      p("profondeur", "longueur", true, { signe: ">0" }),
      p("hauteur", "longueur", true, { signe: ">0" }),
      p("angle", "angle"),
      p("nom", "texte", false),
      p("statutConception", "texte", false),
    ],
  },
  piece: {
    ontologie: "building.architecture",
    libelle: "Pièce",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("polygones", "polygones-avec-trous-local"),
      p("polygonesSource", "polygones-avec-trous-local", false, { repereLocalLibre: true }),
      p("code", "texte", false),
      p("nom", "texte"),
      p("categorie", "texte", false),
      p("aireDeclaree", "aire", false),
      p("aireCalculee", "aire", false, { derive: true }),
      p("notes", "texte", false),
      p("etiquette", "point-local", false, { repereLocalLibre: true }),
    ],
  },
  espace: { ontologie: "building.architecture", libelle: "Espace", porteNiveau: true, admetCalque: true, parametres: polygonal() },
  zone: { ontologie: "building.architecture", libelle: "Zone", porteNiveau: true, admetCalque: true, parametres: polygonal() },
  solide: {
    ontologie: "drawing",
    libelle: "Solide",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("contour", "polygone-local"),
      p("trous", "trous-local"),
      p("ferme", "booleen"),
      p("hauteur", "longueur", true, { signe: ">=0" }),
      p("decalageBase", "longueur"),
      p("epaisseur", "longueur", false),
      p("role", "texte"),
      p("nom", "texte", false),
      p("couleur", "couleur", false),
    ],
  },
  "esquisse.ligne": { ontologie: "drawing", libelle: "Ligne", porteNiveau: true, admetCalque: true, parametres: [p("a", "point-local"), p("b", "point-local"), p("nom", "texte", false)] },
  "esquisse.polyligne": {
    ontologie: "drawing",
    libelle: "Polyligne",
    porteNiveau: true,
    admetCalque: true,
    parametres: [p("points", "liste-points-local"), p("ferme", "booleen"), p("nom", "texte", false)],
  },
  "esquisse.arc": {
    ontologie: "drawing",
    libelle: "Arc",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("centre", "point-local"),
      p("rayon", "longueur", true, { signe: ">0" }),
      p("angleDebut", "angle"),
      p("angleFin", "angle"),
      p("sens", "enum", true, { valeurs: ["trigo", "horaire"] }),
      p("nom", "texte", false),
    ],
  },
  "esquisse.cercle": {
    ontologie: "drawing",
    libelle: "Cercle",
    porteNiveau: true,
    admetCalque: true,
    parametres: [p("centre", "point-local"), p("rayon", "longueur", true, { signe: ">0" }), p("nom", "texte", false)],
  },
  "esquisse.rectangle": {
    ontologie: "drawing",
    libelle: "Rectangle",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("origine", "point-local"),
      p("largeur", "longueur", true, { signe: ">0" }),
      p("profondeur", "longueur", true, { signe: ">0" }),
      p("angle", "angle"),
      p("nom", "texte", false),
    ],
  },
  "esquisse.polygone": {
    ontologie: "drawing",
    libelle: "Polygone régulier",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("centre", "point-local"),
      p("nombreCotes", "entier"),
      p("rayon", "longueur", true, { signe: ">0" }),
      p("mode", "enum", true, { valeurs: ["inscrit", "circonscrit"] }),
      p("angle", "angle"),
      p("nom", "texte", false),
    ],
  },
  "esquisse.spline": {
    ontologie: "drawing",
    libelle: "Spline",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("points", "liste-points-local"),
      p("mode", "enum", true, { valeurs: ["controle", "passage"] }),
      p("degre", "entier"),
      p("ferme", "booleen"),
      p("nom", "texte", false),
    ],
  },
  "esquisse.construction": {
    ontologie: "drawing",
    libelle: "Ligne d'axe ou de construction",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("nature", "enum", true, { valeurs: ["axe", "construction"] }),
      p("a", "point-local", false),
      p("b", "point-local", false),
      p("depassement", "longueur", false, { signe: ">=0" }),
      p("point", "point-local", false),
      p("direction", "angle", false),
      p("etendue", "enum", false, { valeurs: ["droite", "demi-droite"] }),
      p("nom", "texte", false),
    ],
  },
  "esquisse.hachure": {
    ontologie: "drawing",
    libelle: "Hachure",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("contour", "polygone-local"),
      p("trous", "trous-local"),
      p("motifId", "identifiant"),
      p("angle", "angle"),
      p("espacement", "longueur", true, { signe: ">0" }),
      p("couleur", "couleur", false),
      p("fond", "couleur", false),
    ],
  },
  "reference-plan": {
    ontologie: "drawing",
    libelle: "Référence de plan",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("contour", "polygone-avec-trous-local", false),
      p("imageId", "identifiant", false),
      p("source", "texte", false),
      p("echelle", "reel", false),
      p("nom", "texte", false),
    ],
  },
  cotation: {
    ontologie: "annotation",
    libelle: "Cotation",
    porteNiveau: true,
    admetCalque: true,
    parametres: [
      p("a", "point-local"),
      p("b", "point-local"),
      p("decalage", "longueur"),
      p("references", "references-extremites"),
      p("etat", "enum", true, { valeurs: ["libre", "rattachee", "a-reparer"] }),
      p("texteRemplacement", "texte", false),
    ],
  },
  texte: { ontologie: "annotation", libelle: "Texte", porteNiveau: true, admetCalque: true, parametres: [p("position", "point-local"), p("texte", "texte")] },
  etiquette: {
    ontologie: "annotation",
    libelle: "Étiquette",
    porteNiveau: true,
    admetCalque: true,
    parametres: [p("position", "point-local"), p("objetId", "identifiant", false), p("caracteristique", "texte", false), p("texte", "texte", false)],
  },
  calque: {
    ontologie: "projet",
    libelle: "Calque",
    porteNiveau: false,
    admetCalque: false,
    parametres: [
      p("nom", "texte"),
      p("couleur", "couleur"),
      p("remplissage", "couleur", false),
      p("visible", "booleen"),
      p("verrouille", "booleen"),
      p("ordre", "entier"),
      p("niveauxPresence", "liste-identifiants", false),
    ],
  },
  groupe: { ontologie: "projet", libelle: "Groupe", porteNiveau: false, admetCalque: false, parametres: [p("nom", "texte", false), p("membres", "liste-identifiants")] },
  parcelle: {
    ontologie: "projet",
    libelle: "Parcelle",
    porteNiveau: false,
    admetCalque: false,
    parametres: [
      p("numero", "texte", false),
      p("commune", "texte", false),
      p("crs", "texte"),
      p("crsSource", "texte", false),
      p("sommetsCadastraux", "polygone-cadastral"),
      p("sommetsLocaux", "polygone-local", false),
      p("identifiantsSommets", "liste-identifiants", false),
      p("aire", "aire", false),
      p("aireOfficielle", "aire", false),
      p("aireCorrigeeImprimee", "aire", false),
      p("recul", "longueur", false),
      p("enveloppeRecul", "polygone-cadastral", false),
    ],
  },
  emprise: {
    ontologie: "projet",
    libelle: "Emprise",
    porteNiveau: false,
    admetCalque: false,
    parametres: [p("sommetsCadastraux", "polygone-cadastral", false), p("sommetsLocaux", "polygone-local", false), p("revisionArchitecture", "entier", false)],
    unDe: [["sommetsCadastraux", "sommetsLocaux"]],
  },
  hypothese: {
    ontologie: "projet",
    libelle: "Hypothèse",
    porteNiveau: false,
    admetCalque: false,
    parametres: [p("code", "identifiant"), p("theme", "texte", false), p("texte", "texte"), p("valeur", "valeur-simple", false)],
  },
  source: {
    ontologie: "projet",
    libelle: "Source",
    porteNiveau: false,
    admetCalque: false,
    parametres: [
      p("code", "identifiant"),
      p("fichier", "texte", false),
      p("titre", "texte", false),
      p("fourni", "texte", false),
      p("usage", "texte", false),
      p("inspectee", "booleen", false),
    ],
  },
  structureDeclaree: {
    ontologie: "projet",
    libelle: "Structure déclarée",
    porteNiveau: false,
    admetCalque: false,
    parametres: [
      p("systeme", "texte", false),
      p("porteeRequise", "longueur", false),
      p("charges", "liste-charges", false),
      p("natureCharge", "texte", false),
      p("poidsPropreInclus", "booleen", false),
      p("reglePoteaux", "texte", false),
      p("statutEpaisseur", "texte", false),
      p("statutConception", "texte", false),
    ],
  },
};

function construire(classe: ClasseObjet): DescripteurClasse {
  const d = PARAMETRES[classe];
  const base: DescripteurClasse = {
    classe,
    ontologie: d.ontologie,
    libelle: d.libelle,
    parametres: d.parametres,
    porteNiveau: d.porteNiveau,
    admetCalque: d.admetCalque,
    admetType: estClasseTypee(classe),
    ifc: CLASSES_IFC[classe],
    caracteristiques: classe === "dalle" ? ["dalle:contour[i]"] : (CARACTERISTIQUES_PAR_CLASSE[classe] ?? []),
  };
  return d.unDe ? { ...base, unDe: d.unDe } : base;
}

/** Catalogue de l'ontologie (une entrée par classe de `CLASSES_OBJET`). */
export const ONTOLOGIE: Readonly<Record<ClasseObjet, DescripteurClasse>> = Object.fromEntries(
  (Object.keys(PARAMETRES) as ClasseObjet[]).map((c) => [c, construire(c)]),
) as Record<ClasseObjet, DescripteurClasse>;

export function descripteur(classe: ClasseObjet): DescripteurClasse {
  return ONTOLOGIE[classe];
}

export const CLASSES_DESSIN: readonly ClasseObjet[] = [...CLASSES_ESQUISSE, "solide", "reference-plan"];
