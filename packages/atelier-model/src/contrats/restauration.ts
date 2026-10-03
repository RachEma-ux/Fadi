/**
 * Restauration exacte portée par une commande inverse (contrat `atelier-commands/1`, amendement D-024).
 *
 * Le catalogue de commandes ne contient pas de commande capable de redonner un objet tel qu'il était
 * (provenance `import`, propriétés, annotations, trace `supprimes`…), et un inverse arithmétique (vecteur
 * opposé, angle opposé) ne redonne pas les mêmes nombres flottants. L'inverse d'une commande est donc une
 * commande du catalogue (type et paramètres lisibles, pour l'historique et les droits) qui porte en plus le
 * champ `restauration` : l'état avant de chaque objet touché et l'empreinte attendue de son état après.
 *
 * Règles :
 * - la restauration est **vérifiée avant application** : chaque objet doit avoir l'empreinte `apres`, chaque
 *   relation à retirer doit exister, chaque relation à rajouter doit être absente, chaque trace de suppression
 *   doit être dans l'état attendu, le catalogue doit avoir l'empreinte attendue ; sinon refus motivé, rien
 *   n'est appliqué ;
 * - une **double restauration est refusée** : appliquée une fois, la restauration ne vérifie plus ses
 *   conditions (dans le même lot comme dans un lot suivant) ; une restauration sans aucune condition vérifiable
 *   est refusée ;
 * - une commande ne porte qu'une restauration : `origine` n'en porte jamais (sinon refus) ;
 * - au lot 2, le serveur n'accepte une commande portant une restauration que si cet inverse a été produit et
 *   journalisé par lui-même (une restauration fabriquée par un client est refusée).
 * Types seulement ; vérification et application dans `src/commandes/moteur.ts`.
 */
import type { IdObjet, ObjetModele } from "../ontologie/classes.js";
import type { CatalogueTypes } from "../ontologie/definitions.js";
import type { Relation } from "../ontologie/relations.js";
import type { Commande } from "./commandes.js";

export const VERSION_RESTAURATION = 1;

export interface RestaurationObjet {
  readonly id: IdObjet;
  /** Objet à rétablir ; `null` = l'objet n'existait pas. */
  readonly avant: ObjetModele | null;
  /** Empreinte (`atelier-empreinte/1`) attendue de l'objet au moment de la restauration ; `null` = absent. */
  readonly apres: string | null;
}

export interface Restauration {
  readonly version: typeof VERSION_RESTAURATION;
  /** Commande dont cette restauration annule les effets (sans restauration ; sert au rétablissement). */
  readonly origine: Commande;
  readonly objets: readonly RestaurationObjet[];
  readonly relationsARetirer: readonly Relation[];
  readonly relationsARajouter: readonly Relation[];
  /** Identifiants à retirer de `supprimes` (doivent y être). */
  readonly supprimesARetirer: readonly IdObjet[];
  /** Identifiants à rajouter à `supprimes` (ne doivent pas y être). */
  readonly supprimesARajouter: readonly IdObjet[];
  readonly catalogue?: { readonly avant: CatalogueTypes; readonly apres: string };
}
