/**
 * Droits de l'utilisateur sur le projet ouvert, tels que le serveur les
 * décide (`role` renvoyé par `GET /projects/:id`, vérifié à chaque requête).
 * L'écran s'en sert pour ne pas proposer ce qui serait refusé (403) : un
 * lecteur consulte tout et commente, sans formulaire actif ni enregistrement
 * de l'Atelier ; un éditeur modifie ; le propriétaire partage et supprime.
 * Le serveur reste seul juge : un refus arrive avec son motif, jamais caché.
 */
import { useQuery } from "@tanstack/react-query";
import { ApiError, api, canWrite, type EditingLock, type ProjectRole } from "./api";
import { useAuth } from "./auth-context";
import { LOCALE } from "./i18n";

export interface ProjectAccess {
  role: ProjectRole;
  /** Le rôle permet d'écrire ET personne d'autre n'a réservé l'édition. */
  canWrite: boolean;
  /** Le rôle permet d'écrire (indépendamment d'une réservation). */
  mayEdit: boolean;
  isOwner: boolean;
  /** Réservation d'édition en cours (verrou optionnel), null si libre. */
  lock: EditingLock | null;
  /** La réservation en cours est la vôtre. */
  holdsLock: boolean;
  /** Un rôle absent reste inconnu : lecture conservatrice, jamais propriétaire par défaut. */
  known: boolean;
}

export function resolveProjectAccess(role: ProjectRole | undefined, lock: EditingLock | null, userId: string | undefined, now = Date.now(), readError?: unknown): ProjectAccess {
  // Un refus récent prime sur un ancien rôle encore présent dans le cache de requêtes.
  if (readError instanceof ApiError && [401, 403, 404].includes(readError.status)) role = undefined;
  const active = lock && new Date(lock.expiresAt).getTime() > now ? lock : null;
  const holdsLock = !!active && !!userId && active.userId === userId;
  const known = role === "proprietaire" || role === "editeur" || role === "lecteur";
  const mayEdit = known && canWrite(role);
  return { role: role ?? "lecteur", canWrite: mayEdit && (!active || holdsLock), mayEdit, isOwner: role === "proprietaire", lock: active, holdsLock, known };
}

export function useProjectAccess(projectId: string): ProjectAccess {
  const q = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const { user } = useAuth();
  return resolveProjectAccess(q.data?.role, q.data?.editingLock ?? null, user?.id, Date.now(), q.error);
}

/** Le message d'un projet partagé en lecture, repris dans les écrans qui masquent leurs formulaires. */
export const READ_ONLY_HINT = "Projet partagé en lecture : vous pouvez tout consulter et commenter ; les modifications sont réservées au propriétaire et aux éditeurs.";

/** Le message d'un projet dont l'édition est réservée par quelqu'un d'autre. */
export function lockedHint(lock: EditingLock): string {
  return `Édition réservée par ${lock.email} jusqu'à ${new Date(lock.expiresAt).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })} : lecture et commentaires seulement, jusqu'à ce qu'il rende la main ou que la réservation expire.`;
}
