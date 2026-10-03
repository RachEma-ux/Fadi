/**
 * Caractéristiques nommées (cahier §5.2) : cibles stables des références topologiques (cotations, étiquettes,
 * ouvertures, contraintes). Stables tant que l'objet existe ; une scission crée de nouveaux objets et met les
 * références « à réparer » (R12). La résolution est dans `src/references/**` (L1.3) ; le contrat est dans
 * `contrats/references.ts`.
 */
import type { ClasseObjet } from "./classes.js";

export type CaracteristiqueMur = "mur:face-gauche" | "mur:face-droite" | "mur:arete-debut" | "mur:arete-fin" | "mur:axe";
/** `i` : indice de sommet du contour (arête i → i+1). */
export type CaracteristiqueDalle = `dalle:contour[${number}]`;
export type CaracteristiqueOuverture = "ouverture:centre";
export type CaracteristiqueEscalier = "escalier:depart" | "escalier:arrivee";
export type CaracteristiquePoteau = "poteau:centre";

export type CaracteristiqueNommee = CaracteristiqueMur | CaracteristiqueDalle | CaracteristiqueOuverture | CaracteristiqueEscalier | CaracteristiquePoteau;

/** Caractéristiques fixes par classe (hors `dalle:contour[i]`, paramétrée par l'indice). */
export const CARACTERISTIQUES_PAR_CLASSE: Readonly<Partial<Record<ClasseObjet, readonly string[]>>> = {
  mur: ["mur:face-gauche", "mur:face-droite", "mur:arete-debut", "mur:arete-fin", "mur:axe"],
  porte: ["ouverture:centre"],
  fenetre: ["ouverture:centre"],
  ouverture: ["ouverture:centre"],
  escalier: ["escalier:depart", "escalier:arrivee"],
  poteau: ["poteau:centre"],
};

const MOTIF_CONTOUR_DALLE = /^dalle:contour\[(0|[1-9][0-9]*)\]$/;

/** Indice d'arête d'une caractéristique `dalle:contour[i]`, ou `null`. */
export function indiceContourDalle(c: string): number | null {
  const m = MOTIF_CONTOUR_DALLE.exec(c);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

export function estCaracteristiqueNommee(c: unknown): c is CaracteristiqueNommee {
  if (typeof c !== "string") return false;
  if (indiceContourDalle(c) !== null) return true;
  return Object.values(CARACTERISTIQUES_PAR_CLASSE).some((liste) => liste?.includes(c));
}

/** Vrai si la caractéristique existe pour la classe (l'existence de l'indice de contour est vérifiée au résolveur). */
export function caracteristiqueAdmise(classe: ClasseObjet, c: string): boolean {
  if (classe === "dalle") return indiceContourDalle(c) !== null;
  return CARACTERISTIQUES_PAR_CLASSE[classe]?.includes(c) ?? false;
}
