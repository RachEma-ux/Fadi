/**
 * Paramètres courants des outils d'architecture : **dernières valeurs saisies par l'utilisateur dans la session**,
 * jamais une valeur inventée ni tirée de P.118 (R3, DA-07-01). Un paramètre absent bloque le geste avec une
 * erreur lisible qui dit quel champ saisir. Préférence d'interface, jamais dans le modèle (R10).
 *
 * Deux genres de valeurs : les nombres (`saisie`) et les choix dans une liste (`choix`, D-038 : type courant,
 * alignement), mémorisés séparément.
 */
import { cleDefinition, ID_NON_TYPE, type AlignementMur, type ClasseTypee, type EtatModele, type Longueur } from "@parcours/atelier-model";
import type { ChampSaisie, ErreurLisible } from "../../socle";
import { lisible } from "../../plan2d/outils/commun";

export interface Valeurs {
  readonly nombres: Readonly<Record<string, number>>;
  readonly choix: Readonly<Record<string, string>>;
}

export const VIDES: Valeurs = { nombres: {}, choix: {} };

const memoire = new Map<string, Valeurs>();

export function lireMemoire(cle: string): Valeurs {
  return memoire.get(cle) ?? VIDES;
}

export function ecrireMemoire(cle: string, valeurs: Valeurs): void {
  memoire.set(cle, valeurs);
}

/** Vide la mémoire des paramètres (tests). */
export function oublierParametresObjets(): void {
  memoire.clear();
}

export const ALIGNEMENTS: readonly { readonly valeur: AlignementMur; readonly libelle: string }[] = [
  { valeur: "axe", libelle: "Axe (faces à ± e/2)" },
  { valeur: "gauche", libelle: "Face gauche sur le tracé" },
  { valeur: "droite", libelle: "Face droite sur le tracé" },
];

/** Alignement choisi ; « axe » tant qu'aucun choix n'est fait (convention de tracé DA-02-07). */
export const alignementDe = (v: Valeurs): AlignementMur => (ALIGNEMENTS.find((a) => a.valeur === v.choix.alignement)?.valeur ?? "axe");

export function champAlignement(v: Valeurs): ChampSaisie {
  return { champ: "alignement", libelle: "Alignement", unite: "", valeur: null, choix: ALIGNEMENTS, valeurChoisie: alignementDe(v) };
}

/** Types du catalogue pour une classe : « sans type » puis par identifiant. */
export function typesDe(etat: EtatModele | null, classe: ClasseTypee): { valeur: string; libelle: string }[] {
  const r = [{ valeur: ID_NON_TYPE, libelle: "Sans type" }];
  if (!etat) return r;
  const defs = Object.values(etat.catalogue.definitions)
    .filter((d) => d.classe === classe && d.id !== ID_NON_TYPE)
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...r, ...defs.map((d) => ({ valeur: d.id, libelle: d.nom }))];
}

/** Type choisi s'il existe encore au catalogue, sinon « sans type ». */
export const typeDe = (etat: EtatModele | null, classe: ClasseTypee, v: Valeurs): string => {
  const id = v.choix.type;
  return id !== undefined && typesDe(etat, classe).some((t) => t.valeur === id) ? id : ID_NON_TYPE;
};

export function champType(etat: EtatModele | null, classe: ClasseTypee, v: Valeurs): ChampSaisie {
  return { champ: "type", libelle: "Type", unite: "", valeur: null, choix: typesDe(etat, classe), valeurChoisie: typeDe(etat, classe, v) };
}

/** Dimension proposée par le type (DA-05-14 : valeur proposée à la création, jamais imposée). */
export function dimensionProposee(etat: EtatModele | null, classe: ClasseTypee, typeId: string, cle: "epaisseur" | "hauteur" | "largeur" | "allege"): number | undefined {
  const d: Longueur | undefined = etat?.catalogue.definitions[cleDefinition(classe, typeId)]?.dimensionsProposees?.[cle];
  return d?.value;
}

/** Contrôle d'un choix reçu (`choix`) : la valeur doit être l'une des options du champ. */
export function controlerChoix(objet: string, champ: ChampSaisie | undefined, valeur: string): ErreurLisible | null {
  if (!champ?.choix) return lisible(objet, `« ${valeur} » : aucun choix attendu ici`, "utiliser les champs proposés par l'outil");
  return champ.choix.some((c) => c.valeur === valeur) ? null : lisible(objet, `${champ.libelle.toLowerCase()} « ${valeur} » inconnu`, "choisir une valeur de la liste");
}

/** Contrôle d'un paramètre numérique saisi. */
export function controlerSaisie(objet: string, champ: string, valeur: number): ErreurLisible | null {
  switch (champ) {
    case "epaisseur":
    case "hauteur":
    case "largeur":
    case "giron":
    case "emmarchement":
    case "hauteurAFranchir":
      return valeur > 0 ? null : lisible(objet, `${champ} ${valeur} m : doit être strictement positive`, "taper une valeur supérieure à 0");
    case "allege":
      return valeur >= 0 ? null : lisible(objet, `allège ${valeur} m négative`, "taper une allège positive ou nulle");
    case "contremarches":
    case "marches":
      return Number.isInteger(valeur) && valeur >= (champ === "marches" ? 0 : 1) ? null : lisible(objet, `${champ} ${valeur} : entier attendu`, champ === "marches" ? "taper un entier positif ou nul" : "taper un entier supérieur ou égal à 1");
    default:
      return null;
  }
}
