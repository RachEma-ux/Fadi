import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { RequireAuth } from "./routes/RequireAuth";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";
import { AppShell } from "./routes/AppShell";
import { AccueilPage } from "./routes/AccueilPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { ProjectShell } from "./routes/ProjectShell";
import { HarmoniePage } from "./routes/HarmoniePage";
import { ParametresPage } from "./routes/ParametresPage";

export function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <p role="status" className="loading-notice">
        Chargement…
      </p>
    );
  }

  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/accueil" element={<AccueilPage />} />
        <Route path="/projets" element={<ProjectsPage />} />
        <Route path="/projets/:projectId" element={<ProjectShell />} />
        <Route path="/harmonie" element={<HarmoniePage />} />
        <Route path="/parametres" element={<ParametresPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/accueil" replace />} />
      <Route path="*" element={<Navigate to="/accueil" replace />} />
    </Routes>
  );
}
