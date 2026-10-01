import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <p role="status" className="loading-notice">
        Vérification de la session…
      </p>
    );
  }
  if (!user) {
    return <Navigate to="/connexion" replace />;
  }
  return <>{children}</>;
}
