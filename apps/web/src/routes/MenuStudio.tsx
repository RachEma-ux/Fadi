/**
 * Entrée « Studio » de la barre latérale de Fadi (NAV-001) et son menu dépliable des quatre domaines (REF-01 §02 :
 * « 01 · Dessin et modélisation », « 02 · BIM et coordination », « 03 · Visualisation, rendu et immersion »,
 * « 04 · Documentation, métrés et collaboration » — ni ajout, ni renommage, ni abréviation ; `DOMAINES_STUDIO`).
 *
 * - Accès permanents : « Accueil Studio » (`/studio` : reprise suggérée, choix explicite, nouvelle étude) et « Choisir
 *   une étude » (études du projet affiché, sinon l'accueil), en plus des quatre domaines.
 * - « Studio » reste un lien vers `/studio` (accueil, jamais de redirection automatique), actif sur toutes les routes
 *   Studio ; son chevron (bouton `aria-expanded`, flèches droite / gauche) déplie ou replie les quatre entrées, comme
 *   « Projets › ». Barre repliée : chaque entrée montre son numéro, nom exact en infobulle et en nom accessible.
 * - Chaque entrée ouvre l'espace de travail de ce domaine : dans la variante affichée (même adresse, `?domaine=`,
 *   révision et commentaires gardés, sans garde de navigation : on ne quitte pas la variante) ; sinon par l'accueil
 *   (`/studio?domaine=`), qui propose la dernière variante autorisée (suggestion vérifiée par le serveur) et le choix
 *   explicite d'une variante, ouverte ensuite dans ce domaine.
 * - L'entrée du domaine affiché porte `aria-current="page"` (même lecture de l'adresse que l'espace) ; les Planches 2D
 *   et 3D ne sont pas des entrées : elles restent dans la barre du domaine 01.
 *
 * N'importe de Studio que les définitions et le contrat d'adresse (purs, sans moteur) : la barre latérale reste légère.
 */
import { useState, type KeyboardEvent } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import { DOMAINES_STUDIO, domaineDeLAdresse, libelleNumeroteDomaine, type DomaineStudio } from "../modules/studio/domaines/definitions";
import { cheminAccueilStudio, cheminProjetStudio, cheminVarianteStudio, estRouteStudio, lireRouteStudio } from "../modules/studio/routes-studio";

/** Adresse d'une entrée de domaine et domaine affiché, d'après l'adresse courante. */
export function cibleDomaineStudio(pathname: string, search: string, d: DomaineStudio): { href: string; memeVariante: boolean } {
  const r = lireRouteStudio(pathname, search);
  if (r.vue === "variante") {
    return { href: cheminVarianteStudio(r.projectId, r.studyId, r.variantId, r.revisionId, { commentaires: r.commentaires, domaine: d, planche: d === "dessin" ? r.planche : null }), memeVariante: true };
  }
  return { href: cheminAccueilStudio({ domaine: d }), memeVariante: false };
}

export function domaineAfficheStudio(pathname: string, search: string): DomaineStudio | null {
  const r = lireRouteStudio(pathname, search);
  return r.vue === "variante" ? domaineDeLAdresse(r.domaine, r.commentaires) : null;
}

/** « Choisir une étude » : les études du projet affiché, sinon l'accueil (choix du projet, de l'étude, de la variante). */
export function choixEtudesStudio(pathname: string, search: string): { href: string; courant: boolean } {
  const r = lireRouteStudio(pathname, search);
  if (r.vue === "projet") return { href: cheminProjetStudio(r.projectId), courant: true };
  if (r.vue === "etude" || r.vue === "variante" || r.vue === "comparer") return { href: cheminProjetStudio(r.projectId), courant: false };
  return { href: cheminAccueilStudio(), courant: false };
}

export function MenuStudio({ surNavigation }: { surNavigation?: () => void }) {
  const { pathname, search } = useLocation();
  const dansStudio = estRouteStudio(pathname);
  const [ouvert, setOuvert] = useState(dansStudio);
  const affiche = domaineAfficheStudio(pathname, search);
  const etudes = choixEtudesStudio(pathname, search);
  const touches = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" && !ouvert) { e.preventDefault(); setOuvert(true); }
    if (e.key === "ArrowLeft" && ouvert) { e.preventDefault(); setOuvert(false); }
  };
  return <div className="sidebar-studio" data-studio-menu-lateral data-ouvert={ouvert ? "" : undefined}>
    <div className="sidebar-studio-tete">
      <NavLink to="/studio" className={({ isActive }) => isActive ? "active" : undefined} title="Studio" aria-label="Studio" data-nav-studio onClick={surNavigation}><Icon name="studio" /><span className="sidebar-label">Studio</span></NavLink>
      <button type="button" className="sidebar-studio-bascule" aria-expanded={ouvert} aria-controls="studio-menu-domaines" onClick={() => setOuvert((o) => !o)} onKeyDown={touches}
        aria-label={ouvert ? "Replier les domaines du Studio" : "Déplier les domaines du Studio"} title={ouvert ? "Replier les domaines du Studio" : "Déplier les domaines du Studio"} data-studio-menu-lateral-bascule>
        <Icon name="chevron-right" size={14} />
      </button>
    </div>
    <div id="studio-menu-domaines" className="sidebar-studio-sous-menu" hidden={!ouvert}>
    <ul className="sidebar-studio-acces" aria-label="Accès Studio">
      <li><Link to={cheminAccueilStudio()} aria-current={pathname === "/studio" ? "page" : undefined} title="Accueil Studio" aria-label="Accueil Studio" data-studio-menu-accueil onClick={surNavigation}>
        <Icon name="home" size={16} /><span className="sidebar-label">Accueil Studio</span></Link></li>
      <li><Link to={etudes.href} aria-current={etudes.courant ? "page" : undefined} title="Choisir une étude" aria-label="Choisir une étude" data-studio-menu-etudes onClick={surNavigation}>
        <Icon name="folder" size={16} /><span className="sidebar-label">Choisir une étude</span></Link></li>
    </ul>
    <ul className="sidebar-studio-domaines" aria-label="Domaines du Studio">
      {DOMAINES_STUDIO.map((d) => {
        const { href, memeVariante } = cibleDomaineStudio(pathname, search, d.id);
        const nom = libelleNumeroteDomaine(d);
        return <li key={d.id}>
          <Link to={href} aria-current={affiche === d.id ? "page" : undefined} title={nom} aria-label={nom} data-studio-menu-domaine={d.id}
            data-studio-sans-garde={memeVariante ? "" : undefined} onClick={surNavigation}>
            <span className="sidebar-studio-numero" aria-hidden="true">{d.numero}</span><span className="sidebar-label">{d.libelleFR}</span>
          </Link>
        </li>;
      })}
    </ul>
    </div>
  </div>;
}
