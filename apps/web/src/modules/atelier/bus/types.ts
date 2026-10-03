/**
 * Types du bus local du nouvel Atelier (cahier §5.7, tâche L2.4).
 *
 * Une **entrée de file** = une enveloppe `atelier-commands/1` (un lot de commandes), persistée, ordonnée, avec un
 * `requestId` stable (idempotence serveur, T06). États d'une enveloppe :
 * - `en-attente` : appliquée localement (optimiste), pas encore envoyée, ou à renvoyer (coupure, 423, 5xx) ;
 * - `envoyee` : requête en cours (rechargée dans cet état, elle repart `en-attente` avec le même `requestId`) ;
 * - `acceptee` : validée par le serveur (200) — sort de la file, son effet est dans l'état confirmé ;
 * - `refusee` : refus 400 / 403 / 404, ou abandonnée au profit du serveur — sort de la file, effet annulé ;
 * - `en-conflit` : 409 — reste en tête de file et la bloque jusqu'à une résolution explicite.
 */
import type { EnveloppeCommandes, EtatModele, IdObjet, ObjetModele } from "@parcours/atelier-model";
import type { DetailErreur, EntreeJournal, ReponseCommandes, ReponseConflit } from "../../../lib/api/atelier-commandes";

export type EtatEnveloppe = "en-attente" | "envoyee" | "acceptee" | "refusee" | "en-conflit";

/** États qu'une entrée encore dans la file peut avoir. */
export type EtatEntreeFile = Extract<EtatEnveloppe, "en-attente" | "envoyee" | "en-conflit">;

/** Conflit 409 conservé avec l'entrée (persisté), complété de la version locale des objets en cause. */
export interface ConflitEnregistre {
  readonly recuLe: string;
  readonly reponse: ReponseConflit;
  /** Version locale (optimiste) de chaque objet en conflit au moment du refus ; `null` = absent localement. */
  readonly objetsLocaux: Readonly<Record<IdObjet, ObjetModele | null>>;
  /** Erreurs de la dernière tentative « rejouer mes commandes » refusée par la revalidation locale. */
  readonly erreursRevalidation: readonly DetailErreur[];
}

export interface EntreeFile {
  readonly requestId: string;
  readonly projectId: string;
  /** Rang dans la file (croissant) ; l'ordre d'envoi est l'ordre de saisie. */
  readonly ordre: number;
  readonly enveloppe: EnveloppeCommandes;
  readonly etat: EtatEntreeFile;
  /** Nombre d'envois ; `0` = jamais parti (sa `baseRevision` peut encore être recalée sur notre propre chaîne). */
  readonly tentatives: number;
  readonly derniereErreur: string | null;
  readonly creeLe: string;
  readonly conflit: ConflitEnregistre | null;
}

/** Instantané confirmé du serveur, mis en cache pour rouvrir hors ligne. */
export interface ModeleEnCache {
  readonly projectId: string;
  readonly modele: EtatModele;
  readonly lecture: string;
}

export type Joignabilite = "en-ligne" | "hors-ligne" | "injoignable";

export type OrigineRefus = "local" | "serveur" | "revalidation" | "abandon";

export interface EvenementsBus {
  /** Toute évolution de la file, de l'état local ou confirmé. */
  etat: { readonly enAttente: number; readonly conflits: number; readonly revisionConfirmee: number | null; readonly revisionLocale: number | null };
  "lot-accepte": { readonly requestId: string; readonly label: string; readonly reponse: ReponseCommandes };
  "lot-refuse": { readonly requestId: string; readonly label: string; readonly origine: OrigineRefus; readonly http: number | null; readonly erreurs: readonly DetailErreur[] };
  conflit: { readonly requestId: string; readonly label: string; readonly conflit: ConflitEnregistre };
  "revision-distante": { readonly de: number | null; readonly a: number; readonly entrees: readonly EntreeJournal[] };
  joignabilite: { readonly etat: Joignabilite };
  /** Envoi différé sans refus (coupure, 423 réservation d'autrui, erreur serveur) : l'entrée reste en attente. */
  "lot-reporte": { readonly requestId: string; readonly motif: string; readonly http: number | null };
}

export type NomEvenement = keyof EvenementsBus;
