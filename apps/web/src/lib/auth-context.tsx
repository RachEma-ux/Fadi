import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, accountApi, api, type CurrentUser } from "./api";
import { localStore } from "./local-store";
import { QUERY_CACHE_VERSION } from "./query-persister";
import { conflictsStore } from "./mutations";
import { oublierBrouillons } from "./com-brouillons";

interface AuthState {
  user: CurrentUser | null;
  /** Encore en train de vérifier la session au chargement de la page. */
  loading: boolean;
  /** `"mfa"` : mot de passe accepté, code de double authentification attendu (`loginMfa`). */
  login(email: string, password: string): Promise<"ok" | "mfa">;
  loginMfa(input: { code: string } | { recoveryCode: string }): Promise<void>;
  /** Session ouverte par une autre voie (activation d'une invitation) : adoptée comme une connexion. */
  adoptSession(u: CurrentUser): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Nom affiché (Paramètres → Compte) ; null pour l'effacer. */
  updateProfile(displayName: string | null): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const LAST_USER_KEY = "fadi.lastUser";

/** Le dernier utilisateur connu de cet appareil (pour relire hors-ligne ce qui a déjà été lu) ; le serveur reste seul juge à chaque requête. */
export function readLastUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}
function writeLastUser(u: CurrentUser | null) {
  try {
    if (u) localStorage.setItem(LAST_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* stockage indisponible : la session reste vérifiée à chaque chargement */
  }
}

/** Une erreur de `/auth/me` ne vaut « plus de session » que si le serveur l'a dit (401) ; une panne ou une limitation n'efface rien. */
export function forgetsSession(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * Oubli de ce que l'utilisateur précédent a laissé sur l'appareil (gestion des comptes, phase 2) : cache des requêtes
 * (mémoire et persistance IndexedDB), conflits affichés, lots de l'Atelier, modèles mis en cache, brouillons et versions
 * lues de Studio, utilisateur mémorisé. Appelé à la déconnexion, quand le serveur répond 401 (session expirée ou
 * révoquée) et quand un autre compte se connecte : rien n'est rejoué ni montré sous un autre compte.
 */
export async function forgetDevice(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.clear();
  conflictsStore.clearAll();
  // Brouillons de la Communication : jamais relus ni envoyés par un autre compte du même appareil.
  oublierBrouillons();
  writeLastUser(null);
  localStore.setOwner(null);
  await localStore.removeValue(QUERY_CACHE_VERSION);
  await localStore.studioOublierTout().catch(() => undefined);
  await localStore.oublierTout();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Un autre utilisateur sur le même appareil ne doit pas relire le cache du précédent : cache vidé (mémoire et IndexedDB). */
  async function adopt(fromLogin: CurrentUser) {
    // La réponse de connexion ne porte pas tout l'état du compte (`adminEnabled`) : relu une fois, sinon gardée telle quelle.
    const u = await api.me().catch(() => fromLogin);
    const previous = readLastUser();
    if (previous && previous.id !== u.id) await forgetDevice(queryClient);
    localStore.setOwner(u.id);
    setUser(u);
    writeLastUser(u);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(async (u) => {
        if (cancelled) return;
        // La session ouverte n'est pas celle du dernier utilisateur connu : ce qu'il a laissé sur l'appareil est oublié.
        const previous = readLastUser();
        if (previous && previous.id !== u.id) await forgetDevice(queryClient);
        if (cancelled) return;
        localStore.setOwner(u.id);
        setUser(u);
        writeLastUser(u);
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        // Seule une réponse 401 dit « pas de session » (expirée, déconnectée) : état normal pour un visiteur,
        // l'utilisateur mémorisé est oublié. Tout le reste — pas de réponse (réseau), serveur en erreur (5xx),
        // limitation (429) — est « serveur indisponible pour l'instant » : on garde le dernier utilisateur
        // connu pour relire ce qui a déjà été lu et conserver le travail en attente ; chaque requête au
        // serveur re-vérifiera la session, et un 401 réel ramènera à la connexion.
        if (forgetsSession(err)) {
          // Session expirée ou révoquée : ce que le compte précédent a laissé sur l'appareil est oublié (défaut PR #1).
          await forgetDevice(queryClient);
          return;
        }
        const last = readLastUser();
        localStore.setOwner(last?.id ?? null);
        setUser(last);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthState = {
    user,
    loading,
    async login(email, password) {
      const result = await api.login(email, password);
      if (result.mfaRequired) return "mfa";
      await adopt(result);
      return "ok";
    },
    async loginMfa(input) {
      await adopt(await accountApi.loginMfa(input));
    },
    adoptSession: adopt,
    async register(email, password) {
      await adopt(await api.register(email, password));
    },
    async updateProfile(displayName) {
      const u = await api.updateProfile(displayName);
      setUser(u);
      writeLastUser(u);
    },
    async logout() {
      // La purge locale a lieu même si le serveur est injoignable : l'appareil ne garde rien du compte.
      await api.logout().catch(() => undefined);
      setUser(null);
      await forgetDevice(queryClient);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function describeAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "invalid_credentials":
        return "E-mail ou mot de passe incorrect.";
      case "registration_failed":
        return "Impossible de créer ce compte.";
      case "invalid_input":
        return "Vérifiez le format de l'e-mail et la longueur du mot de passe (12 caractères minimum).";
      case "weak_password":
        return err.serverMessage ?? "Ce mot de passe est refusé : choisissez-en un autre (12 caractères minimum).";
      case "account_suspended":
        return "Ce compte est suspendu : contactez l'administrateur de la plateforme.";
      case "deletion_pending":
        return "La suppression de ce compte est programmée : utilisez le lien d'annulation reçu par courriel pour la révoquer.";
      case "too_many_attempts":
        return err.serverMessage ?? "Trop de tentatives : réessayez dans quelques minutes.";
      case "invalid_code":
        return "Code incorrect ou déjà utilisé.";
      case "mfa_session_expired":
        return "L'étape de connexion a expiré : saisissez de nouveau votre mot de passe.";
      default:
        if (err.status === 429) return "Trop de tentatives : réessayez dans quelques minutes.";
        return "Une erreur est survenue. Réessayez.";
    }
  }
  return "Une erreur est survenue. Réessayez.";
}
