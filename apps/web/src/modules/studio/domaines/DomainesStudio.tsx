/**
 * Navigation des quatre domaines fonctionnels dans l'espace d'une variante (I.4-01 à I.4-03 ; NAV-005) : barre des
 * domaines **persistante en haut de l'espace**, section de chaque domaine (un seul affiché à la fois) et choix du mode
 * des planches (Planche 2D, Planche 3D ou Double vue, dans « Dessin et modélisation » seulement). Noms et
 * responsabilités : `definitions.ts` (REF-01 §02).
 *
 * Un domaine affiché à la fois : choisir un domaine l'affiche (palette d'outils, canevas et panneaux propres), l'inscrit
 * dans l'adresse (`?domaine=`, par remplacement) ; les autres domaines restent montés mais masqués (`hidden`) : un
 * geste, un brouillon, une saisie de panneau ou une sauvegarde en cours ne sont jamais abandonnés (NAV-007). Chaque lien
 * de domaine a pour adresse celle de la variante avec ce domaine (`cheminVarianteStudio`) : un clic simple, sans touche
 * de modification, est traité sur place ; Ctrl / Cmd / Maj + clic ou le bouton du milieu ouvrent cette adresse ailleurs.
 * Ces liens portent `data-studio-sans-garde` : la garde de navigation (`variante/useGardeNavigation.ts`) ne les traite
 * pas comme une sortie de la variante. Téléphone : la barre devient un menu compact (bouton du domaine affiché, liste
 * des quatre domaines), toujours en haut de l'espace et avant le canevas dans le document.
 *
 * Navigation, pas commande (règle d'or, AGENTS.md ; `planche2d/regle-or.test.ts`) : les liens de domaine et les boutons
 * de planche ne créent aucune commande ; le choix de planche n'annonce que le raccourci de la bascule existante
 * « Vue 3D » (Maj+D, icône et barre propres).
 */
import { useEffect, useId, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ariaRaccourci, COMMANDES_EDITEUR, libelleRaccourci } from "../planche2d/raccourcis";
import { definitionDomaine, DOMAINES_STUDIO, MODES_PLANCHE, montre3d, type DomaineStudio, type ModePlanche } from "./definitions";
import { idSectionDomaine } from "./domaines";
import "./domaines.css";

/** Un clic simple (bouton principal, sans Ctrl, Cmd, Maj ni Alt) : le seul qui soit traité sur place. */
export const clicSimple = (e: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "defaultPrevented">): boolean =>
  !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

/** Écran de téléphone (même seuil que les feuilles de style de Studio). */
export const REQUETE_TELEPHONE = "(max-width: 540px)";
export function useEcranTelephone(): boolean {
  const lire = () => typeof window !== "undefined" && !!window.matchMedia?.(REQUETE_TELEPHONE).matches;
  const [telephone, setTelephone] = useState(lire);
  useEffect(() => {
    const m = window.matchMedia?.(REQUETE_TELEPHONE);
    if (!m) return;
    const suivre = () => setTelephone(m.matches);
    suivre();
    m.addEventListener("change", suivre);
    return () => m.removeEventListener("change", suivre);
  }, []);
  return telephone;
}

/**
 * Barre des domaines. `compacte` (téléphone) : un bouton nomme le domaine affiché et déplie la liste des quatre ; un
 * choix la referme. Les liens existent toujours une fois dans le document (liste masquée quand le menu est fermé).
 */
export function NavigationDomaines({ actif, adresse, surChoix, compacte = false }: { actif: DomaineStudio; adresse: (id: DomaineStudio) => string; surChoix: (id: DomaineStudio) => void; compacte?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const liste = useId();
  const d = definitionDomaine(actif);
  return <nav className="studio-domaines" aria-label="Domaines du Studio" data-studio-domaines data-studio-compacte={compacte ? "" : undefined}
    onKeyDown={(e) => { if (compacte && ouvert && e.key === "Escape") { e.stopPropagation(); setOuvert(false); (e.currentTarget.querySelector("[data-studio-domaines-menu]") as HTMLElement | null)?.focus(); } }}>
    {compacte && <button type="button" className="studio-domaines-menu" aria-expanded={ouvert} aria-controls={liste} onClick={() => setOuvert((o) => !o)} data-studio-domaines-menu>
      <span className="studio-domaine-numero" aria-hidden="true">{d.numero}</span><span>{d.libelleFR}</span><span className="studio-chevron" aria-hidden="true">▾</span>
    </button>}
    <ol id={liste} hidden={compacte && !ouvert}>
      {DOMAINES_STUDIO.map((x) => <li key={x.id}>
        <a href={adresse(x.id)} aria-current={x.id === actif ? "page" : undefined} title={x.responsabiliteFR} data-studio-domaine-lien={x.id} data-studio-sans-garde=""
          onClick={(e) => { if (!clicSimple(e)) return; e.preventDefault(); setOuvert(false); surChoix(x.id); }}>
          <span className="studio-domaine-numero" aria-hidden="true">{x.numero}</span><span>{x.libelleFR}</span>
        </a>
      </li>)}
    </ol>
  </nav>;
}

/** Identifiant du titre (masqué à l'écran) d'un domaine, qui nomme sa région. */
export const idTitreDomaine = (id: DomaineStudio): string => `${idSectionDomaine(id)}-titre`;

/**
 * Région d'un domaine : ses panneaux latéraux. Un seul domaine est affiché ; les autres restent montés, masqués
 * (`hidden`), pour ne rien perdre de leur état. Le titre (nom exact du domaine) nomme la région, sans occuper l'écran.
 */
export function SectionDomaine({ id, actif, children }: { id: DomaineStudio; actif: boolean; children: ReactNode }) {
  const d = definitionDomaine(id);
  const titre = idTitreDomaine(id);
  return <section id={idSectionDomaine(id)} className={`studio-domaine studio-domaine-${id}`} data-studio-domaine={id} data-studio-domaine-actif={actif ? "" : undefined} aria-labelledby={titre} hidden={!actif}>
    <h2 id={titre} className="studio-masque" tabIndex={-1}>{d.libelleFR}</h2>
    {children}
  </section>;
}

/**
 * Mode des planches : Planche 2D, Planche 3D ou Double vue (les deux côte à côte). Trois boutons enfoncés ou non ; le
 * raccourci de la bascule « Vue 3D » (Maj+D) n'est annoncé que sur le bouton qu'il activerait (2D ↔ 3D).
 */
export function SelecteurPlanche({ active, surChoix }: { active: ModePlanche; surChoix: (p: ModePlanche) => void }) {
  const bascule = COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!;
  const cibleMajD: ModePlanche = montre3d(active) ? "2d" : "3d";
  return <span className="studio-planches" role="group" aria-label="Planches" data-studio-planches>
    {MODES_PLANCHE.map((p) => {
      const presse = p.id === active;
      const annonce = p.id === cibleMajD;
      // Une extension proposée (Double vue) est étiquetée comme telle, à l'écran et dans son nom accessible.
      const nom = p.extension ? `${p.libelleFR} (extension proposée)` : p.libelleFR;
      return <button key={p.id} type="button" aria-pressed={presse} aria-label={nom} aria-keyshortcuts={annonce ? ariaRaccourci(bascule.raccourci) : undefined}
        title={annonce ? `${nom} — ${libelleRaccourci(bascule.raccourci)}` : nom}
        data-studio-planche={p.id} data-studio-extension-proposee={p.extension ? "" : undefined} onClick={() => { if (!presse) surChoix(p.id); }}>{p.courtFR}{p.extension && <span className="studio-extension" aria-hidden="true">proposée</span>}</button>;
    })}
  </span>;
}

/** Publications de l'étude (manifeste, approbation, diffusion), dans le domaine Documentation. */
export function LienPublications({ adresse }: { adresse: string }) {
  return <div className="studio-domaine-acces" data-studio-domaine-publications><Link to={adresse} data-studio-publications-etude>Publications de l’étude</Link></div>;
}
