/**
 * Accrochages du plan 2D (DA-02-15, D-012) : extrémité, milieu, centre, perpendiculaire, intersection,
 * orthogonal, grille. Rayon à l'écran (12 px, D-012) converti en mètres par l'échelle de la vue. Les accrochages
 * d'objet priment sur l'orthogonal, qui prime sur la grille. Fonctions pures : testables sans DOM.
 */
import { intersectionSegments, pointsEllipse, projectionSurSegment, type ModeleAtelier, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { pt } from "@parcours/atelier-model";
import type { Accrochages } from "../etat-ui";

export type TypeAccroche = "extremite" | "milieu" | "centre" | "perpendiculaire" | "intersection" | "orthogonal" | "grille" | "libre";

export interface Accroche {
  point: Point2;
  type: TypeAccroche;
  objetId: string | null;
}

interface Segment {
  a: Point2;
  b: Point2;
  objetId: string;
}

/** Identifiant porté par les segments d'une référence externe (DA-05-11) dans le cache d'accrochage. */
export const PREFIXE_EXTERNE = "externe:";

/** Ajoute au cache les traits d'une référence externe (déjà convertis dans le repère du projet). */
export function avecExternes(cache: ReturnType<typeof segmentsDuNiveau>, externes: readonly { id: string; traits: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[] }[]): ReturnType<typeof segmentsDuNiveau> {
  if (!externes.length) return cache;
  const segments = [...cache.segments];
  for (const x of externes) for (const t of x.traits.slice(0, 20000)) segments.push({ a: pt(t.a.x, t.a.y), b: pt(t.b.x, t.b.y), objetId: `${PREFIXE_EXTERNE}${x.id}` });
  return { segments, centres: cache.centres };
}

/** Segments et points remarquables d'un niveau (axes de murs, contours, esquisses, escaliers). */
export function segmentsDuNiveau(etat: ModeleAtelier, niveauId: string | null): { segments: Segment[]; centres: { p: Point2; objetId: string }[] } {
  const segments: Segment[] = [];
  const centres: { p: Point2; objetId: string }[] = [];
  const contour = (pts: Point2[], objetId: string, ferme = true) => {
    for (let i = 0; i + 1 < pts.length; i++) segments.push({ a: pts[i]!, b: pts[i + 1]!, objetId });
    if (ferme && pts.length > 2) segments.push({ a: pts[pts.length - 1]!, b: pts[0]!, objetId });
  };
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.niveauId !== niveauId) continue;
    switch (o.classe) {
      case "mur":
      case "escalier":
        segments.push({ a: o.params.a, b: o.params.b, objetId: o.id });
        break;
      case "dalle":
      case "toiture":
      case "zone":
      case "solide":
      case "piece":
      case "reference-plan":
        contour(o.params.contour, o.id, o.classe !== "solide" || o.params.ferme);
        for (const t of o.params.trous) contour(t, o.id);
        break;
      case "espace":
        for (const pg of o.params.polygones) contour(pg.contour, o.id);
        break;
      case "esquisse":
        if (o.params.centre) centres.push({ p: o.params.centre, objetId: o.id });
        if (o.params.points.length >= 2) contour(o.params.points, o.id, o.params.ferme);
        // Ellipse (D-046) : son contour discrétisé sert à la sélection et à l'accrochage.
        if (o.params.forme === "ellipse" && o.params.centre && o.params.rayon && o.params.rayonB) contour(pointsEllipse(o.params.centre, o.params.rayon.value, o.params.rayonB.value, o.params.rotation?.value ?? 0, 48), o.id);
        break;
      case "poteau":
        centres.push({ p: o.params.point, objetId: o.id });
        break;
      case "garde-corps":
        if (o.params.points.length >= 2) contour(o.params.points, o.id, o.params.ferme);
        break;
      case "objet-importe":
        // Emprise de la représentation importée : sélection et accrochage sur son contour.
        if (o.params.empreinte.length >= 2) contour(o.params.empreinte, o.id);
        break;
      case "cotation":
        segments.push({ a: o.params.a, b: o.params.b, objetId: o.id });
        break;
      default:
        break;
    }
  }
  return { segments, centres };
}

const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Point accroché pour un pointeur `p` ; `depuis` est le point précédent du tracé (perpendiculaire, orthogonal).
 * `rayon` en mètres (12 px / échelle).
 */
export function accrocher(p: Point2, cache: ReturnType<typeof segmentsDuNiveau>, options: Accrochages, rayon: number, depuis: Point2 | null, exclure: readonly string[] = []): Accroche {
  let meilleur: Accroche | null = null;
  let meilleureDist = rayon;
  const essayer = (point: Point2, type: TypeAccroche, objetId: string | null, priorite = 0) => {
    const d = dist(p, point) - priorite * 1e-6;
    if (d <= meilleureDist) {
      meilleureDist = d;
      meilleur = { point, type, objetId };
    }
  };
  const segs = cache.segments.filter((s) => !exclure.includes(s.objetId));
  if (options.extremite) for (const s of segs) {
    essayer(s.a, "extremite", s.objetId, 3);
    essayer(s.b, "extremite", s.objetId, 3);
  }
  if (options.centre) for (const c of cache.centres) if (!exclure.includes(c.objetId)) essayer(c.p, "centre", c.objetId, 2);
  if (options.milieu) for (const s of segs) essayer(pt((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2), "milieu", s.objetId, 2);
  if (options.intersection) {
    const proches = segs.filter((s) => projectionSurSegment(p, s.a, s.b).distance <= rayon * 2);
    for (let i = 0; i < proches.length; i++) for (let j = i + 1; j < proches.length; j++) {
      const x = intersectionSegments(proches[i]!.a, proches[i]!.b, proches[j]!.a, proches[j]!.b);
      if (x) essayer(pt(x.point.x, x.point.y), "intersection", proches[i]!.objetId, 1);
    }
  }
  if (options.perpendiculaire && depuis) {
    for (const s of segs) {
      const pr = projectionSurSegment(depuis, s.a, s.b);
      if (pr.t > 0 && pr.t < 1) essayer(pt(pr.point.x, pr.point.y), "perpendiculaire", s.objetId, 0);
    }
  }
  if (meilleur) return meilleur;
  if (options.orthogonal && depuis) {
    const dx = p.x - depuis.x;
    const dy = p.y - depuis.y;
    const l = Math.hypot(dx, dy);
    if (l > 1e-9) {
      const angle = Math.atan2(dy, dx);
      const pas = Math.PI / 4;
      const arrondi = Math.round(angle / pas) * pas;
      if (Math.abs(angle - arrondi) < (rayon / Math.max(l, 1e-9)) * 2) {
        const q = pt(depuis.x + l * Math.cos(arrondi), depuis.y + l * Math.sin(arrondi));
        return { point: options.grille ? surGrille(q, options.pasGrille) : q, type: "orthogonal", objetId: null };
      }
    }
  }
  if (options.grille) return { point: surGrille(p, options.pasGrille), type: "grille", objetId: null };
  return { point: p, type: "libre", objetId: null };
}

export function surGrille(p: Point2, pas: number): Point2 {
  if (!(pas > 0)) return p;
  return pt(Math.round(p.x / pas) * pas, Math.round(p.y / pas) * pas);
}

/** Objet le plus proche du pointeur (sélection au clic), avec la distance en mètres. */
export function objetSousPointeur(p: Point2, cache: ReturnType<typeof segmentsDuNiveau>, etat: ModeleAtelier, niveauId: string | null, rayon: number): { objetId: string; distance: number } | null {
  let meilleur: { objetId: string; distance: number } | null = null;
  for (const s of cache.segments) {
    // Traits d'une référence externe : accrochables, jamais sélectionnables (lecture seule).
    if (s.objetId.startsWith(PREFIXE_EXTERNE)) continue;
    const d = projectionSurSegment(p, s.a, s.b).distance;
    const o = etat.objets[s.objetId];
    // Les murs sont cliquables sur toute leur épaisseur.
    const marge = o?.classe === "mur" ? o.params.epaisseur.value / 2 : 0;
    const eff = Math.max(0, d - marge);
    if (eff <= rayon && (!meilleur || eff < meilleur.distance)) meilleur = { objetId: s.objetId, distance: eff };
  }
  for (const c of cache.centres) {
    const o = etat.objets[c.objetId];
    const marge = o?.classe === "poteau" ? Math.max(o.params.largeur.value, o.params.profondeur.value) / 2 : 0;
    const d = Math.max(0, dist(p, c.p) - marge);
    if (d <= rayon && (!meilleur || d < meilleur.distance)) meilleur = { objetId: c.objetId, distance: d };
  }
  // Ouvertures : point sur l'axe du mur hôte.
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.niveauId !== niveauId) continue;
    if (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") {
      const hote = etat.objets[o.params.murHoteId];
      if (!hote || hote.classe !== "mur") continue;
      const c = pt(hote.params.a.x + (hote.params.b.x - hote.params.a.x) * o.params.position, hote.params.a.y + (hote.params.b.y - hote.params.a.y) * o.params.position);
      const d = Math.max(0, dist(p, c) - o.params.largeur.value / 2);
      if (d <= rayon && (!meilleur || d < meilleur.distance + 1e-9)) meilleur = { objetId: o.id, distance: Math.max(0, d - 1e-6) };
    } else if (o.classe === "texte" || o.classe === "etiquette") {
      const d = dist(p, o.params.position);
      if (d <= rayon * 2 && (!meilleur || d < meilleur.distance)) meilleur = { objetId: o.id, distance: d };
    }
  }
  return meilleur;
}
