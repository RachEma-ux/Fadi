/**
 * File d'envoi des courriels (D-1) : les routes déposent un message et n'attendent jamais le SMTP. Garde-fous : quota
 * glissant sur 24 h (`MAIL_DAILY_LIMIT`, sous le quota du fournisseur) et 5 courriels par heure et par destinataire
 * (contre le spam de « mot de passe oublié »). Au-delà, rien n'est envoyé, l'événement est journalisé et l'appelant
 * reçoit `queued: false` : l'interface affiche alors le lien à copier (repli déclaré, jamais un échec silencieux). Même
 * repli, sans journal d'audit, pour un destinataire de domaine réservé en SMTP (`reserved_domain`, UM-28).
 * Un travailleur dans le processus API envoie la file : 3 tentatives, attente croissante, puis la charge (qui peut
 * porter un lien à jeton) est effacée.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { mailOutbox } from "../../db/schema.js";
import { audit } from "../audit.js";
import { newId } from "../ids.js";
import { mailRuntime, type MailLocale, type MailTemplate } from "./index.js";

import { isReservedDomain, quotaDecision, retryDelayMs, MAX_ATTEMPTS, type EnqueueResult } from "./quota.js";
export { isReservedDomain, quotaDecision, retryDelayMs, MAX_ATTEMPTS, type EnqueueResult };

type Executor = Pick<typeof db, "insert" | "select">;

export async function enqueueMail(
  message: { to: string; template: MailTemplate; data: Record<string, string | undefined>; locale?: MailLocale },
  executor: Executor = db,
): Promise<EnqueueResult> {
  const { config, mailer } = mailRuntime();
  const now = Date.now();
  const counted = inArray(mailOutbox.status, ["pending", "sent"]);
  const [day] = await executor.select({ n: sql<number>`count(*)::int` }).from(mailOutbox)
    .where(and(counted, gte(mailOutbox.createdAt, new Date(now - 24 * 3_600_000))));
  const [hour] = await executor.select({ n: sql<number>`count(*)::int` }).from(mailOutbox)
    .where(and(counted, eq(mailOutbox.toAddress, message.to), gte(mailOutbox.createdAt, new Date(now - 3_600_000))));
  const refusal = quotaDecision({ transport: mailer.transport, last24h: day?.n ?? 0, recipientLastHour: hour?.n ?? 0, dailyLimit: config.dailyLimit, perRecipientHourly: config.perRecipientHourly, to: message.to, allowReserved: config.allowReservedDomains });
  const id = newId("mail");
  await executor.insert(mailOutbox).values({
    id, toAddress: message.to, template: message.template, locale: message.locale ?? "fr",
    payload: refusal ? {} : (message.data as Record<string, unknown>),
    status: refusal ? "skipped" : "pending",
    lastError: refusal,
  });
  // « disabled » et « reserved_domain » sont des non-envois déclarés par la configuration, pas des dépassements.
  if (refusal === "daily_quota" || refusal === "recipient_limit") {
    await audit(executor, { actorId: null, action: "mail.quota_exceeded", target: { type: "mail", id }, metadata: { reason: refusal, template: message.template } });
  }
  return { queued: !refusal, reason: refusal };
}

/** Durée du bail d'un message réclamé : au-delà (processus arrêté pendant l'envoi), il redevient éligible. */
export const BAIL_ENVOI_MS = 5 * 60_000;

type LigneFile = typeof mailOutbox.$inferSelect;

/** Opérations sur la file, séparées pour tester l'enchaînement sans base. */
export interface OperationsFile {
  /** Transaction courte : choisit un message échu (`SKIP LOCKED`) et le réserve en repoussant son échéance (bail). */
  reclamer(): Promise<LigneFile | null>;
  envoyer(row: LigneFile): Promise<void>;
  marquerEnvoye(row: LigneFile): Promise<void>;
  marquerEchec(row: LigneFile, err: unknown): Promise<void>;
}

/**
 * BD-4.7 (chantier base-donnees, constat Q10) : l'envoi SMTP ne tient plus de transaction ni de verrou de ligne. Avant,
 * chaque message gardait une connexion du pool « idle in transaction » pendant toute la latence du serveur de courriel.
 * Désormais : réclamation en transaction courte (bail de 5 minutes), envoi hors transaction, puis enregistrement du
 * résultat. Un arrêt pendant l'envoi laisse le message réessayé à la fin du bail (au plus une fois de plus, comme avant
 * quand la transaction était annulée).
 */
export async function traiterFile(ops: OperationsFile, limit = 100): Promise<number> {
  let handled = 0;
  for (let i = 0; i < limit; i++) {
    const row = await ops.reclamer();
    if (!row) break;
    try {
      await ops.envoyer(row);
    } catch (err) {
      await ops.marquerEchec(row, err);
      handled++;
      continue;
    }
    await ops.marquerEnvoye(row);
    handled++;
  }
  return handled;
}

/** Traite les messages échus ; renvoie le nombre traité. `SKIP LOCKED` + bail : deux processus ne s'en disputent pas un. */
export async function processMailOutbox(limit = 100): Promise<number> {
  const { mailer } = mailRuntime();
  return traiterFile({
    reclamer: () => db.transaction(async (tx) => {
      const rows = await tx.select().from(mailOutbox)
        .where(and(eq(mailOutbox.status, "pending"), lte(mailOutbox.nextAttemptAt, new Date())))
        .orderBy(asc(mailOutbox.nextAttemptAt)).limit(1).for("update", { skipLocked: true });
      const row = rows[0];
      if (!row) return null;
      await tx.update(mailOutbox).set({ nextAttemptAt: new Date(Date.now() + BAIL_ENVOI_MS) }).where(eq(mailOutbox.id, row.id));
      return row;
    }),
    envoyer: (row) => mailer.send({ to: row.toAddress, template: row.template as MailTemplate, data: row.payload as Record<string, string>, locale: row.locale }),
    marquerEnvoye: async (row) => {
      await db.update(mailOutbox).set({ status: "sent", sentAt: new Date(), payload: {}, attempts: row.attempts + 1, lastError: null })
        .where(and(eq(mailOutbox.id, row.id), eq(mailOutbox.status, "pending")));
    },
    marquerEchec: async (row, err) => {
      const attempts = row.attempts + 1;
      const last = attempts >= MAX_ATTEMPTS;
      // Message d'erreur borné, sans la charge : jamais de lien à jeton dans la base au-delà de l'abandon.
      await db.update(mailOutbox).set({
        attempts, lastError: String((err as Error)?.message ?? err).slice(0, 300),
        status: last ? "failed" : "pending", payload: last ? {} : row.payload,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
      }).where(and(eq(mailOutbox.id, row.id), eq(mailOutbox.status, "pending")));
    },
  }, limit);
}
