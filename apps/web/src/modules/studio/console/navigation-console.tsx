/**
 * Navigation de l'outil de la Console (`/studio/console/outil`, demande du maître d'ouvrage du 11 novembre 2026,
 * inspirée de la maquette « Console Dessin ») — les barres d'outils verticales à gauche et le dessin des icônes ne
 * changent pas ; la navigation autour d'elles se resserre, comme dans un logiciel de modélisation :
 *
 * - `RechercheOutil` : en tête de la barre d'outils verticale, ouvre la palette de commandes (Ctrl+K) pour trouver un
 *   outil par son nom ;
 * - `RailPanneaux` : rail d'icônes vertical à droite, un bouton par panneau du domaine affiché ; un clic ouvre le panneau
 *   dans un tiroir unique (un seul panneau à la fois), un second clic le referme. Raccourcis Ctrl+Maj+1 à Ctrl+Maj+9
 *   (Alt+Maj+chiffre appartient déjà aux commandes de collaboration) ;
 *   flèches haut / bas, Début, Fin d'un bouton à l'autre ;
 * - `ReperesCanevas` : sur le canevas, la pastille de contexte (hors projet, planche, repère, unité, état) en haut à
 *   gauche et l'indicateur de l'outil actif (nom, raccourci, aide) en bas au centre.
 *
 * Seulement dans la Console (mode `autonome`), hors téléphone : l'espace d'une variante de projet garde sa colonne de
 * panneaux repliables.
 */
import { useEffect, useRef, type KeyboardEvent as ClavierReact } from "react";
import { Icon } from "../../../components/Icon";
import type { FonctionStudio } from "../domaines/domaines";
import type { DomaineStudio } from "../domaines/definitions";
import { ariaRaccourci, libelleRaccourci } from "../planche2d/raccourcis";

type NomIcone = Parameters<typeof Icon>[0]["name"];

/** Panneau du rail : identifiant (celui du `PanneauLateral`), titre, icône, et s'il lit une étude (indisponible ici). */
export interface PanneauRail { readonly id: string; readonly titre: string; readonly icone: NomIcone; readonly indisponible: boolean }

/** Icône de chaque panneau, prise dans le jeu d'icônes existant de Studio (aucune nouvelle icône). */
export const ICONES_PANNEAUX: Readonly<Record<string, NomIcone>> = Object.freeze({
  proprietes: "studio-property-set",
  "volume-3d": "studio-view-3d",
  elements: "studio-select-all",
  exigences: "studio-requirements",
  "scenes-rendus": "studio-scene-recall",
  publications: "studio-dossier",
  "commentaires-observations": "studio-comments",
  revisions: "studio-merge-undo",
  metre: "studio-dimension",
});

/** Nombre de panneaux joignables au clavier (Ctrl+Maj+1 à Ctrl+Maj+9 ; Cmd vaut Ctrl). */
export const RACCOURCIS_PANNEAUX_MAX = 9;
/** Raccourci du n-ième panneau du rail (0 = premier), dans la notation de la table clavier ; `null` au-delà du neuvième. */
export const raccourciPanneau = (i: number): string | null => (i >= 0 && i < RACCOURCIS_PANNEAUX_MAX ? `Ctrl+Shift+${i + 1}` : null);

/**
 * Panneaux du rail pour un domaine, dans l'ordre de la colonne actuelle : Propriétés et, en 3D, Planche 3D pour Dessin
 * et modélisation, puis les panneaux du domaine (`panneauxDuDomaine`). Pur.
 */
export function panneauxDuRail(domaine: DomaineStudio, o: {
  vue3d: boolean;
  panneaux: readonly FonctionStudio[];
  titres: Readonly<Partial<Record<FonctionStudio, string>>>;
  indisponibles: ReadonlySet<FonctionStudio>;
}): PanneauRail[] {
  const liste: PanneauRail[] = [];
  if (domaine === "dessin") {
    liste.push({ id: "proprietes", titre: "Propriétés", icone: ICONES_PANNEAUX.proprietes!, indisponible: false });
    if (o.vue3d) liste.push({ id: "volume-3d", titre: "Planche 3D", icone: ICONES_PANNEAUX["volume-3d"]!, indisponible: false });
  }
  for (const f of o.panneaux) liste.push({ id: f, titre: o.titres[f] ?? f, icone: ICONES_PANNEAUX[f] ?? "studio-catalog", indisponible: o.indisponibles.has(f) });
  return liste;
}

/**
 * Panneau montré : le choix fait pour ce domaine s'il existe encore dans le rail (`null` = tiroir fermé), sinon le
 * premier panneau du rail (ouvert par défaut, comme la colonne actuelle). Pur.
 */
export function panneauActif(rail: readonly PanneauRail[], choix: string | null | undefined): string | null {
  if (choix === null) return null;
  if (choix !== undefined && rail.some((p) => p.id === choix)) return choix;
  return rail[0]?.id ?? null;
}

/** Index du panneau visé par une touche (Ctrl ou Cmd + Maj + chiffre, par la touche physique), sinon `null`. Pur. */
export function indexRaccourciPanneau(e: { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; code: string }): number | null {
  if (e.altKey || !e.shiftKey || !(e.ctrlKey || e.metaKey)) return null;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return m ? Number(m[1]) - 1 : null;
}

/** Rail des panneaux (à droite) : un bouton par panneau, enfoncé quand son panneau est montré dans le tiroir. */
export function RailPanneaux({ panneaux, actif, surChoix }: { panneaux: readonly PanneauRail[]; actif: string | null; surChoix: (id: string | null) => void }) {
  const suivi = useRef({ panneaux, actif, surChoix });
  suivi.current = { panneaux, actif, surChoix };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const i = indexRaccourciPanneau(e);
      if (i === null) return;
      const p = suivi.current.panneaux[i];
      if (!p) return;
      e.preventDefault();
      suivi.current.surChoix(suivi.current.actif === p.id ? null : p.id);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);
  const clavier = (e: ClavierReact<HTMLElement>) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const i = items.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const n = items.length;
    const j = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
    items[j]?.focus();
  };
  return <div className="studio-rail-panneaux" role="toolbar" aria-orientation="vertical" aria-label="Panneaux" onKeyDown={clavier} data-studio-rail-panneaux>
    {panneaux.map((p, i) => {
      const presse = p.id === actif;
      const r = raccourciPanneau(i);
      const nom = p.indisponible ? `${p.titre} (indisponible dans la Console)` : p.titre;
      return <button key={p.id} type="button" aria-pressed={presse} aria-label={nom} aria-keyshortcuts={r ? ariaRaccourci(r) : undefined}
        title={r ? `${nom} — ${libelleRaccourci(r)}` : nom} onClick={() => surChoix(presse ? null : p.id)}
        data-studio-rail-panneau={p.id} data-studio-rail-indisponible={p.indisponible ? "" : undefined}>
        <Icon name={p.icone} size={18} />
      </button>;
    })}
  </div>;
}

/** Bouton « Rechercher un outil », en tête de la barre d'outils verticale : ouvre la palette de commandes. */
export function RechercheOutil({ surOuvrir }: { surOuvrir: () => void }) {
  return <button type="button" className="studio-recherche-outil" aria-label="Rechercher un outil" aria-keyshortcuts="Control+K"
    title={`Rechercher un outil — ${libelleRaccourci("Ctrl+K")}`} onClick={surOuvrir} data-studio-recherche-outil>
    <Icon name="search" size={18} />
  </button>;
}

/** Repères posés sur le canevas : contexte (haut gauche) et outil actif (bas centre). Ne capte aucun clic du dessin. */
export function ReperesCanevas({ planche, enAttente, outil, raccourci, aide }: {
  planche: string;
  enAttente: number;
  outil: string;
  raccourci: string | null;
  aide: string;
}) {
  return <>
    <div className="studio-reperes-contexte" data-studio-reperes-contexte>
      <span className="studio-reperes-fort">Hors projet</span>
      <span>{planche}</span>
      <span>Repère local</span>
      <span className="studio-reperes-unite">m</span>
      <span className={enAttente ? "studio-reperes-etat studio-reperes-etat-modifie" : "studio-reperes-etat"} data-studio-reperes-etat={enAttente ? "modifie" : "vide"}>
        <span aria-hidden="true">●</span> {enAttente ? "modifications non enregistrées" : "aucune modification"}
      </span>
    </div>
    {/* Doublon visuel de la barre d'état (qui reste la source annoncée) : masqué des lecteurs d'écran. */}
    <div className="studio-reperes-outil" aria-hidden="true" data-studio-reperes-outil>
      <strong>{outil}</strong>
      {aide && <span className="studio-reperes-aide">{aide}</span>}
      {raccourci && <kbd>{libelleRaccourci(raccourci)}</kbd>}
    </div>
  </>;
}
