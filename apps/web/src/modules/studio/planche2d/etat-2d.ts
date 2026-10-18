/**
 * Règles d'état de la Planche 2D, sans React : quelle révision ouvrir, quand rejouer une requête d'enregistrement,
 * quand signaler une révision plus récente, comment décrire un élément au clavier. Pur.
 */
import type { studio2d } from "@parcours/domain-model";

type Doc = studio2d.ContenuDocument2D;

/**
 * Identifiant de la requête d'enregistrement : un nouvel essai après une erreur réseau rejoue la même requête
 * (le serveur ne crée jamais deux révisions) seulement si le dessin envoyé est exactement celui d'aujourd'hui ;
 * un dessin modifié depuis est une nouvelle requête (sinon le serveur la refuserait comme réutilisée).
 */
export function idRequete(precedent: { requestId: string; contenu: Doc } | null, doc: Doc, nouvel: () => string): string {
  return precedent && precedent.contenu === doc ? precedent.requestId : nouvel();
}

/** La tête vue par le serveur est plus récente que la révision sur laquelle l'éditeur travaille. */
export function revisionPlusRecente(teteServeur: { numero: number } | null | undefined, courante: { numero: number } | null | undefined): boolean {
  return !!teteServeur && teteServeur.numero > (courante?.numero ?? 0);
}

/**
 * Révision à ouvrir : celle demandée par l'adresse, sinon la tête épinglée à la première lecture fraîche de la liste.
 * Une relecture de la liste en arrière-plan ne change jamais la révision ouverte (aucune modification perdue).
 * `undefined` : la liste n'a pas encore été lue après l'ouverture.
 */
export function revisionCible(revisionAdresse: string | null, epinglee: { id: string | null } | null | undefined): string | null | undefined {
  if (revisionAdresse) return revisionAdresse;
  return epinglee ? epinglee.id : undefined;
}

/** Description courte d'un élément pour la liste au clavier : type, mesure, état. */
export function descriptionElement(p: studio2d.Primitive, metres: (v: number) => string): string {
  if (p.type === "ligne") return `Ligne · ${metres(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y))}`;
  if (p.type === "rectangle") return `Rectangle · ${metres(p.largeur)} × ${metres(p.hauteur)}`;
  const valeur = metres(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y));
  return p.aResoudre ? `Cote · ${valeur} · à résoudre` : `Cote · ${valeur}`;
}
