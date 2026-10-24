/** Règles pures de suppression (D-5) : 30 jours de grâce, puis anonymisation irréversible. */
export const DELETION_GRACE_DAYS = 30;
export const DELETED_LABEL = "Compte supprimé";

export function anonymisationDue(deletionRequestedAt: Date | null, now: Date): boolean {
  return !!deletionRequestedAt && now.getTime() - deletionRequestedAt.getTime() >= DELETION_GRACE_DAYS * 24 * 3_600_000;
}

/** Adresse de remplacement : unique, non routable (`.invalid`, RFC 2606), sans trace de l'ancienne adresse. */
export const anonymisedEmail = (userId: string) => `deleted-${userId}@invalid`;

/** Date d'anonymisation prévue d'un compte en suppression programmée (fin des 30 jours de grâce). */
export const anonymisationAt = (deletionRequestedAt: Date) => new Date(deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 3_600_000);

/** Qui a demandé la suppression, d'après l'entrée du journal qui l'a programmée (UM-27, corbeille). */
export function deletionRequester(action: string | null | undefined): "user" | "admin" | null {
  if (action === "account.deletion.requested") return "user";
  if (action === "admin.user.deletion_requested") return "admin";
  return null;
}

export type AnonymiseNowRefusal = "not_found" | "already_anonymized" | "not_in_trash" | "confirmation_mismatch" | "owns_shared_projects" | "last_admin";

/**
 * « Anonymiser maintenant » (UM-27, amendement de D-5) : seul un compte déjà en suppression programmée (dans la
 * corbeille) peut être anonymisé avant la fin des 30 jours, et seulement si l'administrateur a ressaisi son adresse.
 * Mêmes refus que la tâche des 30 jours (projets partagés possédés) et que la suppression (dernier administrateur
 * actif, relu sous le verrou d'éligibilité). Le refus « soi-même » est opposé par la route avant toute lecture.
 */
export function anonymiseNowRefusal(s: {
  status: "active" | "suspended" | "closed" | null; deletionRequestedAt: Date | null; email: string | null; confirmEmail: string;
  sharedProjects: number; removesLastAdmin: boolean;
}): AnonymiseNowRefusal | null {
  if (s.status === null) return "not_found";
  if (s.status === "closed") return "already_anonymized";
  if (!s.deletionRequestedAt) return "not_in_trash";
  if (!s.email || s.email.trim().toLowerCase() !== s.confirmEmail.trim().toLowerCase()) return "confirmation_mismatch";
  if (s.sharedProjects > 0) return "owns_shared_projects";
  if (s.removesLastAdmin) return "last_admin";
  return null;
}
