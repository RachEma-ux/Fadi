/**
 * Mini-barre de la carte GeoData : une barre verticale **indépendante** de la barre d'outils, au même style, qui porte de
 * haut en bas la loupe (« Rechercher », Alt+R), « Enregistrer » (disquette : la même action que le bouton Enregistrer
 * de la barre au-dessus de la carte, D-GD-36) et « Fond de carte » (couches : liste flottante des mêmes fonds que le
 * sélecteur Fond, fournie par la page — jamais recopiée ; le fond actif est coché, un clic l'applique et ferme la liste). Elle se place sous la barre d'outils, séparée d'elle par l'écart de
 * ses groupes, et la suit quand celle-ci est déplacée ; elle ne recouvre jamais l'échelle ni les mentions de sources en
 * bas à droite (sinon elle se range à gauche du bas de la barre d'outils). La loupe ouvre une barre de recherche
 * flottante, à gauche de la mini-barre et alignée sur la loupe : même champ, même bouton, mêmes résultats que l'ancienne
 * barre au-dessus de la carte — la logique (requête, choix d'un résultat, recadrage) reste dans la page. Fermeture :
 * Échap, nouvel appui sur la loupe ou clic sur la carte ; le texte saisi est gardé par la page.
 *
 * D-GD-38 : ordre Loupe, Enregistrer, ≡ « Navigation administrative », Fond. ≡ plie ou déplie le fil de navigation
 * administrative (composant `BarreTerritoriale` fourni par la page, réutilisé tel quel) dans un panneau flottant à gauche
 * de la mini-barre, aligné sur ≡. Plié, le fil reste monté (caché) : il suit la sélection et se retrouve à jour. Un clic
 * sur la carte ne le ferme pas (il met le fil à jour) ; ≡ ou Échap le ferment. Un seul panneau (recherche, fil, fonds)
 * ouvert à la fois : l'état est tenu par la page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
/** Disquette en contour : corps à coin coupé, étiquette du haut avec volet, étiquette du bas. */
const DISQUETTE = "M6 3h10.5L20 6.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 3v3.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3M13 4.5V6M8 21v-5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V21M8 17.5h8";
/** Fond de carte : deux plans superposés surmontés d'un repère de localisation, en contour. */
const FOND = "M8.3 11.9 2.5 14.6 12 19.1l9.5-4.5-5.8-2.7M2.5 18 12 22.5l9.5-4.5M12 14.6s4.6-4.3 4.6-7.9a4.6 4.6 0 0 0-9.2 0c0 3.6 4.6 7.9 4.6 7.9ZM12 5a1.7 1.7 0 1 0 0 3.4A1.7 1.7 0 0 0 12 5Z";
/** Fil de navigation administrative : trois traits décroissants (même tracé que l'icône du fil). */
const NAVIGATION = "M4 6h16M7 12h13M10 18h10";
const Picto = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;

/** Un choix de fond tel que la page le calcule pour le sélecteur « Fond » (même source pour la liste de la mini-barre). */
export interface ChoixFond { readonly valeur: string; readonly cle: string; readonly libelle: string; readonly desactive: boolean }

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
  /**
   * Enregistrer : la fonction `enregistrer()` de la page, sa condition d'activation, l'état d'enregistrement (pastille
   * « Carte non enregistrée » tant que la carte n'est pas enregistrée, D-GD-37) et le nom de la carte ouverte.
   */
  enregistrement: { libelle: string; desactive: boolean; onEnregistrer(): void; etat: string; etatLibelle: string; carteNom: string | null };
  /** Fonds : mêmes choix que le sélecteur « Fond », fond actif, application d'un fond ; liste ouverte (état de la page). */
  fonds: { choix: readonly ChoixFond[]; actif: string; onChoisir(id: string): void; ouverts: boolean; onBasculer(ouverts: boolean): void };
  /** Fil de navigation administrative (D-GD-38) : déplié ou plié (état de la page) et le fil lui-même. */
  navigation: { ouverte: boolean; onBasculer(ouverte: boolean): void; contenu: ReactNode };
}

export function BarreRecherche(p: ProprietesRecherche) {
  const mini = useRef<HTMLElement>(null);
  const loupe = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const boutonFond = useRef<HTMLButtonElement>(null);
  const listeFonds = useRef<HTMLUListElement>(null);
  const fondsOuverts = p.fonds.ouverts;
  const setFondsOuverts = p.fonds.onBasculer;
  const boutonNavigation = useRef<HTMLButtonElement>(null);
  const panneauNavigation = useRef<HTMLDivElement>(null);
  const [decalageFond, setDecalageFond] = useState(0);
  const [decalageNavigation, setDecalageNavigation] = useState(0);
  const [largeurCarte, setLargeurCarte] = useState(0);
  const [hauteurCarte, setHauteurCarte] = useState(0);
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
    const d = boutonFond.current?.offsetTop ?? 0;
    setDecalageFond((a) => (a === d ? a : d));
    setHauteurCarte((a) => (a === dims.hauteur ? a : dims.hauteur));
    setLargeurCarte((a) => (a === dims.largeur ? a : dims.largeur));
    const dn = boutonNavigation.current?.offsetTop ?? 0;
    setDecalageNavigation((a) => (a === dn ? a : dn));
  };
  useLayoutEffect(() => mesurer.current(), [p.outils, p.ouverte, fondsOuverts, p.navigation.ouverte]);
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

  // Une seule liste flottante à la fois : tenu par la page (un seul panneau ouvert).
  // Liste des fonds : focus sur le fond actif ; un clic sur la carte la referme (le clic garde son effet sur la carte).
  useEffect(() => {
    if (!fondsOuverts) return;
    (listeFonds.current?.querySelector<HTMLButtonElement>("button[aria-pressed='true']") ?? listeFonds.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
    const surCarte = (e: PointerEvent) => { if ((e.target as Element | null)?.closest?.("[data-gd-moteur]")) setFondsOuverts(false); };
    document.addEventListener("pointerdown", surCarte, true);
    return () => document.removeEventListener("pointerdown", surCarte, true);
  }, [fondsOuverts]);
  const fermerFonds = () => { setFondsOuverts(false); boutonFond.current?.focus(); };
  const basculerFonds = () => { if (fondsOuverts) fermerFonds(); else setFondsOuverts(true); };
  const fermerNavigation = () => { p.navigation.onBasculer(false); boutonNavigation.current?.focus(); };
  // Fil déplié : le focus va à son premier contrôle actif.
  useEffect(() => {
    if (p.navigation.ouverte) panneauNavigation.current?.querySelector<HTMLElement>("select:not(:disabled), button:not(:disabled)")?.focus();
  }, [p.navigation.ouverte]);

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
            <Picto d={LOUPE} />
          </button>
          {(() => {
            const e = p.enregistrement;
            // Pastille tant que la carte n'est pas enregistrée (nouvelle, modifiée, en conflit ou en erreur).
            const pastille = e.etat !== "enregistree" && e.etat !== "enregistrement";
            return (
              <button type="button" className="gd-outil gd-outil-pastille" title={pastille ? "Carte non enregistrée" : e.libelle} aria-label={e.libelle} aria-describedby="gd-etat-enregistrement" disabled={e.desactive} onClick={e.onEnregistrer}
                data-gd-mini-enregistrer data-gd-etat-enregistrement={e.etat} data-gd-carte-nom={e.carteNom ?? ""}>
                <Picto d={DISQUETTE} />
                {pastille && <span className="gd-pastille" title="Carte non enregistrée" aria-hidden="true" data-gd-pastille-non-enregistree />}
                <span id="gd-etat-enregistrement" className="sr-only">{e.etatLibelle}</span>
              </button>
            );
          })()}
          <button ref={boutonNavigation} type="button" className="gd-outil" title="Navigation administrative" aria-label="Navigation administrative" aria-expanded={p.navigation.ouverte} aria-controls="gd-navigation-flottante"
            onClick={() => (p.navigation.ouverte ? fermerNavigation() : p.navigation.onBasculer(true))} data-gd-mini-navigation>
            <Picto d={NAVIGATION} />
          </button>
          <button ref={boutonFond} type="button" className="gd-outil" title="Fond de carte" aria-label="Fond de carte" aria-expanded={fondsOuverts} aria-controls="gd-fonds-flottants" onClick={basculerFonds} data-gd-mini-fond data-gd-fond-actif={p.fonds.actif}>
            <Picto d={FOND} />
          </button>
        </div>
      </nav>
      {/* Fil de navigation : toujours monté (il suit la sélection), affiché seulement déplié, à gauche de la mini-barre et
          aligné sur ≡ ; sur la largeur disponible, jamais sur la mini-barre. */}
      <div ref={panneauNavigation} id="gd-navigation-flottante" className="gd-navigation-flottante" role="group" aria-label="Navigation administrative" hidden={!p.navigation.ouverte || !panneau}
        style={panneau ? {
          ...(panneau.gauche + panneau.largeur <= largeurCarte - (place?.droite ?? 0) - (mini.current?.offsetWidth ?? 0)
            ? { right: largeurCarte - panneau.gauche - panneau.largeur, maxWidth: panneau.gauche + panneau.largeur - 4 }
            : { left: panneau.gauche, maxWidth: largeurCarte - panneau.gauche - 4 }),
          // ≡ dans la moitié basse de la carte : le fil s'ouvre vers le haut (bas aligné sur ≡), jamais sur l'échelle ni les sources.
          ...(panneau.resultatsVersLeHaut ? { bottom: Math.max(4, hauteurCarte - (panneau.haut + decalageNavigation + (boutonNavigation.current?.offsetHeight ?? 40))) } : { top: panneau.haut + decalageNavigation }),
        } : undefined}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermerNavigation(); } }} data-gd-navigation-flottante data-gd-navigation-ouverte={p.navigation.ouverte ? "oui" : "non"}>
        {p.navigation.contenu}
      </div>
      {fondsOuverts && panneau && (
        <div id="gd-fonds-flottants" className="gd-fonds-flottants" role="group" aria-label="Fond de carte" style={{ left: panneau.gauche + Math.max(0, panneau.largeur - 300), width: Math.min(300, panneau.largeur),
            // Bouton dans la moitié basse de la carte : la liste s'ouvre vers le haut (bas aligné sur le bouton), jamais hors de la carte.
            ...(panneau.resultatsVersLeHaut ? { bottom: Math.max(4, hauteurCarte - (panneau.haut + decalageFond + (boutonFond.current?.offsetHeight ?? 40))) } : { top: panneau.haut + decalageFond }) }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermerFonds(); } }} data-gd-fonds-flottants>
          <ul ref={listeFonds}>
            {p.fonds.choix.map((f) => (
              <li key={f.cle}>
                <button type="button" disabled={f.desactive} aria-pressed={!f.desactive && f.valeur === p.fonds.actif} onClick={() => { p.fonds.onChoisir(f.valeur); fermerFonds(); }} data-gd-fond-choix={f.desactive ? undefined : f.valeur}>
                  <span className="gd-coche" aria-hidden="true">{!f.desactive && f.valeur === p.fonds.actif ? "✓" : ""}</span>{f.libelle}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
