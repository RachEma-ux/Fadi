/**
 * Géométrie 2D pure du modèle (repère local, mètres) : opérations sur points et polygones, polygone d'un mur
 * d'après son axe, jonctions, détection de boucles fermées (pièces), transformations. Aucune dépendance au
 * rendu. Les tolérances viennent de `unites.ts`.
 */
import { pt, TOLERANCE_REDUCTEUR, type Point2 } from "./unites.js";

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const norme = (a: Vec): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const normalise = (a: Vec): Vec => {
  const n = norme(a);
  return n < 1e-12 ? { x: 0, y: 0 } : { x: a.x / n, y: a.y / n };
};
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });

export function memePoint(a: Vec, b: Vec, tol = TOLERANCE_REDUCTEUR): boolean {
  return distance(a, b) <= tol;
}

/** Aire signée (shoelace) : positive pour un contour direct (sens trigonométrique). */
export function aireSignee(poly: readonly Vec[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export const aire = (poly: readonly Vec[]): number => Math.abs(aireSignee(poly));

/** Aire d'un contour moins ses trous. */
export function aireNette(contour: readonly Vec[], trous: readonly (readonly Vec[])[] = []): number {
  return Math.max(0, aire(contour) - trous.reduce((s, t) => s + aire(t), 0));
}

export function centroide(poly: readonly Vec[]): Vec {
  const a = aireSignee(poly);
  if (Math.abs(a) < 1e-12) {
    const n = Math.max(1, poly.length);
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointDansPolygone(p: Vec, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function projectionSurSegment(p: Vec, a: Vec, b: Vec): { t: number; point: Vec; distance: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = add(a, mul(ab, t));
  return { t, point, distance: distance(p, point) };
}

/** Intersection de deux segments (propre ou aux extrémités) ; `null` si parallèles ou disjoints. */
export function intersectionSegments(a: Vec, b: Vec, c: Vec, d: Vec, tol = TOLERANCE_REDUCTEUR): { point: Vec; t: number; u: number } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const qp = sub(c, a);
  const t = cross(qp, s) / den;
  const u = cross(qp, r) / den;
  const eps = tol / Math.max(norme(r), 1e-9);
  const eps2 = tol / Math.max(norme(s), 1e-9);
  if (t < -eps || t > 1 + eps || u < -eps2 || u > 1 + eps2) return null;
  return { point: add(a, mul(r, t)), t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
}

export function rectangleEnglobant(points: readonly Vec[]): { min: Vec; max: Vec } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

// ---------------------------------------------------------------------------
// Murs
// ---------------------------------------------------------------------------

export type Alignement = "gauche" | "axe" | "droite";

/** Les deux faces d'un mur d'après son axe, son épaisseur et son alignement (face gauche = à gauche du sens a → b). */
export function facesMur(a: Vec, b: Vec, epaisseur: number, alignement: Alignement): { gauche: [Vec, Vec]; droite: [Vec, Vec] } {
  const d = normalise(sub(b, a));
  const n = perp(d); // à gauche du sens a → b
  const offsetGauche = alignement === "axe" ? epaisseur / 2 : alignement === "gauche" ? 0 : epaisseur;
  const offsetDroite = alignement === "axe" ? epaisseur / 2 : alignement === "gauche" ? epaisseur : 0;
  const g = mul(n, offsetGauche);
  const r = mul(n, -offsetDroite);
  return { gauche: [add(a, g), add(b, g)], droite: [add(a, r), add(b, r)] };
}

/** Polygone (quadrilatère) d'un mur, sens direct. */
export function polygoneMur(a: Vec, b: Vec, epaisseur: number, alignement: Alignement): Point2[] {
  const f = facesMur(a, b, epaisseur, alignement);
  const quad = [f.droite[0], f.droite[1], f.gauche[1], f.gauche[0]];
  const poly = aireSignee(quad) < 0 ? quad.reverse() : quad;
  return poly.map((p) => pt(p.x, p.y));
}

export interface AxeMur {
  id: string;
  a: Vec;
  b: Vec;
}

export type TypeJonction = "L" | "T" | "X";

export interface Jonction {
  murA: string;
  murB: string;
  type: TypeJonction;
  point: Vec;
}

/** Jonctions entre axes de murs : extrémité commune (L), extrémité sur l'axe d'un autre (T), croisement (X). */
export function jonctions(axes: readonly AxeMur[], tol = TOLERANCE_REDUCTEUR): Jonction[] {
  const out: Jonction[] = [];
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const m = axes[i]!;
      const n = axes[j]!;
      const extremitesM = [m.a, m.b];
      const extremitesN = [n.a, n.b];
      let trouve: Jonction | null = null;
      for (const p of extremitesM) {
        for (const q of extremitesN) if (memePoint(p, q, tol)) trouve = { murA: m.id, murB: n.id, type: "L", point: p };
      }
      if (!trouve) {
        for (const p of extremitesM) {
          const pr = projectionSurSegment(p, n.a, n.b);
          if (pr.distance <= tol && pr.t > 0 && pr.t < 1) trouve = { murA: m.id, murB: n.id, type: "T", point: p };
        }
        for (const q of extremitesN) {
          const pr = projectionSurSegment(q, m.a, m.b);
          if (pr.distance <= tol && pr.t > 0 && pr.t < 1) trouve = { murA: n.id, murB: m.id, type: "T", point: q };
        }
      }
      if (!trouve) {
        const x = intersectionSegments(m.a, m.b, n.a, n.b, tol);
        if (x && x.t > 0 && x.t < 1 && x.u > 0 && x.u < 1) trouve = { murA: m.id, murB: n.id, type: "X", point: x.point };
      }
      if (trouve) out.push(trouve);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Boucles fermées (détection de pièces) — graphe planaire des axes de murs
// ---------------------------------------------------------------------------

export interface BoucleFermee {
  /** Sommets du contour, sens direct. */
  contour: Point2[];
  /** Identifiants des murs qui la délimitent. */
  murs: string[];
  aire: number;
}

interface Noeud {
  id: number;
  p: Vec;
}

interface Arete {
  id: number;
  de: number;
  vers: number;
  mur: string;
}

/**
 * Détecte les faces intérieures du graphe planaire formé par les axes de murs : les axes sont scindés à chaque
 * jonction, puis les faces sont parcourues par la règle de l'arête la plus à gauche. La face extérieure
 * (aire signée négative dans le parcours) est exclue. Jamais imposé : le résultat est une proposition.
 */
export function boucles(axes: readonly AxeMur[], tol = TOLERANCE_REDUCTEUR): BoucleFermee[] {
  const noeuds: Noeud[] = [];
  const idNoeud = (p: Vec): number => {
    const existant = noeuds.find((n) => memePoint(n.p, p, Math.max(tol, 1e-6)));
    if (existant) return existant.id;
    const n = { id: noeuds.length, p: { x: p.x, y: p.y } };
    noeuds.push(n);
    return n.id;
  };
  // 1. Points de scission de chaque axe : extrémités, jonctions T, croisements.
  const scissions = new Map<string, Vec[]>();
  for (const axe of axes) scissions.set(axe.id, [axe.a, axe.b]);
  const js = jonctions(axes, tol);
  for (const j of js) {
    scissions.get(j.murA)!.push(j.point);
    scissions.get(j.murB)!.push(j.point);
  }
  // 2. Arêtes orientées dans les deux sens.
  const aretes: Arete[] = [];
  for (const axe of axes) {
    const d = sub(axe.b, axe.a);
    const l2 = dot(d, d);
    const pts = [...scissions.get(axe.id)!]
      .map((p) => ({ p, t: l2 < 1e-12 ? 0 : dot(sub(p, axe.a), d) / l2 }))
      .sort((u, v) => u.t - v.t);
    for (let i = 0; i + 1 < pts.length; i++) {
      const u = idNoeud(pts[i]!.p);
      const v = idNoeud(pts[i + 1]!.p);
      if (u === v) continue;
      aretes.push({ id: aretes.length, de: u, vers: v, mur: axe.id });
      aretes.push({ id: aretes.length, de: v, vers: u, mur: axe.id });
    }
  }
  // 3. Pour chaque nœud, les arêtes sortantes triées par angle.
  const sortantes = new Map<number, Arete[]>();
  for (const a of aretes) {
    const list = sortantes.get(a.de) ?? [];
    list.push(a);
    sortantes.set(a.de, list);
  }
  const angle = (a: Arete): number => {
    const p = noeuds[a.de]!.p;
    const q = noeuds[a.vers]!.p;
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  for (const list of sortantes.values()) list.sort((u, v) => angle(u) - angle(v));
  // 4. Parcours des faces : depuis une arête, à chaque nœud prendre l'arête suivante dans l'ordre horaire
  //    après l'arête inverse (règle « tourner à gauche »).
  const visitee = new Set<number>();
  const faces: BoucleFermee[] = [];
  for (const depart of aretes) {
    if (visitee.has(depart.id)) continue;
    const chemin: Arete[] = [];
    let courante = depart;
    let garde = 0;
    while (!visitee.has(courante.id) && garde++ < aretes.length + 1) {
      visitee.add(courante.id);
      chemin.push(courante);
      const list = sortantes.get(courante.vers) ?? [];
      const retourAngle = Math.atan2(noeuds[courante.de]!.p.y - noeuds[courante.vers]!.p.y, noeuds[courante.de]!.p.x - noeuds[courante.vers]!.p.x);
      // Face à gauche de l'arête : depuis la direction de retour, tourner dans le sens horaire et prendre la
      // première arête sortante rencontrée (= le plus grand écart trigonométrique strictement positif).
      let suivante: Arete | null = null;
      let meilleur = -Infinity;
      for (const cand of list) {
        let delta = angle(cand) - retourAngle;
        while (delta <= 1e-9) delta += Math.PI * 2;
        while (delta > Math.PI * 2 + 1e-9) delta -= Math.PI * 2;
        if (Math.abs(delta - Math.PI * 2) < 1e-9 && list.length > 1) continue; // l'arête de retour elle-même (sauf impasse)
        if (delta > meilleur) {
          meilleur = delta;
          suivante = cand;
        }
      }
      if (!suivante) break;
      courante = suivante;
      if (courante.id === depart.id) break;
    }
    if (chemin.length < 3 || courante.id !== depart.id) continue;
    const contour = chemin.map((a) => noeuds[a.de]!.p);
    const s = aireSignee(contour);
    if (s <= tol * tol) continue; // face extérieure (négative) ou dégénérée
    const murs = [...new Set(chemin.map((a) => a.mur))];
    faces.push({ contour: contour.map((p) => pt(p.x, p.y)), murs, aire: s });
  }
  return faces;
}

// ---------------------------------------------------------------------------
// Transformations
// ---------------------------------------------------------------------------

export type Transformation =
  | { type: "translation"; dx: number; dy: number }
  | { type: "rotation"; centre: Vec; angleDeg: number }
  | { type: "miroir"; a: Vec; b: Vec }
  | { type: "echelle"; centre: Vec; facteur: number };

export function appliquerTransformation(p: Vec, t: Transformation): Vec {
  switch (t.type) {
    case "translation":
      return { x: p.x + t.dx, y: p.y + t.dy };
    case "rotation": {
      const r = (t.angleDeg * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      const d = sub(p, t.centre);
      return { x: t.centre.x + d.x * c - d.y * s, y: t.centre.y + d.x * s + d.y * c };
    }
    case "miroir": {
      const d = normalise(sub(t.b, t.a));
      const v = sub(p, t.a);
      const along = mul(d, dot(v, d));
      const perpV = sub(v, along);
      return add(t.a, sub(along, perpV));
    }
    case "echelle":
      return { x: t.centre.x + (p.x - t.centre.x) * t.facteur, y: t.centre.y + (p.y - t.centre.y) * t.facteur };
  }
}

export const transformerPoint2 = (p: Point2, t: Transformation): Point2 => {
  const q = appliquerTransformation(p, t);
  return pt(q.x, q.y);
};

/** Échantillonnage d'un arc de cercle (angles en degrés, sens trigonométrique). */
export function pointsArc(centre: Vec, rayon: number, angleDebutDeg: number, angleFinDeg: number, segments = 32): Point2[] {
  const a0 = (angleDebutDeg * Math.PI) / 180;
  let a1 = (angleFinDeg * Math.PI) / 180;
  while (a1 <= a0) a1 += Math.PI * 2;
  const out: Point2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    out.push(pt(centre.x + rayon * Math.cos(a), centre.y + rayon * Math.sin(a)));
  }
  return out;
}

/** Spline de Catmull-Rom centripète par les points de contrôle (D-012), `n` échantillons par segment. */
export function pointsSpline(controle: readonly Vec[], n = 8, ferme = false): Point2[] {
  if (controle.length < 2) return controle.map((p) => pt(p.x, p.y));
  const pts = ferme ? [controle[controle.length - 1]!, ...controle, controle[0]!, controle[1]!] : [controle[0]!, ...controle, controle[controle.length - 1]!];
  const out: Point2[] = [];
  const tj = (ti: number, pi: Vec, pj: Vec): number => ti + Math.sqrt(distance(pi, pj));
  for (let i = 0; i + 3 < pts.length; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const p2 = pts[i + 2]!;
    const p3 = pts[i + 3]!;
    const t0 = 0;
    const t1 = tj(t0, p0, p1) || 1e-6;
    const t2 = tj(t1, p1, p2) || t1 + 1e-6;
    const t3 = tj(t2, p2, p3) || t2 + 1e-6;
    for (let k = 0; k < n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const lerp = (a: Vec, b: Vec, ta: number, tb: number): Vec => (tb - ta < 1e-12 ? a : add(mul(a, (tb - t) / (tb - ta)), mul(b, (t - ta) / (tb - ta))));
      const a1 = lerp(p0, p1, t0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      const c = lerp(b1, b2, t1, t2);
      out.push(pt(c.x, c.y));
    }
  }
  const dernier = pts[pts.length - 2]!;
  if (!ferme) out.push(pt(dernier.x, dernier.y));
  return out;
}

/** Longueur d'une polyligne. */
export function longueurPolyligne(points: readonly Vec[], ferme = false): number {
  let l = 0;
  for (let i = 0; i + 1 < points.length; i++) l += distance(points[i]!, points[i + 1]!);
  if (ferme && points.length > 2) l += distance(points[points.length - 1]!, points[0]!);
  return l;
}

/** Décalage parallèle simple d'une polyligne ouverte (segments décalés et prolongés jusqu'à leur intersection). */
export function decalerPolyligne(points: readonly Vec[], d: number): Point2[] {
  if (points.length < 2) return points.map((p) => pt(p.x, p.y));
  const segs = [] as { a: Vec; b: Vec }[];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const n = mul(perp(normalise(sub(b, a))), d);
    segs.push({ a: add(a, n), b: add(b, n) });
  }
  const out: Vec[] = [segs[0]!.a];
  for (let i = 0; i + 1 < segs.length; i++) {
    const s = segs[i]!;
    const t = segs[i + 1]!;
    const r = sub(s.b, s.a);
    const q = sub(t.b, t.a);
    const den = cross(r, q);
    if (Math.abs(den) < 1e-9) out.push(s.b);
    else {
      const k = cross(sub(t.a, s.a), q) / den;
      out.push(add(s.a, mul(r, k)));
    }
  }
  out.push(segs[segs.length - 1]!.b);
  return out.map((p) => pt(p.x, p.y));
}

/** Polygone régulier de `n` côtés (3 à 64), de centre et premier sommet donnés (sens trigonométrique). */
export function polygoneRegulier(centre: Vec, sommet: Vec, n: number): Point2[] {
  if (!Number.isInteger(n) || n < 3 || n > 64) throw new Error("nombre de côtés : entier de 3 à 64");
  const r = Math.hypot(sommet.x - centre.x, sommet.y - centre.y);
  if (r < 1e-9) throw new Error("rayon nul");
  const a0 = Math.atan2(sommet.y - centre.y, sommet.x - centre.x);
  const out: Point2[] = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (2 * Math.PI * k) / n;
    out.push(pt(Math.round((centre.x + r * Math.cos(a)) * 1e9) / 1e9, Math.round((centre.y + r * Math.sin(a)) * 1e9) / 1e9));
  }
  return out;
}

/** Cercle passant par trois points ; null s'ils sont alignés (ou confondus). */
export function cercleTroisPoints(a: Vec, b: Vec, c: Vec): { centre: Point2; rayon: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  const echelle = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y), 1e-12);
  if (Math.abs(d) < 1e-9 * echelle * echelle) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { centre: pt(x, y), rayon: Math.hypot(a.x - x, a.y - y) };
}

/** Rectangle par trois points (D-046) : a, b = premier côté ; c donne la largeur (projection perpendiculaire). */
export function rectangleTroisPoints(a: Vec, b: Vec, c: Vec): Point2[] | null {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const l = Math.hypot(ux, uy);
  if (l < 1e-9) return null;
  const nx = -uy / l;
  const ny = ux / l;
  const h = (c.x - a.x) * nx + (c.y - a.y) * ny;
  if (Math.abs(h) < 1e-9) return null;
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  return [pt(r(a.x), r(a.y)), pt(r(b.x), r(b.y)), pt(r(b.x + nx * h), r(b.y + ny * h)), pt(r(a.x + nx * h), r(a.y + ny * h))];
}

/** Lecture d'une liste d'entraxes saisie (« 4,5 ; 5 ; 2*6 » : nombres en m, `n*d` répète d entraxe n fois). */
export function lireEntraxes(texte: string): number[] {
  const out: number[] = [];
  for (const brut of texte.split(/[;\s]+/).filter(Boolean)) {
    const m = /^(?:(\d+)\*)?(\d+(?:[.,]\d+)?)$/.exec(brut);
    if (!m) throw new Error(`entraxe illisible : « ${brut} » (nombres en m, « n*d » pour répéter)`);
    const n = m[1] ? Number(m[1]) : 1;
    const d = Number(m[2]!.replace(",", "."));
    if (!(d > 0) || n < 1 || n > 200) throw new Error(`entraxe invalide : « ${brut} »`);
    for (let k = 0; k < n; k++) out.push(d);
  }
  if (out.length > 200) throw new Error("200 entraxes au plus");
  return out;
}

/** Points d'une ellipse (D-046) : demi-axes a (grand) et b, grand axe tourné de `rotationDeg`, sens direct. */
export function pointsEllipse(centre: Vec, a: number, b: number, rotationDeg: number, segments = 64): Point2[] {
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const out: Point2[] = [];
  for (let k = 0; k < segments; k++) {
    const t = (2 * Math.PI * k) / segments;
    const x = a * Math.cos(t);
    const y = b * Math.sin(t);
    out.push(pt(centre.x + x * c - y * s, centre.y + x * s + y * c));
  }
  return out;
}

/** Ellipse par centre, extrémité d'un axe et point de l'autre demi-axe (distance à l'axe) ; null si dégénérée. */
export function ellipseTroisPoints(centre: Vec, axe: Vec, p: Vec): { rayon: number; rayonB: number; rotation: number } | null {
  const ux = axe.x - centre.x;
  const uy = axe.y - centre.y;
  const a = Math.hypot(ux, uy);
  if (a < 1e-9) return null;
  const b = Math.abs(((p.x - centre.x) * -uy + (p.y - centre.y) * ux) / a);
  if (b < 1e-9) return null;
  const rot = (Math.atan2(uy, ux) * 180) / Math.PI;
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  return b > a ? { rayon: r(b), rayonB: r(a), rotation: r(rot + 90) } : { rayon: r(a), rayonB: r(b), rotation: r(rot) };
}


/**
 * Décalage d'un contour fermé (D-049), joints en onglet : d > 0 vers l'extérieur, d < 0 vers l'intérieur. Null si le
 * résultat n'est plus un polygone simple de même orientation (contour trop rétréci, ou plusieurs boucles).
 */
export function decalerContour(points: readonly Vec[], d: number): Point2[] | null {
  const n = points.length;
  if (n < 3) return null;
  let aire = 0;
  for (let i = 0; i < n; i++) aire += cross(points[i]!, points[(i + 1) % n]!);
  if (Math.abs(aire) < 1e-12) return null;
  const sens = aire > 0 ? 1 : -1; // direct : l'extérieur est à droite des arêtes
  const lignes = points.map((a, i) => {
    const b = points[(i + 1) % n]!;
    const u = normalise(sub(b, a));
    const nrm = { x: u.y * sens, y: -u.x * sens };
    return { p: add(a, mul(nrm, d)), d: u };
  });
  const out: Point2[] = [];
  for (let i = 0; i < n; i++) {
    const l1 = lignes[(i - 1 + n) % n]!;
    const l2 = lignes[i]!;
    const den = cross(l1.d, l2.d);
    let q: Vec;
    if (Math.abs(den) < 1e-12) q = l2.p;
    else {
      const t = cross(sub(l2.p, l1.p), l2.d) / den;
      q = add(l1.p, mul(l1.d, t));
    }
    out.push(pt(Math.round(q.x * 1e9) / 1e9, Math.round(q.y * 1e9) / 1e9));
  }
  let aire2 = 0;
  for (let i = 0; i < n; i++) aire2 += cross(out[i]!, out[(i + 1) % n]!);
  if (aire2 * aire <= 0) return null;
  // Chaque côté garde son sens : un côté retourné signale un contour rétréci au-delà de lui-même.
  for (let i = 0; i < n; i++) if (dot(sub(out[(i + 1) % n]!, out[i]!), sub(points[(i + 1) % n]!, points[i]!)) <= 0) return null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (intersectionSegments(out[i]!, out[(i + 1) % n]!, out[j]!, out[(j + 1) % n]!, 1e-12)) return null;
    }
  }
  return out;
}

const sensDirect = (c: readonly Vec[]): Vec[] => {
  let a = 0;
  for (let i = 0; i < c.length; i++) a += cross(c[i]!, c[(i + 1) % c.length]!);
  return a >= 0 ? [...c] : [...c].reverse();
};

/**
 * Union de deux contours adjacents (D-050) : ils partagent au moins un côté entier (mêmes sommets). Les côtés communs
 * disparaissent ; null si rien n'est partagé ou si l'union n'est pas une seule boucle (contour à trou).
 */
export function unionContoursAdjacents(c1: readonly Vec[], c2: readonly Vec[], tol = 1e-6): Point2[] | null {
  // Les sommets de chaque contour posés sur un côté de l'autre sont d'abord insérés (côtés partiellement communs).
  const inserer = (c: readonly Vec[], autre: readonly Vec[]) => {
    const out: Vec[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i]!;
      const b = c[(i + 1) % c.length]!;
      out.push(a);
      const ab = sub(b, a);
      const l2 = dot(ab, ab);
      const sur = autre.map((q) => ({ q, t: dot(sub(q, a), ab) / l2 })).filter(({ q, t }) => t > 1e-9 && t < 1 - 1e-9 && Math.abs(cross(ab, sub(q, a))) / Math.sqrt(l2) < tol).sort((x, y) => x.t - y.t);
      for (const { q } of sur) out.push(q);
    }
    return out;
  };
  const a = sensDirect(inserer(sensDirect(c1), c2));
  const b = sensDirect(inserer(sensDirect(c2), c1));
  const meme = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y) < tol;
  type Arete = { p: Vec; q: Vec };
  const aretes = (c: Vec[]): Arete[] => c.map((p, i) => ({ p, q: c[(i + 1) % c.length]! }));
  const ea = aretes(a);
  const eb = aretes(b);
  const commune = (x: Arete, ys: Arete[]) => ys.some((y) => meme(x.p, y.q) && meme(x.q, y.p));
  const restes = [...ea.filter((x) => !commune(x, eb)), ...eb.filter((x) => !commune(x, ea))];
  if (restes.length === ea.length + eb.length) return null;
  const chaine: Vec[] = [restes[0]!.p];
  let courant = restes[0]!;
  const utilises = new Set([0]);
  while (true) {
    const k = restes.findIndex((x, i) => !utilises.has(i) && meme(x.p, courant.q));
    if (k < 0) break;
    utilises.add(k);
    courant = restes[k]!;
    chaine.push(courant.p);
  }
  if (utilises.size !== restes.length || !meme(courant.q, chaine[0]!)) return null;
  // Sommets alignés retirés.
  const out = chaine.filter((p, i) => Math.abs(cross(sub(p, chaine[(i - 1 + chaine.length) % chaine.length]!), sub(chaine[(i + 1) % chaine.length]!, p))) > 1e-12);
  return out.map((p) => pt(Math.round(p.x * 1e9) / 1e9, Math.round(p.y * 1e9) / 1e9));
}

/** Coupe d'un contour simple par la droite (a, b) (D-050) : deux contours, ou null si la droite ne le coupe pas en deux. */
export function couperContour(c: readonly Vec[], a: Vec, b: Vec): [Point2[], Point2[]] | null {
  const d = sub(b, a);
  if (Math.hypot(d.x, d.y) < 1e-9) return null;
  const cote = (p: Vec) => cross(d, sub(p, a));
  const n = c.length;
  const coupes: { i: number; p: Vec }[] = [];
  for (let i = 0; i < n; i++) {
    const p = c[i]!;
    const q = c[(i + 1) % n]!;
    const sp = cote(p);
    const sq = cote(q);
    if (Math.abs(sp) < 1e-12) return null; // la droite passe par un sommet : non pris en charge
    if (sp * sq < 0) {
      const t = sp / (sp - sq);
      coupes.push({ i, p: add(p, mul(sub(q, p), t)) });
    }
  }
  if (coupes.length !== 2) return null;
  const [c1, c2] = coupes as [{ i: number; p: Vec }, { i: number; p: Vec }];
  const r = (p: Vec) => pt(Math.round(p.x * 1e9) / 1e9, Math.round(p.y * 1e9) / 1e9);
  const partA: Vec[] = [c1.p];
  for (let k = c1.i + 1; k <= c2.i; k++) partA.push(c[k]!);
  partA.push(c2.p);
  const partB: Vec[] = [c2.p];
  for (let k = c2.i + 1; k <= c1.i + n; k++) partB.push(c[k % n]!);
  partB.push(c1.p);
  return [partA.map(r), partB.map(r)];
}
