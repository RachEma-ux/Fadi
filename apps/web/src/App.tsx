import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { RequireAuth } from "./routes/RequireAuth";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { ProjectShell } from "./routes/ProjectShell";

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
      <Route path="/" element={<Navigate to="/projets" replace />} />
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route
        path="/projets"
        element={
          <RequireAuth>
            <ProjectsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/projets/:projectId"
        element={
          <RequireAuth>
            <ProjectShell />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/projets" replace />} />
    </Routes>
  );
}
