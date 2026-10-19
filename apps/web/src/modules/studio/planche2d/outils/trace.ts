/** Outils de tracé à deux points (famille Dessin) : Ligne, Rectangle (deux coins opposés), Cote (deux sommets, liée s'ils sont accrochés). */
import type { StudioPoint } from "@parcours/atelier-model";
import type { PointPose } from "../Dessin2D";
import { nouvelleCote } from "../geometrie-2d";
import type { StudioToolId } from "../raccourcis";
import { AIDE_DEFAUT, calqueDe, ecart, ERREUR_POINTS_CONFONDUS, memePoint, type ActionOutil, type ContexteCreation, type OutilPlanche } from "./type";

/** Ligne de `start` à `end`, ou rectangle de coins opposés `start` et `end` (outil Rectangle). */
export function commandeTrace(outil: StudioToolId, c: ContexteCreation, start: StudioPoint, end: StudioPoint): ActionOutil {
  if (outil === "studio.dessin.rectangle") {
    return { type: "commandes", commandes: [{ toolId: "studio.dessin.rectangle", params: { id: c.nouvelId(), type: "rectangle", ...calqueDe(c), origin: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }, width: Math.abs(ecart(start.x, end.x)), height: Math.abs(ecart(start.y, end.y)) } }] };
  }
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.ligne", params: { id: c.nouvelId(), type: "line", ...calqueDe(c), start, end } }] };
}

/** Cote de `debut` à `fin` ; un point accroché lie l'extrémité au sommet de l'objet. */
export function commandeCote(c: ContexteCreation, debut: PointPose, fin: PointPose): ActionOutil {
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.cote", params: nouvelleCote(c.nouvelId(), debut, fin, Number.isFinite(c.decalageCote) ? c.decalageCote : 0.5, c.layerId) }] };
}

export const OUTILS_TRACE_DEUX_POINTS: OutilPlanche = {
  ids: ["studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cote"],
  clic(e, p, c) {
    const a = e.trace.point, b = p.point;
    if (memePoint(a, b)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
    if (e.outil === "studio.dessin.rectangle" && (a.x === b.x || a.y === b.y)) return { type: "erreur", message: "La largeur et la hauteur doivent être strictement positives." };
    const r = e.outil === "studio.dessin.cote" ? commandeCote(c, e.trace, p) : commandeTrace(e.outil, c, a, b);
    return r.type === "commandes" ? { ...r, apres: "fin-trace" } : r;
  },
  aideRepos: (e) => (e.outil === "studio.dessin.cote" ? "Cote : cliquez deux points ; près d’un sommet, le point s’y accroche et la cote suit l’objet." : AIDE_DEFAUT),
};
