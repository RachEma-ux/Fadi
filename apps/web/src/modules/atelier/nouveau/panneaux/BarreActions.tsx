/**
 * Barre d'actions flottante (D-195, lot B) : Annuler, Rétablir, Cadrer — en Planche, Annuler / Rétablir du brouillon
 * local et Détacher. Elle flotte au-dessus du dessin sans jamais le redimensionner (position fixe), se déplace
 * librement par sa poignée (souris, doigt — capture du pointeur —, flèches au clavier, Maj : plus vite) et reste
 * toujours entière dans la zone visible : ramenée au relâchement, au redimensionnement, à la rotation et sous le
 * clavier virtuel (zone visuelle). Position par défaut : le coin bas droit de la zone de dessin (au-dessus de la barre
 * d'état, hors colonne de panneaux), recalculée tant que l'utilisateur ne l'a pas déplacée. Sa position et son
 * affichage sont mémorisés sur l'appareil (préférences de l'état d'interface) ; ⚙ la remet en place. Rendue par
 * l'Atelier (Plan, 3D, Documents) ou par la Planche, dans sa porte : elle suit le détachement dans l'autre fenêtre.
 * Les raccourcis (Ctrl Z, Ctrl Maj Z, 0) restent le chemin principal.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { etatUi, useEtatUi } from "../etat-ui";
import { t } from "../messages";
import { borner, pasClavier, positionParDefaut, type Position, type Taille, type Zone } from "./barre-actions-position";

export interface ActionBarre {
  id: string;
  /** Pictogramme affiché (texte court). */
  picto: string;
  /** Nom lu (lecteur d'écran) ; infobulle à défaut de `titre`. */
  libelle: string;
  titre?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  /** Attributs de test (`data-…`). */
  attributs?: Record<string, string>;
  /** Libellé visible à côté du pictogramme (Cadrer, Détacher) ; sinon pictogramme seul. */
  texte?: string;
}

export interface PropsBarreActions {
  annuler: ActionBarre;
  retablir: ActionBarre;
  autres?: readonly ActionBarre[];
  /** Zone de dessin : la position par défaut est son coin bas droit. Sans référence, celui de la fenêtre. */
  reference?: React.RefObject<HTMLElement | null>;
  /** Éléments de la zone à ne pas recouvrir par défaut (sélecteurs dans la référence) : en bas (barre d'état), à droite (colonne). */
  reserve?: { bas?: string; droite?: string };
  /** Change quand la barre change de fenêtre (Planche détachée) : les écouteurs de redimensionnement sont reposés. */
  fenetreCle?: string;
}

/** Zone visible de la fenêtre qui porte `el` (zone visuelle quand elle existe : clavier virtuel, zoom). */
function zoneDe(el: Element): Zone {
  const w = el.ownerDocument.defaultView ?? window;
  const vv = w.visualViewport;
  return vv ? { largeur: vv.width, hauteur: vv.height, gauche: vv.offsetLeft, haut: vv.offsetTop } : { largeur: w.innerWidth, hauteur: w.innerHeight };
}

function tailleDe(el: HTMLElement): Taille {
  const r = el.getBoundingClientRect();
  return { largeur: r.width, hauteur: r.height };
}

export function BarreActions({ annuler, retablir, autres = [], reference, reserve, fenetreCle = "" }: PropsBarreActions) {
  const ui = useEtatUi();
  const racine = useRef<HTMLDivElement | null>(null);
  // Position pendant un glisser (non mémorisée avant le relâchement) ; null = position mémorisée ou par défaut.
  const [glisser, setGlisser] = useState<Position | null>(null);
  // Position par défaut calculée sur la zone de dessin (coin bas droit), tant que rien n'est mémorisé.
  const [defaut, setDefaut] = useState<Position | null>(null);
  const depart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const reserveBas = reserve?.bas;
  const reserveDroite = reserve?.droite;

  const memoriser = useCallback((pos: Position) => {
    const courante = etatUi.get().barreActions;
    if (!courante || pos.x !== courante.x || pos.y !== courante.y) etatUi.set({ barreActions: pos });
  }, []);

  /** Position courante en coordonnées de fenêtre (mémorisée, ou lue sur l'écran pour la position par défaut). */
  const positionCourante = useCallback((): Position => {
    const m = etatUi.get().barreActions;
    if (m) return m;
    const r = racine.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  }, []);

  /** Coin bas droit de la zone de dessin, hors réserves, ramené dans la fenêtre. */
  const calculerDefaut = useCallback((): Position | null => {
    const el = racine.current;
    if (!el) return null;
    const taille = tailleDe(el);
    const fenetre = zoneDe(el);
    const ref = reference?.current;
    const r = ref?.getBoundingClientRect();
    let zone: Zone = fenetre;
    let bas = 0;
    if (ref && r && r.width > 0 && r.height > 0) {
      zone = { gauche: r.left, haut: r.top, largeur: r.width, hauteur: r.height };
      // Réserves : tous les éléments visibles (rectangle non vide) désignés par le sélecteur.
      const rects = (sel?: string) => (sel ? Array.from(ref.querySelectorAll(sel)).map((e) => e.getBoundingClientRect()).filter((q) => q.width > 0 && q.height > 0) : []);
      for (const q of rects(reserveBas)) bas = Math.max(bas, r.bottom - q.top);
      // La colonne ne compte que si elle descend jusqu'à la hauteur de la barre.
      for (const rd of rects(reserveDroite)) if (rd.bottom > r.bottom - bas - taille.hauteur - 16) zone = { ...zone, largeur: Math.max(taille.largeur, Math.min(zone.largeur, rd.left - r.left)) };
    }
    return borner(positionParDefaut(taille, zone, bas), taille, fenetre);
  }, [reference, reserveBas, reserveDroite]);

  /** Replace la barre : la position mémorisée est ramenée dans l'écran, la position par défaut est recalculée. */
  const replacer = useCallback(() => {
    const el = racine.current;
    if (!el) return;
    const m = etatUi.get().barreActions;
    if (m) {
      const b = borner(m, tailleDe(el), zoneDe(el));
      if (b.x !== m.x || b.y !== m.y) etatUi.set({ barreActions: b });
    } else {
      const d = calculerDefaut();
      if (d) setDefaut((prev) => (prev && prev.x === d.x && prev.y === d.y ? prev : d));
    }
  }, [calculerDefaut]);

  const memorisee = ui.barreActions !== null;
  useLayoutEffect(() => {
    replacer();
  }, [replacer, fenetreCle, ui.barreActionsVisible, memorisee, autres.length]);

  // Redimensionnement, rotation, clavier virtuel, zone de dessin qui change : la barre reste dans la zone visible de SA
  // fenêtre, et la position par défaut suit le dessin.
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const w = el.ownerDocument.defaultView ?? window;
    const vv = w.visualViewport;
    w.addEventListener("resize", replacer);
    w.addEventListener("orientationchange", replacer);
    // Défilement de la page (téléphone : l'en-tête se replie) : la position par défaut suit la zone de dessin.
    w.addEventListener("scroll", replacer, { passive: true });
    vv?.addEventListener("resize", replacer);
    vv?.addEventListener("scroll", replacer);
    const ref = reference?.current;
    const observateur = ref && typeof w.ResizeObserver === "function" ? new w.ResizeObserver(() => replacer()) : null;
    if (ref) {
      observateur?.observe(ref);
      // Les réserves (pied, colonne) changent de taille avec l'outil actif : la position par défaut les suit.
      for (const sel of [reserveBas, reserveDroite]) for (const el of sel ? Array.from(ref.querySelectorAll(sel)) : []) observateur?.observe(el);
    }
    return () => {
      w.removeEventListener("resize", replacer);
      w.removeEventListener("orientationchange", replacer);
      w.removeEventListener("scroll", replacer);
      vv?.removeEventListener("resize", replacer);
      vv?.removeEventListener("scroll", replacer);
      observateur?.disconnect();
    };
  }, [replacer, reference, reserveBas, reserveDroite, fenetreCle, ui.barreActionsVisible]);

  const surPointeur = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const p = positionCourante();
    depart.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlisser(p);
    e.preventDefault();
  };
  const surDeplacement = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = depart.current;
    const el = racine.current;
    if (!d || !el) return;
    setGlisser(borner({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, tailleDe(el), zoneDe(el)));
  };
  const surRelachement = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = depart.current;
    const el = racine.current;
    depart.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setGlisser(null);
    if (!d || !el) return;
    memoriser(borner({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, tailleDe(el), zoneDe(el)));
  };
  const surClavier = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const pas = pasClavier(e.key, e.shiftKey);
    const el = racine.current;
    if (!pas || !el) return;
    e.preventDefault();
    const p = positionCourante();
    memoriser(borner({ x: p.x + pas.x, y: p.y + pas.y }, tailleDe(el), zoneDe(el)));
  };

  if (!ui.barreActionsVisible) return null;
  const pos = glisser ?? ui.barreActions ?? defaut;
  const style = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: "auto", bottom: "auto" } : undefined;
  const bouton = (a: ActionBarre) => (
    <button key={a.id} type="button" onClick={a.onClick} disabled={a.disabled} aria-pressed={a.pressed} title={a.titre ?? a.libelle} aria-label={a.texte ? a.libelle : undefined} data-action={a.id} {...a.attributs}>
      <span aria-hidden="true" className="barre-actions-picto">{a.picto}</span>
      {a.texte ? <span className="barre-actions-texte" aria-hidden="true">{a.texte}</span> : <span className="sr-only">{a.libelle}</span>}
    </button>
  );
  return (
    <div ref={racine} className={`barre-actions${glisser ? " en-glisser" : ""}`} role="toolbar" aria-label={t("actions.barre")} style={style} data-barre-actions data-position={ui.barreActions ? "memorisee" : "defaut"}>
      <button
        type="button"
        className="barre-actions-poignee"
        aria-label={t("actions.deplacer")}
        title={t("actions.deplacer.aide")}
        data-barre-actions-poignee
        onPointerDown={surPointeur}
        onPointerMove={surDeplacement}
        onPointerUp={surRelachement}
        onPointerCancel={surRelachement}
        onKeyDown={surClavier}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <div className="barre-groupe" role="group" aria-label="Annuler et rétablir">
        {bouton(annuler)}
        {bouton(retablir)}
      </div>
      {autres.map(bouton)}
    </div>
  );
}
