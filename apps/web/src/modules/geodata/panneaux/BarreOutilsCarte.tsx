/**
 * Barre d'outils verticale **flottante** de la carte GeoData (organisation inspirée de Kharita) : placée à droite par
 * défaut, déplaçable par sa poignée (souris, doigt ou flèches du clavier), bornée à la carte ; sa position est un confort
 * mémorisé dans ce navigateur seulement. Outils : zoom, nord, position,
 * plein écran, mesures, zone, annotation, libellés (Alt+L), mini-carte (Alt+M), légende, impression (Alt+I), lecture de
 * l'emprise (D-GD-39) : synthèse de la vue (Alt+V), regroupement des points (Alt+G), adresse de la vue (Alt+K). Icônes tracées ici (module isolé). Chaque bouton a un nom accessible
 * et une infobulle ; les outils de tracé sont des bascules (aria-pressed) et retournent à la navigation au second appui.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { OutilCarte } from "../carte/moteur";

/** Position de la barre : écarts au bord droit et au bord haut de la carte (px), pour rester ancrée à droite. */
export interface PositionBarre { readonly droite: number; readonly haut: number }
export const POSITION_PAR_DEFAUT: PositionBarre = { droite: 10, haut: 10 };
const CLE_POSITION = "geodata.barre-outils";

/** Borne la position pour que la barre reste entière dans la carte (marge de 4 px). */
export function bornerPosition(p: PositionBarre, carte: { largeur: number; hauteur: number }, barre: { largeur: number; hauteur: number }): PositionBarre {
  const borne = (v: number, max: number) => Math.round(Math.min(Math.max(4, v), Math.max(4, max)));
  return { droite: borne(p.droite, carte.largeur - barre.largeur - 4), haut: borne(p.haut, carte.hauteur - barre.hauteur - 4) };
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
  /** Synthèse de la vue (D-GD-39) : sigma de la somme, sur un cadre de vue. */
  synthese: "M16 6H8l5 6-5 6h8M3 3h4M17 3h4M3 21h4M17 21h4",
  /** Regroupement des points (D-GD-39) : trois grappes de tailles différentes. */
  grappes: "M4 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M11 16a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  /** Adresse de la vue (D-GD-39) : maillons d'une chaîne. */
  lien: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
} as const;

/** Raccourcis des commandes de la barre (Alt + lettre), contrôlés par test : une commande, une touche. */
export const RACCOURCIS_BARRE = { etiquettes: "Alt+L", "mini-carte": "Alt+M", imprimer: "Alt+I", synthese: "Alt+V", regrouper: "Alt+G", lien: "Alt+K" } as const;

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
  /** Synthèse de la vue ouverte (D-GD-39). */
  synthese: boolean;
  onSynthese(): void;
  /** Points de toutes les couches de points visibles regroupés ; `null` = aucune couche de points visible. */
  regroupement: boolean | null;
  onRegroupement(): void;
  onCopierLien(): void;
  /** Placement de la barre dans la carte (position et taille), signalé à chaque changement : la mini-barre de recherche la suit. */
  onPlacement?(r: { droite: number; haut: number; largeur: number; hauteur: number }): void;
}

export function BarreOutilsCarte(p: ActionsBarreCarte) {
  const barre = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<PositionBarre>(lirePosition);
  const glisse = useRef<{ x: number; y: number; depart: PositionBarre } | null>(null);
  const borner = (q: PositionBarre) => {
    const parent = barre.current?.parentElement?.getBoundingClientRect();
    const b = barre.current?.getBoundingClientRect();
    return parent && b ? bornerPosition(q, { largeur: parent.width, hauteur: parent.height }, { largeur: b.width, hauteur: b.height }) : q;
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
  const bouton = (cle: string, libelle: string, d: string, action: () => void, extra: { pressed?: boolean; disabled?: boolean } = {}) => {
    const raccourci = (RACCOURCIS_BARRE as Record<string, string>)[cle];
    return <button key={cle} type="button" className="gd-outil" title={libelle} aria-label={libelle} onClick={action} aria-pressed={extra.pressed} disabled={extra.disabled} aria-keyshortcuts={raccourci} data-gd-barre-outil={cle}><Pictogramme d={d} /></button>;
  };
  const trace = (o: Exclude<OutilCarte, "navigation">, libelle: string, d: string) => bouton(o, libelle, d, () => p.onOutil(p.outil === o ? "navigation" : o), { pressed: p.outil === o, disabled: !p.carteDisponible });
  return (
    <nav ref={barre} className="gd-barre-outils" aria-label="Outils de la carte" style={{ right: position.droite, top: position.haut }} data-gd-barre-outils>
      <button type="button" className="gd-poignee" title="Déplacer la barre d'outils (glisser ou flèches ; double-clic : position par défaut)" aria-label="Déplacer la barre d'outils" {...poignee} data-gd-poignee>
        <svg viewBox="0 0 24 24" width="18" height="10" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="7" cy="9" r="1.6" /><circle cx="12" cy="9" r="1.6" /><circle cx="17" cy="9" r="1.6" /><circle cx="7" cy="15" r="1.6" /><circle cx="12" cy="15" r="1.6" /><circle cx="17" cy="15" r="1.6" /></svg>
      </button>
      <div className="gd-groupe-outils">
        {bouton("zoom-plus", "Zoom avant", ICONES.zoomPlus, () => p.onZoom(1), { disabled: !p.carteDisponible })}
        {bouton("zoom-moins", "Zoom arrière", ICONES.zoomMoins, () => p.onZoom(-1), { disabled: !p.carteDisponible })}
        {bouton("nord", "Remettre le nord en haut", ICONES.nord, p.onNord, { disabled: !p.carteDisponible })}
        {bouton("position", "Ma position (ni enregistrée ni envoyée au serveur)", ICONES.position, p.onPosition, { disabled: !p.carteDisponible })}
        {bouton("plein-ecran", p.pleinEcran ? "Quitter le plein écran" : "Plein écran", p.pleinEcran ? ICONES.quitterPleinEcran : ICONES.pleinEcran, p.onPleinEcran, { pressed: p.pleinEcran })}
      </div>
      <div className="gd-groupe-outils">
        {trace("distance", "Mesurer une distance", ICONES.distance)}
        {trace("surface", "Mesurer une surface", ICONES.surface)}
        {trace("zone", "Tracer une zone d'étude", ICONES.zone)}
        {trace("annotation", "Poser une annotation", ICONES.annotation)}
      </div>
      <div className="gd-groupe-outils">
        {bouton("etiquettes", p.etiquettes ? "Masquer les libellés (Alt+L)" : "Afficher les libellés (Alt+L)", ICONES.etiquettes, p.onEtiquettes, { pressed: !!p.etiquettes, disabled: !p.carteDisponible || p.etiquettes === null })}
        {bouton("mini-carte", p.miniCarte ? "Masquer la mini-carte de situation (Alt+M)" : "Afficher la mini-carte de situation (Alt+M)", ICONES.miniCarte, p.onMiniCarte, { pressed: p.miniCarte, disabled: !p.carteDisponible })}
        {bouton("legende", "Légende", ICONES.legende, p.onLegende, { pressed: p.legendeOuverte })}
        {bouton("imprimer", "Imprimer la carte (Alt+I)", ICONES.imprimer, p.onImprimer, { disabled: !p.carteDisponible })}
        {bouton("synthese", p.synthese ? "Fermer la synthèse de la vue (Alt+V)" : "Synthèse de la vue (Alt+V)", ICONES.synthese, p.onSynthese, { pressed: p.synthese, disabled: !p.carteDisponible })}
        {bouton("regrouper", p.regroupement ? "Afficher chaque point seul (Alt+G)" : "Regrouper les points (Alt+G)", ICONES.grappes, p.onRegroupement, { pressed: !!p.regroupement, disabled: !p.carteDisponible || p.regroupement === null })}
        {bouton("lien", "Copier l'adresse de cette vue (Alt+K)", ICONES.lien, p.onCopierLien)}
      </div>
    </nav>
  );
}
