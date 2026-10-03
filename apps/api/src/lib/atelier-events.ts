/**
 * Événements du nouvel Atelier (cahier §5.4, lot 2) — **interface figée par le chef de projet** avant la phase 2.
 *
 * - Le service de commandes (L2.2, `lib/atelier-commands.ts`) écrit, dans la même transaction que le journal,
 *   une ligne `atelier_outbox` par événement avec `ecrireEvenement`, puis, après validation de la transaction,
 *   appelle `declencherTraitement(projetId)`.
 * - Le traitement (L2.3, ce fichier) lit les lignes non traitées et applique les effets : fraîcheur des documents,
 *   péremption du bilan Harmonie, invalidation de l'aperçu conceptuel, notifications. Il est idempotent par
 *   identifiant de ligne : un événement déjà traité (`processed_at` posé) n'est jamais rejoué ; un échec incrémente
 *   `attempts` et garde `last_error`.
 *
 * Seules les signatures ci-dessous sont figées ; les corps sont écrits en L2.3.
 */
import type { Executeur } from "./atelier-rows.js";

export const EVENEMENT_COMMANDE_VALIDEE = "atelier.commande.validee";

/** Charge utile de `atelier.commande.validee` (§5.4). */
export interface ChargeCommandeValidee {
  readonly projectId: string;
  readonly revision: number;
  readonly objetIds: readonly string[];
  readonly types: readonly string[];
  readonly auteur: string | null;
  /** `commande`, `annulation`, `retablissement` ou `import` (colonne `nature` du journal, D-030). */
  readonly nature: string;
}

export interface EvenementAtelier {
  readonly event: typeof EVENEMENT_COMMANDE_VALIDEE;
  readonly payload: ChargeCommandeValidee;
}

/** Écrit l'événement dans `atelier_outbox` (à appeler dans la transaction du journal). */
export async function ecrireEvenement(ex: Executeur, commandId: string, evenement: EvenementAtelier): Promise<void> {
  void ex;
  void commandId;
  void evenement;
  throw new Error("atelier-events : ecrireEvenement à implémenter en L2.3");
}

/**
 * Traite les événements non traités (d'un projet, ou de tous) ; rend le nombre de lignes traitées.
 * Idempotent : peut être appelé plusieurs fois, en parallèle, sans double effet.
 */
export async function traiterBoiteDeSortie(ex: Executeur, projetId?: string): Promise<number> {
  void ex;
  void projetId;
  return 0;
}

/** Déclenche un traitement asynchrone après validation (ne lève jamais, ne bloque pas la réponse HTTP). */
export function declencherTraitement(projetId: string): void {
  void projetId;
}
