/**
 * Collection de cartes (D-GD-36) : ensemble nommé et ORDONNÉ de références vers des cartes enregistrées (un atlas). Une
 * collection ne copie jamais une carte ; une carte peut appartenir à plusieurs collections ; supprimer une collection ne
 * supprime aucune carte. Opérations d'édition de la liste ordonnée, pures : aucun DOM, aucune requête.
 */

/** Carte référencée par une collection (identifiant, nom affiché, état de la carte). */
export interface CarteDeCollection { readonly id: string; readonly nom: string; readonly etat: "active" | "archivee" }

/** Ajoute une carte en dernière position ; une carte déjà présente n'est jamais ajoutée deux fois. */
export function ajouterCarte(liste: readonly CarteDeCollection[], carte: CarteDeCollection): CarteDeCollection[] {
  return liste.some((c) => c.id === carte.id) ? [...liste] : [...liste, carte];
}

/** Retire une carte de la collection (la carte elle-même n'est pas touchée). */
export function retirerCarte(liste: readonly CarteDeCollection[], id: string): CarteDeCollection[] {
  return liste.filter((c) => c.id !== id);
}

/** Monte (-1) ou descend (+1) une carte d'un rang ; aux extrémités, rien ne change. */
export function deplacerCarte(liste: readonly CarteDeCollection[], id: string, sens: -1 | 1): CarteDeCollection[] {
  const i = liste.findIndex((c) => c.id === id), j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return [...liste];
  const r = [...liste];
  [r[i], r[j]] = [r[j]!, r[i]!];
  return r;
}

/** Titre de collection valide : 1 à 120 caractères utiles (comme le nom d'une carte). */
export const titreCollectionValide = (t: string): boolean => t.trim().length >= 1 && t.trim().length <= 120;
