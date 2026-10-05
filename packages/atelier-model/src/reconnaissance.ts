/**
 * Reconnaissance de formes proposée (D-079, fiche DA-01-06) : pour un tracé (polyligne ou courbe d'esquisse), les
 * formes simples qui l'approchent — droite (tracé ouvert), cercle, rectangle (tracés fermés) — avec leur écart
 * maximal au tracé. Une proposition seulement : rien n'est remplacé sans l'accord explicite de l'utilisateur (R3).
 */
import { aireSignee, cross, distance, projectionSurSegment, sub, type Vec } from "./geometrie.js";
import { pt, type Point2 } from "./unites.js";

export type FormeReconnue =
  | { forme: "ligne"; points: [Point2, Point2]; ecart: number }
  | { forme: "cercle"; centre: Point2; rayon: number; ecart: number }
  | { forme: "polygone"; points: Point2[]; ecart: number; libelle: "rectangle" };

const arr = (v: number) => Math.round(v * 1e6) / 1e6;

function ajusterCercle(p: readonly Vec[]): { c: Vec; r: number } | null {
  // Moindres carrés algébriques (Kåsa) : x² + y² + Dx + Ey + F = 0, centré pour la stabilité.
  const n = p.length;
  const mx = p.reduce((s, q) => s + q.x, 0) / n;
  const my = p.reduce((s, q) => s + q.y, 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const q of p) {
    const u = q.x - mx;
    const v = q.y - my;
    suu += u * u; svv += v * v; suv += u * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const b1 = (suuu + suvv) / 2;
  const b2 = (svvv + svuu) / 2;
  const uc = (b1 * svv - b2 * suv) / det;
  const vc = (b2 * suu - b1 * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { c: { x: uc + mx, y: vc + my }, r };
}

function enveloppe(points: readonly Vec[]): Vec[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const bas: Vec[] = [];
  for (const q of p) {
    while (bas.length >= 2 && cross(sub(bas[bas.length - 1]!, bas[bas.length - 2]!), sub(q, bas[bas.length - 2]!)) <= 0) bas.pop();
    bas.push(q);
  }
  const haut: Vec[] = [];
  for (const q of [...p].reverse()) {
    while (haut.length >= 2 && cross(sub(haut[haut.length - 1]!, haut[haut.length - 2]!), sub(q, haut[haut.length - 2]!)) <= 0) haut.pop();
    haut.push(q);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

/** Rectangle d'aire minimale contenant les points (orienté selon un côté de l'enveloppe convexe). */
function rectangleMinimal(points: readonly Vec[]): Vec[] | null {
  const h = enveloppe(points);
  if (h.length < 3) return null;
  let meilleur: { aire: number; coins: Vec[] } | null = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    const l = distance(a, b);
    if (l < 1e-12) continue;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const n = { x: -u.y, y: u.x };
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const q of h) {
      const s = q.x * u.x + q.y * u.y;
      const t = q.x * n.x + q.y * n.y;
      s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t);
    }
    const aire = (s1 - s0) * (t1 - t0);
    if (!meilleur || aire < meilleur.aire) {
      const P = (s: number, t: number) => ({ x: u.x * s + n.x * t, y: u.y * s + n.y * t });
      meilleur = { aire, coins: [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)] };
    }
  }
  return meilleur?.coins ?? null;
}

const distContour = (q: Vec, c: readonly Vec[]) => Math.min(...c.map((a, i) => projectionSurSegment(q, a, c[(i + 1) % c.length]!).distance));

/**
 * Formes proposées pour un tracé, de la plus proche à la moins proche ; seules celles dont l'écart maximal ne
 * dépasse pas `toleranceRelative` × la taille du tracé (5 % par défaut) sont rendues.
 */
export function reconnaitreForme(points: readonly Vec[], ferme: boolean, toleranceRelative = 0.05): FormeReconnue[] {
  if (points.length < 2) return [];
  const xs = points.map((q) => q.x);
  const ys = points.map((q) => q.y);
  const taille = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (taille < 1e-9) return [];
  const out: FormeReconnue[] = [];
  if (!ferme) {
    const a = points[0]!;
    const b = points[points.length - 1]!;
    if (distance(a, b) > 1e-9) out.push({ forme: "ligne", points: [pt(arr(a.x), arr(a.y)), pt(arr(b.x), arr(b.y))], ecart: arr(Math.max(...points.map((q) => projectionSurSegment(q, a, b).distance))) });
  } else if (points.length >= 3 && Math.abs(aireSignee(points)) > 1e-9) {
    const c = ajusterCercle(points);
    if (c) out.push({ forme: "cercle", centre: pt(arr(c.c.x), arr(c.c.y)), rayon: arr(c.r), ecart: arr(Math.max(...points.map((q) => Math.abs(distance(q, c.c) - c.r)))) });
    const r = rectangleMinimal(points);
    if (r) out.push({ forme: "polygone", libelle: "rectangle", points: r.map((q) => pt(arr(q.x), arr(q.y))), ecart: arr(Math.max(...points.map((q) => distContour(q, r)))) });
  }
  return out.filter((f) => f.ecart <= toleranceRelative * taille).sort((u, v) => u.ecart - v.ecart);
}
