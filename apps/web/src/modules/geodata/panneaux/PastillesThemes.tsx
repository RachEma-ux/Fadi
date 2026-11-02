/**
 * Pastilles de thème (D-GD-48) : un raccourci par catégorie gérée du catalogue (D-GD-14, lue en base), sur la carte. Une
 * pastille affiche ou masque toutes les couches de son thème ; son badge dit combien d'objets du thème sont dessinés dans
 * la vue (thème affiché) ou combien de couches il compte (thème absent). Les limites administratives n'ont pas de pastille :
 * on y navigue par la barre territoriale. Bande repliable par son bouton « Thèmes » ou Alt+T.
 */
import { formatNombre } from "@parcours/geodata-model";

export interface PastilleTheme {
  readonly cle: string;
  readonly libelle: string;
  readonly etat: "absent" | "partiel" | "affiche";
  /** Objets dessinés dans la vue (thème affiché) ; null tant que le moteur ne les a pas relevés. */
  readonly objets: number | null;
  readonly couches: number;
}

const THEMES = "M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 13h7v5h-7z";

export function PastillesThemes(p: { pastilles: readonly PastilleTheme[]; ouverte: boolean; decalee: boolean; onBasculer(): void; onTheme(cle: string): void }) {
  if (!p.pastilles.length) return null;
  return (
    <div className={`gd-pastilles${p.decalee ? " gd-pastilles-decalee" : ""}`} role="group" aria-label="Thèmes" data-gd-pastilles={p.ouverte ? "ouvertes" : "repliees"}>
      <button type="button" className="gd-pastilles-bascule" aria-expanded={p.ouverte} aria-keyshortcuts="Alt+T" title={p.ouverte ? "Replier les thèmes (Alt+T)" : "Afficher les thèmes (Alt+T)"} onClick={p.onBasculer} data-gd-pastilles-bascule>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d={THEMES} /></svg>
        <span>Thèmes</span>
      </button>
      {p.ouverte && p.pastilles.map((t) => (
        <button key={t.cle} type="button" className={`gd-pastille-theme gd-theme-${t.etat}`} aria-pressed={t.etat === "affiche" ? true : t.etat === "partiel" ? "mixed" : false}
          title={t.etat === "absent" ? `Afficher le thème « ${t.libelle} » (${t.couches} couche(s))` : `Masquer le thème « ${t.libelle} »`} onClick={() => p.onTheme(t.cle)} data-gd-pastille-theme={t.cle}>
          <span translate="no">{t.libelle}</span>
          <span className="gd-pastille-badge" data-gd-pastille-badge>{t.etat !== "absent" && t.objets !== null ? formatNombre(t.objets, 0) : `${t.couches}`}</span>
        </button>
      ))}
    </div>
  );
}
