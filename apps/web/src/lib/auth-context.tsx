import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type CurrentUser } from "./api";
import { localStore } from "./local-store";
import { QUERY_CACHE_VERSION } from "./query-persister";

interface AuthState {
  user: CurrentUser | null;
  /** Encore en train de vérifier la session au chargement de la page. */
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Un autre utilisateur sur le même appareil ne doit pas relire le cache du précédent : cache vidé (mémoire et IndexedDB). */
  async function adopt(u: CurrentUser) {
    const previous = readLastUser();
    if (previous && previous.id !== u.id) {
      queryClient.clear();
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
        // Pas de session valide : état normal pour un visiteur non connecté, pas une erreur à afficher.
        // Réseau indisponible (pas de réponse du serveur) : on garde le dernier utilisateur connu pour relire
        // hors-ligne ; toute requête au serveur re-vérifiera la session.
        if (!cancelled && !(err instanceof ApiError)) setUser(readLastUser());
        if (!cancelled && err instanceof ApiError) writeLastUser(null);
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
    async logout() {
      await api.logout();
      setUser(null);
      writeLastUser(null);
      queryClient.clear();
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
