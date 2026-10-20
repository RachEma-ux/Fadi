import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useLastDossier } from "../../lib/last-dossier";
import { shownName } from "../../lib/user-display";
import { Icon } from "../../components/Icon";
import { ChoixLangue } from "../../components/ChoixLangue";
import { NotificationBell } from "../../components/NotificationBell";
import { Dialog } from "./Dialog";
import { HistoryDialog } from "./HistoryDialog";
import { DossierStatusDialog, PlatformStatusDialog } from "./StatusDialog";
import { SearchDialog } from "./SearchDialog";
import { denied } from "./dossier-data";

export function HomeTopbar({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const last = useLastDossier(user?.id);
  const location = useLocation();
  const [dialog, setDialog] = useState<"search" | "history" | "status" | "name" | null>(null);
  const project = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId!), enabled: !!projectId, staleTime: 30_000, retry: (count, e) => !denied(e) && count < 1 });
  // Studio sous un projet (`/studio/projets/:id…`) : l'en-tête nomme le projet et le module, sans lire le Parcours ni le
  // programme, ni les alertes du dossier de la cloche (ADR-STUDIO-NAV-01, C-B / NAV-002 : Studio ne passe pas par le Parcours).
  const studio = location.pathname.startsWith("/studio/");
  const steps = useQuery({ queryKey: ["steps", projectId], queryFn: () => api.listSteps(projectId!), enabled: !!projectId && !studio && !!project.data && !denied(project.error), staleTime: 60_000 });
  const programme = useQuery({ queryKey: ["programme", projectId], queryFn: () => api.getProgramme(projectId!), enabled: !!projectId && !studio && !!project.data && !denied(project.error), staleTime: 60_000 });
  const appHome = location.pathname === "/accueil";
  const commune = denied(steps.error) ? null : steps.data?.find((s) => s.number === 1)?.site?.parcel.commune;
  const type = !denied(programme.error) && (programme.data?.repartition.stored || programme.data?.programmeCase) ? programme.data.typeLabel : null;
  const subtitle = [type, commune].filter(Boolean).join(" · ");
  const name = user ? shownName(user) : "";
  // Le Sandbox (`/sandbox`, module à part depuis le lot 1) garde le titre « Studio » de l'ancienne page de la Console.
  const pageTitle = location.pathname === "/projets" ? "Projets" : location.pathname === "/studio" || location.pathname.startsWith("/studio/") || location.pathname === "/sandbox" ? "Studio" : location.pathname.startsWith("/bibliotheque") ? "Bibliothèque" : location.pathname === "/parametres" ? "Paramètres" : location.pathname === "/collaboration" ? "Collaboration" : "Espace de travail";
  return <header className="app-topbar fadi-topbar">
    <div className="fadi-topbar-title">
      {projectId ? <><h1>{denied(project.error) ? "Dossier inaccessible" : project.data ? <span translate="no">{project.data.code} — {project.data.name}</span> : project.isError ? "Dossier indisponible" : project.fetchStatus === "paused" ? "Dossier en attente de connexion" : "Chargement du dossier…"}</h1><p>{studio ? "Studio" : !denied(project.error) && subtitle || "Espace de travail du projet"}</p></> : appHome ? <><h1>Bonjour{` ${name}`}, <button type="button" className="home-name-edit" aria-label="Changer le nom affiché" title="Changer le nom affiché" onClick={() => setDialog("name")}><Icon name="design" size={16} /></button></h1><p><strong>Bienvenue dans Fadi.</strong><span>Retrouvez votre espace de travail</span></p></> : <><h1>{pageTitle}</h1><p>Votre espace de travail Fadi</p></>}
    </div>
    <div className="fadi-topbar-actions">
      <Link className="topbar-icon topbar-home" to="/accueil" title="Accueil de Fadi" aria-label="Accueil de Fadi"><Icon name="home" /></Link>
      <button type="button" className="topbar-icon" title={projectId ? "Rechercher dans ce projet" : "Rechercher un projet"} aria-label={projectId ? "Rechercher dans ce projet" : "Rechercher un projet"} onClick={() => setDialog("search")}><Icon name="search" /></button>
      <button type="button" className="topbar-icon history-trigger" title={projectId ? "Historique du Dossier" : "Historique de la plateforme"} aria-label={projectId ? "Historique du Dossier" : "Historique de la plateforme"} onClick={() => setDialog("history")}>H</button>
      <button type="button" className="topbar-state" onClick={() => setDialog("status")} title={projectId ? "Consulter les données, les droits et la synchronisation de ce dossier" : "Consulter la connexion et les données de votre espace de travail"}>{projectId ? "État du Dossier" : "État de la plateforme"}</button>
      <ChoixLangue /><NotificationBell projectId={studio ? undefined : projectId ?? (appHome ? last?.projectId : undefined)} />
    </div>
    {dialog === "search" && <SearchDialog key={projectId ?? "platform"} projectId={projectId} onClose={() => setDialog(null)} />}
    {dialog === "history" && <HistoryDialog key={projectId ?? "platform"} projectId={projectId} onClose={() => setDialog(null)} />}
    {dialog === "status" && (projectId ? <DossierStatusDialog key={projectId} projectId={projectId} onClose={() => setDialog(null)} /> : <PlatformStatusDialog onClose={() => setDialog(null)} />)}
    {dialog === "name" && <NameDialog onClose={() => setDialog(null)} />}
  </header>;
}

function NameDialog({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(false);
    try { await updateProfile(name.trim() || null); onClose(); } catch { setError(true); } finally { setPending(false); }
  }
  return <Dialog title="Changer le nom affiché" onClose={onClose}><form className="home-name-form" onSubmit={(e) => void save(e)}><label htmlFor="home-display-name">Comment vous appeler ?</label><input id="home-display-name" type="text" maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus /><button type="submit" className="button-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>{error && <p role="alert">Le nom n’a pas pu être enregistré (serveur injoignable ou refus).</p>}<Link to="/parametres" onClick={onClose}>Paramètres du compte</Link></form></Dialog>;
}
