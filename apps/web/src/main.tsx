import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { wallPolygon } from '@parcours/core-geometry';
import './style.css';

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [thickness, setThickness] = useState(0.2);
  const polygon = wallPolygon({ id: 'demo-wall', a: [0, 0], b: [4, 0], thickness });
  const points = polygon.map(([x, y]) => `${40 + x * 70},${90 - y * 70}`).join(' ');
  return <div className={collapsed ? 'app collapsed' : 'app'}>
    <aside><button aria-label="Afficher ou réduire le menu" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>☰</button>
      {!collapsed && <><h1>Fadi</h1><p>Parcours de projets</p><nav aria-label="Navigation principale"><a href="#parcours">Parcours</a><a href="#atelier">Atelier · démonstration</a></nav></>}
    </aside>
    <div><header><strong>Fadi · Parcours</strong><span>Fondation de développement</span></header>
      <main><h2 id="parcours">Étude du potentiel d’une parcelle</h2><p>Socle initial. Les 21 étapes métier seront migrées depuis le fichier Parcours de référence, en conservant leurs phases et intitulés.</p>
      <section className="cards" aria-label="Emplacements des 21 étapes">{Array.from({ length: 21 }, (_, i) => <article key={i}><strong>{String(i + 1).padStart(2, '0')}</strong><p>Étape à migrer</p><small>Contenu métier non intégré</small></article>)}</section>
      <section id="atelier" className="panel"><h2>Connexion au noyau géométrique</h2><p>Mur de démonstration de 4 m calculé avec wallPolygon. Ce dessin ne représente pas le projet P.118.</p>
      <label>Épaisseur : {thickness.toFixed(2)} m <input type="range" min="0.1" max="0.6" step="0.05" value={thickness} onChange={e => setThickness(Number(e.target.value))}/></label>
      <svg viewBox="0 0 360 180" role="img" aria-label="Emprise du mur de démonstration"><polygon points={points} fill="#88a896" stroke="#294a3b"/></svg>
      </section></main></div>
  </div>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Application root missing');
createRoot(root).render(<StrictMode><App/></StrictMode>);
