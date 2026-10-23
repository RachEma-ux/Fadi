import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { accountApi, api, ROLE_LABEL } from "../lib/api";
import { lockedHint, READ_ONLY_HINT, useProjectAccess } from "../lib/access";
import { ConflictPanel } from "../components/ConflictPanel";
import { EditingLockControl } from "../components/EditingLockControl";
import { SyncIndicator, useOnline } from "../components/SyncIndicator";
import { MODULES } from "../modules/module-registry";
import { StageStrip } from "../modules/parcours/ParcoursModule";
import { useImmersive } from "../lib/use-immersive";
import { AnalysesModule } from "../modules/analyses/AnalysesModule";
import { CollaborationModule } from "../modules/collaboration/CollaborationModule";
import { DocumentsModule } from "../modules/documents/DocumentsModule";
import { HarmonieToast } from "../modules/parcours/HarmoniePanel";
import { ParcoursModule } from "../modules/parcours/ParcoursModule";
import { ProgrammeHypothesesPage, ProgrammeModelLinksPage } from "../modules/programmation/ProgrammeLinks";
import { ProgrammeRepartition, ProgrammeTransfer } from "../modules/programmation/ProgrammeRepartition";
import { ParcelleTool } from "../modules/projets-sources/ParcelleTool";
import { ProjectSources } from "../modules/projets-sources/StepSources";
import { LOCALE } from "../lib/i18n";
import { useAuth } from "../lib/auth-context";
import { rememberDossier } from "../lib/last-dossier";
import { DossierDashboard } from "../modules/accueil/DossierDashboard";
import { ProjectModuleNav } from "./ProjectModuleNav";
import { denied } from "../modules/accueil/dossier-data";

// Le moteur de l'Atelier n'est chargé qu'à sa première ouverture ; three.js à l'ouverture de la vue 3D.
const AtelierNouveau = lazy(() => import("../modules/atelier/nouveau/AtelierNouveau").then((m) => ({ default: m.AtelierNouveau })));

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) throw new Error("projectId manquant dans l'URL");

  // Relu toutes les minutes : une réservation d'édition posée ou rendue par quelqu'un d'autre se voit sans recharger.
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), refetchInterval: 60_000, staleTime: 30_000, retry: (count, error) => !denied(error) && count < 1 });
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const stepsQuery = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });
  // Empreinte du modèle dessiné : même lecture que l'aperçu conceptuel.
  const previewQuery = useQuery({ queryKey: ["concept-preview", projectId], queryFn: () => api.getConceptPreview(projectId), enabled: !!projectQuery.data && !denied(projectQuery.error), staleTime: 5 * 60_000 });
  const online = useOnline();
  const access = useProjectAccess(projectId);
  // Accès support (D-2) : bandeau « jusqu'au … » ; l'échéance vient de l'accès lui-même, relu par le serveur.
  const supportQuery = useQuery({ queryKey: ["support-grants", projectId], queryFn: () => accountApi.supportGrants(projectId), enabled: access.role === "support", retry: false });
  const supportUntil = supportQuery.data?.you === "support" ? supportQuery.data.grant.expiresAt : null;
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;

  // Le module, l'étape et la vue vivent dans l'URL : liens directs et rechargement les respectent.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModule = searchParams.get("module");
  const activeModule = requestedModule && MODULES.some((m) => m.id === requestedModule) ? requestedModule : searchParams.has("etape") ? "parcours" : "accueil";
  const requestedStep = Number(searchParams.get("etape"));
  const requestedReview = activeModule === "parcours" && requestedStep === 11 && searchParams.get("bilan") === "1";
  const recordedEntry = useRef<string | null>(null);
  useEffect(() => {
    if (user && projectQuery.data?.id === projectId && !denied(projectQuery.error) && recordedEntry.current !== `${user.id}:${location.key}`) {
      const currentWork = activeModule === "accueil" ? undefined : requestedReview ? "review" : activeModule === "programmation" ? "programme" : activeModule === "atelier" ? "atelier" : "parcours";
      rememberDossier(user.id, projectId, activeModule === "parcours" ? requestedStep : undefined, currentWork);
      recordedEntry.current = `${user.id}:${location.key}`;
    }
  }, [user?.id, projectId, projectQuery.data?.id, projectQuery.error, activeModule, requestedStep, requestedReview, location.key]);
  // Ajuster le dessin sans masquer l'en-tête ou les modules du projet.
  useImmersive(activeModule === "atelier");
  const programmeView = searchParams.get("vue");
  function selectModule(id: string) {
    const next = new URLSearchParams();
    next.set("module", id);
    setSearchParams(next);
  }

  // Une seule enveloppe pour tous les états, accueil compris. La navigation
  // précède toujours les métadonnées, alertes et contenus spécifiques au module.
  function renderPage(content: ReactNode) {
    return <div className="project-shell" data-project-module={activeModule}>
      <ProjectModuleNav
        projectId={projectId!}
        activeModule={activeModule}
        onHome={() => setSearchParams(new URLSearchParams())}
        onModule={selectModule}
      />
      {content}
    </div>;
  }

  if (activeModule === "accueil") {
    return renderPage(<main className="fadi-home" data-home="project"><DossierDashboard key={projectId} projectId={projectId} /></main>);
  }
  if (projectQuery.isLoading) {
    return renderPage(<main className="module-content"><p role="status">Chargement du projet…</p></main>);
  }
  if (!projectQuery.data || denied(projectQuery.error)) {
    return renderPage(
      <main className="module-content">
        <p role="alert">Projet introuvable, ou vous n'y avez pas accès.</p>
        <Link to="/projets">Retour aux projets</Link>
      </main>
    );
  }

  const project = projectQuery.data;
  const descriptor = MODULES.find((m) => m.id === activeModule);

  return renderPage(
    <>
      <header className="project-header">
        <span className="project-header-meta">
          <span title={previewQuery.data?.nativeHash ? `Empreinte du modèle dessiné (révision ${project.modelRevision})` : undefined}>
            Révision du modèle : {project.modelRevision}
            {previewQuery.data?.nativeHash ? ` · empreinte ${previewQuery.data.nativeHash}` : ""}
          </span>
          <span
            className={`project-role project-role-${access.role}`}
            title={project.role === "proprietaire" || !project.role ? "Votre projet" : `Partagé par ${project.ownerEmail ?? "son propriétaire"}`}
          >
            {ROLE_LABEL[access.role]}
            {project.role && project.role !== "proprietaire" && project.ownerEmail ? ` · partagé par ${project.ownerEmail}` : ""}
          </span>
          <SyncIndicator projectId={projectId} />
          <EditingLockControl projectId={projectId} onMessage={setLockMessage} />
        </span>
      </header>

      {lockMessage && <p className="access-banner" role="alert">{lockMessage}</p>}
      {access.role === "support" ? (
        <p className="access-banner support-banner" role="status" data-support-banner>
          {supportUntil
            ? `Accès support jusqu’au ${new Date(supportUntil).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" })} : lecture seule — ni commentaire, ni modification, ni export. Chaque consultation est journalisée et visible du propriétaire.`
            : "Accès support : lecture seule — ni commentaire, ni modification, ni export. Chaque consultation est journalisée et visible du propriétaire."}
        </p>
      ) : !access.canWrite && (
        <p className="access-banner" role="status">
          {access.lock && !access.holdsLock && access.mayEdit ? lockedHint(access.lock) : READ_ONLY_HINT}{" "}
          <button type="button" className="link-button" onClick={() => selectModule("collaboration")}>Voir le partage</button>
        </p>
      )}
      {(!online || projectQuery.isError) && (
        <p className="offline-banner" role="status">
          Lecture hors-ligne : données lues le {new Date(projectQuery.dataUpdatedAt).toLocaleString(LOCALE)}. Le dessin de l’Atelier s’enregistre localement ; les formulaires et arbitrages attendront
          le retour du réseau.
        </p>
      )}
      <ConflictPanel projectId={projectId} />

      <main className={`module-content${activeModule === "parcours" || activeModule === "atelier" ? " module-content-parcours" : ""}`}>
        {activeModule === "parcours" && <ParcoursModule projectId={projectId} />}
        {activeModule !== "parcours" && notice && <HarmonieToast text={notice} onDone={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })} />}
        {activeModule === "atelier" && (
          <>
            <StageStrip title="Atelier Architectural" stage={null} subtitle={`${project.code} — ${project.name}`} onBack={() => selectModule("parcours")} onHome={() => navigate("/projets")} />
            <Suspense fallback={<p role="status">Chargement de l’Atelier…</p>}>
              <AtelierNouveau projectId={projectId} readOnly={!access.canWrite} protectedReference={project.exampleMode === "reference"} code={project.code} nomProjet={project.name} />
            </Suspense>
          </>
        )}
        {activeModule === "projets-sources" && (
          <>
            <h2>Projets et sources</h2>
            <ParcelleTool projectId={projectId} />
            <h3 className="module-subtitle">Sources des étapes</h3>
            <ProjectSources projectId={projectId} stepTitle={(n) => stepsQuery.data?.find((s) => s.number === n)?.title ?? ""} />
          </>
        )}
        {activeModule === "programmation" && (
          <>
            <h2>Programmation</h2>
            {programmeView === "modele" ? <ProgrammeModelLinksPage projectId={projectId} /> : programmeView === "hypotheses" ? <ProgrammeHypothesesPage projectId={projectId} /> : (
              <><ProgrammeRepartition projectId={projectId} /><ProgrammeTransfer projectId={projectId} /></>
            )}
          </>
        )}
        {activeModule === "analyses" && <><h2>Analyses métier</h2><AnalysesModule projectId={projectId} /></>}
        {activeModule === "documents" && <><h2>Documents</h2><DocumentsModule projectId={projectId} /></>}
        {activeModule === "collaboration" && <><h2>Collaboration</h2><CollaborationModule projectId={projectId} /></>}
        {!["parcours", "atelier", "programmation", "projets-sources", "analyses", "documents", "collaboration"].includes(activeModule) && descriptor && (
          <><h2>{descriptor.label}</h2><p>{descriptor.status}</p></>
        )}
      </main>
    </>
  );
}
