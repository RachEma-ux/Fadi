/**
 * Géométrie libre IMMUABLE de la Planche (comportement type SketchUp, relevé dans
 * docs/planche/reference/ : outils-dessin.md, outils-modification.md, complements-modification.md,
 * doc-officielle.md §7–8).
 *
 * Unités : mètres, repère local de la Planche (x rouge, y vert, z bleu).
 *
 * INVARIANTS (vérifiés par les tests, garantis par toutes les opérations publiques) :
 *  I1. Immuabilité : aucune opération ne modifie le modèle reçu ; elle renvoie un nouveau `Modele` et un
 *      `Rapport` { crees, supprimes, modifies } calculé par différence d'identifiants.
 *  I2. Identifiants globalement uniques dans un modèle (préfixes : s sommet, a arête, f face, c courbe,
 *      d définition, o occurrence), jamais réutilisés (compteur `prochainId`).
 *  I3. Deux sommets d'un même contexte sont toujours distants de plus de TOL ; aucun sommet n'est isolé
 *      (tout sommet appartient à au moins une arête).
 *  I4. Une arête relie deux sommets distincts ; au plus une arête par paire de sommets ; deux arêtes d'un
 *      même contexte ne se croisent jamais en leur intérieur (l'ajout découpe au point d'intersection) et
 *      ne se superposent jamais (les portions colinéaires communes sont fusionnées).
 *  I5. Une face est plane ; sa boucle extérieure tourne dans le sens direct autour de `normale` (unitaire),
 *      ses trous dans le sens indirect ; chaque côté de boucle est une arête existante.
 *  I6. Géométrie collante : dans un contexte, les faces coplanaires sont les régions minimales de
 *      l'arrangement plan de leurs arêtes (une ligne en travers d'une face la coupe en deux, une boucle
 *      intérieure crée un trou et une face intérieure, deux boîtes accolées partagent la face de contact).
 *  I7. Isolation : un groupe ou un composant (définition + occurrences avec matrice 4×4) ne colle jamais à
 *      la géométrie d'un autre contexte. Les occurrences d'un composant partagent sa définition ; éditer un
 *      groupe partagé par plusieurs occurrences le rend d'abord unique (doc-officielle §8).
 *  I8. Une courbe (cercle, polygone, arc) regroupe des arêtes que la gomme efface d'un seul coup.
 *
 * Choix propres à la Planche (écarts assumés, signalés) :
 *  - une face créée automatiquement prend la normale canonique de son plan (+Z d'abord, puis +Y, puis +X) ;
 *    SketchUp oriente les faces posées au sol vers le bas, ce qui n'est pas reproduit ;
 *  - `deplacer` étire la géométrie connectée et plie (autofold) une face devenue non plane sans trou, mais
 *    ne recalcule pas l'intersection avec la géométrie traversée (seuls les sommets confondus fusionnent) ;
 *  - `decaler` ne traite que la boucle extérieure (pas d'élagage des recouvrements, Alt non modélisé).
 */
import {
  type Vec3,
  AXE_X,
  AXE_Z,
  EPS,
  TOL,
  add,
  colineaires,
  cross,
  dist,
  dot,
  egal,
  len,
  lerp,
  normalize,
  scale,
  sub,
  v3,
} from "./vecteur.js";

// ————————————————————————————————————————————————————————————— Types publics

export type Id = string;

export interface Sommet {
  readonly id: Id;
  readonly position: Vec3;
}

export interface Arete {
  readonly id: Id;
  readonly a: Id;
  readonly b: Id;
  readonly adoucie?: boolean;
  readonly masquee?: boolean;
  /** Courbe d'appartenance (cercle, polygone, arc) : la gomme efface la courbe entière. */
  readonly courbe?: Id;
}

export interface Face {
  readonly id: Id;
  readonly exterieur: readonly Id[];
  readonly trous: readonly (readonly Id[])[];
  readonly normale: Vec3;
  readonly materiauRecto?: string;
  readonly materiauVerso?: string;
}

export type GenreCourbe = "cercle" | "polygone" | "arc";

export interface Courbe {
  readonly id: Id;
  readonly genre: GenreCourbe;
  readonly aretes: readonly Id[];
  readonly centre: Vec3;
  readonly rayon: number;
  readonly normale: Vec3;
}

/** Matrice 4×4 en lignes (m[4*ligne + colonne]), transformation affine. */
export type Matrice4 = readonly number[];

export interface Occurrence {
  readonly id: Id;
  readonly definition: Id;
  readonly transformation: Matrice4;
}

export interface Contexte {
  readonly sommets: Readonly<Record<Id, Sommet>>;
  readonly aretes: Readonly<Record<Id, Arete>>;
  readonly faces: Readonly<Record<Id, Face>>;
  readonly courbes: Readonly<Record<Id, Courbe>>;
  readonly occurrences: Readonly<Record<Id, Occurrence>>;
}

export type GenreDefinition = "groupe" | "composant";

export interface Definition {
  readonly id: Id;
  readonly nom: string;
  readonly genre: GenreDefinition;
  readonly contenu: Contexte;
}

export interface Modele {
  readonly racine: Contexte;
  readonly definitions: Readonly<Record<Id, Definition>>;
  readonly prochainId: number;
}

export interface Rapport {
  readonly crees: readonly Id[];
  readonly supprimes: readonly Id[];
  readonly modifies: readonly Id[];
}

export interface Resultat {
  readonly modele: Modele;
  readonly rapport: Rapport;
}

export interface OptionsContexte {
  /** Occurrence (groupe/composant) dans laquelle on édite ; absent = racine du modèle. */
  readonly dans?: Id;
}

export interface Plan {
  /** Normale unitaire canonique. */
  readonly n: Vec3;
  /** Distance signée : dot(n, p) = d pour tout p du plan. */
  readonly d: number;
}

// ————————————————————————————————————————————————————————————— Matrices

export const IDENTITE: Matrice4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function appliquer(m: Matrice4, p: Vec3): Vec3 {
  const g = (i: number): number => m[i] ?? 0;
  return v3(
    g(0) * p.x + g(1) * p.y + g(2) * p.z + g(3),
    g(4) * p.x + g(5) * p.y + g(6) * p.z + g(7),
    g(8) * p.x + g(9) * p.y + g(10) * p.z + g(11),
  );
}

/** Produit a·b (b appliquée d'abord). */
export function composer(a: Matrice4, b: Matrice4): Matrice4 {
  const r: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[4 * i + k] ?? 0) * (b[4 * k + j] ?? 0);
      r.push(s);
    }
  }
  return r;
}

export const translation = (v: Vec3): Matrice4 => [1, 0, 0, v.x, 0, 1, 0, v.y, 0, 0, 1, v.z, 0, 0, 0, 1];

export function rotation(centre: Vec3, axe: Vec3, angle: number): Matrice4 {
  const k = normalize(axe);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const r: Matrice4 = [
    t * k.x * k.x + c, t * k.x * k.y - s * k.z, t * k.x * k.z + s * k.y, 0,
    t * k.x * k.y + s * k.z, t * k.y * k.y + c, t * k.y * k.z - s * k.x, 0,
    t * k.x * k.z - s * k.y, t * k.y * k.z + s * k.x, t * k.z * k.z + c, 0,
    0, 0, 0, 1,
  ];
  return composer(translation(centre), composer(r, translation(scale(centre, -1))));
}

export function echelle(origine: Vec3, f: Vec3): Matrice4 {
  const e: Matrice4 = [f.x, 0, 0, 0, 0, f.y, 0, 0, 0, 0, f.z, 0, 0, 0, 0, 1];
  return composer(translation(origine), composer(e, translation(scale(origine, -1))));
}

export function miroir(origine: Vec3, normale: Vec3): Matrice4 {
  const n = normalize(normale);
  const h: Matrice4 = [
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
    -2 * n.x * n.y, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
    -2 * n.x * n.z, -2 * n.y * n.z, 1 - 2 * n.z * n.z, 0,
    0, 0, 0, 1,
  ];
  return composer(translation(origine), composer(h, translation(scale(origine, -1))));
}

export function determinant3(m: Matrice4): number {
  const g = (i: number): number => m[i] ?? 0;
  return (
    g(0) * (g(5) * g(10) - g(6) * g(9)) - g(1) * (g(4) * g(10) - g(6) * g(8)) + g(2) * (g(4) * g(9) - g(5) * g(8))
  );
}

/** Normale transformée (inverse transposée de la partie linéaire), unitaire. */
export function transformerNormale(m: Matrice4, n: Vec3): Vec3 {
  const g = (i: number): number => m[i] ?? 0;
  // Cofacteurs = det · (M⁻¹)ᵀ
  const c00 = g(5) * g(10) - g(6) * g(9);
  const c01 = -(g(4) * g(10) - g(6) * g(8));
  const c02 = g(4) * g(9) - g(5) * g(8);
  const c10 = -(g(1) * g(10) - g(2) * g(9));
  const c11 = g(0) * g(10) - g(2) * g(8);
  const c12 = -(g(0) * g(9) - g(1) * g(8));
  const c20 = g(1) * g(6) - g(2) * g(5);
  const c21 = -(g(0) * g(6) - g(2) * g(4));
  const c22 = g(0) * g(5) - g(1) * g(4);
  const r = v3(c00 * n.x + c01 * n.y + c02 * n.z, c10 * n.x + c11 * n.y + c12 * n.z, c20 * n.x + c21 * n.y + c22 * n.z);
  const det = determinant3(m);
  return normalize(det < 0 ? scale(r, -1) : r);
}

// ————————————————————————————————————————————————————————————— Outils géométriques exportés

/** Normale de Newell (norme = 2 × aire, sens direct autour de la normale). */
export function newell(pts: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Vec3;
    const b = pts[(i + 1) % pts.length] as Vec3;
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return v3(x, y, z);
}

export function planCanonique(n: Vec3, p: Vec3): Plan {
  let u = normalize(n);
  const s = 1e-9;
  if (u.z < -s || (Math.abs(u.z) <= s && (u.y < -s || (Math.abs(u.y) <= s && u.x < 0)))) u = scale(u, -1);
  return { n: u, d: dot(u, p) };
}

export const surPlan = (pl: Plan, p: Vec3, tol = TOL): boolean => Math.abs(dot(pl.n, p) - pl.d) <= tol;

export function memePlan(a: Plan, b: Plan): boolean {
  const c = dot(a.n, b.n);
  if (Math.abs(c) < 1 - 1e-9) return false;
  return Math.abs(a.d - Math.sign(c) * b.d) <= TOL;
}

/** Base orthonormée (u, w) du plan de normale n, telle que (u, w, n) soit directe. */
export function baseDuPlan(n: Vec3): { u: Vec3; w: Vec3 } {
  const ref = Math.abs(n.z) < 0.9 ? AXE_Z : AXE_X;
  const u = normalize(cross(ref, n));
  return { u, w: cross(n, u) };
}

interface P2 {
  readonly x: number;
  readonly y: number;
}

function aireSignee2(p: readonly P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as P2;
    const b = p[(i + 1) % p.length] as P2;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function dansPolygone2(pt: P2, poly: readonly P2[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as P2;
    const b = poly[j] as P2;
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

function dansRegion2(pt: P2, ext: readonly P2[], trous: readonly (readonly P2[])[]): boolean {
  return dansPolygone2(pt, ext) && !trous.some((t) => dansPolygone2(pt, t));
}

/** Point strictement intérieur d'une région (polygone à trous), par balayage horizontal. */
function echantillon2(ext: readonly P2[], trous: readonly (readonly P2[])[]): P2 {
  const tous = [ext, ...trous];
  const ys = [...new Set(tous.flat().map((p) => p.y))].sort((a, b) => a - b);
  const y = ys.length > 1 ? ((ys[0] as number) + (ys[1] as number)) / 2 : (ys[0] ?? 0);
  const xs: number[] = [];
  for (const b of tous) {
    for (let i = 0; i < b.length; i++) {
      const p = b[i] as P2;
      const q = b[(i + 1) % b.length] as P2;
      if (p.y > y !== q.y > y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
  }
  xs.sort((a, b) => a - b);
  let meilleur = { x: ext[0]?.x ?? 0, y };
  let largeur = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const l = (xs[i + 1] as number) - (xs[i] as number);
    if (l > largeur) {
      largeur = l;
      meilleur = { x: ((xs[i] as number) + (xs[i + 1] as number)) / 2, y };
    }
  }
  return meilleur;
}

/** Points les plus proches de deux segments ; null s'ils sont parallèles. */
export function plusProchesSegments(
  p1: Vec3,
  q1: Vec3,
  p2: Vec3,
  q2: Vec3,
): { s: number; t: number; d: number } | null {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const c = dot(d1, r);
  const b = dot(d1, d2);
  const den = a * e - b * b;
  if (a < EPS || e < EPS || den <= 1e-12 * a * e) return null;
  const borne = (x: number): number => Math.min(1, Math.max(0, x));
  let s = borne((b * f - c * e) / den);
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = borne(-c / a);
  } else if (t > 1) {
    t = 1;
    s = borne((b - c) / a);
  }
  return { s, t, d: dist(lerp(p1, q1, s), lerp(p2, q2, t)) };
}

/** Projection d'un point sur un segment : paramètre borné et point. */
export function projeterSurSegment(p: Vec3, a: Vec3, b: Vec3): { t: number; point: Vec3 } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  return { t, point: lerp(a, b, t) };
}

// ————————————————————————————————————————————————————————————— Lecture

export function modeleVide(): Modele {
  return { racine: contexteVide(), definitions: {}, prochainId: 1 };
}

function contexteVide(): Contexte {
  return { sommets: {}, aretes: {}, faces: {}, courbes: {}, occurrences: {} };
}

/** Contexte d'édition : racine ou définition de l'occurrence `dans`. */
export function contexte(m: Modele, dans?: Id): Contexte {
  if (dans === undefined) return m.racine;
  const occ = trouverOccurrence(m, dans);
  const def = occ ? m.definitions[occ.definition] : undefined;
  if (!def) throw new Error(`Occurrence inconnue : ${dans}`);
  return def.contenu;
}

function trouverOccurrence(m: Modele, id: Id): Occurrence | undefined {
  const r = m.racine.occurrences[id];
  if (r) return r;
  for (const d of Object.values(m.definitions)) {
    const o = d.contenu.occurrences[id];
    if (o) return o;
  }
  return undefined;
}

export function nombreOccurrences(m: Modele, definition: Id): number {
  const compte = (c: Contexte): number => Object.values(c.occurrences).filter((o) => o.definition === definition).length;
  return compte(m.racine) + Object.values(m.definitions).reduce((s, d) => s + compte(d.contenu), 0);
}

export function compter(c: Contexte): { sommets: number; aretes: number; faces: number; occurrences: number } {
  return {
    sommets: Object.keys(c.sommets).length,
    aretes: Object.keys(c.aretes).length,
    faces: Object.keys(c.faces).length,
    occurrences: Object.keys(c.occurrences).length,
  };
}

export function positionsFace(c: Contexte, f: Face): { exterieur: Vec3[]; trous: Vec3[][] } {
  const pos = (s: Id): Vec3 => {
    const x = c.sommets[s];
    if (!x) throw new Error(`Sommet inconnu : ${s}`);
    return x.position;
  };
  return { exterieur: f.exterieur.map(pos), trous: f.trous.map((t) => t.map(pos)) };
}

function aireBoucles(ext: readonly Vec3[], trous: readonly (readonly Vec3[])[]): number {
  return len(newell(ext)) / 2 - trous.reduce((s, t) => s + len(newell(t)) / 2, 0);
}

/** Aire nette d'une face (m²), trous déduits. */
export function aire(m: Modele, face: Id, o: OptionsContexte = {}): number {
  const c = contexte(m, o.dans);
  const f = c.faces[face];
  if (!f) throw new Error(`Face inconnue : ${face}`);
  const p = positionsFace(c, f);
  return aireBoucles(p.exterieur, p.trous);
}

/** Variété fermée : au moins une face, chaque arête bordée par exactement deux faces, aucune occurrence imbriquée. */
export function estSolide(m: Modele, occurrence: Id): boolean {
  const c = contexte(m, occurrence);
  if (Object.keys(c.faces).length === 0 || Object.keys(c.occurrences).length > 0) return false;
  const usages = new Map<string, number>();
  for (const f of Object.values(c.faces)) {
    for (const b of [f.exterieur, ...f.trous]) {
      for (let i = 0; i < b.length; i++) {
        const k = cle(b[i] as Id, b[(i + 1) % b.length] as Id);
        usages.set(k, (usages.get(k) ?? 0) + 1);
      }
    }
  }
  for (const a of Object.values(c.aretes)) if (usages.get(cle(a.a, a.b)) !== 2) return false;
  return true;
}

/** Volume (m³) d'un groupe/composant solide, transformation de l'occurrence comprise ; null s'il n'est pas solide. */
export function volume(m: Modele, occurrence: Id): number | null {
  if (!estSolide(m, occurrence)) return null;
  const occ = trouverOccurrence(m, occurrence) as Occurrence;
  const c = contexte(m, occurrence);
  let v = 0;
  for (const f of Object.values(c.faces)) {
    const p = positionsFace(c, f);
    const p0 = p.exterieur[0] as Vec3;
    v += (dot(f.normale, p0) * aireBoucles(p.exterieur, p.trous)) / 3;
  }
  return Math.abs(v) * Math.abs(determinant3(occ.transformation));
}

// ————————————————————————————————————————————————————————————— Chantier mutable interne

interface Ctx {
  sommets: Map<Id, Sommet>;
  aretes: Map<Id, Arete>;
  faces: Map<Id, Face>;
  courbes: Map<Id, Courbe>;
  occurrences: Map<Id, Occurrence>;
}

interface DefTravail {
  id: Id;
  nom: string;
  genre: GenreDefinition;
  contenu: Ctx;
}

const versCtx = (c: Contexte): Ctx => ({
  sommets: new Map(Object.entries(c.sommets)),
  aretes: new Map(Object.entries(c.aretes)),
  faces: new Map(Object.entries(c.faces)),
  courbes: new Map(Object.entries(c.courbes)),
  occurrences: new Map(Object.entries(c.occurrences)),
});

function versContexte(c: Ctx): Contexte {
  // I3 : aucun sommet isolé.
  const utilises = new Set<Id>();
  for (const a of c.aretes.values()) utilises.add(a.a).add(a.b);
  for (const s of [...c.sommets.keys()]) if (!utilises.has(s)) c.sommets.delete(s);
  return Object.freeze({
    sommets: Object.freeze(Object.fromEntries(c.sommets)),
    aretes: Object.freeze(Object.fromEntries(c.aretes)),
    faces: Object.freeze(Object.fromEntries(c.faces)),
    courbes: Object.freeze(Object.fromEntries(c.courbes)),
    occurrences: Object.freeze(Object.fromEntries(c.occurrences)),
  });
}

class Travail {
  prochain: number;
  racine: Ctx;
  definitions: Map<Id, DefTravail>;
  /** Contextes d'origine, réutilisés tels quels s'ils n'ont pas été ouverts en écriture. */
  private readonly origines = new Map<Ctx, Contexte>();
  private readonly sales = new Set<Ctx>();

  constructor(private readonly modele: Modele) {
    this.prochain = modele.prochainId;
    this.racine = versCtx(modele.racine);
    this.origines.set(this.racine, modele.racine);
    this.definitions = new Map();
    for (const d of Object.values(modele.definitions)) {
      const contenu = versCtx(d.contenu);
      this.origines.set(contenu, d.contenu);
      this.definitions.set(d.id, { id: d.id, nom: d.nom, genre: d.genre, contenu });
    }
  }

  salir(c: Ctx): Ctx {
    this.sales.add(c);
    return c;
  }

  id(prefixe: string): Id {
    return `${prefixe}${this.prochain++}`;
  }

  tousContextes(): Ctx[] {
    return [this.racine, ...[...this.definitions.values()].map((d) => d.contenu)];
  }

  occurrence(id: Id): { ctx: Ctx; occ: Occurrence } {
    for (const ctx of this.tousContextes()) {
      const occ = ctx.occurrences.get(id);
      if (occ) return { ctx, occ };
    }
    throw new Error(`Occurrence inconnue : ${id}`);
  }

  nombreOccurrences(def: Id): number {
    let n = 0;
    for (const ctx of this.tousContextes()) for (const o of ctx.occurrences.values()) if (o.definition === def) n++;
    return n;
  }

  /** Ouvre le contexte d'édition ; un groupe partagé est d'abord rendu unique (I7). */
  ouvrir(dans?: Id): Ctx {
    if (dans === undefined) return this.salir(this.racine);
    const { occ } = this.occurrence(dans);
    const def = this.definitions.get(occ.definition);
    if (!def) throw new Error(`Définition inconnue : ${occ.definition}`);
    // Édition d'un groupe partagé : l'occurrence éditée garde les identifiants, les autres reçoivent la copie.
    if (def.genre === "groupe" && this.nombreOccurrences(def.id) > 1) return this.rendreUnique(dans, true);
    return this.salir(def.contenu);
  }

  /** Copie privée de la définition pour `occId` ; `garderIds` : l'occurrence garde le contenu d'origine. */
  rendreUnique(occId: Id, garderIds = false): Ctx {
    const { ctx, occ } = this.occurrence(occId);
    const def = this.definitions.get(occ.definition);
    if (!def) throw new Error(`Définition inconnue : ${occ.definition}`);
    this.salir(ctx);
    const copie = cloner(this, def.contenu);
    const id = this.id("d");
    const pourOcc = garderIds ? def.contenu : copie;
    if (garderIds) this.definitions.set(def.id, { ...def, contenu: copie });
    this.definitions.set(id, { id, nom: `${def.nom}#1`, genre: def.genre, contenu: pourOcc });
    ctx.occurrences.set(occId, { ...occ, definition: id });
    return this.salir(pourOcc);
  }

  private figer(c: Ctx): Contexte {
    const o = this.origines.get(c);
    return o && !this.sales.has(c) ? o : versContexte(c);
  }

  fermer(): Modele {
    const definitions: Record<Id, Definition> = {};
    for (const d of this.definitions.values()) {
      if (this.nombreOccurrences(d.id) === 0) continue;
      const ancienne = this.modele.definitions[d.id];
      const contenu = this.figer(d.contenu);
      definitions[d.id] =
        ancienne && ancienne.contenu === contenu && ancienne.nom === d.nom && ancienne.genre === d.genre
          ? ancienne
          : Object.freeze({ id: d.id, nom: d.nom, genre: d.genre, contenu });
    }
    return Object.freeze({ racine: this.figer(this.racine), definitions: Object.freeze(definitions), prochainId: this.prochain });
  }
}

/** Copie d'un contexte avec de nouveaux identifiants (I2). */
function cloner(t: Travail, c: Ctx): Ctx {
  const r: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
  const map = new Map<Id, Id>();
  const neuf = (ancien: Id): Id => {
    let n = map.get(ancien);
    if (!n) {
      n = t.id(ancien.charAt(0));
      map.set(ancien, n);
    }
    return n;
  };
  for (const s of c.sommets.values()) r.sommets.set(neuf(s.id), { id: neuf(s.id), position: s.position });
  for (const a of c.aretes.values()) {
    const na: Arete = { ...a, id: neuf(a.id), a: neuf(a.a), b: neuf(a.b), ...(a.courbe ? { courbe: neuf(a.courbe) } : {}) };
    r.aretes.set(na.id, na);
  }
  for (const f of c.faces.values()) {
    r.faces.set(neuf(f.id), { ...f, id: neuf(f.id), exterieur: f.exterieur.map(neuf), trous: f.trous.map((b) => b.map(neuf)) });
  }
  for (const k of c.courbes.values()) r.courbes.set(neuf(k.id), { ...k, id: neuf(k.id), aretes: k.aretes.map(neuf) });
  for (const o of c.occurrences.values()) r.occurrences.set(neuf(o.id), { ...o, id: neuf(o.id) });
  return r;
}

function aplatir(m: Modele): Map<Id, string> {
  const r = new Map<Id, string>();
  const ajouter = (c: Contexte): void => {
    for (const rec of [c.sommets, c.aretes, c.faces, c.courbes, c.occurrences]) {
      for (const [id, v] of Object.entries(rec)) r.set(id, JSON.stringify(v));
    }
  };
  ajouter(m.racine);
  for (const d of Object.values(m.definitions)) {
    r.set(d.id, JSON.stringify({ id: d.id, nom: d.nom, genre: d.genre }));
    ajouter(d.contenu);
  }
  return r;
}

function differences(avant: Modele, apres: Modele): Rapport {
  const a = aplatir(avant);
  const b = aplatir(apres);
  const crees: Id[] = [];
  const supprimes: Id[] = [];
  const modifies: Id[] = [];
  for (const [id, v] of b) {
    const w = a.get(id);
    if (w === undefined) crees.push(id);
    else if (w !== v) modifies.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) supprimes.push(id);
  return { crees, supprimes, modifies };
}

function operer<X>(m: Modele, dans: Id | undefined, fn: (t: Travail, c: Ctx) => X): Resultat & { extra: X } {
  const t = new Travail(m);
  const c = t.ouvrir(dans);
  const extra = fn(t, c);
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele), extra };
}

// ————————————————————————————————————————————————————————————— Primitives sur le chantier

const cle = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const numId = (id: Id): number => Number.parseInt(id.slice(1), 10);

function pos(c: Ctx, s: Id): Vec3 {
  const x = c.sommets.get(s);
  if (!x) throw new Error(`Sommet inconnu : ${s}`);
  return x.position;
}

function areteEntre(c: Ctx, u: Id, w: Id): Arete | undefined {
  for (const a of c.aretes.values()) if ((a.a === u && a.b === w) || (a.a === w && a.b === u)) return a;
  return undefined;
}

const aretesDuSommet = (c: Ctx, s: Id): Arete[] => [...c.aretes.values()].filter((a) => a.a === s || a.b === s);

function boucleContient(b: readonly Id[], u: Id, w: Id): boolean {
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = b[(i + 1) % b.length];
    if ((x === u && y === w) || (x === w && y === u)) return true;
  }
  return false;
}

const facesDeArete = (c: Ctx, a: Arete): Face[] =>
  [...c.faces.values()].filter((f) => [f.exterieur, ...f.trous].some((b) => boucleContient(b, a.a, a.b)));

const planDeFace = (c: Ctx, f: Face): Plan => planCanonique(f.normale, pos(c, f.exterieur[0] as Id));

function facesDuPlan(c: Ctx, pl: Plan): Face[] {
  return [...c.faces.values()].filter((f) => Math.abs(dot(f.normale, pl.n)) > 1 - 1e-9 && surPlan(pl, pos(c, f.exterieur[0] as Id)));
}

function creerSommet(t: Travail, c: Ctx, p: Vec3): Id {
  const id = t.id("s");
  c.sommets.set(id, { id, position: p });
  return id;
}

function insererDansBoucle(b: readonly Id[], u: Id, w: Id, s: Id): readonly Id[] {
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = b[(i + 1) % b.length];
    if ((x === u && y === w) || (x === w && y === u)) return [...b.slice(0, i + 1), s, ...b.slice(i + 1)];
  }
  return b;
}

/** Découpe une arête en p (I4) ; le premier tronçon garde l'identifiant. */
function couperArete(t: Travail, c: Ctx, aid: Id, p: Vec3): Id {
  const ar = c.aretes.get(aid);
  if (!ar) throw new Error(`Arête inconnue : ${aid}`);
  const s = creerSommet(t, c, p);
  const nid = t.id("a");
  c.aretes.set(aid, { ...ar, b: s });
  c.aretes.set(nid, { ...ar, id: nid, a: s });
  if (ar.courbe) {
    const k = c.courbes.get(ar.courbe);
    if (k) {
      const i = k.aretes.indexOf(aid);
      c.courbes.set(k.id, { ...k, aretes: [...k.aretes.slice(0, i + 1), nid, ...k.aretes.slice(i + 1)] });
    }
  }
  for (const f of [...c.faces.values()]) {
    const ext = insererDansBoucle(f.exterieur, ar.a, ar.b, s);
    const trous = f.trous.map((b) => insererDansBoucle(b, ar.a, ar.b, s));
    if (ext !== f.exterieur || trous.some((b, i) => b !== f.trous[i])) c.faces.set(f.id, { ...f, exterieur: ext, trous });
  }
  return s;
}

/** Sommet en p : fusion à TOL, sinon découpe de l'arête qui passe par p, sinon création. */
function sommetEn(t: Travail, c: Ctx, p: Vec3): Id {
  for (const s of c.sommets.values()) if (egal(s.position, p)) return s.id;
  for (const a of [...c.aretes.values()]) {
    const A = pos(c, a.a);
    const B = pos(c, a.b);
    const pr = projeterSurSegment(p, A, B);
    if (dist(pr.point, p) <= TOL && !egal(pr.point, A) && !egal(pr.point, B)) return couperArete(t, c, a.id, pr.point);
  }
  return creerSommet(t, c, p);
}

interface AttributsArete {
  readonly adoucie?: boolean;
  readonly masquee?: boolean;
  readonly courbe?: Id;
}

/** Ajout d'un segment sans détection de face : fusion, découpes, arêtes colinéaires fusionnées. */
function ajouterSegmentBrut(
  t: Travail,
  c: Ctx,
  p: Vec3,
  q: Vec3,
  attrs: AttributsArete,
): { aretes: Id[]; nouvelles: Id[] } {
  if (egal(p, q)) return { aretes: [], nouvelles: [] };
  const su = sommetEn(t, c, p);
  const sv = sommetEn(t, c, q);
  if (su === sv) return { aretes: [], nouvelles: [] };
  const P = pos(c, su);
  const Q = pos(c, sv);
  for (const ar of [...c.aretes.values()]) {
    if (ar.a === su || ar.b === su || ar.a === sv || ar.b === sv) continue;
    const A = pos(c, ar.a);
    const B = pos(c, ar.b);
    const r = plusProchesSegments(P, Q, A, B);
    if (!r || r.d > TOL) continue;
    const X = lerp(A, B, r.t);
    if (egal(X, A) || egal(X, B) || egal(X, P) || egal(X, Q)) continue;
    couperArete(t, c, ar.id, X);
  }
  const PQ = sub(Q, P);
  const L2 = dot(PQ, PQ);
  const sur: { s: Id; t: number }[] = [];
  for (const s of c.sommets.values()) {
    const k = dot(sub(s.position, P), PQ) / L2;
    if (k < -TOL || k > 1 + TOL) continue;
    if (dist(s.position, add(P, scale(PQ, k))) <= TOL) sur.push({ s: s.id, t: k });
  }
  sur.sort((x, y) => x.t - y.t);
  const aretes: Id[] = [];
  const nouvelles: Id[] = [];
  for (let i = 0; i + 1 < sur.length; i++) {
    const u = (sur[i] as { s: Id }).s;
    const w = (sur[i + 1] as { s: Id }).s;
    if (u === w) continue;
    const ex = areteEntre(c, u, w);
    if (ex) {
      aretes.push(ex.id);
      continue;
    }
    const id = t.id("a");
    c.aretes.set(id, { id, a: u, b: w, ...attrs });
    aretes.push(id);
    nouvelles.push(id);
  }
  return { aretes, nouvelles };
}

// ————————————————————————————————————————————————————————————— Arrangement plan et faces automatiques

interface Source {
  readonly exterieur: readonly Vec3[];
  readonly trous: readonly (readonly Vec3[])[];
  readonly normale: Vec3;
  readonly materiauRecto?: string | undefined;
  readonly materiauVerso?: string | undefined;
  /** 'face' : la région devient une face ; 'trou' : la région reste vide (perçage, mur raccourci). */
  readonly role: "face" | "trou";
  /** Identifiant à reprendre (face déplacée par Pousser/Tirer) s'il est libre. */
  readonly idPrefere?: Id;
}

function egalCyclique(a: readonly Id[], b: readonly Id[]): boolean {
  if (a.length !== b.length) return false;
  const k = b.indexOf(a[0] as Id);
  if (k < 0) return false;
  return a.every((x, i) => b[(k + i) % b.length] === x);
}

const egalBoucle = (a: readonly Id[], b: readonly Id[]): boolean => egalCyclique(a, b) || egalCyclique(a, [...b].reverse());

/**
 * Recalcule les faces d'un plan à partir de l'arrangement de ses arêtes (I6).
 * Une région reçoit une face si : elle est dans un trou source → non ; elle hérite d'une ancienne face
 * (même boucle, ou recouvrement) → oui ; elle est dans une source 'face' → oui ; en mode automatique, elle
 * est bordée par une arête nouvelle → oui.
 */
function reconstruirePlan(
  t: Travail,
  c: Ctx,
  pl: Plan,
  opts: { sources: readonly Source[]; nouvelles: ReadonlySet<Id>; auto: boolean; anciennesExtra?: readonly Face[] },
): void {
  const { u, w } = baseDuPlan(pl.n);
  const p2 = (p: Vec3): P2 => ({ x: dot(p, u), y: dot(p, w) });
  const anciennes = new Map<Id, Face>();
  for (const f of facesDuPlan(c, pl)) anciennes.set(f.id, f);
  for (const f of opts.anciennesExtra ?? []) anciennes.set(f.id, f);
  const posAnc = (s: Id): Vec3 => pos(c, s);
  const anc = [...anciennes.values()].map((f) => {
    const ext = f.exterieur.map((s) => p2(posAnc(s)));
    const trous = f.trous.map((b) => b.map((s) => p2(posAnc(s))));
    return { f, ext, trous, ech: echantillon2(ext, trous) };
  });
  for (const f of facesDuPlan(c, pl)) c.faces.delete(f.id);

  // Graphe plan
  const voisins = new Map<Id, Set<Id>>();
  const areteDe = new Map<string, Id>();
  const lier = (x: Id, y: Id): void => {
    if (!voisins.has(x)) voisins.set(x, new Set());
    (voisins.get(x) as Set<Id>).add(y);
  };
  for (const a of c.aretes.values()) {
    if (!surPlan(pl, pos(c, a.a)) || !surPlan(pl, pos(c, a.b))) continue;
    lier(a.a, a.b);
    lier(a.b, a.a);
    areteDe.set(cle(a.a, a.b), a.id);
  }
  const retirer = (x: Id, y: Id): void => {
    voisins.get(x)?.delete(y);
    voisins.get(y)?.delete(x);
  };
  const elaguer = (): void => {
    let change = true;
    while (change) {
      change = false;
      for (const [s, vs] of voisins) {
        if (vs.size <= 1) {
          for (const v of vs) voisins.get(v)?.delete(s);
          voisins.delete(s);
          change = true;
        }
      }
    }
  };
  const P = new Map<Id, P2>();
  const coord = (s: Id): P2 => {
    let r = P.get(s);
    if (!r) {
      r = p2(pos(c, s));
      P.set(s, r);
    }
    return r;
  };
  let cycles: Id[][] = [];
  for (let garde = 0; garde < 10000; garde++) {
    elaguer();
    const tri = new Map<Id, Id[]>();
    for (const [s, vs] of voisins) {
      const o = coord(s);
      tri.set(
        s,
        [...vs].sort((x, y) => {
          const a = coord(x);
          const b = coord(y);
          return Math.atan2(a.y - o.y, a.x - o.x) - Math.atan2(b.y - o.y, b.x - o.x);
        }),
      );
    }
    const vus = new Set<string>();
    cycles = [];
    for (const [s, ns] of tri) {
      for (const n of ns) {
        if (vus.has(`${s}>${n}`)) continue;
        const cycle: Id[] = [];
        let a = s;
        let b = n;
        for (let g = 0; g < 1_000_000; g++) {
          vus.add(`${a}>${b}`);
          cycle.push(a);
          const l = tri.get(b) as Id[];
          const i = l.indexOf(a);
          const suivant = l[(i - 1 + l.length) % l.length] as Id;
          a = b;
          b = suivant;
          if (a === s && b === n) break;
        }
        cycles.push(cycle);
      }
    }
    const ponts: [Id, Id][] = [];
    for (const cy of cycles) {
      const demi = new Set<string>();
      for (let i = 0; i < cy.length; i++) demi.add(`${cy[i]}>${cy[(i + 1) % cy.length]}`);
      for (let i = 0; i < cy.length; i++) {
        const x = cy[i] as Id;
        const y = cy[(i + 1) % cy.length] as Id;
        if (demi.has(`${y}>${x}`)) ponts.push([x, y]);
      }
    }
    if (ponts.length === 0) break;
    for (const [x, y] of ponts) retirer(x, y);
  }

  // Composantes connexes (pour l'attribution des trous)
  const comp = new Map<Id, number>();
  let nc = 0;
  for (const s of voisins.keys()) {
    if (comp.has(s)) continue;
    const pile = [s];
    comp.set(s, nc);
    while (pile.length) {
      const x = pile.pop() as Id;
      for (const y of voisins.get(x) ?? []) {
        if (!comp.has(y)) {
          comp.set(y, nc);
          pile.push(y);
        }
      }
    }
    nc++;
  }
  const info = cycles.map((cy) => ({ cy, pts: cy.map(coord), aire: aireSignee2(cy.map(coord)) }));
  const positifs = info.filter((x) => x.aire > 1e-12);
  const negatifs = info.filter((x) => x.aire < -1e-12);
  const regions = positifs.map((x) => ({ ext: x.cy, extP: x.pts, aireExt: x.aire, trous: [] as Id[][], trousP: [] as P2[][] }));
  for (const n of negatifs) {
    const pt = n.pts[0] as P2;
    const cn = comp.get(n.cy[0] as Id);
    let meilleure: (typeof regions)[number] | undefined;
    for (const r of regions) {
      if (comp.get(r.ext[0] as Id) === cn) continue;
      if (!dansPolygone2(pt, r.extP)) continue;
      if (!meilleure || r.aireExt < meilleure.aireExt) meilleure = r;
    }
    if (meilleure) {
      meilleure.trous.push(n.cy);
      meilleure.trousP.push(n.pts);
    }
  }

  const sources = opts.sources.map((s) => {
    const ext = s.exterieur.map(p2);
    const trous = s.trous.map((b) => b.map(p2));
    return { s, ext, trous };
  });
  const prises = new Set<Id>();
  const faites = new Set<number>();
  const orienter = (normale: Vec3): Vec3 => (dot(normale, pl.n) >= 0 ? pl.n : scale(pl.n, -1));
  const poser = (
    ri: number,
    id: Id,
    normale: Vec3,
    recto: string | undefined,
    verso: string | undefined,
  ): void => {
    const r = regions[ri] as (typeof regions)[number];
    const n = orienter(normale);
    const inv = dot(n, pl.n) < 0;
    const f: Face = {
      id,
      exterieur: inv ? [...r.ext].reverse() : r.ext,
      trous: r.trous.map((b) => (inv ? [...b].reverse() : b)),
      normale: n,
      ...(recto !== undefined ? { materiauRecto: recto } : {}),
      ...(verso !== undefined ? { materiauVerso: verso } : {}),
    };
    c.faces.set(id, f);
    faites.add(ri);
  };
  // 1) boucles identiques à une ancienne face : objet conservé tel quel
  regions.forEach((r, ri) => {
    for (const a of anc) {
      if (prises.has(a.f.id)) continue;
      if (!egalBoucle(r.ext, a.f.exterieur) || r.trous.length !== a.f.trous.length) continue;
      if (!r.trous.every((tr) => a.f.trous.some((ta) => egalBoucle(tr, ta)))) continue;
      const ech = echantillon2(r.extP, r.trousP);
      if (sources.some((s) => s.s.role === "trou" && dansRegion2(ech, s.ext, s.trous))) continue;
      prises.add(a.f.id);
      c.faces.set(a.f.id, a.f);
      faites.add(ri);
      return;
    }
  });
  // 2) autres régions, de la plus grande à la plus petite
  const ordre = regions
    .map((r, ri) => ({ ri, aire: r.aireExt - r.trousP.reduce((s, b) => s + Math.abs(aireSignee2(b)), 0) }))
    .filter((x) => !faites.has(x.ri))
    .sort((a, b) => b.aire - a.aire);
  for (const { ri } of ordre) {
    const r = regions[ri] as (typeof regions)[number];
    const ech = echantillon2(r.extP, r.trousP);
    if (sources.some((s) => s.s.role === "trou" && dansRegion2(ech, s.ext, s.trous))) continue;
    const candidates = anc
      .filter((a) => dansRegion2(ech, a.ext, a.trous) || dansRegion2(a.ech, r.extP, r.trousP))
      .sort((a, b) => numId(a.f.id) - numId(b.f.id));
    const doyenne = candidates[0];
    if (doyenne) {
      const libre = candidates.find((a) => !prises.has(a.f.id));
      const id = libre ? libre.f.id : t.id("f");
      prises.add(id);
      poser(ri, id, doyenne.f.normale, doyenne.f.materiauRecto, doyenne.f.materiauVerso);
      continue;
    }
    const src = sources.find((s) => s.s.role === "face" && dansRegion2(ech, s.ext, s.trous));
    if (src) {
      const pref = src.s.idPrefere;
      const id = pref !== undefined && !c.faces.has(pref) && !prises.has(pref) ? pref : t.id("f");
      prises.add(id);
      poser(ri, id, src.s.normale, src.s.materiauRecto, src.s.materiauVerso);
      continue;
    }
    if (opts.auto) {
      const bords = [r.ext, ...r.trous];
      const neuve = bords.some((b) =>
        b.some((x, i) => opts.nouvelles.has(areteDe.get(cle(x, b[(i + 1) % b.length] as Id)) ?? "")),
      );
      if (neuve) poser(ri, t.id("f"), pl.n, undefined, undefined);
    }
  }
}

function ajouterPlan(plans: Plan[], p: Plan): void {
  if (!plans.some((q) => memePlan(p, q))) plans.push(p);
}

interface SegmentSource {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly adoucie?: boolean | undefined;
  readonly masquee?: boolean | undefined;
  readonly courbe?: {
    readonly cle: string;
    readonly genre: GenreCourbe;
    readonly centre: Vec3;
    readonly rayon: number;
    readonly normale: Vec3;
  };
}

/** Insertion collante de segments et de polygones sources dans un contexte. */
function insererGeometrie(
  t: Travail,
  c: Ctx,
  segments: readonly SegmentSource[],
  sources: readonly Source[],
  auto: boolean,
): Set<Id> {
  const nouvelles = new Set<Id>();
  const courbes = new Map<string, Id>();
  for (const sg of segments) {
    let courbe: Id | undefined;
    if (sg.courbe) {
      courbe = courbes.get(sg.courbe.cle);
      if (!courbe) {
        courbe = t.id("c");
        courbes.set(sg.courbe.cle, courbe);
        const k = sg.courbe;
        c.courbes.set(courbe, { id: courbe, genre: k.genre, aretes: [], centre: k.centre, rayon: k.rayon, normale: k.normale });
      }
    }
    const attrs: AttributsArete = {
      ...(sg.adoucie ? { adoucie: true } : {}),
      ...(sg.masquee ? { masquee: true } : {}),
      ...(courbe ? { courbe } : {}),
    };
    const r = ajouterSegmentBrut(t, c, sg.a, sg.b, attrs);
    for (const id of r.nouvelles) nouvelles.add(id);
    if (courbe) {
      const k = c.courbes.get(courbe) as Courbe;
      c.courbes.set(courbe, { ...k, aretes: [...k.aretes, ...r.nouvelles] });
    }
  }
  for (const id of courbes.values()) if ((c.courbes.get(id) as Courbe).aretes.length === 0) c.courbes.delete(id);

  const plans: Plan[] = [];
  for (const s of sources) ajouterPlan(plans, planCanonique(s.normale, s.exterieur[0] as Vec3));
  for (const id of nouvelles) {
    const a = c.aretes.get(id);
    if (!a) continue;
    const A = pos(c, a.a);
    const B = pos(c, a.b);
    for (const f of c.faces.values()) {
      const pf = planDeFace(c, f);
      if (surPlan(pf, A) && surPlan(pf, B)) ajouterPlan(plans, pf);
    }
    if (!auto) continue;
    for (const [s, X] of [
      [a.a, A],
      [a.b, B],
    ] as const) {
      for (const g of aretesDuSommet(c, s)) {
        if (g.id === a.id) continue;
        const Z = pos(c, g.a === s ? g.b : g.a);
        const n = cross(sub(B, A), sub(Z, X));
        if (len(n) < 1e-9 * dist(A, B) * dist(Z, X)) continue;
        ajouterPlan(plans, planCanonique(n, X));
      }
    }
  }
  for (const pl of plans) {
    reconstruirePlan(t, c, pl, {
      sources: sources.filter((s) => memePlan(planCanonique(s.normale, s.exterieur[0] as Vec3), pl)),
      nouvelles,
      auto,
    });
  }
  return nouvelles;
}

/** Fusionne une arête de degré 2 colinéaire (après effacement), si les mêmes faces la bordent. */
function cicatriser(c: Ctx, s: Id): void {
  if (!c.sommets.has(s)) return;
  const ar = aretesDuSommet(c, s);
  if (ar.length !== 2) return;
  const [e1, e2] = ar as [Arete, Arete];
  const o1 = e1.a === s ? e1.b : e1.a;
  const o2 = e2.a === s ? e2.b : e2.a;
  const S = pos(c, s);
  const d1 = sub(pos(c, o1), S);
  const d2 = sub(pos(c, o2), S);
  if (!colineaires(d1, d2, 1e-9) || dot(d1, d2) > 0) return;
  if (e1.courbe !== e2.courbe || areteEntre(c, o1, o2)) return;
  const f1 = facesDeArete(c, e1).map((f) => f.id).sort();
  const f2 = facesDeArete(c, e2).map((f) => f.id).sort();
  if (f1.join() !== f2.join()) return;
  c.aretes.set(e1.id, { ...e1, a: o1, b: o2 });
  c.aretes.delete(e2.id);
  if (e2.courbe) {
    const k = c.courbes.get(e2.courbe);
    if (k) c.courbes.set(k.id, { ...k, aretes: k.aretes.filter((x) => x !== e2.id) });
  }
  for (const f of [...c.faces.values()]) {
    if (!f.exterieur.includes(s) && !f.trous.some((b) => b.includes(s))) continue;
    c.faces.set(f.id, { ...f, exterieur: f.exterieur.filter((x) => x !== s), trous: f.trous.map((b) => b.filter((x) => x !== s)) });
  }
  c.sommets.delete(s);
}

/** Effacement d'arêtes : faces dépendantes supprimées, ou fusion si l'arête sépare deux faces coplanaires. */
function effacerAretesInterne(t: Travail, c: Ctx, ids: readonly Id[]): void {
  const aSupprimer = new Set<Id>();
  const fusions: { plan: Plan; faces: Face[] }[] = [];
  const bouts = new Set<Id>();
  for (const id of ids) {
    const a = c.aretes.get(id);
    if (!a) continue;
    bouts.add(a.a).add(a.b);
    const fs = facesDeArete(c, a);
    const [f1, f2] = fs;
    if (fs.length === 2 && f1 && f2 && memePlan(planDeFace(c, f1), planDeFace(c, f2))) {
      const pl = planDeFace(c, f1);
      const ex = fusions.find((x) => memePlan(x.plan, pl));
      if (ex) ex.faces.push(f1, f2);
      else fusions.push({ plan: pl, faces: [f1, f2] });
    } else for (const f of fs) aSupprimer.add(f.id);
  }
  for (const id of aSupprimer) c.faces.delete(id);
  for (const id of ids) {
    const a = c.aretes.get(id);
    if (!a) continue;
    c.aretes.delete(id);
    if (a.courbe) {
      const k = c.courbes.get(a.courbe);
      if (k) {
        const reste = k.aretes.filter((x) => x !== id);
        if (reste.length) c.courbes.set(k.id, { ...k, aretes: reste });
        else c.courbes.delete(k.id);
      }
    }
  }
  for (const fu of fusions) {
    reconstruirePlan(t, c, fu.plan, {
      sources: [],
      nouvelles: new Set(),
      auto: false,
      anciennesExtra: fu.faces.filter((f) => !aSupprimer.has(f.id)),
    });
  }
  for (const s of bouts) {
    if (aretesDuSommet(c, s).length === 0) c.sommets.delete(s);
    else cicatriser(c, s);
  }
}

// ————————————————————————————————————————————————————————————— Opérations de dessin

/** Segment (outil Ligne) : fusion des sommets à TOL, découpes, détection automatique de face. */
export function ajouterSegment(m: Modele, p: Vec3, q: Vec3, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, [{ a: p, b: q }], [], true);
  });
}

/** Rectangle (outil Rectangle) de coins coin, coin+cote1, coin+cote1+cote2, coin+cote2. */
export function ajouterRectangle(m: Modele, coin: Vec3, cote1: Vec3, cote2: Vec3, o: OptionsContexte = {}): Resultat {
  const p = [coin, add(coin, cote1), add(add(coin, cote1), cote2), add(coin, cote2)];
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, p.map((a, i) => ({ a, b: p[(i + 1) % 4] as Vec3 })), [], true);
  });
}

export interface OptionsPolygone extends OptionsContexte {
  /** 'cercle' (outil Cercle) ou 'polygone' (outil Polygone) ; dans les deux cas une seule courbe. */
  readonly genre?: "cercle" | "polygone";
  /** Direction du premier sommet (relevé : le 1er sommet est placé vers le curseur). */
  readonly depart?: Vec3;
}

/** Polygone régulier inscrit (cercle = polygone de n segments marqué courbe), face automatique. */
export function ajouterPolygone(
  m: Modele,
  centre: Vec3,
  normale: Vec3,
  rayon: number,
  cotes: number,
  o: OptionsPolygone = {},
): Resultat {
  if (!Number.isInteger(cotes) || cotes < 3 || cotes > 999) {
    throw new RangeError("Curve segments must be in the range from 3 to 999 (segments de courbe : de 3 à 999)");
  }
  const n = normalize(normale);
  let u = o.depart ? normalize(sub(o.depart, scale(n, dot(o.depart, n)))) : baseDuPlan(n).u;
  if (len(u) < 0.5) u = baseDuPlan(n).u;
  const w = cross(n, u);
  const pts: Vec3[] = [];
  for (let i = 0; i < cotes; i++) {
    const a = (2 * Math.PI * i) / cotes;
    pts.push(add(centre, add(scale(u, rayon * Math.cos(a)), scale(w, rayon * Math.sin(a)))));
  }
  const courbe = { cle: "k", genre: o.genre ?? "cercle", centre, rayon, normale: n } as const;
  return operer(m, o.dans, (t, c) => {
    insererGeometrie(t, c, pts.map((a, i) => ({ a, b: pts[(i + 1) % cotes] as Vec3, courbe })), [], true);
  });
}

/** Gomme : efface l'arête (ou toute sa courbe) ; faces dépendantes supprimées ou fusionnées si coplanaires. */
export function effacerArete(m: Modele, arete: Id, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const a = c.aretes.get(arete);
    if (!a) throw new Error(`Arête inconnue : ${arete}`);
    const k = a.courbe ? c.courbes.get(a.courbe) : undefined;
    effacerAretesInterne(t, c, k ? [...k.aretes] : [arete]);
  });
}

/** Inverse la face : normale opposée, boucles retournées, matériaux recto/verso échangés. */
export function inverserFace(m: Modele, face: Id, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (_t, c) => {
    const f = c.faces.get(face);
    if (!f) throw new Error(`Face inconnue : ${face}`);
    c.faces.set(face, inverser(f));
  });
}

function inverser(f: Face): Face {
  return {
    id: f.id,
    exterieur: [...f.exterieur].reverse(),
    trous: f.trous.map((b) => [...b].reverse()),
    normale: scale(f.normale, -1),
    ...(f.materiauVerso !== undefined ? { materiauRecto: f.materiauVerso } : {}),
    ...(f.materiauRecto !== undefined ? { materiauVerso: f.materiauRecto } : {}),
  };
}

function pointDansFace(c: Ctx, f: Face, p: Vec3): boolean {
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (x: Vec3): P2 => ({ x: dot(x, u), y: dot(x, w) });
  return dansRegion2(
    p2(p),
    f.exterieur.map((s) => p2(pos(c, s))),
    f.trous.map((b) => b.map((s) => p2(pos(c, s)))),
  );
}

function echantillonFace(c: Ctx, f: Face): Vec3 {
  const { u, w } = baseDuPlan(f.normale);
  const p2 = (x: Vec3): P2 => ({ x: dot(x, u), y: dot(x, w) });
  const e = echantillon2(
    f.exterieur.map((s) => p2(pos(c, s))),
    f.trous.map((b) => b.map((s) => p2(pos(c, s)))),
  );
  const o = scale(f.normale, dot(f.normale, pos(c, f.exterieur[0] as Id)));
  return add(o, add(scale(u, e.x), scale(w, e.y)));
}

export interface OptionsPousserTirer extends OptionsContexte {
  /** Ctrl : conserve la face de départ (nouvelle face de départ, arête à l'ancien niveau). */
  readonly nouvelleFace?: boolean;
}

/**
 * Pousser/Tirer : distance > 0 dans le sens de la normale, < 0 pour creuser. Faces latérales créées ;
 * sans Ctrl, une face reliée à d'autres est déplacée et les faces voisines coplanaires sont prolongées
 * (sans arête intermédiaire) ; une face isolée reste comme base. Le creusement qui atteint une face opposée
 * parallèle la perce (trou traversant).
 */
export function pousserTirer(m: Modele, face: Id, distance: number, o: OptionsPousserTirer = {}): Resultat {
  return operer(m, o.dans, (t, c) => {
    const F = c.faces.get(face);
    if (!F) throw new Error(`Face inconnue : ${face}`);
    if (Math.abs(distance) < EPS) return;
    const n = F.normale;
    const dep = scale(n, distance);
    const boucles = [F.exterieur, ...F.trous].map((b) => b.map((s) => pos(c, s)));
    const bords = [F.exterieur, ...F.trous].flatMap((b) => b.map((s, i) => [s, b[(i + 1) % b.length] as Id] as const));
    const voisins = new Set<Id>();
    for (const [x, y] of bords) {
      const a = areteEntre(c, x, y);
      if (a) for (const g of facesDeArete(c, a)) if (g.id !== F.id) voisins.add(g.id);
    }
    const isolee = voisins.size === 0;
    const matiere = isolee || distance > 0;
    // Perçage : une face parallèle opposée contient la face translatée.
    const ech = add(echantillonFace(c, F), dep);
    const plFin = planCanonique(n, add(boucles[0]?.[0] as Vec3, dep));
    const percee =
      !matiere &&
      [...c.faces.values()].some((g) => g.id !== F.id && memePlan(planDeFace(c, g), plFin) && pointDansFace(c, g, ech));
    if (isolee) {
      if (distance > 0) c.faces.set(F.id, inverser(F));
    } else if (!o.nouvelleFace) c.faces.delete(F.id);

    const segments: SegmentSource[] = [];
    const sources: Source[] = [];
    const facesAvant = [...c.faces.values()];
    boucles.forEach((b, ib) => {
      const ids = (ib === 0 ? F.exterieur : F.trous[ib - 1]) as readonly Id[];
      for (let i = 0; i < b.length; i++) {
        const A = b[i] as Vec3;
        const B = b[(i + 1) % b.length] as Vec3;
        segments.push({ a: A, b: add(A, dep) }, { a: add(A, dep), b: add(B, dep) });
        const ns = scale(normalize(cross(sub(B, A), n)), matiere ? 1 : -1);
        const quad = [A, B, add(B, dep), add(A, dep)];
        const plQuad = planCanonique(ns, A);
        // Mur voisin dans le plan de la face latérale : prolongé (tirer) ou raccourci (pousser).
        const ar = areteEntre(c, ids[i] as Id, ids[(i + 1) % ids.length] as Id);
        const mur =
          ar !== undefined &&
          facesAvant.some((g) => g.id !== F.id && memePlan(planDeFace(c, g), plQuad) && facesDeArete(c, ar).some((h) => h.id === g.id));
        sources.push({ exterieur: quad, trous: [], normale: ns, role: mur && distance < 0 ? "trou" : "face" });
      }
    });
    const fin = {
      exterieur: (boucles[0] as Vec3[]).map((p) => add(p, dep)),
      trous: boucles.slice(1).map((b) => b.map((p) => add(p, dep))),
    };
    if (percee) sources.push({ ...fin, normale: n, role: "trou" });
    else {
      sources.push({
        ...fin,
        normale: isolee && distance < 0 ? scale(n, -1) : n,
        materiauRecto: F.materiauRecto,
        materiauVerso: F.materiauVerso,
        role: "face",
        ...(isolee || o.nouvelleFace ? {} : { idPrefere: F.id }),
      });
    }
    insererGeometrie(t, c, segments, sources, false);
    if (!isolee && !o.nouvelleFace) {
      // Arêtes devenues sans face entre l'ancienne et la nouvelle position (mur raccourci) : supprimées.
      const orphelines: Id[] = [];
      for (const a of c.aretes.values()) {
        const A = pos(c, a.a);
        const B = pos(c, a.b);
        const entre = boucles.some((b) =>
          b.some((X, i) => {
            const Y = b[(i + 1) % b.length] as Vec3;
            const surSeg = (p: Vec3, u: Vec3, w: Vec3): boolean => dist(projeterSurSegment(p, u, w).point, p) <= TOL;
            return (
              (surSeg(A, X, add(X, dep)) && surSeg(B, X, add(X, dep))) || (surSeg(A, X, Y) && surSeg(B, X, Y))
            );
          }),
        );
        if (entre && facesDeArete(c, a).length === 0) orphelines.push(a.id);
      }
      if (orphelines.length) effacerAretesInterne(t, c, orphelines);
      for (const [x, y] of bords) {
        const a = areteEntre(c, x, y);
        if (!a) continue;
        const fs = facesDeArete(c, a);
        const [f1, f2] = fs;
        if (fs.length === 2 && f1 && f2 && memePlan(planDeFace(c, f1), planDeFace(c, f2))) effacerAretesInterne(t, c, [a.id]);
      }
    }
  });
}

export interface ResultatFace extends Resultat {
  /** Face créée par l'opération (face intérieure pour un décalage vers l'intérieur). */
  readonly face: Id | undefined;
}

/** Décalage (Offset) du contour extérieur : distance > 0 vers l'intérieur, < 0 vers l'extérieur. */
export function decaler(m: Modele, face: Id, distance: number, o: OptionsContexte = {}): ResultatFace {
  const r = operer(m, o.dans, (t, c) => {
    const F = c.faces.get(face);
    if (!F) throw new Error(`Face inconnue : ${face}`);
    const n = F.normale;
    const pts = F.exterieur.map((s) => pos(c, s));
    const k = pts.length;
    const decale: Vec3[] = [];
    for (let i = 0; i < k; i++) {
      const prec = pts[(i - 1 + k) % k] as Vec3;
      const ici = pts[i] as Vec3;
      const suiv = pts[(i + 1) % k] as Vec3;
      const d0 = normalize(sub(ici, prec));
      const d1 = normalize(sub(suiv, ici));
      const n0 = cross(n, d0);
      const n1 = cross(n, d1);
      const a0 = add(prec, scale(n0, distance));
      const a1 = add(ici, scale(n1, distance));
      const den = dot(cross(d0, d1), n);
      if (Math.abs(den) < 1e-12) {
        decale.push(add(ici, scale(n1, distance)));
        continue;
      }
      const s = dot(cross(sub(a1, a0), d1), n) / den;
      decale.push(add(a0, scale(d0, s)));
    }
    const segments = decale.map((a, i) => ({ a, b: decale[(i + 1) % k] as Vec3 }));
    const sources: Source[] =
      distance < 0
        ? [{ exterieur: decale, trous: [], normale: n, materiauRecto: F.materiauRecto, materiauVerso: F.materiauVerso, role: "face" }]
        : [];
    insererGeometrie(t, c, segments, sources, false);
    // Face dont le contour extérieur est le contour décalé.
    return [...c.faces.values()].find(
      (f) => f.exterieur.length === k && f.exterieur.every((s) => decale.some((p) => egal(p, pos(c, s)))),
    )?.id;
  });
  return { modele: r.modele, rapport: r.rapport, face: r.extra };
}

// ————————————————————————————————————————————————————————————— Transformations

function sommetsDe(c: Ctx, entites: readonly Id[]): Set<Id> {
  const s = new Set<Id>();
  for (const id of entites) {
    const f = c.faces.get(id);
    if (f) for (const b of [f.exterieur, ...f.trous]) for (const x of b) s.add(x);
    const a = c.aretes.get(id);
    if (a) s.add(a.a).add(a.b);
    if (c.sommets.has(id)) s.add(id);
    const k = c.courbes.get(id);
    if (k) for (const e of k.aretes) {
      const ar = c.aretes.get(e);
      if (ar) s.add(ar.a).add(ar.b);
    }
  }
  return s;
}

function fusionnerBoucles(A: readonly Id[], B: readonly Id[], x: Id, y: Id): Id[] {
  // A contient x→y, B contient y→x
  const iy = A.indexOf(y);
  const rotA = [...A.slice(iy), ...A.slice(0, iy)]; // y … x
  const ix = B.indexOf(x);
  const rotB = [...B.slice(ix), ...B.slice(0, ix)]; // x … y
  return [...rotA, ...rotB.slice(1, -1)];
}

/** Rend une face plane après déformation : normale recalculée, ou pliage (autofold) si elle ne l'est plus. */
function replanifier(t: Travail, c: Ctx, f: Face): void {
  const ext = f.exterieur.map((s) => pos(c, s));
  const nw = newell(ext);
  if (len(nw) < EPS) {
    c.faces.delete(f.id);
    return;
  }
  const n = normalize(nw);
  const d = dot(n, ext[0] as Vec3);
  const tous = [f.exterieur, ...f.trous].flat().map((s) => pos(c, s));
  if (tous.every((p) => Math.abs(dot(n, p) - d) <= TOL) || f.trous.length > 0) {
    c.faces.set(f.id, { ...f, normale: n });
    return;
  }
  // Pliage en éventail puis regroupement des triangles coplanaires adjacents.
  let polys: Id[][] = [];
  const v0 = f.exterieur[0] as Id;
  for (let i = 1; i + 1 < f.exterieur.length; i++) polys.push([v0, f.exterieur[i] as Id, f.exterieur[i + 1] as Id]);
  const planP = (p: readonly Id[]): Plan => {
    const q = p.map((s) => pos(c, s));
    return planCanonique(newell(q), q[0] as Vec3);
  };
  let change = true;
  while (change) {
    change = false;
    boucle: for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        const A = polys[i] as Id[];
        const B = polys[j] as Id[];
        for (let k = 0; k < A.length; k++) {
          const x = A[k] as Id;
          const y = A[(k + 1) % A.length] as Id;
          const iy = B.indexOf(y);
          if (iy < 0 || B[(iy + 1) % B.length] !== x) continue;
          if (!memePlan(planP(A), planP(B))) continue;
          polys[i] = fusionnerBoucles(A, B, x, y);
          polys = polys.filter((_, q) => q !== j);
          change = true;
          break boucle;
        }
      }
    }
  }
  c.faces.delete(f.id);
  polys.forEach((p, i) => {
    for (let k = 0; k < p.length; k++) {
      const x = p[k] as Id;
      const y = p[(k + 1) % p.length] as Id;
      if (!areteEntre(c, x, y)) {
        const id = t.id("a");
        c.aretes.set(id, { id, a: x, b: y });
      }
    }
    const id = i === 0 ? f.id : t.id("f");
    c.faces.set(id, { ...f, id, exterieur: p, trous: [], normale: normalize(newell(p.map((s) => pos(c, s)))) });
  });
}

/** Fusionne les sommets déplacés confondus avec d'autres sommets (géométrie collante minimale). */
function fusionnerSommets(c: Ctx, deplaces: ReadonlySet<Id>): void {
  for (const s of deplaces) {
    const S = c.sommets.get(s);
    if (!S) continue;
    const autre = [...c.sommets.values()].find((x) => x.id !== s && !deplaces.has(x.id) && egal(x.position, S.position));
    if (!autre) continue;
    const r = (x: Id): Id => (x === s ? autre.id : x);
    for (const a of [...c.aretes.values()]) if (a.a === s || a.b === s) c.aretes.set(a.id, { ...a, a: r(a.a), b: r(a.b) });
    for (const f of [...c.faces.values()]) {
      c.faces.set(f.id, { ...f, exterieur: f.exterieur.map(r), trous: f.trous.map((b) => b.map(r)) });
    }
    c.sommets.delete(s);
  }
  const vues = new Map<string, Id>();
  for (const a of [...c.aretes.values()].sort((x, y) => numId(x.id) - numId(y.id))) {
    if (a.a === a.b) {
      c.aretes.delete(a.id);
      continue;
    }
    const k = cle(a.a, a.b);
    if (vues.has(k)) c.aretes.delete(a.id);
    else vues.set(k, a.id);
  }
  const nettoyer = (b: readonly Id[]): Id[] => b.filter((x, i) => x !== b[(i + 1) % b.length]);
  const signatures = new Set<string>();
  for (const f of [...c.faces.values()].sort((x, y) => numId(x.id) - numId(y.id))) {
    const ext = nettoyer(f.exterieur);
    if (ext.length < 3) {
      c.faces.delete(f.id);
      continue;
    }
    const sig = [...ext].sort().join();
    if (signatures.has(sig)) {
      c.faces.delete(f.id);
      continue;
    }
    signatures.add(sig);
    if (ext.length !== f.exterieur.length) c.faces.set(f.id, { ...f, exterieur: ext, trous: f.trous.map(nettoyer) });
  }
  for (const k of [...c.courbes.values()]) {
    const reste = k.aretes.filter((x) => c.aretes.has(x));
    if (reste.length === 0) c.courbes.delete(k.id);
    else if (reste.length !== k.aretes.length) c.courbes.set(k.id, { ...k, aretes: reste });
  }
}

function transformerSurPlace(t: Travail, c: Ctx, entites: readonly Id[], M: Matrice4): void {
  const S = sommetsDe(c, entites);
  for (const s of S) c.sommets.set(s, { id: s, position: appliquer(M, pos(c, s)) });
  const det = determinant3(M);
  for (const f of [...c.faces.values()]) {
    const vs = [f.exterieur, ...f.trous].flat();
    const touches = vs.filter((s) => S.has(s)).length;
    if (touches === 0) continue;
    if (touches === vs.length) {
      const n = transformerNormale(M, f.normale);
      c.faces.set(
        f.id,
        det < 0
          ? { ...f, exterieur: [...f.exterieur].reverse(), trous: f.trous.map((b) => [...b].reverse()), normale: n }
          : { ...f, normale: n },
      );
    } else replanifier(t, c, f);
  }
  for (const id of entites) {
    const occ = c.occurrences.get(id);
    if (occ) c.occurrences.set(id, { ...occ, transformation: composer(M, occ.transformation) });
  }
  for (const k of [...c.courbes.values()]) {
    if (!k.aretes.every((e) => {
      const a = c.aretes.get(e);
      return a !== undefined && S.has(a.a) && S.has(a.b);
    })) continue;
    c.courbes.set(k.id, { ...k, centre: appliquer(M, k.centre), normale: transformerNormale(M, k.normale) });
  }
  fusionnerSommets(c, S);
}

function copierTransforme(t: Travail, c: Ctx, entites: readonly Id[], matrices: readonly Matrice4[]): void {
  const faces = entites.map((id) => c.faces.get(id)).filter((f): f is Face => f !== undefined);
  const aretes = new Map<Id, Arete>();
  for (const id of entites) {
    const a = c.aretes.get(id);
    if (a) aretes.set(a.id, a);
    const k = c.courbes.get(id);
    if (k) for (const e of k.aretes) {
      const ar = c.aretes.get(e);
      if (ar) aretes.set(ar.id, ar);
    }
  }
  for (const f of faces) {
    for (const b of [f.exterieur, ...f.trous]) {
      for (let i = 0; i < b.length; i++) {
        const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
        if (a) aretes.set(a.id, a);
      }
    }
  }
  const occs = entites.map((id) => c.occurrences.get(id)).filter((x): x is Occurrence => x !== undefined);
  const lesAretes = [...aretes.values()];
  const lesFaces = faces.map((f) => ({ f, ...positionsFaceCtx(c, f) }));
  matrices.forEach((M, k) => {
    const echelleL = Math.cbrt(Math.abs(determinant3(M)));
    const segments: SegmentSource[] = lesAretes.map((a) => {
      const kc = a.courbe ? c.courbes.get(a.courbe) : undefined;
      return {
        a: appliquer(M, pos(c, a.a)),
        b: appliquer(M, pos(c, a.b)),
        adoucie: a.adoucie,
        masquee: a.masquee,
        ...(kc
          ? {
              courbe: {
                cle: `${kc.id}#${k}`,
                genre: kc.genre,
                centre: appliquer(M, kc.centre),
                rayon: kc.rayon * echelleL,
                normale: transformerNormale(M, kc.normale),
              },
            }
          : {}),
      };
    });
    const sources: Source[] = lesFaces.map(({ f, exterieur, trous }) => ({
      exterieur: exterieur.map((p) => appliquer(M, p)),
      trous: trous.map((b) => b.map((p) => appliquer(M, p))),
      normale: transformerNormale(M, f.normale),
      materiauRecto: f.materiauRecto,
      materiauVerso: f.materiauVerso,
      role: "face",
    }));
    insererGeometrie(t, c, segments, sources, false);
    for (const occ of occs) {
      const id = t.id("o");
      c.occurrences.set(id, { id, definition: occ.definition, transformation: composer(M, occ.transformation) });
    }
  });
}

function positionsFaceCtx(c: Ctx, f: Face): { exterieur: Vec3[]; trous: Vec3[][] } {
  return { exterieur: f.exterieur.map((s) => pos(c, s)), trous: f.trous.map((b) => b.map((s) => pos(c, s))) };
}

/** Déplacer : la géométrie connectée non sélectionnée est étirée (faces replanifiées ou pliées). */
export function deplacer(m: Modele, entites: readonly Id[], vecteur: Vec3, o: OptionsContexte = {}): Resultat {
  return operer(m, o.dans, (t, c) => transformerSurPlace(t, c, entites, translation(vecteur)));
}

/** Réseau : `copies` n = n copies au pas du vecteur (« x3 ») ; `divisions` n = n intervalles (« /3 »). */
export type Reseau = { readonly copies: number } | { readonly divisions: number };

/** Copier (Move + Ctrl) : copies collantes, réseau linéaire éventuel. */
export function copier(
  m: Modele,
  entites: readonly Id[],
  vecteur: Vec3,
  reseau: Reseau = { copies: 1 },
  o: OptionsContexte = {},
): Resultat {
  const ms: Matrice4[] = [];
  if ("copies" in reseau) for (let k = 1; k <= reseau.copies; k++) ms.push(translation(scale(vecteur, k)));
  else for (let k = 1; k <= reseau.divisions; k++) ms.push(translation(scale(vecteur, k / reseau.divisions)));
  return operer(m, o.dans, (t, c) => copierTransforme(t, c, entites, ms));
}

export interface OptionsRotation extends OptionsContexte {
  readonly copie?: boolean;
  /** Réseau polaire : nombre de copies supplémentaires (« x5 »), implique `copie`. */
  readonly copies?: number;
}

/** Faire pivoter (angle en radians, autour de l'axe passant par `centre`). */
export function tourner(
  m: Modele,
  entites: readonly Id[],
  centre: Vec3,
  axe: Vec3,
  angle: number,
  o: OptionsRotation = {},
): Resultat {
  return operer(m, o.dans, (t, c) => {
    if (o.copie || o.copies) {
      const n = o.copies ?? 1;
      const ms: Matrice4[] = [];
      for (let k = 1; k <= n; k++) ms.push(rotation(centre, axe, angle * k));
      copierTransforme(t, c, entites, ms);
    } else transformerSurPlace(t, c, entites, rotation(centre, axe, angle));
  });
}

/** Échelle autour d'une origine ; facteur négatif = miroir. */
export function mettreAEchelle(
  m: Modele,
  entites: readonly Id[],
  origine: Vec3,
  facteurs: Vec3 | number,
  o: OptionsContexte = {},
): Resultat {
  const f = typeof facteurs === "number" ? v3(facteurs, facteurs, facteurs) : facteurs;
  if (Math.abs(f.x * f.y * f.z) < EPS) throw new RangeError("Facteur d'échelle nul");
  return operer(m, o.dans, (t, c) => transformerSurPlace(t, c, entites, echelle(origine, f)));
}

/** Retourner (Flip) par rapport au plan (origine, normale) ; `copie` = Ctrl. */
export function retourner(
  m: Modele,
  entites: readonly Id[],
  plan: { readonly origine: Vec3; readonly normale: Vec3 },
  o: OptionsContexte & { readonly copie?: boolean } = {},
): Resultat {
  const M = miroir(plan.origine, plan.normale);
  return operer(m, o.dans, (t, c) => {
    if (o.copie) copierTransforme(t, c, entites, [M]);
    else transformerSurPlace(t, c, entites, M);
  });
}

// ————————————————————————————————————————————————————————————— Groupes et composants

export interface ResultatGroupe extends Resultat {
  readonly occurrence: Id;
  readonly definition: Id;
}

/**
 * Grouper (Make Group / Make Component) : faces (avec leurs arêtes), arêtes, courbes et occurrences
 * passent dans une nouvelle définition. Une arête ou un sommet encore utilisé dehors est dupliqué.
 */
export function grouper(
  m: Modele,
  entites: readonly Id[],
  o: OptionsContexte & { readonly genre?: GenreDefinition; readonly nom?: string } = {},
): ResultatGroupe {
  const r = operer(m, o.dans, (t, c) => {
    const faces = new Set(entites.filter((id) => c.faces.has(id)));
    const aretes = new Set<Id>();
    for (const id of entites) {
      if (c.aretes.has(id)) aretes.add(id);
      const k = c.courbes.get(id);
      if (k) for (const e of k.aretes) aretes.add(e);
    }
    for (const id of faces) {
      const f = c.faces.get(id) as Face;
      for (const b of [f.exterieur, ...f.trous]) {
        for (let i = 0; i < b.length; i++) {
          const a = areteEntre(c, b[i] as Id, b[(i + 1) % b.length] as Id);
          if (a) aretes.add(a.id);
        }
      }
    }
    const occs = entites.filter((id) => c.occurrences.has(id));
    const g: Ctx = { sommets: new Map(), aretes: new Map(), faces: new Map(), courbes: new Map(), occurrences: new Map() };
    // Arêtes encore utilisées par une face restée dehors → dupliquées.
    const resteUtilisee = (a: Arete): boolean => facesDeArete(c, a).some((f) => !faces.has(f.id));
    const sommetsG = new Map<Id, Id>();
    const aretesRestantes = [...c.aretes.values()].filter((a) => !aretes.has(a.id) || resteUtilisee(a));
    const sommetsDehors = new Set(aretesRestantes.flatMap((a) => [a.a, a.b]));
    const sg = (s: Id): Id => {
      let n = sommetsG.get(s);
      if (!n) {
        n = sommetsDehors.has(s) ? t.id("s") : s;
        sommetsG.set(s, n);
        g.sommets.set(n, { id: n, position: pos(c, s) });
      }
      return n;
    };
    const areteG = new Map<Id, Id>();
    for (const id of aretes) {
      const a = c.aretes.get(id) as Arete;
      const garde = resteUtilisee(a);
      const nid = garde ? t.id("a") : id;
      areteG.set(id, nid);
      const { courbe: _courbe, ...reste } = a;
      g.aretes.set(nid, { ...reste, id: nid, a: sg(a.a), b: sg(a.b) });
      if (!garde) c.aretes.delete(id);
    }
    for (const k of [...c.courbes.values()]) {
      const dedans = k.aretes.filter((e) => areteG.has(e));
      if (dedans.length === 0) continue;
      const tout = dedans.length === k.aretes.length && dedans.every((e) => areteG.get(e) === e);
      const nid = tout ? k.id : t.id("c");
      g.courbes.set(nid, { ...k, id: nid, aretes: dedans.map((e) => areteG.get(e) as Id) });
      for (const e of dedans) {
        const ga = g.aretes.get(areteG.get(e) as Id) as Arete;
        g.aretes.set(ga.id, { ...ga, courbe: nid });
      }
      if (tout) c.courbes.delete(k.id);
    }
    for (const id of faces) {
      const f = c.faces.get(id) as Face;
      g.faces.set(id, { ...f, exterieur: f.exterieur.map(sg), trous: f.trous.map((b) => b.map(sg)) });
      c.faces.delete(id);
    }
    for (const id of occs) {
      g.occurrences.set(id, c.occurrences.get(id) as Occurrence);
      c.occurrences.delete(id);
    }
    for (const s of [...c.sommets.keys()]) if (!sommetsDehors.has(s)) c.sommets.delete(s);
    const genre = o.genre ?? "groupe";
    const def = t.id("d");
    t.definitions.set(def, { id: def, nom: o.nom ?? (genre === "groupe" ? "Groupe" : "Composant"), genre, contenu: g });
    const occ = t.id("o");
    c.occurrences.set(occ, { id: occ, definition: def, transformation: IDENTITE });
    return { occ, def };
  });
  return { modele: r.modele, rapport: r.rapport, occurrence: r.extra.occ, definition: r.extra.def };
}

/** Éclater (Explode) : la géométrie de l'occurrence revient, transformée et collante, dans le contexte. */
export function eclater(m: Modele, occurrence: Id): Resultat {
  const t0 = new Travail(m);
  const { ctx } = t0.occurrence(occurrence);
  const dans = ctx === t0.racine ? undefined : trouverOccurrenceDeDefinition(m, ctx, t0);
  return operer(m, dans, (t, c) => {
    const occ = c.occurrences.get(occurrence);
    if (!occ) throw new Error(`Occurrence inconnue : ${occurrence}`);
    const def = t.definitions.get(occ.definition);
    if (!def) throw new Error(`Définition inconnue : ${occ.definition}`);
    c.occurrences.delete(occurrence);
    const g = def.contenu;
    const M = occ.transformation;
    const segments: SegmentSource[] = [...g.aretes.values()].map((a) => {
      const k = a.courbe ? g.courbes.get(a.courbe) : undefined;
      return {
        a: appliquer(M, pos(g, a.a)),
        b: appliquer(M, pos(g, a.b)),
        adoucie: a.adoucie,
        masquee: a.masquee,
        ...(k
          ? {
              courbe: {
                cle: k.id,
                genre: k.genre,
                centre: appliquer(M, k.centre),
                rayon: k.rayon * Math.cbrt(Math.abs(determinant3(M))),
                normale: transformerNormale(M, k.normale),
              },
            }
          : {}),
      };
    });
    const sources: Source[] = [...g.faces.values()].map((f) => {
      const p = positionsFaceCtx(g, f);
      return {
        exterieur: p.exterieur.map((x) => appliquer(M, x)),
        trous: p.trous.map((b) => b.map((x) => appliquer(M, x))),
        normale: transformerNormale(M, f.normale),
        materiauRecto: f.materiauRecto,
        materiauVerso: f.materiauVerso,
        role: "face",
      };
    });
    insererGeometrie(t, c, segments, sources, false);
    for (const io of g.occurrences.values()) {
      const id = t.id("o");
      c.occurrences.set(id, { id, definition: io.definition, transformation: composer(M, io.transformation) });
    }
  });
}

function trouverOccurrenceDeDefinition(m: Modele, ctx: Ctx, t: Travail): Id | undefined {
  for (const d of t.definitions.values()) {
    if (d.contenu !== ctx) continue;
    for (const c of [m.racine, ...Object.values(m.definitions).map((x) => x.contenu)]) {
      for (const o of Object.values(c.occurrences)) if (o.definition === d.id) return o.id;
    }
  }
  return undefined;
}

/** Rendre unique (Make Unique) : l'occurrence reçoit une copie privée de sa définition. */
export function rendreUnique(m: Modele, occurrence: Id): Resultat {
  const t = new Travail(m);
  t.rendreUnique(occurrence);
  const modele = t.fermer();
  return { modele, rapport: differences(m, modele) };
}
