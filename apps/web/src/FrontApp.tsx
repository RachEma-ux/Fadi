/**
 * FadiFront: instance statique de consultation (sans API).
 * Composants, styles et registres sont ceux du dépôt Fadi.
 * Aucun projet distant n'est simulé comme sauvegardé.
 */
import { useEffect, useState } from "react";
import { Icon } from "./components/Icon";
import { MODULES } from "./modules/module-registry";
import stepsRaw from "../../api/src/data/parcours-steps.json?raw";
import exampleRaw from "../../api/src/data/examples/p118-exemple-complet.json?raw";
import parcelRaw from "../../api/src/data/examples/p118-parcel.json?raw";
import "./FrontApp.css";

type Step = {
  number: number; title: string; phase: string; goal: string;
  inputs: string; deliverable: string; method: string;
};
type ExampleStep = {
  headline?: string | null; decision?: string | null; why?: string | null;
  proof?: string | null; result?: { donnee?: string | null; hypothese?: string | null };
};
type Parcel = {parcelNumber:string; commune:string; officialArea:number; perimeter:number;
  vertices: {id:string; x:number; y:number}[]; crs:string};
const steps = (JSON.parse(stepsRaw) as {steps:Step[]}).steps;
const example = JSON.parse(exampleRaw) as {name:string; summary:string; steps:Record<string,ExampleStep>};
const parcel = JSON.parse(parcelRaw) as Parcel;
type View = "home" | "projects" | "project" | "library";
const frontOnly = "Version de consultation · sans serveur de données";
function formatStep(n:number) { return String(n).padStart(2,"0"); }

export function FrontApp() {
  const [view,setView] = useState<View>("home");
  const [module,setModule] = useState("accueil");
  const [selectedStep,setSelectedStep] = useState<number|null>(null);
  const [expanded,setExpanded] = useState(false);
  const [notice,setNotice] = useState("");
  useEffect(() => { document.title = "Fadi — Espace de travail"; }, []);
  function openProject(id="accueil"){setView("project");setModule(id);setSelectedStep(null);setNotice("");window.scrollTo(0,0);}
  function home(){setView("home");setSelectedStep(null);setNotice("");window.scrollTo(0,0);}
  function changeModule(id:string){setModule(id);setSelectedStep(null);window.scrollTo(0,0);}
  const activeStep = selectedStep===null?null:steps.find(s=>s.number===selectedStep)??null;
  const actual = activeStep ? example.steps[String(activeStep.number)] : null;
  return <div className="app-shell fadi-shell" data-sidebar={expanded?"expanded":"collapsed"}>
    <aside className="app-sidebar" aria-label="Navigation Fadi">
      <button type="button" className="app-brand front-brand" onClick={home} title="Fadi · Accueil" aria-label="Accueil Fadi"><Icon name="home" size={28}/><span className="sidebar-label app-brand-text">Fadi</span></button>
      <button type="button" className="sidebar-toggle" onClick={()=>setExpanded(v=>!v)} aria-label="Afficher ou masquer la navigation"><Icon name="chevron-right"/><span className="sidebar-label">Réduire / développer</span></button>
      <nav className="app-nav">
        <button type="button" className={view==="home"?"active":""} onClick={home}><Icon name="home"/><span className="sidebar-label">Accueil</span></button>
        <button type="button" className={view==="projects"||view==="project"?"active":""} onClick={()=>setView("projects")}><Icon name="folder"/><span className="sidebar-label">Projets</span></button>
        <button type="button" onClick={()=>openProject("collaboration")}><Icon name="people"/><span className="sidebar-label">Collaboration</span></button>
      </nav>
      <nav className="app-nav-secondary">
        <button type="button" onClick={()=>setView("library")}><Icon name="book"/><span className="sidebar-label">Bibliothèque</span></button>
        <a href="/?logout=1" title="Déconnexion"><Icon name="arrow-right"/><span className="sidebar-label">Déconnexion</span></a>
      </nav>
    </aside>
    <div className="app-main">
      <header className="app-topbar fadi-topbar">
        <div className="fadi-topbar-title">
          <h1>{view==="home"?"Bonjour admin,":view==="projects"?"Projets":view==="library"?"Bibliothèque des bâtiments":"P.118 — Formation & bureaux"}</h1>
          <p><strong>{view==="home"?"Bienvenue dans Fadi.":"Espace de travail Fadi"}</strong><span>{frontOnly}</span></p>
        </div>
        <div className="fadi-topbar-actions">
          <button type="button" className="topbar-icon" onClick={home} title="Accueil" aria-label="Accueil"><Icon name="home"/></button>
          <span className="front-version">FadiFront</span>
        </div>
      </header>
      <main id="workspace-content" className="front-workspace">
        <div className="front-static-alert" role="status">
          <Icon name="proof" size={17}/> Instance statique basée sur Fadi · connexion locale · modifications de projet et synchronisation non disponibles.
        </div>
        {view==="home" && <>
          <h2>Accueil de Fadi</h2>
          <p>De l’idée à la décision : Fadi accompagne l’analyse d’un site et la conception d’un projet immobilier.</p>
          <section className="front-panels">
            <article className="panel front-hero">
              <span className="eyebrow">Dossier de référence · extrait du dépôt Fadi</span>
              <h3>P.118 — Formation & bureaux</h3>
              <p>{example.summary}</p>
              <button className="button-primary" type="button" onClick={()=>openProject()}>Ouvrir le dossier P.118 <Icon name="arrow-right" size={16}/></button>
            </article>
            <article className="panel">
              <span className="eyebrow">21 étapes</span>
              <h3>Parcours du projet</h3><p>Consultez la trame métier originale et les décisions documentées de l’exemple.</p>
              <button type="button" className="button-secondary" onClick={()=>openProject("parcours")}>Explorer Parcours</button>
            </article>
          </section>
          <h2>Modules du projet</h2>
          <div className="front-module-grid">{MODULES.map(m=><button type="button" className="front-module-card" key={m.id} onClick={()=>openProject(m.id)}><strong>{m.label}</strong><span>{m.id==="parcours"?"21 étapes disponibles en consultation":"Découvrir le module"}</span><Icon name="arrow-right"/></button>)}</div>
        </>}
        {view==="projects" && <><div className="front-page-head"><h2>Projets</h2><button className="button-primary" onClick={()=>openProject()}>Ouvrir P.118</button></div>
          <article className="panel front-project"><span className="eyebrow">Exemple intégré — consultation</span><h3>P.118 — Formation & bureaux</h3><p>21 étapes · parcelle 118 · {parcel.officialArea} m²</p><button className="button-primary" onClick={()=>openProject()}>Ouvrir le projet</button></article></>}
        {view==="library" && <><h2>Bibliothèque des bâtiments</h2><p>Le module complet (10 types / 21 cas) nécessite actuellement les services de Fadi. La bibliothèque sera activée dans la version avec API.</p><button className="button-secondary" onClick={()=>openProject("programmation")}>Voir Programmation</button></>}
        {view==="project" && <>
          <nav aria-label="Modules du projet" className="module-nav front-module-nav">
            <button type="button" aria-current={module==="accueil"?"page":undefined} onClick={()=>changeModule("accueil")}>Accueil du projet</button>
            <button type="button" aria-current={module==="pilotage"?"page":undefined} onClick={()=>changeModule("pilotage")}>Feuille de route</button>
            {MODULES.map(m=><button type="button" key={m.id} aria-current={module===m.id?"page":undefined} onClick={()=>changeModule(m.id)}>{m.label}</button>)}
          </nav>
          {module==="accueil" && <div className="front-detail">
            <span className="eyebrow">Identité du projet</span><h2>P.118 — Formation & bureaux</h2>
            <p>{example.summary}</p>
            <div className="front-facts"><div><b>{parcel.officialArea.toLocaleString("fr-FR")} m²</b><span>Surface cadastrale</span></div><div><b>21</b><span>Étapes de Parcours</span></div><div><b>{parcel.commune}</b><span>Commune</span></div></div>
            <button className="button-primary" onClick={()=>changeModule("parcours")}>Ouvrir les 21 étapes</button>
          </div>}
          {module==="parcours" && <section className="front-detail">
            {activeStep===null ? <>
              <span className="eyebrow">Parcours du projet · 01–21</span><h2>Les 21 étapes du Parcours</h2>
              <p>Définitions et données de l’exemple P.118 provenant des fichiers sources de Fadi.</p>
              <div className="front-step-grid">{steps.map(s=><button className="front-step" key={s.number} onClick={()=>{setSelectedStep(s.number);window.scrollTo(0,0)}}><span className="front-step-num">{formatStep(s.number)}</span><small>{s.phase}</small><strong>{s.title}</strong></button>)}</div>
            </> : <>
              <button type="button" className="button-secondary" onClick={()=>setSelectedStep(null)}>← Les 21 étapes</button>
              <span className="eyebrow">Étape {formatStep(activeStep.number)} / 21 · {activeStep.phase}</span>
              <h2>{activeStep.title}</h2><p>{activeStep.goal}</p>
              <div className="front-content-grid">
                <section className="panel"><h3>But et méthodologie</h3><p><strong>Données d’entrée :</strong> {activeStep.inputs}</p><p><strong>Méthode :</strong> {activeStep.method}</p><p><strong>Livrable :</strong> {activeStep.deliverable}</p></section>
                <section className="panel"><h3>Exemple résolu P.118</h3><p><strong>{actual?.headline??"Décision non renseignée"}</strong></p><p>{actual?.decision??"Aucun résultat fourni"}</p><p><strong>Justification :</strong> {actual?.why??"Non documentée"}</p></section>
              </div>
              {actual?.result && <section className="panel"><h3>Données et hypothèses</h3><p>{actual.result.donnee}</p><p>{actual.result.hypothese}</p></section>}
              <div className="front-step-actions"><button onClick={()=>setSelectedStep(Math.max(1,activeStep.number-1))} disabled={activeStep.number===1}>← Précédente</button><button onClick={()=>setSelectedStep(Math.min(21,activeStep.number+1))} disabled={activeStep.number===21}>Suivante →</button></div>
            </>}
          </section>}
          {module==="projets-sources" && <section className="front-detail"><h2>Site existant · Parcelle {parcel.parcelNumber}</h2>
            <div className="front-facts"><div><b>{parcel.officialArea.toLocaleString("fr-FR")} m²</b><span>Surface officielle</span></div><div><b>{parcel.perimeter.toFixed(2)} m</b><span>Périmètre calculé</span></div><div><b>{parcel.crs}</b><span>Système de coordonnées</span></div></div>
            <table className="front-table"><thead><tr><th>Borne</th><th>X Lambert</th><th>Y Lambert</th></tr></thead><tbody>{parcel.vertices.map(v=><tr key={v.id}><th>{v.id}</th><td>{v.x.toFixed(2)}</td><td>{v.y.toFixed(2)}</td></tr>)}</tbody></table>
            <p>Outil Parcelle natif : <a href="/parcelle/index.html" target="_blank" rel="noreferrer">ouvrir l’outil autonome</a>. Sans API, ses transmissions vers le modèle ne sont pas disponibles.</p>
          </section>}
          {module==="pilotage" && <section className="front-detail"><h2>Feuille de route</h2><p>Le suivi multi-utilisateur et la persistance serveur ne sont pas disponibles en mode statique.</p><div className="front-step-grid">{steps.map(s=><button className="front-step" key={s.number} onClick={()=>{changeModule("parcours");setSelectedStep(s.number)}}><span>{formatStep(s.number)}</span><strong>{s.title}</strong></button>)}</div></section>}
          {!["accueil","parcours","projets-sources","pilotage"].includes(module) && <section className="front-detail">
            <span className="eyebrow">{frontOnly}</span><h2>{MODULES.find(m=>m.id===module)?.label??"Module"}</h2>
            <p>{MODULES.find(m=>m.id===module)?.status}</p>
            <div className="front-unavailable" role="status"><Icon name="flag" size={20}/><div><strong>Fonctions métier temporairement indisponibles</strong><p>Ce module utilise les services Node.js et PostgreSQL/PostGIS de Fadi. Il ne serait pas fiable de simuler des enregistrements ou un modèle architectural sans ces services.</p></div></div>
            {module==="atelier" && <p>La véritable interface d’Atelier est conservée dans le dépôt Fadi. Elle pourra être activée dès le déploiement de l’API et du stockage persistant.</p>}
          </section>}
        </>}
        {notice&&<p role="status">{notice}</p>}
        <footer className="front-footer">FadiFront — consultation de démonstration. Données métier issues du dépôt RachEma-ux/Fadi. Aucun enregistrement serveur.</footer>
      </main>
    </div>
  </div>;
}
