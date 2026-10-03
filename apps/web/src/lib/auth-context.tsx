import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type CurrentUser } from "./api";
import { localStore } from "./local-store";
import { QUERY_CACHE_VERSION } from "./query-persister";
import { conflictsStore } from "./mutations";

interface AuthState {
  user: CurrentUser | null;
  /** Encore en train de vérifier la session au chargement de la page. */
  loading: boolean;
  login(email: string, password: string): Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Un autre utilisateur sur le même appareil ne doit pas relire le cache du précédent : cache vidé (mémoire et IndexedDB). */
  async function adopt(u: CurrentUser) {
    const previous = readLastUser();
    if (previous && previous.id !== u.id) {
      queryClient.clear();
      conflictsStore.clearAll();
      await localStore.removeValue(QUERY_CACHE_VERSION);
    }
    setUser(u);
    writeLastUser(u);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        writeLastUser(u);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Seule une réponse 401 dit « pas de session » (expirée, déconnectée) : état normal pour un visiteur,
        // l'utilisateur mémorisé est oublié. Tout le reste — pas de réponse (réseau), serveur en erreur (5xx),
        // limitation (429) — est « serveur indisponible pour l'instant » : on garde le dernier utilisateur
        // connu pour relire ce qui a déjà été lu et conserver le travail en attente ; chaque requête au
        // serveur re-vérifiera la session, et un 401 réel ramènera à la connexion.
        if (forgetsSession(err)) {
          writeLastUser(null);
          return;
        }
        setUser(readLastUser());
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
      await adopt(await api.login(email, password));
    },
    async register(email, password) {
      await adopt(await api.register(email, password));
    },
    async updateProfile(displayName) {
      const u = await api.updateProfile(displayName);
      setUser(u);
      writeLastUser(u);
    },
    async logout() {
      await api.logout();
      setUser(null);
      writeLastUser(null);
      queryClient.clear();
      conflictsStore.clearAll();
      await localStore.removeValue(QUERY_CACHE_VERSION);
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
        return "Vérifiez le format de l'e-mail et la longueur du mot de passe (8 caractères minimum).";
      default:
        return "Une erreur est survenue. Réessayez.";
    }
  }
  return "Une erreur est survenue. Réessayez.";
}
