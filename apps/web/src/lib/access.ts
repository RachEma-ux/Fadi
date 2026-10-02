/**
 * Droits de l'utilisateur sur le projet ouvert, tels que le serveur les
 * décide (`role` renvoyé par `GET /projects/:id`, vérifié à chaque requête).
 * L'écran s'en sert pour ne pas proposer ce qui serait refusé (403) : un
 * lecteur consulte tout et commente, sans formulaire actif ni enregistrement
 * de l'Atelier ; un éditeur modifie ; le propriétaire partage et supprime.
 * Le serveur reste seul juge : un refus arrive avec son motif, jamais caché.
 */
import { useQuery } from "@tanstack/react-query";
import { api, canWrite, type ProjectRole } from "./api";

export interface ProjectAccess {
  role: ProjectRole;
  canWrite: boolean;
  isOwner: boolean;
  /** Projet lu depuis le cache sans rôle connu (ancienne lecture) : considéré propriétaire jusqu'à relecture. */
  known: boolean;
}

export function useProjectAccess(projectId: string): ProjectAccess {
  const q = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId) });
  const role = q.data?.role;
  return { role: role ?? "proprietaire", canWrite: canWrite(role), isOwner: role === undefined || role === "proprietaire", known: role !== undefined };
}

/** Le message d'un projet partagé en lecture, repris dans les écrans qui masquent leurs formulaires. */
export const READ_ONLY_HINT = "Projet partagé en lecture : vous pouvez tout consulter et commenter ; les modifications sont réservées au propriétaire et aux éditeurs.";
