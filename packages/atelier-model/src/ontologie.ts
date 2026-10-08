/**
 * Ontologie activée dans Fadi (cahier des charges, section 5.2 ; Architecture V4 §4) : classes, ontologie
 * d'appartenance, classe IFC 4.3 correspondante, relations admises, caractéristiques nommées. Les paramètres
 * canoniques de chaque classe sont décrits par leur interface TypeScript (`modele.ts`) et validés par les
 * commandes qui les créent (`commandes/`).
 */

export type Ontologie = "building.architecture" | "building.structure" | "drawing" | "annotation" | "projet";

export type Classe =
  | "mur"
  | "porte"
  | "fenetre"
  | "ouverture"
  | "dalle"
  | "toiture"
  | "escalier"
  | "piece"
  | "espace"
  | "zone"
  | "poteau"
  | "solide"
  | "esquisse"
  | "reference-plan"
  | "cotation"
  | "texte"
  | "etiquette"
  | "bloc-occurrence"
  | "garde-corps"
  | "objet-importe"
  | "solide-exact";

export type KindRelation =
  | "heberge-par" // ouverture → mur hôte
  | "delimitee-par" // pièce → mur (dérivée)
  | "joint-a" // mur → mur (dérivée)
  | "relie" // escalier → niveau (départ, arrivée)
  | "contient" // zone → pièce / espace ; groupe → occurrence
  | "correspond-a" // espace déclaré → pièce dessinée (import, code commun)
  | "reference" // annotation → caractéristique d'objet
  | "programme" // pièce → espace programmé (liaison Programmation)
  | "contrainte" // esquisse → esquisse : contrainte géométrique (lot 5, jeu borné)
  | "pose"; // objet porté → porteur : contrainte verticale (D-155)

export interface DescriptionClasse {
  classe: Classe;
  ontologie: Ontologie;
  libelle: string;
  ifc: string;
  /** Caractéristiques nommées que les références peuvent viser (section 5.2). */
  caracteristiques: readonly string[];
  /** La classe est posée sur un niveau (étage). */
  parNiveau: boolean;
}

export const CLASSES: Readonly<Record<Classe, DescriptionClasse>> = {
  mur: { classe: "mur", ontologie: "building.architecture", libelle: "Mur", ifc: "IfcWall", caracteristiques: ["face-gauche", "face-droite", "arete-debut", "arete-fin", "axe"], parNiveau: true },
  porte: { classe: "porte", ontologie: "building.architecture", libelle: "Porte", ifc: "IfcDoor", caracteristiques: ["centre"], parNiveau: true },
  fenetre: { classe: "fenetre", ontologie: "building.architecture", libelle: "Fenêtre", ifc: "IfcWindow", caracteristiques: ["centre"], parNiveau: true },
  ouverture: { classe: "ouverture", ontologie: "building.architecture", libelle: "Ouverture", ifc: "IfcOpeningElement", caracteristiques: ["centre"], parNiveau: true },
  dalle: { classe: "dalle", ontologie: "building.architecture", libelle: "Dalle", ifc: "IfcSlab", caracteristiques: ["contour"], parNiveau: true },
  toiture: { classe: "toiture", ontologie: "building.architecture", libelle: "Toiture", ifc: "IfcRoof", caracteristiques: ["contour"], parNiveau: true },
  escalier: { classe: "escalier", ontologie: "building.architecture", libelle: "Escalier", ifc: "IfcStair", caracteristiques: ["depart", "arrivee"], parNiveau: true },
  piece: { classe: "piece", ontologie: "building.architecture", libelle: "Pièce", ifc: "IfcSpace", caracteristiques: ["contour"], parNiveau: true },
  espace: { classe: "espace", ontologie: "building.architecture", libelle: "Espace", ifc: "IfcSpace", caracteristiques: ["contour"], parNiveau: true },
  zone: { classe: "zone", ontologie: "building.architecture", libelle: "Zone", ifc: "IfcZone", caracteristiques: ["contour"], parNiveau: true },
  poteau: { classe: "poteau", ontologie: "building.structure", libelle: "Poteau", ifc: "IfcColumn", caracteristiques: ["centre"], parNiveau: true },
  solide: { classe: "solide", ontologie: "drawing", libelle: "Solide", ifc: "IfcBuildingElementProxy", caracteristiques: ["contour"], parNiveau: true },
  esquisse: { classe: "esquisse", ontologie: "drawing", libelle: "Esquisse", ifc: "IfcAnnotation", caracteristiques: ["sommet", "segment", "centre"], parNiveau: true },
  "reference-plan": { classe: "reference-plan", ontologie: "drawing", libelle: "Référence de plan", ifc: "IfcAnnotation", caracteristiques: ["contour"], parNiveau: true },
  cotation: { classe: "cotation", ontologie: "annotation", libelle: "Cotation", ifc: "IfcAnnotation", caracteristiques: [], parNiveau: true },
  texte: { classe: "texte", ontologie: "annotation", libelle: "Texte", ifc: "IfcAnnotation", caracteristiques: [], parNiveau: true },
  etiquette: { classe: "etiquette", ontologie: "annotation", libelle: "Étiquette", ifc: "IfcAnnotation", caracteristiques: [], parNiveau: true },
  "garde-corps": { classe: "garde-corps", ontologie: "building.architecture", libelle: "Garde-corps", ifc: "IfcRailing", caracteristiques: ["sommet"], parNiveau: true },
  "objet-importe": { classe: "objet-importe", ontologie: "building.architecture", libelle: "Objet importé (IFC)", ifc: "IfcBuildingElementProxy", caracteristiques: ["centre"], parNiveau: true },
  "bloc-occurrence": { classe: "bloc-occurrence", ontologie: "drawing", libelle: "Occurrence de bloc", ifc: "IfcBuildingElementProxy", caracteristiques: ["centre", "sommet"], parNiveau: true },
  "solide-exact": { classe: "solide-exact", ontologie: "drawing", libelle: "Solide exact", ifc: "IfcBuildingElementProxy", caracteristiques: ["centre"], parNiveau: true },
};

export const CLASSES_OUVERTURE: readonly Classe[] = ["porte", "fenetre", "ouverture"];

export function estClasse(v: unknown): v is Classe {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CLASSES, v);
}

export function estOuverture(classe: Classe): classe is "porte" | "fenetre" | "ouverture" {
  return CLASSES_OUVERTURE.includes(classe);
}

/** Ontologies activées par projet (Architecture V4 §4) : Fadi active le bâtiment et, pour le poteau, la structure. */
export const ONTOLOGIES_ACTIVEES: readonly Ontologie[] = ["building.architecture", "building.structure", "drawing", "annotation", "projet"];
