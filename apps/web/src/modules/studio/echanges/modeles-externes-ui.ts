/**
 * Libellés et saisies de la boîte « Modèles externes » (lot F3, TR-EX-066). Pur : ni React ni DOM. Les textes sont
 * l'interface (français source, traduits par le dictionnaire) ; les déclarations du partenaire sont des données.
 */
import {
  STUDIO_UNITES_DECLAREES, type StudioCompteDifferences, type StudioComparaisonModeleExterne, type StudioEcartModeleExterne, type StudioStatutModeleExterne,
  type StudioTransformationDeclaree, type StudioUniteDeclaree,
} from "@parcours/atelier-model";

export const LIBELLES_STATUT_MODELE: Readonly<Record<StudioStatutModeleExterne, string>> = Object.freeze({
  compare: "Comparé — décision attendue",
  accepte: "Accepté",
  refuse: "Refusé",
});

export const LIBELLES_ECART_MODELE: Readonly<Record<StudioEcartModeleExterne, string>> = Object.freeze({
  "unite-non-evaluee": "Unité du fichier non évaluée : le modèle ne peut pas être accepté.",
  "unite-declaree-differente": "L’unité déclarée par l’émetteur diffère de l’unité lue dans le fichier.",
  "transformation-non-declaree": "Aucune transformation déclarée : le modèle est comparé dans son propre repère.",
  "elements-non-natifs": "Le modèle contient des éléments non natifs (conservés, non éditables).",
});

export const LIBELLES_ACTION_MODELE: Readonly<Record<"recevoir" | "comparer" | "accepter" | "refuser", string>> = Object.freeze({
  recevoir: "Reçu et comparé",
  comparer: "Comparé de nouveau",
  accepter: "Accepté",
  refuser: "Refusé",
});

/** Familles du résumé de comparaison, dans l'ordre d'affichage. */
export const FAMILLES_COMPARAISON: readonly { cle: keyof StudioComparaisonModeleExterne["resume"]; libelle: string }[] = Object.freeze([
  { cle: "architecture", libelle: "Murs et ouvertures" },
  { cle: "solides", libelle: "Solides libres" },
  { cle: "nonNatifs", libelle: "Éléments non natifs" },
  { cle: "objets", libelle: "Objets 2D" },
  { cle: "calques", libelle: "Calques" },
  { cle: "cotes", libelle: "Cotes" },
]);

export const UNITES_DECLARABLES: readonly { valeur: StudioUniteDeclaree; libelle: string }[] = Object.freeze([
  { valeur: "m", libelle: "Mètres (m)" },
  { valeur: "cm", libelle: "Centimètres (cm)" },
  { valeur: "mm", libelle: "Millimètres (mm)" },
  { valeur: "ft", libelle: "Pieds (ft)" },
  { valeur: "in", libelle: "Pouces (in)" },
]);
// Contrôle à la compilation : chaque unité déclarable est une unité du modèle.
void (UNITES_DECLARABLES satisfies readonly { valeur: keyof typeof STUDIO_UNITES_DECLAREES }[]);

export const compteDifferences = (c: StudioCompteDifferences): string => `${c.ajoute} ajouté(s), ${c.supprime} supprimé(s), ${c.modifie} modifié(s), ${c.identique} identique(s)`;

export interface SaisieTransformation { dx: string; dy: string; dz: string; rotationDegres: string }
export const SAISIE_TRANSFORMATION_VIDE: SaisieTransformation = Object.freeze({ dx: "", dy: "", dz: "", rotationDegres: "" });

/** Transformation saisie (mètres, degrés) → déclarée (mètres, radians) ; un champ vide ou non numérique est refusé. */
export function transformationSaisie(s: SaisieTransformation): StudioTransformationDeclaree | { erreur: string } {
  const lu = (v: string) => { const t = v.trim().replace(",", "."); return t === "" ? Number.NaN : Number(t); };
  const dx = lu(s.dx), dy = lu(s.dy), dz = lu(s.dz), r = lu(s.rotationDegres);
  if (![dx, dy, dz, r].every(Number.isFinite)) return { erreur: "Transformation déclarée : renseignez les quatre valeurs (nombres) ; aucune n’est supposée." };
  return { dx, dy, dz, rotation: (r * Math.PI) / 180 };
}
