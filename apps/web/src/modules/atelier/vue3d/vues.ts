/**
 * Vues techniques de travail (L3b.4, cahier §7 lot 3b) — module pur : plan (coupe horizontale), coupes verticales
 * nord–sud, est–ouest et selon un plan quelconque, façades, en 2D, calculées depuis la scène 3D (`scene.ts`) avec
 * `cutPrism` de `@parcours/core-geometry`. Vues **de travail**, sans export ni annotation (les documents viennent
 * au lot 5).
 *
 * Repère de chaque vue : `u` horizontal (m), `v` vertical (m) — altitude pour coupes et façades, y du projet pour
 * le plan. Coupe nord–sud : plan x = position, regardé depuis l'est (u = y, nord à droite) ; coupe est–ouest :
 * plan y = position, regardé depuis le sud (u = x, est à droite) ; coupe quelconque : plan vertical d'angle
 * `angle` (degrés, depuis +x) décalé de `position` depuis le centre de la scène, u le long du plan. Façades :
 * projection orthogonale vue de l'extérieur du côté nommé (façade sud : regard vers le nord, est à droite).
 */
import { cutPrism, type Point2Local } from "@parcours/core-geometry";
import type { IdObjet } from "@parcours/atelier-model";
import type { Prisme3d, Scene3d, Xy } from "./scene";

export type TypeVue = "plan" | "coupe-ns" | "coupe-eo" | "coupe-quelconque" | "facade-sud" | "facade-nord" | "facade-est" | "facade-ouest";

export const LIBELLES_VUE: Readonly<Record<TypeVue, string>> = {
  plan: "Plan (coupe horizontale)",
  "coupe-ns": "Coupe nord–sud",
  "coupe-eo": "Coupe est–ouest",
  "coupe-quelconque": "Coupe selon un plan quelconque",
  "facade-sud": "Façade sud",
  "facade-nord": "Façade nord",
  "facade-est": "Façade est",
  "facade-ouest": "Façade ouest",
};

export interface ParametresVue {
  readonly type: TypeVue;
  /** Plan : altitude de coupe (m) ; coupes : position du plan (m, repère du projet ; coupe quelconque : décalage depuis le centre). */
  readonly position: number;
  /** Coupe quelconque : direction du plan (degrés, sens trigonométrique depuis +x). */
  readonly angle?: number;
}

/** `coupe` : matière coupée (pochée) ; `vue` : vu au-delà (contour) ; `baie` : remplissage de baie. */
export type StyleForme = "coupe" | "vue" | "baie";

export interface Forme2d {
  readonly objetId: IdObjet;
  readonly classe: string;
  readonly points: readonly Xy[];
  /** Trous du contour (plan coupé : remplissage pair-impair). */
  readonly trous?: readonly (readonly Xy[])[];
  readonly style: StyleForme;
  /** Profondeur (m) pour l'ordre de dessin : les plus lointaines d'abord. */
  readonly profondeur: number;
}

export interface Vue2d {
  readonly type: TypeVue;
  readonly formes: readonly Forme2d[];
  /** Lignes de niveau (coupes et façades) : altitude et nom. */
  readonly niveaux: readonly { readonly v: number; readonly nom: string }[];
  readonly bornes: { readonly min: Xy; readonly max: Xy } | null;
  /** Ce que la vue montre, pour l'en-tête (« Coupe nord–sud à x = 12,40 m »). */
  readonly titre: string;
}

const fmt = (v: number) => v.toFixed(2).replace(".", ",");
const rect = (u0: number, u1: number, v0: number, v1: number): Xy[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/** Bornes horizontales utiles aux curseurs (min / max de x, y et z de la scène). */
export function etendue(scene: Scene3d): { x: Xy; y: Xy; z: Xy; centre: Xy } | null {
  if (!scene.bornes) return null;
  const { min, max } = scene.bornes;
  return { x: [min[0], max[0]], y: [min[1], max[1]], z: [min[2], max[2]], centre: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2] };
}

/** Rotation dans le repère du plan de coupe quelconque : u le long du plan, w = distance signée au plan. */
function repereCoupe(centre: Xy, angleDeg: number, position: number) {
  const a = (angleDeg * Math.PI) / 180;
  const d: Xy = [Math.cos(a), Math.sin(a)];
  const n: Xy = [-d[1], d[0]];
  const o: Xy = [centre[0] + n[0] * position, centre[1] + n[1] * position];
  const versUW = ([x, y]: Xy): Point2Local => [(x - o[0]) * d[0] + (y - o[1]) * d[1], (x - o[0]) * n[0] + (y - o[1]) * n[1]] as Point2Local;
  return { versUW };
}

function coupeVerticale(prismes: readonly Prisme3d[], transformer: (p: Xy) => Point2Local): Forme2d[] {
  const formes: Forme2d[] = [];
  for (const p of prismes) {
    const poly = p.contour.map(transformer);
    const holes = p.trous.map((t) => t.map(transformer));
    // Coupe : plan w = 0 (axe 1 du repère transformé) ; segments le long de u.
    for (const s of cutPrism({ poly, holes, z0: p.z0, z1: p.z1, kind: "wall", id: p.objetId }, 1, 0)) {
      formes.push({ objetId: p.objetId, classe: p.classe, points: rect(s.a, s.b, s.z0, s.z1), style: "coupe", profondeur: 0 });
    }
    // Vu au-delà (côté w > 0) : silhouette = intervalle de u × [z0, z1] (un contour connexe se projette en un intervalle).
    const ws = poly.map((q) => q[1]);
    if (Math.max(...ws) > 0) {
      const us = poly.map((q) => q[0]);
      const proche = Math.max(0, Math.min(...ws));
      formes.push({ objetId: p.objetId, classe: p.classe, points: rect(Math.min(...us), Math.max(...us), p.z0, p.z1), style: "vue", profondeur: proche });
    }
  }
  return formes;
}

export function vueTechnique(scene: Scene3d, niveaux: readonly { id: IdObjet; nom: string; elevation: number }[], params: ParametresVue): Vue2d {
  const e = etendue(scene);
  const lignesNiveaux = niveaux.map((n) => ({ v: n.elevation, nom: n.nom }));
  let formes: Forme2d[] = [];
  let titre = LIBELLES_VUE[params.type];
  if (!e) return { type: params.type, formes: [], niveaux: [], bornes: null, titre };

  switch (params.type) {
    case "plan": {
      const h = params.position;
      titre = `Plan, coupe horizontale à ${fmt(h)} m`;
      for (const p of scene.prismes) {
        if (p.z0 <= h && h < p.z1) formes.push({ objetId: p.objetId, classe: p.classe, points: p.contour, trous: p.trous, style: "coupe", profondeur: 0 });
        else if (p.z1 <= h) formes.push({ objetId: p.objetId, classe: p.classe, points: p.contour, trous: p.trous, style: "vue", profondeur: h - p.z1 });
      }
      return { type: params.type, formes: trier(formes), niveaux: [], bornes: bornes(formes), titre };
    }
    case "coupe-ns":
      titre = `Coupe nord–sud à x = ${fmt(params.position)} m, vue depuis l'est`;
      // Regard vers l'ouest depuis l'est : u = y (nord à droite), w = position − x (au-delà = ouest).
      formes = coupeVerticale(scene.prismes, ([x, y]) => [y, params.position - x] as Point2Local);
      break;
    case "coupe-eo":
      titre = `Coupe est–ouest à y = ${fmt(params.position)} m, vue depuis le sud`;
      // Regard vers le nord depuis le sud : u = x (est à droite), w = y − position (au-delà = nord).
      formes = coupeVerticale(scene.prismes, ([x, y]) => [x, y - params.position] as Point2Local);
      break;
    case "coupe-quelconque": {
      const angle = params.angle ?? 0;
      titre = `Coupe selon un plan d'angle ${fmt(angle)}°, décalé de ${fmt(params.position)} m du centre`;
      formes = coupeVerticale(scene.prismes, repereCoupe(e.centre, angle, params.position).versUW);
      break;
    }
    default: {
      // Façades : projection orthogonale, profondeur = distance au spectateur ; les baies dessinées sur leur mur.
      const cote = params.type.slice("facade-".length) as "sud" | "nord" | "est" | "ouest";
      const proj = ([x, y]: Xy): [number, number] => (cote === "sud" ? [x, y] : cote === "nord" ? [-x, -y] : cote === "est" ? [y, -x] : [-y, x]);
      const projetes = scene.prismes.map((p) => {
        const q = p.contour.map(proj);
        const us = q.map((r) => r[0]);
        const ws = q.map((r) => r[1]);
        return { p, u: [Math.min(...us), Math.max(...us)] as Xy, w: [Math.min(...ws), Math.max(...ws)] as Xy };
      });
      for (const { p, u, w } of projetes) {
        formes.push({ objetId: p.objetId, classe: p.classe, points: rect(u[0], u[1], p.z0, p.z1), style: "vue", profondeur: w[0] });
      }
      for (const s of scene.surfaces) {
        const pts = s.points.map(([x, y, z]) => [proj([x, y]), z] as const);
        const us = pts.map(([[u]]) => u);
        const u0 = Math.min(...us);
        const u1 = Math.max(...us);
        const wb = Math.min(...pts.map(([[, w]]) => w));
        // La baie est dans l'épaisseur de son mur : dessinée juste devant la face proche des morceaux qui la jouxtent.
        const hotes = projetes.filter(({ u, w }) => w[0] - 1e-6 <= wb && wb <= w[1] + 1e-6 && u[0] <= u1 + 1e-6 && u0 - 1e-6 <= u[1]);
        const face = hotes.length > 0 ? Math.min(...hotes.map(({ w }) => w[0])) : wb;
        formes.push({ objetId: s.objetId, classe: s.classe, points: pts.map(([[u], z]) => [u, z] as const), style: "baie", profondeur: face - 1e-3 });
      }
      titre = LIBELLES_VUE[params.type];
    }
  }
  return { type: params.type, formes: trier(formes), niveaux: lignesNiveaux, bornes: bornes(formes), titre };
}

/** Ordre du peintre : les plus lointaines d'abord ; à profondeur égale, vu < baie < coupé. */
function trier(f: Forme2d[]): Forme2d[] {
  const rang: Record<StyleForme, number> = { vue: 0, baie: 1, coupe: 2 };
  return f.sort((a, b) => b.profondeur - a.profondeur || rang[a.style] - rang[b.style]);
}

function bornes(f: readonly Forme2d[]): Vue2d["bornes"] {
  if (f.length === 0) return null;
  let u0 = Infinity;
  let v0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  for (const x of f)
    for (const [u, v] of x.points) {
      u0 = Math.min(u0, u);
      v0 = Math.min(v0, v);
      u1 = Math.max(u1, u);
      v1 = Math.max(v1, v);
    }
  return { min: [u0, v0], max: [u1, v1] };
}
