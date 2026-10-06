/**
 * Escalier balancé (D-123, DA-07-10) : `escalier.balance` { niveauId, points (axe : départ, angles, arrivée ; tous
 * les tournants du même côté), largeur, hauteurAFranchir, contremarches, epaisseurMarche, ligneFoulee (distance de
 * la ligne de foulée au limon intérieur), marchesBalancees (marches par tournant), nom? } crée une marche par
 * contremarche — un solide de l'épaisseur saisie, dessus à la hauteur atteinte — sans palier : les marches tournent.
 *
 * Méthode (déclarée, géométrique) : les girons sont égaux sur la ligne de foulée ; hors des tournants, les nez de
 * marche sont perpendiculaires à la volée ; dans chaque tournant, les `marchesBalancees` marches centrées sur l'angle
 * se partagent également la longueur du limon intérieur comprise entre les deux nez droits qui les encadrent
 * (répartition régulière au limon intérieur), chaque nez passant par son point de la ligne de foulée jusqu'au limon
 * extérieur. Toutes les valeurs sont saisies ; aucune règle de confort (giron minimal au collet, formule de
 * Blondel) n'est appliquée ni supposée. Un balancement impossible (nez qui se croisent) est refusé avec son motif.
 */
import { add, aireSignee, cross, distance, dot, mul, normalise, perp, sub, type Vec } from "../geometrie.js";
import type { ModeleAtelier } from "../modele.js";
import { pt, type Point2 } from "../unites.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, type ContexteCommande, type ResultatCommande } from "./base.js";
import { creerOccurrence } from "./objets.js";

type Brut = Record<string, unknown>;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Polyligne décalée (onglets) : côté gauche pour d > 0. */
function decaler(points: readonly Vec[], d: number): Vec[] {
  const n = points.length;
  return points.map((p, i) => {
    const n1 = i > 0 ? perp(normalise(sub(p, points[i - 1]!))) : null;
    const n2 = i < n - 1 ? perp(normalise(sub(points[i + 1]!, p))) : null;
    if (!n1) return add(p, mul(n2!, d));
    if (!n2) return add(p, mul(n1, d));
    const s = add(n1, n2);
    return add(p, mul(s, d / (1 + dot(n1, n2))));
  });
}

const cumul = (pts: readonly Vec[]): number[] => {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + distance(pts[i - 1]!, pts[i]!));
  return out;
};

function pointA(pts: readonly Vec[], L: readonly number[], s: number): { p: Vec; i: number } {
  for (let i = 0; i + 1 < pts.length; i++) {
    if (s <= L[i + 1]! + 1e-12 || i + 2 === pts.length) {
      const l = L[i + 1]! - L[i]!;
      const t = l > 0 ? Math.max(0, Math.min(1, (s - L[i]!) / l)) : 0;
      return { p: add(pts[i]!, mul(sub(pts[i + 1]!, pts[i]!), t)), i };
    }
  }
  return { p: pts[0]!, i: 0 };
}

/** Abscisse curviligne de la rencontre de la droite (o, dir) avec la polyligne, la plus proche de `o` (t ≥ tmin). */
function rencontre(pts: readonly Vec[], L: readonly number[], o: Vec, dir: Vec, tmin: number): { s: number; p: Vec } | null {
  let best: { s: number; p: Vec; t: number } | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const d = sub(pts[i + 1]!, a);
    const den = cross(dir, d);
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, o);
    const t = cross(w, d) / den;
    const u = cross(w, dir) / den;
    if (u < -1e-9 || u > 1 + 1e-9 || t < tmin) continue;
    if (!best || Math.abs(t) < Math.abs(best.t)) best = { s: L[i]! + Math.max(0, Math.min(1, u)) * (L[i + 1]! - L[i]!), p: add(a, mul(d, Math.max(0, Math.min(1, u)))), t };
  }
  return best ? { s: best.s, p: best.p } : null;
}

/** Portion de polyligne entre deux abscisses (s0 < s1), extrémités comprises. */
function portion(pts: readonly Vec[], L: readonly number[], s0: number, s1: number): Vec[] {
  const out = [pointA(pts, L, s0).p];
  for (let i = 1; i + 1 < pts.length; i++) if (L[i]! > s0 + 1e-9 && L[i]! < s1 - 1e-9) out.push(pts[i]!);
  out.push(pointA(pts, L, s1).p);
  return out;
}

/** Contours des marches d'un escalier balancé (fonction pure ; refus motivés). */
export function marchesBalancees(points: readonly Vec[], largeur: number, n: number, ligneFoulee: number, m: number): Point2[][] {
  const k = points.length - 1;
  const dirs = Array.from({ length: k }, (_, i) => normalise(sub(points[i + 1]!, points[i]!)));
  const tours = dirs.slice(1).map((d, i) => Math.sign(cross(dirs[i]!, d)));
  if (tours.some((s) => s === 0)) throw new ErreurCommande("invalide", "points", "deux tronçons alignés : retirer le point intermédiaire");
  if (new Set(tours).size > 1) throw new ErreurCommande("invalide", "points", "tournants de sens différents : un escalier balancé tourne toujours du même côté");
  const sigma = tours[0]!; // +1 : tournants à gauche (limon intérieur à gauche)
  const w = largeur / 2;
  const interieur = decaler(points, sigma * w);
  const exterieur = decaler(points, -sigma * w);
  const foulee = decaler(points, sigma * (w - ligneFoulee));
  const LI = cumul(interieur);
  const LO = cumul(exterieur);
  const LF = cumul(foulee);
  const g = LF[LF.length - 1]! / n;
  // Zones balancées : `m` marches centrées sur chaque angle (abscisse de l'angle sur la ligne de foulée).
  const zones = LF.slice(1, -1).map((s) => {
    const k1 = Math.round(s / g - m / 2);
    return [k1, k1 + m] as const;
  });
  zones.forEach(([a, b], i) => {
    if (a < 0 || b > n) throw new ErreurCommande("precondition", "marchesBalancees", `tournant ${i + 1} : les ${m} marches balancées dépassent le départ ou l'arrivée — réduire leur nombre ou allonger les volées`);
    if (i > 0 && a < zones[i - 1]![1]) throw new ErreurCommande("precondition", "marchesBalancees", `tournants ${i} et ${i + 1} : zones balancées qui se chevauchent — réduire le nombre de marches balancées`);
  });
  // Nez de marche droits (perpendiculaires à la volée) : point intérieur et point extérieur.
  const nezDroit = (j: number) => {
    const f = pointA(foulee, LF, j * g);
    const nrm = perp(dirs[f.i]!);
    const ri = rencontre(interieur, LI, f.p, mul(nrm, sigma), -1e-9);
    if (!ri) throw new ErreurCommande("precondition", "marchesBalancees", `nez de marche ${j} : limon intérieur non atteint — augmenter le nombre de marches balancées`);
    return { f: f.p, sI: ri.s };
  };
  const sI: number[] = [];
  const F: Vec[] = [];
  for (let j = 0; j <= n; j++) {
    const zone = zones.find(([a, b]) => j > a && j < b);
    if (!zone) {
      const d = nezDroit(j);
      sI.push(d.sI);
      F.push(d.f);
    } else {
      F.push(pointA(foulee, LF, j * g).p);
      sI.push(Number.NaN);
    }
  }
  for (const [a, b] of zones) for (let j = a + 1; j < b; j++) sI[j] = sI[a]! + ((sI[b]! - sI[a]!) * (j - a)) / (b - a);
  const sO: number[] = [];
  for (let j = 0; j <= n; j++) {
    const I = pointA(interieur, LI, sI[j]!).p;
    const dir = sub(F[j]!, I);
    const ro = distance(F[j]!, I) > 1e-9 ? rencontre(exterieur, LO, I, normalise(dir), distance(F[j]!, I) - 1e-9) : null;
    if (!ro) throw new ErreurCommande("precondition", "marchesBalancees", `nez de marche ${j} : limon extérieur non atteint`);
    sO.push(ro.s);
  }
  for (let j = 0; j < n; j++) {
    if (!(sI[j + 1]! > sI[j]! + 1e-6) || !(sO[j + 1]! > sO[j]! + 1e-6)) throw new ErreurCommande("precondition", "marchesBalancees", `marche ${j + 1} : nez de marche qui se croisent — changer le nombre de marches balancées ou la ligne de foulée`);
  }
  const marches: Point2[][] = [];
  for (let j = 0; j < n; j++) {
    const poly = [...portion(interieur, LI, sI[j]!, sI[j + 1]!), ...portion(exterieur, LO, sO[j]!, sO[j + 1]!).reverse()];
    const c = aireSignee(poly) < 0 ? poly.reverse() : poly;
    marches.push(c.map((q) => pt(r6(q.x), r6(q.y))));
  }
  return marches;
}

export function creerEscalierBalance(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const niveauId = lire.chaine(p, "niveauId");
  if (!etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  const points = lire.points(p, "points", { min: 3 });
  const largeur = lire.longueur(p, "largeur", { strict: true })!.value;
  const H = lire.longueur(p, "hauteurAFranchir", { strict: true })!.value;
  const n = lire.nombre(p, "contremarches", { entier: true, min: 2, max: 200 })!;
  const ep = lire.longueur(p, "epaisseurMarche", { strict: true })!.value;
  const f = lire.longueur(p, "ligneFoulee", { strict: true })!.value;
  const m = lire.nombre(p, "marchesBalancees", { entier: true, min: 2, max: 20 })!;
  if (!(largeur > 0) || !(H > 0) || !(ep > 0)) throw new ErreurCommande("invalide", "largeur", "largeur, hauteur à franchir et épaisseur de marche strictement positives");
  if (!(f > 0 && f < largeur)) throw new ErreurCommande("invalide", "ligneFoulee", "ligne de foulée strictement comprise dans la largeur");
  const contours = marchesBalancees(points, largeur, n, f, m);
  const nom = lire.chaineOuNull(p, "nom")?.trim() || `Escalier balancé ${Object.keys(etat.groupes).length + 1}`;
  const gid = ctx.ids.nouveau("groupe");
  let courant: ModeleAtelier = { ...etat, groupes: { ...etat.groupes, [gid]: { id: gid, nom } } };
  let effets = effetsVides();
  effets.crees.push(gid);
  const h = H / n;
  contours.forEach((contour, i) => {
    const r = creerOccurrence(courant, { niveauId, groupeId: gid, params: { contour, trous: [], ferme: true, hauteur: { value: r6(ep), unit: "m" }, decalageBase: { value: r6((i + 1) * h - ep), unit: "m" }, role: "marche-balancee", nom: `${nom} · marche ${i + 1}` } }, ctx, "solide");
    courant = r.etat;
    effets = fusionnerEffets(effets, r.effets);
  });
  return { etat: courant, effets };
}
