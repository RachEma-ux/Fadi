import { lazy, Suspense, type ReactNode } from "react";
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
import { BoitePage } from "./routes/BoitePage";
import { CollaborationPage } from "./routes/CollaborationPage";
import { AnnulerSuppressionPage, InvitationPage, MotDePasseOubliePage, ReinitialiserPage, VerifierEmailPage } from "./routes/ComptePages";

// Les pages lourdes (projet ouvert avec ses sept modules, bibliothèque des bâtiments) sont chargées à leur première ouverture ;
// l'enveloppe (connexion, accueil, liste des projets) reste légère. Le moteur de l'Atelier est lui-même un morceau séparé.
const PageSandbox = lazy(() => import("./modules/sandbox/PageSandbox").then((m) => ({ default: m.PageSandbox })));
const StudioShell = lazy(() => import("./modules/studio/StudioShell").then((m) => ({ default: m.StudioShell })));
const ProjectShell = lazy(() => import("./routes/ProjectShell").then((m) => ({ default: m.ProjectShell })));
const ProjectCockpitPage = lazy(() => import("./modules/pilotage/ProjectCockpitPage").then((m) => ({ default: m.ProjectCockpitPage })));
const BuildingLibraryPage = lazy(() => import("./modules/bibliotheque/BuildingLibraryPage").then((m) => ({ default: m.BuildingLibraryPage })));
// Administration de la plateforme (comptes) : chargée à la demande, comme le Studio.
// Espace d'organisation (organisations, phase 5) : chargé à la demande.
const OrganisationsPage = lazy(() => import("./routes/organisations/OrganisationsPage").then((m) => ({ default: m.OrganisationsPage })));
const OrganisationPage = lazy(() => import("./routes/organisations/OrganisationsPage").then((m) => ({ default: m.OrganisationPage })));
const AdminUsersPage = lazy(() => import("./routes/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminJournalPage = lazy(() => import("./routes/admin/AdminJournalPage").then((m) => ({ default: m.AdminJournalPage })));
const BuildingCasePage = lazy(() => import("./modules/bibliotheque/BuildingLibraryPage").then((m) => ({ default: m.BuildingCasePage })));

const Loading = () => (
  <p role="status" className="loading-notice">
    Chargement…
  </p>
);

/** Écrans d'administration masqués tant que le serveur ne les active pas pour ce compte (la protection reste serveur). */
function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.adminEnabled ? <>{children}</> : <Navigate to="/accueil" replace />;
}

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
        {/* Pages publiques des comptes : le jeton du lien reçu est dans le fragment (#jeton=…). */}
        <Route path="/compte/invitation" element={<InvitationPage />} />
        <Route path="/compte/mot-de-passe-oublie" element={<MotDePasseOubliePage />} />
        <Route path="/compte/reinitialiser" element={<ReinitialiserPage />} />
        <Route path="/compte/verifier-email" element={<VerifierEmailPage />} />
        <Route path="/compte/annuler-suppression" element={<AnnulerSuppressionPage />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/accueil" element={<AccueilPage />} />
          <Route path="/projets" element={<ProjectsPage />} />
          {/* Studio : une seule entrée ; son enveloppe lit l'adresse et montre « adresse non reconnue » plutôt qu'un repli. */}
          <Route
            path="/studio/*"
            element={
              <Suspense fallback={<Loading />}>
                <StudioShell />
              </Suspense>
            }
          />
          {/* Sandbox : 8ᵉ module, autonome (lot 1) ; l'ancienne adresse de la Console du Studio y redirige. */}
          <Route
            path="/sandbox"
            element={
              <Suspense fallback={<Loading />}>
                <PageSandbox />
              </Suspense>
            }
          />
          <Route path="/collaboration" element={<CollaborationPage />} />
          <Route path="/boite" element={<BoitePage />} />
          <Route
            path="/projets/:projectId"
            element={
              <Suspense fallback={<Loading />}>
                <ProjectShell />
              </Suspense>
            }
          />
          <Route path="/projets/:projectId/pilotage" element={<Suspense fallback={<Loading />}><ProjectCockpitPage /></Suspense>} />
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
          <Route path="/organisations" element={<Suspense fallback={<Loading />}><OrganisationsPage /></Suspense>} />
          <Route path="/organisations/:orgId" element={<Suspense fallback={<Loading />}><OrganisationPage /></Suspense>} />
          <Route path="/admin/utilisateurs" element={<AdminRoute><Suspense fallback={<Loading />}><AdminUsersPage /></Suspense></AdminRoute>} />
          <Route path="/admin/journal" element={<AdminRoute><Suspense fallback={<Loading />}><AdminJournalPage /></Suspense></AdminRoute>} />
        </Route>

        <Route path="/" element={<Navigate to="/accueil" replace />} />
        <Route path="*" element={<Navigate to="/accueil" replace />} />
      </Routes>
    </>
  );
}
