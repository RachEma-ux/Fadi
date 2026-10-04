/**
 * Remplissage des coupes en 3D (lot 3b, limite levée) : là où un plan de coupe traverse la matière (murs, poteaux,
 * dalles, toitures, escaliers), les contours fermés de la section sont triangulés en « chapeaux » plans, pour que
 * la vue coupée montre de la matière pleine plutôt que l'intérieur creux des volumes. Pur : aucun moteur de rendu.
 *
 * Les contours sont obtenus par `couper` (segments du maillage dans le plan), chaînés, puis classés par imbrication
 * (profondeur paire = contour extérieur, impaire = trou de son plus petit contour englobant).
 */
import type { Vec } from "../geometrie.js";
import { chainer } from "../documents/visibilite.js";
import { couper, trianguler, type Maillage, type PlanCoupe } from "./maillage.js";

/** Classes dont la section est pleine (les mêmes que les pochés des documents). */
export const CLASSES_MATIERE = new Set<string>(["mur", "poteau", "dalle", "toiture", "escalier"]);

const aire = (p: readonly Vec[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

function contient(poly: readonly Vec[], q: Vec): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Chapeaux de coupe d'un ensemble de maillages : un maillage plan par objet coupé (couleur assombrie). */
export function chapeauxDeCoupe(maillages: readonly Maillage[], plan: PlanCoupe, classes: ReadonlySet<string> = CLASSES_MATIERE): Maillage[] {
  const [nx0, ny0, nz0] = plan.normale;
  const l = Math.hypot(nx0, ny0, nz0) || 1;
  const n = [nx0 / l, ny0 / l, nz0 / l] as const;
  // Base orthonormée du plan.
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [n[1] * ref[2]! - n[2] * ref[1]!, n[2] * ref[0]! - n[0] * ref[2]!, n[0] * ref[1]! - n[1] * ref[0]!];
  const lu = Math.hypot(u[0]!, u[1]!, u[2]!);
  u = u.map((x) => x / lu);
  const v = [n[1] * u[2]! - n[2] * u[1]!, n[2] * u[0]! - n[0] * u[2]!, n[0] * u[1]! - n[1] * u[0]!];
  const [px, py, pz] = plan.point;
  const vers2 = (x: number, y: number, z: number): Vec => ({ x: (x - px) * u[0]! + (y - py) * u[1]! + (z - pz) * u[2]!, y: (x - px) * v[0]! + (y - py) * v[1]! + (z - pz) * v[2]! });
  const vers3 = (p: Vec): [number, number, number] => [px + u[0]! * p.x + v[0]! * p.y, py + u[1]! * p.x + v[1]! * p.y, pz + u[2]! * p.x + v[2]! * p.y];

  const out: Maillage[] = [];
  for (const m of maillages) {
    if (!classes.has(m.classe) || m.opacite < 1) continue;
    const brut = couper(m, plan);
    if (brut.length < 12) continue;
    const segs: [Vec, Vec][] = [];
    for (let i = 0; i < brut.length; i += 6) {
      const a = vers2(brut[i]!, brut[i + 1]!, brut[i + 2]!);
      const b = vers2(brut[i + 3]!, brut[i + 4]!, brut[i + 5]!);
      if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-9) segs.push([a, b]);
    }
    const boucles = chainer(segs)
      .filter((c) => c.ferme && c.points.length >= 3)
      .map((c) => {
        const pts = c.points.length > 3 && Math.hypot(c.points[0]!.x - c.points[c.points.length - 1]!.x, c.points[0]!.y - c.points[c.points.length - 1]!.y) < 1e-9 ? c.points.slice(0, -1) : c.points;
        return { pts, aire: Math.abs(aire(pts)) };
      })
      .filter((b) => b.aire > 1e-8);
    if (!boucles.length) continue;
    const profondeur = boucles.map((b, i) => boucles.filter((o, j) => j !== i && o.aire > b.aire && contient(o.pts, b.pts[0]!)).length);
    const positions: number[] = [];
    const indices: number[] = [];
    boucles.forEach((b, i) => {
      if (profondeur[i]! % 2 !== 0) return;
      const trous = boucles.filter((t, j) => profondeur[j] === profondeur[i]! + 1 && t.aire < b.aire && contient(b.pts, t.pts[0]!)).map((t) => t.pts);
      const tri = trianguler(b.pts, trous);
      if (!tri.length) return;
      const tous = [...b.pts, ...trous.flat()];
      const base = positions.length / 3;
      for (const p of tous) positions.push(...vers3(p));
      for (const k of tri) indices.push(base + k);
    });
    if (indices.length) out.push({ objetId: m.objetId, classe: m.classe, niveauId: m.niveauId, positions, indices, couleur: assombrir(m.couleur), opacite: 1 });
  }
  return out;
}

/** Couleur de poché : la couleur de l'objet assombrie (même teinte, matière coupée lisible). */
export function assombrir(hex: string, facteur = 0.55): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#555555";
  const v = parseInt(m[1]!, 16);
  const c = (s: number) => Math.round(((v >> s) & 255) * facteur).toString(16).padStart(2, "0");
  return `#${c(16)}${c(8)}${c(0)}`;
}
