import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ROLE_LABEL } from "../lib/api";
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

// Le moteur de l'Atelier (scripts, markup, feuille de style) n'est chargé qu'à la première ouverture de l'Atelier.
const NativeAtelier = lazy(() => import("../modules/atelier/NativeAtelier").then((m) => ({ default: m.NativeAtelier })));
// Nouvel Atelier (lot 3a) : ouvert par `?module=atelier&version=nouveau` à côté de l'ancien jusqu'à la bascule (lot 4).
const NouvelAtelier = lazy(() => import("../modules/atelier/NouvelAtelier").then((m) => ({ default: m.NouvelAtelier })));

export function ProjectShell() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) throw new Error("projectId manquant dans l'URL");

  // Relu toutes les minutes : une réservation d'édition posée ou rendue par quelqu'un d'autre se voit sans recharger.
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), refetchInterval: 60_000 });
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const stepsQuery = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId) });
  // Empreinte du modèle dessiné (détail technique, montré ici plutôt que sur l'accueil) : même lecture que l'aperçu conceptuel.
  const previewQuery = useQuery({ queryKey: ["concept-preview", projectId, projectQuery.data?.updatedAt], queryFn: () => api.getConceptPreview(projectId), enabled: !!projectQuery.data, staleTime: 5 * 60_000 });
  const online = useOnline();
  const access = useProjectAccess(projectId);
  // Un message porté par la navigation (copie de travail créée, projet importé…) : le Parcours affiche le sien, les autres modules celui-ci.
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;

  // Le module ouvert vit dans l'URL (`?module=`), comme l'étape (`?etape=`) et la vue (`?vue=`) : les liens
  // entre modules (« Comparer au modèle dessiné », « Ouvrir l’Atelier »…) et le rechargement le respectent.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModule = searchParams.get("module");
  const activeModule = requestedModule && MODULES.some((m) => m.id === requestedModule) ? requestedModule : "parcours";
  // Module Atelier : page de l'Atelier Architectural (enveloppe effacée), comme aux étapes 10 / 11.
  useImmersive(activeModule === "atelier");
  const programmeView = searchParams.get("vue");
  const nouvelAtelier = activeModule === "atelier" && searchParams.get("version") === "nouveau";
  function selectModule(id: string) {
    const next = new URLSearchParams();
    next.set("module", id);
    setSearchParams(next);
  }

  if (projectQuery.isLoading) {
    return <p role="status">Chargement du projet…</p>;
  }
  if (!projectQuery.data) {
    return (
      <main>
        <p role="alert">Projet introuvable, ou vous n'y avez pas accès.</p>
        <Link to="/projets">Retour aux projets</Link>
      </main>
    );
  }

  const project = projectQuery.data;
  const descriptor = MODULES.find((m) => m.id === activeModule);

  return (
    <div className="project-shell">
      <header className="project-header">
        <h1>
          {project.code} — {project.name}
        </h1>
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

      {lockMessage && (
        <p className="access-banner" role="alert">
          {lockMessage}
        </p>
      )}

      {!access.canWrite && (
        <p className="access-banner" role="status">
          {access.lock && !access.holdsLock && access.mayEdit ? lockedHint(access.lock) : READ_ONLY_HINT}{" "}
          <button type="button" className="link-button" onClick={() => selectModule("collaboration")}>
            Voir le partage
          </button>
        </p>
      )}

      {(!online || projectQuery.isError) && (
        <p className="offline-banner" role="status">
          Lecture hors-ligne : données lues le {new Date(projectQuery.dataUpdatedAt).toLocaleString("fr-FR")}. Le dessin de l’Atelier s’enregistre localement ; les formulaires et arbitrages attendront
          le retour du réseau.
        </p>
      )}

      <ConflictPanel projectId={projectId} />

      <nav aria-label="Modules du projet" className="module-nav">
        {MODULES.map((m) => (
          <button key={m.id} type="button" aria-current={m.id === activeModule ? "page" : undefined} onClick={() => selectModule(m.id)}>
            {m.label}
          </button>
        ))}
      </nav>

      <main className={`module-content${activeModule === "parcours" || activeModule === "atelier" ? " module-content-parcours" : ""}`}>
        {/* Le module Parcours porte son propre bandeau (« Parcours du projet », prototype) et sa mise en page : pas de titre de module. */}
        {activeModule === "parcours" && <ParcoursModule projectId={projectId} />}

        {activeModule !== "parcours" && notice && <HarmonieToast text={notice} onDone={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })} />}

        {activeModule === "atelier" && (
          <>
            {/* Module Atelier : la page de l'Atelier Architectural (bandeau du prototype, enveloppe effacée) ; « ← » ramène au parcours. */}
            <StageStrip title="Atelier Architectural" stage={null} subtitle={`${project.code} — ${project.name}`} onBack={() => selectModule("parcours")} onHome={() => navigate("/projets")} />
            <Suspense fallback={<p role="status">Chargement de l’Atelier…</p>}>
              {nouvelAtelier ? (
                <NouvelAtelier projet={{ id: projectId, code: project.code, nom: project.name }} readOnly={!access.canWrite} />
              ) : (
                <NativeAtelier projectId={projectId} readOnly={!access.canWrite} />
              )}
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
            {programmeView === "modele" ? (
              <ProgrammeModelLinksPage projectId={projectId} />
            ) : programmeView === "hypotheses" ? (
              <ProgrammeHypothesesPage projectId={projectId} />
            ) : (
              <>
                <ProgrammeRepartition projectId={projectId} />
                <ProgrammeTransfer projectId={projectId} />
              </>
            )}
          </>
        )}

        {activeModule === "analyses" && (
          <>
            <h2>Analyses métier</h2>
            <AnalysesModule projectId={projectId} />
          </>
        )}

        {activeModule === "documents" && (
          <>
            <h2>Documents</h2>
            <DocumentsModule projectId={projectId} />
          </>
        )}

        {activeModule === "collaboration" && (
          <>
            <h2>Collaboration</h2>
            <CollaborationModule projectId={projectId} />
          </>
        )}

        {!["parcours", "atelier", "programmation", "projets-sources", "analyses", "documents", "collaboration"].includes(activeModule) && descriptor && (
          <>
            <h2>{descriptor.label}</h2>
            <p>{descriptor.status}</p>
          </>
        )}
      </main>
    </div>
  );
}
