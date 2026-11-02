import { studioArcEnds } from "../courbes.js";
import { STUDIO_LIMITS } from "../noyau/limites.js";
import type { StudioPoint } from "../noyau/types.js";
import { array, boolean, fail, finite, identifier, record } from "../noyau/validation.js";
import type { StudioShape } from "../objets/formes.js";
import { validerForme } from "../objets/index.js";
import { id } from "../registre/schemas-base.js";

/**
 * Contraintes géométriques 2D (X.1-01, REF-02 §18.2 « contraintes ») : horizontalité, verticalité, parallélisme,
 * perpendicularité, tangence, coïncidence, égalité de longueur (ou de rayon) et distance fixée, posées sur les formes du
 * document (lignes, segments droits de polyligne, cercles, arcs et leurs points nommés). Extension additive et
 * facultative `StudioDocument.contraintes` : un document antérieur reste valide et relu à l'identique.
 *
 * Résolution (`studioResoudreContraintes`) : **déterministe** — mêmes formes, mêmes contraintes, même résultat au bit
 * près — par Gauss-Newton à pas de norme minimale (la géométrie bouge le moins possible pour satisfaire le système),
 * dérivées exactes (différentiation automatique avant), recherche linéaire par demi-pas. Le système résolu est la
 * composante connexe des contraintes posées ou à résoudre : les contraintes déjà satisfaites qui partagent un objet y
 * entrent, et le restent. Un objet sur un calque verrouillé est une **référence fixe** (il ne bouge pas).
 *
 * Refus, jamais de résolution en silence :
 * - **insatisfaisable** : le système ne converge pas sous la tolérance (contraintes contradictoires, géométrie
 *   impossible : verticale et horizontale à la fois, rayon qui deviendrait négatif…) ;
 * - **sur-contraint** : à la solution, une équation dépend des autres (contrainte redondante ou contradictoire, plus
 *   d'équations que de degrés de liberté) — la contrainte en cause est nommée.
 * Le lot entier est alors refusé (tout ou rien).
 *
 * État « à résoudre » : après chaque lot de commandes, chaque contrainte est réévaluée sur la géométrie ; si une
 * commande l'a rompue (objet déplacé, modifié, supprimé, segment devenu courbe ou disparu), elle passe « à résoudre »
 * (`aResoudre: true`), avec sa géométrie gardée telle quelle : rien n'est recalculé sans une demande explicite
 * (`studio.contrainte.poser` avec `resoudre`). Tolérances déclarées : 10⁻⁹ m (relative à l'étendue, au moins 1 m) pour
 * les longueurs, 10⁻⁹ rad pour les angles. Aucune valeur n'est inventée : une distance est saisie. Pur : ni React, ni DOM.
 */

export const STUDIO_TYPES_CONTRAINTES = Object.freeze(["horizontal", "vertical", "parallele", "perpendiculaire", "tangence", "coincidence", "egalite", "distance"] as const);
export type StudioTypeContrainte = (typeof STUDIO_TYPES_CONTRAINTES)[number];
export const STUDIO_POINTS_CONTRAINTE = Object.freeze(["debut", "fin", "centre"] as const);
export type StudioPointContrainte = (typeof STUDIO_POINTS_CONTRAINTE)[number];
export const STUDIO_MODES_TANGENCE = Object.freeze(["exterieure", "interieure"] as const);
export type StudioModeTangence = (typeof STUDIO_MODES_TANGENCE)[number];

/** Bornes techniques (pas des valeurs métier). */
export const STUDIO_LIMITES_CONTRAINTES = Object.freeze({ contraintes: 5000, iterations: 60, valeurMax: 1e9 } as const);
/** Tolérances déclarées de la satisfaction d'une contrainte. */
export const STUDIO_TOLERANCES_CONTRAINTES = Object.freeze({ longueur: 1e-9, angle: 1e-9 } as const);

/**
 * Cible d'une contrainte : un objet et, selon le cas, un segment (polyligne : `segment` = rang du segment droit ; ligne :
 * aucun), un point nommé (`point` : début, fin, centre) ou un sommet de polyligne (`sommet`), ou la courbe entière
 * (cercle, arc : aucun champ).
 */
export interface StudioCibleContrainte { objet: string; segment?: number; point?: StudioPointContrainte; sommet?: number }

export interface StudioContrainte {
  id: string;
  type: StudioTypeContrainte;
  cibles: StudioCibleContrainte[];
  /** Distance fixée, en mètres (> 0) ; saisie, seulement pour `distance`. */
  valeur?: number;
  /** Tangence de deux courbes : extérieure ou intérieure (choisie à la pose d'après la géométrie si absente). */
  tangence?: StudioModeTangence;
  /** Rompue par une commande depuis sa dernière résolution : géométrie gardée, à résoudre explicitement. */
  aResoudre?: true;
}

/** Nombre de cibles et nature attendue de chacune, par type. */
const ARITE: Readonly<Record<StudioTypeContrainte, readonly number[]>> = Object.freeze({
  horizontal: [1], vertical: [1], parallele: [2], perpendiculaire: [2], tangence: [2], coincidence: [2], egalite: [2], distance: [1, 2],
});

// ——— Validation ———

function entierPositif(v: unknown, path: string): number {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n < 0 || n >= STUDIO_LIMITS.polylinePoints) fail(path, "rang entier positif ou nul attendu");
  return n;
}

function validerCible(value: unknown, path: string): StudioCibleContrainte {
  const o = record(value, ["objet"], path, ["segment", "point", "sommet"]);
  const champs = ["segment", "point", "sommet"].filter((k) => Object.hasOwn(o, k));
  if (champs.length > 1) fail(path, "une cible désigne un segment, un point ou un sommet, pas plusieurs");
  const out: StudioCibleContrainte = { objet: identifier(o.objet, `${path}.objet`) };
  if (Object.hasOwn(o, "segment")) out.segment = entierPositif(o.segment, `${path}.segment`);
  if (Object.hasOwn(o, "sommet")) out.sommet = entierPositif(o.sommet, `${path}.sommet`);
  if (Object.hasOwn(o, "point")) {
    if (!(STUDIO_POINTS_CONTRAINTE as readonly unknown[]).includes(o.point)) fail(`${path}.point`, "point « debut », « fin » ou « centre » attendu");
    out.point = o.point as StudioPointContrainte;
  }
  return out;
}

const estPoint = (c: StudioCibleContrainte) => c.point !== undefined || c.sommet !== undefined;

export function validerContrainte(value: unknown, path: string): StudioContrainte {
  const o = record(value, ["id", "type", "cibles"], path, ["valeur", "tangence", "aResoudre"]);
  if (!(STUDIO_TYPES_CONTRAINTES as readonly unknown[]).includes(o.type)) fail(`${path}.type`, `type de contrainte inconnu (${STUDIO_TYPES_CONTRAINTES.join(", ")})`);
  const type = o.type as StudioTypeContrainte;
  const brut = array(o.cibles, `${path}.cibles`);
  if (!ARITE[type].includes(brut.length)) fail(`${path}.cibles`, `${ARITE[type].join(" ou ")} cible(s) attendue(s) pour « ${type} »`);
  const cibles = brut.map((c, i) => validerCible(c, `${path}.cibles[${i}]`));
  const points = cibles.filter(estPoint).length;
  if (type === "coincidence" && points !== 2) fail(`${path}.cibles`, "la coïncidence porte sur deux points");
  if (type === "distance" && !(cibles.length === 2 ? points === 2 : points === 0)) fail(`${path}.cibles`, "la distance porte sur deux points ou sur un segment");
  if (type !== "coincidence" && type !== "distance" && points) fail(`${path}.cibles`, `« ${type} » porte sur des segments ou des courbes, pas sur des points`);
  if (cibles.length === 2 && cibles[0]!.objet === cibles[1]!.objet && cibles[0]!.segment === cibles[1]!.segment && cibles[0]!.point === cibles[1]!.point && cibles[0]!.sommet === cibles[1]!.sommet) fail(`${path}.cibles`, "les deux cibles sont confondues");
  const out: StudioContrainte = { id: identifier(o.id, `${path}.id`), type, cibles };
  if (Object.hasOwn(o, "valeur")) {
    if (type !== "distance") fail(`${path}.valeur`, "seule une distance fixée porte une valeur");
    const v = finite(o.valeur, `${path}.valeur`);
    if (!(v > 0) || v > STUDIO_LIMITES_CONTRAINTES.valeurMax) fail(`${path}.valeur`, "distance strictement positive attendue (m)");
    out.valeur = v;
  } else if (type === "distance") fail(`${path}.valeur`, "distance à saisir (m) : aucune valeur n’est supposée");
  if (Object.hasOwn(o, "tangence")) {
    if (type !== "tangence") fail(`${path}.tangence`, "mode de tangence sans objet");
    if (!(STUDIO_MODES_TANGENCE as readonly unknown[]).includes(o.tangence)) fail(`${path}.tangence`, "tangence « exterieure » ou « interieure » attendue");
    out.tangence = o.tangence as StudioModeTangence;
  }
  if (Object.hasOwn(o, "aResoudre")) {
    if (!boolean(o.aResoudre, `${path}.aResoudre`)) fail(`${path}.aResoudre`, "absent ou vrai (forme canonique)");
    out.aResoudre = true;
  }
  return out;
}

// ——— Différentiation automatique (avant) ———

type Grad = ReadonlyMap<number, number>;
const VIDE: Grad = new Map();
class D {
  constructor(readonly v: number, readonly g: Grad = VIDE) {}
}
function combiner(a: Grad, ka: number, b: Grad, kb: number): Grad {
  if (!a.size && !b.size) return VIDE;
  const m = new Map<number, number>();
  for (const [k, v] of a) m.set(k, v * ka);
  for (const [k, v] of b) m.set(k, (m.get(k) ?? 0) + v * kb);
  return m;
}
const cst = (v: number) => new D(v);
const add = (a: D, b: D) => new D(a.v + b.v, combiner(a.g, 1, b.g, 1));
const sub = (a: D, b: D) => new D(a.v - b.v, combiner(a.g, 1, b.g, -1));
const mul = (a: D, b: D) => new D(a.v * b.v, combiner(a.g, b.v, b.g, a.v));
const echelle = (a: D, k: number) => new D(a.v * k, combiner(a.g, k, VIDE, 0));
function racine(a: D, quoi: string): D {
  if (!(a.v > 0)) fail("contrainte", `géométrie dégénérée (${quoi} nulle)`);
  const r = Math.sqrt(a.v);
  return new D(r, combiner(a.g, 1 / (2 * r), VIDE, 0));
}
function div(a: D, b: D): D {
  return new D(a.v / b.v, combiner(a.g, 1 / b.v, b.g, -a.v / (b.v * b.v)));
}
function atan2(y: D, x: D): D {
  const n = x.v * x.v + y.v * y.v;
  if (!(n > 0)) fail("contrainte", "géométrie dégénérée (angle indéterminé)");
  return new D(Math.atan2(y.v, x.v), combiner(y.g, x.v / n, x.g, -y.v / n));
}
interface P2 { x: D; y: D }
const moins = (p: P2, q: P2): P2 => ({ x: sub(p.x, q.x), y: sub(p.y, q.y) });
const vectoriel = (a: P2, b: P2) => sub(mul(a.x, b.y), mul(a.y, b.x));
const scalaire = (a: P2, b: P2) => add(mul(a.x, b.x), mul(a.y, b.y));
const norme = (a: P2, quoi: string) => racine(scalaire(a, a), quoi);

// ——— Paramètres des formes ———

/** Paramètres libres d'une forme contrainte (coordonnées, rayon) ; un rectangle n'en a pas (refusé). */
function parametres(o: StudioShape): number[] | null {
  switch (o.type) {
    case "line": return [o.start.x, o.start.y, o.end.x, o.end.y];
    case "polyline": return o.points.flatMap((p) => [p.x, p.y]);
    case "circle": case "arc": return [o.center.x, o.center.y, o.radius];
    default: return null;
  }
}

/** Forme reconstruite à partir de ses paramètres (même identité, même calque, renflements et angles gardés). */
function reconstruire(o: StudioShape, x: readonly number[]): StudioShape {
  const pur = (v: number) => (Object.is(v, -0) ? 0 : v);
  switch (o.type) {
    case "line": return { ...o, start: { x: pur(x[0]!), y: pur(x[1]!) }, end: { x: pur(x[2]!), y: pur(x[3]!) } };
    case "polyline": return { ...o, points: o.points.map((_, i) => ({ x: pur(x[2 * i]!), y: pur(x[2 * i + 1]!) })) };
    case "circle": case "arc": return { ...o, center: { x: pur(x[0]!), y: pur(x[1]!) }, radius: x[2]! };
    default: return o;
  }
}

const NOMS_TYPES: Record<StudioShape["type"], string> = { line: "ligne", rectangle: "rectangle", circle: "cercle", arc: "arc", polyline: "polyligne" };

/** Accès différentiable aux formes d'un système : variables (objets libres) ou constantes (références fixes). */
class Modele {
  readonly x: number[] = [];
  readonly debut = new Map<string, number>();
  readonly formes: ReadonlyMap<string, StudioShape>;
  readonly fixes: ReadonlySet<string>;
  /** Étendue des coordonnées (tolérance relative des longueurs). */
  etendue = 1;
  constructor(formes: ReadonlyMap<string, StudioShape>, ids: Iterable<string>, fixes: ReadonlySet<string>) {
    this.formes = formes;
    this.fixes = fixes;
    for (const id of ids) {
      const o = formes.get(id);
      const p = o ? parametres(o) : null;
      if (!o || !p) continue;
      for (const v of p) this.etendue = Math.max(this.etendue, Math.abs(v));
      if (fixes.has(id)) continue;
      this.debut.set(id, this.x.length);
      this.x.push(...p);
    }
  }
  /** Valeur différentiable du paramètre `k` de l'objet `id`, au point `x`. */
  val(x: readonly number[], id: string, k: number): D {
    const d = this.debut.get(id);
    if (d === undefined) return cst(parametres(this.formes.get(id)!)![k]!);
    return new D(x[d + k]!, new Map([[d + k, 1]]));
  }
}

type Genre = "segment" | "point" | "courbe";

/** Nature et compatibilité d'une cible dans les formes ; message de refus sinon. */
function examinerCible(c: StudioCibleContrainte, formes: ReadonlyMap<string, StudioShape>): { genre: Genre } | { refus: string } {
  const o = formes.get(c.objet);
  if (!o) return { refus: `objet introuvable : ${c.objet}` };
  if (o.type === "rectangle") return { refus: `rectangle ${o.id} : non contraignable (ses côtés sont déjà liés aux axes ; convertissez-le en polyligne)` };
  if (c.sommet !== undefined) {
    if (o.type !== "polyline") return { refus: `${NOMS_TYPES[o.type]} ${o.id} : un sommet ne désigne qu’une polyligne` };
    return c.sommet < o.points.length ? { genre: "point" } : { refus: `polyligne ${o.id} : sommet ${c.sommet} absent` };
  }
  if (c.point !== undefined) {
    if (o.type === "polyline") return { refus: `polyligne ${o.id} : désignez un sommet` };
    if (o.type === "line" && c.point === "centre") return { refus: `ligne ${o.id} : pas de centre` };
    if (o.type === "circle" && c.point !== "centre") return { refus: `cercle ${o.id} : seul son centre est un point` };
    return { genre: "point" };
  }
  if (o.type === "line") return c.segment === undefined ? { genre: "segment" } : { refus: `ligne ${o.id} : pas de rang de segment` };
  if (o.type === "polyline") {
    if (c.segment === undefined) return { refus: `polyligne ${o.id} : rang du segment attendu` };
    const n = o.closed ? o.points.length : o.points.length - 1;
    if (c.segment >= n) return { refus: `polyligne ${o.id} : segment ${c.segment} absent` };
    if ((o.bulges?.[c.segment] ?? 0) !== 0) return { refus: `polyligne ${o.id} : segment ${c.segment} courbe` };
    return { genre: "segment" };
  }
  return c.segment === undefined ? { genre: "courbe" } : { refus: `${NOMS_TYPES[o.type]} ${o.id} : pas de segment` };
}

/** Compatibilité d'une contrainte avec les formes ; `null` si elle est posable, sinon la raison. */
export function studioRefusContrainte(c: StudioContrainte, formes: ReadonlyMap<string, StudioShape>): string | null {
  const genres: Genre[] = [];
  for (const cible of c.cibles) {
    const e = examinerCible(cible, formes);
    if ("refus" in e) return e.refus;
    genres.push(e.genre);
  }
  const [a, b] = genres;
  switch (c.type) {
    case "horizontal": case "vertical": return a === "segment" ? null : "un segment droit est attendu";
    case "parallele": case "perpendiculaire": return a === "segment" && b === "segment" ? null : "deux segments droits sont attendus";
    case "egalite": return a === b && a !== "point" ? null : "deux segments (longueurs) ou deux courbes (rayons) sont attendus";
    case "distance": return genres.length === 1 ? (a === "segment" ? null : "un segment droit est attendu") : null;
    case "coincidence": return null;
    case "tangence":
      if (a === "courbe" && b === "courbe") return null;
      if ((a === "segment" && b === "courbe") || (a === "courbe" && b === "segment")) return c.tangence ? "le mode de tangence ne vaut que pour deux courbes" : null;
      return "un segment et une courbe, ou deux courbes, sont attendus";
  }
}

function segment(m: Modele, x: readonly number[], c: StudioCibleContrainte): [P2, P2] {
  const o = m.formes.get(c.objet)!;
  const P = (k: number): P2 => ({ x: m.val(x, o.id, 2 * k), y: m.val(x, o.id, 2 * k + 1) });
  if (o.type === "line") return [P(0), P(1)];
  if (o.type !== "polyline") throw new Error("segment attendu");
  return [P(c.segment!), P((c.segment! + 1) % o.points.length)];
}
function pointDe(m: Modele, x: readonly number[], c: StudioCibleContrainte): P2 {
  const o = m.formes.get(c.objet)!;
  if (o.type === "polyline") return { x: m.val(x, o.id, 2 * c.sommet!), y: m.val(x, o.id, 2 * c.sommet! + 1) };
  if (o.type === "line") { const k = c.point === "fin" ? 1 : 0; return { x: m.val(x, o.id, 2 * k), y: m.val(x, o.id, 2 * k + 1) }; }
  const cx = m.val(x, o.id, 0), cy = m.val(x, o.id, 1);
  if (c.point === "centre" || o.type !== "arc") return { x: cx, y: cy };
  const a = c.point === "fin" ? o.endAngle : o.startAngle, r = m.val(x, o.id, 2);
  return { x: add(cx, echelle(r, Math.cos(a))), y: add(cy, echelle(r, Math.sin(a))) };
}
function courbe(m: Modele, x: readonly number[], c: StudioCibleContrainte): { c: P2; r: D } {
  return { c: { x: m.val(x, c.objet, 0), y: m.val(x, c.objet, 1) }, r: m.val(x, c.objet, 2) };
}
const genreDe = (m: Modele, c: StudioCibleContrainte): Genre => {
  const e = examinerCible(c, m.formes);
  return "genre" in e ? e.genre : "segment";
};

type Unite = "longueur" | "angle";
interface Equation { contrainte: string; unite: Unite; f: D }

/** Signes figés au début d'une résolution (tangence orientée), pour que le résidu reste dérivable. */
type Signes = Map<string, number>;

/** Équations d'une contrainte au point `x` ; `signes` absent : forme non orientée (contrôle de satisfaction). */
function equations(m: Modele, x: readonly number[], c: StudioContrainte, signes?: Signes): Equation[] {
  const eq = (f: D, unite: Unite = "longueur"): Equation => ({ contrainte: c.id, unite, f });
  const [c0, c1] = c.cibles;
  switch (c.type) {
    case "horizontal": { const [p, q] = segment(m, x, c0!); return [eq(sub(q.y, p.y))]; }
    case "vertical": { const [p, q] = segment(m, x, c0!); return [eq(sub(q.x, p.x))]; }
    case "parallele": case "perpendiculaire": {
      const [p, q] = segment(m, x, c0!), [r, s] = segment(m, x, c1!);
      const d1 = moins(q, p), d2 = moins(s, r);
      norme(d1, "longueur de segment"); norme(d2, "longueur de segment");
      const theta = atan2(vectoriel(d1, d2), scalaire(d1, d2));
      const cible = c.type === "parallele" ? 0 : Math.PI / 2;
      // Angle ramené à la cible la plus proche modulo π : dérivée 1, jamais nulle (aucun extremum du résidu).
      const k = Math.round((theta.v - cible) / Math.PI);
      return [eq(sub(theta, cst(cible + k * Math.PI)), "angle")];
    }
    case "egalite": {
      if (genreDe(m, c0!) === "courbe") return [eq(sub(courbe(m, x, c0!).r, courbe(m, x, c1!).r))];
      const [p, q] = segment(m, x, c0!), [r, s] = segment(m, x, c1!);
      return [eq(sub(norme(moins(q, p), "longueur de segment"), norme(moins(s, r), "longueur de segment")))];
    }
    case "distance": {
      if (c.cibles.length === 1) { const [p, q] = segment(m, x, c0!); return [eq(sub(norme(moins(q, p), "longueur de segment"), cst(c.valeur!)))]; }
      return [eq(sub(norme(moins(pointDe(m, x, c1!), pointDe(m, x, c0!)), "distance entre points"), cst(c.valeur!)))];
    }
    case "coincidence": {
      const p = pointDe(m, x, c0!), q = pointDe(m, x, c1!);
      return [eq(sub(q.x, p.x)), eq(sub(q.y, p.y))];
    }
    case "tangence": {
      const g0 = genreDe(m, c0!), g1 = genreDe(m, c1!);
      if (g0 === "courbe" && g1 === "courbe") {
        const a = courbe(m, x, c0!), b = courbe(m, x, c1!);
        const d = norme(moins(b.c, a.c), "distance des centres");
        if (c.tangence !== "interieure") return [eq(sub(d, add(a.r, b.r)))];
        const ecart = sub(a.r, b.r);
        const s = signes?.get(c.id) ?? (ecart.v < 0 ? -1 : 1);
        return [eq(sub(d, echelle(ecart, s)))];
      }
      const [sc, cc] = g0 === "segment" ? [c0!, c1!] : [c1!, c0!];
      const [p, q] = segment(m, x, sc), k = courbe(m, x, cc);
      const dir = moins(q, p);
      const vect = vectoriel(dir, moins(k.c, p));
      const s = signes?.get(c.id) ?? (vect.v < 0 ? -1 : 1);
      // Distance signée du centre à la droite porteuse, égale au rayon.
      return [eq(sub(echelle(div(vect, norme(dir, "longueur de segment")), s), k.r))];
    }
  }
}

function signesInitiaux(m: Modele, x: readonly number[], cs: readonly StudioContrainte[]): Signes {
  const out: Signes = new Map();
  for (const c of cs) {
    if (c.type !== "tangence") continue;
    const g0 = genreDe(m, c.cibles[0]!), g1 = genreDe(m, c.cibles[1]!);
    if (g0 === "courbe" && g1 === "courbe") {
      out.set(c.id, courbe(m, x, c.cibles[0]!).r.v - courbe(m, x, c.cibles[1]!).r.v < 0 ? -1 : 1);
    } else {
      const [sc, cc] = g0 === "segment" ? [c.cibles[0]!, c.cibles[1]!] : [c.cibles[1]!, c.cibles[0]!];
      const [p, q] = segment(m, x, sc), k = courbe(m, x, cc);
      out.set(c.id, vectoriel(moins(q, p), moins(k.c, p)).v < 0 ? -1 : 1);
    }
  }
  return out;
}

const tolerance = (m: Modele, u: Unite) => (u === "angle" ? STUDIO_TOLERANCES_CONTRAINTES.angle : STUDIO_TOLERANCES_CONTRAINTES.longueur * m.etendue);

// ——— Satisfaction ———

export type StudioStatutContrainte = "satisfaite" | "a-resoudre" | "non-satisfaite" | "cible-incompatible";
export interface StudioEvaluationContrainte {
  id: string;
  statut: StudioStatutContrainte;
  /** Plus grand écart des équations (m ou rad) ; null si la contrainte n'est pas évaluable. */
  ecart: number | null;
  /** Raison d'une cible incompatible ou absente. */
  raison?: string;
}

/**
 * Évaluation d'une contrainte sur des formes : « à résoudre » si elle est marquée ainsi ; « cible incompatible » si une
 * cible manque ou ne convient plus ; sinon « satisfaite » ou « non satisfaite » selon la tolérance déclarée.
 */
export function studioEvaluerContrainte(c: StudioContrainte, formes: ReadonlyMap<string, StudioShape>): StudioEvaluationContrainte {
  const refus = studioRefusContrainte(c, formes);
  if (refus) return { id: c.id, statut: c.aResoudre ? "a-resoudre" : "cible-incompatible", ecart: null, raison: refus };
  const m = new Modele(formes, c.cibles.map((x) => x.objet), new Set());
  let ecart = 0, hors = false;
  try {
    // Tangence : forme non orientée (|distance| ou |r1 − r2|) — satisfaite d'un côté comme de l'autre.
    const signes = signesInitiaux(m, m.x, [c]);
    for (const e of equations(m, m.x, c, signes)) {
      ecart = Math.max(ecart, Math.abs(e.f.v));
      if (Math.abs(e.f.v) > tolerance(m, e.unite)) hors = true;
    }
  } catch {
    return { id: c.id, statut: c.aResoudre ? "a-resoudre" : "cible-incompatible", ecart: null, raison: "géométrie dégénérée" };
  }
  if (c.aResoudre) return { id: c.id, statut: "a-resoudre", ecart };
  return { id: c.id, statut: hors ? "non-satisfaite" : "satisfaite", ecart };
}

/** Mode de tangence de deux courbes d'après la géométrie actuelle (le plus proche) ; segment et courbe : aucun. */
export function studioModeTangence(c: StudioContrainte, formes: ReadonlyMap<string, StudioShape>): StudioModeTangence | undefined {
  if (c.type !== "tangence" || studioRefusContrainte(c, formes)) return undefined;
  const a = formes.get(c.cibles[0]!.objet)!, b = formes.get(c.cibles[1]!.objet)!;
  if ((a.type !== "circle" && a.type !== "arc") || (b.type !== "circle" && b.type !== "arc")) return undefined;
  const d = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y);
  return Math.abs(d - (a.radius + b.radius)) <= Math.abs(d - Math.abs(a.radius - b.radius)) ? "exterieure" : "interieure";
}

// ——— Résolution ———

/** Résout `A y = b` (A carrée, pivot partiel) ; `null` si singulière. */
function resoudreLineaire(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((l, i) => [...l, b[i]!]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i]![k]!) > Math.abs(M[p]![k]!)) p = i;
    if (!(Math.abs(M[p]![k]!) > 0)) return null;
    [M[k], M[p]] = [M[p]!, M[k]!];
    for (let i = k + 1; i < n; i++) {
      const f = M[i]![k]! / M[k]![k]!;
      if (f === 0) continue;
      for (let j = k; j <= n; j++) M[i]![j]! -= f * M[k]![j]!;
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let j = i + 1; j < n; j++) s -= M[i]![j]! * y[j]!;
    y[i] = s / M[i]![i]!;
  }
  return y;
}

/** Ligne dense de la jacobienne d'une équation. */
function ligne(e: Equation, n: number): number[] {
  const l = new Array<number>(n).fill(0);
  for (const [k, v] of e.f.g) l[k] = v;
  return l;
}

/**
 * Première équation (dans l'ordre du système) qui dépend des précédentes à la solution : orthogonalisation de
 * Gram-Schmidt des lignes normées de la jacobienne. Une ligne nulle (aucun degré de liberté) est dépendante.
 */
function premiereDependante(eqs: readonly Equation[], n: number): Equation | null {
  const base: number[][] = [];
  for (const e of eqs) {
    const l = ligne(e, n);
    const nl = Math.hypot(...l);
    if (!(nl > 0)) return e;
    let v = l.map((x) => x / nl);
    for (const b of base) {
      const p = v.reduce((s, x, i) => s + x * b[i]!, 0);
      v = v.map((x, i) => x - p * b[i]!);
    }
    const nv = Math.hypot(...v);
    if (nv < 1e-7) return e;
    base.push(v.map((x) => x / nv));
  }
  return null;
}

export interface StudioResultatContraintes {
  /** Formes changées par la résolution (identité et calque gardés), dans l'ordre du système. */
  formes: StudioShape[];
  iterations: number;
}

/**
 * Résout le système `systeme` sur `formes` (les objets de `fixes` ne bougent pas) ; lève `StudioValidationError`
 * (insatisfaisable, sur-contraint, cible incompatible, géométrie dégénérée), jamais un résultat approché.
 */
export function studioResoudreContraintes(formes: ReadonlyMap<string, StudioShape>, systeme: readonly StudioContrainte[], fixes: ReadonlySet<string>, path: string): StudioResultatContraintes {
  for (const c of systeme) {
    const refus = studioRefusContrainte(c, formes);
    if (refus) fail(path, `contrainte ${c.id} : ${refus}`);
  }
  const ids = [...new Set(systeme.flatMap((c) => c.cibles.map((x) => x.objet)))];
  const m = new Modele(formes, ids, fixes);
  const n = m.x.length;
  let x = [...m.x];
  const signes = signesInitiaux(m, x, systeme);
  const evaluer = (y: readonly number[]) => systeme.flatMap((c) => equations(m, y, c, signes));
  const norme2 = (eqs: readonly Equation[]) => eqs.reduce((s, e) => s + (e.f.v / tolerance(m, e.unite)) ** 2, 0);
  let eqs = evaluer(x), iterations = 0;
  const satisfait = (es: readonly Equation[]) => es.every((e) => Math.abs(e.f.v) <= tolerance(m, e.unite));
  while (!satisfait(eqs)) {
    if (iterations++ >= STUDIO_LIMITES_CONTRAINTES.iterations || n === 0) {
      const pire = eqs.reduce((a, e) => (Math.abs(e.f.v) / tolerance(m, e.unite) > Math.abs(a.f.v) / tolerance(m, a.unite) ? e : a));
      fail(path, `système de contraintes insatisfaisable : ${pire.contrainte} reste à ${Math.abs(pire.f.v).toExponential(2)} ${pire.unite === "angle" ? "rad" : "m"} (contraintes contradictoires ou géométrie impossible)`);
    }
    // Pas de norme minimale : dx = Jᵀ (J Jᵀ + μ I)⁻¹ (−F), μ infime (système redondant encore inversible).
    const J = eqs.map((e) => ligne(e, n));
    const mm = eqs.length;
    const A = J.map((li) => J.map((lj) => li.reduce((s, v, k) => s + v * lj[k]!, 0)));
    const diag = Math.max(1, ...A.map((l, i) => l[i]!));
    for (let i = 0; i < mm; i++) A[i]![i]! += 1e-12 * diag;
    const y = resoudreLineaire(A, eqs.map((e) => -e.f.v));
    if (!y) fail(path, "système de contraintes insatisfaisable (aucun degré de liberté pour y satisfaire)");
    const dx = new Array<number>(n).fill(0);
    for (let i = 0; i < mm; i++) for (let k = 0; k < n; k++) dx[k]! += J[i]![k]! * y[i]!;
    // Recherche linéaire par demi-pas : le résidu pondéré doit décroître.
    const avant = norme2(eqs);
    let alpha = 1, essai = x, eqsEssai = eqs;
    for (let k = 0; k < 30; k++) {
      essai = x.map((v, i) => v + alpha * dx[i]!);
      try { eqsEssai = evaluer(essai); } catch { eqsEssai = []; }
      if (eqsEssai.length && norme2(eqsEssai) < avant) break;
      alpha /= 2;
    }
    if (!eqsEssai.length || !(norme2(eqsEssai) < avant)) {
      const pire = eqs.reduce((a, e) => (Math.abs(e.f.v) / tolerance(m, e.unite) > Math.abs(a.f.v) / tolerance(m, a.unite) ? e : a));
      fail(path, `système de contraintes insatisfaisable : ${pire.contrainte} ne peut plus être approchée (contraintes contradictoires ou géométrie impossible)`);
    }
    x = essai;
    eqs = eqsEssai;
  }
  // À la solution : une équation qui dépend des autres est une sur-contrainte (redondante ou contradictoire).
  const dependante = n === 0 && eqs.length ? eqs[0]! : premiereDependante(eqs, n);
  if (dependante) {
    const autres = [...new Set(eqs.filter((e) => e.contrainte !== dependante.contrainte).map((e) => e.contrainte))];
    fail(path, `sur-contrainte : ${dependante.contrainte} est redondante ou contradictoire${autres.length ? ` avec ${autres.join(", ")}` : ""} (aucun degré de liberté propre)`);
  }
  const changees: StudioShape[] = [];
  for (const id of ids) {
    const d = m.debut.get(id);
    if (d === undefined) continue;
    const o = formes.get(id)!;
    const k = parametres(o)!.length;
    const nouvelle = reconstruire(o, x.slice(d, d + k));
    if (JSON.stringify(nouvelle) === JSON.stringify(o)) continue;
    changees.push(validerForme(nouvelle, `${path} (objet ${id})`));
  }
  // Une solution qui écrase un segment ou un rayon (sous 10⁻⁶ de l'étendue) n'en est pas une : refus, jamais un point.
  const seuil = 1e-6 * m.etendue;
  for (const o of changees) {
    if ((o.type === "circle" || o.type === "arc") && !(o.radius > seuil)) fail(path, `système de contraintes insatisfaisable : le rayon de ${o.id} s’annulerait (géométrie dégénérée)`);
    const pts = o.type === "line" ? [o.start, o.end] : o.type === "polyline" ? o.points : [];
    const n = o.type === "polyline" && o.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      if (!(Math.hypot(b.x - a.x, b.y - a.y) > seuil)) fail(path, `système de contraintes insatisfaisable : un segment de ${o.id} s’annulerait (géométrie dégénérée)`);
    }
  }
  return { formes: changees, iterations };
}

// ——— Lecture ———

/** Point d'ancrage affiché d'une contrainte (milieu du premier segment, point, centre de la courbe) ; null si absent. */
export function studioPointContrainte(c: StudioContrainte, formes: ReadonlyMap<string, StudioShape>): StudioPoint | null {
  const cible = c.cibles[0]!;
  const o = formes.get(cible.objet);
  if (!o || o.type === "rectangle") return null;
  if (o.type === "line") return cible.point === "fin" ? { ...o.end } : cible.point === "debut" ? { ...o.start } : { x: (o.start.x + o.end.x) / 2, y: (o.start.y + o.end.y) / 2 };
  if (o.type === "polyline") {
    if (cible.sommet !== undefined) return o.points[cible.sommet] ? { ...o.points[cible.sommet]! } : null;
    const a = o.points[cible.segment ?? 0], b = o.points[((cible.segment ?? 0) + 1) % o.points.length];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  }
  if (o.type === "arc" && (cible.point === "debut" || cible.point === "fin")) { const e = studioArcEnds(o); return cible.point === "debut" ? e.start : e.end; }
  return { ...o.center };
}

// ——— Schéma ———

const cible = { type: "object", additionalProperties: false, required: ["objet"], properties: { objet: id, segment: { type: "integer", minimum: 0 }, sommet: { type: "integer", minimum: 0 }, point: { enum: [...STUDIO_POINTS_CONTRAINTE] } } } as const;
export const SCHEMA_CONTRAINTE = {
  type: "object", additionalProperties: false, required: ["id", "type", "cibles"],
  properties: {
    id, type: { enum: [...STUDIO_TYPES_CONTRAINTES] }, cibles: { type: "array", minItems: 1, maxItems: 2, items: cible },
    valeur: { type: "number", exclusiveMinimum: 0, maximum: STUDIO_LIMITES_CONTRAINTES.valeurMax }, tangence: { enum: [...STUDIO_MODES_TANGENCE] }, aResoudre: { const: true },
  },
} as const;
