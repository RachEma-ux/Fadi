/**
 * Paramètres courants des outils d'architecture : **dernières valeurs saisies par l'utilisateur dans la session**,
 * jamais une valeur inventée ni tirée de P.118 (R3, DA-07-01). Un paramètre absent bloque le geste avec une
 * erreur lisible qui dit quel champ saisir. Préférence d'interface, jamais dans le modèle (R10).
 *
 * Les champs de saisie du contrat ne portent que des nombres (`ChampSaisie`) : les choix (type, alignement) sont
 * codés en rangs numériques en attendant un champ « choix » au socle (demande au chef de projet).
 */
import { cleDefinition, ID_NON_TYPE, type AlignementMur, type ClasseTypee, type EtatModele, type Longueur } from "@parcours/atelier-model";
import type { ChampSaisie, ErreurLisible } from "../../socle";
import { lisible } from "../../plan2d/outils/commun";

const memoire = new Map<string, Readonly<Record<string, number>>>();

export function lireMemoire(cle: string): Readonly<Record<string, number>> {
  return memoire.get(cle) ?? {};
}

export function ecrireMemoire(cle: string, valeurs: Readonly<Record<string, number>>): void {
  memoire.set(cle, valeurs);
}

/** Vide la mémoire des paramètres (tests). */
export function oublierParametresObjets(): void {
  memoire.clear();
}

/** Alignement codé : −1 gauche, 0 axe, 1 droite. */
export const ALIGNEMENTS: readonly AlignementMur[] = ["gauche", "axe", "droite"];
export const alignementDe = (code: number | undefined): AlignementMur => ALIGNEMENTS[(code ?? 0) + 1] ?? "axe";
export const codeAlignement = (a: unknown): number => (a === "gauche" ? -1 : a === "droite" ? 1 : 0);

/** Types du catalogue pour une classe, rang 0 = « sans type » puis par identifiant. */
export function typesDe(etat: EtatModele | null, classe: ClasseTypee): { id: string; nom: string }[] {
  const r = [{ id: ID_NON_TYPE, nom: "Sans type" }];
  if (!etat) return r;
  const defs = Object.values(etat.catalogue.definitions)
    .filter((d) => d.classe === classe && d.id !== ID_NON_TYPE)
    .sort((a, b) => a.id.localeCompare(b.id));
  return [...r, ...defs.map((d) => ({ id: d.id, nom: d.nom }))];
}

export const typeDeRang = (etat: EtatModele | null, classe: ClasseTypee, rang: number | undefined): string => typesDe(etat, classe)[rang ?? 0]?.id ?? ID_NON_TYPE;
export const rangDeType = (etat: EtatModele | null, classe: ClasseTypee, id: string): number => Math.max(0, typesDe(etat, classe).findIndex((t) => t.id === id));

/** Dimension proposée par le type (DA-05-14 : valeur proposée à la création, jamais imposée). */
export function dimensionProposee(etat: EtatModele | null, classe: ClasseTypee, typeId: string, cle: "epaisseur" | "hauteur" | "largeur" | "allege"): number | undefined {
  const d: Longueur | undefined = etat?.catalogue.definitions[cleDefinition(classe, typeId)]?.dimensionsProposees?.[cle];
  return d?.value;
}

export function champType(etat: EtatModele | null, classe: ClasseTypee, rang: number | undefined): ChampSaisie {
  const types = typesDe(etat, classe);
  return { champ: "type", libelle: `Type (${types.map((t, i) => `${i} ${t.nom}`).join(", ")})`, unite: "", valeur: rang ?? 0 };
}

/** Contrôle d'un paramètre numérique saisi. */
export function controlerSaisie(objet: string, champ: string, valeur: number, etat: EtatModele | null, classe?: ClasseTypee): ErreurLisible | null {
  switch (champ) {
    case "epaisseur":
    case "hauteur":
    case "largeur":
    case "giron":
      return valeur > 0 ? null : lisible(objet, `${champ} ${valeur} m : doit être strictement positive`, "taper une valeur supérieure à 0");
    case "allege":
      return valeur >= 0 ? null : lisible(objet, `allège ${valeur} m négative`, "taper une allège positive ou nulle");
    case "alignement":
      return [-1, 0, 1].includes(valeur) ? null : lisible(objet, `alignement ${valeur} inconnu`, "taper −1 (gauche), 0 (axe) ou 1 (droite)");
    case "type": {
      const n = classe ? typesDe(etat, classe).length : 1;
      return Number.isInteger(valeur) && valeur >= 0 && valeur < n ? null : lisible(objet, `type n° ${valeur} inconnu`, `taper un numéro de 0 à ${n - 1}`);
    }
    case "contremarches":
    case "marches":
      return Number.isInteger(valeur) && valeur >= (champ === "marches" ? 0 : 1) ? null : lisible(objet, `${champ} ${valeur} : entier attendu`, champ === "marches" ? "taper un entier positif ou nul" : "taper un entier supérieur ou égal à 1");
    default:
      return null;
  }
}
