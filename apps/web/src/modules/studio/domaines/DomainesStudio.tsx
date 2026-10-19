/**
 * Présentation des quatre domaines fonctionnels dans l'espace d'une variante (I.4-01, I.4-02 ; NAV-005) : navigation
 * des domaines, section de chaque domaine, choix de la planche (Planche 2D / Planche 3D, dans « Dessin et
 * modélisation » seulement) et aperçu du domaine Visualisation. Noms et responsabilités : `domaines.ts` (REF-01 §02).
 *
 * Profil standard (REF-01 §03) : les quatre domaines restent présents l'un sous l'autre ; choisir un domaine le rend
 * actif, l'inscrit dans l'adresse et y porte le focus, sans masquer ni recharger un autre domaine (un geste, un
 * brouillon ou une sauvegarde en cours ne sont jamais abandonnés, NAV-007). Les liens sont des ancres internes : la
 * garde de navigation ne les traite pas comme une sortie de la variante. Aucune nouvelle commande n'est créée : le
 * choix de planche exécute la bascule existante « Vue 3D » (Maj+D) et les accès du domaine Documentation lancent les
 * commandes existantes « Feuille » (Maj+P) et « Feuilles et dossier » (Ctrl+Maj+D), avec leur icône et leur raccourci.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { studioScenes, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { ariaRaccourci, COMMANDES_EDITEUR, libelleRaccourci, type CommandeEditeur, type IdCommandeEditeur } from "../planche2d/raccourcis";
import { TYPES_RENDU } from "../vue3d/scenes/scenes-ui";
import { definitionDomaine, DOMAINES_STUDIO, idSectionDomaine, PLANCHES_STUDIO, type DomaineStudio, type PlancheStudio } from "./domaines";
import "./domaines.css";

export function NavigationDomaines({ actif, surChoix }: { actif: DomaineStudio; surChoix: (id: DomaineStudio) => void }) {
  return <nav className="studio-domaines" aria-label="Domaines du Studio" data-studio-domaines>
    <ol>
      {DOMAINES_STUDIO.map((d) => <li key={d.id}>
        <a href={`#${idSectionDomaine(d.id)}`} aria-current={d.id === actif ? "true" : undefined} title={d.responsabiliteFR} data-studio-domaine-lien={d.id}
          onClick={(e) => { e.preventDefault(); surChoix(d.id); }}>
          <span className="studio-domaine-numero" aria-hidden="true">{d.numero}</span><span>{d.libelleFR}</span>
        </a>
      </li>)}
    </ol>
  </nav>;
}

/**
 * Section d'un domaine. `titreVisible` faux : titre réservé aux technologies d'assistance (Dessin et modélisation,
 * dont la planche doit rester dans la moitié haute de l'écran ; la légende de la planche nomme déjà le domaine).
 */
export function SectionDomaine({ id, actif, titreVisible = true, children }: { id: DomaineStudio; actif: boolean; titreVisible?: boolean; children: ReactNode }) {
  const d = definitionDomaine(id);
  const titre = `${idSectionDomaine(id)}-titre`;
  return <section id={idSectionDomaine(id)} className={`studio-domaine studio-domaine-${id}`} data-studio-domaine={id} data-studio-domaine-actif={actif ? "" : undefined} aria-labelledby={titre}>
    {titreVisible
      ? <header className="studio-domaine-entete"><h2 id={titre} tabIndex={-1}><span className="studio-domaine-numero" aria-hidden="true">{d.numero}</span><span>{d.libelleFR}</span></h2><p>{d.responsabiliteFR}</p></header>
      : <h2 id={titre} className="sr-only" tabIndex={-1}>{d.libelleFR}</h2>}
    {children}
  </section>;
}

/** Choix de la planche active : deux boutons enfoncés ou non, qui exécutent la bascule existante « Vue 3D » (Maj+D). */
export function SelecteurPlanche({ active, surChoix }: { active: PlancheStudio; surChoix: (p: PlancheStudio) => void }) {
  const bascule = COMMANDES_EDITEUR.find((c) => c.id === "vue-3d")!;
  return <span className="studio-planches" role="group" aria-label="Planches" data-studio-planches>
    {PLANCHES_STUDIO.map((p) => <button key={p.id} type="button" aria-pressed={p.id === active} aria-keyshortcuts={ariaRaccourci(bascule.raccourci)} title={`Basculer de planche : ${libelleRaccourci(bascule.raccourci)}`}
      data-studio-planche={p.id} onClick={() => { if (p.id !== active) surChoix(p.id); }}>{p.libelleFR}</button>)}
  </span>;
}

/**
 * Domaine Visualisation, rendu et immersion : scènes enregistrées dans le document et types de rendu (mêmes données
 * que le panneau « Scènes, apparence et rendus » de la vue 3D, qui reste le lieu de leur édition et du rendu).
 */
export function ApercuVisualisation({ doc, surExaminer }: { doc: StudioDocument; surExaminer: () => void }) {
  const scenes = studioScenes(doc);
  return <div className="studio-domaine-corps" data-studio-visualisation-apercu data-studio-scenes-nombre={scenes.length}>
    <h3>Scènes enregistrées</h3>
    {scenes.length ? <ul className="studio-domaine-liste">{scenes.map((s) => <li key={s.id} translate="no" data-studio-apercu-scene={s.id}>{s.name}</li>)}</ul> : <p>Aucune scène enregistrée.</p>}
    <h3>Rendus</h3>
    <ul className="studio-domaine-liste">{TYPES_RENDU.map((r) => <li key={r.id} data-studio-apercu-rendu={r.id} data-studio-disponible={r.disponible ? "oui" : "non"}><span>{r.libelle}</span> <small>{r.disponible ? "Disponible" : "Non disponible"}</small></li>)}</ul>
    <p className="studio-hint">Les scènes, l’apparence et le rendu du modèle se règlent sur la vue 3D du modèle.</p>
    <button type="button" onClick={surExaminer} data-studio-examiner-3d>Examiner sur la vue 3D</button>
  </div>;
}

/** Accès du domaine Documentation : commandes existantes (icône et raccourci de la barre) et publications de l'étude. */
export function AccesDocumentation({ commandes, disponible, surCommande, publications }: {
  commandes: readonly IdCommandeEditeur[];
  disponible: (c: CommandeEditeur) => boolean;
  surCommande: (id: IdCommandeEditeur) => void;
  /** Adresse de l'étude, où vivent les publications (manifeste, approbation, diffusion). */
  publications: string;
}) {
  return <div className="studio-domaine-acces" data-studio-documentation-acces>
    {commandes.map((id) => {
      const c = COMMANDES_EDITEUR.find((x) => x.id === id)!;
      return <button key={id} type="button" disabled={!disponible(c)} aria-keyshortcuts={ariaRaccourci(c.raccourci)} onClick={() => surCommande(id)} data-studio-domaine-commande={id}>
        <Icon name={c.iconeSymbolique} size={16} /> <span>{c.libelleFR}</span> <kbd aria-hidden="true">{libelleRaccourci(c.raccourci)}</kbd>
      </button>;
    })}
    <Link to={publications} data-studio-publications-etude>Publications de l’étude</Link>
  </div>;
}
