import { studioRingSimple, studioSignedArea } from "../courbes.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioOpening, StudioWall } from "./types.js";

/**
 * Géométrie dérivée des murs et ouvertures (A.4), pure : emprise du mur (onglets aux sommets de l'axe), segments,
 * intervalle « courant » de chaque segment (où la section du mur est complète), placement d'une ouverture, morceaux de
 * plan (avec les vides des ouvertures) et morceaux de volume (avec les vides). Repère `local-2d`, mètres. Rien n'est
 * stocké : tout se recalcule depuis les valeurs saisies.
 *
 * Tolérance de comparaison : 10⁻⁹ relatif à la longueur de l'axe (bruit flottant des sommes de longueurs), jamais une
 * valeur métier.
 */

const sub = (a: StudioPoint, b: StudioPoint) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: StudioPoint, b: StudioPoint) => a.x * b.x + a.y * b.y;
const at = (p: StudioPoint, d: StudioPoint, s: number, n: StudioPoint, u: number): StudioPoint => ({ x: p.x + d.x * s + n.x * u, y: p.y + d.y * s + n.y * u });

/** Décalages latéraux du corps du mur (normale à gauche positive) : côté droit `droite` ≤ côté gauche `gauche`. */
export function lateraux(w: Pick<StudioWall, "thickness" | "justification">): { droite: number; gauche: number } {
  if (w.justification === "left") return { droite: 0, gauche: w.thickness };
  if (w.justification === "right") return { droite: -w.thickness, gauche: 0 };
  return { droite: -w.thickness / 2, gauche: w.thickness / 2 };
}

export interface SegmentMur {
  indice: number;
  a: StudioPoint;
  b: StudioPoint;
  /** Direction unitaire et normale à gauche. */
  d: StudioPoint;
  n: StudioPoint;
  longueur: number;
  /** Abscisse curviligne du point `a` le long de l'axe. */
  debut: number;
  /** Coins de l'emprise du segment (onglets compris) : côté gauche et côté droit, au début et à la fin. */
  gaucheDebut: StudioPoint;
  gaucheFin: StudioPoint;
  droiteDebut: StudioPoint;
  droiteFin: StudioPoint;
  /** Intervalle (abscisses locales au segment) où la section du mur est complète : une ouverture doit y tenir. */
  courant: [number, number];
}

export interface GeometrieMur {
  segments: SegmentMur[];
  /** Emprise fermée (côté gauche aller, côté droit retour). */
  anneau: StudioPoint[];
  longueur: number;
  /** Aire exacte de l'emprise (m²). */
  aire: number;
  tolerance: number;
}

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; raison: string };

/** Nombre lisible dans un message (arrondi au nanomètre). */
export const fmt = (v: number): string => String(Math.round(v * 1e9) / 1e9);

/** Géométrie d'un mur (déjà validé champ par champ) ; refus motivé si l'emprise n'est pas un contour simple. */
export function geometrieMur(w: StudioWall): Resultat<GeometrieMur> {
  const { droite, gauche } = lateraux(w);
  const pts = w.axis;
  const n = pts.length;
  const dirs: { d: StudioPoint; nrm: StudioPoint; l: number }[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const v = sub(pts[i + 1]!, pts[i]!);
    const l = Math.hypot(v.x, v.y);
    if (!(l > 0) || !Number.isFinite(l)) return { ok: false, raison: `segment ${i + 1} de l’axe de longueur nulle` };
    const d = { x: v.x / l, y: v.y / l };
    dirs.push({ d, nrm: { x: -d.y, y: d.x }, l });
  }
  /** Point de la chaîne décalée `u` au sommet k (onglet aux sommets intérieurs, perpendiculaire aux extrémités). */
  const chaine = (k: number, u: number): StudioPoint | null => {
    if (k === 0) return at(pts[0]!, dirs[0]!.d, 0, dirs[0]!.nrm, u);
    if (k === n - 1) return at(pts[n - 1]!, dirs[n - 2]!.d, 0, dirs[n - 2]!.nrm, u);
    const p = dirs[k - 1]!, q = dirs[k]!;
    const c = dot(p.d, q.d);
    if (1 + c <= 1e-12) return null;
    const m = { x: (p.nrm.x + q.nrm.x) / (1 + c), y: (p.nrm.y + q.nrm.y) / (1 + c) };
    return { x: pts[k]!.x + m.x * u, y: pts[k]!.y + m.y * u };
  };
  const gaucheCh: StudioPoint[] = [], droiteCh: StudioPoint[] = [];
  for (let k = 0; k < n; k++) {
    const g = chaine(k, gauche), dr = chaine(k, droite);
    if (!g || !dr) return { ok: false, raison: `demi-tour de l’axe au sommet ${k + 1} : l’emprise du mur n’est pas définie` };
    gaucheCh.push(g);
    droiteCh.push(dr);
  }
  const segments: SegmentMur[] = [];
  let debut = 0;
  for (let i = 0; i + 1 < n; i++) {
    const { d, nrm, l } = dirs[i]!;
    const a = pts[i]!;
    const s = (p: StudioPoint) => dot(sub(p, a), d);
    const quad = [gaucheCh[i]!, gaucheCh[i + 1]!, droiteCh[i + 1]!, droiteCh[i]!];
    if (!studioRingSimple(quad)) return { ok: false, raison: `segment ${i + 1} de l’axe trop court pour ses jonctions d’angle (l’emprise se recoupe)` };
    segments.push({
      indice: i, a, b: pts[i + 1]!, d, n: nrm, longueur: l, debut,
      gaucheDebut: gaucheCh[i]!, gaucheFin: gaucheCh[i + 1]!, droiteDebut: droiteCh[i]!, droiteFin: droiteCh[i + 1]!,
      courant: [Math.max(0, s(gaucheCh[i]!), s(droiteCh[i]!)), Math.min(l, s(gaucheCh[i + 1]!), s(droiteCh[i + 1]!))],
    });
    debut += l;
  }
  const anneau = [...gaucheCh, ...[...droiteCh].reverse()];
  if (!studioRingSimple(anneau)) return { ok: false, raison: "l’emprise du mur se recoupe (axe trop replié pour son épaisseur)" };
  return { ok: true, valeur: { segments, anneau, longueur: debut, aire: Math.abs(studioSignedArea(anneau)), tolerance: 1e-9 * Math.max(1, debut) } };
}

/** Ouverture placée sur son segment : abscisses locales du début et de la fin. */
export interface OuverturePlacee {
  ouverture: StudioOpening;
  segment: SegmentMur;
  s0: number;
  s1: number;
}

/**
 * Placement d'une ouverture sur la géométrie de son mur hôte, ou le motif précis de l'incompatibilité : hors de l'axe,
 * à cheval sur un sommet de l'axe, empiètement sur une jonction d'angle, plus haute que le mur.
 */
export function placerOuverture(w: StudioWall, g: GeometrieMur, o: StudioOpening): Resultat<OuverturePlacee> {
  const tol = g.tolerance;
  const fin = o.position + o.width;
  if (fin > g.longueur + tol) {
    return { ok: false, raison: `hors du mur hôte ${w.id} (position + largeur = ${fmt(fin)} m, au-delà de la longueur de l’axe ${fmt(g.longueur)} m)` };
  }
  if (o.sill + o.height > w.height + tol) {
    return { ok: false, raison: `plus haute que le mur hôte ${w.id} (allège + hauteur = ${fmt(o.sill + o.height)} m, au-delà de la hauteur du mur ${fmt(w.height)} m)` };
  }
  const segment = g.segments.find((s, i) => o.position >= s.debut - tol && (o.position < s.debut + s.longueur - tol || i === g.segments.length - 1));
  if (!segment) return { ok: false, raison: `hors du mur hôte ${w.id}` };
  if (fin > segment.debut + segment.longueur + tol) {
    return { ok: false, raison: `à cheval sur le sommet ${segment.indice + 2} de l’axe du mur hôte ${w.id} (une ouverture tient dans un seul segment)` };
  }
  const s0 = Math.max(0, o.position - segment.debut), s1 = Math.min(segment.longueur, fin - segment.debut);
  if (s0 < segment.courant[0] - tol || s1 > segment.courant[1] + tol) {
    return { ok: false, raison: `empiète sur une jonction d’angle du mur hôte ${w.id} (partie courante du segment ${segment.indice + 1} : de ${fmt(segment.debut + segment.courant[0])} m à ${fmt(segment.debut + segment.courant[1])} m le long de l’axe)` };
  }
  return { ok: true, valeur: { ouverture: o, segment, s0, s1 } };
}

const chevauche = (a0: number, a1: number, b0: number, b1: number, tol: number) => Math.min(a1, b1) - Math.max(a0, b0) > tol;

/** Deux ouvertures du même mur se chevauchent (le long de l'axe **et** en hauteur, sur une étendue non nulle). */
export function ouverturesSeChevauchent(a: StudioOpening, b: StudioOpening, tol: number): boolean {
  return chevauche(a.position, a.position + a.width, b.position, b.position + b.width, tol) && chevauche(a.sill, a.sill + a.height, b.sill, b.sill + b.height, tol);
}

/** Bord du morceau : `debut` / `fin` du segment (onglet) ou coupe perpendiculaire à l'abscisse `s`. */
type Bord = "debut" | "fin" | number;
const cote = (seg: SegmentMur, bord: Bord, u: number, cotes: { droite: number; gauche: number }): StudioPoint => {
  if (bord === "debut") return u === cotes.gauche ? seg.gaucheDebut : seg.droiteDebut;
  if (bord === "fin") return u === cotes.gauche ? seg.gaucheFin : seg.droiteFin;
  return at(seg.a, seg.d, bord, seg.n, u);
};
/** Quadrilatère du segment entre deux bords (côté droit au début, côté droit à la fin, côté gauche à la fin, au début). */
function quadrilatere(w: StudioWall, seg: SegmentMur, de: Bord, a: Bord): StudioPoint[] {
  const c = lateraux(w);
  return [cote(seg, de, c.droite, c), cote(seg, a, c.droite, c), cote(seg, a, c.gauche, c), cote(seg, de, c.gauche, c)];
}

/** Intervalles [s0, s1] fusionnés et triés. */
function fusionner(iv: [number, number][]): [number, number][] {
  const tri = [...iv].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of tri) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Morceaux de plan d'un mur : quadrilatères des parties pleines de chaque segment, interrompues par **toute**
 * ouverture déclarée, quelle que soit son allège (aucune hauteur de coupe n'est supposée).
 */
export function morceauxPlan(w: StudioWall, g: GeometrieMur, placees: readonly OuverturePlacee[]): StudioPoint[][] {
  const out: StudioPoint[][] = [];
  for (const seg of g.segments) {
    const vides = fusionner(placees.filter((p) => p.segment.indice === seg.indice).map((p) => [p.s0, p.s1]));
    let de: Bord = "debut";
    for (const [a, b] of vides) {
      if (!(de === "debut" && a <= 0)) out.push(quadrilatere(w, seg, de, a <= 0 ? "debut" : a));
      de = b >= seg.longueur ? "fin" : b;
    }
    if (de !== "fin") out.push(quadrilatere(w, seg, de, "fin"));
  }
  return out;
}

/** Montants d'une ouverture en plan : deux traits à travers l'épaisseur, au début et à la fin. */
export function montantsOuverture(w: StudioWall, p: OuverturePlacee): [[StudioPoint, StudioPoint], [StudioPoint, StudioPoint]] {
  const c = lateraux(w);
  const trait = (s: number): [StudioPoint, StudioPoint] => [at(p.segment.a, p.segment.d, s, p.segment.n, c.droite), at(p.segment.a, p.segment.d, s, p.segment.n, c.gauche)];
  return [trait(p.s0), trait(p.s1)];
}

/** Contour en plan du vide d'une ouverture (rectangle à travers l'épaisseur). */
export function contourOuverture(w: StudioWall, p: OuverturePlacee): StudioPoint[] {
  const c = lateraux(w);
  const s = p.segment;
  return [at(s.a, s.d, p.s0, s.n, c.droite), at(s.a, s.d, p.s1, s.n, c.droite), at(s.a, s.d, p.s1, s.n, c.gauche), at(s.a, s.d, p.s0, s.n, c.gauche)];
}

/** Morceau de volume : quadrilatère en plan extrudé de `zMin` à `zMax` (cotes absolues). */
export interface MorceauVolume {
  plan: StudioPoint[];
  zMin: number;
  zMax: number;
}

/**
 * Morceaux de volume d'un mur avec les vides de ses ouvertures : chaque segment est découpé le long de l'axe aux bords
 * des ouvertures ; dans chaque tranche, la hauteur du mur moins les ouvertures qui la traversent.
 */
export function morceauxVolume(w: StudioWall, g: GeometrieMur, placees: readonly OuverturePlacee[]): MorceauVolume[] {
  const out: MorceauVolume[] = [];
  const z0 = w.base, z1 = w.base + w.height;
  for (const seg of g.segments) {
    const ici = placees.filter((p) => p.segment.indice === seg.indice);
    const coupes = [...new Set(ici.flatMap((p) => [p.s0, p.s1]).filter((s) => s > 0 && s < seg.longueur))].sort((a, b) => a - b);
    const bords: Bord[] = ["debut", ...coupes, "fin"];
    for (let i = 0; i + 1 < bords.length; i++) {
      const de = bords[i]!, a = bords[i + 1]!;
      const sa = de === "debut" ? 0 : de as number, sb = a === "fin" ? seg.longueur : a as number;
      const milieu = (sa + sb) / 2;
      const trous = fusionner(ici.filter((p) => p.s0 < milieu && milieu < p.s1).map((p) => [z0 + p.ouverture.sill, z0 + p.ouverture.sill + p.ouverture.height]));
      const plan = quadrilatere(w, seg, de, a);
      let bas = z0;
      for (const [h0, h1] of trous) {
        if (h0 > bas) out.push({ plan, zMin: bas, zMax: h0 });
        bas = Math.max(bas, h1);
      }
      if (bas < z1) out.push({ plan, zMin: bas, zMax: z1 });
    }
  }
  return out;
}
