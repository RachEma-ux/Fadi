import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api, type CurrentUser } from "./api";

interface AuthState {
  user: CurrentUser | null;
  /** Encore en train de vérifier la session au chargement de la page. */
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // Pas de session valide : état normal pour un visiteur non connecté, pas une erreur à afficher.
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
      const u = await api.login(email, password);
      setUser(u);
    },
    async register(email, password) {
      const u = await api.register(email, password);
      setUser(u);
    },
    async logout() {
      await api.logout();
      setUser(null);
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
