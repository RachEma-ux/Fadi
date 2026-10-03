/**
 * Droits de l'utilisateur sur le projet ouvert, tels que le serveur les
 * décide (`role` renvoyé par `GET /projects/:id`, vérifié à chaque requête).
 * L'écran s'en sert pour ne pas proposer ce qui serait refusé (403) : un
 * lecteur consulte tout et commente, sans formulaire actif ni enregistrement
 * de l'Atelier ; un éditeur modifie ; le propriétaire partage et supprime.
 * Le serveur reste seul juge : un refus arrive avec son motif, jamais caché.
 */
import { useQuery } from "@tanstack/react-query";
import { api, canWrite, type EditingLock, type ProjectRole } from "./api";
import { useAuth } from "./auth-context";

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
  /** Projet lu depuis le cache sans rôle connu (ancienne lecture) : considéré propriétaire jusqu'à relecture. */
  known: boolean;
}

export function useProjectAccess(projectId: string): ProjectAccess {
  const q = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const { user } = useAuth();
  const role = q.data?.role;
  const lock = q.data?.editingLock ?? null;
  const active = lock && new Date(lock.expiresAt).getTime() > Date.now() ? lock : null;
  const holdsLock = !!active && !!user && active.userId === user.id;
  const lockedByOther = !!active && !holdsLock;
  const mayEdit = canWrite(role);
  return { role: role ?? "proprietaire", canWrite: mayEdit && !lockedByOther, mayEdit, isOwner: role === undefined || role === "proprietaire", lock: active, holdsLock, known: role !== undefined };
}

/** Le message d'un projet partagé en lecture, repris dans les écrans qui masquent leurs formulaires. */
export const READ_ONLY_HINT = "Projet partagé en lecture : vous pouvez tout consulter et commenter ; les modifications sont réservées au propriétaire et aux éditeurs.";

/** Le message d'un projet dont l'édition est réservée par quelqu'un d'autre. */
export function lockedHint(lock: EditingLock): string {
  return `Édition réservée par ${lock.email} jusqu'à ${new Date(lock.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} : lecture et commentaires seulement, jusqu'à ce qu'il rende la main ou que la réservation expire.`;
}
