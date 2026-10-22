/** Règles pures de suppression (D-5) : 30 jours de grâce, puis anonymisation irréversible. */
export const DELETION_GRACE_DAYS = 30;
export const DELETED_LABEL = "Compte supprimé";

export function anonymisationDue(deletionRequestedAt: Date | null, now: Date): boolean {
  return !!deletionRequestedAt && now.getTime() - deletionRequestedAt.getTime() >= DELETION_GRACE_DAYS * 24 * 3_600_000;
}

/** Adresse de remplacement : unique, non routable (`.invalid`, RFC 2606), sans trace de l'ancienne adresse. */
export const anonymisedEmail = (userId: string) => `deleted-${userId}@invalid`;
