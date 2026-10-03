/**
 * Propriétés typées (cahier §5.2, DA-06-07) et classification (DA-06-08).
 *
 * Les paramètres canoniques (axe, épaisseur…) ne sont PAS des propriétés : ils sont dans `params` et se
 * modifient par la commande de leur classe. Une propriété porte toujours provenance et statut.
 *
 * Propriétés `import` (D-021) : la valeur source est conservée bit à bit (`ValeurJson` : nombres JavaScript
 * non transformés, tableaux et objets tels quels), ex. `vertexOffsets`, `topOffsets`, `levels[].areas`,
 * `lineRef`, `color`, présence d'un calque par niveau.
 */
import type { Tracabilite } from "./provenance.js";
import type { Unite } from "./unites.js";

export type ValeurJson = null | boolean | number | string | readonly ValeurJson[] | { readonly [cle: string]: ValeurJson };

/** Valeur d'une propriété : grandeur (nombre + `unite` obligatoire), texte, booléen, référence d'objet ou JSON importé. */
export type ValeurPropriete = ValeurJson;

export interface Propriete extends Tracabilite {
  /** Identifiant de propriété (nom libre, ou nom déclaré par l'ontologie, ou chemin source pour un import : `import.lineRef`). */
  readonly nom: string;
  readonly valeur: ValeurPropriete;
  /** Obligatoire pour une grandeur numérique ; absent pour un texte, un booléen, une énumération ou un JSON importé. */
  readonly unite?: Unite;
}

/** Préfixe des propriétés qui conservent un champ source sans transformation. */
export const PREFIXE_PROPRIETE_IMPORT = "import.";

/** Classification (DA-06-08) : aucun système imposé ni livré (R3). */
export interface Classification {
  readonly systeme: string;
  readonly code: string;
  readonly libelle?: string;
  readonly provenance: "saisie" | "import";
}

export function controlerPropriete(p: Propriete): string[] {
  const erreurs: string[] = [];
  if (typeof p.nom !== "string" || p.nom.trim() === "") erreurs.push("nom de propriété vide");
  if (typeof p.valeur === "number" && !Number.isFinite(p.valeur)) erreurs.push(`propriété ${p.nom} : valeur non finie`);
  if (p.unite !== undefined && typeof p.valeur !== "number") erreurs.push(`propriété ${p.nom} : unité sans valeur numérique`);
  return erreurs;
}
