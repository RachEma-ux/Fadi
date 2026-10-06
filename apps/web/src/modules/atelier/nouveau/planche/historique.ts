/**
 * Annuler / rétablir LOCAL de la Planche (cahier-planche §5.7, C6) : historique de modèles immuables, une opération =
 * un pas ; une correction au champ Mesures après coup (`remplaceDernier`) remplace le dernier pas au lieu d'en
 * ajouter un. Brouillon jusqu'au lot 7 : aucune commande, aucun journal serveur. Pur.
 */
import type { Modele } from "@parcours/planche-model";

export interface Pas {
  readonly modele: Modele;
  /** Opération qui a produit ce modèle (`null` pour l'état de départ). */
  readonly operation: string | null;
}

export interface Historique {
  readonly passe: readonly Pas[];
  readonly present: Pas;
  readonly futur: readonly Pas[];
}

/** Nombre de pas conservés (choix Fadi : borne mémoire du brouillon). */
export const PAS_MAX = 200;

export function historiqueInitial(modele: Modele): Historique {
  return { passe: [], present: { modele, operation: null }, futur: [] };
}

/** Enregistre un nouveau modèle ; `remplaceDernier` remplace le dernier pas (s'il existe) au lieu d'en empiler un. */
export function enregistrer(h: Historique, modele: Modele, operation: string, remplaceDernier = false): Historique {
  if (modele === h.present.modele) return h;
  if (remplaceDernier && h.passe.length > 0) return { passe: h.passe, present: { modele, operation }, futur: [] };
  const passe = [...h.passe, h.present];
  return { passe: passe.length > PAS_MAX ? passe.slice(passe.length - PAS_MAX) : passe, present: { modele, operation }, futur: [] };
}

export const peutAnnuler = (h: Historique): boolean => h.passe.length > 0;
export const peutRetablir = (h: Historique): boolean => h.futur.length > 0;

/** Opération qu'annulerait / rétablirait le prochain pas. */
export const operationAAnnuler = (h: Historique): string | null => (peutAnnuler(h) ? h.present.operation : null);
export const operationARetablir = (h: Historique): string | null => h.futur[0]?.operation ?? null;

export function annuler(h: Historique): Historique | null {
  const precedent = h.passe[h.passe.length - 1];
  if (!precedent) return null;
  return { passe: h.passe.slice(0, -1), present: precedent, futur: [h.present, ...h.futur] };
}

export function retablir(h: Historique): Historique | null {
  const suivant = h.futur[0];
  if (!suivant) return null;
  return { passe: [...h.passe, h.present], present: suivant, futur: h.futur.slice(1) };
}
