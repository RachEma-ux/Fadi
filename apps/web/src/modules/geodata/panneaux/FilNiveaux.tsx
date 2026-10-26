/**
 * Fil des niveaux (D-GD-17, lot B), posé sur la carte comme sur les cartes du HCP : « Maroc › Région … › Province … ».
 * Chaque étape ramène à son niveau ; « Retour » (Alt+↑) remonte d'un niveau. On descend depuis la fiche d'une entité
 * (« Voir ses provinces… », Alt+↓). Les noms sont des données (affichés tels quels, `translate="no"`).
 */
import type { EtapeNiveau } from "@parcours/geodata-model";

const RETOUR = "M15 18 9 12l6-6";
const NIVEAUX = "M4 6h16M7 12h13M10 18h10";

export function FilNiveaux(p: { chemin: readonly EtapeNiveau[]; onAller(longueur: number): void; onRetour(): void }) {
  const n = p.chemin.length;
  return (
    <nav className="gd-niveaux" aria-label="Navigation par niveaux" data-gd-niveaux={n}>
      <svg className="gd-niveaux-icone" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d={NIVEAUX} /></svg>
      <ol>
        <li>{n === 0 ? <span aria-current="location">Maroc</span> : <button type="button" onClick={() => p.onAller(0)} data-gd-niveau="0">Maroc</button>}</li>
        {p.chemin.map((e, i) => (
          <li key={`${e.coucheId}:${e.code}`}>
            <span aria-hidden="true" className="gd-niveaux-sep">›</span>
            {i === n - 1 ? <span aria-current="location" translate="no">{e.nom}</span> : <button type="button" onClick={() => p.onAller(i + 1)} data-gd-niveau={i + 1} translate="no">{e.nom}</button>}
          </li>
        ))}
      </ol>
      <button type="button" className="gd-niveaux-retour" onClick={p.onRetour} disabled={n === 0} aria-label="Retour au niveau supérieur" title="Retour au niveau supérieur (Alt+↑)" aria-keyshortcuts="Alt+ArrowUp" data-gd-retour>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={RETOUR} /></svg>
        <span>Retour</span>
      </button>
    </nav>
  );
}
