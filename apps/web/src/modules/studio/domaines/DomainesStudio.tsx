/**
 * Présentation des quatre domaines fonctionnels dans l'espace d'une variante (I.4-01, I.4-02 ; NAV-005) : navigation
 * des domaines, section de chaque domaine, choix de la planche (Planche 2D / Planche 3D, dans « Dessin et
 * modélisation » seulement), accès aux commandes d'un domaine et aperçu du domaine Visualisation. Noms et
 * responsabilités : `domaines.ts` (REF-01 §02) ; le contenu de chaque section est dérivé des tables de `domaines.ts`.
 *
 * Profil standard (REF-01 §03) : les quatre domaines restent présents l'un sous l'autre ; choisir un domaine le rend
 * actif, l'inscrit dans l'adresse et y porte le focus, sans masquer ni recharger un autre domaine (un geste, un
 * brouillon ou une sauvegarde en cours ne sont jamais abandonnés, NAV-007). Chaque lien de domaine a pour adresse
 * celle de la variante avec ce domaine (`cheminVarianteStudio`) : un clic simple, sans touche de modification, est
 * traité sur place ; Ctrl / Cmd / Maj + clic ou le bouton du milieu ouvrent cette adresse ailleurs. Ces liens portent
 * `data-studio-sans-garde` : la garde de navigation (`variante/useGardeNavigation.ts`) ne les traite pas comme une
 * sortie de la variante.
 *
 * Navigation, pas commande (règle d'or, AGENTS.md ; `planche2d/regle-or.test.ts`) : les liens de domaine et les deux
 * boutons de planche ne créent aucune commande ; le choix de planche exécute la bascule existante « Vue 3D » (Maj+D,
 * icône et barre propres) et les accès d'un domaine lancent les commandes existantes, avec leur icône et leur raccourci.
 */
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { studioScenes, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { ariaRaccourci, COMMANDES_EDITEUR, libelleRaccourci, type CommandeEditeur, type IdCommandeEditeur } from "../planche2d/raccourcis";
import { TYPES_RENDU } from "../vue3d/scenes/scenes-ui";
import { definitionDomaine, DOMAINES_STUDIO, idSectionDomaine, PLANCHES_STUDIO, type DomaineStudio, type PlancheStudio } from "./domaines";
import "./domaines.css";

/** Un clic simple (bouton principal, sans Ctrl, Cmd, Maj ni Alt) : le seul qui soit traité sur place. */
export const clicSimple = (e: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "defaultPrevented">): boolean =>
  !e.defaultPrevented && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

/** Écran de téléphone (même seuil que les feuilles de style de Studio) : la navigation des domaines se range sous la planche. */
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

export function NavigationDomaines({ actif, adresse, surChoix }: { actif: DomaineStudio; adresse: (id: DomaineStudio) => string; surChoix: (id: DomaineStudio) => void }) {
  return <nav className="studio-domaines" aria-label="Domaines du Studio" data-studio-domaines>
    <ol>
      {DOMAINES_STUDIO.map((d) => <li key={d.id}>
        <a href={adresse(d.id)} aria-current={d.id === actif ? "true" : undefined} title={d.responsabiliteFR} data-studio-domaine-lien={d.id} data-studio-sans-garde=""
          onClick={(e) => { if (!clicSimple(e)) return; e.preventDefault(); surChoix(d.id); }}>
          <span className="studio-domaine-numero" aria-hidden="true">{d.numero}</span><span>{d.libelleFR}</span>
        </a>
      </li>)}
    </ol>
  </nav>;
}

/** Identifiant du titre d'un domaine (cible du focus et nom de la section). */
export const idTitreDomaine = (id: DomaineStudio): string => `${idSectionDomaine(id)}-titre`;

/**
 * Section d'un domaine. `titreVisible` faux (Dessin et modélisation, dont la planche doit rester dans la moitié haute
 * de l'écran) : la section ne rend pas son titre ; il est posé dans la légende de la planche (`TitreLegende`).
 */
export function SectionDomaine({ id, actif, titreVisible = true, children }: { id: DomaineStudio; actif: boolean; titreVisible?: boolean; children: ReactNode }) {
  const d = definitionDomaine(id);
  const titre = idTitreDomaine(id);
  return <section id={idSectionDomaine(id)} className={`studio-domaine studio-domaine-${id}`} data-studio-domaine={id} data-studio-domaine-actif={actif ? "" : undefined} aria-labelledby={titre}>
    {titreVisible && <header className="studio-domaine-entete"><h2 id={titre} tabIndex={-1}><span className="studio-domaine-numero" aria-hidden="true">{d.numero}</span><span>{d.libelleFR}</span></h2><p>{d.responsabiliteFR}</p></header>}
    {children}
  </section>;
}

/** Titre d'un domaine rendu dans la légende de sa planche (visible sur un écran large). */
export function TitreLegende({ id }: { id: DomaineStudio }) {
  return <h2 id={idTitreDomaine(id)} className="studio-legende-titre" tabIndex={-1}>{definitionDomaine(id).libelleFR}</h2>;
}

/**
 * Choix de la planche active : deux boutons enfoncés ou non, qui exécutent la bascule existante « Vue 3D » (Maj+D).
 * Le raccourci n'est annoncé que sur le bouton inactif (celui que Maj+D activerait).
 */
export function SelecteurPlanche({ active, surChoix }: { active: PlancheStudio; surChoix: (p: PlancheStudio) => void }) {
  const bascule = COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!;
  return <span className="studio-planches" role="group" aria-label="Planches" data-studio-planches>
    {PLANCHES_STUDIO.map((p) => {
      const inactif = p.id !== active;
      return <button key={p.id} type="button" aria-pressed={!inactif} aria-keyshortcuts={inactif ? ariaRaccourci(bascule.raccourci) : undefined}
        title={inactif ? `Basculer de planche : ${libelleRaccourci(bascule.raccourci)}` : undefined}
        data-studio-planche={p.id} onClick={() => { if (inactif) surChoix(p.id); }}>{p.libelleFR}</button>;
    })}
  </span>;
}

/**
 * Domaine Visualisation, rendu et immersion : **aperçu** des scènes enregistrées dans le document et des types de
 * rendu (mêmes données que le panneau « Scènes, apparence et rendus » de la Planche 3D). L'édition des scènes et du
 * rendu se fait dans la Planche 3D ; ce domaine ne la déplace pas.
 */
export function ApercuVisualisation({ doc, surOuvrir3d }: { doc: StudioDocument; surOuvrir3d: () => void }) {
  const scenes = studioScenes(doc);
  return <div className="studio-domaine-corps" data-studio-visualisation-apercu data-studio-scenes-nombre={scenes.length}>
    <p className="studio-hint" data-studio-visualisation-note>Aperçu ; l’édition des scènes et du rendu se fait dans la Planche 3D.</p>
    <h3>Scènes enregistrées</h3>
    {scenes.length ? <ul className="studio-domaine-liste">{scenes.map((s) => <li key={s.id} translate="no" data-studio-apercu-scene={s.id}>{s.name}</li>)}</ul> : <p>Aucune scène enregistrée.</p>}
    <h3>Rendus</h3>
    <ul className="studio-domaine-liste">{TYPES_RENDU.map((r) => <li key={r.id} data-studio-apercu-rendu={r.id} data-studio-disponible={r.disponible ? "oui" : "non"}><span>{r.libelle}</span> <small>{r.disponible ? "Disponible" : "Non disponible"}</small></li>)}</ul>
    <button type="button" onClick={surOuvrir3d} data-studio-examiner-3d>Ouvrir la Planche 3D</button>
  </div>;
}

/** Accès d'un domaine : ses commandes existantes (`commandesDuDomaine`), avec l'icône et le raccourci de la barre. */
export function AccesDomaine({ domaine, commandes, disponible, surCommande }: {
  domaine: DomaineStudio;
  commandes: readonly IdCommandeEditeur[];
  disponible: (c: CommandeEditeur) => boolean;
  surCommande: (id: IdCommandeEditeur) => void;
}) {
  if (!commandes.length) return null;
  return <div className="studio-domaine-acces" data-studio-domaine-acces={domaine}>
    {commandes.map((id) => {
      const c = COMMANDES_EDITEUR.find((x) => x.id === id)!;
      return <button key={id} type="button" disabled={!disponible(c)} aria-keyshortcuts={ariaRaccourci(c.raccourci)} onClick={() => surCommande(id)} data-studio-domaine-commande={id}>
        <Icon name={c.iconeSymbolique} size={16} /> <span>{c.libelleFR}</span> <kbd aria-hidden="true">{libelleRaccourci(c.raccourci)}</kbd>
      </button>;
    })}
  </div>;
}

/** Publications de l'étude (manifeste, approbation, diffusion), dans le domaine Documentation. */
export function LienPublications({ adresse }: { adresse: string }) {
  return <div className="studio-domaine-acces" data-studio-domaine-publications><Link to={adresse} data-studio-publications-etude>Publications de l’étude</Link></div>;
}
