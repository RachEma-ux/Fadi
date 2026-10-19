/**
 * Outils d'annotation (famille Dessin) : Cote angulaire (deux clics sur deux segments droits d'une ligne ou d'une
 * polyligne : cote liée qui suit les segments ; sinon sommet puis un point sur chaque rayon : cote libre) et Texte (un
 * clic pose le texte saisi dans le panneau). La géométrie liée est celle du modèle (`studioAngularFromSegments`) ; le
 * contenu d'un texte est une donnée du projet, envoyée telle quelle (jamais traduite).
 */
import {
  studioAngleNormal, studioAngularFromSegments, studioAngularValue, studioStraightSegment, STUDIO_TEXT_MAX,
  type StudioAngularLink, type StudioDocument, type StudioPoint,
} from "@parcours/atelier-model";
import { estVisible } from "../calques";
import { calqueDe, ERREUR_POINTS_CONFONDUS, memePoint, type ActionOutil, type ContexteCreation, type OutilPlanche } from "./type";

/** Segment droit visé : le plus proche à `tolerance` (mètres) au plus, sur une ligne ou une polyligne affichée. */
export interface SegmentVise extends StudioAngularLink { a: StudioPoint; b: StudioPoint }

function distanceSegment(p: StudioPoint, a: StudioPoint, b: StudioPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function segmentVise(doc: StudioDocument, p: StudioPoint, tolerance: number): SegmentVise | null {
  let best: SegmentVise | null = null, dist = Infinity;
  for (const o of doc.objects) {
    if ((o.type !== "line" && o.type !== "polyline") || !estVisible(doc, o.layerId)) continue;
    const n = o.type === "line" ? 1 : o.closed ? o.points.length : o.points.length - 1;
    for (let segment = 0; segment < n; segment++) {
      const s = studioStraightSegment(o, segment);
      if (!s) continue;
      const d = distanceSegment(p, s.a, s.b);
      if (d <= tolerance && d < dist) { best = { objectId: o.id, segment, ...s }; dist = d; }
    }
  }
  return best;
}

const rayon = (c: ContexteCreation): number | null => (c.rayonAngulaire !== undefined && Number.isFinite(c.rayonAngulaire) && c.rayonAngulaire > 0 ? c.rayonAngulaire : null);
const ERREUR_RAYON = "Le rayon de l’arc doit être strictement positif.";

/** Cote angulaire libre : sommet, un point sur le premier rayon, un point sur le second (sens trigonométrique). */
export function commandeCoteAngulaireLibre(c: ContexteCreation, vertex: StudioPoint, first: StudioPoint, second: StudioPoint): ActionOutil {
  const radius = rayon(c);
  if (radius === null) return { type: "erreur", message: ERREUR_RAYON };
  if (memePoint(vertex, first) || memePoint(vertex, second)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
  if (studioAngularValue({ vertex, first, second, toResolve: false }) === 0) return { type: "erreur", message: "Les deux rayons sont confondus : angle nul." };
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.cote-angulaire", params: {
    id: c.nouvelId(), type: "angular-dimension", ...calqueDe(c), vertex: { ...vertex }, first: { ...first }, second: { ...second }, radius, links: { first: null, second: null }, toResolve: false,
  } }] };
}

/** Cote angulaire liée à deux segments : sommet à l'intersection, elle suit les segments. */
export function commandeCoteAngulaireLiee(c: ContexteCreation, s1: SegmentVise, s2: SegmentVise): ActionOutil {
  const radius = rayon(c);
  if (radius === null) return { type: "erreur", message: ERREUR_RAYON };
  if (s1.objectId === s2.objectId && s1.segment === s2.segment) return { type: "erreur", message: "Choisissez deux segments différents." };
  const g = studioAngularFromSegments(s1, s2);
  if (!g) return { type: "erreur", message: "Segments parallèles : angle indéterminé." };
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.cote-angulaire", params: {
    id: c.nouvelId(), type: "angular-dimension", ...calqueDe(c), ...g, radius,
    links: { first: { objectId: s1.objectId, segment: s1.segment }, second: { objectId: s2.objectId, segment: s2.segment } }, toResolve: false,
  } }] };
}

/** Texte saisi posé en `position` (rotation saisie en degrés, stockée en radians). */
export function commandeTexte(c: ContexteCreation, position: StudioPoint): ActionOutil {
  const t = c.texte;
  if (!t || !t.contenu.trim()) return { type: "erreur", message: "Saisissez le texte à poser." };
  if (/[\u0000-\u001F\u007F]/.test(t.contenu)) return { type: "erreur", message: "Le texte tient sur une seule ligne." };
  if ([...t.contenu].length > STUDIO_TEXT_MAX) return { type: "erreur", message: "Le texte compte 500 caractères au plus." };
  if (!(Number.isFinite(t.hauteur) && t.hauteur > 0)) return { type: "erreur", message: "La hauteur du texte doit être strictement positive." };
  if (!Number.isFinite(t.rotation)) return { type: "erreur", message: "Saisissez des nombres finis dans tous les champs." };
  return { type: "commandes", commandes: [{ toolId: "studio.dessin.texte", params: {
    id: c.nouvelId(), type: "text", ...calqueDe(c), position: { ...position }, height: t.hauteur, rotation: studioAngleNormal((t.rotation * Math.PI) / 180), content: t.contenu, justification: t.justification,
  } }] };
}

export const OUTIL_COTE_ANGULAIRE: OutilPlanche = {
  ids: ["studio.dessin.cote-angulaire"],
  clic(e, p, c) {
    const a = e.trace.point, b = p.point;
    const premier = e.suite[0];
    if (!premier) {
      // Deux clics sur deux segments droits : cote liée.
      const s1 = c.document ? segmentVise(c.document, a, c.tolerance) : null;
      const s2 = c.document ? segmentVise(c.document, b, c.tolerance) : null;
      if (s1 && s2 && (s1.objectId !== s2.objectId || s1.segment !== s2.segment)) {
        const r = commandeCoteAngulaireLiee(c, s1, s2);
        return r.type === "commandes" ? { ...r, apres: "annuler-trace" } : r;
      }
      if (memePoint(a, b)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
      return { type: "sommet", suite: [b] };
    }
    const r = commandeCoteAngulaireLibre(c, a, premier, b);
    return r.type === "commandes" ? { ...r, apres: "annuler-trace" } : r;
  },
  aideTrace: (e) => (e.suite.length === 0
    ? "Cliquez le second segment (cote liée), ou un point du premier rayon (cote libre). Échap pour annuler."
    : "Cliquez un point du second rayon (sens trigonométrique). Échap pour annuler."),
  aideRepos: () => "Cote angulaire : cliquez deux segments (ligne, polyligne) pour une cote qui les suit, ou le sommet puis un point sur chaque rayon.",
};

export const OUTIL_TEXTE: OutilPlanche = {
  ids: ["studio.dessin.texte"],
  premierClic: (p, c) => commandeTexte(c, p.point),
  clic: (_e, p, c) => commandeTexte(c, p.point),
  aideRepos: () => "Texte : saisissez le texte dans le panneau, puis cliquez son point d’insertion.",
};
