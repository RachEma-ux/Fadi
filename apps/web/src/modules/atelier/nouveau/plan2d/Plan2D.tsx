/**
 * Zone de travail 2D (cahier §5.7, UX3) : plan SVG du niveau actif, zoom à la molette ou au pincement, panoramique
 * (bouton du milieu, Espace + glisser, deux doigts), accrochages visibles, aperçu du tracé en cours, sélection au
 * clic ou au cadre. Toute modification passe par `onCommandes` (bus de commandes) ; rien n'est écrit ici.
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { aireNette, centroide, cleTremie, pointDansPolygone, tremiesRetenues, cercleTroisPoints, polygoneMurCourbe, renflementTroisPoints, distance, intersectionSegments, proposerPlancher, rectangleEnglobant, simplifierTrace, ellipseTroisPoints, pointsEllipse, polygoneMur, polygoneRegulier, pointsSpline, pt, raisonVerrou, rectangleTroisPoints, type Commande, type ModeleAtelier, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { accrocher, avecExternes, objetSousPointeur, segmentsDuNiveau, type Accroche } from "./accrochage";
import { clic, objetsDansCadre, objetsDansLasso, type ResultatClic } from "./outils-2d";
import { chemin, projecteur } from "./projecteur";
import { Croisements2D, Definitions2D, Objet2D } from "./rendu";

export interface PropsPlan2D {
  etat: ModeleAtelier;
  ui: EtatUi;
  readOnly: boolean;
  onResultat: (r: ResultatClic) => void;
  /** Double-clic : termine le tracé en cours (comme Entrée). */
  onTerminer: () => void;
  /** Manipulation directe (glisser la sélection) : un lot `transformer.deplacer`. */
  onCommandes: (commandes: Commande[], label: string) => void;
  /** Références externes (DA-05-11) : traits déjà convertis dans le repère local du projet, en gris, non sélectionnables. */
  externes?: readonly { id: string; niveauId: string; traits: readonly { a: { x: number; y: number }; b: { x: number; y: number }; coupe: boolean }[] }[];
}

/** Ordre de dessin : surfaces d'abord, puis structure, puis annotations. */
const ORDRE: Record<string, number> = { "reference-plan": 0, zone: 1, espace: 2, dalle: 3, toiture: 3, piece: 4, solide: 5, esquisse: 6, escalier: 7, mur: 8, poteau: 9, porte: 10, fenetre: 10, ouverture: 10, cotation: 11, texte: 12, etiquette: 12, "bloc-occurrence": 13 };

const LIBELLE_ACCROCHE: Record<string, string> = { extremite: "Extrémité", milieu: "Milieu", centre: "Centre", quadrant: "Quadrant", perpendiculaire: "Perpendiculaire", intersection: "Intersection", proche: "Proche", orthogonal: "Orthogonal", grille: "Grille", libre: "" };

const OUTILS_CONTOUR = new Set(["dalle", "toiture", "zone", "espace", "solide", "polygone", "hachure", "polyligne", "spline", "garde-corps", "escalier-volees"]);
const OUTILS_SEGMENT = new Set(["mur", "escalier", "ligne", "construction", "cotation", "mesurer", "deplacer", "copier", "miroir", "etirer", "rectangle", "cercle", "arc", "tourner", "echelle"]);

const AUCUNE: NonNullable<PropsPlan2D["externes"]> = [];
const AUCUNE_CLE: string[] = [];

export function Plan2D({ etat, ui, readOnly, onResultat, onTerminer, onCommandes, externes = AUCUNE }: PropsPlan2D) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [taille, setTaille] = useState({ w: 800, h: 600 });
  const [accroche, setAccroche] = useState<Accroche | null>(null);
  const [cadre, setCadre] = useState<{ a: Point2; b: Point2 } | null>(null);
  const glisse = useRef<{ mode: "pan" | "cadre" | "deplacer" | "lasso" | "trace" | "manip" | "fini" | "visee" | "tangente"; x: number; y: number; vue: EtatUi["vue"]; depart: Point2; bouge: boolean; poignee?: Poignee; tangente?: number } | null>(null);
  // Manipulateur 2D (D-070, DA-02-17) : aperçu du glissement d'une poignée ; une seule commande au relâchement.
  const [manip, setManip] = useState<ApercuManip | null>(null);
  // Loupe de précision au doigt (D-085) : un appui tenu sans bouger passe en visée ; la loupe montre le point accroché.
  const [loupe, setLoupe] = useState<{ sx: number; sy: number; point: Point2 } | null>(null);
  const minuterieVisee = useRef<number | null>(null);
  const idObjets = `plan-objets-${useId().replace(/:/g, "")}`;
  const [lasso, setLasso] = useState<Point2[] | null>(null);
  const lassoPoints = useRef<Point2[]>([]);
  const [decalage, setDecalage] = useState<{ dx: number; dy: number; accroche: Accroche } | null>(null);
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const pincement = useRef<{ d: number; vue: EtatUi["vue"]; cx: number; cy: number } | null>(null);
  const espace = useRef(false);
  const cadreInitial = useRef<string | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setTaille({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const bas = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) espace.current = true;
    };
    const haut = (e: KeyboardEvent) => {
      if (e.code === "Space") espace.current = false;
    };
    window.addEventListener("keydown", bas);
    window.addEventListener("keyup", haut);
    return () => {
      window.removeEventListener("keydown", bas);
      window.removeEventListener("keyup", haut);
    };
  }, []);

  const pr = projecteur(ui.vue, taille.w, taille.h);
  const rayon = 12 / ui.vue.echelle;

  const calquesMasques = useMemo(() => new Set(Object.values(etat.calques).filter((c) => !c.visible).map((c) => c.id)), [etat.calques]);
  // Outil Plancher (D-069) : propositions en surimpression, jamais écrites.
  const rivePlancher = ui.parametresOutil["rivePlancher"];
  const plancher = useMemo(() => (ui.outil === "plancher" && ui.niveauId && (rivePlancher === "axe" || rivePlancher === "exterieur") ? proposerPlancher(etat, ui.niveauId, rivePlancher) : null), [ui.outil, ui.niveauId, rivePlancher, etat]);
  // Aperçu chiffré au survol d'une proposition (D-098) et trémies écartées dans l'inspecteur.
  const [survolPlancher, setSurvolPlancher] = useState<number | null>(null);
  const tremiesExclues = Array.isArray(ui.parametresOutil["tremiesExclues"]) ? (ui.parametresOutil["tremiesExclues"] as string[]) : AUCUNE_CLE;
  const objets = useMemo(
    () =>
      (Object.values(etat.objets) as OccurrenceQuelconque[])
        .filter((o) => o.niveauId === ui.niveauId && !(o.calqueId && calquesMasques.has(o.calqueId)))
        .sort((a, b) => (ORDRE[a.classe] ?? 20) - (ORDRE[b.classe] ?? 20)),
    [etat.objets, ui.niveauId, calquesMasques],
  );
  // Accrochage aussi sur les traits des références externes du niveau (DA-05-11), qui restent non sélectionnables.
  const externesNiveau = useMemo(() => externes.filter((x) => x.niveauId === ui.niveauId), [externes, ui.niveauId]);
  const cache = useMemo(() => avecExternes(segmentsDuNiveau(etat, ui.niveauId), externesNiveau), [etat, ui.niveauId, externesNiveau]);
  // Repère de saisie (D-091) : les accrochages polaires suivent son orientation.
  const accs = useMemo(() => (ui.repere ? { ...ui.accrochages, angleRepere: ui.repere.angle } : ui.accrochages), [ui.accrochages, ui.repere]);
  // Pivot déplaçable (D-077) : propre à la sélection courante, affichage seul (R10).
  const [pivotPerso, setPivotPerso] = useState<{ cle: string; p: Point2 } | null>(null);
  const cleSelection = ui.selection.join("|");
  const boiteManip = useMemo(() => {
    const b = ui.outil === "selection" && !readOnly ? boiteManipulateur(etat, ui.selection, ui.niveauId, cache) : null;
    return b && pivotPerso?.cle === cleSelection ? { ...b, pivot: pivotPerso.p, pivotDeplace: true } : b ? { ...b, pivotDeplace: false } : null;
  }, [ui.outil, readOnly, etat, ui.selection, ui.niveauId, cache, pivotPerso, cleSelection]);
  // Poignées de tangente (D-093, DA-01-05) : une courbe seule sélectionnée ; aperçu du glissement, une commande au relâchement.
  const courbeTangentes = useMemo(() => (ui.outil === "selection" && !readOnly ? splineEditable(etat, ui.selection, ui.niveauId) : null), [ui.outil, readOnly, etat, ui.selection, ui.niveauId]);
  const [tangenteApercu, setTangenteApercu] = useState<{ i: number; v: Point2 } | null>(null);
  // Saisie de la valeur au clavier pendant le glissement (D-077) : chiffres, virgule, signe ; Entrée applique.
  const [saisie, setSaisie] = useState("");
  useEffect(() => {
    if (!manip) {
      setSaisie("");
      return;
    }
    const touche = (e: KeyboardEvent) => {
      // Geste terminé au clavier : le relâchement du pointeur ne fera plus rien.
      const finir = () => {
        if (glisse.current) glisse.current = { ...glisse.current, mode: "fini" };
      };
      if (e.key === "Escape") {
        finir();
        setManip(null);
        etatUi.set({ aide: "Manipulation annulée : aucune commande." });
      } else if (/^[0-9.,-]$/.test(e.key)) setSaisie((v) => v + e.key);
      else if (e.key === "Backspace") setSaisie((v) => v.slice(0, -1));
      else if (e.key === "Enter" && saisie && boiteManip) {
        const v = Number(saisie.replace(",", "."));
        const m = Number.isFinite(v) ? valeurSaisie(manip, v, ui.repere?.angle ?? 0) : null;
        finir();
        setManip(null);
        const c = m ? commandeManip(m, boiteManip.pivot, ui.selection) : null;
        if (c) onCommandes([c.commande], c.label);
        else etatUi.set({ aide: "Valeur saisie invalide ou nulle : aucune commande." });
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  }, [manip, saisie, boiteManip, ui.selection, onCommandes]);
  const selection = useMemo(() => new Set(ui.selection), [ui.selection]);
  const idsVisibles = useMemo(() => new Set(objets.map((o) => o.id)), [objets]);
  const dernierMur = useMemo(() => objets.map((o) => o.classe).lastIndexOf("mur"), [objets]);

  // Cadrage automatique à la première ouverture d'un niveau.
  useEffect(() => {
    if (!ui.niveauId || cadreInitial.current === ui.niveauId || taille.w < 10) return;
    cadreInitial.current = ui.niveauId;
    etatUi.set({ vue: cadrerNiveau(etat, ui.niveauId, taille.w, taille.h) });
  }, [ui.niveauId, etat, taille.w, taille.h]);

  function pointEcran(e: { clientX: number; clientY: number }): { sx: number; sy: number } {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  function surMouvement(e: ReactPointerEvent<SVGSVGElement>) {
    const { sx, sy } = pointEcran(e);
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: sx, y: sy });
    if (pincement.current && pointeurs.current.size >= 2) {
      const [p1, p2] = [...pointeurs.current.values()];
      const d = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
      const cx = (p1!.x + p2!.x) / 2;
      const cy = (p1!.y + p2!.y) / 2;
      const v0 = pincement.current.vue;
      const echelle = clampEchelle(v0.echelle * (d / Math.max(1, pincement.current.d)));
      const pr0 = projecteur(v0, taille.w, taille.h);
      const ancre = pr0.depuis(pincement.current.cx, pincement.current.cy);
      etatUi.set({ vue: { echelle, cx: ancre.x - (cx - taille.w / 2) / echelle, cy: ancre.y + (cy - taille.h / 2) / echelle } });
      return;
    }
    const g = glisse.current;
    if (g?.mode === "visee") {
      const a = accrocher(pr.depuis(sx, sy), cache, accs, rayon * 2, ui.pointsEnCours[ui.pointsEnCours.length - 1] ?? null);
      setLoupe({ sx, sy, point: a.point });
      setAccroche(a);
      return;
    }
    if (g?.mode === "pan") {
      const dx = (sx - g.x) / g.vue.echelle;
      const dy = (sy - g.y) / g.vue.echelle;
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 3;
      etatUi.set({ vue: { ...g.vue, cx: g.vue.cx - dx, cy: g.vue.cy + dy } });
      return;
    }
    const p = pr.depuis(sx, sy);
    if (g?.mode === "cadre") {
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 4;
      if (g.bouge) setCadre({ a: g.depart, b: p });
      return;
    }
    if (g?.mode === "lasso" || g?.mode === "trace") {
      const dernier = lassoPoints.current[lassoPoints.current.length - 1];
      // Un point tous les 4 px environ : le contour reste léger.
      if (!dernier || Math.hypot((p.x - dernier.x) * pr.echelle, (p.y - dernier.y) * pr.echelle) > 4) {
        lassoPoints.current = [...lassoPoints.current, p];
        g.bouge = g.bouge || lassoPoints.current.length > 2;
        setLasso(lassoPoints.current);
      }
      return;
    }
    if (g?.mode === "tangente" && g.tangente !== undefined && courbeTangentes) {
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 4;
      const base = courbeTangentes.points[g.tangente];
      if (g.bouge && base) {
        // La poignée suit le pointeur, accrochée ; Maj : direction par pas de 15°.
        const q = accrocher(p, cache, accs, rayon, base, ui.selection).point;
        const v = tangenteDepuisPoignee(base, q, e.shiftKey);
        setTangenteApercu(v ? { i: g.tangente, v } : null);
      }
      return;
    }
    if (g?.mode === "manip" && g.poignee === "p") {
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 4;
      if (g.bouge) setPivotPerso({ cle: cleSelection, p: accrocher(p, cache, accs, rayon, null, ui.selection).point });
      return;
    }
    if (g?.mode === "manip" && g.poignee && boiteManip) {
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 4;
      if (g.bouge) setManip(apercuManip(g.poignee, g.depart, g.poignee === "x" || g.poignee === "y" || g.poignee === "c" ? accrocher(p, cache, accs, rayon, g.depart, ui.selection).point : p, boiteManip.pivot, e.shiftKey, ui.repere?.angle ?? 0));
      return;
    }
    if (g?.mode === "deplacer") {
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 4;
      if (g.bouge) {
        // La destination s'accroche aux autres objets (jamais à ceux qu'on déplace).
        const a = accrocher(p, cache, accs, rayon, g.depart, ui.selection);
        setDecalage({ dx: a.point.x - g.depart.x, dy: a.point.y - g.depart.y, accroche: a });
      }
      return;
    }
    if (ui.outil === "selection") {
      const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
      if ((sous?.objetId ?? null) !== ui.survol) etatUi.set({ survol: sous?.objetId ?? null });
      setAccroche(null);
      return;
    }
    if (plancher) {
      const i = plancher.contours.map((c, k) => ({ k, c })).filter(({ c }) => pointDansPolygone(p, c.contour)).sort((u, v) => u.c.aire - v.c.aire)[0]?.k ?? null;
      if (i !== survolPlancher) setSurvolPlancher(i);
    }
    const depuis = ui.pointsEnCours[ui.pointsEnCours.length - 1] ?? null;
    const a = accrocher(p, cache, accs, rayon, depuis);
    setAccroche(a);
    etatUi.set({ curseur: a.point });
  }

  function surAppui(e: ReactPointerEvent<SVGSVGElement>) {
    const el = svgRef.current;
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché ou inconnu du navigateur : le geste continue sans capture.
    }
    const { sx, sy } = pointEcran(e);
    pointeurs.current.set(e.pointerId, { x: sx, y: sy });
    if (pointeurs.current.size === 2) {
      const [p1, p2] = [...pointeurs.current.values()];
      pincement.current = { d: Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y), vue: ui.vue, cx: (p1!.x + p2!.x) / 2, cy: (p1!.y + p2!.y) / 2 };
      glisse.current = null;
      setCadre(null);
      return;
    }
    const p = pr.depuis(sx, sy);
    if (e.button === 1 || espace.current || ui.outil === "naviguer") {
      glisse.current = { mode: "pan", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      return;
    }
    if (e.button !== 0) return;
    // Main levée (D-067, DA-01-06) : le tracé suit le pointeur (souris, stylet ou doigt) jusqu'au relâchement.
    if ((ui.outil === "main-levee" || ui.outil === "gomme") && !readOnly) {
      lassoPoints.current = [p];
      glisse.current = { mode: "trace", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      return;
    }
    // Poignée de tangente (D-093) avant le lasso : Alt + clic sur une poignée libère la tangente.
    const tangente = (e.target as Element | null)?.closest?.("[data-tangente-poignee]")?.getAttribute("data-tangente-poignee");
    if (tangente != null && courbeTangentes && ui.outil === "selection") {
      glisse.current = { mode: "tangente", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false, tangente: Number(tangente) };
      return;
    }
    if (ui.outil === "lasso" || (ui.outil === "selection" && e.altKey)) {
      lassoPoints.current = [p];
      glisse.current = { mode: "lasso", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      return;
    }
    const poignee = (e.target as Element | null)?.closest?.("[data-poignee]")?.getAttribute("data-poignee") as Poignee | null | undefined;
    if (poignee && boiteManip && ui.outil === "selection") {
      // Déplacements : saisis par le point remarquable le plus proche, comme le glisser de la sélection ; rotation et
      // échelle : le point pressé, autour du pivot.
      glisse.current = { mode: "manip", x: sx, y: sy, vue: ui.vue, depart: poignee === "x" || poignee === "y" || poignee === "c" ? accrocher(p, cache, accs, rayon, null).point : p, bouge: false, poignee };
      return;
    }
    if (ui.outil === "selection") {
      const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
      // Une sélection qui contient un objet verrouillé (D-052) ne se saisit pas : le geste devient une sélection au cadre.
      const tenue = ui.selection.some((id) => { const x = etat.objets[id]; return !!x && !!raisonVerrou(etat, x); });
      if (sous && ui.selection.includes(sous.objetId) && !e.shiftKey && !readOnly && !tenue) {
        // Saisir la sélection par un point remarquable (extrémité, milieu…) pour la poser avec précision.
        const prise = accrocher(p, cache, accs, rayon, null).point;
        glisse.current = { mode: "deplacer", x: sx, y: sy, vue: ui.vue, depart: prise, bouge: false };
        return;
      }
      glisse.current = { mode: "cadre", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      return;
    }
    // Au doigt, un glisser sur le fond déplace la vue ; le tracé se fait par touchers successifs. Un appui tenu
    // (0,35 s) sans bouger passe en visée avec la loupe : le doigt ajuste le point, le relâcher le pose.
    if (e.pointerType === "touch") {
      glisse.current = { mode: "pan", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      if (minuterieVisee.current) window.clearTimeout(minuterieVisee.current);
      minuterieVisee.current = window.setTimeout(() => {
        const g = glisse.current;
        if (!g || g.mode !== "pan" || g.bouge || pointeurs.current.size !== 1) return;
        glisse.current = { ...g, mode: "visee" };
        etatUi.set({ vue: g.vue });
        const a = accrocher(g.depart, cache, accs, rayon * 2, ui.pointsEnCours[ui.pointsEnCours.length - 1] ?? null);
        setLoupe({ sx: g.x, sy: g.y, point: a.point });
        setAccroche(a);
      }, 350);
    }
  }

  function surRelache(e: ReactPointerEvent<SVGSVGElement>) {
    const { sx, sy } = pointEcran(e);
    pointeurs.current.delete(e.pointerId);
    if (pincement.current) {
      if (pointeurs.current.size < 2) pincement.current = null;
      glisse.current = null;
      return;
    }
    const g = glisse.current;
    glisse.current = null;
    if (minuterieVisee.current) window.clearTimeout(minuterieVisee.current);
    minuterieVisee.current = null;
    if (loupe) setLoupe(null);
    if (g?.mode === "fini") return;
    const p = pr.depuis(sx, sy);
    if (g?.mode === "pan" && (g.bouge || e.pointerType !== "touch")) return;
    if (g?.mode === "tangente" && g.tangente !== undefined && courbeTangentes) {
      const ap = tangenteApercu;
      setTangenteApercu(null);
      // Glisser : tangente imposée ; Alt + clic : tangente libérée ; simple clic : rien.
      const v = g.bouge ? (ap && ap.i === g.tangente ? ap.v : null) : e.altKey ? null : undefined;
      if (v === undefined || (!g.bouge && !courbeTangentes.imposees[g.tangente])) return;
      if (g.bouge && !v) return;
      const c = commandeTangente(courbeTangentes, g.tangente, v);
      onCommandes([c.commande], c.label);
      return;
    }
    if (g?.mode === "manip" && g.poignee === "p") {
      // Clic sans glisser sur le pivot : retour au centre de la sélection.
      if (!g.bouge) setPivotPerso(null);
      return;
    }
    if (g?.mode === "manip") {
      const m = manip;
      setManip(null);
      if (!g.bouge || !m || !boiteManip) {
        // Simple clic sur une poignée : sélection comme un clic ordinaire (rien n'est transformé).
        const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
        if (sous) etatUi.selectionner([sous.objetId], e.shiftKey);
        else if (!e.shiftKey) etatUi.selectionner([]);
        return;
      }
      const c = commandeManip(m, boiteManip.pivot, ui.selection);
      if (c) onCommandes([c.commande], c.label);
      return;
    }
    if (g?.mode === "deplacer") {
      const d = decalage;
      setDecalage(null);
      if (g.bouge && d && Math.hypot(d.dx, d.dy) > 1e-9) {
        const n = ui.selection.length;
        onCommandes([{ type: "transformer.deplacer", params: { dx: d.dx, dy: d.dy }, cibles: ui.selection }], `Déplacer ${n} objet${n > 1 ? "s" : ""} (${fmt(Math.hypot(d.dx, d.dy))} m)`);
        return;
      }
      // Simple clic sur un objet déjà sélectionné : le garder seul.
      const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
      if (sous) etatUi.selectionner([sous.objetId]);
      return;
    }
    if (g?.mode === "trace") {
      const brut = lassoPoints.current;
      lassoPoints.current = [];
      setLasso(null);
      const r = ui.outil === "gomme" ? gommer(brut, etat, cache) : traceMainLevee(brut, ui, e.altKey);
      if ("message" in r) etatUi.set({ aide: r.message });
      else onCommandes(r.commandes, r.label);
      return;
    }
    if (g?.mode === "lasso") {
      const contour = lassoPoints.current;
      lassoPoints.current = [];
      setLasso(null);
      if (g.bouge && contour.length > 2) {
        const ids = objetsDansLasso(etat, ui.niveauId, contour).filter((id) => {
          const o = etat.objets[id];
          return !(o?.calqueId && calquesMasques.has(o.calqueId));
        });
        etatUi.selectionner(ids, e.shiftKey);
        etatUi.set({ aide: ids.length ? `${ids.length} objet(s) sélectionné(s) au lasso.` : "Aucun objet entièrement entouré." });
        return;
      }
      const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
      if (sous) etatUi.selectionner([sous.objetId], e.shiftKey);
      else if (!e.shiftKey) etatUi.selectionner([]);
      return;
    }
    if (g?.mode === "cadre") {
      setCadre(null);
      if (g.bouge) {
        // Cadre gauche → droite : objets entièrement dedans (convention des logiciels de dessin).
        const ids = objetsDansCadre(etat, ui.niveauId, g.depart, p).filter((id) => {
          const o = etat.objets[id];
          return !(o?.calqueId && calquesMasques.has(o.calqueId));
        });
        etatUi.selectionner(ids, e.shiftKey);
        etatUi.set({ aide: ids.length ? `${ids.length} objet(s) sélectionné(s).` : "Aucun objet entièrement dans le cadre." });
        return;
      }
      const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
      if (sous) {
        if (e.shiftKey) etatUi.set((u) => ({ selection: u.selection.includes(sous.objetId) ? u.selection.filter((x) => x !== sous.objetId) : [...u.selection, sous.objetId] }));
        else etatUi.selectionner([sous.objetId]);
      } else if (!e.shiftKey) etatUi.selectionner([]);
      return;
    }
    if (readOnly) {
      etatUi.set({ aide: "Lecture seule : les outils de tracé sont désactivés." });
      return;
    }
    // Clic d'outil : point accroché (au doigt, l'accroche est recalculée au point touché).
    const depuis = ui.pointsEnCours[ui.pointsEnCours.length - 1] ?? null;
    const a = e.pointerType === "touch" || !accroche ? accrocher(p, cache, accs, rayon * (e.pointerType === "touch" ? 2 : 1), depuis) : accroche;
    const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon)?.objetId ?? null;
    onResultat(clic(ui.outil, a.point, etat, ui, { rayon, alt: e.altKey, objetSous: sous }));
  }

  function surMolette(e: React.WheelEvent<SVGSVGElement>) {
    const { sx, sy } = pointEcran(e);
    const ancre = pr.depuis(sx, sy);
    const facteur = Math.exp(-e.deltaY * 0.0015);
    const echelle = clampEchelle(ui.vue.echelle * facteur);
    etatUi.set({ vue: { echelle, cx: ancre.x - (sx - taille.w / 2) / echelle, cy: ancre.y + (sy - taille.h / 2) / echelle } });
  }

  // Molette : écouteur non passif pour empêcher le défilement de la page.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const bloquer = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", bloquer, { passive: false });
    return () => el.removeEventListener("wheel", bloquer);
  }, []);

  const pasGrille = accs.pasGrille * ui.vue.echelle;
  const origine = pr.vers({ x: 0, y: 0 });
  const curseur = accroche?.point ?? null;
  const pts = ui.pointsEnCours;

  return (
    <svg
      ref={svgRef}
      className={`plan2d outil-${ui.outil}`}
      role="application"
      aria-label={`Plan du niveau ${ui.niveauId ? etat.niveaux[ui.niveauId]?.nom ?? "" : "—"} ; outil ${ui.outil}`}
      onPointerMove={surMouvement}
      onPointerDown={surAppui}
      onPointerUp={surRelache}
      onPointerCancel={(e) => {
        pointeurs.current.delete(e.pointerId);
        pincement.current = null;
        glisse.current = null;
        setCadre(null);
        setLasso(null);
        setTangenteApercu(null);
        lassoPoints.current = [];
      }}
      onPointerLeave={() => {
        setAccroche(null);
        if (ui.survol) etatUi.set({ survol: null });
      }}
      onWheel={surMolette}
      onDoubleClick={onTerminer}
    >
      <Definitions2D />
      {accs.grille && pasGrille >= 8 && (
        <>
          <defs>
            <pattern id="grille-plan" width={pasGrille} height={pasGrille} patternUnits="userSpaceOnUse" x={origine.x} y={origine.y}>
              <path d={`M ${pasGrille} 0 L 0 0 0 ${pasGrille}`} fill="none" stroke="var(--plan-grille)" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={taille.w} height={taille.h} fill="url(#grille-plan)" pointerEvents="none" />
        </>
      )}
      {externes.some((x) => x.niveauId === ui.niveauId) && (
        <g className="plan-externes" pointerEvents="none" aria-hidden="true">
          {externes
            .filter((x) => x.niveauId === ui.niveauId)
            .map((x) => (
              <path key={x.id} data-reference-externe={x.id} d={x.traits.map((t) => { const a = pr.vers(t.a); const b = pr.vers(t.b); return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`; }).join("")} />
            ))}
        </g>
      )}
      <g className="plan-objets" id={idObjets}>
        {objets.map((o, i) => (
          <Fragment key={o.id}>
            {o.phase ? (
              <g data-phase={o.phase}>
                <Objet2D o={o} etat={etat} pr={pr} selectionne={selection.has(o.id)} survole={ui.survol === o.id} />
              </g>
            ) : (
              <Objet2D o={o} etat={etat} pr={pr} selectionne={selection.has(o.id)} survole={ui.survol === o.id} />
            )}
            {/* Croisements de murs (D-034) : peints juste après le dernier mur, sous les poteaux et les ouvertures. */}
            {i === dernierMur && <Croisements2D etat={etat} niveauId={ui.niveauId} visibles={idsVisibles} pr={pr} />}
          </Fragment>
        ))}
      </g>
      {manip && boiteManip && (
        <g className="plan-deplacement" transform={transformEcran(manip, pr.vers(boiteManip.pivot), pr.echelle)} pointerEvents="none" data-manip-apercu={manip.poignee}>
          {objets.filter((o) => selection.has(o.id)).map((o) => (
            <Objet2D key={o.id} o={o} etat={etat} pr={pr} selectionne survole={false} />
          ))}
        </g>
      )}
      {boiteManip && !decalage && <Manipulateur2D boite={boiteManip} pr={pr} manip={manip} saisie={saisie} angle={ui.repere?.angle ?? 0} />}
      {courbeTangentes && !decalage && !manip && <PoigneesTangente courbe={courbeTangentes} apercu={tangenteApercu} pr={pr} />}
      {ui.repere && <RepereSaisie repere={ui.repere} pr={pr} />}
      {decalage && (
        <g className="plan-deplacement" transform={`translate(${decalage.dx * pr.echelle} ${-decalage.dy * pr.echelle})`} pointerEvents="none">
          {objets.filter((o) => selection.has(o.id)).map((o) => (
            <Objet2D key={o.id} o={o} etat={etat} pr={pr} selectionne survole={false} />
          ))}
        </g>
      )}
      {decalage && decalage.accroche.type !== "libre" && <MarqueAccroche a={decalage.accroche} pr={pr} />}
      {decalage && <text x={pr.vers(decalage.accroche.point).x + 10} y={pr.vers(decalage.accroche.point).y - 10} className="plan-cote-apercu">{fmt(Math.hypot(decalage.dx, decalage.dy))} m</text>}
      <g className="plan-apercu" pointerEvents="none">
        {plancher && (
          <g className="plan-propositions-plancher" data-propositions-plancher={plancher.contours.length}>
            {plancher.contours.map((c, i) => (
              <g key={i}>
                <path d={chemin(pr, c.contour)} className="plan-apercu-trait plan-proposition" />
                {c.trous.map((t, k) => { const exclue = tremiesExclues.includes(cleTremie(t)); return <path key={k} d={chemin(pr, t.contour)} className={`plan-apercu-trait plan-proposition-trou${exclue ? " plan-proposition-trou-exclue" : ""}`} data-tremie-exclue={exclue ? "oui" : "non"} />; })}
              </g>
            ))}
            {survolPlancher !== null && plancher.contours[survolPlancher] && (() => {
              const c = plancher.contours[survolPlancher]!;
              const retenues = tremiesRetenues(c, tremiesExclues);
              const q = pr.vers(centroide(c.contour));
              return (
                <text x={q.x} y={q.y} className="plan-cote-apercu plan-plancher-survol" textAnchor="middle" data-plancher-survol={survolPlancher}>
                  {`${fmt(c.aire)} m² · ${retenues.length}/${c.trous.length} trémie(s) · net ${fmt(aireNette(c.contour, retenues.map((t) => t.contour)))} m²`}
                </text>
              );
            })()}
            {plancher.interstices.map((x, i) => {
              const q = pr.vers(x.point);
              return <circle key={`i${i}`} cx={q.x} cy={q.y} r={6} className="plan-interstice" />;
            })}
          </g>
        )}
        {pts.length > 0 && curseur && <Apercu outil={ui.outil} pts={pts} curseur={curseur} ui={ui} pr={pr} />}
        {pts.map((p, i) => {
          const s = pr.vers(p);
          return <circle key={i} cx={s.x} cy={s.y} r={3} className="plan-point" />;
        })}
        {accroche && accroche.type !== "libre" && <MarqueAccroche a={accroche} pr={pr} />}
        {cadre && <CadreSelection a={pr.vers(cadre.a)} b={pr.vers(cadre.b)} />}
        {lasso && lasso.length > 1 && (ui.outil === "main-levee" || ui.outil === "gomme" ? <path className="plan-trace" d={chemin(pr, lasso, false)} data-trace={lasso.length} /> : <path className="plan-lasso" d={chemin(pr, lasso, true)} data-lasso={lasso.length} />)}
      </g>
      {loupe && <Loupe loupe={loupe} pr={pr} idObjets={idObjets} largeur={taille.w} />}
      <EchelleGraphique echelle={ui.vue.echelle} hauteur={taille.h} />
    </svg>
  );
}

function clampEchelle(e: number): number {
  return Math.min(2000, Math.max(0.5, e));
}

export function cadrerNiveau(etat: ModeleAtelier, niveauId: string | null, w: number, h: number): EtatUi["vue"] {
  const points: { x: number; y: number }[] = [];
  for (const s of segmentsDuNiveau(etat, niveauId).segments) points.push(s.a, s.b);
  if (points.length === 0) return { cx: 0, cy: 0, echelle: 24 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const marge = 40;
  const echelle = clampEchelle(Math.min((w - marge * 2) / Math.max(1, maxX - minX), (h - marge * 2) / Math.max(1, maxY - minY)));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, echelle };
}

const fmt = (v: number) => v.toFixed(2).replace(".", ",");

function Apercu({ outil, pts, curseur, ui, pr }: { outil: string; pts: Point2[]; curseur: Point2; ui: EtatUi; pr: ReturnType<typeof projecteur> }) {
  const dernier = pts[pts.length - 1]!;
  const s = pr.vers(curseur);
  const longueur = distance(dernier, curseur);
  const cote = <text x={s.x + 10} y={s.y - 10} className="plan-cote-apercu">{fmt(longueur)} m</text>;
  if (outil === "mur-courbe") {
    if (pts.length < 2) return longueur < 1e-6 ? null : <path d={chemin(pr, [dernier, curseur], false)} className="plan-apercu-trait" />;
    const r = renflementTroisPoints(pts[0]!, pts[1]!, curseur);
    if (r === null || Math.abs(r) > 1) return <path d={chemin(pr, [pts[0]!, pts[1]!], false)} className="plan-apercu-trait" />;
    const ep = typeof ui.parametresOutil["epaisseur"] === "number" ? (ui.parametresOutil["epaisseur"] as number) : 0.2;
    return <path d={chemin(pr, polygoneMurCourbe(pts[0]!, pts[1]!, ep, ((ui.parametresOutil["alignement"] as string | undefined) ?? "axe") as "axe", r))} className="plan-apercu-mur" />;
  }
  if (outil === "mur") {
    const ep = typeof ui.parametresOutil["epaisseur"] === "number" ? (ui.parametresOutil["epaisseur"] as number) : 0.2;
    if (longueur < 1e-6) return null;
    const poly = polygoneMur(dernier, curseur, ep, ((ui.parametresOutil["alignement"] as string | undefined) ?? "axe") as "axe");
    return (
      <>
        <path d={chemin(pr, poly)} className="plan-apercu-mur" />
        {cote}
      </>
    );
  }
  if (outil === "rectangle") {
    const a = pts[0]!;
    return <path d={chemin(pr, [a, pt(curseur.x, a.y), curseur, pt(a.x, curseur.y)])} className="plan-apercu-trait" />;
  }
  if (outil === "cercle") {
    const c = pr.vers(pts[0]!);
    return (
      <>
        <circle cx={c.x} cy={c.y} r={distance(pts[0]!, curseur) * pr.echelle} className="plan-apercu-trait" />
        {cote}
      </>
    );
  }
  if (outil === "ellipse") {
    if (pts.length < 2) return <path d={chemin(pr, [...pts, curseur], false)} className="plan-apercu-trait" />;
    const e = ellipseTroisPoints(pts[0]!, pts[1]!, curseur);
    return e ? <path d={chemin(pr, pointsEllipse(pts[0]!, e.rayon, e.rayonB, e.rotation, 48))} className="plan-apercu-trait" /> : null;
  }
  if (outil === "rectangle-centre") {
    const c = pts[0]!;
    return <path d={chemin(pr, [pt(2 * c.x - curseur.x, 2 * c.y - curseur.y), pt(curseur.x, 2 * c.y - curseur.y), curseur, pt(2 * c.x - curseur.x, curseur.y)])} className="plan-apercu-trait" />;
  }
  if (outil === "rectangle-3-points") {
    if (pts.length < 2) return <path d={chemin(pr, [...pts, curseur], false)} className="plan-apercu-trait" />;
    const r = rectangleTroisPoints(pts[0]!, pts[1]!, curseur);
    return r ? <path d={chemin(pr, r)} className="plan-apercu-trait" /> : null;
  }
  if (outil === "cercle-2-points") {
    const c = pr.vers(pt((pts[0]!.x + curseur.x) / 2, (pts[0]!.y + curseur.y) / 2));
    return <circle cx={c.x} cy={c.y} r={(distance(pts[0]!, curseur) / 2) * pr.echelle} className="plan-apercu-trait" />;
  }
  if (outil === "polygone-regulier") {
    const n = ui.parametresOutil["cotes"];
    if (typeof n === "number" && Number.isInteger(n) && n >= 3 && n <= 64 && distance(pts[0]!, curseur) > 1e-6) return <path d={chemin(pr, polygoneRegulier(pts[0]!, curseur, n))} className="plan-apercu-trait" />;
    return null;
  }
  if (outil === "cercle-3-points") {
    if (pts.length < 2) return <path d={chemin(pr, [...pts, curseur], false)} className="plan-apercu-trait" />;
    const c3 = cercleTroisPoints(pts[0]!, pts[1]!, curseur);
    if (!c3) return null;
    const c = pr.vers(c3.centre);
    return <circle cx={c.x} cy={c.y} r={c3.rayon * pr.echelle} className="plan-apercu-trait" />;
  }
  if (OUTILS_CONTOUR.has(outil)) return <path d={chemin(pr, [...pts, curseur], false)} className="plan-apercu-trait" />;
  if (OUTILS_SEGMENT.has(outil)) {
    const a = pr.vers(dernier);
    return (
      <>
        <line x1={a.x} y1={a.y} x2={s.x} y2={s.y} className="plan-apercu-trait" />
        {cote}
      </>
    );
  }
  return null;
}

function MarqueAccroche({ a, pr }: { a: Accroche; pr: ReturnType<typeof projecteur> }) {
  const s = pr.vers(a.point);
  const r = 6;
  const forme =
    a.type === "extremite" ? <rect x={s.x - r} y={s.y - r} width={r * 2} height={r * 2} /> :
    a.type === "milieu" ? <path d={`M${s.x} ${s.y - r} L${s.x + r} ${s.y + r} L${s.x - r} ${s.y + r} Z`} /> :
    a.type === "centre" ? <circle cx={s.x} cy={s.y} r={r} /> :
    a.type === "intersection" ? <path d={`M${s.x - r} ${s.y - r} L${s.x + r} ${s.y + r} M${s.x + r} ${s.y - r} L${s.x - r} ${s.y + r}`} /> :
    a.type === "perpendiculaire" ? <path d={`M${s.x - r} ${s.y + r} L${s.x + r} ${s.y + r} M${s.x} ${s.y + r} L${s.x} ${s.y - r}`} /> :
    a.type === "proche" ? <path d={`M${s.x - r} ${s.y - r} L${s.x + r} ${s.y - r} L${s.x - r} ${s.y + r} L${s.x + r} ${s.y + r} Z`} /> :
    <circle cx={s.x} cy={s.y} r={3} />;
  return (
    <g className={`plan-accroche accroche-${a.type}`}>
      {forme}
      <text x={s.x + 9} y={s.y + 16}>{LIBELLE_ACCROCHE[a.type]}</text>
    </g>
  );
}

function CadreSelection({ a, b }: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(a.x - b.x)} height={Math.abs(a.y - b.y)} className="plan-cadre" />;
}

/** Échelle graphique : longueur ronde (0,1 / 0,5 / 1 / 2 / 5 / 10 … m) d'environ 80 px. */
function EchelleGraphique({ echelle, hauteur }: { echelle: number; hauteur: number }) {
  const cible = 80 / echelle;
  const pas = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const l = pas.find((x) => x >= cible) ?? 500;
  const px = l * echelle;
  return (
    <g className="plan-echelle" transform={`translate(16 ${hauteur - 18})`} pointerEvents="none">
      <path d={`M0 -5 L0 0 L${px} 0 L${px} -5`} />
      <text x={px + 6} y={2}>{String(l).replace(".", ",")} m</text>
    </g>
  );
}

/**
 * Tracé à main levée (D-067, DA-01-06) : simplifié à la tolérance de l'outil (Douglas–Peucker), fermé quand il revient
 * à son départ (moins de trois fois la tolérance), polyligne — ou spline avec Alt au relâchement. Pur.
 */
export function traceMainLevee(brut: readonly Point2[], ui: EtatUi, courbe: boolean): { commandes: Commande[]; label: string } | { message: string } {
  if (!ui.niveauId) return { message: "Choisissez d'abord un niveau." };
  const t = Number(ui.parametresOutil["toleranceMainLevee"]);
  const tolerance = Number.isFinite(t) && t > 0 ? t : 0.05;
  let points = simplifierTrace(brut, tolerance);
  if (points.length < 2) return { message: "Tracé trop court : glissez pour dessiner." };
  const ferme = points.length >= 4 && distance(points[0]!, points[points.length - 1]!) <= tolerance * 3;
  if (ferme) points = points.slice(0, -1);
  if (ferme && points.length < 3) return { message: "Tracé fermé trop petit." };
  const forme = courbe ? "spline" : "polyligne";
  return { commandes: [{ type: `esquisse.${forme}`, params: { niveauId: ui.niveauId, points, ferme } }], label: `Main levée : ${forme === "spline" ? "courbe" : "polyligne"} de ${points.length} points${ferme ? " (fermée)" : ""}` };
}

/**
 * Gomme (D-079, DA-01-06) : les esquisses que le tracé traverse sont supprimées, en un seul lot ; les esquisses
 * verrouillées restent et sont dites. Les autres classes (murs, pièces…) ne sont jamais gommées.
 */
export function gommer(trace: readonly Point2[], etat: ModeleAtelier, cache: { segments: readonly { a: Point2; b: Point2; objetId: string }[] }): { commandes: Commande[]; label: string } | { message: string } {
  if (trace.length < 2) return { message: "Glissez la gomme à travers les traits à effacer." };
  const touches = new Set<string>();
  for (const s of cache.segments) {
    if (touches.has(s.objetId) || etat.objets[s.objetId]?.classe !== "esquisse") continue;
    for (let i = 0; i + 1 < trace.length; i++) {
      if (intersectionSegments(s.a, s.b, trace[i]!, trace[i + 1]!)) {
        touches.add(s.objetId);
        break;
      }
    }
  }
  const verrouilles = [...touches].filter((id) => raisonVerrou(etat, etat.objets[id]!));
  const ids = [...touches].filter((id) => !verrouilles.includes(id)).sort();
  if (!ids.length) return { message: verrouilles.length ? `Esquisses verrouillées, non gommées : ${verrouilles.join(", ")}.` : "Aucun trait d'esquisse traversé." };
  return { commandes: ids.map((id) => ({ type: "objet.supprimer", params: { id } })), label: `Gommer ${ids.length} esquisse(s)${verrouilles.length ? ` (${verrouilles.length} verrouillée(s) gardée(s))` : ""}` };
}

// ---------------------------------------------------------------------------
// Manipulateur 2D (D-070, DA-02-17) : flèches X et Y, carré central, anneau de rotation, coins d'échelle uniforme.
// Affichage seul (R10) ; chaque glissement émet une seule commande transformer.*, mêmes contrôles que par menu.
// ---------------------------------------------------------------------------

export type Poignee = "x" | "y" | "c" | "r" | "s" | "p";

export interface ApercuManip {
  poignee: Poignee;
  dx: number;
  dy: number;
  angle: number;
  facteur: number;
}

const CLASSES_NON_MANIPULABLES = new Set(["porte", "fenetre", "ouverture"]);

/** Boîte englobante et pivot (centre) d'une sélection manipulable, ou null (sélection vide, verrouillée, autre niveau, ouverture). */
export function boiteManipulateur(etat: ModeleAtelier, selection: readonly string[], niveauId: string | null, cache: { segments: readonly { a: Point2; b: Point2; objetId: string }[]; quadrants: readonly { p: Point2; objetId: string }[] }): { min: Point2; max: Point2; pivot: Point2 } | null {
  if (!selection.length) return null;
  for (const id of selection) {
    const o = etat.objets[id];
    if (!o || o.niveauId !== niveauId || raisonVerrou(etat, o) || CLASSES_NON_MANIPULABLES.has(o.classe)) return null;
  }
  const ids = new Set(selection);
  const points: Point2[] = [];
  for (const s of cache.segments) if (ids.has(s.objetId)) points.push(s.a, s.b);
  for (const q of cache.quadrants) if (ids.has(q.objetId)) points.push(q.p);
  if (!points.length) return null;
  const r = rectangleEnglobant(points);
  return { min: pt(r.min.x, r.min.y), max: pt(r.max.x, r.max.y), pivot: pt((r.min.x + r.max.x) / 2, (r.min.y + r.max.y) / 2) };
}

const arrondiMm = (v: number) => Math.round(v * 1000) / 1000 || 0;

/** Valeurs de l'aperçu : déplacement (contraint à l'axe pour x, y), angle (pas de 1°, 15° avec Maj), facteur (0,01). */
export function apercuManip(poignee: Poignee, depart: Point2, courant: Point2, pivot: Point2, maj: boolean, angleRepere = 0): ApercuManip {
  const base: ApercuManip = { poignee, dx: 0, dy: 0, angle: 0, facteur: 1 };
  // Repère de saisie (D-091) : les flèches suivent ses axes.
  const ar = (angleRepere * Math.PI) / 180;
  const u = { x: Math.cos(ar), y: Math.sin(ar) };
  const v = { x: -u.y, y: u.x };
  const surAxe = (ax: { x: number; y: number }) => {
    const d = (courant.x - depart.x) * ax.x + (courant.y - depart.y) * ax.y;
    return { dx: arrondiMm(d * ax.x), dy: arrondiMm(d * ax.y) };
  };
  if (poignee === "x") return { ...base, ...surAxe(u) };
  if (poignee === "y") return { ...base, ...surAxe(v) };
  if (poignee === "c") return { ...base, dx: arrondiMm(courant.x - depart.x), dy: arrondiMm(courant.y - depart.y) };
  if (poignee === "r") {
    let a = ((Math.atan2(courant.y - pivot.y, courant.x - pivot.x) - Math.atan2(depart.y - pivot.y, depart.x - pivot.x)) * 180) / Math.PI;
    while (a > 180) a -= 360;
    while (a <= -180) a += 360;
    const pas = maj ? 15 : 1;
    return { ...base, angle: (Math.round(a / pas) * pas) || 0 };
  }
  const d0 = Math.hypot(depart.x - pivot.x, depart.y - pivot.y);
  const d1 = Math.hypot(courant.x - pivot.x, courant.y - pivot.y);
  return { ...base, facteur: d0 < 1e-9 ? 1 : Math.max(0.01, Math.round((d1 / d0) * 100) / 100) };
}

/** Valeur tapée pendant le glissement (D-077) : longueur le long de l'axe ou du geste, angle, facteur. */
export function valeurSaisie(m: ApercuManip, v: number, angleRepere = 0): ApercuManip | null {
  if (m.poignee === "r") return { ...m, angle: v };
  if (m.poignee === "s") return v > 0 ? { ...m, facteur: v } : null;
  if (m.poignee === "x" || m.poignee === "y") {
    const ar = (angleRepere * Math.PI) / 180;
    const ax = m.poignee === "x" ? { x: Math.cos(ar), y: Math.sin(ar) } : { x: -Math.sin(ar), y: Math.cos(ar) };
    const signe = m.dx * ax.x + m.dy * ax.y < 0 ? -1 : 1;
    return { ...m, dx: arrondiMm(signe * v * ax.x), dy: arrondiMm(signe * v * ax.y) };
  }
  const l = Math.hypot(m.dx, m.dy);
  if (l < 1e-12) return null;
  return { ...m, dx: arrondiMm((m.dx / l) * v), dy: arrondiMm((m.dy / l) * v) };
}

/** Commande émise au relâchement (null : rien à faire — vecteur, angle nuls ou facteur 1, comme par menu). */
export function commandeManip(m: ApercuManip, pivot: Point2, cibles: readonly string[]): { commande: Commande; label: string } | null {
  const n = cibles.length;
  const objets = `${n} objet${n > 1 ? "s" : ""}`;
  if (m.poignee === "r") return m.angle ? { commande: { type: "transformer.tourner", params: { centre: pivot, angle: { value: m.angle, unit: "deg" } }, cibles: [...cibles] }, label: `Tourner ${objets} de ${String(m.angle).replace(".", ",")}° (manipulateur)` } : null;
  if (m.poignee === "s") return Math.abs(m.facteur - 1) > 1e-9 ? { commande: { type: "transformer.echelle", params: { centre: pivot, facteur: m.facteur }, cibles: [...cibles] }, label: `Échelle × ${String(m.facteur).replace(".", ",")} (manipulateur)` } : null;
  return Math.hypot(m.dx, m.dy) > 1e-9 ? { commande: { type: "transformer.deplacer", params: { dx: m.dx, dy: m.dy }, cibles: [...cibles] }, label: `Déplacer ${objets} (${fmt(Math.hypot(m.dx, m.dy))} m, manipulateur)` } : null;
}

function transformEcran(m: ApercuManip, c: { x: number; y: number }, echelle: number): string {
  if (m.poignee === "r") return `rotate(${-m.angle} ${c.x} ${c.y})`;
  if (m.poignee === "s") return `translate(${c.x} ${c.y}) scale(${m.facteur}) translate(${-c.x} ${-c.y})`;
  return `translate(${m.dx * echelle} ${-m.dy * echelle})`;
}

const CIBLE = 44; // px : cible tactile minimale (cahier §8)

function Manipulateur2D({ boite, pr, manip, saisie, angle = 0 }: { boite: { min: Point2; max: Point2; pivot: Point2; pivotDeplace?: boolean }; pr: ReturnType<typeof projecteur>; manip: ApercuManip | null; saisie: string; angle?: number }) {
  const c = pr.vers(boite.pivot);
  const a = pr.vers(boite.min);
  const b = pr.vers(boite.max);
  const gauche = Math.min(a.x, b.x);
  const droite = Math.max(a.x, b.x);
  const haut = Math.min(a.y, b.y);
  const bas = Math.max(a.y, b.y);
  const L = 64;
  const rot = { x: droite + 28, y: haut - 28 };
  const cible = (x: number, y: number, p: Poignee, titre: string, cle?: string) => (
    <rect key={cle ?? p} x={x - CIBLE / 2} y={y - CIBLE / 2} width={CIBLE} height={CIBLE} className="manip-cible" data-poignee={p} pointerEvents="all">
      <title>{titre}</title>
    </rect>
  );
  const valeur = saisie ? `${saisie.replace(".", ",")} ⏎` : !manip ? "" : manip.poignee === "r" ? `${String(manip.angle).replace(".", ",")}°` : manip.poignee === "s" ? `× ${String(manip.facteur).replace(".", ",")}` : `dx ${fmt(manip.dx)} m · dy ${fmt(manip.dy)} m`;
  return (
    <g className="manipulateur-2d" data-manipulateur>
      <rect x={gauche} y={haut} width={droite - gauche} height={bas - haut} className="manip-boite" pointerEvents="none" />
      {[[gauche, haut], [droite, haut], [droite, bas], [gauche, bas]].map(([x, y], i) => (
        <g key={`s${i}`}>
          <rect x={x! - 5} y={y! - 5} width={10} height={10} className="manip-coin" pointerEvents="none" />
          {cible(x!, y!, "s", "Échelle uniforme autour du centre (glisser)", `s${i}`)}
        </g>
      ))}
      <line x1={c.x} y1={c.y} x2={rot.x} y2={rot.y} className="manip-tige" pointerEvents="none" />
      <circle cx={rot.x} cy={rot.y} r={8} className="manip-rotation" pointerEvents="none" />
      {cible(rot.x, rot.y, "r", "Tourner autour du centre (glisser ; Maj : pas de 15°)")}
      <g transform={angle ? `rotate(${-angle} ${c.x} ${c.y})` : undefined}>
      <line x1={c.x} y1={c.y} x2={c.x + L} y2={c.y} className="manip-axe manip-axe-x" pointerEvents="none" />
      <path d={`M ${c.x + L + 12} ${c.y} L ${c.x + L} ${c.y - 6} L ${c.x + L} ${c.y + 6} Z`} className="manip-fleche manip-axe-x" pointerEvents="none" />
      {cible(c.x + L, c.y, "x", "Déplacer le long de x (glisser)")}
      <line x1={c.x} y1={c.y} x2={c.x} y2={c.y - L} className="manip-axe manip-axe-y" pointerEvents="none" />
      <path d={`M ${c.x} ${c.y - L - 12} L ${c.x - 6} ${c.y - L} L ${c.x + 6} ${c.y - L} Z`} className="manip-fleche manip-axe-y" pointerEvents="none" />
      {cible(c.x, c.y - L, "y", "Déplacer le long de y (glisser)")}
      </g>
      <rect x={c.x - 7} y={c.y - 7} width={14} height={14} className="manip-centre" pointerEvents="none" />
      {cible(c.x, c.y, "c", "Déplacer librement (glisser)")}
      <line x1={c.x} y1={c.y} x2={c.x - 30} y2={c.y + 30} className="manip-tige" pointerEvents="none" />
      <circle cx={c.x - 30} cy={c.y + 30} r={6} className={boite.pivotDeplace ? "manip-pivot manip-pivot-deplace" : "manip-pivot"} pointerEvents="none" />
      {cible(c.x - 30, c.y + 30, "p", "Déplacer le pivot (glisser, accroché) ; clic : retour au centre")}
      <text x={c.x + 12} y={c.y + 22} className="plan-cote-apercu" role="status" aria-live="polite" data-manip-valeur>{valeur}</text>
    </g>
  );
}

/** Loupe de précision (D-085) : vue agrandie (× 3) autour du point visé, posée au-dessus du doigt, réticule au point accroché. */
function Loupe({ loupe, pr, idObjets, largeur }: { loupe: { sx: number; sy: number; point: Point2 }; pr: ReturnType<typeof projecteur>; idObjets: string; largeur: number }) {
  const R = 56;
  const k = 3;
  const cx = Math.min(Math.max(loupe.sx, R + 4), largeur - R - 4);
  const cy = loupe.sy - R - 48 < R + 4 ? loupe.sy + R + 48 : loupe.sy - R - 48;
  const q = pr.vers(loupe.point);
  const idClip = `${idObjets}-loupe`;
  return (
    <g className="plan-loupe" pointerEvents="none" data-loupe>
      <defs>
        <clipPath id={idClip}>
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={R} className="plan-loupe-fond" />
      <g clipPath={`url(#${idClip})`}>
        <use href={`#${idObjets}`} transform={`translate(${cx} ${cy}) scale(${k}) translate(${-q.x} ${-q.y})`} />
      </g>
      <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} className="plan-loupe-reticule" />
      <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} className="plan-loupe-reticule" />
      <circle cx={cx} cy={cy} r={R} className="plan-loupe-bord" />
    </g>
  );
}

/** Repère de saisie (D-091) : origine et axes x (rouge) et y (vert), dessinés au plan. */
function RepereSaisie({ repere, pr }: { repere: { origine: Point2; angle: number }; pr: ReturnType<typeof projecteur> }) {
  const o = pr.vers(repere.origine);
  return (
    <g className="plan-repere-saisie" transform={`rotate(${-repere.angle} ${o.x} ${o.y})`} pointerEvents="none" data-repere-saisie={repere.angle}>
      <line x1={o.x} y1={o.y} x2={o.x + 48} y2={o.y} className="manip-axe manip-axe-x" />
      <line x1={o.x} y1={o.y} x2={o.x} y2={o.y - 48} className="manip-axe manip-axe-y" />
      <circle cx={o.x} cy={o.y} r={4} className="manip-centre" />
      <text x={o.x + 52} y={o.y + 4} className="plan-cote-apercu">x′</text>
      <text x={o.x + 4} y={o.y - 52} className="plan-cote-apercu">y′</text>
    </g>
  );
}

/** Courbe (spline) seule sélectionnée, modifiable (non verrouillée), avec ses tangentes effectives (D-093). */
export interface CourbeTangentes {
  id: string;
  points: Point2[];
  ferme: boolean;
  /** Tangente imposée par point, ou null (libre). */
  imposees: (Point2 | null)[];
  /** Tangente effective par point : imposée, ou celle que la courbe suit d'elle-même ((suivant − précédent) / 2). */
  effectives: Point2[];
}

export function splineEditable(etat: ModeleAtelier, selection: readonly string[], niveauId: string | null): CourbeTangentes | null {
  if (selection.length !== 1) return null;
  const o = etat.objets[selection[0]!];
  if (!o || o.classe !== "esquisse" || o.niveauId !== niveauId || raisonVerrou(etat, o)) return null;
  const q = o.params as { forme: string; points: Point2[]; ferme?: boolean; tangentes?: (Point2 | null)[] };
  if (q.forme !== "spline" || q.points.length < 2) return null;
  const n = q.points.length;
  const ferme = !!q.ferme;
  const imposees = Array.from({ length: n }, (_, i) => (q.tangentes?.[i] ? pt(q.tangentes[i]!.x, q.tangentes[i]!.y) : null));
  const effectives = q.points.map((_, i) => {
    const t = imposees[i];
    if (t) return t;
    // Même convention que pointsSpline : extrémités d'une courbe ouverte doublées.
    const prec = ferme ? q.points[(i - 1 + n) % n]! : q.points[Math.max(0, i - 1)]!;
    const suiv = ferme ? q.points[(i + 1) % n]! : q.points[Math.min(n - 1, i + 1)]!;
    return pt((suiv.x - prec.x) / 2 || 0, (suiv.y - prec.y) / 2 || 0);
  });
  return { id: o.id, points: q.points.map((p) => pt(p.x, p.y)), ferme, imposees, effectives };
}

/** Poignée au tiers de la tangente (convention de Bézier : t = 3 · (poignée − point)). */
export function positionPoignee(p: Point2, t: Point2): Point2 {
  return pt(p.x + t.x / 3, p.y + t.y / 3);
}

/** Tangente tirée de la position de la poignée ; Maj : angle arrondi à 15°. Nulle (poignée sur le point) : null. */
export function tangenteDepuisPoignee(p: Point2, q: Point2, maj = false): Point2 | null {
  let x = 3 * (q.x - p.x);
  let y = 3 * (q.y - p.y);
  const l = Math.hypot(x, y);
  if (l < 1e-6) return null;
  if (maj) {
    const a = (Math.round(Math.atan2(y, x) / (Math.PI / 12)) * Math.PI) / 12;
    x = l * Math.cos(a);
    y = l * Math.sin(a);
  }
  const r = (v: number) => Math.round(v * 1e9) / 1e9 || 0;
  return pt(r(x), r(y));
}

export function commandeTangente(c: CourbeTangentes, i: number, v: Point2 | null): { commande: Commande; label: string } {
  const tangentes = c.imposees.map((t, k) => (k === i ? v : t));
  return {
    commande: { type: "objet.modifier", params: { id: c.id, params: { tangentes: tangentes.some((x) => x) ? tangentes : null } } },
    label: v ? `Tangente imposée au point ${i + 1} de ${c.id} (poignée)` : `Tangente libérée au point ${i + 1} de ${c.id}`,
  };
}

function PoigneesTangente({ courbe, apercu, pr }: { courbe: CourbeTangentes; apercu: { i: number; v: Point2 } | null; pr: ReturnType<typeof projecteur> }) {
  const tangentes = apercu ? courbe.imposees.map((t, k) => (k === apercu.i ? apercu.v : t)) : null;
  return (
    <g className="plan-tangentes" data-tangentes-courbe={courbe.id}>
      {tangentes && <path d={chemin(pr, pointsSpline(courbe.points, 16, courbe.ferme, tangentes), courbe.ferme)} className="plan-apercu-trait" pointerEvents="none" data-tangente-apercu={apercu!.i} />}
      {courbe.points.map((p, i) => {
        const t = apercu?.i === i ? apercu.v : courbe.effectives[i]!;
        const a = pr.vers(p);
        const b = pr.vers(positionPoignee(p, t));
        const imposee = apercu?.i === i || !!courbe.imposees[i];
        return (
          <g key={i} className={imposee ? "tangente-imposee" : "tangente-libre"}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} pointerEvents="none" />
            <circle cx={b.x} cy={b.y} r={5} pointerEvents="none" />
            {/* Cible de saisie plus large que la marque (doigt, stylet). */}
            <circle cx={b.x} cy={b.y} r={14} className="tangente-cible" data-tangente-poignee={i} data-imposee={imposee ? "oui" : "non"} pointerEvents="all">
              <title>{`Tangente au point ${i + 1} : glisser pour l'imposer (Maj : pas de 15°)${courbe.imposees[i] ? " ; Alt + clic : la libérer" : ""}`}</title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
