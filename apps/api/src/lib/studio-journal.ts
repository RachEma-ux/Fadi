/**
 * Journal des changements de révision Studio (IF-011, EX-010) et chemin d'écriture unique d'une bascule
 * Atelier → Studio (MIG-COEX-06).
 *
 * Journal : chaque révision engagée par `submitStudioCommands` produit, DANS LA MÊME TRANSACTION, un événement
 * `studio_revision_events` : `eventId`, `transactionId` (identifiant applicatif de la transaction, unique) et `xactId`
 * (transaction PostgreSQL, défaut SQL), auteur, étude / variante, révisions de base et d'issue, effets
 * (`studioEffetsCommande`), horodatage du serveur (`now()`), job éventuel (essai confirmé). Si la transaction échoue,
 * ni la révision ni l'événement n'existent ; la notification temps réel n'est émise qu'APRÈS l'engagement
 * (`engagerPuisNotifier`) : une notification n'est jamais une confirmation métier sans engagement préalable.
 *
 * Chemin d'écriture : `studio_bascules` (une ligne par projet) désigne l'étude qui reçoit le modèle Atelier et
 * l'autorité d'écriture. `controlerCheminEcriture` est appelé par l'orchestrateur commun, sous le verrou du projet, avant
 * toute écriture : une écriture de la chaîne qui n'a pas l'autorité est refusée (409 `chemin_ecriture`), les lectures
 * (consultation historique) restent ouvertes aux deux chaînes.
 */
import { and, asc, eq } from "drizzle-orm";
import type { StudioEffetsCommande } from "@parcours/atelier-model/studio-cmd";
import { studioBascules, studioRevisionEvents } from "../db/schema.js";
import { newId } from "./ids.js";
import type { CommandExecutionScope, Tx } from "./atelier-validation.js";
import type { Querier } from "./step-rows.js";

export interface RefusCheminEcritureCorps extends Record<string, unknown> {
  error: "chemin_ecriture";
  autorite: "atelier" | "studio";
  etudeBascule: string;
  message: string;
}

/** Refus d'écriture d'une chaîne qui n'a pas l'autorité (null si l'écriture est permise). */
export async function controlerCheminEcriture(tx: Tx | Querier, scope: CommandExecutionScope): Promise<RefusCheminEcritureCorps | null> {
  const [b] = await tx.select({ studyId: studioBascules.studyId, authority: studioBascules.authority }).from(studioBascules)
    .where(eq(studioBascules.projectId, scope.projectId)).limit(1);
  if (!b) return null;
  if (scope.kind === "atelier" && b.authority === "studio") {
    return { error: "chemin_ecriture", autorite: "studio", etudeBascule: b.studyId, message: "Le modèle de ce projet a basculé dans Studio : l’Atelier reste consultable mais n’écrit plus (une seule chaîne d’écriture)." };
  }
  if (scope.kind === "studio" && scope.studyId === b.studyId && b.authority === "atelier") {
    return { error: "chemin_ecriture", autorite: "atelier", etudeBascule: b.studyId, message: "Cette étude reçoit le modèle Atelier, qui a encore l’autorité d’écriture : elle reste consultable mais n’écrit pas avant la bascule." };
  }
  return null;
}

export interface EvenementRevision {
  eventId: string;
  transactionId: string;
  xactId: string | null;
  projectId: string;
  studyId: string;
  variantId: string;
  baseRevisionId: string | null;
  revisionId: string;
  authorId: string;
  requestId: string | null;
  effects: StudioEffetsCommande;
  jobId: string | null;
  createdAt: string;
}

/** Identifiant applicatif d'une transaction d'écriture (un par transaction, partagé par toutes ses écritures). */
export const nouvelleTransaction = () => newId("studio_tx");

export async function consignerEvenementRevision(tx: Tx, e: Omit<EvenementRevision, "eventId" | "createdAt" | "xactId">): Promise<string> {
  const eventId = newId("studio_event");
  await tx.insert(studioRevisionEvents).values({
    eventId, projectId: e.projectId, studyId: e.studyId, variantId: e.variantId, revisionId: e.revisionId, baseRevisionId: e.baseRevisionId,
    transactionId: e.transactionId, authorId: e.authorId, requestId: e.requestId, effects: e.effects, jobId: e.jobId,
  });
  return eventId;
}

type LigneEvenement = typeof studioRevisionEvents.$inferSelect;
export const versEvenement = (r: LigneEvenement): EvenementRevision => ({
  eventId: r.eventId, transactionId: r.transactionId, xactId: r.xactId ?? null, projectId: r.projectId, studyId: r.studyId, variantId: r.variantId,
  baseRevisionId: r.baseRevisionId, revisionId: r.revisionId, authorId: r.authorId, requestId: r.requestId ?? null,
  effects: r.effects as StudioEffetsCommande, jobId: r.jobId ?? null, createdAt: r.createdAt.toISOString(),
});

/** Événements d'une variante, du plus ancien au plus récent (lecture : droits vérifiés par l'appelant). */
export async function lireJournalVariante(q: Querier, variantId: string): Promise<EvenementRevision[]> {
  const rows = await q.select().from(studioRevisionEvents).where(eq(studioRevisionEvents.variantId, variantId))
    .orderBy(asc(studioRevisionEvents.createdAt), asc(studioRevisionEvents.eventId));
  return rows.map(versEvenement);
}

export async function lireEvenementRevision(q: Querier, variantId: string, revisionId: string): Promise<EvenementRevision | null> {
  const [r] = await q.select().from(studioRevisionEvents).where(and(eq(studioRevisionEvents.variantId, variantId), eq(studioRevisionEvents.revisionId, revisionId))).limit(1);
  return r ? versEvenement(r) : null;
}

/**
 * Engage puis notifie : `notifier` n'est appelé qu'après la résolution de `engager` (la transaction est validée) ; si
 * l'engagement échoue (validation refusée, panne au commit), rien n'est notifié et l'erreur remonte telle quelle.
 */
export async function engagerPuisNotifier<T>(engager: () => Promise<T>, notifier: (r: T) => void): Promise<T> {
  const r = await engager();
  notifier(r);
  return r;
}
