/**
 * État du modèle typé (contrat partagé par réducteurs, importeur, quantités, API). Types seulement.
 *
 * - `objets` : par identifiant, y compris niveaux, calques, hypothèses, sources (tout est objet typé) ;
 * - `relations` : relations portées et dérivées (voir `ontologie/relations.ts`) ;
 * - `revision` : microversion `model_revision`, +1 par lot de commandes validé (jamais par un état d'affichage, R10) ;
 * - `empreinte` : empreinte déterministe du contenu (objets, relations, catalogue, propriétés de projet),
 *   indépendante de l'ordre d'insertion ; deux imports de P.118 → même empreinte. L'algorithme est fourni
 *   par L1.2 (`src/commandes/empreinte.ts`) et versionné par `ALGORITHME_EMPREINTE`.
 * - `supprimes` : identifiants d'objets supprimés (identité jamais réutilisée, `deleted_at`).
 */
import type { IdObjet, ObjetModele } from "../ontologie/classes.js";
import type { CatalogueTypes } from "../ontologie/definitions.js";
import type { Propriete } from "../ontologie/proprietes.js";
import type { Relation } from "../ontologie/relations.js";

export const ALGORITHME_EMPREINTE = "atelier-empreinte/1";

export interface EtatModele {
  readonly projetId: string;
  readonly revision: number;
  readonly empreinte: string;
  readonly versionOntologie: number;
  readonly objets: Readonly<Record<IdObjet, ObjetModele>>;
  readonly relations: readonly Relation[];
  readonly catalogue: CatalogueTypes;
  /** Propriétés de projet (P.118 : `meta.*` restants, provenance `import`). */
  readonly proprietesProjet: readonly Propriete[];
  readonly supprimes: readonly IdObjet[];
}
