/**
 * Ontologie activée dans Fadi (cahier des charges, section 5.2 ; Architecture V4 §4) : classes, ontologie
 * d'appartenance, classe IFC 4.3 correspondante, relations admises, caractéristiques nommées. Les paramètres
 * canoniques de chaque classe sont décrits par leur interface TypeScript (`modele.ts`) et validés par les
 * commandes qui les créent (`commandes/`).
 */

import type { ModeleAtelier } from "./modele.js";

export type Ontologie = "building.architecture" | "building.structure" | "drawing" | "annotation" | "projet" | "mechanical" | "structure" | "timber" | "sheetmetal";

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
  | "solide-exact"
  | "piece-mecanique"
  | "assemblage"
  | "liaison"
  | "poutre"
  | "trame"
  | "plaque"
  | "assemblage-structurel"
  | "soudure"
  | "armature"
  | "coulage"
  | "element-bois"
  | "ossature"
  | "panneau-clt"
  | "assemblage-bois"
  | "tole";

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
  // Ontologie mécanique (P2-2) : pièce (géométrie canonique = brep ou maillage copié de sa source, posée dans son
  // assemblage), assemblage (repère dans le niveau, numérotation, éclaté), liaison (contraintes entre deux pièces).
  "piece-mecanique": { classe: "piece-mecanique", ontologie: "mechanical", libelle: "Pièce mécanique", ifc: "IfcBuildingElementProxy", caracteristiques: ["centre"], parNiveau: true },
  assemblage: { classe: "assemblage", ontologie: "mechanical", libelle: "Assemblage", ifc: "IfcElementAssembly", caracteristiques: ["centre"], parNiveau: true },
  liaison: { classe: "liaison", ontologie: "mechanical", libelle: "Liaison", ifc: "IfcAnnotation", caracteristiques: [], parNiveau: false },
  // Ontologie structure (P2-3, DA-08) : éléments linéaires (poutres, contreventements…), trames, plaques, assemblages
  // paramétriques (géométrie seulement), soudures, armatures, coulages. Le poteau du socle (`building.structure`)
  // reste la classe des poteaux : la trame en crée, l'assemblage structurel les relie.
  poutre: { classe: "poutre", ontologie: "structure", libelle: "Élément de structure", ifc: "IfcBeam", caracteristiques: ["arete-debut", "arete-fin", "axe", "centre"], parNiveau: true },
  trame: { classe: "trame", ontologie: "structure", libelle: "Trame", ifc: "IfcGrid", caracteristiques: ["centre", "sommet"], parNiveau: true },
  plaque: { classe: "plaque", ontologie: "structure", libelle: "Plaque", ifc: "IfcPlate", caracteristiques: ["contour", "centre"], parNiveau: true },
  "assemblage-structurel": { classe: "assemblage-structurel", ontologie: "structure", libelle: "Assemblage structurel", ifc: "IfcElementAssembly", caracteristiques: ["centre"], parNiveau: true },
  soudure: { classe: "soudure", ontologie: "structure", libelle: "Soudure", ifc: "IfcFastener", caracteristiques: ["centre"], parNiveau: true },
  armature: { classe: "armature", ontologie: "structure", libelle: "Armature", ifc: "IfcReinforcingBar", caracteristiques: ["sommet", "centre"], parNiveau: true },
  coulage: { classe: "coulage", ontologie: "structure", libelle: "Coulage", ifc: "IfcGroup", caracteristiques: [], parNiveau: true },
  // Ontologie bois (P2-4, DA-09) : éléments, ossatures (mur, toit) à génération contrôlée, panneaux CLT, assemblages.
  "element-bois": { classe: "element-bois", ontologie: "timber", libelle: "Élément bois", ifc: "IfcMember", caracteristiques: ["arete-debut", "arete-fin", "axe", "centre"], parNiveau: true },
  ossature: { classe: "ossature", ontologie: "timber", libelle: "Ossature bois", ifc: "IfcElementAssembly", caracteristiques: ["centre"], parNiveau: true },
  "panneau-clt": { classe: "panneau-clt", ontologie: "timber", libelle: "Panneau CLT", ifc: "IfcWall", caracteristiques: ["centre", "contour"], parNiveau: true },
  "assemblage-bois": { classe: "assemblage-bois", ontologie: "timber", libelle: "Assemblage bois", ifc: "IfcFastener", caracteristiques: ["centre"], parNiveau: true },
  // Ontologie tôlerie (P2-4, DA-11) : tôle pliée, développé dérivé.
  tole: { classe: "tole", ontologie: "sheetmetal", libelle: "Tôle pliée", ifc: "IfcPlate", caracteristiques: ["centre"], parNiveau: true },
};

export const CLASSES_OUVERTURE: readonly Classe[] = ["porte", "fenetre", "ouverture"];

export function estClasse(v: unknown): v is Classe {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CLASSES, v);
}

export function estOuverture(classe: Classe): classe is "porte" | "fenetre" | "ouverture" {
  return CLASSES_OUVERTURE.includes(classe);
}

/** Ontologies activées par défaut dans tout projet (Architecture V4 §4) : le bâtiment, la structure réduite au poteau, le dessin, l'annotation. */
export const ONTOLOGIES_ACTIVEES: readonly Ontologie[] = ["building.architecture", "building.structure", "drawing", "annotation", "projet"];
/** Ontologies qu'un projet active ou désactive lui-même (cahier P2 §4, T01) : les autres font le socle. */
export const ONTOLOGIES_ACTIVABLES: readonly Ontologie[] = ["mechanical", "structure", "timber", "sheetmetal"];
export const LIBELLES_ONTOLOGIE: Record<Ontologie, string> = { "building.architecture": "Bâtiment (architecture)", "building.structure": "Structure du socle (poteau)", drawing: "Dessin", annotation: "Annotation", projet: "Projet", mechanical: "Mécanique et assemblages", structure: "Structure (charpente, béton, assemblages)", timber: "Bois (ossature, CLT, assemblages)", sheetmetal: "Tôlerie (plis, développés)" };

/** Ontologies actives d'un projet : le socle, plus celles que le projet a activées (`ontologie.activer`). */
export function ontologiesActives(etat: Pick<ModeleAtelier, "ontologies">): readonly Ontologie[] {
  return [...ONTOLOGIES_ACTIVEES, ...(etat.ontologies ?? [])];
}

export function estOntologie(v: unknown): v is Ontologie {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(LIBELLES_ONTOLOGIE, v);
}
