/**
 * Outils de courbes (famille Dessin) : Cercle (centre puis un point du cercle), Arc (trois points, ou centre, début et
 * fin selon `modeArc`), Polyligne (sommets successifs ; un clic sur le premier sommet la ferme). Les constructions par
 * points sont pures (`studioArcFromThreePoints`, `studioArcFromCenter`).
 */
import { studioArcFromCenter, studioArcFromThreePoints, type StudioArcGeometry, type StudioPoint } from "@parcours/atelier-model";
import { calqueDe, ERREUR_POINTS_CONFONDUS, memePoint, micro, type ActionOutil, type ContexteCreation, type ModeArc, type OutilPlanche } from "./type";

export function commandeCercle(c: ContexteCreation, center: StudioPoint, radius: number): ActionOutil {
  if (!(radius > 0)) return { type: "erreur", message: "Le rayon doit être strictement positif." };
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.cercle", params: { id: c.nouvelId(), type: "circle", ...calqueDe(c), center: { ...center }, radius: micro(radius) } }] };
}

export function commandeArc(c: ContexteCreation, g: StudioArcGeometry | null): ActionOutil {
  if (!g) return { type: "erreur", message: "Arc impossible : points alignés ou confondus." };
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.arc", params: { id: c.nouvelId(), type: "arc", ...calqueDe(c), center: { x: micro(g.center.x), y: micro(g.center.y) }, radius: micro(g.radius), startAngle: g.startAngle, endAngle: g.endAngle } }] };
}

export function commandePolyligne(c: ContexteCreation, points: readonly StudioPoint[], closed: boolean): ActionOutil {
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.polyligne", params: { id: c.nouvelId(), type: "polyline", ...calqueDe(c), points: points.map(p => ({ ...p })), closed } }] };
}

const arcPar = (mode: ModeArc, a: StudioPoint, second: StudioPoint, b: StudioPoint) => (mode === "centre" ? studioArcFromCenter(a, second, b) : studioArcFromThreePoints(a, second, b));
const finTrace = (r: ActionOutil): ActionOutil => (r.type === "commandes" ? { ...r, apres: "annuler-trace" } : r);

export const OUTIL_CERCLE: OutilPlanche = {
  ids: ["studio.dessin.cercle"],
  clic(e, p, c) {
    const a = e.trace.point, b = p.point;
    if (memePoint(a, b)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
    return finTrace(commandeCercle(c, a, Math.hypot(b.x - a.x, b.y - a.y)));
  },
  apercu(e, fin) {
    const a = e.trace.point;
    const radius = Math.hypot(fin.x - a.x, fin.y - a.y);
    return radius > 0 ? { id: "apercu", type: "circle", center: a, radius } : null;
  },
  aideTrace: () => "Centre placé. Cliquez un point du cercle. Échap pour annuler.",
};

export const OUTIL_ARC: OutilPlanche = {
  ids: ["studio.dessin.arc"],
  clic(e, p, c) {
    const a = e.trace.point, b = p.point;
    if (memePoint(a, b)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
    const second = e.suite[0];
    if (!second) return { type: "sommet", suite: [b] };
    if (memePoint(second, b)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
    return finTrace(commandeArc(c, arcPar(e.modeArc, a, second, b)));
  },
  apercu(e, fin) {
    if (!e.suite[0]) return null;
    const g = arcPar(e.modeArc, e.trace.point, e.suite[0], fin);
    return g ? { id: "apercu", type: "arc", ...g } : null;
  },
  aideTrace: (e) => (e.suite.length === 0
    ? (e.modeArc === "centre" ? "Centre placé. Cliquez le début de l’arc (il fixe le rayon)." : "Début placé. Cliquez un point de passage de l’arc.")
    : (e.modeArc === "centre" ? "Cliquez la direction de la fin de l’arc (sens trigonométrique)." : "Cliquez la fin de l’arc.")),
};

export const OUTIL_POLYLIGNE: OutilPlanche = {
  ids: ["studio.dessin.polyligne"],
  clic(e, p, c) {
    const a = e.trace.point, b = p.point;
    // Un clic sur le premier sommet (à la tolérance d'accrochage) ferme la polyligne.
    if (e.suite.length >= 2 && Math.hypot(b.x - a.x, b.y - a.y) <= c.tolerance) return { type: "terminer-polyligne", fermee: true };
    const dernier = e.suite[e.suite.length - 1] ?? a;
    if (dernier.x === b.x && dernier.y === b.y) return { type: "erreur", message: "Deux sommets consécutifs doivent être distincts." };
    return { type: "sommet", suite: [...e.suite, b] };
  },
  apercu: (e, fin) => ({ id: "apercu", type: "polyline", points: [e.trace.point, ...e.suite, fin], closed: false }),
  aideTrace: () => "Cliquez les sommets suivants ; Entrée termine, Maj+Entrée ou un clic sur le premier sommet ferme. Échap pour annuler.",
};
