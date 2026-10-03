/**
 * Signature des réducteurs (cahier §5.3) : fonctions pures `(etat, commande) → { etat, inverse, effets }`,
 * exécutées à l'identique dans le navigateur (aperçu) et sur le serveur (validation). Types seulement ;
 * implémentation dans `src/commandes/**` (L1.2), qui peut s'appuyer sur `CommandHistory` de
 * `@parcours/domain-model` pour l'annulation locale.
 *
 * - `inverse` : commandes qui, appliquées à l'état produit, redonnent l'état d'entrée (même empreinte) ;
 * - refus (précondition, unité, repère, calque verrouillé…) : `ok: false` avec erreurs localisées, état inchangé ;
 * - un réducteur ne touche jamais `revision` : c'est le lot (`AppliquerLot`) qui l'incrémente d'une unité, et
 *   seulement s'il modifie le modèle (D-024) : un lot sans changement (`piece.detecter` seul) garde révision et
 *   empreinte, et rend un inverse vide.
 */
import type { Commande, TypeCommande } from "./commandes.js";
import type { Effets } from "./effets.js";
import type { EnveloppeCommandes } from "./enveloppe.js";
import type { EtatModele } from "./etat.js";
import type { CodeProbleme } from "./probleme.js";

/**
 * Refus motivé (DA-05-12-f, D-024) : objet concerné, cause, action proposée, en champs séparés ; `message`
 * les compose pour l'affichage : « objet : cause. Action : action. » (voir `composerMessageErreur`).
 */
export interface ErreurCommande {
  readonly code: CodeProbleme;
  /** Chemin dans l'enveloppe ou la commande, ex. `commands[0].params.epaisseur` (400 `{ chemin, message }`). */
  readonly chemin: string;
  /** Objet concerné, nommé (« Mur M1 », « Enveloppe », « Identifiant X »). */
  readonly objet: string;
  /** Cause du refus. */
  readonly cause: string;
  /** Action proposée à l'utilisateur. */
  readonly action: string;
  /** Composé : `${objet} : ${cause}. Action : ${action}.` */
  readonly message: string;
  readonly objetIds?: readonly string[];
}

/** Message affichable d'un refus, composé de ses trois champs. */
export function composerMessageErreur(objet: string, cause: string, action: string): string {
  return `${objet} : ${cause}. Action : ${action}.`;
}

export type ResultatReducteur =
  | { readonly ok: true; readonly etat: EtatModele; readonly inverse: readonly Commande[]; readonly effets: Effets }
  | { readonly ok: false; readonly erreurs: readonly ErreurCommande[] };

export type Reducteur<C extends Commande = Commande> = (etat: EtatModele, commande: C) => ResultatReducteur;

/** Table des réducteurs, un par type de commande. */
export type TableReducteurs = { readonly [T in TypeCommande]: Reducteur<Extract<Commande, { type: T }>> };

/**
 * Résultat d'un lot : atomique ; `revision` = `baseRevision + 1` si accepté et si le modèle change, sinon
 * `revision` et `empreinte` inchangées (D-024).
 */
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
