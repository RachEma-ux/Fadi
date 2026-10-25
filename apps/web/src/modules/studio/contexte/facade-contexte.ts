/**
 * Façade publique de Studio pour l'authentification et la résolution du projet (ARC-03, ADR-STUDIO-PILOTE-01 P-12).
 * `StudioShell` obtient par elle seule le compte connecté et le projet ouvert : il n'importe ni `ProjectShell`, ni le
 * contexte d'authentification, ni la résolution d'accès de Fadi (contrôlé par `scripts/frontieres.json` et par
 * `facade-contexte.test.ts`). La façade lit ce que le serveur décide — `GET /projects/:id` (rôle, réservation
 * d'édition), même clé de cache que l'en-tête de Fadi — et ne déduit aucun droit côté client : le serveur reste seul
 * juge à chaque requête.
 *
 * Contrat :
 *  - `useCompteStudio()` → `{ id, connecte }` : le compte de la session (RequireAuth l'a déjà exigé) ;
 *  - `useProjetStudio(projectId)` → `ContexteProjetStudio` : `chargement`, `refuse` (401, 403 ou 404 — même écran, rien
 *    n'est divulgué, NAV-004), `indisponible` (réseau, 5xx : `relire()` retente) ou `pret` avec le projet résolu ;
 *  - `resoudreProjetStudio` : la même décision, pure (testée sans navigateur) ;
 *  - `estRefusStudio` / `relancerSaufRefus` : politique commune des refus et des relectures (un refus ne se relance pas).
 */
import { useQuery } from "@tanstack/react-query";
import { ApiError, api, canWrite, ROLE_LABEL, type EditingLock, type Project, type ProjectRole } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";

/** Projet résolu pour Studio : identité affichable, rôle renvoyé par le serveur, réservation d'édition active. */
export interface ProjetStudio {
  id: string;
  code: string;
  name: string;
  role: ProjectRole;
  /** Rôle sans écriture (lecteur, accès support) : l'interface ne propose pas ce qui serait refusé. */
  lecteur: boolean;
  /** Le rôle permet d'écrire et aucune réservation d'un autre compte ne s'y oppose. */
  ecriture: boolean;
  /** Réservation d'édition encore active (sinon null). */
  verrou: EditingLock | null;
}
export type EtatProjetStudio = "chargement" | "refuse" | "indisponible" | "pret";
export interface ContexteProjetStudio {
  etat: EtatProjetStudio;
  /** Renseigné seulement quand `etat === "pret"`. */
  projet: ProjetStudio | null;
  relire: () => void;
}

/** Refus du serveur (session absente, rôle insuffisant, projet inconnu ou non partagé) : jamais distingués à l'écran. */
export const estRefusStudio = (e: unknown): boolean => e instanceof ApiError && [401, 403, 404].includes(e.status);
/** Politique de relecture : une seule nouvelle tentative, jamais après un refus. */
export const relancerSaufRefus = (n: number, e: unknown): boolean => !estRefusStudio(e) && n < 1;
export const libelleRoleStudio = (role: ProjectRole): string => ROLE_LABEL[role];

/** Décision pure : lecture du projet (données, erreur, attente) → état de la façade. */
export function resoudreProjetStudio(lecture: { data?: Project | undefined; error?: unknown; isPending: boolean }, compteId: string | null, maintenant = Date.now()): Omit<ContexteProjetStudio, "relire"> {
  // Un refus récent prime sur un ancien projet encore présent dans le cache de requêtes.
  if (estRefusStudio(lecture.error)) return { etat: "refuse", projet: null };
  if (lecture.data) {
    const p = lecture.data;
    // Rôle absent de la réponse : propriétaire (réponse historique de GET /projects/:id, sans membre).
    const role: ProjectRole = p.role ?? "proprietaire";
    const lock = p.editingLock ?? null;
    const verrou = lock && new Date(lock.expiresAt).getTime() > maintenant ? lock : null;
    const lecteur = role === "lecteur" || role === "support";
    const ecriture = !lecteur && canWrite(role) && (!verrou || (!!compteId && verrou.userId === compteId));
    return { etat: "pret", projet: { id: p.id, code: p.code, name: p.name, role, lecteur, ecriture, verrou } };
  }
  if (lecture.isPending) return { etat: "chargement", projet: null };
  return { etat: "indisponible", projet: null };
}

/** Compte de la session, tel que l'application l'a authentifié. */
export function useCompteStudio(): { id: string | null; connecte: boolean } {
  const { user } = useAuth();
  return { id: user?.id ?? null, connecte: !!user };
}

/** Projet ouvert par Studio, résolu par le serveur (même clé de cache que l'en-tête de Fadi). */
export function useProjetStudio(projectId: string): ContexteProjetStudio {
  const compte = useCompteStudio();
  const q = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry: relancerSaufRefus });
  return { ...resoudreProjetStudio(q, compte.id), relire: () => void q.refetch() };
}
