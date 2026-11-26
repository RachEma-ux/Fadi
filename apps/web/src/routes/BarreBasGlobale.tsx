/**
 * Barre du bas de Fadi au téléphone (chantier Design, lots L5-L6 ; `ai/reprise-barre-bas.md` § 1).
 * Accueil · Projets · Studio · GeoData · Plus, même ordre pour tous les rôles ; rendue après le contenu (ordre DOM = ordre
 * visuel) ; visible seulement sous 700 px (CSS), le rail l'est au-dessus : un seul des deux dans l'arbre d'accessibilité.
 */
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { entreesBarre, type CleEntree } from "./navigation-entrees";

export interface ProprietesBarreBas {
  active: CleEntree | null;
  /** Libellé de la page courante quand elle est dans « Plus » (indicateur + description du bouton). */
  pageDansPlus: string | null;
  plusOuvert: boolean;
  onPlus(): void;
}

export const BarreBasGlobale = forwardRef<HTMLElement, ProprietesBarreBas>(function BarreBasGlobale(p, ref) {
  return <nav ref={ref} id="fd-navigation-bas" className="fd-barre-bas" aria-label="Navigation principale" data-fd-barre-bas tabIndex={-1}>
    {entreesBarre().map((e) => <Link key={e.cle} to={e.cible} className="fd-barre-bas-entree" aria-current={p.active === e.cle ? "page" : undefined} data-fd-entree={e.cle}>
      <Icon name={e.icone} size={24} /><span translate={e.marque ? "no" : undefined}>{e.libelle}</span>
    </Link>)}
    <button type="button" className="fd-barre-bas-entree" data-fd-entree="plus" data-page-dans-plus={p.pageDansPlus ? "" : undefined} aria-haspopup="dialog" aria-expanded={p.plusOuvert} aria-controls="fd-feuille-plus" aria-describedby={p.pageDansPlus ? "fd-plus-page" : undefined} onClick={p.onPlus}>
      <Icon name="plus" size={24} /><span>Plus</span>
      {p.pageDansPlus && <span id="fd-plus-page" className="sr-only">{`Page actuelle : ${p.pageDansPlus}`}</span>}
    </button>
  </nav>;
});
