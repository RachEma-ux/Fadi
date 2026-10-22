/** Décisions pures de la file d'envoi (testables sans base). */
export type MailRefusal = "disabled" | "daily_quota" | "recipient_limit";
export interface EnqueueResult { queued: boolean; reason: MailRefusal | null }

/** Décision pure du garde-fou de quota. */
export function quotaDecision(input: { transport: string; last24h: number; recipientLastHour: number; dailyLimit: number; perRecipientHourly: number }): MailRefusal | null {
  if (input.transport === "disabled") return "disabled";
  if (input.last24h >= input.dailyLimit) return "daily_quota";
  if (input.recipientLastHour >= input.perRecipientHourly) return "recipient_limit";
  return null;
}

export const MAX_ATTEMPTS = 3;
/** Attente avant la tentative suivante : 30 s, 2 min, 8 min. */
export const retryDelayMs = (attempts: number) => 30_000 * 4 ** Math.max(0, attempts - 1);

