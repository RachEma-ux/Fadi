/**
 * Zone de travail 2D (cahier §5.7, UX3) : plan SVG du niveau actif, zoom à la molette ou au pincement, panoramique
 * (bouton du milieu, Espace + glisser, deux doigts), accrochages visibles, aperçu du tracé en cours, sélection au
 * clic ou au cadre. Toute modification passe par `onCommandes` (bus de commandes) ; rien n'est écrit ici.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cercleTroisPoints, distance, polygoneMur, polygoneRegulier, pt, type Commande, type ModeleAtelier, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
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

const LIBELLE_ACCROCHE: Record<string, string> = { extremite: "Extrémité", milieu: "Milieu", centre: "Centre", perpendiculaire: "Perpendiculaire", intersection: "Intersection", orthogonal: "Orthogonal", grille: "Grille", libre: "" };

const OUTILS_CONTOUR = new Set(["dalle", "toiture", "zone", "espace", "solide", "polygone", "hachure", "polyligne", "spline", "garde-corps"]);
const OUTILS_SEGMENT = new Set(["mur", "escalier", "ligne", "construction", "cotation", "mesurer", "deplacer", "copier", "miroir", "etirer", "rectangle", "cercle", "arc", "tourner", "echelle"]);

const AUCUNE: NonNullable<PropsPlan2D["externes"]> = [];

export function Plan2D({ etat, ui, readOnly, onResultat, onTerminer, onCommandes, externes = AUCUNE }: PropsPlan2D) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [taille, setTaille] = useState({ w: 800, h: 600 });
  const [accroche, setAccroche] = useState<Accroche | null>(null);
  const [cadre, setCadre] = useState<{ a: Point2; b: Point2 } | null>(null);
  const glisse = useRef<{ mode: "pan" | "cadre" | "deplacer" | "lasso"; x: number; y: number; vue: EtatUi["vue"]; depart: Point2; bouge: boolean } | null>(null);
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
    if (g?.mode === "lasso") {
      const dernier = lassoPoints.current[lassoPoints.current.length - 1];
      // Un point tous les 4 px environ : le contour reste léger.
      if (!dernier || Math.hypot((p.x - dernier.x) * pr.echelle, (p.y - dernier.y) * pr.echelle) > 4) {
        lassoPoints.current = [...lassoPoints.current, p];
        g.bouge = g.bouge || lassoPoints.current.length > 2;
        setLasso(lassoPoints.current);
      }
      return;
    }
    if (g?.mode === "deplacer") {
      g.bouge = g.bouge || Math.hypot(sx - g.x, sy - g.y) > 4;
      if (g.bouge) {
        // La destination s'accroche aux autres objets (jamais à ceux qu'on déplace).
        const a = accrocher(p, cache, ui.accrochages, rayon, g.depart, ui.selection);
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
    const depuis = ui.pointsEnCours[ui.pointsEnCours.length - 1] ?? null;
    const a = accrocher(p, cache, ui.accrochages, rayon, depuis);
    setAccroche(a);
    etatUi.set({ curseur: a.point });
  }

  function surAppui(e: ReactPointerEvent<SVGSVGElement>) {
    const el = svgRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
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
    if (ui.outil === "lasso" || (ui.outil === "selection" && e.altKey)) {
      lassoPoints.current = [p];
      glisse.current = { mode: "lasso", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      return;
    }
    if (ui.outil === "selection") {
      const sous = objetSousPointeur(p, cache, etat, ui.niveauId, rayon);
      if (sous && ui.selection.includes(sous.objetId) && !e.shiftKey && !readOnly) {
        // Saisir la sélection par un point remarquable (extrémité, milieu…) pour la poser avec précision.
        const prise = accrocher(p, cache, ui.accrochages, rayon, null).point;
        glisse.current = { mode: "deplacer", x: sx, y: sy, vue: ui.vue, depart: prise, bouge: false };
        return;
      }
      glisse.current = { mode: "cadre", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
      return;
    }
    // Au doigt, un glisser sur le fond déplace la vue ; le tracé se fait par touchers successifs.
    if (e.pointerType === "touch") glisse.current = { mode: "pan", x: sx, y: sy, vue: ui.vue, depart: p, bouge: false };
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
    const p = pr.depuis(sx, sy);
    if (g?.mode === "pan" && (g.bouge || e.pointerType !== "touch")) return;
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
    const a = e.pointerType === "touch" || !accroche ? accrocher(p, cache, ui.accrochages, rayon * (e.pointerType === "touch" ? 2 : 1), depuis) : accroche;
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

  const pasGrille = ui.accrochages.pasGrille * ui.vue.echelle;
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
      {ui.accrochages.grille && pasGrille >= 8 && (
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
      <g className="plan-objets">
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
        {pts.length > 0 && curseur && <Apercu outil={ui.outil} pts={pts} curseur={curseur} ui={ui} pr={pr} />}
        {pts.map((p, i) => {
          const s = pr.vers(p);
          return <circle key={i} cx={s.x} cy={s.y} r={3} className="plan-point" />;
        })}
        {accroche && accroche.type !== "libre" && <MarqueAccroche a={accroche} pr={pr} />}
        {cadre && <CadreSelection a={pr.vers(cadre.a)} b={pr.vers(cadre.b)} />}
        {lasso && lasso.length > 1 && <path className="plan-lasso" d={chemin(pr, lasso, true)} data-lasso={lasso.length} />}
      </g>
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
