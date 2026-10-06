/**
 * Accrochages du plan 2D (DA-02-15, D-012) : extrémité, milieu, centre, perpendiculaire, intersection,
 * orthogonal, grille. Rayon à l'écran (12 px, D-012) converti en mètres par l'échelle de la vue. Les accrochages
 * d'objet priment sur l'orthogonal, qui prime sur la grille. Fonctions pures : testables sans DOM.
 */
import { facesMur, intersectionSegments, longueurAxeMur, pointAxeMur, pointsEllipse, pointsRenflement, projectionSurSegment, type ModeleAtelier, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { contoursArchitecture, pt, traitsBloc } from "@parcours/atelier-model";
import type { Accrochages } from "../etat-ui";

export type TypeAccroche = "extremite" | "milieu" | "centre" | "quadrant" | "perpendiculaire" | "tangente" | "intersection" | "proche" | "parallele" | "orthogonal" | "grille" | "libre";

export interface Accroche {
  point: Point2;
  type: TypeAccroche;
  objetId: string | null;
}

interface Segment {
  a: Point2;
  b: Point2;
  objetId: string;
  /** Morceau d'un segment en arc (D-063) : sélection, intersections et « proche », sans extrémité ni milieu. */
  courbe?: true;
}

/** Identifiant porté par les segments d'une référence externe (DA-05-11) dans le cache d'accrochage. */
export const PREFIXE_EXTERNE = "externe:";

/** Ajoute au cache les traits d'une référence externe (déjà convertis dans le repère du projet). */
export function avecExternes(cache: ReturnType<typeof segmentsDuNiveau>, externes: readonly { id: string; traits: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[] }[]): ReturnType<typeof segmentsDuNiveau> {
  if (!externes.length) return cache;
  const segments = [...cache.segments];
  for (const x of externes) for (const t of x.traits.slice(0, 20000)) segments.push({ a: pt(t.a.x, t.a.y), b: pt(t.b.x, t.b.y), objetId: `${PREFIXE_EXTERNE}${x.id}` });
  return { segments, centres: cache.centres, quadrants: cache.quadrants, faces: cache.faces };
}

/** Segments et points remarquables d'un niveau (axes de murs, contours, esquisses, escaliers). */
export function segmentsDuNiveau(etat: ModeleAtelier, niveauId: string | null): { segments: Segment[]; centres: { p: Point2; objetId: string }[]; quadrants: { p: Point2; objetId: string }[]; faces?: Segment[]; cercles?: { c: Point2; r: number; debut: number; fin: number; objetId: string }[] } {
  // Cercles et arcs (D-151) : points de tangence depuis le point précédent du tracé.
  const cercles: { c: Point2; r: number; debut: number; fin: number; objetId: string }[] = [];
  const segments: Segment[] = [];
  // Faces des murs (D-061) : servent seulement à l'accrochage « proche » (pas d'extrémités ni de milieux en plus).
  const faces: Segment[] = [];
  const centres: { p: Point2; objetId: string }[] = [];
  // Quadrants des cercles et extrémités d'axes des ellipses (D-050).
  const quadrants: { p: Point2; objetId: string }[] = [];
  const contour = (pts: Point2[], objetId: string, ferme = true) => {
    for (let i = 0; i + 1 < pts.length; i++) segments.push({ a: pts[i]!, b: pts[i + 1]!, objetId });
    if (ferme && pts.length > 2) segments.push({ a: pts[pts.length - 1]!, b: pts[0]!, objetId });
  };
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.niveauId !== niveauId) continue;
    switch (o.classe) {
      case "mur": {
        if (o.params.renflement) {
          // Mur courbe (D-086) : axe en arc discrétisé (extrémités accrochables, sans milieux de morceaux).
          const arc = [o.params.a, ...pointsRenflement(o.params.a, o.params.b, o.params.renflement, 5)];
          for (let i = 0; i + 1 < arc.length; i++) segments.push({ a: arc[i]!, b: arc[i + 1]!, objetId: o.id, courbe: true });
          segments.push({ a: o.params.a, b: o.params.a, objetId: o.id });
          segments.push({ a: o.params.b, b: o.params.b, objetId: o.id });
          break;
        }
        segments.push({ a: o.params.a, b: o.params.b, objetId: o.id });
        const f = facesMur(o.params.a, o.params.b, o.params.epaisseur.value, o.params.alignement);
        faces.push({ a: pt(f.gauche[0].x, f.gauche[0].y), b: pt(f.gauche[1].x, f.gauche[1].y), objetId: o.id }, { a: pt(f.droite[0].x, f.droite[0].y), b: pt(f.droite[1].x, f.droite[1].y), objetId: o.id });
        break;
      }
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
        if ((o.params.forme === "cercle" || o.params.forme === "arc") && o.params.centre && o.params.rayon) cercles.push({ c: o.params.centre, r: o.params.rayon.value, debut: o.params.forme === "arc" ? (o.params.angleDebut?.value ?? 0) : 0, fin: o.params.forme === "arc" ? (o.params.angleFin?.value ?? 360) : 360, objetId: o.id });
        if (o.params.forme === "cercle" && o.params.centre && o.params.rayon) {
          const { x, y } = o.params.centre;
          const r = o.params.rayon.value;
          for (const q of [pt(x + r, y), pt(x, y + r), pt(x - r, y), pt(x, y - r)]) quadrants.push({ p: q, objetId: o.id });
        }
        if (o.params.forme === "ellipse" && o.params.centre && o.params.rayon && o.params.rayonB) for (const q of pointsEllipse(o.params.centre, o.params.rayon.value, o.params.rayonB.value, o.params.rotation?.value ?? 0, 4)) quadrants.push({ p: q, objetId: o.id });
        if (o.params.renflements) {
          // Polyligne à segments en arc (D-063) : sommets et côtés droits accrochables ; arcs en morceaux « courbes ».
          const q = o.params.points;
          const n = q.length - 1 + (o.params.ferme && q.length > 2 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const a = q[i]!;
            const b = q[(i + 1) % q.length]!;
            const r = o.params.renflements[i] ?? 0;
            if (r === 0) segments.push({ a, b, objetId: o.id });
            else {
              const arc = [a, ...pointsRenflement(a, b, r)];
              for (let k = 0; k + 1 < arc.length; k++) segments.push({ a: arc[k]!, b: arc[k + 1]!, objetId: o.id, courbe: true });
              // Les deux extrémités de l'arc restent des sommets.
              segments.push({ a, b: a, objetId: o.id }, { a: b, b, objetId: o.id });
            }
          }
        } else if (o.params.points.length >= 2) contour(o.params.points, o.id, o.params.ferme);
        // Ellipse (D-046) : son contour discrétisé sert à la sélection et à l'accrochage.
        if (o.params.forme === "ellipse" && o.params.centre && o.params.rayon && o.params.rayonB) contour(pointsEllipse(o.params.centre, o.params.rayon.value, o.params.rayonB.value, o.params.rotation?.value ?? 0, 48), o.id);
        break;
      case "poteau": {
        centres.push({ p: o.params.point, objetId: o.id });
        // Contour de la section (D-139) : sommets et arêtes accrochables.
        const sec = contoursArchitecture("poteau", o.params as unknown as Record<string, unknown>);
        if (sec) contour(sec.contour.map((q) => pt(q.x, q.y)), o.id, true);
        break;
      }
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
      case "bloc-occurrence":
        // Contenu placé (D-102) : accrochage et sélection sur les traits du bloc ; les cotes s'y rattachent.
        for (const t of traitsBloc(etat, o)) {
          const pts = t.points;
          for (let i = 0; i + 1 < pts.length; i++) segments.push({ a: pts[i]!, b: pts[i + 1]!, objetId: o.id, ...(t.courbe ? { courbe: true } : {}) });
          if (t.ferme && pts.length > 2) segments.push({ a: pts[pts.length - 1]!, b: pts[0]!, objetId: o.id });
        }
        break;
      default:
        break;
    }
  }
  return { segments, centres, quadrants, faces, cercles };
}

/**
 * Points de tangence (D-151) depuis `depuis` vers un cercle de centre c et de rayon r : aucun si le point est dans
 * le cercle ; sur un arc, seulement ceux compris entre ses angles de début et de fin (sens direct).
 */
export function pointsTangence(depuis: Point2, c: { x: number; y: number }, r: number, debut = 0, fin = 360): Point2[] {
  const d = Math.hypot(depuis.x - c.x, depuis.y - c.y);
  if (!(d > r + 1e-9)) return [];
  const base = Math.atan2(depuis.y - c.y, depuis.x - c.x);
  const t = Math.acos(r / d);
  const dansArc = (a: number) => {
    if (fin - debut >= 360 - 1e-9) return true;
    const norm = (x: number) => ((x % 360) + 360) % 360;
    return norm((a * 180) / Math.PI - debut) <= norm(fin - debut) + 1e-9;
  };
  return [base + t, base - t].filter(dansArc).map((a) => pt(Math.round((c.x + r * Math.cos(a)) * 1e9) / 1e9, Math.round((c.y + r * Math.sin(a)) * 1e9) / 1e9));
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
  const droits = segs.filter((s) => !s.courbe);
  if (options.extremite) for (const s of droits) {
    essayer(s.a, "extremite", s.objetId, 3);
    essayer(s.b, "extremite", s.objetId, 3);
  }
  if (options.centre) for (const c of cache.centres) if (!exclure.includes(c.objetId)) essayer(c.p, "centre", c.objetId, 2);
  if (options.centre) for (const c of cache.quadrants ?? []) if (!exclure.includes(c.objetId)) essayer(c.p, "quadrant", c.objetId, 2);
  if (options.milieu) for (const s of droits) if (s.a.x !== s.b.x || s.a.y !== s.b.y) essayer(pt((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2), "milieu", s.objetId, 2);
  if (options.intersection) {
    const proches = segs.filter((s) => projectionSurSegment(p, s.a, s.b).distance <= rayon * 2);
    for (let i = 0; i < proches.length; i++) for (let j = i + 1; j < proches.length; j++) {
      const x = intersectionSegments(proches[i]!.a, proches[i]!.b, proches[j]!.a, proches[j]!.b);
      if (x) essayer(pt(x.point.x, x.point.y), "intersection", proches[i]!.objetId, 1);
    }
  }
  // Tangente (D-151) : avec l'accrochage perpendiculaire, depuis le point précédent vers un cercle ou un arc.
  if (options.perpendiculaire && depuis) for (const k of cache.cercles ?? []) if (!exclure.includes(k.objetId)) for (const q of pointsTangence(depuis, k.c, k.r, k.debut, k.fin)) essayer(q, "tangente", k.objetId, 1);
  if (options.perpendiculaire && depuis) {
    for (const s of segs) {
      const pr = projectionSurSegment(depuis, s.a, s.b);
      if (pr.t > 0 && pr.t < 1) essayer(pt(pr.point.x, pr.point.y), "perpendiculaire", s.objetId, 0);
    }
  }
  // Point le plus proche (D-061) : sur un tracé ou une face de mur, au-dessous des accroches remarquables.
  if (!meilleur && options.proche) {
    for (const s of [...segs, ...(cache.faces ?? []).filter((f) => !exclure.includes(f.objetId))]) {
      const pr = projectionSurSegment(p, s.a, s.b);
      essayer(pt(pr.point.x, pr.point.y), "proche", s.objetId, -1);
    }
  }
  if (meilleur) return meilleur;
  // Parallèle (D-158) : direction de l'arête de référence (survolée pendant le tracé), à moins d'un rayon de la droite.
  const ref = options.parallele && depuis ? options.referenceParallele : null;
  if (ref) {
    const q = surParallele(p, depuis!, ref.a, ref.b, rayon);
    if (q) return { point: q, type: "parallele", objetId: ref.objetId };
  }
  if (options.orthogonal && depuis) {
    const dx = p.x - depuis.x;
    const dy = p.y - depuis.y;
    const l = Math.hypot(dx, dy);
    if (l > 1e-9) {
      const angle = Math.atan2(dy, dx);
      const pasDeg = options.pasPolaire && options.pasPolaire > 0 && options.pasPolaire <= 90 ? options.pasPolaire : 45;
      const pas = (pasDeg * Math.PI) / 180;
      // Repère de saisie (D-091) : les directions polaires partent de son axe x.
      const base = ((options.angleRepere ?? 0) * Math.PI) / 180;
      const arrondi = base + Math.round((angle - base) / pas) * pas;
      if (Math.abs(angle - arrondi) < (rayon / Math.max(l, 1e-9)) * 2) {
        const q = pt(depuis.x + l * Math.cos(arrondi), depuis.y + l * Math.sin(arrondi));
        return { point: options.grille ? surGrille(q, options.pasGrille) : q, type: "orthogonal", objetId: null };
      }
    }
  }
  if (options.grille) return { point: surGrille(p, options.pasGrille), type: "grille", objetId: null };
  return { point: p, type: "libre", objetId: null };
}

/** Projection de `p` sur la droite issue de `depuis` parallèle à [a, b], si `p` en est à moins de `rayon` (et assez loin de `depuis`). */
export function surParallele(p: Point2, depuis: Point2, a: Point2, b: Point2, rayon: number): Point2 | null {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l < 1e-9) return null;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const v = { x: p.x - depuis.x, y: p.y - depuis.y };
  const t = v.x * u.x + v.y * u.y;
  const ecart = Math.abs(v.x * u.y - v.y * u.x);
  if (ecart > rayon || Math.abs(t) < rayon * 2) return null;
  return pt(Math.round((depuis.x + u.x * t) * 1e9) / 1e9, Math.round((depuis.y + u.y * t) * 1e9) / 1e9);
}

/** Arête droite la plus proche du pointeur (à moins de `rayon`), candidate pour la référence du parallèle. */
export function areteSurvolee(p: Point2, cache: ReturnType<typeof segmentsDuNiveau>, rayon: number, exclure: readonly string[] = []): { a: Point2; b: Point2; objetId: string } | null {
  let meilleur: { a: Point2; b: Point2; objetId: string } | null = null;
  let dMin = rayon;
  for (const s of cache.segments) {
    if (s.courbe || exclure.includes(s.objetId)) continue;
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 1e-9) continue;
    const d = projectionSurSegment(p, s.a, s.b).distance;
    if (d <= dMin) {
      dMin = d;
      meilleur = { a: s.a, b: s.b, objetId: s.objetId };
    }
  }
  return meilleur;
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
    // À égalité, un élément linéaire (mur, ligne…) l'emporte sur le contour d'une surface (pièce, zone, dalle…)
    // qui le longe : l'ordre des objets du modèle ne décide jamais de la sélection.
    const surface = !!o && ["piece", "zone", "espace", "dalle", "toiture", "reference-plan"].includes(o.classe);
    const eff = Math.max(0, d - marge) + (surface ? 1e-4 : 0);
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
      const c = pointAxeMur(hote.params, o.params.position * longueurAxeMur(hote.params)).p; // mur courbe : sur l'arc (D-095)
      const d = Math.max(0, dist(p, c) - o.params.largeur.value / 2);
      if (d <= rayon && (!meilleur || d < meilleur.distance + 1e-9)) meilleur = { objetId: o.id, distance: Math.max(0, d - 1e-6) };
    } else if (o.classe === "texte" || o.classe === "etiquette") {
      const d = dist(p, o.params.position);
      if (d <= rayon * 2 && (!meilleur || d < meilleur.distance)) meilleur = { objetId: o.id, distance: d };
    }
  }
  return meilleur;
}
