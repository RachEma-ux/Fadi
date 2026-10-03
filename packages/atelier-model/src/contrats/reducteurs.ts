/**
 * Signature des réducteurs (cahier §5.3) : fonctions pures `(etat, commande) → { etat, inverse, effets }`,
 * exécutées à l'identique dans le navigateur (aperçu) et sur le serveur (validation). Types seulement ;
 * implémentation dans `src/commandes/**` (L1.2), qui peut s'appuyer sur `CommandHistory` de
 * `@parcours/domain-model` pour l'annulation locale.
 *
 * - `inverse` : commandes qui, appliquées à l'état produit, redonnent l'état d'entrée (même empreinte) ;
 * - refus (précondition, unité, repère, calque verrouillé…) : `ok: false` avec erreurs localisées, état inchangé ;
 * - un réducteur ne touche jamais `revision` : c'est le lot (`AppliquerLot`) qui l'incrémente d'une unité.
 */
import type { Commande, TypeCommande } from "./commandes.js";
import type { Effets } from "./effets.js";
import type { EnveloppeCommandes } from "./enveloppe.js";
import type { EtatModele } from "./etat.js";
import type { CodeProbleme } from "./probleme.js";

export interface ErreurCommande {
  readonly code: CodeProbleme;
  /** Chemin dans l'enveloppe ou la commande, ex. `commands[0].params.epaisseur` (400 `{ chemin, message }`). */
  readonly chemin: string;
  readonly message: string;
  readonly objetIds?: readonly string[];
}

export type ResultatReducteur =
  | { readonly ok: true; readonly etat: EtatModele; readonly inverse: readonly Commande[]; readonly effets: Effets }
  | { readonly ok: false; readonly erreurs: readonly ErreurCommande[] };

export type Reducteur<C extends Commande = Commande> = (etat: EtatModele, commande: C) => ResultatReducteur;

/** Table des réducteurs, un par type de commande. */
export type TableReducteurs = { readonly [T in TypeCommande]: Reducteur<Extract<Commande, { type: T }>> };

/** Résultat d'un lot : atomique ; `revision` = `baseRevision + 1` si accepté. */
export type ResultatLot =
  | {
      readonly ok: true;
      readonly etat: EtatModele;
      /** Enveloppe inverse (annulation du lot entier), commandes dans l'ordre inverse. */
      readonly inverse: readonly Commande[];
      readonly effets: Effets;
    }
  | { readonly ok: false; readonly erreurs: readonly ErreurCommande[] };

/** Application d'une enveloppe (pure) ; vérifie contrat et `baseRevision`. */
export type AppliquerLot = (etat: EtatModele, enveloppe: EnveloppeCommandes) => ResultatLot;
