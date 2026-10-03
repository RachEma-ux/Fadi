/**
 * Définitions de types et catalogue versionné (DA-05-14, DA-05-15).
 *
 * Un type ne porte pas de dimension imposée : épaisseur, largeur, hauteur restent sur l'occurrence. Une
 * dimension de type facultative n'est qu'une valeur proposée à la création, jamais un écrasement. Aucun
 * contenu de catalogue n'est livré (R3) : seule la définition « non-type » est générique ; `cloison` et `mur`
 * sont créés par l'importeur P.118 à partir des données.
 */
import type { ClasseObjet } from "./classes.js";
import { CLASSES_IFC } from "./ifc.js";
import type { Tracabilite } from "./provenance.js";
import type { Propriete } from "./proprietes.js";
import type { Longueur } from "./unites.js";

export const CLASSES_TYPEES = ["mur", "porte", "fenetre", "ouverture"] as const satisfies readonly ClasseObjet[];
export type ClasseTypee = (typeof CLASSES_TYPEES)[number];

export const ID_NON_TYPE = "non-type";

export interface DefinitionType extends Tracabilite {
  /** Identifiant stable dans le projet (ex. `cloison`), unique par classe. */
  readonly id: string;
  readonly classe: ClasseTypee;
  readonly nom: string;
  readonly categorie?: string;
  /** Entité de type IFC (`IfcWallType`…), dérivée de la classe. */
  readonly classeIfc: string | null;
  /** Valeurs proposées à la création (facultatives), jamais imposées. */
  readonly dimensionsProposees?: Readonly<Partial<Record<"epaisseur" | "hauteur" | "largeur" | "allege", Longueur>>>;
  readonly proprietes: readonly Propriete[];
  /** Version du catalogue à laquelle la définition a été créée ou modifiée pour la dernière fois. */
  readonly versionCatalogue: number;
}

/** Catalogue de types du projet ; `version` : entier croissant (+1 à chaque `type.definir` / `type.modifier`). */
export interface CatalogueTypes {
  readonly version: number;
  /** Clé : `${classe}:${id}`. */
  readonly definitions: Readonly<Record<string, DefinitionType>>;
}

export function cleDefinition(classe: ClasseTypee, id: string): string {
  return `${classe}:${id}`;
}

export function estClasseTypee(c: ClasseObjet): c is ClasseTypee {
  return (CLASSES_TYPEES as readonly string[]).includes(c);
}

/** Définition générique « non-type » d'une classe (aucune donnée de projet). */
export function definitionNonType(classe: ClasseTypee, versionCatalogue: number): DefinitionType {
  return {
    id: ID_NON_TYPE,
    classe,
    nom: "Sans type",
    classeIfc: CLASSES_IFC[classe]?.entiteType ?? null,
    proprietes: [],
    versionCatalogue,
    provenance: "regle",
    statut: "declaree",
  };
}

export const CATALOGUE_VIDE: CatalogueTypes = { version: 0, definitions: {} };
