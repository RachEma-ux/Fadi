/**
 * Raccords de murs (lot 3b, limite levée) : géométrie **dérivée** des extrémités de murs qui se rejoignent sur un même
 * niveau, sans rien changer aux paramètres canoniques (axe, épaisseur, alignement) — le modèle reste la seule
 * source (D1) et les métrés restent comptés sur l'axe.
 *
 * - Angle (L) : deux murs, et deux seulement, partagent une extrémité sans être alignés → coupe d'onglet : chaque face
 *   est prolongée ou raccourcie jusqu'à la face correspondante de l'autre mur (extérieure avec extérieure,
 *   intérieure avec intérieure).
 * - Té (T) : l'extrémité d'un mur tombe dans l'épaisseur d'un autre, loin de ses extrémités → le mur aboutissant
 *   s'arrête sur la face du mur traversant qui lui fait face (ni recouvrement, ni vide).
 * - Nœud de trois murs ou plus avec une seule paire alignée : la paire se prolonge, les autres murs s'arrêtent sur
 *   sa face (comme un té).
 * - Autres nœuds de trois murs ou plus (aucune paire alignée, ou plusieurs — croisement de quatre murs) : chaque face
 *   s'arrête sur la face en vis-à-vis du mur voisin de son côté (ordre angulaire autour du nœud), et le contour du mur
 *   passe par le point du nœud, de sorte que les murs couvrent ensemble le cœur du nœud sans vide (D-032).
 * - Murs qui se croisent sans partager d'extrémité, murs alignés : extrémités inchangées (déclaré).
 * Un raccord qui déplacerait une extrémité de plus de quatre épaisseurs (angle très aigu) n'est pas appliqué.
 *
 * Le résultat est mis en cache par état d'objets (immuable) et par niveau.
 */
import { add, cross, dot, facesMur, mul, normalise, perp, sub, type Vec } from "./geometrie.js";
import type { ModeleAtelier, Occurrence } from "./modele.js";
import { pt, TOLERANCE_REDUCTEUR, type Point2 } from "./unites.js";

/** Abscisses (le long de l'axe a → b, depuis a) des extrémités de chaque face après raccord. */
export interface RaccordMur {
  gauche: [number, number];
  droite: [number, number];
  /** Nature du raccord à chaque extrémité (a, b). */
  extremites: [TypeRaccord, TypeRaccord];
  /** Nœud sans paire (D-032) : point du nœud par lequel passe le contour, à chaque extrémité. */
  pointes?: [Vec | null, Vec | null];
}

export type TypeRaccord = "libre" | "angle" | "te" | "noeud" | "non-traite";

interface MurPlan {
  id: string;
  a: Vec;
  b: Vec;
  L: number;
  u: Vec;
  n: Vec;
  e: number;
  /** Décalage signé (selon n) de la face gauche et de la face droite par rapport à l'axe. */
  oG: number;
  oD: number;
}

const SIN_ALIGNE = Math.sin((1 * Math.PI) / 180);

function versPlan(m: Occurrence<"mur">): MurPlan | null {
  const { a, b, epaisseur, alignement } = m.params;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return null;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const e = epaisseur.value;
  const oG = alignement === "axe" ? e / 2 : alignement === "gauche" ? 0 : e;
  const oD = alignement === "axe" ? -e / 2 : alignement === "gauche" ? -e : 0;
  return { id: m.id, a, b, L, u, n, e, oG, oD };
}

/** Ligne d'une face : point de départ et direction. */
const ligneFace = (m: MurPlan, face: "gauche" | "droite"): { p: Vec; d: Vec } => ({ p: add(m.a, mul(m.n, face === "gauche" ? m.oG : m.oD)), d: m.u });

function intersectionLignes(l1: { p: Vec; d: Vec }, l2: { p: Vec; d: Vec }): Vec | null {
  const den = cross(l1.d, l2.d);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(l2.p, l1.p), l2.d) / den;
  return add(l1.p, mul(l1.d, t));
}

/** Sens « vers l'extérieur » de la face, depuis le milieu de l'épaisseur. */
const sensFace = (m: MurPlan, face: "gauche" | "droite"): Vec => mul(m.n, face === "gauche" ? 1 : -1);

/** Le point est-il dans l'épaisseur du mur (tolérance comprise), loin de ses extrémités ? */
function dansEpaisseur(p: Vec, m: MurPlan, tol: number): boolean {
  const s = dot(sub(p, m.a), m.u);
  if (s <= tol || s >= m.L - tol) return false;
  const o = dot(sub(p, m.a), m.n);
  return o >= Math.min(m.oG, m.oD) - tol && o <= Math.max(m.oG, m.oD) + tol;
}

function calculer(murs: MurPlan[], tol: number): Map<string, RaccordMur> {
  const out = new Map<string, RaccordMur>();
  for (const w of murs) out.set(w.id, { gauche: [0, w.L], droite: [0, w.L], extremites: ["libre", "libre"] });
  for (const w of murs) {
    const r = out.get(w.id)!;
    for (const fin of [0, 1] as const) {
      const P = fin === 0 ? w.a : w.b;
      const dW = fin === 0 ? mul(w.u, -1) : w.u; // vers l'extérieur du mur, à cette extrémité
      const partages: { m: MurPlan; dO: Vec }[] = [];
      for (const o of murs) {
        if (o.id === w.id) continue;
        if (Math.hypot(o.a.x - P.x, o.a.y - P.y) <= tol) partages.push({ m: o, dO: o.u });
        else if (Math.hypot(o.b.x - P.x, o.b.y - P.y) <= tol) partages.push({ m: o, dO: mul(o.u, -1) });
      }
      let cible: { o: MurPlan; faces: Record<"gauche" | "droite", "gauche" | "droite"> } | null = null;
      let type: TypeRaccord = "libre";
      if (partages.length === 1) {
        const { m: o, dO } = partages[0]!;
        if (Math.abs(cross(dW, dO)) < SIN_ALIGNE) continue; // alignés : prolongement, rien à faire
        // Extérieur de w : la face opposée au corps de o ; extérieur de o : la face opposée au corps de w (-dW).
        const exterieurW: "gauche" | "droite" = dot(sensFace(w, "gauche"), dO) < 0 ? "gauche" : "droite";
        const exterieurO: "gauche" | "droite" = dot(sensFace(o, "gauche"), mul(dW, -1)) < 0 ? "gauche" : "droite";
        const autre = (f: "gauche" | "droite") => (f === "gauche" ? "droite" : "gauche");
        cible = { o, faces: { [exterieurW]: exterieurO, [autre(exterieurW)]: autre(exterieurO) } as Record<"gauche" | "droite", "gauche" | "droite"> };
        type = "angle";
      } else if (partages.length === 0) {
        const hotes = murs.filter((o) => o.id !== w.id && dansEpaisseur(P, o, tol) && Math.abs(cross(w.u, o.u)) >= SIN_ALIGNE);
        if (hotes.length === 1) {
          const o = hotes[0]!;
          // Face du mur traversant tournée vers le corps du mur aboutissant (direction -dW).
          const proche: "gauche" | "droite" = dot(sensFace(o, "gauche"), mul(dW, -1)) > 0 ? "gauche" : "droite";
          cible = { o, faces: { gauche: proche, droite: proche } };
          type = "te";
        } else if (hotes.length > 1) {
          r.extremites[fin] = "non-traite";
          continue;
        }
      } else {
        // Nœud de trois murs ou plus : une seule paire alignée (un mur qui continue) et les autres qui y aboutissent.
        // Les murs de la paire se prolongent l'un l'autre (rien à faire) ; un mur qui aboutit s'arrête sur leur face.
        const tous = [{ m: w, d: dW }, ...partages.map((x) => ({ m: x.m, d: x.dO }))];
        // Sens « vers l'intérieur du mur » depuis le nœud : opposé de dW pour w, dO pour les autres.
        const sens = tous.map((x, k) => (k === 0 ? mul(x.d, -1) : x.d));
        const paires: [number, number][] = [];
        for (let u = 0; u < tous.length; u++) for (let v = u + 1; v < tous.length; v++) if (dot(sens[u]!, sens[v]!) < -Math.cos((1 * Math.PI) / 180)) paires.push([u, v]);
        if (paires.length !== 1) {
          // Nœud sans paire unique : chaque face s'arrête sur la face en vis-à-vis du voisin de son côté.
          const ang = (v: Vec) => Math.atan2(v.y, v.x);
          const deux = 2 * Math.PI;
          const a0 = ang(sens[0]!);
          let ccw = -1;
          let cw = -1;
          let dccw = Infinity;
          let dcw = Infinity;
          for (let k = 1; k < tous.length; k++) {
            const d = (((ang(sens[k]!) - a0) % deux) + deux) % deux;
            if (d > 1e-9 && d < dccw) {
              dccw = d;
              ccw = k;
            }
            const d2 = (deux - d) % deux;
            if (d2 > 1e-9 && d2 < dcw) {
              dcw = d2;
              cw = k;
            }
          }
          if (ccw < 0 || cw < 0) {
            r.extremites[fin] = "non-traite";
            continue;
          }
          const cote = (m: MurPlan, s: Vec, signe: 1 | -1): "gauche" | "droite" => (cross(s, sensFace(m, "gauche")) * signe > 0 ? "gauche" : "droite");
          const nouvelles: Partial<Record<"gauche" | "droite", number>> = {};
          let valide = true;
          for (const [voisin, signe] of [[ccw, 1], [cw, -1]] as const) {
            const fW = cote(w, sens[0]!, signe);
            const o = tous[voisin]!.m;
            const fO = cote(o, sens[voisin]!, signe === 1 ? -1 : 1);
            const x = intersectionLignes(ligneFace(w, fW), ligneFace(o, fO));
            // Faces parallèles (voisin à 180°) : la face reste au nœud.
            const sx = x ? dot(sub(x, w.a), w.u) : fin === 0 ? 0 : w.L;
            if (Math.abs(sx - (fin === 0 ? 0 : w.L)) > 4 * Math.max(w.e, o.e) + tol) {
              valide = false;
              break;
            }
            nouvelles[fW] = sx;
          }
          if (!valide || nouvelles.gauche === undefined || nouvelles.droite === undefined) {
            r.extremites[fin] = "non-traite";
            continue;
          }
          r.gauche[fin] = nouvelles.gauche;
          r.droite[fin] = nouvelles.droite;
          r.extremites[fin] = "noeud";
          r.pointes ??= [null, null];
          r.pointes[fin] = P;
          continue;
        }
        const [pu, pv] = paires[0]!;
        if (pu === 0 || pv === 0) continue; // w est dans la paire alignée : il se prolonge dans l'autre mur
        const o = tous[pu]!.m;
        const proche: "gauche" | "droite" = dot(sensFace(o, "gauche"), mul(dW, -1)) > 0 ? "gauche" : "droite";
        cible = { o, faces: { gauche: proche, droite: proche } };
        type = "te";
      }
      if (!cible) continue;
      const nouvelles: Partial<Record<"gauche" | "droite", number>> = {};
      let valide = true;
      for (const face of ["gauche", "droite"] as const) {
        const x = intersectionLignes(ligneFace(w, face), ligneFace(cible.o, cible.faces[face]));
        if (!x) {
          valide = false;
          break;
        }
        const s = dot(sub(x, w.a), w.u);
        if (Math.abs(s - (fin === 0 ? 0 : w.L)) > 4 * Math.max(w.e, cible.o.e) + tol) {
          valide = false;
          break;
        }
        nouvelles[face] = s;
      }
      if (!valide) {
        r.extremites[fin] = "non-traite";
        continue;
      }
      r.gauche[fin] = nouvelles.gauche!;
      r.droite[fin] = nouvelles.droite!;
      r.extremites[fin] = type;
    }
    // Une face retournée (mur plus court que ses raccords) : on revient au rectangle.
    if (!(r.gauche[1] - r.gauche[0] > tol) || !(r.droite[1] - r.droite[0] > tol)) out.set(w.id, { gauche: [0, w.L], droite: [0, w.L], extremites: ["non-traite", "non-traite"] });
  }
  return out;
}

const cache = new WeakMap<object, Map<string, Map<string, RaccordMur>>>();

/** Raccords de tous les murs d'un niveau (cache par état d'objets). */
export function raccordsDuNiveau(etat: ModeleAtelier, niveauId: string | null): Map<string, RaccordMur> {
  let parNiveau = cache.get(etat.objets);
  if (!parNiveau) {
    parNiveau = new Map();
    cache.set(etat.objets, parNiveau);
  }
  const cle = niveauId ?? "";
  let r = parNiveau.get(cle);
  if (!r) {
    const murs: MurPlan[] = [];
    for (const o of Object.values(etat.objets)) {
      if (o.classe !== "mur" || o.niveauId !== niveauId) continue;
      const m = versPlan(o as Occurrence<"mur">);
      if (m) murs.push(m);
    }
    r = calculer(murs, TOLERANCE_REDUCTEUR * 10);
    parNiveau.set(cle, r);
  }
  return r;
}

export function raccordMur(etat: ModeleAtelier, mur: Occurrence<"mur">): RaccordMur | null {
  return raccordsDuNiveau(etat, mur.niveauId).get(mur.id) ?? null;
}

/** Faces du mur après raccord (mêmes conventions que `facesMur`). */
export function facesMurRaccordees(etat: ModeleAtelier, mur: Occurrence<"mur">): { gauche: [Vec, Vec]; droite: [Vec, Vec] } {
  const m = versPlan(mur);
  const r = raccordMur(etat, mur);
  if (!m || !r) return facesMur(mur.params.a, mur.params.b, mur.params.epaisseur.value, mur.params.alignement);
  const pnt = (s: number, o: number): Vec => add(add(m.a, mul(m.u, s)), mul(m.n, o));
  return { gauche: [pnt(r.gauche[0], m.oG), pnt(r.gauche[1], m.oG)], droite: [pnt(r.droite[0], m.oD), pnt(r.droite[1], m.oD)] };
}

/** Polygone du mur après raccord, sens direct (remplace `polygoneMur` pour le dessin). */
export function polygoneMurRaccorde(etat: ModeleAtelier, mur: Occurrence<"mur">): Point2[] {
  const f = facesMurRaccordees(etat, mur);
  const r = raccordMur(etat, mur);
  // Contour : droite a → b, (pointe du nœud en b), gauche b → a, (pointe du nœud en a).
  const quad = [f.droite[0], f.droite[1], ...(r?.pointes?.[1] ? [r.pointes[1]] : []), f.gauche[1], f.gauche[0], ...(r?.pointes?.[0] ? [r.pointes[0]] : [])];
  let aire = 0;
  for (let i = 0; i < quad.length; i++) aire += cross(quad[i]!, quad[(i + 1) % quad.length]!);
  return (aire < 0 ? quad.reverse() : quad).map((p) => pt(p.x, p.y));
}

