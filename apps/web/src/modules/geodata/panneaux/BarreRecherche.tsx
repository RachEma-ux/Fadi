/**
 * Mini-barre de recherche de la carte GeoData : une barre verticale **indépendante** de la barre d'outils, au même style,
 * qui ne porte qu'une loupe (« Rechercher », Alt+R). Elle se place sous la barre d'outils, séparée d'elle par l'écart de
 * ses groupes, et la suit quand celle-ci est déplacée ; elle ne recouvre jamais l'échelle ni les mentions de sources en
 * bas à droite (sinon elle se range à gauche du bas de la barre d'outils). La loupe ouvre une barre de recherche
 * flottante, à gauche de la mini-barre et alignée sur la loupe : même champ, même bouton, mêmes résultats que l'ancienne
 * barre au-dessus de la carte — la logique (requête, choix d'un résultat, recadrage) reste dans la page. Fermeture :
 * Échap, nouvel appui sur la loupe ou clic sur la carte ; le texte saisi est gardé par la page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ResultatRecherche } from "../client";

/** Écart entre deux groupes de la barre d'outils (px), repris entre la barre d'outils et la mini-barre. */
export const ECART_GROUPES = 8;
/** Largeur de la barre flottante sur un grand écran (px) ; plus étroite, la carte lui donne toute la place disponible. */
export const LARGEUR_RECHERCHE = 380;
/** En deçà de cette place à gauche de la mini-barre, la barre flottante s'ouvre à sa droite. */
const PLACE_MINIMALE = 220;

/** Barre d'outils telle que placée dans la carte : écarts au bord droit et au bord haut, et sa taille (px). */
export interface PlacementOutils { readonly droite: number; readonly haut: number; readonly largeur: number; readonly hauteur: number }
export interface Dimensions { readonly largeur: number; readonly hauteur: number }

/**
 * Place la mini-barre (écarts au bord droit et au bord haut de la carte) : sous la barre d'outils, au même bord droit ;
 * si la place manque au-dessus des contrôles du bas (échelle, sources, `reserveBas`), à côté du bas de la barre d'outils —
 * à sa gauche, ou à sa droite quand elle est collée au bord gauche — et toujours entière dans la carte.
 */
export function placerMiniBarre(outils: PlacementOutils, carte: Dimensions, mini: Dimensions, reserveBas: number): { droite: number; haut: number } {
  const hautMax = carte.hauteur - reserveBas - mini.hauteur - 4;
  const dessous = outils.haut + outils.hauteur + ECART_GROUPES;
  if (dessous <= hautMax) return { droite: outils.droite, haut: dessous };
  const haut = Math.max(4, Math.min(outils.haut + outils.hauteur - mini.hauteur, hautMax));
  // À gauche de la barre d'outils s'il y a la place, sinon à sa droite ; toujours entière dans la carte.
  const aGauche = outils.droite + outils.largeur + ECART_GROUPES;
  const aDroite = outils.droite - ECART_GROUPES - mini.largeur;
  const droiteMax = Math.max(4, carte.largeur - mini.largeur - 4);
  const droite = aGauche <= droiteMax ? aGauche : aDroite >= 4 ? aDroite : Math.min(Math.max(4, aGauche), droiteMax);
  return { droite, haut };
}

/**
 * Place la barre flottante, alignée sur la loupe : à gauche de la mini-barre (toute la place disponible, au plus
 * `LARGEUR_RECHERCHE`) ; à sa droite si la place manque à gauche. `resultatsVersLeHaut` quand la loupe est dans la moitié
 * basse de la carte. Positions en écarts aux bords gauche et haut de la carte.
 */
export function placerRecherche(mini: { droite: number; haut: number } & Dimensions, carte: Dimensions): { gauche: number; haut: number; largeur: number; resultatsVersLeHaut: boolean } {
  const bordGaucheMini = carte.largeur - mini.droite - mini.largeur;
  const placeGauche = bordGaucheMini - ECART_GROUPES - 4;
  const placeDroite = mini.droite - ECART_GROUPES - 4;
  const resultatsVersLeHaut = mini.haut > carte.hauteur / 2;
  if (placeGauche >= PLACE_MINIMALE || placeGauche >= placeDroite) {
    const largeur = Math.max(0, Math.min(LARGEUR_RECHERCHE, placeGauche));
    return { gauche: bordGaucheMini - ECART_GROUPES - largeur, haut: mini.haut, largeur, resultatsVersLeHaut };
  }
  const largeur = Math.max(0, Math.min(LARGEUR_RECHERCHE, placeDroite));
  return { gauche: carte.largeur - mini.droite + ECART_GROUPES, haut: mini.haut, largeur, resultatsVersLeHaut };
}

const LOUPE = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4";

export interface ProprietesRecherche {
  /** Placement de la barre d'outils (null tant qu'elle n'est pas mesurée). */
  outils: PlacementOutils | null;
  ouverte: boolean;
  onBasculer(ouverte: boolean): void;
  texte: string;
  onTexte(t: string): void;
  onLancer(): void;
  resultats: ResultatRecherche[] | null;
  avis: string | null;
  onChoisir(r: ResultatRecherche): void;
  onFermerResultats(): void;
}

export function BarreRecherche(p: ProprietesRecherche) {
  const mini = useRef<HTMLElement>(null);
  const loupe = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<{ droite: number; haut: number } | null>(null);
  const [panneau, setPanneau] = useState<ReturnType<typeof placerRecherche> | null>(null);

  // Mesure : carte, mini-barre et contrôles du bas à droite (échelle, sources) ; refaite quand la barre d'outils bouge
  // ou change de taille, quand la carte est redimensionnée.
  const mesurer = useRef<() => void>(() => undefined);
  const observateur = useRef<ResizeObserver | null>(null);
  const basObserve = useRef<Element | null>(null);
  mesurer.current = () => {
    const m = mini.current, carte = m?.parentElement;
    if (!m || !carte || !p.outils) return;
    const dims = { largeur: carte.clientWidth, hauteur: carte.clientHeight };
    const bas = carte.querySelector<HTMLElement>(".maplibregl-ctrl-bottom-right");
    // Les contrôles du bas (échelle, sources) apparaissent et grandissent quand MapLibre les remplit : suivis dès qu'ils existent.
    if (bas && basObserve.current !== bas) { basObserve.current = bas; observateur.current?.observe(bas); }
    const reserve = bas ? bas.offsetHeight + 4 : 0;
    const taille = { largeur: m.offsetWidth, hauteur: m.offsetHeight };
    const q = placerMiniBarre(p.outils, dims, taille, reserve);
    setPlace((a) => (a && a.droite === q.droite && a.haut === q.haut ? a : q));
    const r = placerRecherche({ ...q, ...taille }, dims);
    setPanneau((a) => (a && a.gauche === r.gauche && a.haut === r.haut && a.largeur === r.largeur && a.resultatsVersLeHaut === r.resultatsVersLeHaut ? a : r));
  };
  useLayoutEffect(() => mesurer.current(), [p.outils, p.ouverte]);
  useEffect(() => {
    const carte = mini.current?.parentElement;
    const refaire = () => mesurer.current();
    window.addEventListener("resize", refaire);
    const ro = carte && typeof ResizeObserver !== "undefined" ? new ResizeObserver(refaire) : null;
    observateur.current = ro;
    if (carte) ro?.observe(carte);
    // Contrôles du bas créés par MapLibre après le montage : la mesure les retrouve et les suit.
    const mo = carte && typeof MutationObserver !== "undefined" ? new MutationObserver(refaire) : null;
    if (carte) mo?.observe(carte, { childList: true, subtree: true });
    refaire();
    return () => { window.removeEventListener("resize", refaire); ro?.disconnect(); mo?.disconnect(); observateur.current = null; basObserve.current = null; };
  }, []);

  // Ouverture : le curseur va dans le champ. Un clic sur la carte referme la barre (le clic garde son effet sur la carte).
  useEffect(() => {
    if (!p.ouverte) return;
    champ.current?.focus();
    const surCarte = (e: PointerEvent) => { if ((e.target as Element | null)?.closest?.("[data-gd-moteur]")) p.onBasculer(false); };
    document.addEventListener("pointerdown", surCarte, true);
    return () => document.removeEventListener("pointerdown", surCarte, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.ouverte]);

  const fermer = () => { p.onBasculer(false); loupe.current?.focus(); };
  const clavier = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    fermer();
  };

  return (
    <>
      <nav ref={mini} className="gd-barre-recherche" aria-label="Recherche sur la carte" style={place ? { right: place.droite, top: place.haut } : { visibility: "hidden" }} data-gd-barre-recherche>
        <div className="gd-groupe-outils">
          <button ref={loupe} type="button" className="gd-outil" title="Rechercher (Alt+R)" aria-label="Rechercher" aria-expanded={p.ouverte} aria-controls="gd-recherche-flottante" onClick={() => (p.ouverte ? fermer() : p.onBasculer(true))} data-gd-loupe>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={LOUPE} /></svg>
          </button>
        </div>
      </nav>
      {p.ouverte && panneau && (
        <form id="gd-recherche-flottante" className={`gd-recherche gd-recherche-flottante${panneau.resultatsVersLeHaut ? " gd-resultats-haut" : ""}`} role="search" style={{ left: panneau.gauche, top: panneau.haut, width: panneau.largeur }}
          onKeyDown={clavier} onSubmit={(e) => { e.preventDefault(); p.onLancer(); }} data-gd-recherche-flottante>
          <label className="sr-only" htmlFor="gd-recherche">Rechercher un territoire</label>
          <input ref={champ} id="gd-recherche" type="search" placeholder="Commune, région, code, ou lon … lat …" value={p.texte} onChange={(e) => p.onTexte(e.target.value)} autoComplete="off" data-gd-recherche />
          <button type="submit">Rechercher</button>
          {(p.resultats || p.avis) && (
            <div className="gd-resultats" role="region" aria-label="Résultats de la recherche">
              {p.avis && <p className="gd-discret">{p.avis}</p>}
              <ul>{p.resultats?.map((r, i) => <li key={i}><button type="button" onClick={() => p.onChoisir(r)} data-gd-resultat={r.type === "unite" ? r.code : "coordonnees"}><strong translate="no">{r.libelle}</strong><span className="gd-discret" translate="no">{r.type === "unite" ? `${r.coucheTitre}${r.niveau ? ` · ${r.niveau}` : ""}` : r.provenance}</span></button></li>)}</ul>
              <button type="button" onClick={p.onFermerResultats}>Fermer les résultats</button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
