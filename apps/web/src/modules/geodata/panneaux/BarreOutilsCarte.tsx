/**
 * Barre d'outils verticale **flottante** de la carte GeoData (organisation inspirée de Kharita) : placée à droite par
 * défaut, déplaçable par sa poignée (souris, doigt ou flèches du clavier), bornée à la carte ; sa position est un confort
 * mémorisé dans ce navigateur seulement. Outils : zoom, nord, position,
 * plein écran, mesures, zone, annotation, libellés (Alt+L), mini-carte (Alt+M), légende, impression (Alt+I), lecture de
 * l'emprise (D-GD-40) : synthèse de la vue (Alt+V), regroupement des points (Alt+G), adresse de la vue (Alt+K). Icônes tracées ici (module isolé). Chaque bouton a un nom accessible
 * et une infobulle ; les outils de tracé sont des bascules (aria-pressed) et retournent à la navigation au second appui.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { OutilCarte } from "../carte/moteur";

/** Position de la barre : écarts au bord droit et au bord haut de la carte (px), pour rester ancrée à droite. */
export interface PositionBarre { readonly droite: number; readonly haut: number }
export const POSITION_PAR_DEFAUT: PositionBarre = { droite: 10, haut: 10 };
const CLE_POSITION = "geodata.barre-outils";

/** Hauteur toujours réservée à la colonne (poignée + deux boutons) : une colonne déjà réduite par sa hauteur maximale ne
 * laisse jamais descendre la barre jusqu'à s'effondrer à zéro (revue de la PR L2). */
export const HAUTEUR_UTILE_MIN = 96;
/** Borne la position pour que la barre reste entière dans la carte (marge de 4 px), avec au moins HAUTEUR_UTILE_MIN visibles. */
export function bornerPosition(p: PositionBarre, carte: { largeur: number; hauteur: number }, barre: { largeur: number; hauteur: number }): PositionBarre {
  const borne = (v: number, max: number) => Math.round(Math.min(Math.max(4, v), Math.max(4, max)));
  const reserve = Math.max(barre.hauteur, HAUTEUR_UTILE_MIN);
  return { droite: borne(p.droite, carte.largeur - barre.largeur - 4), haut: borne(p.haut, carte.hauteur - reserve - 4) };
}
/** Largeur réservée au panneau d'un groupe (largeur minimale 230 px et marge de 8 px, `.gd-panneau-groupe`). */
export const LARGEUR_PANNEAU_GROUPE = 238;
/**
 * Côté d'ouverture du panneau d'un groupe (revue de la PR #487) : à gauche de la barre s'il y a la place dans la carte,
 * sinon à droite (barre déplacée contre le bord gauche) ; jamais hors de la carte.
 */
export function placementPanneauGroupe(p: PositionBarre, largeurBarre: number, largeurCarte: number): { right: number } | { left: number } {
  const aGauche = largeurCarte - p.droite - largeurBarre - 8;
  return aGauche >= LARGEUR_PANNEAU_GROUPE || largeurCarte <= 0 ? { right: p.droite + largeurBarre + 8 } : { left: Math.max(4, largeurCarte - p.droite + 8) };
}
const lirePosition = (): PositionBarre => {
  try { const v = JSON.parse(window.localStorage.getItem(CLE_POSITION) ?? "null") as PositionBarre | null; return v && Number.isFinite(v.droite) && Number.isFinite(v.haut) ? v : POSITION_PAR_DEFAUT; } catch { return POSITION_PAR_DEFAUT; }
};
const ecrirePosition = (p: PositionBarre | null) => { try { if (p) window.localStorage.setItem(CLE_POSITION, JSON.stringify(p)); else window.localStorage.removeItem(CLE_POSITION); } catch { /* confort perdu */ } };

export const ICONES = {
  zoomPlus: "M12 5v14M5 12h14",
  zoomMoins: "M5 12h14",
  nord: "M12 3l5 16-5-4-5 4 5-16Z",
  position: "M12 2v4m0 12v4M2 12h4m12 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  pleinEcran: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  quitterPleinEcran: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  distance: "M4 18 18 4M4 18l2 2M8 14l2 2M12 10l2 2M16 6l2 2",
  surface: "M5 19 4 7l8-3 8 6-3 9H5Z",
  zone: "M4 4h16v16H4z M4 9h16M9 4v16",
  annotation: "M5 20l4-1 10-10-3-3L6 16l-1 4ZM14 7l3 3",
  legende: "M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10",
  /** Libellés (D-GD-24) : étiquette « T » posée sur un repère. */
  etiquettes: "M6 5h12M12 5v10M8 19h8M12 15v4",
  /** Mini-carte de situation (D-GD-27) : petit cadre dans un grand. */
  miniCarte: "M3 4h18v16H3zM5 13h7v5H5z",
  /** Impression directe (D-GD-27) : imprimante. */
  imprimer: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  /** Synthèse de la vue (D-GD-40) : sigma de la somme, sur un cadre de vue. */
  synthese: "M16 6H8l5 6-5 6h8M3 3h4M17 3h4M3 21h4M17 21h4",
  /** Regroupement des points (D-GD-40) : trois grappes de tailles différentes. */
  grappes: "M4 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M11 16a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  /** Adresse de la vue (D-GD-40) : maillons d'une chaîne. */
  lien: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  /** Groupe « Mesurer et tracer » (P5) : règle et crayon. */
  groupeMesurer: "M3 17 17 3l4 4L7 21H3v-4ZM7 13l2 2M10 10l2 2M13 7l2 2",
  /** Groupe « Affichage » (P5) : œil. */
  groupeAffichage: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  /** Aide « Raccourcis clavier » (P5) : clavier. */
  aide: "M3 7h18v10H3zM6 10h1M9 10h1M12 10h1M15 10h1M18 10h0M7 14h10",
  /** P13 : analyse de site (repère et cercle de lecture). */
  site: "M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10ZM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 21h18",
} as const;

/** Groupes de la colonne (P5, décisions D3 et D4) : bouton de divulgation et lettres d'accès dans le groupe ouvert. */
export type GroupeOutils = "mesurer" | "affichage";
export const LETTRES_GROUPES: Readonly<Record<GroupeOutils, Readonly<Record<string, string>>>> = {
  mesurer: { distance: "D", surface: "S", zone: "Z", annotation: "A" },
  affichage: { nord: "N", "plein-ecran": "F", position: "P", etiquettes: "L", "mini-carte": "M", regrouper: "G", legende: "E", synthese: "V", imprimer: "I", lien: "K", site: "Q", aide: "?" },
};
/** Bascules qui laissent le groupe ouvert (enchaîner plusieurs réglages) ; toute autre entrée le referme. */
const BASCULES = new Set(["etiquettes", "mini-carte", "regrouper"]);

/** Raccourcis des commandes de la barre (Alt + lettre), contrôlés par test : une commande, une touche. */
/** Dérivée de la table unique des raccourcis (P3). */
export { RACCOURCIS_BARRE } from "../raccourcis";
import { RACCOURCIS_BARRE } from "../raccourcis";

function Pictogramme({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

export interface ActionsBarreCarte {
  outil: OutilCarte;
  pleinEcran: boolean;
  legendeOuverte: boolean;
  /** Libellés affichés sur toutes les couches vectorielles visibles ; `null` = aucune couche ne peut en avoir. */
  etiquettes: boolean | null;
  miniCarte: boolean;
  carteDisponible: boolean;
  onZoom(delta: 1 | -1): void;
  onNord(): void;
  onPosition(): void;
  onPleinEcran(): void;
  onOutil(o: OutilCarte): void;
  onLegende(): void;
  onEtiquettes(): void;
  onMiniCarte(): void;
  onImprimer(): void;
  /** Synthèse de la vue ouverte (D-GD-40). */
  synthese: boolean;
  onSynthese(): void;
  /** Points de toutes les couches de points visibles regroupés ; `null` = aucune couche de points visible. */
  regroupement: boolean | null;
  onRegroupement(): void;
  onCopierLien(): void;
  /** Analyse de site (P13) : volet « Site », lieu = fiche ouverte ou centre de la carte. */
  onSite(): void;
  site: boolean;
  /** Groupe ouvert (P5) ; un seul à la fois. */
  groupe: GroupeOutils | null;
  onGroupe(g: GroupeOutils | null): void;
  /** Aide « Raccourcis clavier » (P5). */
  onAide(): void;
  /** Placement de la barre dans la carte (position et taille), signalé à chaque changement : la mini-barre de recherche la suit. */
  onPlacement?(r: { droite: number; haut: number; largeur: number; hauteur: number }): void;
}

export function BarreOutilsCarte(p: ActionsBarreCarte) {
  const barre = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<PositionBarre>(lirePosition);
  const glisse = useRef<{ x: number; y: number; depart: PositionBarre } | null>(null);
  const borner = (q: PositionBarre) => {
    const el = barre.current?.parentElement;
    const parent = el?.getBoundingClientRect();
    const b = barre.current?.getBoundingClientRect();
    // Hauteur utile : la marge basse de la carte est occupée par la barre du bas au téléphone (lot Design L2).
    const utile = parent && el ? parent.height - (parseFloat(getComputedStyle(el).paddingBottom) || 0) : 0;
    return parent && b ? bornerPosition(q, { largeur: parent.width, hauteur: utile }, { largeur: b.width, hauteur: b.height }) : q;
  };
  // Carte redimensionnée (rotation, plein écran) : la barre reste visible.
  useEffect(() => {
    const ajuster = () => setPosition((q) => borner(q));
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Placement signalé (position, taille) : au montage, après chaque déplacement et quand la taille change.
  const placement = useRef(p.onPlacement);
  placement.current = p.onPlacement;
  useEffect(() => {
    const nav = barre.current;
    if (!nav) return;
    const signaler = () => placement.current?.({ droite: position.droite, haut: position.haut, largeur: nav.offsetWidth, hauteur: nav.offsetHeight });
    signaler();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(signaler) : null;
    ro?.observe(nav);
    return () => ro?.disconnect();
  }, [position]);
  const deplacer = (q: PositionBarre) => { const r = borner(q); setPosition(r); return r; };
  const poignee = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); glisse.current = { x: e.clientX, y: e.clientY, depart: position }; },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => { const g = glisse.current; if (g) deplacer({ droite: g.depart.droite - (e.clientX - g.x), haut: g.depart.haut + (e.clientY - g.y) }); },
    onPointerUp: () => { if (glisse.current) { glisse.current = null; setPosition((q) => { ecrirePosition(q); return q; }); } },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const pas = e.shiftKey ? 40 : 10;
      const d = ({ ArrowLeft: [pas, 0], ArrowRight: [-pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] } as Record<string, [number, number]>)[e.key];
      if (!d) return;
      e.preventDefault();
      ecrirePosition(deplacer({ droite: position.droite + d[0], haut: position.haut + d[1] }));
    },
    onDoubleClick: () => { ecrirePosition(null); setPosition(borner(POSITION_PAR_DEFAUT)); },
  };
  const groupeOuvert = p.groupe;
  const panneauxGroupes = useRef<HTMLDivElement>(null);
  const panneauOuvert = () => panneauxGroupes.current?.querySelector<HTMLDivElement>(`[data-gd-panneau-groupe='${groupeOuvert}']`) ?? null;
  // Groupe ouvert : le focus va sur sa première entrée active (WCAG 2.4.3).
  useEffect(() => { if (groupeOuvert) panneauOuvert()?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }, [groupeOuvert]);
  const fermerGroupe = (rendreFocus: boolean) => {
    const g = groupeOuvert;
    p.onGroupe(null);
    if (rendreFocus && g) barre.current?.querySelector<HTMLButtonElement>(`[data-gd-groupe='${g}']`)?.focus();
  };
  const bouton = (cle: string, libelle: string, d: string, action: () => void, extra: { pressed?: boolean; disabled?: boolean } = {}) => {
    const raccourci = (RACCOURCIS_BARRE as Record<string, string>)[cle];
    // Entrée d'un groupe ouvert : icône et texte visibles, lettre d'accès à droite (P5).
    const g = (Object.keys(LETTRES_GROUPES) as GroupeOutils[]).find((x) => LETTRES_GROUPES[x][cle]);
    const lettre = g ? LETTRES_GROUPES[g][cle] : undefined;
    if (lettre) {
      const activer = () => { action(); if (!BASCULES.has(cle)) fermerGroupe(false); };
      return <button key={cle} type="button" className="gd-entree-groupe" title={libelle} aria-label={libelle} onClick={activer} aria-pressed={extra.pressed} disabled={extra.disabled} aria-keyshortcuts={raccourci ?? lettre} data-gd-barre-outil={cle} data-gd-lettre={lettre}>
        <Pictogramme d={d} /><span className="gd-entree-texte">{libelle}</span><kbd aria-hidden="true">{lettre}</kbd>
      </button>;
    }
    return <button key={cle} type="button" className="gd-outil" title={libelle} aria-label={libelle} onClick={action} aria-pressed={extra.pressed} disabled={extra.disabled} aria-keyshortcuts={raccourci} data-gd-barre-outil={cle}><Pictogramme d={d} /></button>;
  };
  const trace = (o: Exclude<OutilCarte, "navigation">, libelle: string, d: string) => bouton(o, libelle, d, () => p.onOutil(p.outil === o ? "navigation" : o), { pressed: p.outil === o, disabled: !p.carteDisponible });
  const boutonGroupe = (g: GroupeOutils, nom: string, legende: string, touche: string, d: string) => (
    <button type="button" className="gd-outil gd-bouton-groupe" title={`${nom} (${touche})`} aria-label={nom} aria-expanded={groupeOuvert === g} aria-controls={`gd-groupe-${g}`} aria-keyshortcuts={touche}
      onClick={() => p.onGroupe(groupeOuvert === g ? null : g)} data-gd-groupe={g}>
      <Pictogramme d={d} /><span className="gd-legende-groupe" aria-hidden="true">{legende}</span>
    </button>
  );
  // Dans le groupe ouvert : flèches haut / bas, lettre d'accès, Échap (ferme et rend le focus au bouton du groupe).
  const toucheGroupe = (e: KeyboardEvent<HTMLDivElement>) => {
    const entrees = [...(panneauOuvert()?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const i = entrees.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermerGroupe(true); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); entrees[(i + (e.key === "ArrowDown" ? 1 : -1) + entrees.length) % entrees.length]?.focus(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
    const cible = entrees.find((b) => b.dataset["gdLettre"] === e.key.toUpperCase() || b.dataset["gdLettre"] === e.key);
    if (cible) { e.preventDefault(); e.stopPropagation(); cible.click(); }
  };
  return (
    <>
    <nav ref={barre} className="gd-barre-outils" aria-label="Outils de la carte" style={{ right: position.droite, top: position.haut, maxHeight: `calc(100% - ${position.haut}px - var(--gd-barre-bas, 0px) - 4px)` }} data-gd-barre-outils>
      <button type="button" className="gd-poignee" title="Déplacer la barre d'outils (glisser ou flèches ; double-clic : position par défaut)" aria-label="Déplacer la barre d'outils" {...poignee} data-gd-poignee>
        <svg viewBox="0 0 24 24" width="18" height="10" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="7" cy="9" r="1.6" /><circle cx="12" cy="9" r="1.6" /><circle cx="17" cy="9" r="1.6" /><circle cx="7" cy="15" r="1.6" /><circle cx="12" cy="15" r="1.6" /><circle cx="17" cy="15" r="1.6" /></svg>
      </button>
      <div className="gd-groupe-outils">
        {bouton("zoom-plus", "Zoom avant", ICONES.zoomPlus, () => p.onZoom(1), { disabled: !p.carteDisponible })}
        {bouton("zoom-moins", "Zoom arrière", ICONES.zoomMoins, () => p.onZoom(-1), { disabled: !p.carteDisponible })}
      </div>
      <div className="gd-groupe-outils">
        {boutonGroupe("mesurer", "Mesurer et tracer", "Mesurer", "Alt+N", ICONES.groupeMesurer)}
        {boutonGroupe("affichage", "Affichage", "Affichage", "Alt+A", ICONES.groupeAffichage)}
      </div>
    </nav>
    {/* Panneaux des groupes (P5) : toujours montés, masqués quand le groupe est fermé (états lisibles, un seul ouvert). */}
    <div ref={panneauxGroupes} onKeyDown={toucheGroupe}>
      <div id="gd-groupe-mesurer" className="gd-panneau-groupe" role="group" aria-label="Mesurer et tracer" hidden={groupeOuvert !== "mesurer"}
        style={{ ...placementPanneauGroupe(position, barre.current?.offsetWidth ?? 52, barre.current?.parentElement?.clientWidth ?? 0), top: position.haut }} data-gd-panneau-groupe="mesurer">
          {trace("distance", "Mesurer une distance", ICONES.distance)}
          {trace("surface", "Mesurer une surface", ICONES.surface)}
          {trace("zone", "Tracer une zone d'étude", ICONES.zone)}
          {trace("annotation", "Poser une annotation", ICONES.annotation)}
        </div>
      <div id="gd-groupe-affichage" className="gd-panneau-groupe" role="group" aria-label="Affichage" hidden={groupeOuvert !== "affichage"}
        style={{ ...placementPanneauGroupe(position, barre.current?.offsetWidth ?? 52, barre.current?.parentElement?.clientWidth ?? 0), top: position.haut }} data-gd-panneau-groupe="affichage">
          <p className="gd-titre-section">Vue</p>
          {bouton("nord", "Remettre le nord en haut", ICONES.nord, p.onNord, { disabled: !p.carteDisponible })}
          {bouton("position", "Ma position (ni enregistrée ni envoyée au serveur)", ICONES.position, p.onPosition, { disabled: !p.carteDisponible })}
          {bouton("plein-ecran", p.pleinEcran ? "Quitter le plein écran" : "Plein écran", p.pleinEcran ? ICONES.quitterPleinEcran : ICONES.pleinEcran, p.onPleinEcran, { pressed: p.pleinEcran })}
          <p className="gd-titre-section">Sur la carte</p>
          {bouton("etiquettes", p.etiquettes ? "Masquer les libellés (Alt+L)" : "Afficher les libellés (Alt+L)", ICONES.etiquettes, p.onEtiquettes, { pressed: !!p.etiquettes, disabled: !p.carteDisponible || p.etiquettes === null })}
          {bouton("mini-carte", p.miniCarte ? "Masquer la mini-carte de situation (Alt+M)" : "Afficher la mini-carte de situation (Alt+M)", ICONES.miniCarte, p.onMiniCarte, { pressed: p.miniCarte, disabled: !p.carteDisponible })}
          {bouton("regrouper", p.regroupement ? "Afficher chaque point seul (Alt+G)" : "Regrouper les points (Alt+G)", ICONES.grappes, p.onRegroupement, { pressed: !!p.regroupement, disabled: !p.carteDisponible || p.regroupement === null })}
          <p className="gd-titre-section">Lire et partager</p>
          {bouton("legende", "Légende", ICONES.legende, p.onLegende, { pressed: p.legendeOuverte })}
          {bouton("synthese", p.synthese ? "Fermer la synthèse de la vue (Alt+V)" : "Synthèse de la vue (Alt+V)", ICONES.synthese, p.onSynthese, { pressed: p.synthese, disabled: !p.carteDisponible })}
          {bouton("imprimer", "Imprimer la carte (Alt+I)", ICONES.imprimer, p.onImprimer, { disabled: !p.carteDisponible })}
          {bouton("lien", "Copier l'adresse de cette vue (Alt+K)", ICONES.lien, p.onCopierLien)}
          {bouton("site", "Que sait-on d'ici ? (Alt+Q)", ICONES.site, p.onSite, { pressed: p.site })}
          <button type="button" className="gd-entree-groupe" title="Raccourcis clavier (?)" onClick={() => { fermerGroupe(false); p.onAide(); }} aria-keyshortcuts="? Shift+Slash" data-gd-lettre="?" data-gd-aide-ouvrir>
            <Pictogramme d={ICONES.aide} /><span className="gd-entree-texte">Raccourcis clavier</span><kbd aria-hidden="true">?</kbd>
          </button>
        </div>
    </div>
    </>
  );
}
