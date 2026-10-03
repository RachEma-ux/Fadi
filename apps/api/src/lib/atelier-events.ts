/**
 * Boîte de sortie transactionnelle de l'Atelier (Architecture V4 §6, étape 6) : chaque lot validé enregistre
 * son événement dans la même transaction ; le traitement, idempotent (date de traitement), s'exécute dans le
 * processus de l'API après la validation. Les consommateurs de la fraîcheur (catalogue de documents, bilan
 * Harmonie, aperçu conceptuel) lisent `projects.model_revision` : ils n'ont rien à recalculer ici — l'événement
 * sert au journal d'exploitation, aux traitements dérivés futurs (vues du lot 5) et aux tests (T07).
 */
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { atelierOutbox } from "../db/schema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const EVENEMENT_COMMANDE_VALIDEE = "atelier.commande.validee";

export interface EvenementCommandeValidee {
  projectId: string;
  revision: number;
  journalId: string;
  kind: string;
  objetIds: string[];
  types: string[];
  auteurId: string;
}

export async function enregistrerEvenement(tx: Tx, projectId: string, eventType: string, payload: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  await tx.insert(atelierOutbox).values({ id, projectId, eventType, version: 1, payload, createdAt: new Date(), processedAt: null, attempts: 0 });
  return id;
}

export type Traitement = (payload: Record<string, unknown>) => Promise<void>;
const traitements = new Map<string, Traitement[]>();

/** Enregistre un traitement d'événement (idempotent par construction : il ne s'exécute qu'une fois par événement). */
export function surEvenement(eventType: string, traitement: Traitement): void {
  const list = traitements.get(eventType) ?? [];
  list.push(traitement);
  traitements.set(eventType, list);
}

/** Traite les événements en attente d'un projet ; retourne le nombre traité. Une erreur de traitement laisse l'événement en attente (nouvelle tentative plus tard). */
export async function traiterEvenements(projectId: string): Promise<number> {
  const pending = await db.select().from(atelierOutbox).where(and(eq(atelierOutbox.projectId, projectId), isNull(atelierOutbox.processedAt))).orderBy(atelierOutbox.createdAt);
  let n = 0;
  for (const ev of pending) {
    try {
      for (const t of traitements.get(ev.eventType) ?? []) await t(ev.payload);
      await db.update(atelierOutbox).set({ processedAt: new Date(), attempts: ev.attempts + 1 }).where(and(eq(atelierOutbox.id, ev.id), isNull(atelierOutbox.processedAt)));
      n++;
    } catch (err) {
      await db.update(atelierOutbox).set({ attempts: ev.attempts + 1 }).where(eq(atelierOutbox.id, ev.id));
      console.error(`[atelier] événement ${ev.id} (${ev.eventType}) non traité :`, err instanceof Error ? err.message : err);
    }
  }
  return n;
}
