/** Décisions pures de la file d'envoi (testables sans base). */
export type MailRefusal = "disabled" | "reserved_domain" | "daily_quota" | "recipient_limit";
export interface EnqueueResult { queued: boolean; reason: MailRefusal | null }

/**
 * Noms réservés (RFC 2606, RFC 6761) : aucun courriel n'y est jamais remis. Les recettes en créent des comptes
 * (@example.com, @example.test) et l'anonymisation écrit `deleted-…@invalid` ; un envoi SMTP réel n'y produirait que
 * des rebonds, du quota consommé et une réputation dégradée pour le domaine expéditeur (UM-28).
 */
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org", "localhost"]);
const RESERVED_TLDS = new Set(["example", "test", "invalid", "localhost"]);

/** Vrai si le domaine de l'adresse est réservé (sous-domaines compris) ; une adresse sans domaine l'est aussi. */
export function isReservedDomain(address: string): boolean {
  const at = address.lastIndexOf("@");
  const domain = (at < 0 ? "" : address.slice(at + 1)).trim().toLowerCase().replace(/\.+$/, "");
  if (!domain) return true;
  const labels = domain.split(".");
  if (RESERVED_TLDS.has(labels[labels.length - 1]!)) return true;
  return [...RESERVED_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * La même règle qu'`isReservedDomain`, en expression régulière insensible à la casse sur l'adresse entière, construite
 * depuis les mêmes listes : le filtre « Masquer les comptes de test » de l'administration (UM-31) l'applique en SQL
 * (`~*`) pour que la pagination et le total restent exacts. Adresse sans `@` ou sans domaine comprise.
 */
export const RESERVED_ADDRESS_PATTERN = `^[^@]*$|@\\.*$|[@.](${[...RESERVED_DOMAINS, ...RESERVED_TLDS].map((d) => d.replace(/\./g, "\\.")).join("|")})\\.*$`;

/**
 * Décision pure du garde-fou de quota. Un destinataire réservé n'est écarté que sur le transport SMTP (le seul qui remet
 * un courriel), sauf `allowReserved` (CI et développement avec Mailpit, refusé en production par `readMailConfig`).
 */
export function quotaDecision(input: { transport: string; last24h: number; recipientLastHour: number; dailyLimit: number; perRecipientHourly: number; to?: string; allowReserved?: boolean }): MailRefusal | null {
  if (input.transport === "disabled") return "disabled";
  if (input.transport === "smtp" && !input.allowReserved && input.to !== undefined && isReservedDomain(input.to)) return "reserved_domain";
  if (input.last24h >= input.dailyLimit) return "daily_quota";
  if (input.recipientLastHour >= input.perRecipientHourly) return "recipient_limit";
  return null;
}

export const MAX_ATTEMPTS = 3;
/** Attente avant la tentative suivante : 30 s, 2 min, 8 min. */
export const retryDelayMs = (attempts: number) => 30_000 * 4 ** Math.max(0, attempts - 1);

