import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { ScrollReset } from "./lib/scroll-reset";
import { RequireAuth } from "./routes/RequireAuth";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";
import { AppShell } from "./routes/AppShell";
import { AccueilPage } from "./routes/AccueilPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { HarmoniePage } from "./routes/HarmoniePage";
import { ParametresPage } from "./routes/ParametresPage";

// Les pages lourdes (projet ouvert avec ses sept modules, bibliothèque des bâtiments) sont chargées à leur première ouverture ;
// l'enveloppe (connexion, accueil, liste des projets) reste légère. Le moteur de l'Atelier est lui-même un morceau séparé.
const ProjectShell = lazy(() => import("./routes/ProjectShell").then((m) => ({ default: m.ProjectShell })));
const BuildingLibraryPage = lazy(() => import("./modules/bibliotheque/BuildingLibraryPage").then((m) => ({ default: m.BuildingLibraryPage })));
const BuildingCasePage = lazy(() => import("./modules/bibliotheque/BuildingLibraryPage").then((m) => ({ default: m.BuildingCasePage })));

const Loading = () => (
  <p role="status" className="loading-notice">
    Chargement…
  </p>
);

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
    <>
      {/* Avant les routes : sa remise à zéro (effet de mise en page) précède les effets des écrans qui ciblent un panneau. */}
      <ScrollReset />
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
          <Route
            path="/projets/:projectId"
            element={
              <Suspense fallback={<Loading />}>
                <ProjectShell />
              </Suspense>
            }
          />
          <Route path="/harmonie" element={<HarmoniePage />} />
          <Route
            path="/bibliotheque/batiments"
            element={
              <Suspense fallback={<Loading />}>
                <BuildingLibraryPage />
              </Suspense>
            }
          />
          <Route
            path="/bibliotheque/batiments/:id"
            element={
              <Suspense fallback={<Loading />}>
                <BuildingCasePage />
              </Suspense>
            }
          />
          <Route path="/parametres" element={<ParametresPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/accueil" replace />} />
        <Route path="*" element={<Navigate to="/accueil" replace />} />
      </Routes>
    </>
  );
}
