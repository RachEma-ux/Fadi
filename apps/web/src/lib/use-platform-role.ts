import { useAuth } from "./auth-context";

/**
 * Rôle plateforme du compte connecté (gestion des comptes) : sert seulement à montrer ou cacher l'entrée
 * « Administration ». La protection reste au serveur (404 pour tout non-administrateur, à chaque requête).
 */
export function usePlatformRole(): "user" | "admin" | null {
  const { user } = useAuth();
  return user ? (user.platformRole ?? "user") : null;
}

/** Écrans d'administration montrés seulement si le serveur les a activés pour ce compte (drapeau de phase 6). */
export function useAdminEnabled(): boolean {
  const { user } = useAuth();
  return !!user?.adminEnabled;
}
