/**
 * Gestes de la planche 2D (outil Sélection et vue) : zoom à la molette centré sur le pointeur, panoramique (bouton du
 * milieu, Espace + glisser, deux doigts, pincement), rectangle fenêtre / capture, glisser de la sélection (aperçu
 * pendant le geste, une commande `studio.dessin.deplacer` par objet au relâchement), et point posé : moteur
 * d'accrochage (`../accrochage/`, règles de priorité déterministes : sommets nommés, intersections, perpendiculaire et
 * tangente depuis le dernier point, repérage orthogonal — bascule ou Maj tenue — et polaire, plus proche), sinon la
 * grille, sinon le centimètre ; saisie directe d'une longueur et d'un angle (champ « Mesures »). Les candidats ne sont
 * cherchés que dans la vue, à la tolérance du pointeur. La vue n'est jamais une commande ni une donnée du document.
 */
import { contoursMurs } from "../architecture/architecture-ui";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { StudioDocument, StudioPoint } from "@parcours/atelier-model";
import {
  appliquerSaisie, basculerAccrochage, basculesActives, BASCULES_INITIALES, direction, resoudre, suiviAccrochage,
  type Boite, type EtatBascules, type PointRepere, type ResultatSaisie,
} from "../accrochage";
import { estVisible } from "../calques";
import type { PointPose, RectangleSelection } from "../Dessin2D";
import { CADRE_INITIAL, type Cadre } from "../geometrie-2d";
import { pointPose } from "../accrochage/point-pose";
import type { IdCommandeEditeur, StudioToolId } from "../raccourcis";
import { ajouter, modeRectangle, selectionParRectangle } from "../selection";
import { ecranVersPlanche, facteurMolette, glisserVue, pasGrille, pincer, zoomer, type Rect } from "../vue";
import { ecart } from "./type";
import { mesurerAccrochage, mesurerApercu, mesurerCadrage } from "../../chargement/mesures-studio";

/** Tolérance d'accrochage, en pixels d'écran. */
const ACCROCHE_PX = 12;
/** Au-delà de ce déplacement du pointeur (pixels), un appui devient un geste (rectangle, glisser) et non un clic. */
const SEUIL_GESTE_PX = 4;

type Ecran = { x: number; y: number };
type Geste =
  | { type: "vue"; cadre0: Cadre; rect0: Rect; depart: Map<number, StudioPoint> }
  | { type: "rectangle"; id: number; debut: StudioPoint; ecran: Ecran; ajouter: boolean; actif: boolean }
  | { type: "glisser"; id: number; base: PointPose; ids: string[]; ecran: Ecran; actif: boolean };

/** Zone de contenu du `<svg>` à l'écran (sans sa bordure). */
function rectContenu(svg: SVGSVGElement): Rect {
  const b = svg.getBoundingClientRect();
  return { left: b.left + svg.clientLeft, top: b.top + svg.clientTop, width: svg.clientWidth || b.width, height: svg.clientHeight || b.height };
}

export interface OptionsGestes {
  drawing: StudioDocument | null;
  outil: StudioToolId;
  writable: boolean;
  selectionIds: string[];
  selectionSet: ReadonlySet<string>;
  accrocheSommets: boolean;
  accrocheGrille: boolean;
  /** L'outil pose des points (survol suivi et accroché). */
  pointsActifs: boolean;
  /** Objets exclus de l'accrochage au survol (sélection pendant un déplacement). */
  exclureAuSurvol: ReadonlySet<string> | undefined;
  /** Dernier point posé du tracé en cours (perpendiculaire, tangente, repérage, saisie directe) ; null au repos. */
  base?: StudioPoint | null;
  select: (ids: string[]) => void;
  moveSelection: (ids: readonly string[], dx: number, dy: number) => boolean;
}

export function useGestesPlanche(o: OptionsGestes) {
  const [cadre, setCadre] = useState<Cadre>(CADRE_INITIAL);
  const [survol, setSurvol] = useState<PointRepere | null>(null);
  const [bascules, setBascules] = useState<EtatBascules>(BASCULES_INITIALES);
  // Angle imposé par la saisie (« <45 », degrés) : il vaut pour le point suivant, puis s'efface.
  const [verrouAngle, setVerrouAngle] = useState<number | null>(null);
  const base = o.base ?? null;
  useEffect(() => { setVerrouAngle(null); }, [base?.x, base?.y, base === null]);
  // Index des objets accrochables affichés, recalculé quand le document change (pas à chaque mouvement du pointeur).
  // Index incrémental (C.1-05) : d'une révision à l'autre, seules les formes changées y sont insérées ou retirées.
  const suivi = useRef<ReturnType<typeof suiviAccrochage> | null>(null);
  suivi.current ??= suiviAccrochage();
  const index = useMemo(() => {
    const d = o.drawing;
    // Murs (A.4) : le contour de leur emprise s'accroche comme une polyligne fermée, sous l'identifiant du mur.
    return d ? suivi.current!.indexer([...d.objects.filter((x) => estVisible(d, x.layerId)), ...contoursMurs(d, (l) => estVisible(d, l))]) : null;
  }, [o.drawing]);
  const [rectangle, setRectangle] = useState<RectangleSelection | null>(null);
  const [apercu, setApercu] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const sheet = useRef<SVGSVGElement | null>(null);
  const cadreRef = useRef<Cadre>(CADRE_INITIAL);
  const geste = useRef<Geste | null>(null);
  const pointeurs = useRef(new Map<number, Ecran>());
  const clicSupprime = useRef(false);
  const espace = useRef({ tenu: false, panoramique: false });
  const molette = useRef<(e: WheelEvent) => void>(() => {});
  const pas = pasGrille(cadre);

  // ——— Vue : zoom et panoramique (jamais une commande) ———
  function poserCadre(c: Cadre) { cadreRef.current = c; setCadre(c); mesurerCadrage(); }
  molette.current = (e: WheelEvent) => {
    const svg = sheet.current; if (!svg) return;
    e.preventDefault();
    const c = cadreRef.current;
    poserCadre(zoomer(c, ecranVersPlanche(c, rectContenu(svg), { x: e.clientX, y: e.clientY }), facteurMolette(e.deltaY, e.deltaMode)));
  };
  // La molette doit empêcher le défilement de la page : écouteur natif non passif.
  const ecouteMolette = useRef((e: WheelEvent) => molette.current(e)).current;
  const refPlanche = useCallback((el: SVGSVGElement | null) => {
    sheet.current?.removeEventListener("wheel", ecouteMolette);
    sheet.current = el;
    el?.addEventListener("wheel", ecouteMolette, { passive: false });
  }, [ecouteMolette]);
  function demarrerVue(svg: SVGSVGElement) {
    const cadre0 = cadreRef.current, rect0 = rectContenu(svg);
    geste.current = { type: "vue", cadre0, rect0, depart: new Map([...pointeurs.current].map(([id, s]) => [id, ecranVersPlanche(cadre0, rect0, s)])) };
  }
  function annulerGeste() { geste.current = null; setRectangle(null); setApercu(null); setSurvol(null); }

  // ——— Point posé, accrochage ———
  /** Tolérance d'accrochage dans le repère du document (mètres). */
  function tolerance(): number {
    const matrix = sheet.current?.getScreenCTM();
    return matrix ? ACCROCHE_PX / Math.max(Math.abs(matrix.a), 1e-9) : 0;
  }
  function brut(e: { clientX: number; clientY: number }): StudioPoint | null {
    const matrix = sheet.current?.getScreenCTM(); if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  /** Partie du document visible à l'écran (la planche peut montrer plus que le cadre selon son rapport). */
  function vueVisible(matrix: DOMMatrix): Boite | undefined {
    const svg = sheet.current; if (!svg) return undefined;
    const r = rectContenu(svg), inv = matrix.inverse();
    const a = new DOMPoint(r.left, r.top).matrixTransform(inv), b = new DOMPoint(r.left + r.width, r.top + r.height).matrixTransform(inv);
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite) || r.width <= 0 || r.height <= 0) return undefined;
    return { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
  }
  /**
   * Point posé : repère du moteur d'accrochage (objets hors `exclure`, repérage depuis le dernier point ; Maj tenue
   * impose l'orthogonal), sinon nœud de grille, sinon arrondi au centimètre. Un sommet nommé reste lié (cote associative).
   */
  function pose(e: { clientX: number; clientY: number; shiftKey?: boolean }, exclure?: ReadonlySet<string>): PointRepere | null {
    const { drawing } = o;
    const matrix = sheet.current?.getScreenCTM(); if (!matrix || !drawing || !index) return null;
    const raw = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const tol = ACCROCHE_PX / Math.max(Math.abs(matrix.a), 1e-9);
    const repere = mesurerAccrochage(drawing.objects.length, () => resoudre(index, { curseur: { x: raw.x, y: raw.y }, tolerance: tol, base, vue: vueVisible(matrix), exclure, verrouAngle, pasLongueur: o.accrocheGrille ? pas : 0.01 },
      { objets: o.accrocheSommets, modes: bascules.modes, orthogonal: bascules.orthogonal || e.shiftKey === true, polaire: bascules.polaire, pasPolaire: bascules.pasPolaire }));
    return pointPose(repere, raw, o.accrocheGrille ? pas : null);
  }
  /** Bascule d'accrochage ou de repérage ; false si `id` n'en est pas une. */
  function commandeAccrochage(id: IdCommandeEditeur): boolean {
    const suivant = basculerAccrochage(bascules, id);
    if (!suivant) return false;
    setBascules(suivant);
    return true;
  }
  /** Direction courante du tracé (radians) : celle du repérage suivi, sinon du point survolé, depuis le dernier point. */
  const directionCourante = (): number | null => (base && survol ? survol.repere?.angle ?? direction(base, survol.point) : null);
  /** Saisie directe (champ « Mesures ») : point à poser, angle imposé (retenu ici) ou refus. */
  function saisir(texte: string): ResultatSaisie {
    if (!base) return { type: "erreur", message: "Posez d’abord le premier point." };
    const r = appliquerSaisie(texte, base, directionCourante(), verrouAngle);
    if (r.type === "angle") setVerrouAngle(r.angle);
    else if (r.type === "point") setVerrouAngle(null);
    return r;
  }
  function hover(e: PointerEvent<SVGSVGElement>) {
    if (!o.pointsActifs) { if (survol) setSurvol(null); return; }
    setSurvol(pose(e, o.exclureAuSurvol));
    mesurerApercu(e.timeStamp, o.drawing?.objects.length ?? 0);
  }

  // ——— Pointeur ———
  function pointerDown(e: PointerEvent<SVGSVGElement>) {
    clicSupprime.current = false;
    const svg = e.currentTarget;
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Deux doigts : panoramique et zoom ; le geste d'un doigt en cours est abandonné.
    if (e.pointerType === "touch" && pointeurs.current.size >= 2) { annulerGeste(); demarrerVue(svg); e.preventDefault(); return; }
    if (e.button === 1 || (e.button === 0 && espace.current.tenu)) {
      if (e.button === 0) espace.current.panoramique = true;
      demarrerVue(svg); svg.setPointerCapture?.(e.pointerId); e.preventDefault(); return;
    }
    if (e.button !== 0 || o.outil !== "studio.dessin.selection" || !o.drawing) return;
    const cible = (e.target as Element).closest?.("[data-studio-objet]");
    const id = cible?.getAttribute("data-studio-objet");
    const ecran = { x: e.clientX, y: e.clientY };
    if (id && cible?.hasAttribute("data-studio-selectionnable")) {
      // Maj + clic bascule l'objet ; en lecture seule, un objet se sélectionne mais ne se déplace pas.
      if (e.shiftKey || !o.writable) return;
      const base = pose(e); if (!base) return;
      geste.current = { type: "glisser", id: e.pointerId, base, ids: o.selectionSet.has(id) ? o.selectionIds : [id], ecran, actif: false };
      return;
    }
    const debut = brut(e); if (!debut) return;
    geste.current = { type: "rectangle", id: e.pointerId, debut, ecran, ajouter: e.shiftKey, actif: false };
  }
  function pointerMove(e: PointerEvent<SVGSVGElement>) {
    // Bouton relâché hors de la planche avant le seuil : le geste en attente et son pointeur sont oubliés (jamais de cadre fantôme).
    if (e.pointerType !== "touch" && e.buttons === 0) {
      pointeurs.current.delete(e.pointerId);
      if (geste.current && "id" in geste.current && geste.current.id === e.pointerId && !("actif" in geste.current && geste.current.actif)) geste.current = null;
      // Survol sans bouton : le point survolé (aperçu du tracé ou de la transformation) suit toujours le pointeur.
      hover(e);
      return;
    }
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = geste.current;
    if (g?.type === "vue") {
      const ids = [...g.depart.keys()].filter(id => pointeurs.current.has(id));
      const lire = (id: number) => ecranVersPlanche(g.cadre0, g.rect0, pointeurs.current.get(id)!);
      if (ids.length >= 2) poserCadre(pincer(g.cadre0, [g.depart.get(ids[0]!)!, g.depart.get(ids[1]!)!], [lire(ids[0]!), lire(ids[1]!)]));
      else if (ids.length === 1) poserCadre(glisserVue(g.cadre0, g.depart.get(ids[0]!)!, lire(ids[0]!)));
      return;
    }
    if (g && e.pointerId === g.id) {
      if (!g.actif && Math.hypot(e.clientX - g.ecran.x, e.clientY - g.ecran.y) > SEUIL_GESTE_PX) {
        g.actif = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (g.type === "glisser") o.select(g.ids);
      }
      if (!g.actif) return;
      if (g.type === "rectangle") { const fin = brut(e); if (fin) setRectangle({ debut: g.debut, fin, mode: modeRectangle(g.debut, fin) }); }
      else {
        const dest = pose(e, new Set(g.ids)); if (!dest) return;
        setApercu({ ids: g.ids, dx: ecart(g.base.point.x, dest.point.x), dy: ecart(g.base.point.y, dest.point.y) });
        setSurvol(dest);
      }
      return;
    }
    hover(e);
  }
  function pointerUp(e: PointerEvent<SVGSVGElement>) {
    pointeurs.current.delete(e.pointerId);
    const g = geste.current;
    if (!g) return;
    if (g.type === "vue") {
      // Un panoramique n'est jamais un clic ; un doigt restant reprend le panoramique.
      clicSupprime.current = true;
      if (e.type !== "pointercancel" && e.pointerType === "touch" && pointeurs.current.size > 0) demarrerVue(e.currentTarget);
      else geste.current = null;
      return;
    }
    if (e.pointerId !== g.id) return;
    geste.current = null;
    if (!g.actif) return;
    clicSupprime.current = true;
    if (e.type === "pointercancel" || !o.drawing) { annulerGeste(); return; }
    if (g.type === "rectangle") {
      const fin = brut(e) ?? g.debut;
      const ids = selectionParRectangle(o.drawing, g.debut, fin);
      o.select(g.ajouter ? ajouter(o.selectionIds, ids) : ids);
      setRectangle(null);
      return;
    }
    const dest = pose(e, new Set(g.ids));
    setApercu(null); setSurvol(null);
    if (dest) o.moveSelection(g.ids, ecart(g.base.point.x, dest.point.x), ecart(g.base.point.y, dest.point.y));
  }
  function clickCapture(e: MouseEvent<SVGSVGElement>) {
    if (!clicSupprime.current) return;
    clicSupprime.current = false;
    e.stopPropagation(); e.preventDefault();
  }

  return {
    cadre, cadreRef, poserCadre, pas, refPlanche, survol, setSurvol, rectangle, apercu, espace,
    /** Un geste (vue, rectangle, glisser) est en attente ou en cours. */
    enGeste: () => geste.current !== null,
    annulerGeste, tolerance, pose, pointerDown, pointerMove, pointerUp, clickCapture,
    /** Accrochage et repérage : réglages, état des boutons de bascule, commande, saisie directe. */
    bascules, basculesActives: basculesActives(bascules), commandeAccrochage, verrouAngle, directionCourante, saisir,
    poserPasPolaire: (pasPolaire: number) => setBascules((b) => ({ ...b, pasPolaire })),
  };
}
