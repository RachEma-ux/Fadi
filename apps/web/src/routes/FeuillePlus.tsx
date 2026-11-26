/**
 * Feuille « Plus » (chantier Design, lots L5-L7 ; `ai/reprise-barre-bas.md` § 1.2) : `<dialog>` modal, titre, Fermer
 * (48 × 48) ; focus au titre à l'ouverture, piégé par le navigateur, rendu au déclencheur à la fermeture ; fermeture par
 * Fermer, Échap, appui sur le voile, Retour (une entrée d'historique est poussée à l'ouverture) et choix d'une entrée
 * (l'entrée poussée est alors remplacée par la page choisie, le focus va au contenu). Sur GeoData, une section
 * « Navigation principale » précède les autres (la barre GeoData remplace la barre globale, lot L7).
 */
import { useEffect, useRef, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { entreesBarre, type CleEntree, type EntreeNavigation } from "./navigation-entrees";

const ETAT_HISTORIQUE = "fdFeuillePlus";

export function FeuillePlus(p: { entrees: EntreeNavigation[]; active: CleEntree | null; navigationPrincipale: boolean; nom: string; declencheur: HTMLElement | null; onFermer(): void; onDeconnexion(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const fermer = useRef(p.onFermer);
  fermer.current = p.onFermer;
  const choisi = useRef(false);
  const pousse = useRef(false);
  const sortie = useRef<number | undefined>(undefined);
  useEffect(() => {
    const dialog = ref.current;
    const declencheur = p.declencheur;
    // Mode strict (développement) : le démontage simulé est annulé par le remontage immédiat ; un seul état poussé.
    window.clearTimeout(sortie.current);
    if (!dialog?.open) dialog?.showModal();
    titre.current?.focus();
    if (!pousse.current) { window.history.pushState({ ...(window.history.state ?? {}), [ETAT_HISTORIQUE]: true }, ""); pousse.current = true; }
    const retour = () => fermer.current();
    window.addEventListener("popstate", retour);
    return () => {
      window.removeEventListener("popstate", retour);
      sortie.current = window.setTimeout(() => {
        dialog?.close();
        // Fermée autrement que par Retour ou par un choix : l'entrée poussée est retirée.
        if (!choisi.current && window.history.state?.[ETAT_HISTORIQUE]) window.history.back();
        if (choisi.current) document.getElementById("workspace-content")?.focus();
        else declencheur?.focus();
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choisir = (e: MouseEvent<HTMLAnchorElement>, cible: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    choisi.current = true;
    navigate(cible, { replace: !!window.history.state?.[ETAT_HISTORIQUE] });
    fermer.current();
  };
  const lien = (e: EntreeNavigation) => <li key={e.cle}><a href={e.cible} className="fd-feuille-entree" aria-current={p.active === e.cle ? "page" : undefined} data-fd-entree={e.cle} onClick={(ev) => choisir(ev, e.cible)}>
    <Icon name={e.icone} size={22} /><span translate={e.marque ? "no" : undefined}>{e.libelle}</span>
  </a></li>;
  return <dialog ref={ref} id="fd-feuille-plus" className="fd-feuille-plus" aria-labelledby="fd-feuille-plus-titre" data-fd-feuille-plus
    onCancel={(e) => { e.preventDefault(); fermer.current(); }}
    onClick={(e) => { if (e.target === ref.current) fermer.current(); }}>
    <div className="fd-feuille-corps">
      <header className="fd-feuille-tete"><h2 id="fd-feuille-plus-titre" ref={titre} tabIndex={-1}>Plus</h2><button type="button" className="fd-feuille-fermer" aria-label="Fermer" onClick={() => fermer.current()}><span aria-hidden="true">×</span></button></header>
      {p.navigationPrincipale && <section aria-labelledby="fd-feuille-principale"><h3 id="fd-feuille-principale">Navigation principale</h3><ul>{entreesBarre().map(lien)}</ul></section>}
      <ul>{p.entrees.map(lien)}</ul>
      <footer className="fd-feuille-compte"><p translate="no">{p.nom}</p><button type="button" className="fd-feuille-entree" onClick={p.onDeconnexion}>Se déconnecter</button></footer>
    </div>
  </dialog>;
}
